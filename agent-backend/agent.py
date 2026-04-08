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

# ── Prompts ──────────────────────────────────────────────────────────────

PLAN_PROMPT = (
    "You are Lightly, a specialized AI workspace and coding agent. You help users manage their project across 6 areas: Gmail, Notion, Linear, Slack, Google Calendar, and CODING (development).\n\n"
    "RESPOND WITH EXACTLY ONE JSON OBJECT. No markdown fences, no explanation, no text before or after the JSON.\n\n"
    "## Service Mapping Rules (STRICT):\n"
    "1. TASKS / PROJECT WORKFLOW / ASSIGNMENTS -> Linear ONLY. Map states like 'Todo', 'In Progress', 'Done'.\n"
    "2. NOTES / SUMMARIES / SPECS / KNOWLEDGE -> Notion ONLY.\n"
    "3. EVENTS / SCHEDULING / CALENDAR -> Google Calendar ONLY.\n"
    "4. EMAILS / EXTERNAL COMMUNICATION -> Gmail ONLY.\n"
    "5. CHAT / TEAM COMMUNICATION -> Slack ONLY.\n"
    "6. PROJECT CODE / UI CHANGES / BUG FIXES -> CODING. Use `files_to_read` to examine relevant files.\n\n"
    "## Semantic Intent Rules:\n"
    "1. Pick the SINGLE best service. If you need to search for something to act, use `search` or `list` first.\n"
    "2. If requested to 'Add task to In Progress', find the 'In Progress' state ID from board context and use it in `linear_create_propose`.\n"
    "3. RICH MENTIONS: Use `[notion:Title|URL]` or `[linear:Title|URL]` when referencing items you found. Example: 'I've added the [linear:Fix Header Bug|https://linear.app/...] task.'\n"
    "4. NOTION NOTES: Use CLEAN MARKDOWN (## for headings, - for bullets, **bold**) in the `content` field. DO NOT wrap the content in extra quotes, apostrophes, or code blocks (` ``` `) within the JSON string.\n\n"
    "## Generic Scoping Rules:\n"
    "1. Pick the SINGLE best tool for the user's request.\n"
    "2. CRITICAL: If a service is NOT CONNECTED, you MUST STILL output the tool call JSON. The system will then automatically show a 'Connect' button for the user. NEVER say you cannot access a service with plain text.\n"
    "3. For WRITE actions (send, create, post, add, move), always use the `_propose` variant so the user can confirm.\n\n"
    "## Tools (return ONE)\n\n"
    "CODING:\n"
    '  {"files_to_read": ["path/to/file.tsx"], "plan": "technical explanation of changes"}\n'
    '  {"gh_open_pr_propose": {"title": "...", "body": "PR description"}}\n\n'
    "GMAIL:\n"
    '  {"gmail_search": {"query": "...", "max_results": 5}}\n'
    '  {"gmail_read": {"message_id": "..."}}\n'
    '  {"gmail_send_propose": {"to": "email@example.com", "subject": "...", "body": "full email body"}}\n\n'
    "NOTION:\n"
    '  {"notion_search": {"query": "..."}}\n'
    '  {"notion_add_note_propose": {"title": "...", "content": "## Section\\n- Point 1\\n- **Point 2**"}}\n\n'
    "LINEAR:\n"
    '  {"linear_search": {"query": "..."}}\n'
    '  {"linear_list_board": {}}\n'
    '  {"linear_create_propose": {"title": "...", "description": "...", "state_id": "optional-state-id"}}\n'
    '  {"linear_move_issue_propose": {"issue_id": "...", "state_id": "..."}}\n\n'
    "CALENDAR:\n"
    '  {"calendar_search": {"query": "..."}}\n'
    '  {"calendar_list": {}}\n'
    '  {"calendar_add_event_propose": {"summary": "...", "start_time": "ISO-8601", "end_time": "ISO-8601", "description": "..."}}\n\n'
    "SLACK:\n"
    '  {"slack_list_channels": {}}\n'
    '  {"slack_history": {"channel": "channel-id", "limit": 10}}\n'
    '  {"slack_send_propose": {"channel": "general", "text": "..."}}\n\n'
    "GENERAL:\n"
    '  {"clarify": "your helpful response or question", "plan": ""}\n'

)

