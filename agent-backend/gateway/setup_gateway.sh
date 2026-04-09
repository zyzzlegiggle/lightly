#!/bin/bash
# ──────────────────────────────────────────────────────────────────────
# Gateway Droplet Setup Script
# 
# Creates and configures the Lightly Preview Gateway.
# Run this ONCE to set up the gateway droplet.
#
# Prerequisites:
#   - GRADIENT_ACCESS_TOKEN env var (DigitalOcean API token)
#   - The sidecar.py and Caddyfile should be in the same directory
#
# After running:
#   1. Note the gateway IP printed at the end
#   2. Go to Namecheap → Advanced DNS → Add record:
#      Type: A Record
#      Host: *.preview
#      Value: <gateway-ip>
#      TTL: Automatic
# ──────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config ──
DO_TOKEN="${GRADIENT_ACCESS_TOKEN:?Set GRADIENT_ACCESS_TOKEN first}"
REGION="sfo3"
SIZE="s-1vcpu-512mb-10gb"  # $4/mo — tiny is fine, it's just proxying
IMAGE="ubuntu-22-04-x64"
NAME="lightly-gateway"

# Read the sidecar script and Caddyfile from the same directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SIDECAR_PY=$(cat "$SCRIPT_DIR/sidecar.py")
CADDYFILE=$(cat "$SCRIPT_DIR/Caddyfile")

# ── Build cloud-init ──
USER_DATA=$(cat <<'CLOUDINIT_OUTER'
#!/bin/bash
set -o pipefail
export DEBIAN_FRONTEND=noninteractive

echo "[Gateway] Starting setup..."

# ── Install Caddy ──
apt-get update -qq
apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl python3
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update -qq
apt-get install -y -qq caddy

# ── Write sidecar.py ──
cat > /opt/sidecar.py << 'SIDECAR_EOF'
__SIDECAR_PY__
SIDECAR_EOF

# ── Write Caddyfile ──
cat > /etc/caddy/Caddyfile << 'CADDY_EOF'
__CADDYFILE__
CADDY_EOF

# ── Write environment ──
cat > /opt/sidecar.env << 'ENV_EOF'
GRADIENT_ACCESS_TOKEN=__DO_TOKEN__
PREVIEW_DOMAIN=preview.lightly.ink
SIDECAR_PORT=8080
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

# ── Start services ──
systemctl daemon-reload
systemctl enable --now lightly-sidecar
systemctl restart caddy

echo "[Gateway] Setup complete!"
CLOUDINIT_OUTER
)

# Inject actual content into the cloud-init template
USER_DATA="${USER_DATA//__SIDECAR_PY__/$SIDECAR_PY}"
USER_DATA="${USER_DATA//__CADDYFILE__/$CADDYFILE}"
USER_DATA="${USER_DATA//__DO_TOKEN__/$DO_TOKEN}"

echo "Creating gateway droplet..."
RESPONSE=$(curl -s -X POST "https://api.digitalocean.com/v2/droplets" \
  -H "Authorization: Bearer $DO_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "
import json, sys
print(json.dumps({
    'name': '$NAME',
    'region': '$REGION',
    'size': '$SIZE',
    'image': '$IMAGE',
    'user_data': '''$(echo "$USER_DATA")''',
    'tags': ['lightly', 'gateway']
}))
")")

DROPLET_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['droplet']['id'])" 2>/dev/null)

if [ -z "$DROPLET_ID" ]; then
  echo "ERROR: Failed to create droplet. Response:"
  echo "$RESPONSE"
  exit 1
fi

echo "Gateway droplet created! ID: $DROPLET_ID"
echo "Waiting for IP address..."

# Poll for the public IP
for i in $(seq 1 30); do
  sleep 5
  IP=$(curl -s "https://api.digitalocean.com/v2/droplets/$DROPLET_ID" \
    -H "Authorization: Bearer $DO_TOKEN" \
    | python3 -c "
import sys, json
d = json.load(sys.stdin)['droplet']
nets = d.get('networks', {}).get('v4', [])
for n in nets:
    if n['type'] == 'public':
        print(n['ip_address'])
        break
" 2>/dev/null)
  
  if [ -n "$IP" ]; then
    break
  fi
  echo "  Still waiting... ($i)"
done

if [ -z "$IP" ]; then
  echo "ERROR: Could not get IP after 150 seconds."
  exit 1
fi

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  Gateway Droplet Ready!"
echo "  IP:    $IP"
echo "  ID:    $DROPLET_ID"
echo ""
echo "  NEXT STEP: Add this DNS record at Namecheap:"
echo "    Type:  A Record"
echo "    Host:  *.preview"  
echo "    Value: $IP"
echo "    TTL:   Automatic"
echo "══════════════════════════════════════════════════════════"
echo ""
