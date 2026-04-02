import requests
import base64
from typing import List, Dict, Optional

class GmailService:
    def __init__(self, access_token: str):
        self.access_token = access_token
        self.base_url = "https://gmail.googleapis.com/gmail/v1/users/me"
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }

    def list_messages(self, max_results: int = 10, q: str = "") -> List[Dict]:
        """List messages in the user's inbox."""
        params = {"maxResults": max_results, "q": q}
        resp = requests.get(f"{self.base_url}/messages", headers=self.headers, params=params)
        resp.raise_for_status()
        return resp.json().get("messages", [])

    def get_message(self, message_id: str) -> Dict:
        """Get the full content of a specific message."""
        resp = requests.get(f"{self.base_url}/messages/{message_id}", headers=self.headers)
        resp.raise_for_status()
        data = resp.json()
        
        headers = data.get("payload", {}).get("headers", [])
        subject = next((h["value"] for h in headers if h["name"] == "Subject"), "No Subject")
        from_email = next((h["value"] for h in headers if h["name"] == "From"), "Unknown")
        to_email = next((h["value"] for h in headers if h["name"] == "To"), "")
        snippet = data.get("snippet", "")
        thread_id = data.get("threadId", "")
        
        return {
            "id": message_id,
            "threadId": thread_id,
            "subject": subject,
            "from": from_email,
            "to": to_email,
            "snippet": snippet,
            "date": next((h["value"] for h in headers if h["name"] == "Date"), ""),
        }

    def search_threads(self, query: str, max_results: int = 5) -> List[Dict]:
        """Search for email threads matching a query."""
        params = {"maxResults": max_results, "q": query}
        resp = requests.get(f"{self.base_url}/threads", headers=self.headers, params=params)
        resp.raise_for_status()
        threads = resp.json().get("threads", [])
        
        result = []
        for t in threads:
            t_resp = requests.get(f"{self.base_url}/threads/{t['id']}", headers=self.headers)
            if t_resp.ok:
                t_data = t_resp.json()
                first_msg = t_data.get("messages", [{}])[0]
                headers = first_msg.get("payload", {}).get("headers", [])
                subject = next((h["value"] for h in headers if h["name"] == "Subject"), "No Subject")
                from_email = next((h["value"] for h in headers if h["name"] == "From"), "Unknown")
                result.append({
                    "id": t["id"],
                    "subject": subject,
                    "from": from_email,
                    "snippet": t_data.get("messages", [{}])[-1].get("snippet", ""),
                    "messageCount": len(t_data.get("messages", []))
                })
        return result

    def send_message(self, to: str, subject: str, body: str, thread_id: Optional[str] = None) -> Dict:
        """Send an email or reply to a thread."""
        # Build RFC 2822 raw email
        raw_lines = [
            f"To: {to}",
            f"Subject: {subject}",
            "Content-Type: text/plain; charset=utf-8",
            "MIME-Version: 1.0",
            "",
            body,
        ]
        raw = "\r\n".join(raw_lines)
        encoded = base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")

        payload: Dict = {"raw": encoded}
        if thread_id:
            payload["threadId"] = thread_id

        resp = requests.post(
            f"{self.base_url}/messages/send",
            headers=self.headers,
            json=payload,
        )
        resp.raise_for_status()
        return resp.json()
