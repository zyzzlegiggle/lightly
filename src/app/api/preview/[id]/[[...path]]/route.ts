import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { project } from "@/lib/schema";
import { eq } from "drizzle-orm";

// ── Headers we must strip from upstream so the iframe can render ──
const STRIPPED_HEADERS = [
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "cross-origin-embedder-policy",
  "cross-origin-opener-policy",
  "cross-origin-resource-policy",
];

// ── Headers we never forward downstream ──
const SKIP_REQUEST_HEADERS = [
  "host",
  "connection",
  "transfer-encoding",
  "keep-alive",
  "upgrade",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
];

async function resolveTarget(id: string) {
  const dbProject = await db.query.project.findFirst({
    where: eq(project.id, id),
  });
  if (!dbProject?.lastPreviewUrl) return null;
  return dbProject.lastPreviewUrl.replace(/\/$/, "");
}

/** Build safe outbound headers */
function buildUpstreamHeaders(req: NextRequest) {
  const h: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    if (!SKIP_REQUEST_HEADERS.includes(k.toLowerCase())) {
      h[k] = v;
    }
  });
  h["Accept"] = req.headers.get("Accept") || "*/*";
  // Bypass ngrok interstitial if targeting an ngrok URL
  h["ngrok-skip-browser-warning"] = "true";
  return h;
}

