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

        # Allowed extensions
        allowed_extensions = {".ts", ".tsx", ".py", ".json"}
        
        # Filter files and create zip
        zip_path = os.path.join(tmpdir, "source_code.zip")
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(repo_dir):
                # Ignore metadata and heavy folders
                dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', '.next', 'dist', 'build', '.venv')]
                
                for file in files:
                    ext = Path(file).suffix
                    if ext in allowed_extensions:
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, repo_dir)
                        zipf.write(file_path, arcname)
                        
        print(f"Created filtered zip file at {zip_path}")
        
        try:
            # STEP 1: Upload to DigitalOcean Spaces
            # We use the repoId to keep the bucket organized
            spaces_object_key = f"projects/{req.repoId}/source_code.zip"
            
            print(f"Uploading to Spaces: {spaces_object_key}...")
            presigned_url = upload_to_spaces(zip_path, spaces_object_key)
            
            if not presigned_url:
                raise Exception("Failed to get presigned URL from Spaces")

            # STEP 2: Create the Knowledge Base
            kb_id = create_knowledge_base(req.name)
            print(f"Created Knowledge Base: {kb_id}")
            
            # STEP 3: Tell Gradient to index the file
            # In 2026, you can pass the presigned_url directly to Gradient 
            # so it pulls the file from Spaces instead of you re-uploading it.
            upload_files_to_kb(kb_id, zip_path)
            
            print(f"Sync complete for {req.name}")
        except Exception as e:
            print(f"Error communicating with DigitalOcean API: {e}")

import time

import boto3
from botocore.config import Config

def upload_to_spaces(file_path, object_name):
    session = boto3.session.Session()
    # DO Spaces uses the S3 protocol but needs a specific endpoint
    client = session.client('s3',
        region_name=os.getenv("SPACES_REGION"), # e.g., 'nyc3'
        endpoint_url=f'https://{os.getenv("SPACES_REGION")}.digitaloceanspaces.com',
        aws_access_key_id=os.getenv("SPACES_ACCESS_KEY"),
        aws_secret_access_key=os.getenv("SPACES_SECRET_KEY")
    )

    try:
        client.upload_file(file_path, os.getenv("SPACES_BUCKET"), object_name)
        # Generate a URL that expires in 1 hour so Gradient can grab it
        return client.generate_presigned_url('get_object',
            Params={'Bucket': os.getenv("SPACES_BUCKET"), 'Key': object_name},
            ExpiresIn=3600)
    except Exception as e:
        print(f"Spaces upload failed: {e}")
        return None

import secrets
import cloud_init

def create_droplet(name: str, user_data: str) -> dict:
    """Create a DO Droplet as a live sandbox.

    Uses a pre-baked snapshot (DROPLET_SNAPSHOT_ID) if available — this skips
    apt-get + Node.js install (~90s saved). Falls back to stock Ubuntu if unset.
    """
    token = os.getenv("GRADIENT_ACCESS_TOKEN")
    app_name = name.lower().replace(" ", "-")[:30]

    # Use pre-baked snapshot if available (Option A), else fall back to ubuntu
    snapshot_id = os.getenv("DROPLET_SNAPSHOT_ID")
    if snapshot_id:
        image = snapshot_id
        print(f"[Droplet] Using pre-baked snapshot {snapshot_id} ✓")
    else:
        image = "ubuntu-22-04-x64"
        print("[Droplet] No DROPLET_SNAPSHOT_ID set — using stock Ubuntu (slower cold start)")

    payload = {
        "name": f"lightly-{app_name}",
        "region": "sfo3",
        "size": "s-1vcpu-2gb",
        "image": image,
        "user_data": user_data,
        "tags": ["lightly"],
    }

    print(f"[Droplet] Creating: lightly-{app_name} in sfo3...")
    resp = requests.post(
        "https://api.digitalocean.com/v2/droplets",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=payload,
    )

    if not resp.ok:
        error_detail = resp.text
        print(f"[Droplet] FAILED ({resp.status_code}): {error_detail}")
        raise Exception(f"DO API error {resp.status_code}: {error_detail}")

    droplet = resp.json()["droplet"]
    print(f"[Droplet] Created {droplet['id']} — {droplet['name']}")
    return {"id": str(droplet["id"]), "name": droplet["name"]}


@app.post("/api/projects/sync")
async def sync_project(req: SyncRequest, background_tasks: BackgroundTasks):
    try:
        background_tasks.add_task(process_repo_sync, req)

        # Generate a sync token for the file sync API on the Droplet
        sync_token = secrets.token_urlsafe(24)

        # Build cloud-init and create Droplet (with user env vars)
        env_dict = {ev.key: ev.value for ev in req.envVars if ev.key.strip()}
        user_data = cloud_init.build(req.githubUrl, req.githubToken or "", "main", sync_token, env_dict)
        droplet = create_droplet(req.name, user_data)

        return {
            "status": "sync_started",
            "repoId": req.repoId,
            "liveUrl": "",
            "doAppId": droplet["id"],
            "appSpecRaw": {"syncToken": sync_token, "type": "droplet"},
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}


