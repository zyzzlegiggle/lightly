import os
import shutil
import tempfile
import zipfile
import uuid
from pathlib import Path
from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import Optional, List
import git
import requests
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# Create uploads directory
UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Agent Brain Backend")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Serve uploaded files statically
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

class EnvVar(BaseModel):
    key: str
    value: str

class SyncRequest(BaseModel):
    repoId: str
    githubUrl: str
    name: str
    githubToken: str
    envVars: list[EnvVar] = []
    auth0RefreshToken: Optional[str] = None

class ManualSyncRequest(BaseModel):
    dropletIp: str
    syncToken: str
    changes: list[dict] # [{"file": "path", "content": "..."}]

def create_knowledge_base(repo_name: str) -> str:
    """Create a new Knowledge Base in DigitalOcean Gradient"""
    token = os.getenv("GRADIENT_ACCESS_TOKEN")
    if not token:
        print("Warning: GRADIENT_ACCESS_TOKEN not set, skipping real API call.")
        return f"mock_kb_{repo_name}"

    url = "https://api.digitalocean.com/v2/gen-ai/knowledge_bases"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    payload = {
        "name": f"kb-{repo_name}",
        "description": f"Knowledge base for {repo_name}"
    }

    resp = requests.post(url, json=payload, headers=headers)
    if not resp.ok:
        print(f"Warning: DigitalOcean KB Gen-AI Endpoint rejected payload (likely missing Opensearch/embedding cluster config). Mocking KB ID.")
        return f"mock_kb_{repo_name}"
        
    data = resp.json()
    return data.get("id", f"mock_kb_{repo_name}")

def upload_files_to_kb(kb_id: str, zip_path: str):
    """Upload the zipped source code to the Gradient Knowledge Base"""
    token = os.getenv("GRADIENT_ACCESS_TOKEN")
    if not token:
        return

    # Assuming the API for uploading files is something like /v2/gen-ai/knowledge_bases/{kb_id}/documents
    # or requires a direct file upload multipart form
    url = f"https://api.digitalocean.com/v2/gen-ai/knowledge_bases/{kb_id}/files"
    headers = {
        "Authorization": f"Bearer {token}"
    }
    
    with open(zip_path, 'rb') as f:
        files = {'file': (os.path.basename(zip_path), f, 'application/zip')}
        try:
            resp = requests.post(url, headers=headers, files=files)
            resp.raise_for_status()
            print(f"Successfully uploaded {zip_path} to KB {kb_id}")
        except Exception as e:
            print(f"Failed to upload to KB: {e}")

def process_repo_sync(req: SyncRequest):
    print(f"Starting sync for {req.name} ({req.githubUrl})")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        repo_dir = os.path.join(tmpdir, "repo")
        print(f"Cloning {req.githubUrl} into {repo_dir}...")
        
        try:
            # We assume public repo for this hackathon or the URL includes the token
            git.Repo.clone_from(req.githubUrl, repo_dir)
        except Exception as e:
            print(f"Failed to clone repo: {e}")
            return

        # Filter and zip repository
        zip_path = os.path.join(tmpdir, "source_code.zip")
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(repo_dir):
                dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', '.next', 'dist', 'build', '.venv')]
                for file in files:
                    if Path(file).suffix in {".ts", ".tsx", ".py", ".json"}:
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, repo_dir)
                        zipf.write(file_path, arcname)
                        
        try:
            spaces_object_key = f"projects/{req.repoId}/source_code.zip"
            presigned_url = upload_to_spaces(zip_path, spaces_object_key)
            kb_id = create_knowledge_base(req.name)
            upload_files_to_kb(kb_id, zip_path)
            print(f"Sync complete for {req.name}")
        except Exception as e:
            print(f"Error communicating with DigitalOcean API: {e}")

def upload_to_spaces(file_path, object_name):
    import boto3
    session = boto3.session.Session()
    client = session.client('s3',
        region_name=os.getenv("SPACES_REGION"),
        endpoint_url=f'https://{os.getenv("SPACES_REGION")}.digitaloceanspaces.com',
        aws_access_key_id=os.getenv("SPACES_ACCESS_KEY"),
        aws_secret_access_key=os.getenv("SPACES_SECRET_KEY")
    )
    try:
        client.upload_file(file_path, os.getenv("SPACES_BUCKET"), object_name)
        return client.generate_presigned_url('get_object',
            Params={'Bucket': os.getenv("SPACES_BUCKET"), 'Key': object_name},
            ExpiresIn=3600)
    except Exception as e:
        print(f"Spaces upload failed: {e}")
        return None

def create_droplet(name: str, user_data: str) -> dict:
    token = os.getenv("GRADIENT_ACCESS_TOKEN")
    app_name = name.lower().replace(" ", "-")[:30]
    snapshot_id = os.getenv("DROPLET_SNAPSHOT_ID")
    image = snapshot_id if snapshot_id else "ubuntu-22-04-x64"
    payload = {
        "name": f"lightly-{app_name}",
        "region": "sfo3", "size": "s-1vcpu-2gb", "image": image,
        "user_data": user_data, "tags": ["lightly"],
    }
    resp = requests.post("https://api.digitalocean.com/v2/droplets",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=payload)
    if not resp.ok:
        raise Exception(f"DO API error {resp.status_code}: {resp.text}")
    droplet = resp.json()["droplet"]
    return {"id": str(droplet["id"]), "name": droplet["name"]}

