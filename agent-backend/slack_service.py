import requests
import re
from typing import Optional


class SlackService:
    def __init__(self, access_token: str):
        self.access_token = access_token
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

    def post_message(self, channel: str, text: str) -> dict:
        """Post a message to a channel (ID or name)."""
        resp = requests.post(
            "https://slack.com/api/chat.postMessage",
            headers=self.headers,
            json={"channel": channel, "text": text},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            raise Exception(f"Slack chat.postMessage failed: {data.get('error')}")
        return data

    def list_channels(self, limit: int = 100) -> list[dict]:
        """List public and private channels the bot is a member of."""
        resp = requests.get(
            "https://slack.com/api/conversations.list",
            headers=self.headers,
            params={"types": "public_channel,private_channel", "limit": limit},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            raise Exception(f"Slack conversations.list failed: {data.get('error')}")
        return [
            {"id": c["id"], "name": c["name"], "is_private": c.get("is_private", False)}
            for c in data.get("channels", [])
        ]

    def get_channel_history(self, channel: str, limit: int = 10) -> list[dict]:
        """Fetch recent messages from a channel."""
        resp = requests.get(
            "https://slack.com/api/conversations.history",
            headers=self.headers,
            params={"channel": channel, "limit": limit},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            raise Exception(f"Slack conversations.history failed: {data.get('error')}")
        return [
            {"ts": m["ts"], "text": m.get("text", ""), "user": m.get("user", "")}
            for m in data.get("messages", [])
        ]

    def create_channel(self, name: str, is_private: bool = False) -> Optional[str]:
        """Create a channel. Returns the channel ID or None on failure."""
        safe_name = re.sub(r"[^a-z0-9\-_]", "-", name.lower())
        safe_name = re.sub(r"-+", "-", safe_name).strip("-")[:80]

        resp = requests.post(
            "https://slack.com/api/conversations.create",
            headers=self.headers,
            json={"name": safe_name, "is_private": is_private},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            if data.get("error") == "name_taken":
                return self._find_channel_id(safe_name)
            print(f"[Slack] create_channel failed: {data.get('error')}")
            return None
        return data["channel"]["id"]

    def _find_channel_id(self, name: str) -> Optional[str]:
        try:
            channels = self.list_channels(limit=200)
            match = next((c for c in channels if c["name"] == name), None)
            return match["id"] if match else None
        except Exception:
            return None
