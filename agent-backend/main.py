import os
import shutil
import tempfile
import zipfile
from pathlib import Path
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
import git
import requests
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Agent Brain Backend")

class SyncRequest(BaseModel):
    repoId: str
    githubUrl: str
    name: str

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
    resp.raise_for_status()
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
            # 1. Create KB
            kb_id = create_knowledge_base(req.name)
            print(f"Created Knowledge Base: {kb_id}")
            
            # 2. Upload zip
            upload_files_to_kb(kb_id, zip_path)
            
            print(f"Sync complete for {req.name}")
        except Exception as e:
            print(f"Error communicating with DigitalOcean API: {e}")

import time

class DOAppPlatformMock:
    @staticmethod
    def create_preview(repo_url: str, branch: str) -> str:
        # Mock deployment simulation
        print(f"Deploying {repo_url} on branch {branch} to DigitalOcean App Platform...")
        # Imagine a 45-second build here. For showcasing, we return immediately.
        time.sleep(1)
        # Create a fake app URL derived from the repo url
        app_name = repo_url.split("/")[-1].replace(".git", "").lower()
        return f"https://{app_name}-pr-1.ondigitalocean.app"

do_app_platform = DOAppPlatformMock()

@app.post("/api/projects/sync")
async def sync_project(req: SyncRequest, background_tasks: BackgroundTasks):
    # Offload the slow Vector Knowledge Base upload back to background
    background_tasks.add_task(process_repo_sync, req)
    
    # Showcase: Call DigitalOcean MCP Server to deploy preview
    live_url = do_app_platform.create_preview(req.githubUrl, "main")
    
    return {
        "status": "sync_started", 
        "repoId": req.repoId,
        "liveUrl": live_url
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
