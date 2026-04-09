"""
Gateway Sidecar — Runs on the gateway droplet alongside Caddy.

Responsibilities:
  1. /check?domain=xxx  — Caddy calls this before issuing a TLS cert.
     Returns 200 if the subdomain corresponds to a valid Lightly droplet.
  2. /proxy/{droplet_id}/{path}  — Caddy reverse-proxies here after
     rewriting the subdomain into a path. We look up the droplet's
     public IP and stream the response from http://{ip}:3000/{path}.

Requires env var:
  GRADIENT_ACCESS_TOKEN  — DigitalOcean API token (same one the main backend uses)
"""

import os
import re
import time
import logging
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
from urllib.parse import urlparse

logging.basicConfig(level=logging.INFO, format="[sidecar] %(asctime)s %(message)s")
log = logging.getLogger("sidecar")

DO_TOKEN = os.getenv("GRADIENT_ACCESS_TOKEN", "")
PREVIEW_DOMAIN = os.getenv("PREVIEW_DOMAIN", "preview.lightly.ink")
PORT = int(os.getenv("SIDECAR_PORT", "8080"))

# ── IP Cache ─────────────────────────────────────────────────────────
# droplet_id -> (ip, timestamp)
_ip_cache: dict[str, tuple[str, float]] = {}
CACHE_TTL = 300  # 5 minutes


def resolve_droplet_ip(droplet_id: str) -> str | None:
    """Look up a droplet's public IPv4 via the DigitalOcean API (cached)."""
    cached = _ip_cache.get(droplet_id)
    if cached and time.time() - cached[1] < CACHE_TTL:
        return cached[0]

    try:
        req = Request(
            f"https://api.digitalocean.com/v2/droplets/{droplet_id}",
            headers={"Authorization": f"Bearer {DO_TOKEN}"},
        )
        with urlopen(req, timeout=5) as resp:
            import json
            data = json.loads(resp.read())
            networks = data.get("droplet", {}).get("networks", {}).get("v4", [])
            ip = next((n["ip_address"] for n in networks if n["type"] == "public"), None)
            if ip:
                _ip_cache[droplet_id] = (ip, time.time())
                log.info(f"Resolved droplet {droplet_id} → {ip}")
            return ip
    except Exception as e:
        log.warning(f"Failed to resolve droplet {droplet_id}: {e}")
        return None


# ── HTTP Handler ─────────────────────────────────────────────────────

class SidecarHandler(BaseHTTPRequestHandler):
    """Handles Caddy's /check requests and proxied /proxy requests."""

    def log_message(self, fmt, *args):
        log.info(fmt % args)

    # ── Caddy TLS check ──────────────────────────────────────────────
    def _handle_check(self):
        """Caddy calls GET /check?domain=xxx.preview.lightly.ink
        Return 200 to allow cert issuance, 404 to deny."""
        from urllib.parse import parse_qs, urlparse
        qs = parse_qs(urlparse(self.path).query)
        domain = qs.get("domain", [""])[0]

        # Extract the droplet ID from "12345.preview.lightly.ink"
        pattern = rf"^(\d+)\.{re.escape(PREVIEW_DOMAIN)}$"
        m = re.match(pattern, domain)
        if not m:
            self.send_response(404)
            self.end_headers()
            return

        droplet_id = m.group(1)
        ip = resolve_droplet_ip(droplet_id)
        self.send_response(200 if ip else 404)
        self.end_headers()

    # ── Proxy to droplet ─────────────────────────────────────────────
    def _handle_proxy(self):
        """Proxy requests matching /proxy/{droplet_id}/... to the droplet."""
        # Parse: /proxy/12345/some/path
        m = re.match(r"^/proxy/(\d+)(/.*)?$", self.path.split("?")[0])
        if not m:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Invalid proxy path")
            return

        droplet_id = m.group(1)
        remainder = m.group(2) or "/"
        
        # Rebuild query string
        full_url = self.path
        qs = ""
        if "?" in full_url:
            qs = "?" + full_url.split("?", 1)[1]

        ip = resolve_droplet_ip(droplet_id)
        if not ip:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(b"Droplet not found or not accessible")
            return

        target = f"http://{ip}:3000{remainder}{qs}"

        try:
            # Read request body if present
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length) if content_length > 0 else None

            # Forward headers (except Host)
            fwd_headers = {}
            for key, val in self.headers.items():
                lower = key.lower()
                if lower in ("host", "transfer-encoding"):
                    continue
                fwd_headers[key] = val

            req = Request(target, data=body, headers=fwd_headers, method=self.command)
            with urlopen(req, timeout=30) as resp:
                status = resp.status
                self.send_response(status)

                # Forward response headers, stripping ones that block iframing
                skip_headers = {
                    "transfer-encoding",
                    "x-frame-options",
                    "content-security-policy",
                    "content-security-policy-report-only",
                }
                for key, val in resp.getheaders():
                    if key.lower() not in skip_headers:
                        self.send_header(key, val)
                self.end_headers()

                # Stream body
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)

        except HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
            self.wfile.write(e.read())
        except (URLError, OSError) as e:
            log.warning(f"Proxy error for {droplet_id}: {e}")
            self.send_response(502)
            self.end_headers()
            self.wfile.write(f"Upstream unreachable: {e}".encode())

    # ── Route ────────────────────────────────────────────────────────
    def do_GET(self):
        if self.path.startswith("/check"):
            self._handle_check()
        elif self.path.startswith("/proxy/"):
            self._handle_proxy()
        elif self.path == "/health":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
        else:
            self.send_response(404)
            self.end_headers()

    # Handle all methods for proxying
    do_POST = do_PUT = do_DELETE = do_PATCH = do_HEAD = do_OPTIONS = do_GET


# ── Main ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if not DO_TOKEN:
        log.error("GRADIENT_ACCESS_TOKEN not set!")
        exit(1)

    server = HTTPServer(("0.0.0.0", PORT), SidecarHandler)
    log.info(f"Sidecar listening on :{PORT} (domain: *.{PREVIEW_DOMAIN})")
    server.serve_forever()
