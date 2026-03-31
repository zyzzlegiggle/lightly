"""Cloud-init template for sandbox Droplets.

When used with a pre-baked snapshot (DROPLET_SNAPSHOT_ID):
  - Node.js 20 + git are already installed
  - npm cache is pre-warmed with popular packages
  - Swap is already configured
  → Setup goes straight to: clone → npm ci → dev server

Falls back to full install if running on a stock Ubuntu image.
"""

TEMPLATE = r"""#!/bin/bash
set -o pipefail
export DEBIAN_FRONTEND=noninteractive

# ── Log everything to a file for remote debugging ──
LOGFILE="/var/log/lightly-setup.log"
exec > >(tee -a "$LOGFILE") 2>&1

echo "[Lightly] Starting sandbox setup..."
START_TIME=$(date +%s)

# ── Swap — skip if already configured (pre-baked snapshot) ──
if [ ! -f /swapfile ]; then
  echo "[Lightly] Creating swap..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ── Node.js — skip if already installed (pre-baked snapshot) ──
if ! command -v node &>/dev/null; then
  echo "[Lightly] Node.js not found, installing (fallback mode)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - || true
  apt-get install -y -qq nodejs git 2>&1 | tail -5
else
  echo "[Lightly] Node.js $(node --version) already installed ✓"
fi

# Verify node is installed
if ! command -v node &>/dev/null; then
  echo "[FATAL] Node.js not installed, aborting."
  exit 1
fi

# ── Clone repo ──
echo "[Lightly] Cloning repository..."
CLONE_OK=0
for i in 1 2 3; do
  if git clone --depth 1 -b __BRANCH__ __AUTH_URL__ /app 2>&1; then
    CLONE_OK=1
    break
  fi
  echo "[Retry $i/3] git clone failed, retrying in 3s..."
  rm -rf /app
  sleep 3
done
if [ $CLONE_OK -eq 0 ]; then
  echo "[FATAL] git clone failed after 3 attempts."
  mkdir -p /app
fi

CLONE_TIME=$(date +%s)
echo "[Lightly] Clone took $((CLONE_TIME - START_TIME))s"

cd /app

# ── Write Environment Variables ──
echo "[Lightly] Writing environment variables to .env..."
cat > /app/.env << 'ENVEOF'
__ENV_CONTENT__
ENVEOF

# ── List what we cloned ──
echo "[Lightly] package.json exists: $([ -f package.json ] && echo YES || echo NO)"
echo "[Lightly] package-lock.json exists: $([ -f package-lock.json ] && echo YES || echo NO)"
if [ -f package.json ]; then
  echo "[Lightly] package.json scripts:"
  cat package.json | grep -A 10 '"scripts"' || true
fi

# ── Install dependencies ──
# Use npm ci (faster, uses lockfile) with --prefer-offline (use pre-warmed cache)
if [ -f package-lock.json ]; then
  echo "[Lightly] Installing deps with npm ci (lockfile found)..."
  NPM_OK=0
  for i in 1 2; do
    if npm ci --prefer-offline 2>&1; then
      NPM_OK=1
      break
    fi
    echo "[Retry $i/2] npm ci failed, falling back to npm install..."
    rm -rf node_modules
    if npm install --prefer-offline 2>&1; then
      NPM_OK=1
      break
    fi
    sleep 2
  done
elif [ -f package.json ]; then
  echo "[Lightly] Installing deps with npm install (no lockfile)..."
  NPM_OK=0
  for i in 1 2; do
    if npm install --prefer-offline 2>&1; then
      NPM_OK=1
      break
    fi
    echo "[Retry $i/2] npm install failed, retrying..."
    rm -rf node_modules
    sleep 2
  done
fi

INSTALL_TIME=$(date +%s)
echo "[Lightly] npm install took $((INSTALL_TIME - CLONE_TIME))s"
echo "[Lightly] node_modules exists: $([ -d node_modules ] && echo YES || echo NO)"

# ── File Sync API (port 8080) — with /logs endpoint for remote debugging ──
cat > /app/_sync.cjs << 'SYNCEOF'
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const TOKEN = "__SYNC_TOKEN__";
const LOGFILE = "/var/log/lightly-setup.log";

http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Headers","*");
  if (req.method==="OPTIONS"){res.writeHead(200);res.end();return;}
  if (req.method==="GET"&&req.url==="/health"){res.writeHead(200);res.end("ok");return;}

  // ── Remote debug: show setup logs + process list ──
  if (req.method==="GET"&&req.url==="/logs"){
    let logs = "";
    try { logs = fs.readFileSync(LOGFILE, "utf-8"); } catch(e) { logs = "(no log file)"; }
    // Also include running processes on ports 3000 and 8080
    let procs = "";
    try { procs = execSync("ps aux | grep -E '(node|npm|next|vite)' | grep -v grep", {encoding:"utf-8"}); } catch(e) { procs = "(no matching processes)"; }
    let ports = "";
    try { ports = execSync("ss -tlnp | grep -E '(3000|8080)'", {encoding:"utf-8"}); } catch(e) { ports = "(no listeners on 3000/8080)"; }
    res.writeHead(200,{"Content-Type":"application/json"});
    res.end(JSON.stringify({logs: logs.slice(-3000), processes: procs, ports: ports}));
    return;
  }

  if (req.method==="POST"&&req.url==="/sync"){
    if(req.headers.authorization!=="Bearer "+TOKEN){res.writeHead(401);res.end();return;}
    let body="";
    req.on("data",c=>body+=c);
    req.on("end",()=>{
      try{
        const{changes}=JSON.parse(body);
        const updated=[];
        for(const{file,content}of changes){
          const fp=path.join("/app",file);
          fs.mkdirSync(path.dirname(fp),{recursive:true});
          fs.writeFileSync(fp,content,"utf-8");
          updated.push(file);
        }
        res.writeHead(200,{"Content-Type":"application/json"});
        res.end(JSON.stringify({ok:true,files:updated}));
      }catch(e){res.writeHead(400);res.end(JSON.stringify({error:e.message}));}
    });
    return;
  }
  res.writeHead(404);res.end();
}).listen(8080,"0.0.0.0",()=>console.log("Sync API on :8080"));
SYNCEOF

# Start sync API immediately (so health checks pass sooner)
node /app/_sync.cjs &

# ── Detect framework and start dev server on port 3000 ──
cd /app
export NODE_OPTIONS="--max-old-space-size=1024"

# Make sure deps actually installed
if [ ! -d node_modules ] && [ -f package.json ]; then
  echo "[Lightly] node_modules missing, running npm install..."
  npm install --prefer-offline 2>&1 || true
fi

start_dev() {
  # ── Detect framework from package.json dependencies ──
  if grep -q '"next"' package.json 2>/dev/null; then
    echo "[Dev] Detected Next.js — starting with --turbo"
    npx next dev --turbo -H 0.0.0.0 -p 3000 2>&1

  elif grep -q '"vite"' package.json 2>/dev/null; then
    echo "[Dev] Detected Vite"
    npx vite --host 0.0.0.0 --port 3000 2>&1

  elif grep -q '"react-scripts"' package.json 2>/dev/null; then
    echo "[Dev] Detected Create React App"
    PORT=3000 HOST=0.0.0.0 npx react-scripts start 2>&1

  elif grep -q '"nuxt"' package.json 2>/dev/null; then
    echo "[Dev] Detected Nuxt"
    PORT=3000 HOST=0.0.0.0 npx nuxi dev 2>&1

  elif grep -q '"@sveltejs/kit"' package.json 2>/dev/null; then
    echo "[Dev] Detected SvelteKit"
    npx vite dev --host 0.0.0.0 --port 3000 2>&1

  elif grep -q '"astro"' package.json 2>/dev/null; then
    echo "[Dev] Detected Astro"
    npx astro dev --host 0.0.0.0 --port 3000 2>&1

  elif grep -q '"dev"' package.json 2>/dev/null && cat package.json | python3 -c "import sys,json; s=json.load(sys.stdin).get('scripts',{}); sys.exit(0 if 'dev' in s else 1)" 2>/dev/null; then
    echo "[Dev] Has 'dev' script — using npm run dev"
    PORT=3000 HOST=0.0.0.0 npm run dev 2>&1

  elif grep -q '"start"' package.json 2>/dev/null && cat package.json | python3 -c "import sys,json; s=json.load(sys.stdin).get('scripts',{}); sys.exit(0 if 'start' in s else 1)" 2>/dev/null; then
    echo "[Dev] Has 'start' script — using npm start"
    PORT=3000 HOST=0.0.0.0 npm start 2>&1

  elif [ -f server.js ]; then
    echo "[Dev] Found server.js — running with node"
    PORT=3000 HOST=0.0.0.0 node server.js 2>&1

  elif [ -f index.js ]; then
    echo "[Dev] Found index.js — running with node"
    PORT=3000 HOST=0.0.0.0 node index.js 2>&1

  elif [ -f app.js ]; then
    echo "[Dev] Found app.js — running with node"
    PORT=3000 HOST=0.0.0.0 node app.js 2>&1

  else
    echo "[Dev] ERROR: Could not detect how to start this project"
    echo "[Dev] package.json contents:"
    cat package.json 2>/dev/null || echo "(no package.json)"
    return 1
  fi
}

# Retry dev server up to 3 times (it can crash on first compile due to memory)
for attempt in 1 2 3; do
  echo "[Dev] Starting dev server (attempt $attempt)..."
  start_dev &
  DEV_PID=$!
  sleep 8
  if kill -0 $DEV_PID 2>/dev/null; then
    DEV_TIME=$(date +%s)
    echo "[Dev] Server running on :3000 (PID $DEV_PID, total setup: $((DEV_TIME - START_TIME))s)"
    break
  fi
  echo "[Dev] Server died (exit code: $?), retrying in 2s..."
  sleep 2
done

echo "[Lightly] Setup complete."
wait
"""


def build(github_url: str, github_token: str, branch: str, sync_token: str, env_vars: dict = None) -> str:
    auth_url = github_url.replace("https://", f"https://x-access-token:{github_token}@")
    
    # Generate .env content safely
    env_content = ""
    if env_vars:
        for k, v in env_vars.items():
            # Basic sanitization to prevent breaking the heredoc
            clean_value = str(v).replace("'", "'\\''")
            env_content += f"{k}={clean_value}\n"
            
    return (TEMPLATE
        .replace("__AUTH_URL__", auth_url)
        .replace("__BRANCH__", branch)
        .replace("__SYNC_TOKEN__", sync_token)
        .replace("__ENV_CONTENT__", env_content))