EDIT_PROMPT = (
    "You edit source code for a web project. The user is viewing a specific page of their app.\n\n"
    "RESPOND WITH EXACTLY ONE JSON OBJECT. No markdown fences, no text before or after.\n\n"
    "## Rules\n"
    "1. Focus changes on what affects the user's current page unless told otherwise.\n"
    "2. Each change MUST include the COMPLETE file content — never partial snippets or diffs.\n"
    "3. If uploaded images/mockups are referenced, recreate the design using the project's tech stack.\n"
    "4. Preserve all existing functionality unless explicitly asked to remove it.\n"
    "5. Write clean, production-quality code. Follow existing patterns and naming conventions.\n"
    "6. If the request is ambiguous, ask for clarification instead of guessing.\n\n"
    "## Output\n"
    '{"changes": [{"file": "relative/path", "content": "COMPLETE file content", "description": "short visual description"}], "summary": "friendly summary"}\n\n'
    "## description field — keep non-technical and visual:\n"
    "  Good: 'Updated hero background to gradient blue-purple'\n"
    "  Good: 'Added smooth hover animation to cards'\n"
    "  Bad: 'Modified header.tsx line 42'\n\n"
    "## If the request is unclear:\n"
    '{"clarify": "your question", "changes": [], "summary": ""}\n'
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
    return new_commit_sha

def gh_create_pr(repo: str, branch: str, title: str, body: str, token: str) -> dict:
    """Create a Pull Request via GitHub API."""
    url = f"https://api.github.com/repos/{repo}/pulls"
    headers = _gh_headers(token)
    payload = {
        "title": title,
        "body": body,
        "head": branch,
        "base": "main" # or dynamic base if needed
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()

def handle_gh_open_pr_propose(req, plan, hist):
    """Propose opening a Pull Request."""
    details = plan["gh_open_pr_propose"]
    title = details.get("title", "Update Application")
    body = details.get("body", "Applied changes from Lightly workspace.")
    
    yield sse("message", 
        content=f"I've prepared a Pull Request for you:\n\n**Title:** {title}\n\n{body}",
        actions=[{
            "label": "Open Pull Request", 
            "icon": "github", 
            "tab": "coding",
            "confirmAction": "gh_create_pr", 
            "params": {"title": title, "body": body}
        }]
    )
    yield sse("done")

def handle_gh_create_pr(req, plan, hist):
    """Actually create the Pull Request."""
    params = plan.get("gh_create_pr") or {}
    repo = _parse_repo(req.githubUrl)
    try:
        pr = gh_create_pr(repo, req.branch, params.get("title"), params.get("body"), req.githubToken)
        yield sse("message", 
            content=f"🚀 Pull Request created successfully! You can view it here: [PR #{pr['number']}]({pr['html_url']})",
            actions=[{"label": "View PR on GitHub", "url": pr["html_url"], "icon": "github"}]
        )
    except Exception as e:
        yield sse("message", content=f"Failed to create PR: {str(e)}")
    yield sse("done")

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
    if not req.googleAccessToken:
        yield sse("message", 
            content="⚠️ Google is not connected. Please connect your Google account to send emails.",
            actions=[{"label": "Connect Google", "url": "/api/auth/connect?connection=google-oauth2", "icon": "email"}]
        )
        yield sse("done")
        return
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
    
    try:
        gmail = GmailService(req.googleAccessToken)
        result = gmail.send_message(to, subject, body)
        msg_id = result.get("id", "")
        gmail_url = f"https://mail.google.com/mail/u/0/#inbox/{msg_id}" if msg_id else "https://mail.google.com/mail/u/0/#sent"
        
        yield sse("message", 
            content=f"Email sent successfully to **{to}**.",
            actions=[{"label": "View in Gmail", "url": gmail_url, "icon": "email", "tab": "gmail"}]
        )
    except Exception as e:
        yield sse("message", content=f"Failed to send email: {str(e)}")
    yield sse("done")


def handle_gmail_reply_propose(req, plan, hist):
    """Propose replying to an email."""
    if not req.googleAccessToken:
        yield sse("message", 
            content="⚠️ Google is not connected. Please connect your account to reply to emails.",
            actions=[{"label": "Connect Google", "url": "/api/auth/connect?connection=google-oauth2", "icon": "email"}]
        )
        yield sse("done")
        return
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


def handle_calendar_add_event_propose(req, plan, hist):
    details = plan["calendar_add_event_propose"]
    summary = details.get("summary", "")
    start_time = details.get("start_time", "")
    end_time = details.get("end_time", "")
    description = details.get("description", "")
    
    yield sse("message", 
        content=f"I'll add this event to your calendar:\n\n**{summary}**\nTime: {start_time}",
        actions=[{
            "label": "Add Event", 
            "icon": "calendar", 
            "tab": "calendar",
            "confirmAction": "calendar_add_event", 
            "params": {"summary": summary, "start_time": start_time, "end_time": end_time, "description": description}
        }]
    )

def handle_calendar_add_event(req, plan, hist):
    params = plan.get("calendar_add_event") or {}
    action_id = params.get("actionId")
    try:
        if not req.googleAccessToken: raise Exception("Google Calendar not connected")
        cal = CalendarService(req.googleAccessToken)
        event = cal.create_event(
            summary=params.get("summary"),
            start_time=params.get("start_time"),
            end_time=params.get("end_time"),
            description=params.get("description", "")
        )
        
        if action_id:
            yield sse("action_success", id=action_id, url=event.get("htmlLink", "https://calendar.google.com"))
        else:
            yield sse("message", 
                content=f"Event created: **{event.get('summary')}**",
                actions=[{"label": "View in Calendar", "url": event.get("htmlLink"), "icon": "calendar", "tab": "calendar"}]
            )
    except Exception as e:
        yield sse("message", content=f"Failed to create event: {str(e)}")
    yield sse("done")

# ── Notion handlers ───────────────────────────────────────────────────


def handle_notion_search(req, plan, hist):
    """Search Notion pages."""
    if not req.notionAccessToken:
        yield sse("message", 
            content="⚠️ Notion is not connected. Please connect your account to search pages.",
            actions=[{"label": "Connect Notion", "url": "/api/auth/notion", "icon": "notion"}]
        )
        yield sse("done")
        return

    query = plan["notion_search"].get("query", "")
    yield sse("status", content=f"Searching Notion for '{query}'...")
    try:
        notion = NotionService(req.notionAccessToken)
        results = notion.search(query)
        if not results:
            yield sse("message", content=f"I couldn't find any Notion pages matching '{query}'.")
            yield sse("done")
            return

        summary = "**Found these Notion pages:**\n\n"
        for r in results:
            summary += f"- {r['title']}\n"
        
        yield sse("message", content=summary, 
                  actions=[{"label": "View first result", "url": results[0]["url"], "icon": "notion"}] )
    except Exception as e:
        yield sse("message", content=f"Sorry, I couldn't search Notion: {str(e)}")
    yield sse("done")

def handle_notion_add_note_propose(req, plan, hist):
    """Propose adding a note to Notion."""
    if not req.notionAccessToken:
        yield sse("message", 
            content="⚠️ Notion is not connected. Please connect your Notion account first.",
            actions=[{"label": "Connect Notion", "url": "/api/auth/notion", "icon": "notion"}]
        )
        yield sse("done")
        return
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
            content="⚠️ Notion is not connected. Please connect your account to continue.",
            actions=[{"label": "Connect Notion", "url": "/api/auth/notion", "icon": "notion"}]
        )
        yield sse("done")
        return
        
    if not req.notionPageId:
        yield sse("message", content="⚠️ Notion project page is not initialized. Please set it up in the Notion tab.")
        yield sse("done")
        return

    details = req.message.split(" ", 2)[2] if req.message.startswith("Confirmed: ") else json.dumps(plan["notion_add_note"])
    params = json.loads(details)
    
    try:
        notion = NotionService(req.notionAccessToken)
        page = notion.create_page(
            parent_id=req.notionPageId,
            title=params.get("title"),
            content=params.get("content", "")
        )
        
        action_id = params.get("actionId")
        if action_id:
            yield sse("action_success", id=action_id, url=page.get("url", "https://notion.so"))
        else:
            yield sse("message", 
                content=f"Note added successfully: **{params.get('title')}**.",
                actions=[{"label": "View in Notion", "url": page.get("url", "https://notion.so"), "icon": "notion", "tab": "notion"}]
            )
    except Exception as e:
        yield sse("message", content=f"Failed to add note: {str(e)}")
    yield sse("done")


# ── Slack tool handlers ────────────────────────────────────────────────

def handle_slack_send_propose(req, plan, hist):
    """Propose sending a Slack message."""
    if not req.slackAccessToken:
        yield sse("message", 
            content="⚠️ Slack is not connected. Please connect your Slack workspace to send messages.",
            actions=[{"label": "Connect Slack", "url": "/api/auth/slack", "icon": "slack"}]
        )
        yield sse("done")
        return
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
            content="⚠️ Slack is not connected. Please connect your Slack workspace to continue.",
            actions=[{"label": "Connect Slack", "icon": "slack", "url": "/api/auth/slack"}]
        )
        yield sse("done")
        return
        
    details = plan["slack_send"]
    channel = details.get("channel")
    text = details.get("text")
    
    try:
        from slack_service import SlackService
        slack = SlackService(req.slackAccessToken)
        resp = slack.post_message(channel, text)
        
        action_id = details.get("actionId")
        if action_id:
            # Try to get a direct URL if possible, otherwise link to the channel
            url = f"https://slack.com/archives/{channel}"
            yield sse("action_success", id=action_id, url=url)
        else:
            yield sse("message", 
                content=f"Message sent successfully to **#{channel}**.",
                actions=[{"label": "View in Slack", "tab": "slack", "icon": "slack"}]
            )
    except Exception as e:
        yield sse("message", content=f"Failed to send Slack message: {str(e)}")
    yield sse("done")


