import requests
from typing import List, Dict, Optional

class LinearService:
    def __init__(self, access_token: str):
        self.access_token = access_token
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }

    def _query(self, query: str, variables: Optional[Dict] = None) -> Dict:
        resp = requests.post(
            "https://api.linear.app/graphql",
            headers=self.headers,
            json={"query": query, "variables": variables or {}}
        )
        resp.raise_for_status()
        data = resp.json()
        if "errors" in data:
            raise Exception(f"Linear API Error: {data['errors'][0]['message']}")
        return data.get("data", {})

    def get_teams(self) -> List[Dict]:
        """List all teams the user has access to."""
        query = """
        query Teams {
          teams {
            nodes { id name key }
          }
        }
        """
        data = self._query(query)
        return data.get("teams", {}).get("nodes", [])

    def create_project(self, team_id: str, name: str, description: str = "") -> Dict:
        """Create a new project in Linear."""
        mutation = """
        mutation ProjectCreate($teamId: String!, $name: String!, $description: String) {
          projectCreate(input: { teamIds: [$teamId], name: $name, description: $description }) {
            success
            project { id name }
          }
        }
        """
        data = self._query(mutation, {"teamId": team_id, "name": name, "description": description})
        return data.get("projectCreate", {}).get("project", {})

    def get_workflow_states(self, team_id: str) -> List[Dict]:
        """List workflow states for a team (Todo, Doing, Done, etc)."""
        query = """
        query WorkflowStates($teamId: String!) {
          team(id: $teamId) {
            states {
              nodes { id name color type position }
            }
          }
        }
        """
        data = self._query(query, {"teamId": team_id})
        return data.get("team", {}).get("states", {}).get("nodes", [])

    def list_project_issues(self, project_id: str) -> List[Dict]:
        """List all issues for a specific Linear project."""
        query = """
        query ProjectIssues($projectId: String!) {
          project(id: $projectId) {
            issues {
              nodes { 
                id title identifier url priority
                state { id name color type }
                assignee { id name avatarUrl }
              }
            }
          }
        }
        """
        data = self._query(query, {"projectId": project_id})
        return (data.get("project") or {}).get("issues", {}).get("nodes", [])

    def create_issue(self, team_id: str, title: str, description: str = "", project_id: Optional[str] = None, state_id: Optional[str] = None, assignee_id: Optional[str] = None, due_date: Optional[str] = None) -> Dict:
        """Create a new issue in Linear."""
        mutation = """
        mutation IssueCreate($teamId: String!, $title: String!, $description: String, $projectId: String, $stateId: String, $assigneeId: String, $dueDate: TimelessDate) {
          issueCreate(input: { teamId: $teamId, title: $title, description: $description, projectId: $projectId, stateId: $stateId, assigneeId: $assigneeId, dueDate: $dueDate }) {
            success
            issue { id title identifier url state { id name } }
          }
        }
        """
        data = self._query(mutation, {
            "teamId": team_id, 
            "title": title, 
            "description": description, 
            "projectId": project_id,
            "stateId": state_id,
            "assigneeId": assignee_id,
            "dueDate": due_date
        })
        return data.get("issueCreate", {}).get("issue", {})


    def update_issue_state(self, issue_id: str, state_id: str) -> Dict:
        """Update an issue's workflow state."""
        mutation = """
        mutation IssueUpdate($id: String!, $stateId: String!) {
          issueUpdate(id: $id, input: { stateId: $stateId }) {
            success
            issue { id title state { id name } }
          }
        }
        """
        data = self._query(mutation, {"id": issue_id, "stateId": state_id})
        return data.get("issueUpdate", {}).get("issue", {})
    def update_issue(self, issue_id: str, title: Optional[str] = None, assignee_id: Optional[str] = None, due_date: Optional[str] = None) -> Dict:
        """Update an existing issue's properties."""
        mutation = """
        mutation IssueUpdate($id: String!, $title: String, $assigneeId: String, $dueDate: TimelessDate) {
          issueUpdate(id: $id, input: { title: $title, assigneeId: $assigneeId, dueDate: $dueDate }) {
            success
            issue { id title identifier }
          }
        }
        """
        data = self._query(mutation, {
            "id": issue_id,
            "title": title,
            "assigneeId": assignee_id,
            "dueDate": due_date
        })
        return data.get("issueUpdate", {}).get("issue", {})

    def search_issues(self, query: str) -> List[Dict]:
        """Search issues in Linear."""
        query_gql = """
        query SearchIssues($query: String!) {
          issues(filter: { title: { contains: $query } }, first: 10) {
            nodes { id title identifier url state { name } }
          }
        }
        """
        data = self._query(query_gql, {"query": query})
        return data.get("issues", {}).get("nodes", [])
    def get_team_members(self, team_id: str) -> List[Dict]:
        """List all members of a specific team."""
        query = """
        query TeamMembers($teamId: String!) {
          team(id: $teamId) {
            members {
              nodes { 
                id name avatarUrl email
              }
            }
          }
        }
        """
        data = self._query(query, {"teamId": team_id})
        return (data.get("team") or {}).get("members", {}).get("nodes", [])

    def delete_project(self, project_id: str) -> bool:
        """Delete a project in Linear."""
        mutation = """
        mutation ProjectArchive($id: String!) {
          projectArchive(id: $id) {
            success
          }
        }
        """
        # Linear prefers Archive for projects usually, but projectDelete also exists.
        # Let's try Delete first as requested, but Archive is safer if Delete isn't what they want.
        # Actually, let's use projectDelete as it's a "Delete" request.
        mutation_delete = """
        mutation ProjectDelete($id: String!) {
          projectDelete(id: $id) {
            success
          }
        }
        """
        data = self._query(mutation_delete, {"id": project_id})
        return data.get("projectDelete", {}).get("success", False)
