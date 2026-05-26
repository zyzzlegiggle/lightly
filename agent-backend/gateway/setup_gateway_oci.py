import os
import sys
import time
import base64

# Add parent directory to path so we can import oci_helper
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
try:
    from oci_helper import get_compute_client, get_vcn_client, get_availability_domain
except ImportError:
    print("Error: Could not import oci_helper. Make sure oci_helper.py exists in the parent directory.")
    sys.exit(1)

def main():
    print("=" * 60)
    print("  Lightly — Provisioning OCI Gateway Instance")
    print("=" * 60)
    
    # Read files
    gateway_dir = os.path.dirname(os.path.abspath(__file__))
    
    with open(os.path.join(gateway_dir, "sidecar.py"), "r", encoding="utf-8") as f:
        sidecar_code = f.read()
        
    with open(os.path.join(gateway_dir, "..", "oci_helper.py"), "r", encoding="utf-8") as f:
        oci_helper_code = f.read()
        
    with open(os.path.join(gateway_dir, "Caddyfile"), "r", encoding="utf-8") as f:
        caddyfile_code = f.read()
        
    # Build env file
    env_content = f"""PREVIEW_DOMAIN=preview.lightly.ink
SIDECAR_PORT=8080
OCI_COMPARTMENT_ID={os.getenv("OCI_COMPARTMENT_ID", "")}
OCI_SUBNET_ID={os.getenv("OCI_SUBNET_ID", "")}
OCI_SHAPE={os.getenv("OCI_SHAPE", "VM.Standard.E4.Flex")}
OCI_USE_INSTANCE_PRINCIPAL={os.getenv("OCI_USE_INSTANCE_PRINCIPAL", "false")}
OCI_USER={os.getenv("OCI_USER", "")}
OCI_TENANCY={os.getenv("OCI_TENANCY", "")}
OCI_REGION={os.getenv("OCI_REGION", "")}
OCI_FINGERPRINT={os.getenv("OCI_FINGERPRINT", "")}
"""
    if os.getenv("OCI_KEY_CONTENT"):
        env_content += f"OCI_KEY_CONTENT={os.getenv('OCI_KEY_CONTENT')}\n"
        
    # Build cloud-init bash script
    user_data_template = f"""#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "[Gateway] Starting setup..."

# ── Write sidecar.py ──
cat > /opt/sidecar.py << 'SIDECAR_EOF'
{sidecar_code}
SIDECAR_EOF

# ── Write oci_helper.py ──
cat > /opt/oci_helper.py << 'HELPER_EOF'
{oci_helper_code}
HELPER_EOF

# ── Write Caddyfile ──
mkdir -p /etc/caddy
cat > /etc/caddy/Caddyfile << 'CADDY_EOF'
{caddyfile_code}
CADDY_EOF

# ── Write environment ──
cat > /opt/sidecar.env << 'ENV_EOF'
{env_content}
ENV_EOF

# ── Create systemd service for sidecar ──
cat > /etc/systemd/system/lightly-sidecar.service << 'SVC_EOF'
[Unit]
Description=Lightly Gateway Sidecar
After=network.target

[Service]
Type=simple
EnvironmentFile=/opt/sidecar.env
ExecStart=/usr/bin/python3 /opt/sidecar.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
SVC_EOF

# ── Configure Firewall (OCI Ubuntu default blocks all ports except 22) ──
echo "[Gateway] Opening port 8080 in firewall..."
if command -v iptables &>/dev/null; then
  iptables -I INPUT 1 -m state --state NEW -p tcp --dport 8080 -j ACCEPT || true
  if command -v netfilter-persistent &>/dev/null; then
    netfilter-persistent save || true
  fi
fi
if command -v ufw &>/dev/null; then
  ufw allow 8080/tcp || true
fi

# ── Install Caddy and OCI Python SDK ──
apt-get update -qq
apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl python3 python3-pip python3-venv
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update -qq
apt-get install -y -qq caddy

# Install OCI SDK for python3
pip3 install oci --break-system-packages || pip3 install oci || true

# ── Start services ──
systemctl daemon-reload
systemctl enable --now lightly-sidecar
systemctl restart caddy

echo "[Gateway] Setup complete!"
"""
    
    # Launch Instance in OCI
    import oci
    compute_client = get_compute_client()
    vcn_client = get_vcn_client()
    
    compartment_id = os.getenv("OCI_COMPARTMENT_ID")
    subnet_id = os.getenv("OCI_SUBNET_ID")
    image_id = os.getenv("OCI_IMAGE_ID") or os.getenv("DROPLET_SNAPSHOT_ID")
    shape = os.getenv("OCI_SHAPE", "VM.Standard.E4.Flex")
    
    if not compartment_id or not subnet_id or not image_id:
        print("ERROR: OCI_COMPARTMENT_ID, OCI_SUBNET_ID, and OCI_IMAGE_ID must be set in your environment.")
        sys.exit(1)
        
    ad = get_availability_domain(compartment_id)
    encoded_user_data = base64.b64encode(user_data_template.encode("utf-8")).decode("utf-8")
    
    launch_details = oci.core.models.LaunchInstanceDetails(
        compartment_id=compartment_id,
        availability_domain=ad,
        display_name="lightly-gateway",
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
    
    if "Flex" in shape:
        launch_details.shape_config = oci.core.models.LaunchInstanceShapeConfigDetails(
            ocpus=1.0,
            memory_in_gbs=4.0
        )
        
    print("[1/3] Launching gateway instance in OCI...")
    try:
        resp = compute_client.launch_instance(launch_details)
        instance = resp.data
        instance_id = instance.id
        print(f"  Created instance ID: {instance_id}")
    except Exception as e:
        print(f"ERROR launching instance: {e}")
        sys.exit(1)
        
    # Poll for status and public IP
    print("\n[2/3] Waiting for instance to provision...")
    ip = None
    start = time.time()
    while time.time() - start < 300:
        inst = compute_client.get_instance(instance_id).data
        status = inst.lifecycle_state
        if status in ("TERMINATED", "TERMINATING"):
            print("\nInstance provisioning failed (terminated).")
            sys.exit(1)
            
        if status == "RUNNING":
            print(f" ✓ Running ({int(time.time() - start)}s)")
            
            # Fetch VNIC public IP
            print("  Fetching public IP...")
            try:
                attachments = compute_client.list_vnic_attachments(
                    compartment_id=compartment_id,
                    instance_id=instance_id
                ).data
                if attachments:
                    vnic_id = attachments[0].vnic_id
                    vnic = vcn_client.get_vnic(vnic_id).data
                    ip = vnic.public_ip
                    if ip:
                        break
            except Exception as e:
                print(f"Error fetching IP: {e}")
                
        print(".", end="", flush=True)
        time.sleep(5)
        
    if not ip:
        print("\nTIMEOUT: Could not get public IP address after 5 minutes.")
        sys.exit(1)
        
    print(f"\n[3/3] Gateway instance is live!")
    print("=" * 60)
    print(f"  Gateway IP:   {ip}")
    print(f"  Instance ID:  {instance_id}")
    print("" )
    print("  NEXT STEPS:")
    print("  1. Add this DNS record at your domain provider:")
    print("     Type:  A Record")
    print("     Host:  *.preview")
    print(f"     Value: {ip}")
    print("     TTL:   Automatic")
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
