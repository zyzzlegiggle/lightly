import requests
from datetime import datetime

class TasksService:
    """Helper for Google Tasks API."""
    
    BASE_URL = "https://tasks.googleapis.com/tasks/v1"

    def __init__(self, access_token: str):
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }

    def list_task_lists(self):
        resp = requests.get(f"{self.BASE_URL}/users/@me/lists", headers=self.headers)
        resp.raise_for_status()
        return resp.json().get("items", [])

    def list_tasks(self, list_id="@default", show_completed=True):
        resp = requests.get(
            f"{self.BASE_URL}/lists/{list_id}/tasks",
            headers=self.headers,
            params={"showCompleted": str(show_completed).lower()}
        )
        resp.raise_for_status()
        return resp.json().get("items", [])

    def create_task(self, title, notes="", due=None, list_id="@default"):
        """
        due must be RFC 3339 timestamp (e.g. 2023-10-24T00:00:00Z).
        Note: Google Tasks only stores the date, not the time.
        """
        payload = {
            "title": title,
            "notes": notes,
        }
        if due:
            payload["due"] = due
            
        resp = requests.post(
            f"{self.BASE_URL}/lists/{list_id}/tasks",
            headers=self.headers,
            json=payload
        )
        resp.raise_for_status()
        return resp.json()

    def update_task(self, task_id, title=None, notes=None, status=None, list_id="@default"):
        """status can be 'needsAction' or 'completed'."""
        # First get existing
        resp = requests.get(f"{self.BASE_URL}/lists/{list_id}/tasks/{task_id}", headers=self.headers)
        resp.raise_for_status()
        task = resp.json()

        if title: task["title"] = title
        if notes: task["notes"] = notes
        if status: task["status"] = status

        resp = requests.put(
            f"{self.BASE_URL}/lists/{list_id}/tasks/{task_id}",
            headers=self.headers,
            json=task
        )
        resp.raise_for_status()
        return resp.json()
