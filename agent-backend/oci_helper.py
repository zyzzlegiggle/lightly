import os
import uuid
import base64
import tempfile
import atexit
import oci
from dotenv import load_dotenv

# Load env variables from agent-backend/.env and root .env
load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), ".env")))
load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env")))

_temp_key_file = None

def cleanup_temp_key():
    global _temp_key_file
    if _temp_key_file and os.path.exists(_temp_key_file):
        try:
            os.remove(_temp_key_file)
        except Exception:
            pass
        _temp_key_file = None

def get_config():
    global _temp_key_file
    
    # 1. Check if we should use Instance Principals
    if os.getenv("OCI_USE_INSTANCE_PRINCIPAL", "").lower() == "true":
        signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
        return {}, signer
        
    # 2. Check if we have env vars for direct config
    user = os.getenv("OCI_USER")
    fingerprint = os.getenv("OCI_FINGERPRINT")
    tenancy = os.getenv("OCI_TENANCY")
    region = os.getenv("OCI_REGION")
    key_content = os.getenv("OCI_KEY_CONTENT")
    key_file = os.getenv("OCI_KEY_FILE")
    
    if user and fingerprint and tenancy and region:
        config = {
            "user": user,
            "fingerprint": fingerprint,
            "tenancy": tenancy,
            "region": region
        }
        
        if key_content:
            # Write key content to a temporary file since SDK validates key_file path
            if not _temp_key_file:
                fd, path = tempfile.mkstemp(prefix="oci_key_", suffix=".pem")
                os.write(fd, key_content.strip().encode("utf-8"))
                os.close(fd)
                _temp_key_file = path
                atexit.register(cleanup_temp_key)
            config["key_file"] = _temp_key_file
        elif key_file:
            config["key_file"] = key_file
        else:
            raise ValueError("Either OCI_KEY_CONTENT or OCI_KEY_FILE must be provided.")
            
        return config, None
        
    # 3. Fallback to default config file (~/.oci/config)
    config_file = os.getenv("OCI_CONFIG_FILE", oci.config.DEFAULT_LOCATION)
    profile = os.getenv("OCI_PROFILE", oci.config.DEFAULT_PROFILE)
    try:
        config = oci.config.from_file(config_file, profile)
        return config, None
    except Exception as e:
        print(f"Warning: Failed to load OCI config from default location/file: {e}")
        raise e

def get_compute_client():
    config, signer = get_config()
    if signer:
        return oci.core.ComputeClient({}, signer=signer)
    return oci.core.ComputeClient(config)

def get_vcn_client():
    config, signer = get_config()
    if signer:
        return oci.core.VirtualNetworkClient({}, signer=signer)
    return oci.core.VirtualNetworkClient(config)

def get_identity_client():
    config, signer = get_config()
    if signer:
        return oci.identity.IdentityClient({}, signer=signer)
    return oci.identity.IdentityClient(config)

def get_availability_domain(compartment_id: str) -> str:
    client = get_identity_client()
    ads = client.list_availability_domains(compartment_id).data
    if ads:
        # Return first AD by default
        return ads[0].name
    raise ValueError("No availability domains found in this compartment/region.")

def create_oci_instance(name: str, user_data: str) -> dict:
    compartment_id = os.getenv("OCI_COMPARTMENT_ID")
    subnet_id = os.getenv("OCI_SUBNET_ID")
    image_id = os.getenv("OCI_IMAGE_ID") or os.getenv("DROPLET_SNAPSHOT_ID")
    shape = os.getenv("OCI_SHAPE", "VM.Standard.E4.Flex")
    
    if not compartment_id or not subnet_id or not image_id:
        raise ValueError("Missing required OCI environment variables: OCI_COMPARTMENT_ID, OCI_SUBNET_ID, and OCI_IMAGE_ID/DROPLET_SNAPSHOT_ID must be set.")
        
    compute_client = get_compute_client()
    ad = get_availability_domain(compartment_id)
    
    # Generate unique slug for display_name and DNS resolution (e.g. lightly-a1b2c3d4)
    slug = f"lightly-{uuid.uuid4().hex[:8]}"
    
    # Base64 encode user data as required by OCI API
    encoded_user_data = base64.b64encode(user_data.encode("utf-8")).decode("utf-8")
    
    # Build launch details
    launch_details = oci.core.models.LaunchInstanceDetails(
        compartment_id=compartment_id,
        availability_domain=ad,
        display_name=slug,
        shape=shape,
        source_details=oci.core.models.InstanceSourceViaImageDetails(
            source_type="image",
            image_id=image_id
        ),
        create_vnic_details=oci.core.models.CreateVnicDetails(
            subnet_id=subnet_id,
            assign_public_ip=True
        ),
        metadata={
            "user_data": encoded_user_data
        }
    )
    
    # If using flex shape, configure OCPU/Memory
    if "Flex" in shape:
        ocpus = float(os.getenv("OCI_OCPUS", "1"))
        memory_in_gbs = float(os.getenv("OCI_MEMORY_GB", "6"))
        launch_details.shape_config = oci.core.models.LaunchInstanceShapeConfigDetails(
            ocpus=ocpus,
            memory_in_gbs=memory_in_gbs
        )
        
    print(f"[OCI] Launching instance {slug} with shape {shape}...")
    resp = compute_client.launch_instance(launch_details)
    instance = resp.data
    
    return {
        "id": instance.id,
        "name": instance.display_name, # this is the slug
        "lifecycle_state": instance.lifecycle_state
    }

