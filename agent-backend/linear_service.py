import requests
from typing import List, Dict, Optional

class LinearService:
    def __init__(self, access_token: str):
        self.access_token = access_token
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }

    def search_issues(self, query: str) -> List[Dict]:
        """Search issues in Linear."""
        # Simple search uses Linear's GraphQL API
        query_gql = """
        query SearchIssues($query: String!) {
          issues(filter: { title: { contains: $query } }, first: 5) {
            nodes { id title identifier url state { name } }
          }
        }
        """
        resp = requests.post(
            "https://api.linear.app/graphql",
            headers=self.headers,
            json={"query": query_gql, "variables": {"query": query}}
        )
        if not resp.ok:
            return []
        return resp.json().get("data", {}).get("issues", {}).get("nodes", [])

    def create_issue(self, team_id: str, title: str, description: str = "") -> Dict:
        """Create a new issue in Linear."""
        mutation = """
        mutation IssueCreate($teamId: String!, $title: String!, $description: String) {
          issueCreate(input: { teamId: $teamId, title: $title, description: $description }) {
            success
            issue { id title identifier url }
          }
        }
        """
        resp = requests.post(
            "https://api.linear.app/graphql",
            headers=self.headers,
            json={"query": mutation, "variables": {"teamId": team_id, "title": title, "description": description}}
        )
        resp.raise_for_status()
        return resp.json().get("data", {}).get("issueCreate", {}).get("issue", {})