@app.get("/api/projects/{droplet_id}/status")
async def get_app_status(droplet_id: str):
    token = os.getenv("GRADIENT_ACCESS_TOKEN")

    if droplet_id.startswith("mock-"):
        return {"phase": "ACTIVE", "logs": "", "liveUrl": "http://localhost:3000"}

    headers = {"Authorization": f"Bearer {token}"}

    try:
        print(f"[Status] Checking droplet {droplet_id}...")

        resp = requests.get(f"https://api.digitalocean.com/v2/droplets/{droplet_id}", headers=headers, timeout=10)
        if not resp.ok:
            print(f"[Status] ✗ DO API returned {resp.status_code}: {resp.text[:200]}")
            return {"phase": "ERROR", "logs": f"Droplet API error: {resp.status_code}"}

        droplet = resp.json()["droplet"]
        status = droplet["status"]
        print(f"[Status] Droplet status: {status}")

        if status != "active":
            print(f"[Status] → BUILDING (droplet not active yet)")
            return {"phase": "BUILDING", "logs": f"Droplet status: {status}. Setting up environment..."}

        # Get public IP
        ip = None
        for net in droplet.get("networks", {}).get("v4", []):
            if net["type"] == "public":
                ip = net["ip_address"]
                break

        if not ip:
            print(f"[Status] → BUILDING (no public IP yet)")
            return {"phase": "BUILDING", "logs": "Waiting for IP assignment..."}

        print(f"[Status] Droplet IP: {ip}")

        # Check if sync API is healthy (means cloud-init finished dep install)
        try:
            health = requests.get(f"http://{ip}:8080/health", timeout=3)
            print(f"[Status] :8080 health → {health.status_code} {health.text[:50]}")
            if not health.ok:
                print(f"[Status] → DEPLOYING (sync API unhealthy)")
                return {"phase": "DEPLOYING", "logs": "Installing dependencies..."}
        except Exception as e:
            print(f"[Status] → DEPLOYING (:8080 unreachable: {e})")
            return {"phase": "DEPLOYING", "logs": "Installing dependencies..."}

        # Check if dev server on :3000 is responding
        try:
            dev_resp = requests.get(f"http://{ip}:3000", timeout=3)
            print(f"[Status] :3000 dev server → {dev_resp.status_code} ({len(dev_resp.text)} bytes)")
        except Exception as e:
            print(f"[Status] → DEPLOYING (:3000 unreachable: {type(e).__name__})")
            # Fetch remote logs to understand WHY :3000 isn't up
            remote_logs = ""
            try:
                log_resp = requests.get(f"http://{ip}:8080/logs", timeout=3)
                if log_resp.ok:
                    log_data = log_resp.json()
                    remote_logs = log_data.get("logs", "")
                    print(f"[Status] Remote setup logs (last 500 chars):\n{remote_logs[-500:]}")
                    print(f"[Status] Processes: {log_data.get('processes', 'N/A')}")
                    print(f"[Status] Port listeners: {log_data.get('ports', 'N/A')}")
            except Exception:
                pass
            # Use the last meaningful line from remote logs for user-facing message
            user_msg = "Dev server is compiling... almost ready."
            if remote_logs:
                lines = [l.strip() for l in remote_logs.strip().splitlines() if l.strip()]
                if lines:
                    last = lines[-1]
                    if "FATAL" in last or "Error" in last or "failed" in last.lower():
                        user_msg = f"Setup issue: {last[:120]}"
            return {"phase": "DEPLOYING", "logs": user_msg, "dropletIp": ip}

        print(f"[Status] ✓ ACTIVE — http://{ip}:3000")
        return {
            "phase": "ACTIVE",
            "logs": "",
            "liveUrl": f"http://{ip}:3000",
            "dropletIp": ip,
        }

    except Exception as e:
        print(f"[Status] ✗ Exception: {e}")
        return {"phase": "ERROR", "logs": str(e)}

@app.delete("/api/droplets/{droplet_id}/destroy")
async def destroy_droplet(droplet_id: str):
    token = os.getenv("GRADIENT_ACCESS_TOKEN")
    try:
        resp = requests.delete(f"https://api.digitalocean.com/v2/droplets/{droplet_id}",
            headers={"Authorization": f"Bearer {token}"})
        print(f"[Droplet] Destroy {droplet_id}: {resp.status_code}")
        return {"ok": resp.ok}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.post("/api/droplets/{droplet_id}/sync")
