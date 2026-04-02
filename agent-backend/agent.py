"""
AI Agent for Lightly — explores codebase, makes changes via GitHub API, triggers DO redeploy.
Uses DigitalOcean GenAI for LLM inference.
Token-optimized: 2-pass approach (plan files → edit files).
No git clone needed — pure GitHub REST API (like sparkles.dev / Replit).
"""

import os
import json
import base64
import requests
from pydantic import BaseModel
from gmail_service import GmailService
from calendar_service import CalendarService
from datetime import datetime

# ── Models ──────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str

class UploadedAttachment(BaseModel):
    url: str
    originalName: str
    contentType: str
    size: int = 0

class AgentChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    githubUrl: str
    githubToken: str
    doAppId: str | None = None
    branch: str = "main"
    repoId: str = ""
    dropletIp: str | None = None
    syncToken: str | None = None
    currentPage: str = "/"
    attachments: list[UploadedAttachment] = []
    auth0RefreshToken: str | None = None

# ── Prompts (kept short for token efficiency) ───────────────────────────

PLAN_PROMPT = (
    "You are an AI Workspace Assistant. You have three main capabilities:\n"
    "1. **Code Editing**: Analyzing and modifying the project's source code.\n"
    "2. **Gmail Services**: Searching, reading, and summarizing the user's emails.\n"
    "3. **Calendar Services**: Searching, reading, and CREATING events in the user's Google Calendar.\n\n"
    "Given the file tree, current page, and user request, determine the best course of action.\n"
    "For GMAIL, use the `gmail_search` tool.\n"
    'Return JSON: {"gmail_search": {"query": "search query", "max_results": 5}, "plan": "searching gmail"}\n\n'
    "For CALENDAR SEARCH, use the `calendar_search` tool.\n"
    'Return JSON: {"calendar_search": {"query": "meeting", "max_results": 10}, "plan": "searching calendar"}\n\n'
    "For CALENDAR CREATE, use the `calendar_create` tool.\n"
    "Provide start_time in ISO-8601 format (e.g., '2026-04-02T16:00:00Z').\n"
    'Return JSON: {"calendar_create": {"summary": "Event Title", "start_time": "...", "description": "..."}, "plan": "creating event"}\n\n'
    "For CODE, pick files to read (max 8).\n"
    'Return JSON: {"files_to_read": ["path"], "plan": "brief plan"}\n\n'
    "If vague, return "
    '{"clarify": "question", "files_to_read": [], "plan": ""}'
)

EDIT_PROMPT = (
    "You edit source code. The user is a DESIGNER (non-technical) viewing a specific page. "
    "Focus changes on what affects that page unless asked otherwise. "
    "If the user attached images or design files, treat them as UI reference/mockups. "
    "Recreate or match the visual design from those references as closely as possible "
    "using the project's existing tech stack (HTML, CSS, React, etc.). "
    "IMPORTANT: If the request is still unclear or could be interpreted multiple ways, "
    "ask a clarifying question instead of guessing: "
    '{"clarify": "your question", "changes": [], "summary": ""} '
    "For EACH change, include a 'description' field with a short, non-technical, "
    "designer-friendly description of what changes VISUALLY. "
    "Examples: 'Updated hero background to gradient blue-purple', "
    "'Made card corners more rounded', 'Increased button size and padding'. "
    "Do NOT mention file names or code in descriptions. "
    'Return ONLY JSON: {"changes":[{"file":"path","content":"COMPLETE new file content",'
    '"description":"designer-friendly visual description"}],'
    '"summary":"friendly summary of all visual changes"}. '
    'Include full file content for each changed file.'
)

# ── GitHub API helpers (no git clone needed!) ───────────────────────────

def _gh_headers(token: str) -> dict:
    return {"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"}

def _parse_repo(github_url: str) -> str:
    """Extract 'owner/repo' from clone URL."""
    path = github_url.replace("https://github.com/", "").replace(".git", "")
    return path.strip("/")

