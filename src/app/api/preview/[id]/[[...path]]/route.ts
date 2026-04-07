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

// ── HMR paths that should return stubs instead of being proxied ──
const HMR_PATHS = [
  "@vite/client",
  "@react-refresh",
  "__vite_ping",
  "__vite_hmr",
  "_next/webpack-hmr",
];

// ── Stub for /@vite/client — provides CSS injection but no HMR/WebSocket ──
const VITE_CLIENT_STUB = `
// Lightly Preview: Vite client stub (HMR disabled in proxy mode)
export function createHotContext() {
  return {
    accept: () => {},
    acceptExports: () => {},
    dispose: () => {},
    prune: () => {},
    invalidate: () => {},
    decline: () => {},
    on: () => {},
    send: () => {},
    data: {},
  };
}
export function removeStyle(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}
export function createStyle() {}
export function updateStyle(id, css) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    el.setAttribute('type', 'text/css');
    document.head.appendChild(el);
  }
  el.textContent = css;
}
export function injectQuery(url) { return url; }
`;

// ── Stub for /@react-refresh ──
const REACT_REFRESH_STUB = `
// Lightly Preview: React Refresh stub (HMR disabled in proxy mode)
const RefreshRuntime = {
  injectIntoGlobalHook: () => {},
  createSignatureFunctionForTransform: () => (type) => type,
  isLikelyComponentType: () => false,
  register: () => {},
  getFamilyByID: () => undefined,
  performReactRefresh: () => {},
};
export default RefreshRuntime;
`;

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
  return text.replace(
    /(['"`])\/(?!\/|api\/preview\/|data:)([.@_\w])/g,
    "$1" + proxyBase + "$2"
  );
}

/**
 * Check if a path is an HMR-related request that should be stubbed.
 */
function getHmrStub(subPath: string): string | null {
  // Exact matches
  if (subPath === "@vite/client" || subPath === "node_modules/.vite/client" || subPath === "node_modules/vite/dist/client/client.mjs") {
    return VITE_CLIENT_STUB;
  }
  if (subPath === "@react-refresh" || subPath.includes("react-refresh")) {
    return REACT_REFRESH_STUB;
  }
  // Prefix matches
  if (subPath === "__vite_ping" || subPath === "__vite_hmr" || subPath.startsWith("__vite")) {
    return "// HMR stub\n";
  }
  if (subPath === "_next/webpack-hmr") {
    return "// Webpack HMR stub\n";
  }
  return null;
}

async function handleProxy(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; path?: string[] }> }
) {
  const { id, path } = await params;
  const subPath = (path ?? []).join("/");
  const proxyBase = `/api/preview/${id}/`;

  // ── Intercept HMR requests and return stubs ──
  const hmrStub = getHmrStub(subPath);
  if (hmrStub) {
    console.log(`[Proxy] HMR stub: ${subPath}`);
    return new NextResponse(hmrStub, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

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

      // Strip React Refresh preamble inline scripts
      html = html.replace(
        /<script\b[^>]*type\s*=\s*["']module["'][^>]*>[\s\S]*?__vite_plugin_react_preamble_installed__[\s\S]*?<\/script>/gi,
        `<script type="module">
          window.$RefreshReg$ = () => {};
          window.$RefreshSig$ = () => (type) => type;
          window.__vite_plugin_react_preamble_installed__ = true;
        </script>`
      );

      // Inject runtime patches for fetch, XHR, createElement (NO WebSocket patching needed now)
      const patchScript = `
<style>vite-error-overlay, #webpack-dev-server-client-overlay { display: none !important; }</style>
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
  // Block ALL WebSocket connections from the proxied iframe.
  // HMR WebSockets can't work through a reverse proxy, and the stubs above
  // prevent Vite/Webpack from even trying — this is a safety net.
  var _WS = window.WebSocket;
  window.WebSocket = function(url, p) {
    try {
      var u = new URL(url, location.origin);
      // Allow WebSocket to truly external services (e.g. Firebase, Supabase, Pusher)
      // Block connections to: localhost, private IPs, or the proxy host itself
      var h = u.hostname;
      if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' ||
          h === location.hostname || /^10\\./.test(h) || /^172\\.(1[6-9]|2\\d|3[01])\\./.test(h) ||
          /^192\\.168\\./.test(h)) {
        console.debug('[Lightly] Blocked HMR WebSocket to', url);
        // Return a fake WebSocket that pretends to connect
        var fake = { readyState: 1, send: function(){}, close: function(){this.readyState=3;},
          addEventListener: function(t,fn){if(t==='open')setTimeout(fn,0);},
          removeEventListener: function(){}, onopen:null, onclose:null, onmessage:null, onerror:null };
        setTimeout(function(){ if(fake.onopen) fake.onopen({}); }, 0);
        return fake;
      }
    } catch(e) {}
    return p ? new _WS(url, p) : new _WS(url);
  };
  window.WebSocket.prototype = _WS.prototype;
  window.WebSocket.CONNECTING = 0; window.WebSocket.OPEN = 1;
  window.WebSocket.CLOSING = 2; window.WebSocket.CLOSED = 3;
})();
</script>`;

      // Inject the patch as the FIRST thing after <head> and <base> tag (before any other scripts)
      if (html.includes(baseTag)) {
        html = html.replace(baseTag, baseTag + patchScript);
      } else if (html.includes("</head>")) {
        html = html.replace("</head>", patchScript + "</head>");
      } else {
        html = patchScript + html;
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
