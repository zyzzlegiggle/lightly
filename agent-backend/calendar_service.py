import requests
from datetime import datetime, timedelta
from typing import List, Dict, Optional

class CalendarService:
    def __init__(self, access_token: str):
        self.access_token = access_token
        self.base_url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }

    def list_events(self, time_min: Optional[str] = None, max_results: int = 10) -> List[Dict]:
        """List upcoming events."""
        if not time_min:
            time_min = datetime.utcnow().isoformat() + "Z"
            
        params = {
            "timeMin": time_min,
            "maxResults": max_results,
            "singleEvents": True,
            "orderBy": "startTime"
        }
        resp = requests.get(self.base_url, headers=self.headers, params=params)
        resp.raise_for_status()
        return resp.json().get("items", [])

    def create_event(self, summary: str, start_time: str, end_time: Optional[str] = None, description: str = "") -> Dict:
        """
        Create a new calendar event.
        start_time/end_time should be in ISO format: '2026-04-02T16:00:00Z'
        """
        if not end_time:
            # Default to 1 hour duration
            start_dt = datetime.fromisoformat(start_time.replace("Z", ""))
            end_dt = start_dt + timedelta(hours=1)
            end_time = end_dt.isoformat() + "Z"

        payload = {
            "summary": summary,
            "description": description,
            "start": {"dateTime": start_time, "timeZone": "UTC"},
            "end": {"dateTime": end_time, "timeZone": "UTC"}
        }

        resp = requests.post(self.base_url, headers=self.headers, json=payload)
        resp.raise_for_status()
        return resp.json()

    def search_events(self, query: str, max_results: int = 5) -> List[Dict]:
        """Search for events matching a query string."""
        params = {
            "q": query,
            "maxResults": max_results,
            "singleEvents": True,
            "orderBy": "startTime"
        }
        resp = requests.get(self.base_url, headers=self.headers, params=params)
        resp.raise_for_status()
        return resp.json().get("items", [])
