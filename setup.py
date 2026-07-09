#!/usr/bin/env python3
"""
Royale Portal — Setup Script
Run this on a fresh clone to get everything ready.
  1. Creates config.js (you fill in the API token)
  2. Pre-fetches all card images to img_cache/ (not committed to git)
  3. Verifies everything works

Usage:
  python3 setup.py          # first run — creates config.js
  # then edit config.js to add your API token
  python3 setup.py          # second run — downloads images
"""

import http.server
import json
import os
import re
import shutil
import ssl
import sys
import urllib.request
import urllib.error
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
API_BASE = "https://api.clashroyale.com/v1"
IMG_BASE = "https://api-assets.clashroyale.com"
IMG_CACHE = os.path.join(HERE, "img_cache")
TOKEN = ""

# ── Colours for terminal ──
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


def ok(msg):    print(f"  {GREEN}✓{RESET} {msg}")
def warn(msg):  print(f"  {YELLOW}⚠{RESET} {msg}")
def err(msg):   print(f"  {RED}✗{RESET} {msg}")
def info(msg):  print(f"  {CYAN}→{RESET} {msg}")


# ── Step 1: Ensure config.js exists ──────────────────────────────────────────

def step_config():
    cfg = os.path.join(HERE, "config.js")
    example = os.path.join(HERE, "config.example.js")

    if os.path.exists(cfg):
        ok("config.js exists")
    else:
        if os.path.exists(example):
            shutil.copy2(example, cfg)
            info("Created config.js from config.example.js")
        else:
            with open(cfg, "w") as f:
                f.write("""// 🔐 Royale Portal — API Configuration
// Get your free API token: https://developer.clashroyale.com
const CLASH_ROYALE_API_TOKEN = "";
""")
            info("Created brand-new config.js")

    # Read token
    global TOKEN
    with open(cfg) as f:
        m = re.search(r'CLASH_ROYALE_API_TOKEN\s*=\s*"([^"]*)"', f.read())
        if m and m.group(1):
            TOKEN = m.group(1)

    if not TOKEN:
        warn("No API token found in config.js")
        info("Edit config.js and set CLASH_ROYALE_API_TOKEN to your token")
        info("Get a token at https://developer.clashroyale.com")
        return False
    return True


# ── Step 2: Test API token ──────────────────────────────────────────────────

def step_test_api():
    url = API_BASE + "/cards"
    req = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "Authorization": f"Bearer {TOKEN}",
    })
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
            body = json.loads(resp.read())
            count = len(body.get("items", []))
            ok(f"API token works — {count} cards in database")
            return body
    except urllib.error.HTTPError as e:
        err(f"API returned {e.code} — check your token is correct")
        if e.code == 403:
            warn("The token may be invalid or rate-limited")
        return None
    except Exception as e:
        err(f"Could not reach API: {e}")
        return None


# ── Step 3: Download card images ────────────────────────────────────────────

def download_img(url, dest):
    """Download a single image, return True on success."""
    if os.path.exists(dest):
        return True  # already cached

    os.makedirs(os.path.dirname(dest), exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "RoyalePortal/1.0"})
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=20, context=ctx) as resp:
            body = resp.read()
        with open(dest, "wb") as f:
            f.write(body)
        return True
    except Exception:
        return False


def step_images(cards_data):
    items = cards_data.get("items", [])
    if not items:
        warn("No cards returned from API — skipping image download")
        return

    total = len(items)
    ok_ = 0
    fail = 0

    # Collect image URLs
    url_map = []  # (cdn_url, cache_path)
    for c in items:
        urls = c.get("iconUrls") or {}
        for size in ("medium",):
            src = urls.get(size)
            if src and src.startswith(IMG_BASE):
                rel = src[len(IMG_BASE):]
                if rel.startswith("/"):
                    rel = rel[1:]
                dest = os.path.join(IMG_CACHE, rel)
                url_map.append((src, dest))

    if not url_map:
        warn("No card images found in API response")
        return

    info(f"Downloading {len(url_map)} card images to img_cache/ …")

    for src, dest in url_map:
        if download_img(src, dest):
            ok_ += 1
        else:
            fail += 1

    info(f"Images: {ok_} ok, {fail} failed")

    # Show disk usage
    total_size = 0
    for dirpath, _, filenames in os.walk(IMG_CACHE):
        for fn in filenames:
            fp = os.path.join(dirpath, fn)
            try:
                total_size += os.path.getsize(fp)
            except OSError:
                pass
    if total_size > 1024 * 1024:
        info(f"Cache size: {total_size / 1024 / 1024:.1f} MB")
    elif total_size > 1024:
        info(f"Cache size: {total_size / 1024:.1f} KB")


# ── Step 4: Verify serve.py works ───────────────────────────────────────────

def step_verify_server():
    # Check if port 8080 is free (rough check)
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", 8080))
        s.close()
        info("Port 8080 is free — serve.py can start")
    except OSError:
        warn("Port 8080 in use — maybe serve.py is already running?")

    # Verify serve.py exists
    if os.path.exists(os.path.join(HERE, "serve.py")):
        ok("serve.py found — run it with:  python3 serve.py")
    else:
        warn("serve.py not found")


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    print(f"\n  {BOLD}Royale Portal — Setup{RESET}\n")

    has_token = step_config()
    if not has_token:
        print(f"\n  {YELLOW}Setup paused.{RESET} Add your API token to config.js, then run again.\n")
        sys.exit(0)

    cards_data = step_test_api()
    if cards_data is None:
        print(f"\n  {RED}API connection failed.{RESET} Fix the token in config.js and try again.\n")
        sys.exit(1)

    step_images(cards_data)
    print()
    step_verify_server()

    print(f"""
  {GREEN}── Ready ──{RESET}

  Start the server:
    python3 serve.py

  Then open:
    http://localhost:8080/

  The app will auto-load your default player tag.
  Edit card-data.js to fix the upgrade requirement numbers.
""")

    # Also update gitignore if needed
    gitignore = os.path.join(HERE, ".gitignore")
    if os.path.exists(gitignore):
        with open(gitignore) as f:
            content = f.read()
        if "img_cache/" not in content:
            with open(gitignore, "a") as f:
                f.write("\n# Cached card images (fetched by setup.py)\nimg_cache/\n")
            ok("Added img_cache/ to .gitignore")


if __name__ == "__main__":
    main()