def gh_file_tree(repo: str, branch: str, token: str) -> str:
    """Get file tree via GitHub Trees API (single API call, recursive)."""
    url = f"https://api.github.com/repos/{repo}/git/trees/{branch}?recursive=1"
    resp = requests.get(url, headers=_gh_headers(token), timeout=30)
    resp.raise_for_status()

    skip_dirs = {'node_modules/', '.next/', 'dist/', 'build/', '.venv/', '__pycache__/', '.cache/', '.git/'}
    skip_ext = {'.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.map', '.lock'}

    paths = []
    for item in resp.json().get("tree", []):
        if item["type"] != "blob":
            continue
        path = item["path"]
        # Skip heavy directories
        if any(path.startswith(d) or f"/{d}" in path for d in skip_dirs):
            continue
        # Skip binary extensions
        ext = os.path.splitext(path)[1]
        if ext in skip_ext:
            continue
        paths.append(path)

    return "\n".join(sorted(paths))


def gh_read_file(repo: str, path: str, branch: str, token: str) -> tuple[str, str]:
    """Read a file via GitHub Contents API. Returns (content, sha)."""
    url = f"https://api.github.com/repos/{repo}/contents/{path}?ref={branch}"
    resp = requests.get(url, headers=_gh_headers(token), timeout=30)
    resp.raise_for_status()
    data = resp.json()
    content = base64.b64decode(data["content"]).decode("utf-8", errors="ignore")
    return content, data["sha"]


def gh_commit_changes(repo: str, branch: str, token: str, changes: list[dict], message: str):
    """
    Commit multiple file changes in a single commit using GitHub Git Data API.
    This is the proper way — creates one clean commit, not one per file.
    
    Steps: get ref → get commit → create blobs → create tree → create commit → update ref
    """
    headers = _gh_headers(token)
    base = f"https://api.github.com/repos/{repo}"

    # 1. Get current branch ref
    ref_resp = requests.get(f"{base}/git/refs/heads/{branch}", headers=headers, timeout=30)
    ref_resp.raise_for_status()
    current_sha = ref_resp.json()["object"]["sha"]

    # 2. Get the commit to find the base tree
    commit_resp = requests.get(f"{base}/git/commits/{current_sha}", headers=headers, timeout=30)
    commit_resp.raise_for_status()
    base_tree_sha = commit_resp.json()["tree"]["sha"]

    # 3. Create blobs for each changed file
    tree_items = []
    for change in changes:
        blob_resp = requests.post(f"{base}/git/blobs", headers=headers, timeout=30,
            json={"content": change["content"], "encoding": "utf-8"})
        blob_resp.raise_for_status()
        tree_items.append({
            "path": change["file"],
            "mode": "100644",
            "type": "blob",
            "sha": blob_resp.json()["sha"],
        })

    # 4. Create a new tree based on the current tree
    tree_resp = requests.post(f"{base}/git/trees", headers=headers, timeout=30,
        json={"base_tree": base_tree_sha, "tree": tree_items})
    tree_resp.raise_for_status()
    new_tree_sha = tree_resp.json()["sha"]

    # 5. Create the commit
    commit_create = requests.post(f"{base}/git/commits", headers=headers, timeout=30,
        json={"message": message, "tree": new_tree_sha, "parents": [current_sha]})
    commit_create.raise_for_status()
    new_commit_sha = commit_create.json()["sha"]

    # 6. Update the branch ref
    update_ref = requests.patch(f"{base}/git/refs/heads/{branch}", headers=headers, timeout=30,
        json={"sha": new_commit_sha})
    update_ref.raise_for_status()

    print(f"[GitHub] Created commit {new_commit_sha[:8]} on {branch}")

# ── LLM helpers ─────────────────────────────────────────────────────────

