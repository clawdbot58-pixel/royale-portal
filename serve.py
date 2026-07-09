#!/usr/bin/env python3
"""
Royale Portal — local dev server.
Serves static files + proxies API calls + caches card images to disk.
"""
import http.server
import urllib.request
import urllib.error
import os
import re
import sys
import ssl

PORT = 8080
API_BASE  = "https://api.clashroyale.com/v1"
IMG_BASE  = "https://api-assets.clashroyale.com"
HERE      = os.path.dirname(os.path.abspath(__file__))
IMG_CACHE = os.path.join(HERE, "img_cache")

# ── Ensure cache dir ───────────────────────────────────────
os.makedirs(IMG_CACHE, exist_ok=True)

# ── Read API token ─────────────────────────────────────────
TOKEN = ""
cfg = os.path.join(HERE, "config.js")
if os.path.exists(cfg):
    with open(cfg) as f:
        m = re.search(r'CLASH_ROYALE_API_TOKEN\s*=\s*"([^"]*)"', f.read())
        if m and m.group(1):
            TOKEN = m.group(1)
if not TOKEN:
    print("WARNING: Could not read CLASH_ROYALE_API_TOKEN\n")

SSL_CTX = ssl.create_default_context()


class Handler(http.server.SimpleHTTPRequestHandler):

    def do_GET(self):
        if self.path.startswith("/api/"):
            self._proxy_api()
        elif self.path.startswith("/img/"):
            self._serve_img()
        else:
            super().do_GET()

    # ── API proxy ──────────────────────────────────────────
    def _proxy_api(self):
        api_path = self.path[4:]
        url = f"{API_BASE}{api_path}"
        req = urllib.request.Request(url, headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {TOKEN}",
            "User-Agent": "RoyalePortal/1.0",
        })
        self._fetch(req, "application/json", f"API {api_path}")

    # ── Image serve (with disk cache) ──────────────────────
    def _serve_img(self):
        img_path = self.path[5:]  # /img/cards/300/xxx.png → cards/300/xxx.png
        cache_file = os.path.join(IMG_CACHE, img_path)

        # Serve from disk cache if exists
        if os.path.exists(cache_file):
            with open(cache_file, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
            self.end_headers()
            self.wfile.write(data)
            return

        # Fetch from CDN, save to disk, serve
        url = f"{IMG_BASE}/{img_path}"
        req = urllib.request.Request(url, headers={"User-Agent": "RoyalePortal/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=20, context=SSL_CTX) as resp:
                body = resp.read()
        except Exception as e:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(str(e).encode())
            print(f"  502 image: {img_path} — {e}", flush=True)
            return

        # Save to cache
        os.makedirs(os.path.dirname(cache_file), exist_ok=True)
        with open(cache_file, "wb") as f:
            f.write(body)

        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self.end_headers()
        self.wfile.write(body)
        print(f"  cached: {img_path}", flush=True)

    # ── Generic fetch helper ───────────────────────────────
    def _fetch(self, req, content_type, label):
        try:
            with urllib.request.urlopen(req, timeout=20, context=SSL_CTX) as resp:
                body = resp.read()
            self.send_response(resp.status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
            print(f"  {resp.status} {label}", flush=True)
        except urllib.error.HTTPError as e:
            body = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
            print(f"  {e.code} {label}", flush=True)
        except Exception as e:
            self.send_response(502)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(str(e).encode())
            print(f"  502 {label}: {e}", flush=True)

    def log_message(self, fmt, *args):
        pass  # silent


if __name__ == "__main__":
    print(f"\n  Royale Portal → http://localhost:{PORT}/")
    print(f"  Image cache → {IMG_CACHE}/\n")
    try:
        http.server.HTTPServer(("", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\n  Shut down.\n")
        sys.exit(0)
