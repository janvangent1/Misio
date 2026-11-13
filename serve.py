"""Serve Misio and store bug reports next to this script.

The Windows launcher (misio.py) is only for trying the page on a PC.
On a Raspberry Pi, run this file. It serves the editor, counts visits,
keeps error notes, and stores reports in this folder. The admin password
is kept in admin.json.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import logging
import secrets
import sys
import threading
import traceback
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPORTS_PATH = ROOT / "reports.json"
ADMIN_PATH = ROOT / "admin.json"
USAGE_PATH = ROOT / "usage.json"
ERRORS_PATH = ROOT / "errors.json"
ADMIN_USER = "admin"
FIRST_PASSWORD = "100"
SESSION_COOKIE = "misio_admin"
VISITOR_COOKIE = "misio_visitor"
PRIVATE_FILES = {
    "/reports.json",
    "/admin.json",
    "/usage.json",
    "/errors.json",
    "/reports.json.tmp",
    "/admin.json.tmp",
    "/usage.json.tmp",
    "/errors.json.tmp",
}
USE_EVENTS = {"save", "export-svg", "export-pdf", "export-visio", "import-visio"}
DAY_LIMIT = 60
ERROR_LIMIT = 200
_store_lock = threading.Lock()
_sessions: set[str] = set()


def _write_text(path: Path, text: str) -> None:
    temporary = path.with_name(path.name + ".tmp")
    try:
        temporary.write_text(text, encoding="utf-8")
        temporary.replace(path)
    except OSError as exc:
        raise OSError(exc.errno, exc.strerror, str(path)) from exc


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


def _read_json_file(path: Path, fallback):
    if not path.is_file():
        return fallback
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback
    return payload


def _blank_usage() -> dict:
    return {
        "opens": 0,
        "visitorTotal": 0,
        "lastOpen": "",
        "days": {},
        "hours": {},
        "firstSeen": {},
        "languages": {},
        "events": {},
        "browsers": {},
        "countries": {},
    }


def _as_dict(value) -> dict:
    return value if isinstance(value, dict) else {}


def _valid_visitor(value: str) -> str:
    token = str(value or "")
    if len(token) == 16 and all(character in "0123456789abcdef" for character in token):
        return token
    return ""


COUNTRIES = {
    "AD": "Andorra", "AE": "United Arab Emirates", "AF": "Afghanistan", "AG": "Antigua and Barbuda",
    "AI": "Anguilla", "AL": "Albania", "AM": "Armenia", "AO": "Angola", "AQ": "Antarctica",
    "AR": "Argentina", "AS": "American Samoa", "AT": "Austria", "AU": "Australia", "AW": "Aruba",
    "AX": "Åland Islands", "AZ": "Azerbaijan", "BA": "Bosnia and Herzegovina", "BB": "Barbados",
    "BD": "Bangladesh", "BE": "Belgium", "BF": "Burkina Faso", "BG": "Bulgaria", "BH": "Bahrain",
    "BI": "Burundi", "BJ": "Benin", "BL": "Saint Barthélemy", "BM": "Bermuda", "BN": "Brunei",
    "BO": "Bolivia", "BQ": "Caribbean Netherlands", "BR": "Brazil", "BS": "Bahamas", "BT": "Bhutan",
    "BV": "Bouvet Island", "BW": "Botswana", "BY": "Belarus", "BZ": "Belize", "CA": "Canada",
    "CC": "Cocos Islands", "CD": "DR Congo", "CF": "Central African Republic", "CG": "Congo",
    "CH": "Switzerland", "CI": "Côte d'Ivoire", "CK": "Cook Islands", "CL": "Chile", "CM": "Cameroon",
    "CN": "China", "CO": "Colombia", "CR": "Costa Rica", "CU": "Cuba", "CV": "Cape Verde",
    "CW": "Curaçao", "CX": "Christmas Island", "CY": "Cyprus", "CZ": "Czechia", "DE": "Germany",
    "DJ": "Djibouti", "DK": "Denmark", "DM": "Dominica", "DO": "Dominican Republic", "DZ": "Algeria",
    "EC": "Ecuador", "EE": "Estonia", "EG": "Egypt", "EH": "Western Sahara", "ER": "Eritrea",
    "ES": "Spain", "ET": "Ethiopia", "FI": "Finland", "FJ": "Fiji", "FK": "Falkland Islands",
    "FM": "Micronesia", "FO": "Faroe Islands", "FR": "France", "GA": "Gabon", "GB": "United Kingdom",
    "GD": "Grenada", "GE": "Georgia", "GF": "French Guiana", "GG": "Guernsey", "GH": "Ghana",
    "GI": "Gibraltar", "GL": "Greenland", "GM": "Gambia", "GN": "Guinea", "GP": "Guadeloupe",
    "GQ": "Equatorial Guinea", "GR": "Greece", "GS": "South Georgia", "GT": "Guatemala", "GU": "Guam",
    "GW": "Guinea-Bissau", "GY": "Guyana", "HK": "Hong Kong", "HM": "Heard Island", "HN": "Honduras",
    "HR": "Croatia", "HT": "Haiti", "HU": "Hungary", "ID": "Indonesia", "IE": "Ireland",
    "IL": "Israel", "IM": "Isle of Man", "IN": "India", "IO": "British Indian Ocean Territory",
    "IQ": "Iraq", "IR": "Iran", "IS": "Iceland", "IT": "Italy", "JE": "Jersey", "JM": "Jamaica",
    "JO": "Jordan", "JP": "Japan", "KE": "Kenya", "KG": "Kyrgyzstan", "KH": "Cambodia",
    "KI": "Kiribati", "KM": "Comoros", "KN": "Saint Kitts and Nevis", "KP": "North Korea",
    "KR": "South Korea", "KW": "Kuwait", "KY": "Cayman Islands", "KZ": "Kazakhstan", "LA": "Laos",
    "LB": "Lebanon", "LC": "Saint Lucia", "LI": "Liechtenstein", "LK": "Sri Lanka", "LR": "Liberia",
    "LS": "Lesotho", "LT": "Lithuania", "LU": "Luxembourg", "LV": "Latvia", "LY": "Libya",
    "MA": "Morocco", "MC": "Monaco", "MD": "Moldova", "ME": "Montenegro", "MF": "Saint Martin",
    "MG": "Madagascar", "MH": "Marshall Islands", "MK": "North Macedonia", "ML": "Mali",
    "MM": "Myanmar", "MN": "Mongolia", "MO": "Macao", "MP": "Northern Mariana Islands",
    "MQ": "Martinique", "MR": "Mauritania", "MS": "Montserrat", "MT": "Malta", "MU": "Mauritius",
    "MV": "Maldives", "MW": "Malawi", "MX": "Mexico", "MY": "Malaysia", "MZ": "Mozambique",
    "NA": "Namibia", "NC": "New Caledonia", "NE": "Niger", "NF": "Norfolk Island", "NG": "Nigeria",
    "NI": "Nicaragua", "NL": "Netherlands", "NO": "Norway", "NP": "Nepal", "NR": "Nauru",
    "NU": "Niue", "NZ": "New Zealand", "OM": "Oman", "PA": "Panama", "PE": "Peru",
    "PF": "French Polynesia", "PG": "Papua New Guinea", "PH": "Philippines", "PK": "Pakistan",
    "PL": "Poland", "PM": "Saint Pierre and Miquelon", "PN": "Pitcairn", "PR": "Puerto Rico",
    "PS": "Palestine", "PT": "Portugal", "PW": "Palau", "PY": "Paraguay", "QA": "Qatar",
    "RE": "Réunion", "RO": "Romania", "RS": "Serbia", "RU": "Russia", "RW": "Rwanda",
    "SA": "Saudi Arabia", "SB": "Solomon Islands", "SC": "Seychelles", "SD": "Sudan",
    "SE": "Sweden", "SG": "Singapore", "SH": "Saint Helena", "SI": "Slovenia", "SJ": "Svalbard",
    "SK": "Slovakia", "SL": "Sierra Leone", "SM": "San Marino", "SN": "Senegal", "SO": "Somalia",
    "SR": "Suriname", "SS": "South Sudan", "ST": "São Tomé and Príncipe", "SV": "El Salvador",
    "SX": "Sint Maarten", "SY": "Syria", "SZ": "Eswatini", "TC": "Turks and Caicos", "TD": "Chad",
    "TF": "French Southern Territories", "TG": "Togo", "TH": "Thailand", "TJ": "Tajikistan",
    "TK": "Tokelau", "TL": "Timor-Leste", "TM": "Turkmenistan", "TN": "Tunisia", "TO": "Tonga",
    "TR": "Turkey", "TT": "Trinidad and Tobago", "TV": "Tuvalu", "TW": "Taiwan", "TZ": "Tanzania",
    "UA": "Ukraine", "UG": "Uganda", "UM": "US Minor Outlying Islands", "US": "United States",
    "UY": "Uruguay", "UZ": "Uzbekistan", "VA": "Vatican City", "VC": "Saint Vincent and the Grenadines",
    "VE": "Venezuela", "VG": "British Virgin Islands", "VI": "US Virgin Islands", "VN": "Vietnam",
    "VU": "Vanuatu", "WF": "Wallis and Futuna", "WS": "Samoa", "YE": "Yemen", "YT": "Mayotte",
    "ZA": "South Africa", "ZM": "Zambia", "ZW": "Zimbabwe",
}


def _browser_name(user_agent: str) -> str:
    agent = user_agent or ""
    if "Edg/" in agent or "EdgiOS" in agent or "Edge/" in agent:
        return "Edge"
    if "OPR/" in agent or "Opera" in agent:
        return "Opera"
    if "SamsungBrowser" in agent:
        return "Samsung Internet"
    if "Firefox/" in agent or "FxiOS" in agent:
        return "Firefox"
    if "CriOS" in agent or "Chrome/" in agent:
        return "Chrome"
    if "Safari/" in agent:
        return "Safari"
    if "MSIE" in agent or "Trident/" in agent:
        return "Internet Explorer"
    return "Other"


def _country_name(code: str) -> str:
    token = str(code or "").strip().upper()
    if token == "T1":
        return "Tor"
    if len(token) != 2 or token == "XX":
        return "Unknown"
    return COUNTRIES.get(token, token)


def _note_use(event: str, language: str, visitor_id: str = "", browser: str = "", country: str = "", track: bool = False) -> str:
    """Record one editor action. For an agreed open, return the visitor id to store."""
    with _store_lock:
        usage = _read_json_file(USAGE_PATH, _blank_usage())
        if not isinstance(usage, dict):
            usage = _blank_usage()
        days = _as_dict(usage.get("days"))
        hours = _as_dict(usage.get("hours"))
        first_seen = _as_dict(usage.get("firstSeen"))
        languages = _as_dict(usage.get("languages"))
        events = _as_dict(usage.get("events"))
        browsers = _as_dict(usage.get("browsers"))
        countries = _as_dict(usage.get("countries"))
        issued = ""
        if event == "open":
            now = datetime.now().astimezone()
            visitor_id = _valid_visitor(visitor_id) if track else ""
            if track:
                if not visitor_id:
                    visitor_id = secrets.token_hex(8)
                issued = visitor_id
            usage["opens"] = int(usage.get("opens") or 0) + 1
            usage["lastOpen"] = now.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
            day = now.strftime("%Y-%m-%d")
            days[day] = int(days.get(day) or 0) + 1
            if len(days) > DAY_LIMIT:
                for old in sorted(days)[:-DAY_LIMIT]:
                    days.pop(old, None)
            hour_key = now.strftime("%Y-%m-%dT%H")
            bucket = hours.get(hour_key)
            if not isinstance(bucket, dict):
                bucket = {"opens": 0, "visitors": []}
            visitors = bucket.get("visitors") if isinstance(bucket.get("visitors"), list) else []
            bucket["opens"] = int(bucket.get("opens") or 0) + 1
            if track and visitor_id not in visitors and len(visitors) < 200:
                visitors.append(visitor_id)
            bucket["visitors"] = visitors
            hours[hour_key] = bucket
            cutoff = (now - timedelta(days=32)).strftime("%Y-%m-%dT%H")
            for old in [key for key in hours if key < cutoff]:
                hours.pop(old, None)
            if track and visitor_id and visitor_id not in first_seen:
                first_seen[visitor_id] = day
                usage["visitorTotal"] = int(usage.get("visitorTotal") or 0) + 1
                browsers[browser or "Other"] = int(browsers.get(browser or "Other") or 0) + 1
                countries[country or "Unknown"] = int(countries.get(country or "Unknown") or 0) + 1
            if len(first_seen) > 5000:
                ranked = sorted(first_seen.items(), key=lambda item: str(item[1]))
                first_seen = dict(ranked[-5000:])
            if language in ("en", "nl", "fr"):
                languages[language] = int(languages.get(language) or 0) + 1
        else:
            events[event] = int(events.get(event) or 0) + 1
        usage["days"] = days
        usage["hours"] = hours
        usage["firstSeen"] = first_seen
        usage["languages"] = languages
        usage["events"] = events
        usage["browsers"] = browsers
        usage["countries"] = countries
        _write_text(USAGE_PATH, json.dumps(usage))
    return issued


def _hour_buckets(hours: dict) -> dict:
    clean = {}
    for key, bucket in hours.items():
        if not isinstance(key, str) or len(key) < 13 or not isinstance(bucket, dict):
            continue
        visitors = bucket.get("visitors") if isinstance(bucket.get("visitors"), list) else []
        clean[key] = {
            "opens": int(bucket.get("opens") or 0),
            "visitors": [item for item in visitors if isinstance(item, str)],
        }
    return clean


def _stamp(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _window(hours: dict, first_seen: dict, start: datetime, end: datetime, by_hour: bool) -> dict:
    ids = set()
    opens = 0
    for key, bucket in hours.items():
        if by_hour:
            inside = start.strftime("%Y-%m-%dT%H") <= key <= end.strftime("%Y-%m-%dT%H")
        else:
            inside = start.strftime("%Y-%m-%d") <= key[:10] <= end.strftime("%Y-%m-%d")
        if not inside:
            continue
        opens += bucket["opens"]
        ids.update(bucket["visitors"])
    start_day = start.strftime("%Y-%m-%d")
    end_day = end.strftime("%Y-%m-%d")
    new = sum(1 for visitor in ids if start_day <= str(first_seen.get(visitor) or "") <= end_day)
    return {"opens": opens, "visitors": len(ids), "new": new, "returning": len(ids) - new}


def _usage_view() -> dict:
    with _store_lock:
        usage = _read_json_file(USAGE_PATH, _blank_usage())
    if not isinstance(usage, dict):
        usage = _blank_usage()
    days = _as_dict(usage.get("days"))
    hours = _hour_buckets(_as_dict(usage.get("hours")))
    first_seen = _as_dict(usage.get("firstSeen"))
    now = datetime.now().astimezone()
    hour_start = now.replace(minute=0, second=0, microsecond=0)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    day_points = []
    for offset in range(23, -1, -1):
        moment = hour_start - timedelta(hours=offset)
        bucket = hours.get(moment.strftime("%Y-%m-%dT%H"), {"opens": 0, "visitors": []})
        day_points.append({
            "at": _stamp(moment),
            "opens": bucket["opens"],
            "visitors": len(set(bucket["visitors"])),
        })
    week_points = []
    month_points = []
    for offset in range(29, -1, -1):
        moment = day_start - timedelta(days=offset)
        day = moment.strftime("%Y-%m-%d")
        matched = [bucket for key, bucket in hours.items() if key.startswith(day)]
        if matched:
            opens = sum(bucket["opens"] for bucket in matched)
            visitors = len({visitor for bucket in matched for visitor in bucket["visitors"]})
        else:
            opens = int(days.get(day) or 0)
            visitors = 0
        point = {"at": _stamp(moment), "opens": opens, "visitors": visitors}
        month_points.append(point)
        if offset < 7:
            week_points.append(point)
    day_from = hour_start - timedelta(hours=23)
    week_from = day_start - timedelta(days=6)
    month_from = day_start - timedelta(days=29)
    return {
        "opens": int(usage.get("opens") or 0),
        "visitors": int(usage.get("visitorTotal") or len(first_seen)),
        "lastOpen": usage.get("lastOpen") or "",
        "languages": _as_dict(usage.get("languages")),
        "events": _as_dict(usage.get("events")),
        "browsers": _as_dict(usage.get("browsers")),
        "countries": _as_dict(usage.get("countries")),
        "summary": {
            "day": _window(hours, first_seen, day_from, hour_start, True),
            "week": _window(hours, first_seen, week_from, day_start, False),
            "month": _window(hours, first_seen, month_from, day_start, False),
        },
        "series": {"day": day_points, "week": week_points, "month": month_points},
    }


def _read_errors() -> list:
    errors = _read_json_file(ERRORS_PATH, [])
    return errors if isinstance(errors, list) else []


def _add_error(source: str, message: str, detail: str = "") -> None:
    message = " ".join(str(message or "").split())[:500]
    detail = " ".join(str(detail or "").split())[:800]
    if not message:
        return
    try:
        with _store_lock:
            errors = _read_errors()
            previous = errors[-1] if errors else None
            if isinstance(previous, dict) and previous.get("message") == message and previous.get("source") == source:
                previous["count"] = int(previous.get("count") or 1) + 1
                previous["created"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
            else:
                errors.append({
                    "id": secrets.token_hex(6),
                    "source": source,
                    "message": message,
                    "detail": detail,
                    "count": 1,
                    "created": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                })
            _write_text(ERRORS_PATH, json.dumps(errors[-ERROR_LIMIT:], ensure_ascii=False, indent=2))
    except OSError as exc:
        print(_store_message(exc), file=sys.stderr, flush=True)


def _store_message(exc: OSError) -> str:
    name = Path(str(exc.filename)).name if exc.filename else "a file"
    reason = exc.strerror or "the folder could not be written"
    return f"Could not write {name}: {reason}"


def _note_store_failure(exc: OSError) -> None:
    message = _store_message(exc)
    print(message, file=sys.stderr, flush=True)
    _add_error("server", message)


def _clear_errors() -> None:
    with _store_lock:
        _write_text(ERRORS_PATH, "[]")


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

    def end_headers(self):
        # css and js are cached by Cloudflare per scheme. no-cache keeps
        # http:// and https:// on the files just deployed.
        if not getattr(self, "_cache_set", False):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

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
        if path == "/api/admin/overview":
            if not self._logged_in():
                self._send_json({"error": "login"}, 401)
                return
            reports = _load_reports()
            self._send_json({
                "usage": _usage_view(),
                "errors": list(reversed(_read_errors())),
                "reports": {
                    "total": len(reports),
                    "bug": sum(1 for item in reports if item.get("kind") == "bug"),
                    "request": sum(1 for item in reports if item.get("kind") == "request"),
                },
            })
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
            if path == "/api/use":
                self._post_use(payload)
                return
            if path == "/api/client-error":
                self._post_client_error(payload)
                return
            if path == "/api/admin/login":
                self._post_login(payload)
                return
            if path == "/api/admin/logout":
                _sessions.discard(self._cookie(SESSION_COOKIE))
                self._send_json({"ok": True}, clear_cookie=True)
                return
            if path == "/api/admin/password":
                self._post_password(payload)
                return
        except OSError as exc:
            _note_store_failure(exc)
            self._send_json({"error": "store"}, 500)
            return
        self._send_json({"error": "not-found"}, 404)

    def do_DELETE(self):
        path = self.path.split("?", 1)[0]
        prefix = "/api/reports/"
        if path == "/api/errors":
            if not self._logged_in():
                self._send_json({"error": "login"}, 401)
                return
            try:
                _clear_errors()
            except OSError as exc:
                _note_store_failure(exc)
                self._send_json({"error": "store"}, 500)
                return
            self._send_json({"ok": True})
            return
        if not path.startswith(prefix) or not self._logged_in():
            self._send_json({"error": "login"}, 401)
            return
        report_id = path[len(prefix):]
        try:
            removed = bool(report_id) and _delete_report(report_id)
        except OSError as exc:
            _note_store_failure(exc)
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

    def _post_use(self, payload: dict):
        event = str(payload.get("event") or "")
        if event != "open" and event not in USE_EVENTS:
            self._send_json({"error": "bad-event"}, 400)
            return
        track = event == "open" and payload.get("visitor") is True
        visitor = _note_use(
            event,
            str(payload.get("language") or ""),
            self._cookie(VISITOR_COOKIE),
            _browser_name(self.headers.get("User-Agent", "")),
            _country_name(self.headers.get("CF-IPCountry", "")),
            track,
        )
        self._send_json({"ok": True}, visitor=visitor if track else None, clear_visitor=event == "open" and not track)

    def _post_client_error(self, payload: dict):
        message = str(payload.get("message") or "").strip()
        if not message or len(message) > 500:
            self._send_json({"error": "bad-error"}, 400)
            return
        _add_error("page", message, str(payload.get("detail") or ""))
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
        return self._cookie(SESSION_COOKIE) in _sessions

    def _cookie(self, name: str) -> str:
        for part in (self.headers.get("Cookie") or "").split(";"):
            key, _, value = part.strip().partition("=")
            if key == name:
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

    def _send_json(self, payload, status=200, cookie=None, clear_cookie=False, visitor=None, clear_visitor=False):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cache_set = True
        self.send_header("Cache-Control", "no-store")
        if cookie:
            self.send_header("Set-Cookie", f"{SESSION_COOKIE}={cookie}; HttpOnly; SameSite=Lax; Path=/")
        if clear_cookie:
            self.send_header("Set-Cookie", f"{SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0")
        if visitor:
            self.send_header(
                "Set-Cookie",
                f"{VISITOR_COOKIE}={visitor}; HttpOnly; SameSite=Lax; Path=/; Max-Age=34560000",
            )
        if clear_visitor:
            self.send_header(
                "Set-Cookie",
                f"{VISITOR_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
            )
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
        try:
            message = fmt % args if args else str(fmt)
        except (TypeError, ValueError):
            message = str(fmt)
        code = args[0] if args and isinstance(args[0], int) else 0
        if code >= 500:
            _add_error("server", message)
        launcher = getattr(self.server, "launcher", None)
        if launcher is None:
            super().log_error(fmt, *args)
            return
        launcher.log(logging.ERROR, message)


class MisioHTTPServer(ThreadingHTTPServer):
    """Threaded file server that keeps a short note when a request crashes."""

    daemon_threads = True

    def handle_error(self, request, client_address):
        lines = [line.strip() for line in traceback.format_exc().strip().splitlines() if line.strip()]
        message = lines[-1][:500] if lines else "Server error"
        detail = " ".join(lines[-4:-1])[:800]
        _add_error("server", message, detail)
        super().handle_error(request, client_address)


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve Misio and store reports.")
    parser.add_argument("--host", default="0.0.0.0", help="address to listen on (default: all interfaces)")
    parser.add_argument("--port", type=int, default=8765, help="port (default: 8765)")
    args = parser.parse_args()
    try:
        server = MisioHTTPServer((args.host, args.port), Handler)
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
