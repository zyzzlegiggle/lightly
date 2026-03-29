# Lightly

AI-powered design tool that lets designers edit live web apps through natural language. Link a GitHub repo, get a live sandbox on DigitalOcean, and iterate on the UI by chatting with an AI agent — no code knowledge needed.

## How It Works

1. **Link a repo** — Connect any GitHub repository from the dashboard
2. **Live sandbox** — A DigitalOcean Droplet spins up with your app running on a dev server
3. **Chat to edit** — Describe UI changes in plain English (or drop in mockup images)
4. **Instant preview** — Changes sync to the Droplet in real-time via hot-reload
5. **Publish** — Confirm changes to commit them to GitHub in a single clean commit

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Auth | Auth0 (GitHub OAuth + Token Vault) |
| Database | PostgreSQL (DigitalOcean Managed) + Drizzle ORM |
| AI Agent | Python FastAPI, DigitalOcean GenAI (LLM) |
| Sandboxes | DigitalOcean Droplets + cloud-init |
| Storage | DigitalOcean Spaces (S3) |

## Setup

### 1. Frontend

```bash
cp .env.example .env   # fill in your keys
npm install
npm run dev             # → http://localhost:3000
```

### 2. Agent Backend

```bash
cd agent-backend
python -m venv .venv && .venv\Scripts\activate   # Windows
pip install -r requirements.txt
cp .env.example .env   # fill in DO tokens
python main.py          # → http://localhost:8000
```

### Environment Variables

**Frontend (`.env`)**
- `DATABASE_URL` — PostgreSQL connection string
- `AUTH0_DOMAIN` / `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` — Auth0 app credentials
- `AUTH0_SECRET` — Session encryption key
- `APP_BASE_URL` — App URL (http://localhost:3000)

**Backend (`agent-backend/.env`)**
- `GRADIENT_ACCESS_TOKEN` — DigitalOcean API token
- `SPACES_ACCESS_KEY` / `SPACES_SECRET_KEY` — DO Spaces credentials
- `DO_GENAI_ENDPOINT` / `DO_GENAI_API_KEY` — LLM endpoint

## Architecture

```
Browser ──→ Next.js ──→ FastAPI Agent ──→ GitHub API (read/write files)
                │              │                    ↑
                │              ├──→ DO API (Droplets)│
                │              └──→ DO GenAI (LLM)   │
                │                                    │
                ├──→ Auth0 ──→ Token Vault ──→ GitHub token (short-lived)
                │
                └──→ iframe ──→ Droplet :3000 (live preview)
                                Droplet :8080 (file sync API)
```

## Built With

- **Auth0** — User authentication + Token Vault for secure GitHub token management
- **DigitalOcean Droplets** — Live sandbox environments with cloud-init provisioning
- **DigitalOcean Managed PostgreSQL** — User data, projects
- **DigitalOcean Spaces** — Source code storage for knowledge base indexing
- **DigitalOcean GenAI Platform** — LLM inference for the AI agent
