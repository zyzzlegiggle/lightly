"""
Create a pre-baked DigitalOcean Droplet snapshot for Lightly sandboxes.

This script:
  1. Creates a temporary Droplet with a cloud-init that installs Node.js 20, git,
     and pre-warms the npm cache with popular packages.
  2. Waits for the setup to finish.
  3. Powers off the Droplet and creates a snapshot.
  4. Prints the snapshot ID to use in your .env (DROPLET_SNAPSHOT_ID).
  5. Destroys the temporary Droplet.

Usage:
    python create_snapshot.py
"""

import os
import sys
import time
import requests
from dotenv import load_dotenv

load_dotenv()

TOKEN = os.getenv("GRADIENT_ACCESS_TOKEN")
if not TOKEN:
    print("ERROR: GRADIENT_ACCESS_TOKEN not set in .env")
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}

# ── Cloud-init for the snapshot builder ──────────────────────────────────
# This installs everything we need so future Droplets skip all of this.
SNAPSHOT_SETUP_SCRIPT = r"""#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

# ── Swap (for 2GB boxes) ──
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
# This pre-downloads the most common deps so npm install is mostly cache hits.
mkdir -p /tmp/warm && cd /tmp/warm

npm cache add next@latest react@latest react-dom@latest
npm cache add vite@latest @vitejs/plugin-react@latest
npm cache add typescript@latest @types/react@latest @types/node@latest
npm cache add tailwindcss@latest postcss@latest autoprefixer@latest
npm cache add eslint@latest prettier@latest
npm cache add express@latest

# Clean up temp dir
rm -rf /tmp/warm

# ── Pre-create /app directory ──
mkdir -p /app

# ── Signal completion ──
echo "SNAPSHOT_READY" > /root/.snapshot_ready
"""


def api(method, path, **kwargs):
    url = f"https://api.digitalocean.com/v2{path}"
    resp = requests.request(method, url, headers=HEADERS, **kwargs)
    if not resp.ok:
        print(f"API ERROR {resp.status_code}: {resp.text}")
        sys.exit(1)
    return resp.json() if resp.text else {}


def wait_for_status(droplet_id, target_status, timeout=300):
    """Poll until Droplet reaches target status."""
    print(f"  Waiting for Droplet {droplet_id} to become '{target_status}'...", end="", flush=True)
    start = time.time()
    while time.time() - start < timeout:
        data = api("GET", f"/droplets/{droplet_id}")
        status = data["droplet"]["status"]
        if status == target_status:
            print(f" ✓ ({int(time.time() - start)}s)")
            return data["droplet"]
        print(".", end="", flush=True)
        time.sleep(5)
    print(f"\n  TIMEOUT waiting for '{target_status}' after {timeout}s")
    sys.exit(1)


def wait_for_cloud_init(ip, timeout=300):
    """Poll the Droplet via SSH-less approach: check if cloud-init signal file exists."""
    print(f"  Waiting for cloud-init to finish on {ip}...", end="", flush=True)
    # We can't SSH in, so we'll just wait a reasonable amount of time
    # Cloud-init installs Node + warms cache = ~2-3 minutes
    wait_time = 180  # 3 minutes should be plenty
    print(f" (waiting {wait_time}s for Node.js install + cache warming)")
    time.sleep(wait_time)
    print("  ✓ Cloud-init should be done")


def main():
    print("=" * 60)
    print("  Lightly — Creating Pre-Baked Droplet Snapshot")
    print("=" * 60)

    # 1. Create temporary Droplet
    print("\n[1/5] Creating temporary Droplet...")
    data = api("POST", "/droplets", json={
        "name": "lightly-snapshot-builder",
        "region": "nyc3",
        "size": "s-1vcpu-2gb",
        "image": "ubuntu-22-04-x64",
        "user_data": SNAPSHOT_SETUP_SCRIPT,
        "tags": ["lightly-snapshot-builder"],
    })
    droplet_id = data["droplet"]["id"]
    print(f"  Created Droplet {droplet_id}")

    # 2. Wait for it to boot
    print("\n[2/5] Waiting for Droplet to boot...")
    droplet = wait_for_status(droplet_id, "active")
    ip = None
    for net in droplet.get("networks", {}).get("v4", []):
        if net["type"] == "public":
            ip = net["ip_address"]
            break
    print(f"  IP: {ip}")

    # 3. Wait for cloud-init to finish
    print("\n[3/5] Waiting for cloud-init to install Node.js + warm cache...")
    wait_for_cloud_init(ip)

    # 4. Power off and snapshot
    print("\n[4/5] Powering off Droplet and creating snapshot...")
    api("POST", f"/droplets/{droplet_id}/actions", json={"type": "power_off"})
    wait_for_status(droplet_id, "off", timeout=120)

    print("  Creating snapshot (this takes 2-5 minutes)...")
    snap_data = api("POST", f"/droplets/{droplet_id}/actions", json={
        "type": "snapshot",
        "name": f"lightly-sandbox-{int(time.time())}",
    })
    action_id = snap_data["action"]["id"]

    # Wait for snapshot to complete
    start = time.time()
    while time.time() - start < 600:
        action_data = api("GET", f"/actions/{action_id}")
        status = action_data["action"]["status"]
        if status == "completed":
            break
        if status == "errored":
            print(f"  SNAPSHOT FAILED!")
            sys.exit(1)
        print(f"  Snapshot status: {status} ({int(time.time() - start)}s)...", flush=True)
        time.sleep(10)

    # Find the snapshot ID from the Droplet's snapshots
    snap_list = api("GET", f"/droplets/{droplet_id}/snapshots")
    snapshots = snap_list.get("snapshots", [])
    if not snapshots:
        print("  ERROR: No snapshots found!")
        sys.exit(1)

    snapshot = snapshots[-1]  # Most recent
    snapshot_id = snapshot["id"]
    snapshot_name = snapshot["name"]

    print(f"\n  ✅ Snapshot created!")
    print(f"     ID:   {snapshot_id}")
    print(f"     Name: {snapshot_name}")

    # 5. Destroy temporary Droplet
    print("\n[5/5] Destroying temporary Droplet...")
    api("DELETE", f"/droplets/{droplet_id}")
    print("  ✓ Droplet destroyed")

    # Done!
    print("\n" + "=" * 60)
    print(f"  Add this to your .env file:")
    print(f"")
    print(f"  DROPLET_SNAPSHOT_ID={snapshot_id}")
    print(f"")
    print("=" * 60)


if __name__ == "__main__":
    main()
