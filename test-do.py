import os, requests
from dotenv import load_dotenv
load_dotenv()

token = os.getenv("GRADIENT_ACCESS_TOKEN")
url = "https://api.digitalocean.com/v2/apps"
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
spec = {
    "name": "test-app",
    "region": "nyc3",
    "services": [{
        "name": "test-app-web",
        "github": {"repo": "zyzzlegiggle/trackpad", "branch": "main"},
        "instance_size_slug": "basic-xxs",
        "instance_count": 1
    }]
}
try:
    resp = requests.post(url, json={"spec": spec}, headers=headers)
    print("Status:", resp.status_code)
    print("Body:", resp.text)
except Exception as e:
    print(e)
