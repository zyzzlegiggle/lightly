import requests
from typing import List, Dict, Optional

class NotionService:
    def __init__(self, access_token: str):
        self.access_token = access_token
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28"
        }

    def search(self, query: str) -> List[Dict]:
        """Search for pages in Notion."""
        resp = requests.post(
            "https://api.notion.com/v1/search",
            headers=self.headers,
            json={"query": query, "page_size": 5}
        )
        if not resp.ok:
            return []
        results = resp.json().get("results", [])
        return [
            {
                "id": r["id"],
                "type": r["object"],
                "title": r.get("properties", {}).get("title", {}).get("title", [{}])[0].get("plain_text", "Untitled") 
                         if r["object"] == "page" else r.get("title", [{}])[0].get("plain_text", "Untitled"),
                "url": r["url"]
            }
            for r in results
        ]

    def create_page(self, parent_id: str, title: str, content: str = "") -> Dict:
        """Create a new page in Notion."""
        payload = {
            "parent": {"page_id": parent_id},
            "properties": {
                "title": [
                    {"text": {"content": title}}
                ]
            }
        }
        resp = requests.post(
            "https://api.notion.com/v1/pages",
            headers=self.headers,
            json=payload
        )
        resp.raise_for_status()
        return resp.json()
