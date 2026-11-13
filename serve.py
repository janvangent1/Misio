"""Serve Misio and store bug reports next to this script.

The Windows launcher (misio.py) is only for trying the page on a PC.
On a Raspberry Pi, run this file. It serves the editor and keeps reports
in reports.json. The admin password is kept in admin.json.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import logging
import secrets
import threading
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPORTS_PATH = ROOT / "reports.json"
ADMIN_PATH = ROOT / "admin.json"
ADMIN_USER = "admin"
FIRST_PASSWORD = "100"
SESSION_COOKIE = "misio_admin"
PRIVATE_FILES = {"/reports.json", "/admin.json"}
_store_lock = threading.Lock()
_sessions: set[str] = set()


def _write_text(path: Path, text: str) -> None:
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(text, encoding="utf-8")
    temporary.replace(path)


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 200_000).hex()


def _admin_record() -> dict:
    with _store_lock:
        if ADMIN_PATH.is_file():
            try:
                record = json.loads(ADMIN_PATH.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                record = None
            if isinstance(record, dict) and record.get("salt") and record.get("hash"):
                return record
        salt = secrets.token_hex(16)
        record = {
            "user": ADMIN_USER,
            "salt": salt,
            "hash": _hash_password(FIRST_PASSWORD, salt),
            "mustChange": True,
        }
        _write_text(ADMIN_PATH, json.dumps(record))
        return record


def _password_matches(password: str) -> bool:
    record = _admin_record()
    digest = _hash_password(password, record["salt"])
    return hmac.compare_digest(digest, record["hash"])


def _save_password(password: str) -> None:
    salt = secrets.token_hex(16)
    record = {
        "user": ADMIN_USER,
        "salt": salt,
        "hash": _hash_password(password, salt),
        "mustChange": False,
    }
    with _store_lock:
        _write_text(ADMIN_PATH, json.dumps(record))


def _read_reports() -> list:
    if not REPORTS_PATH.is_file():
        return []
    try:
        reports = json.loads(REPORTS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return reports if isinstance(reports, list) else []


def _write_reports(reports: list) -> None:
    _write_text(REPORTS_PATH, json.dumps(reports, ensure_ascii=False, indent=2))


def _load_reports() -> list:
    with _store_lock:
        return _read_reports()


def _add_report(kind: str, text: str, name: str) -> dict:
    report = {
        "id": secrets.token_hex(6),
        "kind": kind,
        "text": text,
        "name": name,
        "created": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    }
    with _store_lock:
        reports = _read_reports()
        reports.append(report)
        _write_reports(reports)
    return report


def _delete_report(report_id: str) -> bool:
    with _store_lock:
        reports = _read_reports()
        kept = [item for item in reports if item.get("id") != report_id]
        if len(kept) == len(reports):
            return False
        _write_reports(kept)
    return True


class Handler(SimpleHTTPRequestHandler):
    """Serve the Misio folder, store reports, and guard the admin page."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in PRIVATE_FILES:
            self.send_error(404)
            return
        if path == "/api/admin/session":
            logged_in = self._logged_in()
            self._send_json({
                "ok": logged_in,
                "mustChange": bool(_admin_record().get("mustChange")) if logged_in else False,
            })
            return
        if path == "/api/reports":
            if not self._logged_in():
                self._send_json({"error": "login"}, 401)
                return
            self._send_json({"reports": list(reversed(_load_reports()))})
            return
        super().do_GET()

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        payload = self._read_json()
        if payload is None:
            self._send_json({"error": "bad-json"}, 400)
            return
        try:
            if path == "/api/reports":
                self._post_report(payload)
                return
            if path == "/api/admin/login":
                self._post_login(payload)
                return
            if path == "/api/admin/logout":
                _sessions.discard(self._session_token())
                self._send_json({"ok": True}, clear_cookie=True)
                return
            if path == "/api/admin/password":
                self._post_password(payload)
                return
        except OSError:
            self._send_json({"error": "store"}, 500)
            return
        self._send_json({"error": "not-found"}, 404)

    def do_DELETE(self):
        path = self.path.split("?", 1)[0]
        prefix = "/api/reports/"
        if not path.startswith(prefix) or not self._logged_in():
            self._send_json({"error": "login"}, 401)
            return
        report_id = path[len(prefix):]
        try:
            removed = bool(report_id) and _delete_report(report_id)
        except OSError:
            self._send_json({"error": "store"}, 500)
            return
        if not removed:
            self._send_json({"error": "missing"}, 404)
            return
        self._send_json({"ok": True})

    def _post_report(self, payload: dict):
        kind = payload.get("kind")
        text = str(payload.get("text") or "").strip()
        name = str(payload.get("name") or "").strip()
        if kind not in ("bug", "request") or not text or len(text) > 4000 or len(name) > 80:
            self._send_json({"error": "bad-report"}, 400)
            return
        _add_report(kind, text, name)
        self._send_json({"ok": True})

    def _post_login(self, payload: dict):
        user = str(payload.get("user") or "")
        password = str(payload.get("password") or "")
        if user != ADMIN_USER or not _password_matches(password):
            self._send_json({"error": "login"}, 401)
            return
        token = secrets.token_urlsafe(32)
        _sessions.add(token)
        record = _admin_record()
        self._send_json({"ok": True, "mustChange": bool(record.get("mustChange"))}, cookie=token)

    def _post_password(self, payload: dict):
        if not self._logged_in():
            self._send_json({"error": "login"}, 401)
            return
        current = str(payload.get("current") or "")
        new_password = str(payload.get("password") or "")
        if not _password_matches(current):
            self._send_json({"error": "login"}, 401)
            return
        if len(new_password) < 3 or len(new_password) > 80:
            self._send_json({"error": "short"}, 400)
            return
        _save_password(new_password)
        self._send_json({"ok": True})

    def _logged_in(self) -> bool:
        return self._session_token() in _sessions

    def _session_token(self) -> str:
        for part in (self.headers.get("Cookie") or "").split(";"):
            name, _, value = part.strip().partition("=")
            if name == SESSION_COOKIE:
                return value
        return ""

    def _read_json(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None
        if length < 0 or length > 100_000:
            return None
        raw = self.rfile.read(length) if length else b""
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None
        return payload if isinstance(payload, dict) else None

    def _send_json(self, payload, status=200, cookie=None, clear_cookie=False):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if cookie:
            self.send_header("Set-Cookie", f"{SESSION_COOKIE}={cookie}; HttpOnly; SameSite=Lax; Path=/")
        if clear_cookie:
            self.send_header("Set-Cookie", f"{SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        if getattr(self.server, "released", False):
            return
        launcher = getattr(self.server, "launcher", None)
        if launcher is None:
            super().log_message(fmt, *args)
            return
        code = args[1] if len(args) > 1 else "-"
        level = logging.INFO
        try:
            if int(code) >= 400:
                level = logging.WARNING
        except (TypeError, ValueError):
            level = logging.INFO
        launcher.log(level, "%s %s", self.address_string(), fmt % args)
        launcher.note_request()

    def log_error(self, fmt, *args):
        if getattr(self.server, "released", False):
            return
        launcher = getattr(self.server, "launcher", None)
        if launcher is None:
            super().log_error(fmt, *args)
            return
        launcher.log(logging.ERROR, fmt % args)


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve Misio and store reports.")
    parser.add_argument("--host", default="0.0.0.0", help="address to listen on (default: all interfaces)")
    parser.add_argument("--port", type=int, default=8765, help="port (default: 8765)")
    args = parser.parse_args()
    try:
        server = ThreadingHTTPServer((args.host, args.port), Handler)
    except OSError as exc:
        raise SystemExit(f"Could not listen on {args.host}:{args.port}: {exc}") from exc
    shown = "this computer" if args.host == "0.0.0.0" else args.host
    print(f"Misio at http://{shown}:{args.port}/", flush=True)
    print("Reports are saved in this folder. Admin page: /admin.html", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
