import os
import sys
import time
import base64
import oci
from oci_helper import get_compute_client, get_vcn_client, get_availability_domain

SNAPSHOT_SETUP_SCRIPT = r"""#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

# ── Swap (for Flex boxes) ──
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# ── Install Node.js 20 + git ──
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y -qq nodejs git 2>&1 | tail -5

# Verify
node --version
npm --version

# ── Warm npm cache with popular packages ──
mkdir -p /tmp/warm && cd /tmp/warm
npm cache add next@latest react@latest react-dom@latest
npm cache add vite@latest @vitejs/plugin-react@latest
npm cache add typescript@latest @types/react@latest @types/node@latest
npm cache add tailwindcss@latest postcss@latest autoprefixer@latest
npm cache add eslint@latest prettier@latest
npm cache add express@latest
rm -rf /tmp/warm

mkdir -p /app
echo "SNAPSHOT_READY" > /root/.snapshot_ready
"""

def main():
    print("=" * 60)
    print("  Lightly — Creating OCI Custom Image Snapshot")
    print("=" * 60)
    
    # 1. Create temporary instance
    print("\n[1/5] Launching temporary builder instance in OCI...")
    compute_client = get_compute_client()
    
    compartment_id = os.getenv("OCI_COMPARTMENT_ID")
    subnet_id = os.getenv("OCI_SUBNET_ID")
    base_image_id = os.getenv("OCI_BASE_IMAGE_ID")
    
    if not compartment_id or not subnet_id or not base_image_id:
        print("ERROR: OCI_COMPARTMENT_ID, OCI_SUBNET_ID, and OCI_BASE_IMAGE_ID must be set in your .env.")
        print("OCI_BASE_IMAGE_ID should be a stock Ubuntu 22.04 image OCID in your OCI region.")
        sys.exit(1)
        
    shape = os.getenv("OCI_SHAPE", "VM.Standard.E4.Flex")
    ad = get_availability_domain(compartment_id)
    encoded_user_data = base64.b64encode(SNAPSHOT_SETUP_SCRIPT.encode("utf-8")).decode("utf-8")
    
    launch_details = oci.core.models.LaunchInstanceDetails(
        compartment_id=compartment_id,
        availability_domain=ad,
        display_name="lightly-snapshot-builder",
        shape=shape,
        source_details=oci.core.models.InstanceSourceViaImageDetails(
            source_type="image",
            image_id=base_image_id
        ),
        create_vnic_details=oci.core.models.CreateVnicDetails(
            subnet_id=subnet_id,
            assign_public_ip=True
        ),
        metadata={
            "user_data": encoded_user_data
        }
    )
    
    if "Flex" in shape:
        launch_details.shape_config = oci.core.models.LaunchInstanceShapeConfigDetails(
            ocpus=1.0,
            memory_in_gbs=4.0
        )
        
    try:
        resp = compute_client.launch_instance(launch_details)
        instance = resp.data
        instance_id = instance.id
        print(f"  Created temporary instance: {instance_id}")
    except Exception as e:
        print(f"ERROR: Failed to launch builder instance: {e}")
        sys.exit(1)
        
    # 2. Wait for RUNNING status
    print("\n[2/5] Waiting for instance to boot...")
    start = time.time()
    while True:
        inst = compute_client.get_instance(instance_id).data
        if inst.lifecycle_state == "RUNNING":
            print(f"  ✓ Running ({int(time.time() - start)}s)")
            break
        elif inst.lifecycle_state in ("TERMINATED", "TERMINATING"):
            print("  Instance died.")
            sys.exit(1)
        time.sleep(5)
        
    # 3. Wait for cloud-init
    print("\n[3/5] Waiting for cloud-init (Node.js install + cache warming)...")
    wait_time = 180
    print(f"  Waiting {wait_time}s for packages to download and cache...")
    time.sleep(wait_time)
    print("  ✓ Setup should be complete")
    
    # 4. Stop instance to make a clean custom image
    print("\n[4/5] Stopping instance for clean imaging...")
    try:
        compute_client.instance_action(instance_id, "STOP")
    except Exception as e:
        print(f"Warning: Failed to trigger stop action: {e}")
        
    # Poll until stopped
    start = time.time()
    while True:
        inst = compute_client.get_instance(instance_id).data
        if inst.lifecycle_state == "STOPPED":
            print(f"  ✓ Stopped ({int(time.time() - start)}s)")
            break
        time.sleep(5)
        
    # Create Image
    print("  Creating custom image (this may take 2-5 minutes)...")
    try:
        img_details = oci.core.models.CreateImageDetails(
            compartment_id=compartment_id,
            instance_id=instance_id,
            display_name=f"lightly-sandbox-{int(time.time())}"
        )
        img_resp = compute_client.create_image(img_details)
        image = img_resp.data
        image_id = image.id
    except Exception as e:
        print(f"ERROR: Failed to create custom image: {e}")
        compute_client.terminate_instance(instance_id, preserve_boot_volume=False)
        sys.exit(1)
        
    # Wait for image to become available
    start = time.time()
    while True:
        img = compute_client.get_image(image_id).data
        if img.lifecycle_state == "AVAILABLE":
            print(f"\n  ✓ Image available ({int(time.time() - start)}s)")
            break
        elif img.lifecycle_state in ("REJECTED", "TERMINATED"):
            print("\n  Image creation failed.")
            sys.exit(1)
        print(".", end="", flush=True)
        time.sleep(10)
        
    print(f"\n  ✅ Custom Image created!")
    print(f"     OCID: {image_id}")
    
    # 5. Terminate temporary builder
    print("\n[5/5] Destroying temporary builder instance...")
    try:
        compute_client.terminate_instance(instance_id, preserve_boot_volume=False)
        print("  ✓ Builder instance destroyed")
    except Exception as e:
        print(f"Warning: Failed to destroy builder instance: {e}")
        
    print("\n" + "=" * 60)
    print("  Add this to your agent-backend/.env file:")
    print("")
    print(f"  OCI_IMAGE_ID={image_id}")
    print("=" * 60)

if __name__ == "__main__":
    from dotenv import load_dotenv
    # Load from parent directory if needed
    parent_dotenv = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
    if os.path.exists(parent_dotenv):
        load_dotenv(parent_dotenv)
    else:
        load_dotenv()
    main()