def get_oci_instance_status_and_ip(instance_slug_or_ocid: str) -> dict:
    compartment_id = os.getenv("OCI_COMPARTMENT_ID")
    if not compartment_id:
        return {"phase": "ERROR", "logs": "OCI_COMPARTMENT_ID not set"}
        
    compute_client = get_compute_client()
    vcn_client = get_vcn_client()
    
    instance = None
    if instance_slug_or_ocid.startswith("ocid1.instance."):
        try:
            instance = compute_client.get_instance(instance_slug_or_ocid).data
        except Exception as e:
            return {"phase": "ERROR", "logs": f"Error fetching instance: {str(e)}"}
    else:
        # Search by display_name
        try:
            instances = compute_client.list_instances(
                compartment_id=compartment_id,
                display_name=instance_slug_or_ocid
            ).data
            active_instances = [
                inst for inst in instances
                if inst.lifecycle_state not in ("TERMINATED", "TERMINATING")
            ]
            if active_instances:
                instance = active_instances[0]
        except Exception as e:
            return {"phase": "ERROR", "logs": f"Error searching instances: {str(e)}"}
            
    if not instance:
        return {"phase": "ERROR", "logs": "Instance not found"}
        
    state = instance.lifecycle_state
    if state in ("TERMINATED", "TERMINATING"):
        return {"phase": "ERROR", "logs": "Instance has been terminated"}
        
    if state != "RUNNING":
        return {"phase": "BUILDING", "logs": f"Provisioning (OCI state: {state})..."}
        
    # Get IP address
    ip = None
    try:
        attachments = compute_client.list_vnic_attachments(
            compartment_id=compartment_id,
            instance_id=instance.id
        ).data
        if attachments:
            vnic_id = attachments[0].vnic_id
            vnic = vcn_client.get_vnic(vnic_id).data
            ip = vnic.public_ip
    except Exception as e:
        print(f"[OCI] Error getting VNIC/IP: {e}")
        
    if not ip:
        return {"phase": "BUILDING", "logs": "Waiting for public IP assignment..."}
        
    return {
        "phase": "ACTIVE",
        "dropletIp": ip, # Keep field name for compatibility with existing Next.js proxy
        "id": instance.id,
        "name": instance.display_name
    }

def terminate_oci_instance(instance_slug_or_ocid: str) -> bool:
    compartment_id = os.getenv("OCI_COMPARTMENT_ID")
    if not compartment_id:
        return False
        
    compute_client = get_compute_client()
    
    instance_id = None
    if instance_slug_or_ocid.startswith("ocid1.instance."):
        instance_id = instance_slug_or_ocid
    else:
        # Search by display_name
        try:
            instances = compute_client.list_instances(
                compartment_id=compartment_id,
                display_name=instance_slug_or_ocid
            ).data
            active_instances = [
                inst for inst in instances
                if inst.lifecycle_state not in ("TERMINATED", "TERMINATING")
            ]
            if active_instances:
                instance_id = active_instances[0].id
        except Exception:
            pass
            
    if not instance_id:
        print(f"[OCI] Instance {instance_slug_or_ocid} not found, cannot terminate.")
        return False
        
    try:
        print(f"[OCI] Terminating instance {instance_id}...")
        compute_client.terminate_instance(instance_id, preserve_boot_volume=False)
        return True
    except Exception as e:
        print(f"[OCI] Error terminating instance: {e}")
        return False
