"""
AI Agent for Lightly — explores codebase, makes changes via GitHub API, triggers DO redeploy.
Uses DigitalOcean GenAI for LLM inference.
Token-optimized: 2-pass approach (plan files → edit files).
No git clone needed — pure GitHub REST API (like sparkles.dev / Replit).

Service integrations: Gmail + Google Calendar + Slack
Tokens are passed directly from the Next.js frontend (stored in DB, no Token Vault needed).
"""

import os
import json
import base64
import requests
from pydantic import BaseModel
from gmail_service import GmailService
from calendar_service import CalendarService
from tasks_service import TasksService
from notion_service import NotionService
from linear_service import LinearService
from datetime import datetime
from typing import Optional

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
    # Service tokens — passed directly from the DB, no Token Vault needed
    googleAccessToken: Optional[str] = None
    slackAccessToken: Optional[str] = None
    slackChannelId: Optional[str] = None
    notionAccessToken: Optional[str] = None
    notionPageId: Optional[str] = None
    linearAccessToken: Optional[str] = None
    linearProjectId: Optional[str] = None
    linearTeamId: Optional[str] = None

# ── Prompts (kept short for token efficiency) ───────────────────────────

PLAN_PROMPT = (
    "You are an AI Workspace Assistant. You have these capabilities:\n"
    "1. **Code Editing**: Analyzing and modifying the project's source code.\n"
    "2. **Gmail**: Search, read, send, and reply.\n"
    "3. **Calendar**: Search, list, and create events.\n"
    "4. **Tasks**: List, create, and update tasks.\n\n"
    "CRITICAL: For any action that MODIFIES user data (Send, Create, Update, Reply), you MUST first use a `_propose` tool call "
    "and wait for the user to click the confirm button. "
    "Even if a service is ❌ (not connected), you MUST still output the JSON tool call (e.g., `gmail_search`, `slack_send_propose`) "
    "and the system will show the login prompt. NEVER respond with plain text explaining why you can't do it.\n\n"
    "Determine the best action (JSON only):\n"
    "─── GMAIL TOOLS ───\n"
    "Search: {\"gmail_search\": {\"query\": \"...\"}}\n"
    "Read: {\"gmail_read\": {\"message_id\": \"id\"}}\n"
    "Send (Propose): {\"gmail_send_propose\": {\"to\": \"...\", \"subject\": \"...\", \"body\": \"...\"}}\n\n"
    "─── CALENDAR TOOLS ───\n"
    "Search/List: {\"calendar_list\": {\"max_results\": 10}}\n"
    "Create (Propose): {\"calendar_create_propose\": {\"summary\": \"...\", \"start_time\": \"ISO-8601\", \"description\": \"...\"}}\n\n"
    "─── SLACK TOOLS ───\n"
    "Send (Propose): {\"slack_send_propose\": {\"channel\": \"general\", \"text\": \"...\"}}\n\n"
    "─── NOTION TOOLS ───\n"
    "Search: {\"notion_search\": {\"query\": \"...\"}}\n"
    "Add Note: {\"notion_add_note_propose\": {\"title\": \"...\", \"content\": \"markdown content\"}}\n\n"
    "─── TASKS TOOLS ───\n"
    "List: {\"tasks_list\": {}}\n"
    "Create (Propose): {\"tasks_create_propose\": {\"title\": \"...\"}}\n"
    "Update: {\"tasks_update\": {\"task_id\": \"...\", \"status\": \"completed\"}}\n\n"
    "─── CODE TOOL ───\n"
    "Pick files: {\"files_to_read\": [\"path\"], \"plan\": \"brief plan\"}\n\n"
    "Clarify/Chat: {\"clarify\": \"question\", \"plan\": \"\"}"
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
        if any(path.startswith(d) or f"/{d}" in path for d in skip_dirs):
            continue
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
    """Commit multiple file changes in a single commit using GitHub Git Data API."""
    headers = _gh_headers(token)
    base = f"https://api.github.com/repos/{repo}"

    ref_resp = requests.get(f"{base}/git/refs/heads/{branch}", headers=headers, timeout=30)
    ref_resp.raise_for_status()
    current_sha = ref_resp.json()["object"]["sha"]

    commit_resp = requests.get(f"{base}/git/commits/{current_sha}", headers=headers, timeout=30)
    commit_resp.raise_for_status()
    base_tree_sha = commit_resp.json()["tree"]["sha"]

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

    tree_resp = requests.post(f"{base}/git/trees", headers=headers, timeout=30,
        json={"base_tree": base_tree_sha, "tree": tree_items})
    tree_resp.raise_for_status()
    new_tree_sha = tree_resp.json()["sha"]

    commit_create = requests.post(f"{base}/git/commits", headers=headers, timeout=30,
        json={"message": message, "tree": new_tree_sha, "parents": [current_sha]})
    commit_create.raise_for_status()
    new_commit_sha = commit_create.json()["sha"]

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


def parse_json(text: str) -> dict:
    """Parse JSON from LLM response, handles markdown fences and plain text fallbacks."""
    try:
        text = text.strip()
        if "```json" in text:
            text = text.split("```json")[-1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        
        if not text.startswith("{"):
            idx = text.find("{")
            if idx != -1:
                text = text[idx:]
        
        # If it still doesn't look like JSON, wrap it as a clarify message
        if not text.startswith("{"):
            return {"clarify": text, "plan": ""}
            
        return json.loads(text)
    except Exception as e:
        print(f"[Agent] JSON parse failed on: {text[:200]}... Error: {e}")
        return {"clarify": text, "plan": ""}


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

# ── Gmail tool handlers ────────────────────────────────────────────────

def handle_gmail_search(req, plan, hist):
    """Search Gmail and summarize results."""
    if not req.googleAccessToken:
        yield sse("message", 
            content="⚠️ Google is not connected. Please connect your Google account to search and send emails.",
            actions=[{"label": "Connect Google", "url": "/api/auth/connect?connection=google-oauth2", "icon": "external"}]
        )
        yield sse("done")
        return

    query = plan["gmail_search"].get("query", "")
    limit = plan["gmail_search"].get("max_results", 5)
    yield sse("status", content=f"Searching Gmail for '{query}'...")
    
    try:
        gmail = GmailService(req.googleAccessToken)
        threads = gmail.search_threads(query, limit)
        if not threads:
            yield sse("message", content=f"I couldn't find any emails matching '{query}'.")
            yield sse("done")
            return

        yield sse("status", content=f"Summarizing {len(threads)} email(s)...")
        summary = call_llm([
            {"role": "system", "content": "You are a professional Gmail assistant. Summarize the following email threads concisely. Format with bullet points and bold important info."},
            *hist,
            {"role": "user", "content": f"Threads found:\n{json.dumps(threads, indent=2)}\n\nUser request: {req.message}"},
        ])
        yield sse("message", 
            content=summary,
            actions=[{"label": "View in Gmail", "url": f"https://mail.google.com/mail/u/0/#search/{query.replace(' ', '+')}", "icon": "email", "tab": "gmail"}]
        )
    except Exception as e:
        print(f"[Agent] Gmail Search Error: {e}")
        yield sse("message", content=f"Sorry, I couldn't search your Gmail: {str(e)}")
    yield sse("done")


def handle_gmail_read(req, plan, hist):
    """Read a specific email."""
    if not req.googleAccessToken:
        yield sse("message", 
            content="⚠️ Google is not connected. Please connect your account to read emails.",
            actions=[{"label": "Connect Google", "url": "/api/auth/connect?connection=google-oauth2", "icon": "external"}]
        )
        yield sse("done")
        return

    msg_id = plan["gmail_read"].get("message_id", "")
    yield sse("status", content="Reading email...")
    
    try:
        gmail = GmailService(req.googleAccessToken)
        message = gmail.get_message(msg_id)
        yield sse("message", content=f"**{message['subject']}**\nFrom: {message['from']}\nDate: {message.get('date','')}\n\n{message['snippet']}")
    except Exception as e:
        yield sse("message", content=f"Sorry, I couldn't read that email: {str(e)}")
    yield sse("done")


def handle_gmail_send_propose(req, plan, hist):
    """Propose sending an email."""
    details = plan["gmail_send_propose"]
    to = details.get("to", "")
    subject = details.get("subject", "")
    body = details.get("body", "")
    
    yield sse("message", 
        content=f"I've prepared this email for you:\n\n**To:** {to}\n**Subject:** {subject}\n\n{body}",
        actions=[{
            "label": "Send Email", 
            "icon": "email", 
            "tab": "gmail",
            "confirmAction": "gmail_send", 
            "params": {"to": to, "subject": subject, "body": body}
        }]
    )
    yield sse("done")

def handle_gmail_send(req, plan, hist):
    """Actually send the email after confirmation."""
    if not req.googleAccessToken:
        yield sse("message", 
            content="⚠️ Google is not connected. Please connect your account to send emails.",
            actions=[{"label": "Connect Google", "url": "/api/auth/connect?connection=google-oauth2", "icon": "external"}]
        )
        yield sse("done")
        return

    details = plan["gmail_send"]
    to = details.get("to")
    subject = details.get("subject")
    body = details.get("body")
    
    yield sse("status", content=f"Sending email to {to}...")
    try:
        gmail = GmailService(req.googleAccessToken)
        result = gmail.send_message(to, subject, body)
        msg_id = result.get("id", "")
        gmail_url = f"https://mail.google.com/mail/u/0/#inbox/{msg_id}" if msg_id else "https://mail.google.com/mail/u/0/#sent"
        
        yield sse("message", 
            content=f"✅ Email sent successfully to **{to}**.",
            actions=[{"label": "View in Gmail", "url": gmail_url, "icon": "email", "tab": "gmail"}]
        )
    except Exception as e:
        yield sse("message", content=f"Failed to send email: {str(e)}")
    yield sse("done")


def handle_gmail_reply_propose(req, plan, hist):
    """Propose replying to an email."""
    msg_id = plan["gmail_reply_propose"].get("message_id", "")
    body = plan["gmail_reply_propose"].get("body", "")
    
    yield sse("status", content="Preparing reply...")
    try:
        gmail = GmailService(req.googleAccessToken)
        original = gmail.get_message(msg_id)
        to = original["from"]
        subject = f"Re: {original['subject']}"
        
        yield sse("message", 
            content=f"I've prepared a reply to **{to}**:\n\n**Subject:** {subject}\n\n{body}",
            actions=[{
                "label": "Send Reply", 
                "icon": "email", 
                "tab": "gmail",
                "confirmAction": "gmail_send", 
                "params": {"to": to, "subject": subject, "body": body, "thread_id": msg_id}
            }]
        )
    except Exception as e:
        yield sse("message", content=f"Failed to prepare reply: {str(e)}")
    yield sse("done")


# ── Calendar tool handlers ─────────────────────────────────────────────

def handle_calendar_search(req, plan, hist):
    """Search calendar events."""
    if not req.googleAccessToken:
        yield sse("message", 
            content="⚠️ Google is not connected. Connect your account to search your calendar.",
            actions=[{"label": "Connect Google", "url": "/api/auth/connect?connection=google-oauth2", "icon": "calendar"}]
        )
        yield sse("done")
        return

    query = plan["calendar_search"].get("query", "")
    yield sse("status", content=f"Checking your calendar for '{query}'...")
    
    try:
        calendar = CalendarService(req.googleAccessToken)
        events = calendar.search_events(query)
        if not events:
            yield sse("message", content=f"I couldn't find any calendar events matching '{query}'.")
            yield sse("done")
            return

        yield sse("status", content=f"Summarizing {len(events)} event(s)...")
        summary = call_llm([
            {"role": "system", "content": "You are a professional Calendar assistant. Summarize the following calendar events concisely. Use bullet points and format dates nicely."},
            *hist,
            {"role": "user", "content": f"Events found:\n{json.dumps(events, indent=2)}\n\nUser request: {req.message}"},
        ])
        yield sse("message", 
            content=summary,
            actions=[{"label": "Open Calendar", "url": f"https://calendar.google.com/calendar/u/0/r/search?q={query.replace(' ', '+')}", "icon": "calendar", "tab": "calendar"}]
        )
    except Exception as e:
        yield sse("message", content=f"Sorry, I couldn't access your Calendar: {str(e)}")
    yield sse("done")


def handle_calendar_list(req, plan, hist):
    """List upcoming events."""
    if not req.googleAccessToken:
        yield sse("message", 
            content="⚠️ Google is not connected. Connect your Google account to see upcoming events.",
            actions=[{"label": "Connect Google", "url": "/api/auth/connect?connection=google-oauth2", "icon": "calendar"}]
        )
        yield sse("done")
        return

    max_results = plan["calendar_list"].get("max_results", 10)
    yield sse("status", content="Fetching upcoming events...")
    
    try:
        calendar = CalendarService(req.googleAccessToken)
        events = calendar.list_events(max_results=max_results)
        if not events:
            yield sse("message", content="Your calendar looks clear.")
            yield sse("done")
            return

        yield sse("status", content=f"Summarizing {len(events)} event(s)...")
        summary = call_llm([
            {"role": "system", "content": "You are a professional Calendar assistant. Present the following upcoming events in a clear, organized format. Use bullet points and format dates nicely."},
            *hist,
            {"role": "user", "content": f"Upcoming events:\n{json.dumps(events, indent=2)}\n\nUser request: {req.message}"},
        ])
        yield sse("message", 
            content=summary,
            actions=[{"label": "Open Calendar", "url": "https://calendar.google.com/calendar/u/0/r", "icon": "calendar", "tab": "calendar"}]
        )
    except Exception as e:
        yield sse("message", content=f"Sorry, I couldn't access your Calendar: {str(e)}")
    yield sse("done")


def handle_calendar_create_propose(req, plan, hist):
    """Propose creating a calendar event."""
    details = plan["calendar_create_propose"]
    summary = details.get("summary", "")
    start = details.get("start_time", "")
    desc = details.get("description", "")
    
    yield sse("message", 
        content=f"I've drafted a calendar event for you:\n\n**Event:** {summary}\n**Time:** {start}\n**Description:** {desc}",
        actions=[{
            "label": "Add to Calendar", 
            "icon": "calendar", 
            "tab": "calendar",
            "confirmAction": "calendar_create", 
            "params": {"summary": summary, "start_time": start, "description": desc}
        }]
    )
    yield sse("done")

def handle_calendar_create(req, plan, hist):
    """Actually create the event after confirmation."""
    if not req.googleAccessToken:
        yield sse("message", 
            content="⚠️ Google is not connected. Please connect your account to create events.",
            actions=[{"label": "Connect Google", "url": "/api/auth/connect?connection=google-oauth2", "icon": "calendar"}]
        )
        yield sse("done")
        return

    details = plan["calendar_create"]
    yield sse("status", content=f"Adding '{details.get('summary')}' to your calendar...")
    
    try:
        cal = CalendarService(req.googleAccessToken)
        result = cal.create_event(
            summary=details.get("summary"),
            start_time=details.get("start_time"),
            description=details.get("description", "")
        )
        yield sse("message", 
            content=f"✅ Event successfully added: **{details.get('summary')}**.",
            actions=[{"label": "View in Calendar", "url": result.get("htmlLink", "https://calendar.google.com"), "icon": "calendar", "tab": "calendar"}]
        )
    except Exception as e:
        yield sse("message", content=f"Failed to create event: {str(e)}")
    yield sse("done")


# ── Tasks tool handlers ────────────────────────────────────────────────

def handle_tasks_list(req, plan, hist):
    """List Google Tasks."""
    if not req.googleAccessToken:
        yield sse("message", 
            content="⚠️ Google is not connected. Connect your Google account to manage your tasks.",
            actions=[{"label": "Connect Google", "url": "/api/auth/connect?connection=google-oauth2", "icon": "external"}]
        )
        yield sse("done")
        return

    yield sse("status", content="Fetching your to-do list...")
    try:
        tasks_svc = TasksService(req.googleAccessToken)
        tasks = tasks_svc.list_tasks(show_completed=False)
        if not tasks:
            yield sse("message", content="You have no pending tasks! ✨")
            yield sse("done")
            return

        yield sse("status", content=f"Summarizing {len(tasks)} task(s)...")
        summary = call_llm([
            {"role": "system", "content": "You are a professional assistant. Present the user's tasks in a clear list. Group by due date if possible."},
            *hist,
            {"role": "user", "content": f"Tasks found:\n{json.dumps(tasks, indent=2)}\n\nUser request: {req.message}"},
        ])
        yield sse("message", content=summary)
    except Exception as e:
        yield sse("message", content=f"Sorry, I couldn't access your tasks: {str(e)}")
    yield sse("done")

def handle_tasks_create_propose(req, plan, hist):
    """Propose creating a task."""
    details = plan["tasks_create_propose"]
    title = details.get("title", "")
    
    yield sse("message", 
        content=f"I've drafted a new task for you:\n\n**Task:** {title}",
        actions=[{
            "label": "Add Task", 
            "icon": "external", 
            "confirmAction": "tasks_create", 
            "params": {"title": title}
        }]
    )
    yield sse("done")

def handle_tasks_create(req, plan, hist):
    """Actually create the task after confirmation."""
    if not req.googleAccessToken:
        yield sse("message", 
            content="⚠️ Google is not connected. Please connect your account to create tasks.",
            actions=[{"label": "Connect Google", "url": "/api/auth/connect?connection=google-oauth2", "icon": "external"}]
        )
        yield sse("done")
        return

    details = plan["tasks_create"]
    yield sse("status", content=f"Adding task '{details.get('title')}'...")
    
    try:
        tasks_svc = TasksService(req.googleAccessToken)
        tasks_svc.create_task(title=details.get('title'))
        yield sse("message", content=f"✅ Task created successfully: **{details.get('title')}**.")
    except Exception as e:
        yield sse("message", content=f"Failed to create task: {str(e)}")
    yield sse("done")


def handle_notion_search(req, plan, hist):
    """Search Notion pages."""
    if not req.notionAccessToken:
        yield sse("message", 
            content="⚠️ Notion is not connected. Please connect your account to search pages.",
            actions=[{"label": "Connect Notion", "url": "/api/auth/connect?connection=notion", "icon": "external"}]
        )
        yield sse("done")
        return

    query = plan["notion_search"].get("query", "")
    yield sse("status", content=f"Searching Notion for '{query}'...")
    try:
        notion = NotionService(req.notionAccessToken)
        results = notion.search(query)
        yield sse("message", content=f"I found {len(results)} pages matching '{query}'.", 
                  actions=[{"label": "View Results", "url": results[0]["url"] if results else "https://notion.so"}] )
    except Exception as e:
        yield sse("message", content=f"Sorry, I couldn't search Notion: {str(e)}")
    yield sse("done")

def handle_notion_add_note_propose(req, plan, hist):
    """Propose adding a note to Notion."""
    details = plan["notion_add_note_propose"]
    title = details.get("title", "")
    content = details.get("content", "")
    
    yield sse("message", 
        content=f"I'll add this note to your Notion project page:\n\n**Title:** {title}\n\n{content}",
        actions=[{
            "label": "Add Note", 
            "icon": "notion", 
            "tab": "notion",
            "confirmAction": "notion_add_note", 
            "params": {"title": title, "content": content}
        }]
    )
    yield sse("done")

def handle_notion_add_note(req, plan, hist):
    """Actually add the note to the project's Notion page."""
    if not req.notionAccessToken:
        yield sse("message", 
            content="⚠️ Notion is not connected.",
            actions=[{"label": "Connect Notion", "url": "/api/auth/connect?connection=notion", "icon": "external"}]
        )
        yield sse("done")
        return
        
    if not req.notionPageId:
        yield sse("message", content="⚠️ Notion project page is not initialized. Please set it up in the Notion tab.")
        yield sse("done")
        return

    details = req.message.split(" ", 2)[2] if req.message.startswith("Confirmed: ") else json.dumps(plan["notion_add_note"])
    params = json.loads(details)
    
    yield sse("status", content="Adding note to Notion...")
    try:
        notion = NotionService(req.notionAccessToken)
        page = notion.create_page(
            parent_id=req.notionPageId,
            title=params.get("title"),
            content=params.get("content", "")
        )
        yield sse("message", 
            content=f"✅ Note added successfully: **{params.get('title')}**.",
            actions=[{"label": "View in Notion", "url": page.get("url", "https://notion.so"), "icon": "notion", "tab": "notion"}]
        )
    except Exception as e:
        yield sse("message", content=f"Failed to add note: {str(e)}")
    yield sse("done")


# ── Slack tool handlers ────────────────────────────────────────────────

def handle_slack_send_propose(req, plan, hist):
    """Propose sending a Slack message."""
    details = plan["slack_send_propose"]
    channel = details.get("channel", "general")
    text = details.get("text", "")
    
    yield sse("message", 
        content=f"I'll send this message to Slack (**#{channel}**):\n\n{text}",
        actions=[{
            "label": "Send Message", 
            "icon": "slack", 
            "tab": "slack",
            "confirmAction": "slack_send", 
            "params": {"channel": channel, "text": text}
        }]
    )
    yield sse("done")

def handle_slack_send(req, plan, hist):
    """Actually send the Slack message."""
    if not req.slackAccessToken:
        yield sse("message", 
            content="⚠️ Your Slack account is not connected. Please connect to continue.",
            actions=[{
                "label": "Connect Slack", 
                "icon": "slack", 
                "url": "/api/auth/connect?connection=slack"
            }]
        )
        yield sse("done")
        return
        
    details = plan["slack_send"]
    channel = details.get("channel")
    text = details.get("text")
    
    yield sse("status", content=f"Sending message to #{channel}...")
    try:
        from slack_service import SlackService
        slack = SlackService(req.slackAccessToken)
        slack.post_message(channel, text)
        yield sse("message", 
            content=f"✅ Message sent successfully to **#{channel}**.",
            actions=[{"label": "View in Slack", "tab": "slack", "icon": "slack"}]
        )
    except Exception as e:
        yield sse("message", content=f"Failed to send Slack message: {str(e)}")
    yield sse("done")


# ── Linear search/etc handlers ───────────────────────────────────────────

def handle_linear_search(req, plan, hist):
    """Search Linear issues."""
    if not req.linearAccessToken:
        yield sse("message", 
            content="⚠️ Linear is not connected. Please connect your account to search issues.",
            actions=[{"label": "Connect Linear", "url": "/api/auth/connect?connection=linear", "icon": "linear"}]
        )
        yield sse("done")
        return

    query = plan["linear_search"].get("query", "")
    yield sse("status", content=f"Searching Linear for '{query}'...")
    try:
        linear = LinearService(req.linearAccessToken)
        issues = linear.search_issues(query)
        if not issues:
            yield sse("message", content=f"No Linear issues found matching '{query}'.")
            yield sse("done")
            return
            
        summary = call_llm([
            {"role": "system", "content": "You are a professional project manager. Summarize the following Linear issues concisely."},
            *hist,
            {"role": "user", "content": f"Issues found:\n{json.dumps(issues, indent=2)}\n\nUser request: {req.message}"},
        ])
        yield sse("message", content=summary, actions=[{"label": "View Linear Board", "tab": "linear", "icon": "linear"}])
    except Exception as e:
        yield sse("message", content=f"Sorry, I couldn't search Linear: {str(e)}")
    yield sse("done")


def handle_linear_create_propose(req, plan, hist):
    """Propose creating a Linear issue."""
    details = plan["linear_create_propose"]
    title = details.get("title", "")
    description = details.get("description", "")
    
    yield sse("message", 
        content=f"I'll create a Linear issue for this:\n\n**Title:** {title}\n{description}",
        actions=[{
            "label": "Create Issue", 
            "icon": "linear", 
            "tab": "linear",
            "confirmAction": "linear_create", 
            "params": {"title": title, "description": description}
        }]
    )
    yield sse("done")

def handle_linear_create(req, plan, hist):
    """Actually create the Linear issue."""
    if not req.linearAccessToken:
        yield sse("message", 
            content="⚠️ Your Linear account is not connected. Please connect to continue.",
            actions=[{
                "label": "Connect Linear", 
                "icon": "linear", 
                "url": f"/api/auth/connect?connection=linear"
            }]
        )
        yield sse("done")
        return
    
    if not req.linearTeamId:
        yield sse("message", content="⚠️ Linear is not properly configured for this project. Please select a team in the Linear tab.")
        yield sse("done")
        return

    details = req.message.split(" ", 2)[2] if req.message.startswith("Confirmed: ") else json.dumps(plan["linear_create"])
    params = json.loads(details)
    
    yield sse("status", content="Creating Linear issue...")
    try:
        linear = LinearService(req.linearAccessToken)
        issue = linear.create_issue(
            team_id=req.linearTeamId,
            title=params.get("title"),
            description=params.get("description", ""),
            project_id=req.linearProjectId
        )
        yield sse("message", 
            content=f"✅ Issue created: **{issue['identifier']} - {issue['title']}**",
            actions=[{"label": "View in Linear", "url": issue["url"], "icon": "linear", "tab": "linear"}]
        )
    except Exception as e:
        yield sse("message", content=f"Failed to create issue: {str(e)}")
    yield sse("done")

def handle_linear_move_issue_propose(req, plan, hist):
    """Propose moving a Linear issue."""
    details = plan["linear_move_issue"]
    issue_id = details.get("issue_id")
    state_id = details.get("state_id")
    
    yield sse("message", 
        content=f"Should I move issue {issue_id} to the new state?",
        actions=[{
            "label": "Move Issue", 
            "icon": "linear", 
            "tab": "linear",
            "confirmAction": "linear_move_issue", 
            "params": {"issue_id": issue_id, "state_id": state_id}
        }]
    )
    yield sse("done")

def handle_linear_move_issue(req, plan, hist):
    """Actually move a Linear issue."""
    if not req.linearAccessToken:
        yield sse("message", 
            content="⚠️ Your Linear account is not connected.",
            actions=[{
                "label": "Connect Linear", 
                "icon": "linear", 
                "url": f"/api/auth/connect?connection=linear"
            }]
        )
        yield sse("done")
        return

    details = req.message.split(" ", 2)[2] if req.message.startswith("Confirmed: ") else json.dumps(plan["linear_move_issue"])
    params = json.loads(details)
    
    yield sse("status", content="Moving issue...")
    try:
        linear = LinearService(req.linearAccessToken)
        issue = linear.update_issue_state(params["issue_id"], params["state_id"])
        yield sse("message", content=f"✅ Issue **{issue['title']}** moved to **{issue['state']['name']}**.")
    except Exception as e:
        yield sse("message", content=f"Failed to move issue: {str(e)}")
    yield sse("done")

def handle_linear_list_board(req, plan, hist):
    """List issues on the project board."""
    if not req.linearAccessToken:
        yield sse("message", 
            content="⚠️ Your Linear account is not connected.",
            actions=[{
                "label": "Connect Linear", 
                "icon": "linear", 
                "url": f"/api/auth/connect?connection=linear"
            }]
        )
        yield sse("done")
        return

    if not req.linearProjectId:
        yield sse("message", content="⚠️ Linear project is not initialized for this project. Please set it up in the Linear tab.")
        yield sse("done")
        return

    yield sse("status", content="Fetching board...")
    try:
        linear = LinearService(req.linearAccessToken)
        issues = linear.list_project_issues(req.linearProjectId)
        
        summary = call_llm([
            {"role": "system", "content": "Summarize the Linear board state. Group issues by their workflow state concisely."},
            *hist,
            {"role": "user", "content": f"Issues found in Linear project:\n{json.dumps(issues, indent=2)}\n\nSummarize these for the user."}
        ])
        yield sse("message", content=summary, actions=[{"label": "View Board", "tab": "linear", "icon": "linear"}])
    except Exception as e:
        yield sse("message", content=f"Failed to fetch board: {str(e)}")
    yield sse("done")

def handle_tasks_update(req, plan, hist):
    """Update task status."""
    if not req.googleAccessToken:
        yield sse("message", 
            content="⚠️ Google is not connected. Please connect your account to update tasks.",
            actions=[{"label": "Connect Google", "url": "/api/auth/connect?connection=google-oauth2", "icon": "external"}]
        )
        yield sse("done")
        return
    details = plan["tasks_update"]
    yield sse("status", content="Updating task status...")
    try:
        tasks_svc = TasksService(req.googleAccessToken)
        task = tasks_svc.update_task(
            task_id=details.get("task_id"),
            status=details.get("status"),
        )
        status_text = "completed" if task.get("status") == "completed" else "needs action"
        yield sse("message", content=f"✅ Task **{task.get('title')}** marked as {status_text}.")
    except Exception as e:
        yield sse("message", content=f"Sorry, I couldn't update that task: {str(e)}")
    yield sse("done")


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

        # 0 ── Intercept confirmed actions (bypass LLM planning)
        if req.message.startswith("Confirmed: "):
            try:
                # Format: "Confirmed: action_name {JSON_params}"
                parts = req.message.split(" ", 2)
                action_name = parts[1]
                params = json.loads(parts[2])
                plan = {action_name: params}
                print(f"[Agent] Processing confirmed action: {action_name}")
                
                # Manual routing for confirmed actions
                if action_name == "gmail_send":
                    yield from handle_gmail_send(req, plan, [])
                elif action_name == "calendar_create":
                    yield from handle_calendar_create(req, plan, [])
                elif action_name == "tasks_create":
                    yield from handle_tasks_create(req, plan, [])
                elif action_name == "notion_add_note":
                    yield from handle_notion_add_note(req, plan, [])
                elif action_name == "linear_create":
                    yield from handle_linear_create(req, plan, [])
                elif action_name == "linear_move_issue":
                    yield from handle_linear_move_issue(req, plan, [])
                elif action_name == "slack_send":
                    yield from handle_slack_send(req, plan, [])
                return
            except Exception as e:
                print(f"[Agent] Confirmation failed: {e}")
                # Fall through to normal planning if intercept fails

        # Build context about available services
        services_context = "\n\nAvailable services for this user:"
        if req.googleAccessToken:
            services_context += "\n- ✅ Gmail (connected)"
            services_context += "\n- ✅ Google Calendar (connected)"
            services_context += "\n- ✅ Google Tasks (connected)"
        else:
            services_context += "\n- ❌ Google (not connected)"
            
        if req.notionAccessToken:
            services_context += "\n- ✅ Notion (connected)"
        else:
            services_context += "\n- ❌ Notion (not connected)"

        if req.linearAccessToken:
            services_context += "\n- ✅ Linear (connected)"
        else:
            services_context += "\n- ❌ Linear (not connected)"

        if req.slackAccessToken:
            services_context += "\n- ✅ Slack (connected)"
        else:
            services_context += "\n- ❌ Slack (not connected)"

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
            {"role": "user", "content": f"Context: Today is {datetime.utcnow().strftime('%A, %Y-%m-%d %H:%M:%S UTC')}.{services_context}\nFile tree:\n{tree}\n\nCurrent page: {req.currentPage}\nRequest: {req.message}{attachment_context}"},
        ])
        print(f"[Agent] Plan: {plan_raw[:200]}")
        plan = parse_json(plan_raw)

        # Handle clarification from planner
        if plan.get("clarify"):
            yield sse("message", content=plan["clarify"])
            yield sse("done")
            return

        # ── Route to service handlers ──
        if "gmail_search" in plan:
            yield from handle_gmail_search(req, plan, hist)
            return
        if "gmail_read" in plan:
            yield from handle_gmail_read(req, plan, hist)
            return
        if "gmail_send_propose" in plan:
            yield from handle_gmail_send_propose(req, plan, hist)
            return
        if "gmail_reply_propose" in plan:
            yield from handle_gmail_reply_propose(req, plan, hist)
            return
        if "calendar_search" in plan:
            yield from handle_calendar_search(req, plan, hist)
            return
        if "calendar_list" in plan:
            yield from handle_calendar_list(req, plan, hist)
            return
        if "calendar_create_propose" in plan:
            yield from handle_calendar_create_propose(req, plan, hist)
            return
        if "tasks_list" in plan:
            yield from handle_tasks_list(req, plan, hist)
            return
        if "tasks_create_propose" in plan:
            yield from handle_tasks_create_propose(req, plan, hist)
            return
        if "slack_send_propose" in plan:
            yield from handle_slack_send_propose(req, plan, hist)
            return
        if "notion_search" in plan:
            yield from handle_notion_search(req, plan, hist)
            return
        if "notion_add_note_propose" in plan:
            yield from handle_notion_add_note_propose(req, plan, hist)
            return
        if "linear_search" in plan:
            yield from handle_linear_search(req, plan, hist)
            return
        if "linear_create_propose" in plan:
            yield from handle_linear_create_propose(req, plan, hist)
            return
        if "linear_move_issue" in plan:
            yield from handle_linear_move_issue_propose(req, plan, hist)
            return
        if "linear_list_board" in plan:
            yield from handle_linear_list_board(req, plan, hist)
            return
        if "notion_add_note" in plan:
            yield from handle_notion_add_note(req, plan, hist)
            return
        if "calendar_create" in plan:
            yield from handle_calendar_create(req, plan, hist)
            return
        if "tasks_list" in plan:
            yield from handle_tasks_list(req, plan, hist)
            return
        if "tasks_create" in plan:
            yield from handle_tasks_create(req, plan, hist)
            return
        if "tasks_update" in plan:
            yield from handle_tasks_update(req, plan, hist)
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
