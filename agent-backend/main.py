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
from pydantic import BaseModel
from typing import Optional
import git
import requests
from dotenv import load_dotenv

load_dotenv()

# Create uploads directory
UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Agent Brain Backend")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Serve uploaded files statically
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

class SyncRequest(BaseModel):
    repoId: str
    githubUrl: str
    name: str
    githubToken: str # <--- Add this

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
    """Create a DO Droplet as a live sandbox."""
    token = os.getenv("GRADIENT_ACCESS_TOKEN")
    app_name = name.lower().replace(" ", "-")[:30]

    payload = {
        "name": f"lightly-{app_name}",
        "region": "sfo3",
        "size": "s-1vcpu-2gb",  # 2GB — 1GB was causing OOM kills during npm install/dev server
        "image": "ubuntu-22-04-x64",
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

        # Build cloud-init and create Droplet
        user_data = cloud_init.build(req.githubUrl, req.githubToken or "", "main", sync_token)
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
        resp = requests.get(f"https://api.digitalocean.com/v2/droplets/{droplet_id}", headers=headers)
        if not resp.ok:
            return {"phase": "ERROR", "logs": f"Droplet API error: {resp.status_code}"}

        droplet = resp.json()["droplet"]
        status = droplet["status"]

        if status != "active":
            return {"phase": "BUILDING", "logs": f"Droplet status: {status}. Setting up environment..."}

        # Get public IP
        ip = None
        for net in droplet.get("networks", {}).get("v4", []):
            if net["type"] == "public":
                ip = net["ip_address"]
                break

        if not ip:
            return {"phase": "BUILDING", "logs": "Waiting for IP assignment..."}

        # Check if sync API is healthy (means cloud-init finished)
        try:
            health = requests.get(f"http://{ip}:8080/health", timeout=5)
            if health.ok:
                return {
                    "phase": "ACTIVE",
                    "logs": "",
                    "liveUrl": f"http://{ip}:3000",
                    "dropletIp": ip,
                }
        except Exception:
            pass

        return {"phase": "DEPLOYING", "logs": "Installing dependencies and starting dev server..."}

    except Exception as e:
        print(f"Status check failed: {e}")
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