def handle_slack_list_channels(req, plan, hist):
    """List Slack channels."""
    if not req.slackAccessToken:
        yield sse("message", 
            content="⚠️ Slack is not connected. Please connect your Slack workspace first.",
            actions=[{"label": "Connect Slack", "url": "/api/auth/slack", "icon": "slack"}]
        )
        yield sse("done")
        return

    yield sse("status", content="Fetching Slack channels...")
    try:
        from slack_service import SlackService
        slack = SlackService(req.slackAccessToken)
        channels = slack.list_channels()
        if not channels:
            yield sse("message", content="No channels found in your Slack workspace.")
            yield sse("done")
            return

        summary = call_llm([
            {"role": "system", "content": "List the Slack channels in a clean organized format. Use bullet points with channel names bolded."},
            *hist,
            {"role": "user", "content": f"Channels:\n{json.dumps(channels, indent=2)}\n\nUser request: {req.message}"},
        ])
        yield sse("message", content=summary)
    except Exception as e:
        yield sse("message", content=f"Failed to list channels: {str(e)}")
    yield sse("done")


def handle_slack_history(req, plan, hist):
    """Fetch recent messages from a Slack channel."""
    if not req.slackAccessToken:
        yield sse("message", 
            content="⚠️ Slack is not connected. Please connect your Slack workspace first.",
            actions=[{"label": "Connect Slack", "url": "/api/auth/slack", "icon": "slack"}]
        )
        yield sse("done")
        return

    details = plan["slack_history"]
    channel = details.get("channel", "")
    limit = details.get("limit", 10)
    yield sse("status", content=f"Fetching messages from #{channel}...")
    try:
        from slack_service import SlackService
        slack = SlackService(req.slackAccessToken)
        messages = slack.get_channel_history(channel, limit)
        if not messages:
            yield sse("message", content=f"No recent messages in #{channel}.")
            yield sse("done")
            return

        summary = call_llm([
            {"role": "system", "content": "Summarize the recent Slack messages concisely. Format with timestamps and usernames bolded."},
            *hist,
            {"role": "user", "content": f"Messages from #{channel}:\n{json.dumps(messages, indent=2)}\n\nUser request: {req.message}"},
        ])
        yield sse("message", content=summary)
    except Exception as e:
        yield sse("message", content=f"Failed to fetch messages: {str(e)}")
    yield sse("done")