async def sync_to_droplet(droplet_id: str, req: ManualSyncRequest):
    """Proxy sync request directly to a specified Droplet's sync API."""
    try:
        resp = requests.post(
            f"http://{req.dropletIp}:8080/sync",
            headers={"Authorization": f"Bearer {req.syncToken}", "Content-Type": "application/json"},
            json={"changes": req.changes},
            timeout=15
        )
        if not resp.ok:
            return {"ok": False, "status": resp.status_code, "error": resp.text}
            
        print(f"[Droplet] Synced {len(req.changes)} files to {req.dropletIp}")
        return {"ok": True}
    except Exception as e:
        print(f"[Droplet] Sync failed to {req.dropletIp}: {e}")
        return {"ok": False, "error": str(e)}

# ── Agent Endpoints ─────────────────────────────────────────────────────

from fastapi.responses import StreamingResponse
from agent import AgentChatRequest, run_agent, ConfirmRequest, confirm_changes, RevertRequest, revert_changes

@app.post("/api/agent/chat")
async def agent_chat(req: AgentChatRequest):
    return StreamingResponse(run_agent(req), media_type="text/event-stream")

@app.post("/api/agent/confirm")
async def agent_confirm(req: ConfirmRequest):
    try:
        result = confirm_changes(req)
        return result
    except Exception as e:
        print(f"Confirm error: {e}")
        return {"ok": False, "error": str(e)}

@app.post("/api/agent/revert")
async def agent_revert(req: RevertRequest):
    try:
        result = revert_changes(req)
        return result
    except Exception as e:
        print(f"Revert error: {e}")
        return {"ok": False, "error": str(e)}

# ── File Upload Endpoint ────────────────────────────────────────────────

ALLOWED_UPLOAD_TYPES = {
    "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
    "image/bmp", "image/avif",
    "application/pdf",
    "text/css", "text/html", "text/plain",
    "application/json",
    "application/zip",
    "image/x-figma",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

@app.post("/api/uploads")
async def upload_file(file: UploadFile = File(...)):
    """Upload a design file or image. Returns a URL to reference it."""
    # Validate content type
    content_type = file.content_type or "application/octet-stream"
    # Be permissive — allow any image type
    if not (content_type.startswith("image/") or content_type in ALLOWED_UPLOAD_TYPES):
        raise HTTPException(
            status_code=400,
            detail=f"File type '{content_type}' not supported. Upload images, PDFs, or design files."
        )

    # Read file
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Max 10MB.")

    # Generate unique filename preserving extension
    ext = Path(file.filename or "file").suffix or ".bin"
    unique_name = f"{uuid.uuid4().hex[:12]}{ext}"
    file_path = UPLOADS_DIR / unique_name

    # Write to disk
    with open(file_path, "wb") as f:
        f.write(contents)

    print(f"[Upload] Saved {file.filename} -> {unique_name} ({len(contents)} bytes)")

    return {
        "url": f"/uploads/{unique_name}",
        "filename": unique_name,
        "originalName": file.filename,
        "size": len(contents),
        "contentType": content_type,
    }

@app.get("/api/uploads/{filename}")
async def get_upload(filename: str):
    """Retrieve an uploaded file."""
    file_path = UPLOADS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)

# ── Linear Integration Models & Endpoints ───────────────────────────────

class LinearTeamRequest(BaseModel):
    token: str

class LinearInitRequest(BaseModel):
    token: str
    teamId: str
    name: str

class LinearBoardRequest(BaseModel):
    token: str
    teamId: str
    projectId: str

class LinearMoveRequest(BaseModel):
    token: str
    issueId: str
    stateId: str

class LinearCreateRequest(BaseModel):
    token: str
    teamId: str
    projectId: Optional[str] = None
    title: str
    description: str = ""
    stateId: Optional[str] = None

@app.post("/api/linear/teams")
async def linear_teams(req: LinearTeamRequest):
    from linear_service import LinearService
    svc = LinearService(req.token)
    return {"teams": svc.get_teams()}

@app.post("/api/linear/init")
async def linear_init(req: LinearInitRequest):
    from linear_service import LinearService
    svc = LinearService(req.token)
    project = svc.create_project(req.teamId, req.name)
    return {"project": project}

@app.post("/api/linear/board")
async def linear_board(req: LinearBoardRequest):
    from linear_service import LinearService
    svc = LinearService(req.token)
    states = svc.get_workflow_states(req.teamId)
    issues = svc.list_project_issues(req.projectId)
    return {"states": states, "issues": issues}

@app.post("/api/linear/move")
async def linear_move(req: LinearMoveRequest):
    from linear_service import LinearService
    svc = LinearService(req.token)
    issue = svc.update_issue_state(req.issueId, req.stateId)
    return {"issue": issue}

@app.post("/api/linear/create")
async def linear_create(req: LinearCreateRequest):
    from linear_service import LinearService
    svc = LinearService(req.token)
    issue = svc.create_issue(
        team_id=req.teamId,
        title=req.title,
        description=req.description,
        project_id=req.projectId,
        state_id=req.stateId
    )
    return {"issue": issue}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