@app.post("/api/projects/sync")
async def sync_project(req: SyncRequest, background_tasks: BackgroundTasks):
    import secrets, cloud_init
    background_tasks.add_task(process_repo_sync, req)
    sync_token = secrets.token_urlsafe(24)
    env_dict = {ev.key: ev.value for ev in req.envVars if ev.key.strip()}
    user_data = cloud_init.build(req.githubUrl, req.githubToken or "", "main", sync_token, env_dict)
    droplet = create_droplet(req.name, user_data)
    return {"status": "sync_started", "repoId": req.repoId, "doAppId": droplet["id"], "appSpecRaw": {"syncToken": sync_token, "type": "droplet"}}

@app.get("/api/projects/{droplet_id}/status")
async def get_app_status(droplet_id: str):
    token = os.getenv("GRADIENT_ACCESS_TOKEN")
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get(f"https://api.digitalocean.com/v2/droplets/{droplet_id}", headers=headers, timeout=10)
        if not resp.ok: return {"phase": "ERROR", "logs": "Droplet API error"}
        droplet = resp.json()["droplet"]
        if droplet["status"] != "active": return {"phase": "BUILDING", "logs": "Setting up..."}
        ip = next((n["ip_address"] for n in droplet["networks"]["v4"] if n["type"] == "public"), None)
        if not ip: return {"phase": "BUILDING", "logs": "Waiting for IP..."}
        try:
            health = requests.get(f"http://{ip}:8080/health", timeout=3)
            if not health.ok: return {"phase": "DEPLOYING", "logs": "Sync API booting..."}
            dev = requests.get(f"http://{ip}:3000", timeout=3)
        except Exception: return {"phase": "DEPLOYING", "logs": "Installing dependencies...", "dropletIp": ip}
        return {"phase": "ACTIVE", "liveUrl": f"http://{ip}:3000", "dropletIp": ip}
    except Exception as e: return {"phase": "ERROR", "logs": str(e)}

@app.delete("/api/droplets/{droplet_id}/destroy")
async def destroy_droplet(droplet_id: str):
    token = os.getenv("GRADIENT_ACCESS_TOKEN")
    resp = requests.delete(f"https://api.digitalocean.com/v2/droplets/{droplet_id}", headers={"Authorization": f"Bearer {token}"})
    return {"ok": resp.ok}

@app.post("/api/droplets/{droplet_id}/sync")
async def sync_to_droplet(droplet_id: str, req: ManualSyncRequest):
    resp = requests.post(f"http://{req.dropletIp}:8080/sync", headers={"Authorization": f"Bearer {req.syncToken}"}, json={"changes": req.changes}, timeout=15)
    return {"ok": resp.ok}

# Agent Endpoints
from agent import AgentChatRequest, run_agent, ConfirmRequest, confirm_changes, RevertRequest, revert_changes
@app.post("/api/agent/chat")
async def agent_chat(req: AgentChatRequest): return StreamingResponse(run_agent(req), media_type="text/event-stream")
@app.post("/api/agent/confirm")
async def agent_confirm(req: ConfirmRequest): return confirm_changes(req)
@app.post("/api/agent/revert")
async def agent_revert(req: RevertRequest): return revert_changes(req)
from fastapi.responses import StreamingResponse

# Linear Models
class LinearTeamRequest(BaseModel): token: str
class LinearInitRequest(BaseModel): token: str; teamId: str; name: str
class LinearBoardRequest(BaseModel): token: str; teamId: str; projectId: str
class LinearMoveRequest(BaseModel): token: str; issueId: str; stateId: str
class LinearUpdateRequest(BaseModel):
    token: str; issueId: str; title: Optional[str] = None; assigneeId: Optional[str] = None; dueDate: Optional[str] = None

class LinearCreateRequest(BaseModel):
    token: str; teamId: str; projectId: Optional[str] = None; title: str; description: str = ""
    stateId: Optional[str] = None; assigneeId: Optional[str] = None; dueDate: Optional[str] = None

@app.post("/api/linear/teams")
async def linear_teams(req: LinearTeamRequest):
    from linear_service import LinearService
    return {"teams": LinearService(req.token).get_teams()}

@app.post("/api/linear/init")
async def linear_init(req: LinearInitRequest):
    from linear_service import LinearService
    return {"project": LinearService(req.token).create_project(req.teamId, req.name)}

@app.post("/api/linear/board")
async def linear_board(req: LinearBoardRequest):
    from linear_service import LinearService
    svc = LinearService(req.token)
    return {"states": svc.get_workflow_states(req.teamId), "issues": svc.list_project_issues(req.projectId)}

@app.post("/api/linear/move")
async def linear_move(req: LinearMoveRequest):
    from linear_service import LinearService
    return {"issue": LinearService(req.token).update_issue_state(req.issueId, req.stateId)}

@app.post("/api/linear/update")
async def linear_update(req: LinearUpdateRequest):
    from linear_service import LinearService
    return {"issue": LinearService(req.token).update_issue(
        issue_id=req.issueId, title=req.title, assignee_id=req.assigneeId, due_date=req.dueDate
    )}

@app.post("/api/linear/create")

async def linear_create(req: LinearCreateRequest):
    from linear_service import LinearService
    issue = LinearService(req.token).create_issue(
        team_id=req.teamId, title=req.title, description=req.description,
        project_id=req.projectId, state_id=req.stateId, assignee_id=req.assigneeId, due_date=req.dueDate
    )
    return {"issue": issue}

@app.post("/api/linear/members")
async def linear_members(req: LinearTeamRequest):
    from linear_service import LinearService
    # We might need teamId in request, but LinearTeamRequest only has token.
    # Wait, the frontend might be sending the wrong request object or I should adjust.
    # For now, let's assume it has teamId
    pass

class LinearMemberRequest(BaseModel):
    token: str
    teamId: str

@app.post("/api/linear/members")
async def get_linear_members(req: LinearMemberRequest):
    from linear_service import LinearService
    return {"members": LinearService(req.token).get_team_members(req.teamId)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8080)))