/** Build response headers — strip anything that blocks iframe embedding */
function buildDownstreamHeaders(
  upstream: Response,
  extra?: Record<string, string>
): Record<string, string> {
  const h: Record<string, string> = {};
  upstream.headers.forEach((v, k) => {
    if (!STRIPPED_HEADERS.includes(k.toLowerCase())) {
      h[k] = v;
    }
  });
  h["X-Frame-Options"] = "ALLOWALL";
  h["Access-Control-Allow-Origin"] = "*";
  h["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
  h["Access-Control-Allow-Headers"] = "*";
  delete h["Cross-Origin-Embedder-Policy"];
  delete h["Cross-Origin-Opener-Policy"];
  if (extra) Object.assign(h, extra);
  return h;
}

/**
 * Rewrite ALL root-relative paths in a text blob.
 * "/foo" → "/api/preview/{id}/foo"
 * Skips: protocol-relative "//", already-proxied "/api/preview/", data URIs
 */
function rewriteRootRelativePaths(text: string, proxyBase: string): string {
  // In string literals: '/path', "/path", `/path`
  // Added '.' to allowed characters for hidden folders like /.vite/
  return text.replace(
    /(['"`])\/(?!\/|api\/preview\/|data:)([.@_\w])/g,
    "$1" + proxyBase + "$2"
  );
}

async function handleProxy(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; path?: string[] }> }
) {
  const { id, path } = await params;
  const subPath = (path ?? []).join("/");

  const targetBase = await resolveTarget(id);
  if (!targetBase) {
    return new NextResponse("Project or preview URL not found", { status: 404 });
  }

  const targetUrl = `${targetBase}/${subPath}${req.nextUrl.search}`;
  console.log(`[Proxy] ${req.method} ${req.nextUrl.pathname} -> ${targetUrl}`);

  try {
    const hasBody = !["GET", "HEAD"].includes(req.method);
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: buildUpstreamHeaders(req),
      body: hasBody ? req.body : undefined,
      redirect: "follow",
    });

    const contentType = response.headers.get("Content-Type") || "";
    const proxyBase = `/api/preview/${id}/`;

    // ── HTML: inject <base>, rewrite URLs, patch runtime APIs ──
    if (contentType.includes("text/html")) {
      let html = await response.text();

      // Inject <base> right after <head>
      const baseTag = `<base href="${proxyBase}">`;
      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
      } else if (/<html[^>]*>/i.test(html)) {
        html = html.replace(/<html([^>]*)>/i, `<html$1><head>${baseTag}</head>`);
      } else {
        html = baseTag + html;
      }

      // Rewrite absolute droplet IP URLs → proxy
      const escapedBase = targetBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      html = html.replace(new RegExp(escapedBase + "/?", "g"), proxyBase);

      // Rewrite root-relative URLs in HTML attributes
      // src="/foo" → src="/api/preview/{id}/foo"
      html = html.replace(
        /((?:src|href|action|poster)\s*=\s*["'])\/(?!\/|api\/preview\/)/gi,
        `$1${proxyBase}`
      );

      // Rewrite url() in inline styles
      html = html.replace(
        /url\(\s*['"]?\/(?!\/|api\/preview\/|data:)/gi,
        `url(${proxyBase}`
      );

      // Rewrite srcset attributes
      html = html.replace(
        /srcset\s*=\s*"([^"]*)"/gi,
        (match, srcset: string) => {
          const rewritten = srcset.replace(
            /(?:^|,\s*)\/(?!\/|api\/preview\/)/g,
            (m: string) => m.replace("/", proxyBase)
          );
          return `srcset="${rewritten}"`;
        }
      );

      // Inject runtime patches for fetch, XHR, createElement, WebSocket
      const patchScript = `
<script data-lightly-proxy>
(function() {
  var P = '${proxyBase}';
  function rw(u) {
    if (typeof u !== 'string') return u;
    if (u.startsWith('/') && !u.startsWith('//') && !u.startsWith(P)) return P + u.slice(1);
    return u;
  }
  // fetch
  var _f = window.fetch;
  window.fetch = function(i, o) {
    if (typeof i === 'string') i = rw(i);
    else if (i instanceof Request) { var nu = rw(i.url); if (nu !== i.url) i = new Request(nu, i); }
    return _f.call(this, i, o);
  };
  // XHR
  var _xo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, u) { arguments[1] = rw(u); return _xo.apply(this, arguments); };
  // createElement — intercept script/link src/href
  var _ce = document.createElement.bind(document);
  document.createElement = function(t) {
    var el = _ce(t);
    if (t === 'script' || t === 'link') {
      var _sa = el.setAttribute.bind(el);
      el.setAttribute = function(n, v) {
        if ((n === 'src' || n === 'href') && typeof v === 'string') v = rw(v);
        return _sa(n, v);
      };
      if (t === 'script') {
        var d = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
        if (d && d.set) { var _ss = d.set; Object.defineProperty(el, 'src', { set: function(v) { _ss.call(this, rw(v)); }, get: d.get, configurable: true }); }
      }
    }
    return el;
  };
  // WebSocket (HMR) — create a fake WebSocket for dev-server HMR connections
  // that silently absorbs traffic. Real connections (non-HMR) pass through.
  var _WS = window.WebSocket;
  function FakeWS() {
    this.readyState = 1; // OPEN
    this.send = function() {};
    this.close = function() { this.readyState = 3; if (this.onclose) this.onclose({code:1000,reason:'',wasClean:true}); };
    this.addEventListener = function(t, fn) { if (t === 'open') setTimeout(fn, 0); };
    this.removeEventListener = function() {};
    var self = this;
    setTimeout(function() { if (self.onopen) self.onopen({}); }, 0);
  }
  FakeWS.prototype = { CONNECTING:0, OPEN:1, CLOSING:2, CLOSED:3 };
  window.WebSocket = function(url, p) {
    try {
      var u = new URL(url, location.origin);
      // If the WS target is a different host (i.e. the Droplet), stub it out
      // This catches Vite/Webpack HMR connections to localhost / droplet IPs
      if (u.hostname !== location.hostname || (u.port && u.port !== location.port)) {
        return new FakeWS();
      }
    } catch(e) { return new FakeWS(); }
    return p ? new _WS(url, p) : new _WS(url);
  };
  window.WebSocket.prototype = _WS.prototype;
  window.WebSocket.CONNECTING = 0;
  window.WebSocket.OPEN = 1;
  window.WebSocket.CLOSING = 2;
  window.WebSocket.CLOSED = 3;
  // Suppress HMR / Vite console noise
  var _ce2 = console.error;
  console.error = function() { var m = arguments[0]; if (typeof m === 'string' && (m.includes('WebSocket') || m.includes('[hmr]') || m.includes('[vite]') || m.includes('hot update'))) return; return _ce2.apply(this, arguments); };
  var _cw = console.warn;
  console.warn = function() { var m = arguments[0]; if (typeof m === 'string' && (m.includes('WebSocket') || m.includes('[hmr]') || m.includes('[vite]') || m.includes('hot update'))) return; return _cw.apply(this, arguments); };
  // Hide Vite/Webpack error overlays that may show connection errors
  var _raf = requestAnimationFrame;
  (function hideOverlays() {
    var overlays = document.querySelectorAll('vite-error-overlay, #webpack-dev-server-client-overlay');
    overlays.forEach(function(el) { el.remove(); });
    _raf(hideOverlays);
  })();
})();
</script>`;

      if (html.includes("</head>")) {
        html = html.replace("</head>", patchScript + "</head>");
      } else {
        html += patchScript;
      }

      return new NextResponse(html, {
        status: response.status,
        headers: buildDownstreamHeaders(response, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        }),
      });
    }

    // ── Detect if this is a binary response (images, fonts, wasm, etc.) ──
    const BINARY_TYPES = ["image/", "font/", "audio/", "video/", "application/wasm", "application/octet-stream", "application/zip", "application/pdf"];
    const BINARY_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg", ".woff", ".woff2", ".ttf", ".eot", ".mp3", ".mp4", ".webm", ".wasm", ".zip", ".pdf"];
    const ext = "." + (subPath.split(".").pop() || "").toLowerCase();
    const isBinary = BINARY_TYPES.some(t => contentType.includes(t)) || BINARY_EXTS.includes(ext);

    if (isBinary) {
      // Stream binary through without modification
      return new NextResponse(response.body, {
        status: response.status,
        headers: buildDownstreamHeaders(response),
      });
    }

    // ── ALL text responses: rewrite root-relative paths ──
    let text = await response.text();

    // Rewrite absolute droplet IP URLs
    const escapedBase = targetBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(escapedBase + "/?", "g"), proxyBase);

    // Rewrite all root-relative paths in string literals
    // Catches: "/node_modules/...", "/src/...", "/@vite/...", "/_next/...", etc.
    text = rewriteRootRelativePaths(text, proxyBase);

    // Rewrite webpack public path if present
    text = text.replace(
      /__webpack_require__\.p\s*=\s*"\/"/g,
      '__webpack_require__.p="' + proxyBase + '"'
    );

    // Rewrite url() in CSS
    if (contentType.includes("text/css") || ext === ".css") {
      text = text.replace(
        /url\(\s*['"]?\/(?!\/|api\/preview\/|data:)/gi,
        "url(" + proxyBase
      );
    }

    return new NextResponse(text, {
      status: response.status,
      headers: buildDownstreamHeaders(response, {
        "Content-Type": contentType || "text/plain",
        "Cache-Control": response.headers.get("Cache-Control") || "no-cache",
      }),
    });
  } catch (err) {
    console.error("[Proxy Error]", err);
    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:2rem;color:#666">
        <h2>Preview Unavailable</h2>
        <p>Could not connect to the sandbox at <code>${targetBase}</code>.</p>
        <p>The droplet may still be starting up. Try refreshing in a few seconds.</p>
      </body></html>`,
      {
        status: 502,
        headers: { "Content-Type": "text/html" },
      }
    );
  }
}

// Support all HTTP methods through the proxy
export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const DELETE = handleProxy;
export const PATCH = handleProxy;

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}