# ── Linear search/etc handlers ───────────────────────────────────────────

def handle_linear_search(req, plan, hist):
    """Search Linear issues."""
    if not req.linearAccessToken:
        yield sse("message", 
            content="⚠️ Linear is not connected. Please connect your account to search issues.",
            actions=[{"label": "Connect Linear", "url": "/api/auth/linear", "icon": "linear"}]
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
    if not req.linearAccessToken:
        yield sse("message", 
            content="⚠️ Linear is not connected. Please connect your Linear account first.",
            actions=[{"label": "Connect Linear", "url": "/api/auth/linear", "icon": "linear"}]
        )
        yield sse("done")
        return
    details = plan["linear_create_propose"]
    title = details.get("title", "")
    description = details.get("description", "")
    state_id = details.get("state_id")
    
    params = {"title": title, "description": description}
    if state_id: params["state_id"] = state_id

    yield sse("message", 
        content=f"I'll create a Linear issue for this:\n\n**Title:** {title}\n{description}",
        actions=[{
            "label": "Create Issue", 
            "icon": "linear", 
            "tab": "linear",
            "confirmAction": "linear_create", 
            "params": params
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
                "url": "/api/auth/linear"
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
    
    try:
        linear = LinearService(req.linearAccessToken)
        issue = linear.create_issue(
            team_id=req.linearTeamId,
            title=params.get("title"),
            description=params.get("description", ""),
            project_id=req.linearProjectId,
            state_id=params.get("state_id")
        )
        
        action_id = params.get("actionId")
        if action_id:
            yield sse("action_success", id=action_id, url=issue.get("url", "https://linear.app"))
        else:
            yield sse("message", 
                content=f"Issue created: **{issue['identifier']} - {issue['title']}**",
                actions=[{"label": "View in Linear", "url": issue["url"], "icon": "linear", "tab": "linear"}]
            )
    except Exception as e:
        yield sse("message", content=f"Failed to create issue: {str(e)}")
    yield sse("done")

def handle_linear_move_issue_propose(req, plan, hist):
    """Propose moving a Linear issue."""
    if not req.linearAccessToken:
        yield sse("message", 
            content="⚠️ Linear is not connected. Please connect your account first.",
            actions=[{"label": "Connect Linear", "url": "/api/auth/linear", "icon": "linear"}]
        )
        yield sse("done")
        return
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
                "url": "/api/auth/linear"
            }]
        )
        yield sse("done")
        return

    details = req.message.split(" ", 2)[2] if req.message.startswith("Confirmed: ") else json.dumps(plan["linear_move_issue"])
    params = json.loads(details)
    
    try:
        linear = LinearService(req.linearAccessToken)
        issue = linear.update_issue_state(params["issue_id"], params["state_id"])
        yield sse("message", content=f"Issue **{issue['title']}** moved to **{issue['state']['name']}**.")
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
                "url": "/api/auth/linear"
            }]
        )
        yield sse("done")
        return

    if not req.linearProjectId:
        yield sse("message", content="⚠️ Linear project is not initialized for this project. Please set it up in the Linear tab.")
        yield sse("done")
        return

    yield sse("status", content="Fetching board and workflow...")
    try:
        linear = LinearService(req.linearAccessToken)
        issues = linear.list_project_issues(req.linearProjectId)
        states = linear.get_workflow_states(req.linearTeamId)
        
        summary = call_llm([
            {"role": "system", "content": "Summarize the Linear board state. Group issues by their workflow state concisely. Use the provided workflow states to understand the column structure."},
            *hist,
            {"role": "user", "content": f"Linear Data:\n- States: {json.dumps(states)}\n- Issues: {json.dumps(issues, indent=2)}\n\nSummarize the board and mention what states are available."}
        ])
        yield sse("message", content=summary, actions=[{"label": "View Board", "tab": "linear", "icon": "linear"}])
    except Exception as e:
        yield sse("message", content=f"Failed to fetch board: {str(e)}")
    yield sse("done")

