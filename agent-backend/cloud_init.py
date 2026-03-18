"""Cloud-init template for sandbox Droplets — sets up Node.js, dev server, and file sync API."""

TEMPLATE = r"""#!/bin/bash
export DEBIAN_FRONTEND=noninteractive

# ── Add swap to prevent OOM on small Droplets ──
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - || true
apt-get install -y -qq nodejs git 2>&1 | tail -5

# Verify node is installed
if ! command -v node &>/dev/null; then
  echo "[FATAL] Node.js not installed, aborting."
  exit 1
fi

# Clone repo (retry up to 3 times)
CLONE_OK=0
for i in 1 2 3; do
  if git clone -b __BRANCH__ __AUTH_URL__ /app; then
    CLONE_OK=1
    break
  fi
  echo "[Retry $i/3] git clone failed, retrying in 5s..."
  rm -rf /app
  sleep 5
done
if [ $CLONE_OK -eq 0 ]; then
  echo "[FATAL] git clone failed after 3 attempts."
  # Still start sync API so status endpoint can report the error
  mkdir -p /app
fi

cd /app

# npm install (retry up to 2 times)
if [ -f package.json ]; then
  NPM_OK=0
  for i in 1 2; do
    if npm install 2>&1 | tail -10; then
      NPM_OK=1
      break
    fi
    echo "[Retry $i/2] npm install failed, retrying..."
    rm -rf node_modules
    sleep 3
  done
fi

# ── File Sync API (port 8080) — accepts file writes for instant hot-reload ──
cat > /app/_sync.cjs << 'SYNCEOF'
const http = require("http");
const fs = require("fs");
const path = require("path");
const TOKEN = "__SYNC_TOKEN__";
http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Headers","*");
  if (req.method==="OPTIONS"){res.writeHead(200);res.end();return;}
  if (req.method==="GET"&&req.url==="/health"){res.writeHead(200);res.end("ok");return;}
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

# ── Start services ──
node /app/_sync.cjs &

# Detect framework and start dev server on port 3000
cd /app
if grep -q '"next"' package.json 2>/dev/null; then
  npx next dev -H 0.0.0.0 -p 3000 &
elif grep -q '"vite"' package.json 2>/dev/null; then
  npx vite --host 0.0.0.0 --port 3000 &
else
  PORT=3000 HOST=0.0.0.0 npm run dev &
fi

wait
"""


def build(github_url: str, github_token: str, branch: str, sync_token: str) -> str:
    auth_url = github_url.replace("https://", f"https://x-access-token:{github_token}@")
    return (TEMPLATE
        .replace("__AUTH_URL__", auth_url)
        .replace("__BRANCH__", branch)
        .replace("__SYNC_TOKEN__", sync_token))
