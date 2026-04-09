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
        # If it looks like a name (e.g. #general or general), try to find the ID
        target_channel = channel
        if not (channel.startswith("C") or channel.startswith("D") or channel.startswith("G")):
            clean_name = channel.lstrip("#")
            found_id = self._find_channel_id(clean_name)
            if found_id:
                target_channel = found_id

        resp = requests.post(
            "https://slack.com/api/chat.postMessage",
            headers=self.headers,
            json={"channel": target_channel, "text": text},
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

    def get_channel_name(self, channel_id: str) -> str:
        """Get the name of a channel from its ID."""
        # If it's already a name (doesn't start with Slack ID prefix), return it
        if not (channel_id.startswith("C") or channel_id.startswith("D") or channel_id.startswith("G")):
            return channel_id
        
        try:
            # First check list_channels to avoid extra API hits if we already have it
            # (or just call conversations.info which is more direct for a single ID)
            resp = requests.get(
                "https://slack.com/api/conversations.info",
                headers=self.headers,
                params={"channel": channel_id},
                timeout=30,
            )
            data = resp.json()
            if data.get("ok"):
                return data["channel"].get("name", channel_id)
            return channel_id
        except Exception:
            return channel_id