# ── Main agent (yields SSE events) ─────────────────────────────────────


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
                if len(parts) >= 3:
                    action_name = parts[1]
                    params = json.loads(parts[2])
                    plan = {action_name: params}
                    print(f"[Agent] Processing confirmed action: {action_name}")
                    
                    # Manual routing for confirmed actions
                    if action_name == "gmail_send":
                        yield from handle_gmail_send(req, plan, [])
                    elif action_name == "notion_add_note":
                        yield from handle_notion_add_note(req, plan, [])
                    elif action_name == "linear_create":
                        yield from handle_linear_create(req, plan, [])
                    elif action_name == "linear_move_issue":
                        yield from handle_linear_move_issue(req, plan, [])
                    elif action_name == "slack_send":
                        yield from handle_slack_send(req, plan, [])
                    elif action_name == "calendar_add_event":
                        yield from handle_calendar_add_event(req, plan, [])
                    return
            except Exception as e:
                print(f"[Agent] Confirmation failed: {e}")
                # Fall through to normal planning if intercept fails

        # Build context about available services
        services_context = "\n\nAvailable services for this user (connected project resources):"
        if req.googleAccessToken:
            services_context += "\n- Gmail & Google Calendar (connected)"
        else:
            services_context += "\n- Gmail & Google Calendar (not connected)"
            
        if req.notionAccessToken:
            notion_info = f" (Project Page: {req.notionPageId})" if req.notionPageId else ""
            services_context += f"\n- Notion (connected){notion_info}"
        else:
            services_context += "\n- Notion (not connected)"

        if req.linearAccessToken:
            linear_info = []
            if req.linearTeamId: linear_info.append(f"Team: {req.linearTeamId}")
            if req.linearProjectId: linear_info.append(f"Project: {req.linearProjectId}")
            services_context += f"\n- Linear (connected) [{', '.join(linear_info)}]"
        else:
            services_context += "\n- Linear (not connected)"

        if req.slackAccessToken:
            slack_info = f" (Channel: {req.slackChannelId})" if req.slackChannelId else ""
            services_context += f"\n- Slack (connected){slack_info}"
        else:
            services_context += "\n- Slack (not connected)"

        # 1 ── Get file tree via GitHub API
        yield sse("status", content="Thinking...")
        tree = gh_file_tree(repo, req.branch, req.githubToken)
        file_count = len(tree.splitlines())
        print(f"[Agent] File tree: {file_count} files in {repo}")

        # 2 ── Plan: identify relevant files (cheap LLM call)
        # We don't show "Planning changes..." here because it might be a workspace task
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
        if "files_to_read" in plan or "files_to_edit" in plan:
            yield sse("status", content="Exploring codebase...")
            # Continue with coding task...
        
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
        if "slack_list_channels" in plan:
            yield from handle_slack_list_channels(req, plan, hist)
            return
        if "slack_history" in plan:
            yield from handle_slack_history(req, plan, hist)
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
        if "linear_move_issue_propose" in plan:
            yield from handle_linear_move_issue_propose(req, plan, hist)
            return
        if "linear_list_board" in plan:
            yield from handle_linear_list_board(req, plan, hist)
            return
        if "calendar_search" in plan:
            yield from handle_calendar_search(req, plan, hist)
            return
        if "calendar_list" in plan:
            yield from handle_calendar_list(req, plan, hist)
            return
        if "calendar_add_event_propose" in plan:
            yield from handle_calendar_add_event_propose(req, plan, hist)
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
