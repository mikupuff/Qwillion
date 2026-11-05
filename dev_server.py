"""Qwillion local dev server.

Serves the site like `python -m http.server`, plus a small password-gated API
the dev-mode daily builder uses to publish daily games:

  POST /api/dev/login      {"password": "..."}           -> {"token": "..."}
  GET  /api/daily                                         -> {"dates": [...]}
  POST /api/daily          {"date": "YYYY-MM-DD", "questions": [...]}
                           (header  Authorization: Bearer <token>)
  DELETE /api/daily/YYYY-MM-DD                            (same header)

Published games are written to data/daily/<date>.json, which the daily dive
loads as a plain static file - so on a static host, committing and deploying
that folder is what "sends out" a daily. This file-based store is a stand-in
until the real database (needed for scoring off players' answers) exists.

The dev password comes from the QWILLION_DEV_PASSWORD environment variable,
or else the first line of .dev-password (gitignored). If neither exists, a
random password is generated into .dev-password on first run.

Usage:  python dev_server.py [port]      (default 8123, binds 127.0.0.1)
"""

import hmac
import http.server
import json
import os
import re
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DAILY_DIR = ROOT / "data" / "daily"
PASSWORD_FILE = ROOT / ".dev-password"
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
GAME_LENGTH = 6
KNOWN_KINDS = {"stat", "region", "type-has", "type-exact", "stage", "no-evolve", "has-mega"}
MAX_BODY = 64 * 1024

# Session tokens live in memory only; restarting the server logs everyone out.
TOKENS = set()


def load_password():
    env = os.environ.get("QWILLION_DEV_PASSWORD")
    if env:
        return env
    if PASSWORD_FILE.exists():
        first = PASSWORD_FILE.read_text(encoding="utf-8").splitlines()
        if first and first[0].strip():
            return first[0].strip()
    generated = secrets.token_urlsafe(9)
    PASSWORD_FILE.write_text(generated + "\n", encoding="utf-8")
    print("Generated a dev password in " + str(PASSWORD_FILE))
    return generated


PASSWORD = load_password()


def published_dates():
    if not DAILY_DIR.exists():
        return []
    return sorted(p.stem for p in DAILY_DIR.glob("*.json") if DATE_RE.match(p.stem))


def write_index():
    """data/daily/index.json lists every published date, so the site can find
    the latest daily on a day with none published (static hosts can't list a
    folder)."""
    DAILY_DIR.mkdir(parents=True, exist_ok=True)
    (DAILY_DIR / "index.json").write_text(json.dumps({"dates": published_dates()}, indent=2) + "\n", encoding="utf-8")


def validate_game(body):
    """Shape check only - the browser builder validates the questions fully
    against the Pokemon data before it lets you publish."""
    if not isinstance(body, dict):
        return "Body must be a JSON object."
    date = body.get("date")
    if not isinstance(date, str) or not DATE_RE.match(date):
        return "date must be YYYY-MM-DD."
    questions = body.get("questions")
    if not isinstance(questions, list) or len(questions) != GAME_LENGTH:
        return "questions must be a list of %d specs." % GAME_LENGTH
    for i, q in enumerate(questions):
        if not isinstance(q, dict) or q.get("kind") not in KNOWN_KINDS:
            return "Question %d has an unknown kind." % (i + 1)
    return None


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # Never cache during development, so a republished daily (or edited
        # JS) shows up on the next reload.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # Don't serve the password file or the server itself.
    def send_head(self):
        name = self.path.split("?", 1)[0].lstrip("/")
        if name.startswith(".") or name == "dev_server.py":
            self.send_error(404)
            return None
        return super().send_head()

    def _json(self, status, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return None
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return None

    def _authorized(self):
        header = self.headers.get("Authorization") or ""
        token = header[7:] if header.startswith("Bearer ") else ""
        return any(hmac.compare_digest(token, t) for t in TOKENS)

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/api/daily":
            return self._json(200, {"dates": published_dates()})
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/dev/login":
            body = self._read_json() or {}
            password = body.get("password")
            if isinstance(password, str) and hmac.compare_digest(password.encode(), PASSWORD.encode()):
                token = secrets.token_urlsafe(24)
                TOKENS.add(token)
                return self._json(200, {"token": token})
            return self._json(401, {"error": "Wrong password."})

        if path == "/api/daily":
            if not self._authorized():
                return self._json(401, {"error": "Not logged in to dev mode."})
            body = self._read_json()
            error = validate_game(body)
            if error:
                return self._json(400, {"error": error})
            DAILY_DIR.mkdir(parents=True, exist_ok=True)
            game = {
                "date": body["date"],
                "questions": body["questions"],
                "publishedAt": body.get("publishedAt"),
            }
            (DAILY_DIR / (body["date"] + ".json")).write_text(json.dumps(game, indent=2) + "\n", encoding="utf-8")
            write_index()
            return self._json(200, {"ok": True, "date": body["date"]})

        return self._json(404, {"error": "Not found."})

    def do_DELETE(self):
        path = self.path.split("?", 1)[0]
        m = re.match(r"^/api/daily/(\d{4}-\d{2}-\d{2})$", path)
        if not m:
            return self._json(404, {"error": "Not found."})
        if not self._authorized():
            return self._json(401, {"error": "Not logged in to dev mode."})
        target = DAILY_DIR / (m.group(1) + ".json")
        if target.exists():
            target.unlink()
        write_index()
        return self._json(200, {"ok": True})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("Qwillion dev server on http://127.0.0.1:%d" % port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