def call_llm(messages: list[dict], temp: float = 0.1) -> str:
    """Call DO GenAI / any OpenAI-compatible endpoint."""
    endpoint = os.getenv("DO_GENAI_ENDPOINT", "https://api.openai.com/v1")
    api_key = os.getenv("DO_GENAI_API_KEY", os.getenv("GRADIENT_ACCESS_TOKEN", ""))
    model = os.getenv("DO_GENAI_MODEL", "gpt-4o-mini")

    # Normalize endpoint URL for different providers
    base = endpoint.rstrip("/")
    if base.endswith("/v1"):
        url = f"{base}/chat/completions"
    elif base.endswith("/chat/completions"):
        url = base
    else:
        url = f"{base}/api/v1/chat/completions"

    print(f"[LLM] POST {url} model={model}")
    resp = requests.post(url,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"model": model, "messages": messages, "temperature": temp, "max_tokens": 8192},
        timeout=180)
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def exchange_for_service_token(refresh_token: str, connection: str = "google-oauth2") -> str:
    """Exchange an Auth0 refresh token for a service-specific access token via Token Vault."""
    domain = os.getenv("AUTH0_DOMAIN")
    client_id = os.getenv("AUTH0_CLIENT_ID")
    client_secret = os.getenv("AUTH0_CLIENT_SECRET")
    
    if not all([domain, client_id, client_secret, refresh_token]):
        raise Exception("Missing Auth0 credentials or refresh token for exchange")

    url = f"https://{domain}/oauth/token"
    payload = {
        "grant_type": "urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token",
        "subject_token": refresh_token,
        "subject_token_type": "urn:ietf:params:oauth:token-type:refresh_token",
        "requested_token_type": "http://auth0.com/oauth/token-type/token-vault-access-token",
        "connection": connection,
        "client_id": client_id,
        "client_secret": client_secret,
    }

    resp = requests.post(url, data=payload, headers={"Content-Type": "application/x-www-form-urlencoded"})
    resp.raise_for_status()
    return resp.json()["access_token"]


