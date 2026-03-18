import os, requests
from dotenv import load_dotenv
load_dotenv()

token = os.getenv("GRADIENT_ACCESS_TOKEN")
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

print("Fetching apps from DigitalOcean...")
apps_resp = requests.get("https://api.digitalocean.com/v2/apps", headers=headers)

if not apps_resp.ok:
    print("Failed to fetch apps. Status:", apps_resp.status_code)
    print(apps_resp.text)
    exit(1)

apps = apps_resp.json().get("apps", [])
if not apps:
    print("No apps found on this account.")
    exit(0)

# Use the most recently updated or created app
app = sorted(apps, key=lambda x: x.get('updated_at', x.get('created_at')), reverse=True)[0]
app_id = app['id']
app_name = app['spec']['name']
print(f"Found latest app: {app_name} ({app_id})")

dep_resp = requests.get(f"https://api.digitalocean.com/v2/apps/{app_id}/deployments", headers=headers)
if not dep_resp.ok:
    print("Failed to fetch deployments.")
    exit(1)

deployments = dep_resp.json().get("deployments", [])
if not deployments:
    print("No deployments found.")
    exit(0)

latest_dep = deployments[0]
dep_id = latest_dep['id']
phase = latest_dep['phase']
print(f"Latest deployment: {dep_id} (Phase: {phase})")

log_resp = requests.get(f"https://api.digitalocean.com/v2/apps/{app_id}/deployments/{dep_id}/logs?type=BUILD", headers=headers)

if log_resp.ok:
    data = log_resp.json()
    urls = data.get("historic_urls", [])
    if urls:
        print("\n--- Historic Build Logs ---")
        for url in urls:
            log_content = requests.get(url).text
            print(log_content[:2000] + "\n... (truncated if long)")
    else:
        live = data.get("live_url")
        print(f"\nLive URL: {live}")
        if live:
            print("Try connecting to the live stream or viewing in the DO Dashboard.")
            
else:
    print("Failed to get logs:", log_resp.text)