def parse_json(text: str) -> dict:
    """Parse JSON from LLM response, handles markdown fences."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        end = next((i for i in range(1, len(lines)) if lines[i].strip().startswith("```")), len(lines))
        text = "\n".join(lines[1:end])
    if not text.startswith("{"):
        idx = text.find("{")
        if idx != -1:
            text = text[idx:]
    return json.loads(text)


def trigger_redeploy(do_app_id: str) -> bool:
    token = os.getenv("GRADIENT_ACCESS_TOKEN")
    if not token or do_app_id.startswith("mock-"):
        return False
    try:
        r = requests.post(
            f"https://api.digitalocean.com/v2/apps/{do_app_id}/deployments",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"force_build": True})
        return r.ok
    except Exception:
        return False

# ── SSE helper ──────────────────────────────────────────────────────────

def sse(event_type: str, **data) -> str:
    return f"data: {json.dumps({'type': event_type, **data})}\n\n"

# ── Main agent (yields SSE events) ─────────────────────────────────────

def run_agent(req: AgentChatRequest):
    """Sync generator — pure GitHub API, no git clone needed."""
    try:
        repo = _parse_repo(req.githubUrl)

        # Build attachment context if files were uploaded
        attachment_context = ""
        if req.attachments:
            att_lines = []
            for att in req.attachments:
                att_lines.append(
                    f"- {att.originalName} ({att.contentType}, {att.size} bytes) "
                    f"— uploaded as reference/mockup"
                )
            attachment_context = (
                "\n\nThe user uploaded these reference files:\n"
                + "\n".join(att_lines)
                + "\nUse these as visual reference for the requested changes."
            )
            yield sse("status", content=f"Processing {len(req.attachments)} uploaded file(s)...")

        # 1 ── Get file tree via GitHub API
        yield sse("status", content="Exploring codebase...")
        tree = gh_file_tree(repo, req.branch, req.githubToken)
        file_count = len(tree.splitlines())
        print(f"[Agent] File tree: {file_count} files in {repo}")

        # 2 ── Plan: identify relevant files (cheap LLM call)
        yield sse("status", content="Planning changes...")
        hist = [{"role": m.role, "content": m.content} for m in req.history[-6:]]

        plan_raw = call_llm([
            {"role": "system", "content": PLAN_PROMPT},
            *hist,
            {"role": "user", "content": f"Context: Today is {datetime.utcnow().strftime('%A, %Y-%m-%d %H:%M:%S UTC')}.\nFile tree:\n{tree}\n\nCurrent page: {req.currentPage}\nRequest: {req.message}{attachment_context}"},
        ])
        print(f"[Agent] Plan: {plan_raw[:200]}")
        plan = parse_json(plan_raw)

        # Handle clarification from planner
        if plan.get("clarify"):
            yield sse("message", content=plan["clarify"])
            yield sse("done")
            return

        # Handle Gmail Tool Call
        if "gmail_search" in plan:
            query = plan["gmail_search"].get("query", "")
            limit = plan["gmail_search"].get("max_results", 5)
            
            yield sse("status", content=f"Searching Gmail for '{query}'...")
            try:
                # 1. Exchange for Google Access Token
                g_token = exchange_for_service_token(req.auth0RefreshToken, "google-oauth2")
                
                # 2. Call Gmail Service
                gmail = GmailService(g_token)
                threads = gmail.search_threads(query, limit)
                
                yield sse("status", content=f"Summarizing {len(threads)} email(s)...")
                
                # 3. Present results to Edit Prompt for summary
                edit_raw = call_llm([
                    {"role": "system", "content": "You are a professional Gmail assistant. Summarize the following email threads concisely."},
                    *hist,
                    {"role": "user", "content": f"Threads found:\n{json.dumps(threads, indent=2)}\n\nUser request: {req.message}"},
                ])
                yield sse("message", content=edit_raw)
                yield sse("done")
                return
            except Exception as e:
                print(f"[Agent] Gmail Error: {e}")
                yield sse("message", content=f"Sorry, I couldn't access your Gmail: {str(e)}")
                yield sse("done")
                return

        # Handle Calendar Tools
        if "calendar_search" in plan:
            query = plan["calendar_search"].get("query", "")
            yield sse("status", content=f"Checking your calendar for '{query}'...")
            try:
                g_token = exchange_for_service_token(req.auth0RefreshToken, "google-oauth2")
                calendar = CalendarService(g_token)
                events = calendar.search_events(query)
                yield sse("status", content=f"Summarizing {len(events)} event(s)...")
                edit_raw = call_llm([
                    {"role": "system", "content": "You are a professional Calendar assistant. Summarize the following calendar events concisely."},
                    *hist,
                    {"role": "user", "content": f"Events found:\n{json.dumps(events, indent=2)}\n\nUser request: {req.message}"},
                ])
                yield sse("message", content=edit_raw)
                yield sse("done")
                return
            except Exception as e:
                print(f"[Agent] Calendar Error: {e}")
                yield sse("message", content=f"Sorry, I couldn't access your Calendar: {str(e)}")
                yield sse("done")
                return

        if "calendar_create" in plan:
            details = plan["calendar_create"]
            yield sse("status", content=f"Scheduling '{details.get('summary')}'...")
            try:
                g_token = exchange_for_service_token(req.auth0RefreshToken, "google-oauth2")
                calendar = CalendarService(g_token)
                event = calendar.create_event(
                    summary=details.get("summary"),
                    start_time=details.get("start_time"),
                    description=details.get("description", "")
                )
                yield sse("message", content=f"✓ Created: **{event.get('summary')}**\nScheduled for: {event.get('start', {}).get('dateTime')}")
                yield sse("done")
                return
            except Exception as e:
                print(f"[Agent] Calendar Error: {e}")
                yield sse("message", content=f"Sorry, I couldn't create that event: {str(e)}")
                yield sse("done")
                return

        files_to_read = plan.get("files_to_read", [])[:8]

        # 3 ── Read files via GitHub API (only what we need)
        yield sse("status", content=f"Reading {len(files_to_read)} files...")
        file_contents = {}
        file_shas = {}
        for fp in files_to_read:
            try:
                content, sha = gh_read_file(repo, fp, req.branch, req.githubToken)
                if len(content) < 15_000:
                    file_contents[fp] = content
                    file_shas[fp] = sha
            except Exception as e:
                print(f"[Agent] Failed to read {fp}: {e}")
        print(f"[Agent] Read {len(file_contents)} files, {sum(len(v) for v in file_contents.values())} chars")

        # 4 ── Edit: generate changes (focused LLM call)
        yield sse("status", content="Generating changes...")
        ctx = "\n\n".join(f"=== {f} ===\n{c}" for f, c in file_contents.items())
        edit_raw = call_llm([
            {"role": "system", "content": EDIT_PROMPT},
            *hist,
            {"role": "user", "content": f"<files>\n{ctx}\n</files>\n\nCurrent page: {req.currentPage}\nRequest: {req.message}{attachment_context}\nPlan: {plan.get('plan','')}"},
        ])
        print(f"[Agent] Edit response: {len(edit_raw)} chars")
        result = parse_json(edit_raw)

        # Handle clarification from editor
        if result.get("clarify"):
            yield sse("message", content=result["clarify"])
            yield sse("done")
            return

        changes = result.get("changes", [])

        if not changes:
            yield sse("message", content="No changes were needed.")
            yield sse("done")
            return

        # Attach original content for revert capability
        for change in changes:
            fp = change["file"]
            if fp in file_contents:
                change["originalContent"] = file_contents[fp]
            # Ensure description exists
            if "description" not in change:
                change["description"] = f"Updated {fp.split('/')[-1]}"

        changed_descriptions = [ch.get("description", "Updated file") for ch in changes]
        yield sse("files_changed", files=changed_descriptions)

        # 5 ── Sync to Droplet for instant preview (but DON'T commit to GitHub yet)
        if req.dropletIp and req.syncToken:
            yield sse("status", content="Syncing preview...")
            try:
                sync_resp = requests.post(
                    f"http://{req.dropletIp}:8080/sync",
                    headers={"Authorization": f"Bearer {req.syncToken}", "Content-Type": "application/json"},
                    json={"changes": [{"file": c["file"], "content": c["content"]} for c in changes]},
                    timeout=30,
                )
                sync_resp.raise_for_status()
                print(f"[Agent] Synced {len(changes)} files to Droplet for preview")
            except Exception as e:
                print(f"[Agent] Droplet sync failed: {e}")

        # 6 ── Send proposed changes (user must confirm to push to GitHub)
        summary = result.get("summary", "Changes applied successfully.")
        yield sse("message", content=summary)
        yield sse("proposed_changes", changes=changes, summary=summary)
        yield sse("done")

    except Exception as e:
        import traceback
        traceback.print_exc()
        yield sse("message", content=f"Error: {str(e)}")
        yield sse("done")


# ── Confirm: commit proposed changes to GitHub ─────────────────────────

class ConfirmRequest(BaseModel):
    changes: list[dict]
    message: str = "Apply changes"
    githubUrl: str
    githubToken: str
    branch: str = "main"

def confirm_changes(req: ConfirmRequest) -> dict:
    """Commit confirmed changes to GitHub."""
    repo = _parse_repo(req.githubUrl)
    # Strip originalContent before committing (not needed for GitHub)
    clean_changes = [{"file": c["file"], "content": c["content"]} for c in req.changes]
    gh_commit_changes(
        repo=repo,
        branch=req.branch,
        token=req.githubToken,
        changes=clean_changes,
        message=f"lightly: {req.message[:60]}",
    )
    return {"ok": True, "files": [c["file"] for c in req.changes]}


# ── Revert: sync original content back to Droplet ──────────────────────

class RevertRequest(BaseModel):
    changes: list[dict]  # [{"file": "path", "content": "originalContent"}]
    dropletIp: str
    syncToken: str

def revert_changes(req: RevertRequest) -> dict:
    """Revert files on the Droplet to their original content."""
    try:
        sync_resp = requests.post(
            f"http://{req.dropletIp}:8080/sync",
            headers={
                "Authorization": f"Bearer {req.syncToken}",
                "Content-Type": "application/json",
            },
            json={"changes": req.changes},
            timeout=30,
        )
        sync_resp.raise_for_status()
        print(f"[Agent] Reverted {len(req.changes)} files on Droplet")
        return {"ok": True}
    except Exception as e:
        print(f"[Agent] Revert failed: {e}")
        return {"ok": False, "error": str(e)}
