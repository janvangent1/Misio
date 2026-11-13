#!/usr/bin/env python3
"""Deploy Misio to the Raspberry Pi over SSH.

Runs serve.py on 127.0.0.1:8765 via systemd, beside the sites
already on the Pi:

  regenboog.jbouquet.be  -> localhost:3000  (pm2)
  trackwise.jbouquet.be  -> localhost:8000  (systemd)
  misio.jbouquet.be      -> localhost:8765  (this script)

The Cloudflare public hostname is added once in the dashboard.
This script does not edit nginx or cloudflared, and it does not
restart regenboog or trackwise.

Usage:
  deploy/.venv/Scripts/python deploy/deploy_misio.py
"""

from __future__ import annotations

import json
import os
import queue
import re
import shlex
import sys
import threading
import time
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, scrolledtext, ttk

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
CONFIG_FILE = SCRIPT_DIR / "deploy_config.json"

SITE_FILES = (
    "index.html",
    "admin.html",
    "styles.css",
    "app.js",
    "lang.js",
    "arei.js",
    "network.js",
    "schematic.js",
    "visio.js",
    "favicon.svg",
    "favicon.ico",
    "eendraadschema.json",
    "serve.py",
)

# Ports already used by the other sites. Misio must not take these.
RESERVED_PORTS = {
    22: "SSH",
    53: "DNS",
    80: "nginx",
    443: "nginx",
    3000: "regenboog",
    3001: "regenboog",
    8000: "trackwise",
}

# Watched so a Misio restart cannot quietly take a neighbour down.
NEIGHBOR_PORTS = {
    3000: "regenboog",
    3001: "regenboog",
    8000: "trackwise",
    80: "nginx",
    443: "nginx",
}
NEIGHBOR_UNITS = ("cloudflared", "trackwise", "nginx")

HTML_FILES = {"index.html", "admin.html"}
VERSIONED_EXT = {".css", ".js", ".svg", ".ico", ".png"}
SERVICE_NAME = "misio"
DEFAULT_PORT = 8765
DEFAULT_DOMAIN = "misio.jbouquet.be"

try:
    import paramiko
except ImportError:
    print("paramiko is not installed.")
    print("From the Misio folder:")
    print("  py -3 -m venv deploy/.venv")
    print("  deploy/.venv/Scripts/python -m pip install -r deploy/requirements.txt")
    print("  deploy/.venv/Scripts/python deploy/deploy_misio.py")
    sys.exit(1)


def load_config():
    try:
        if CONFIG_FILE.is_file():
            return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        pass
    return {}


def save_config(data):
    try:
        CONFIG_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except OSError:
        pass


def validate_remote_dir(remote_dir, username):
    path = remote_dir.strip().rstrip("/")
    if not path.startswith("/"):
        raise ValueError("Remote folder must be an absolute path, such as /home/pi/misio.")
    if re.search(r"[\s'\"$`\\]", path):
        raise ValueError("Remote folder cannot contain spaces or quotes.")
    home = f"/home/{username}"
    if path == home or not path.startswith(home + "/"):
        raise ValueError(
            f"Remote folder must be a new directory inside {home}, such as {home}/misio."
        )
    blocked = ("regenboog", "trackwise")
    lowered = path.lower()
    for name in blocked:
        if name in lowered:
            raise ValueError(
                f"Remote folder looks like the {name} site. Pick a separate folder, such as {home}/misio."
            )
    leaf = path.rsplit("/", 1)[-1]
    if leaf in {".", "..", "misio.py"} or leaf.startswith("."):
        raise ValueError("Choose a normal folder name, such as misio.")
    return path


def validate_port(port):
    if port < 1024 or port > 65535:
        raise ValueError("App port must be between 1024 and 65535.")
    owner = RESERVED_PORTS.get(port)
    if owner:
        raise ValueError(f"Port {port} belongs to {owner}. Misio uses {DEFAULT_PORT}.")
    return port


def service_unit(user, remote_dir, port, python_bin):
    return f"""[Unit]
Description=Misio flowchart editor
After=network.target

[Service]
Type=simple
User={user}
WorkingDirectory={remote_dir}
ExecStart={python_bin} {remote_dir}/serve.py --host 127.0.0.1 --port {port}
Restart=always
RestartSec=3
Environment=PYTHONUNBUFFERED=1
MemoryMax=128M

[Install]
WantedBy=multi-user.target
"""


class SSH:
    def __init__(self, host, port, username, password, key_filename):
        self.host = host
        self.port = port
        self.username = username
        self.password = password or None
        self.key_filename = key_filename if key_filename and os.path.isfile(key_filename) else None
        self.client = None
        self.sudo_mode = None  # "nopasswd" or "password"

    def connect(self):
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        kwargs = {
            "hostname": self.host,
            "port": self.port,
            "username": self.username,
            "timeout": 15,
            "allow_agent": True,
            "look_for_keys": self.key_filename is None,
        }
        if self.key_filename:
            kwargs["key_filename"] = self.key_filename
            kwargs["look_for_keys"] = False
        if self.password:
            kwargs["password"] = self.password
        client.connect(**kwargs)
        self.client = client

    def close(self):
        if self.client:
            self.client.close()
            self.client = None

    def run(self, command, timeout=60):
        stdin, stdout, stderr = self.client.exec_command(command, timeout=timeout)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        code = stdout.channel.recv_exit_status()
        return code, out, err

    def ensure_sudo(self):
        if self.sudo_mode:
            return
        code, _, _ = self.run("sudo -n true")
        if code == 0:
            self.sudo_mode = "nopasswd"
            return
        if not self.password:
            raise RuntimeError(
                "The Pi user cannot run sudo without a password, and no SSH password was given."
            )
        self.sudo_mode = "password"
        code, out, err = self._sudo_bash("true")
        if code != 0:
            self.sudo_mode = None
            detail = (err or out).strip()
            raise RuntimeError(f"sudo failed on the Pi. {detail}")

    def sudo_bash(self, script, timeout=90):
        self.ensure_sudo()
        return self._sudo_bash(script, timeout=timeout)

    def _sudo_bash(self, script, timeout=90):
        # sudo -S reads the password from stdin, then passes the rest to bash.
        # With NOPASSWD, sudo -n must be used so the script is not eaten as a password.
        if self.sudo_mode == "password":
            remote = "sudo -S -p '' bash -s"
        else:
            remote = "sudo -n bash -s"
        stdin, stdout, stderr = self.client.exec_command(remote, timeout=timeout)
        if self.sudo_mode == "password":
            stdin.write(self.password + "\n")
        stdin.write(script)
        if not script.endswith("\n"):
            stdin.write("\n")
        stdin.channel.shutdown_write()
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        code = stdout.channel.recv_exit_status()
        if self.password:
            err = err.replace(self.password, "*****")
            out = out.replace(self.password, "*****")
        return code, out, err


def _mkdirs(sftp, remote_dir):
    parts = remote_dir.strip("/").split("/")
    for i in range(1, len(parts) + 1):
        current = "/" + "/".join(parts[:i])
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)


def versioned_html(text, stamp):
    """Point stylesheet and script links at a new URL.

    Cloudflare caches css and js separately for http and https. The page
    itself is not cached, so a new query on those links makes both schemes
    fetch the files just uploaded.
    """

    def repl(match):
        attr, quote, url = match.group(1), match.group(2), match.group(3)
        path = url.split("?", 1)[0].split("#", 1)[0]
        if "://" in url or url.startswith("//"):
            return match.group(0)
        if Path(path).suffix.lower() not in VERSIONED_EXT:
            return match.group(0)
        base, _, fragment = url.partition("#")
        if "?" in base:
            return match.group(0)
        updated = f"{base}?v={stamp}"
        if fragment:
            updated = f"{updated}#{fragment}"
        return f"{attr}={quote}{updated}{quote}"

    return re.sub(r"""\b(href|src)=(["'])([^"']+)\2""", repl, text)


def upload_site(ssh, remote_dir, log):
    missing = [name for name in SITE_FILES if not (PROJECT_ROOT / name).is_file()]
    if missing:
        raise RuntimeError("Missing site files: " + ", ".join(missing))
    stamp = time.strftime("%Y%m%d%H%M%S")
    sftp = ssh.client.open_sftp()
    try:
        _mkdirs(sftp, remote_dir)
        for name in SITE_FILES:
            local = PROJECT_ROOT / name
            remote = f"{remote_dir}/{name}"
            log(f"  upload {name}")
            if name in HTML_FILES:
                text = versioned_html(local.read_text(encoding="utf-8"), stamp)
                with sftp.file(remote, "wb") as handle:
                    handle.write(text.encode("utf-8"))
            else:
                sftp.put(str(local), remote)
    finally:
        sftp.close()
    log(f"  asset version {stamp} so http and https both load this upload")


def parse_snapshot(text):
    units = {}
    ports = set()
    section = None
    for raw in text.splitlines():
        line = raw.strip()
        if line == "PORTS":
            section = "ports"
            continue
        if line == "UNITS":
            section = "units"
            continue
        if not line or section is None:
            continue
        if section == "ports":
            # ss local address is the 4th field: 0.0.0.0:8000 or [::]:22
            fields = line.split()
            if len(fields) < 4:
                continue
            addr = fields[3]
            port_text = addr.rsplit(":", 1)[-1]
            if port_text.isdigit():
                ports.add(int(port_text))
        elif section == "units":
            name, _, state = line.partition(" ")
            units[name] = state.strip() or "unknown"
    return units, ports


SNAPSHOT_SCRIPT = r"""
echo PORTS
ss -ltnH || true
echo UNITS
for s in cloudflared trackwise nginx misio; do
  st=$(systemctl is-active "$s" 2>/dev/null || true)
  echo "$s ${st:-unknown}"
done
"""


def snapshot(ssh):
    code, out, err = ssh.run(SNAPSHOT_SCRIPT)
    if code != 0 and not out.strip():
        raise RuntimeError(f"Could not read service status from the Pi. {err.strip()}")
    return parse_snapshot(out)


def format_snapshot(units, ports):
    lines = []
    for name in NEIGHBOR_UNITS:
        lines.append(f"  {name}: {units.get(name, 'unknown')}")
    lines.append(f"  misio: {units.get('misio', 'unknown')}")
    for port, owner in NEIGHBOR_PORTS.items():
        mark = "listening" if port in ports else "down"
        lines.append(f"  port {port} ({owner}): {mark}")
    return "\n".join(lines)


def neighbour_regressions(before, after):
    before_units, before_ports = before
    after_units, after_ports = after
    problems = []
    for name in NEIGHBOR_UNITS:
        if before_units.get(name) == "active" and after_units.get(name) != "active":
            problems.append(f"{name} was active and is now {after_units.get(name, 'unknown')}")
    for port, owner in NEIGHBOR_PORTS.items():
        if port in before_ports and port not in after_ports:
            problems.append(f"port {port} ({owner}) stopped listening")
    return problems


def install_service(ssh, remote_dir, port, log):
    code, out, err = ssh.run("command -v python3")
    python_bin = out.strip().splitlines()[0].strip() if out.strip() else ""
    if code != 0 or not python_bin.startswith("/"):
        raise RuntimeError("python3 was not found on the Pi.")
    code, out, err = ssh.run(
        f"{shlex.quote(python_bin)} -c \"import sys; raise SystemExit(0 if sys.version_info >= (3, 7) else 1)\""
    )
    if code != 0:
        raise RuntimeError("The Pi needs Python 3.7 or newer to run serve.py.")

    code, out, err = ssh.run("command -v ss")
    if code != 0:
        raise RuntimeError("ss is not installed on the Pi, so the port check cannot run.")

    unit = service_unit(ssh.username, remote_dir, port, python_bin)
    sftp = ssh.client.open_sftp()
    try:
        with sftp.file("/tmp/misio.service", "wb") as handle:
            handle.write(unit.encode("utf-8"))
    finally:
        sftp.close()

    script = f"""
set -eu
PORT={port}
if ss -ltnH "sport = :$PORT" | grep -q .; then
  state=$(systemctl is-active {SERVICE_NAME} 2>/dev/null || true)
  if [ "$state" != "active" ]; then
    echo "PORT_BUSY"
    ss -ltnH "sport = :$PORT" || true
    exit 3
  fi
fi
install -m 644 /tmp/misio.service /etc/systemd/system/{SERVICE_NAME}.service
rm -f /tmp/misio.service
systemctl daemon-reload
systemctl enable {SERVICE_NAME}
systemctl restart {SERVICE_NAME}
ok=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if {shlex.quote(python_bin)} -c "import urllib.request; data=urllib.request.urlopen('http://127.0.0.1:{port}/', timeout=2).read(4000); raise SystemExit(0 if b'Misio' in data else 1)"; then
    ok=1
    break
  fi
  sleep 0.4
done
if [ "$ok" != "1" ]; then
  echo "SERVICE_FAILED"
  systemctl status {SERVICE_NAME} --no-pager || true
  journalctl -u {SERVICE_NAME} -n 40 --no-pager || true
  exit 4
fi
echo "SERVICE_OK"
"""
    log("Installing the misio service (other units are left running)...")
    code, out, err = ssh.sudo_bash(script, timeout=90)
    if out.strip():
        log(out.rstrip())
    if code != 0:
        detail = (err or out).strip()
        if "PORT_BUSY" in out:
            raise RuntimeError(
                f"Port {port} is already taken by something other than the misio service.\n{detail}"
            )
        raise RuntimeError(f"Could not start the misio service.\n{detail}")


def cloudflare_steps(domain, port):
    subdomain, _, zone = domain.partition(".")
    if not zone:
        subdomain, zone = "misio", "jbouquet.be"
    return f"""Add this public hostname once, on the existing tunnel:

  https://one.dash.cloudflare.com
  Networks -> Tunnels -> jbouquet -> Configure -> Public Hostname
  Subdomain: {subdomain}
  Domain:    {zone}
  Type:      HTTP
  URL:       localhost:{port}

Cloudflare creates the DNS record. Then open https://{domain}
"""


class DeployApp:
    def __init__(self):
        self.win = tk.Tk()
        self.win.title("Misio – deploy to Raspberry Pi")
        self.win.geometry("760x720")
        self.win.minsize(640, 560)
        self._busy = False
        self._save_timer = None

        cfg = load_config()
        root = ttk.Frame(self.win, padding=10)
        root.pack(fill=tk.BOTH, expand=True)

        ssh_frame = ttk.LabelFrame(root, text="SSH", padding=8)
        ssh_frame.grid(row=0, column=0, sticky=tk.EW)
        ssh_frame.columnconfigure(1, weight=1)

        ttk.Label(ssh_frame, text="Host").grid(row=0, column=0, sticky=tk.W, pady=2)
        self.host = ttk.Entry(ssh_frame)
        self.host.insert(0, cfg.get("host", "raspberrypi.local"))
        self.host.grid(row=0, column=1, sticky=tk.EW, padx=(8, 0), pady=2)

        ttk.Label(ssh_frame, text="SSH port").grid(row=1, column=0, sticky=tk.W, pady=2)
        self.ssh_port = ttk.Entry(ssh_frame, width=8)
        self.ssh_port.insert(0, str(cfg.get("ssh_port", "22")))
        self.ssh_port.grid(row=1, column=1, sticky=tk.W, padx=(8, 0), pady=2)

        ttk.Label(ssh_frame, text="User").grid(row=2, column=0, sticky=tk.W, pady=2)
        self.username = ttk.Entry(ssh_frame, width=24)
        self.username.insert(0, cfg.get("username", "pi"))
        self.username.grid(row=2, column=1, sticky=tk.W, padx=(8, 0), pady=2)

        ttk.Label(ssh_frame, text="Password").grid(row=3, column=0, sticky=tk.W, pady=2)
        self.password = ttk.Entry(ssh_frame, show="*")
        self.password.insert(0, cfg.get("password", ""))
        self.password.grid(row=3, column=1, sticky=tk.EW, padx=(8, 0), pady=2)

        ttk.Label(ssh_frame, text="SSH key").grid(row=4, column=0, sticky=tk.W, pady=2)
        key_row = ttk.Frame(ssh_frame)
        key_row.grid(row=4, column=1, sticky=tk.EW, padx=(8, 0), pady=2)
        key_row.columnconfigure(0, weight=1)
        self.key_path = ttk.Entry(key_row)
        self.key_path.insert(0, cfg.get("key_path", ""))
        self.key_path.grid(row=0, column=0, sticky=tk.EW)
        ttk.Button(key_row, text="...", width=3, command=self._browse_key).grid(row=0, column=1, padx=(4, 0))

        app_frame = ttk.LabelFrame(root, text="Misio on the Pi", padding=8)
        app_frame.grid(row=1, column=0, sticky=tk.EW, pady=(8, 0))
        app_frame.columnconfigure(1, weight=1)

        ttk.Label(app_frame, text="Remote folder").grid(row=0, column=0, sticky=tk.W, pady=2)
        self.remote_dir = ttk.Entry(app_frame)
        self.remote_dir.insert(0, cfg.get("remote_dir", "/home/pi/misio"))
        self.remote_dir.grid(row=0, column=1, sticky=tk.EW, padx=(8, 0), pady=2)

        ttk.Label(app_frame, text="App port").grid(row=1, column=0, sticky=tk.W, pady=2)
        self.app_port = ttk.Entry(app_frame, width=8)
        self.app_port.insert(0, str(cfg.get("app_port", DEFAULT_PORT)))
        self.app_port.grid(row=1, column=1, sticky=tk.W, padx=(8, 0), pady=2)

        ttk.Label(app_frame, text="Public name").grid(row=2, column=0, sticky=tk.W, pady=2)
        self.domain = ttk.Entry(app_frame)
        self.domain.insert(0, cfg.get("domain", DEFAULT_DOMAIN))
        self.domain.grid(row=2, column=1, sticky=tk.EW, padx=(8, 0), pady=2)

        ttk.Label(
            app_frame,
            text="Files go in that folder. The service listens on 127.0.0.1 only. Regenboog stays on 3000, TrackWise on 8000.",
            wraplength=680,
        ).grid(row=3, column=0, columnspan=2, sticky=tk.W, pady=(6, 0))

        buttons = ttk.Frame(root)
        buttons.grid(row=2, column=0, sticky=tk.EW, pady=10)
        self.deploy_btn = ttk.Button(buttons, text="Deploy and start", command=self._on_deploy)
        self.deploy_btn.pack(side=tk.LEFT)
        self.upload_btn = ttk.Button(buttons, text="Upload files only", command=self._on_upload)
        self.upload_btn.pack(side=tk.LEFT, padx=(8, 0))
        self.restart_btn = ttk.Button(buttons, text="Restart Misio", command=self._on_restart)
        self.restart_btn.pack(side=tk.LEFT, padx=(8, 0))
        self.check_btn = ttk.Button(buttons, text="Check other sites", command=self._on_check)
        self.check_btn.pack(side=tk.LEFT, padx=(8, 0))

        ttk.Label(root, text="Log").grid(row=3, column=0, sticky=tk.W)
        self.log_box = scrolledtext.ScrolledText(root, height=18, wrap=tk.WORD, font=("Consolas", 9))
        self.log_box.grid(row=4, column=0, sticky=tk.NSEW, pady=(4, 0))
        root.columnconfigure(0, weight=1)
        root.rowconfigure(4, weight=1)

        self._log_queue = queue.Queue()
        self.win.after(100, self._drain_log)
        for widget in (self.host, self.ssh_port, self.username, self.password, self.key_path, self.remote_dir, self.app_port, self.domain):
            widget.bind("<KeyRelease>", lambda _event: self._schedule_save())

    def log(self, message):
        self._log_queue.put(message)
        print(message)

    def _drain_log(self):
        try:
            while True:
                message = self._log_queue.get_nowait()
                self.log_box.insert(tk.END, message + "\n")
                self.log_box.see(tk.END)
        except queue.Empty:
            pass
        self.win.after(100, self._drain_log)

    def _browse_key(self):
        path = filedialog.askopenfilename(title="SSH private key")
        if path:
            self.key_path.delete(0, tk.END)
            self.key_path.insert(0, path)
            self._save_config()

    def _schedule_save(self):
        if self._save_timer:
            self.win.after_cancel(self._save_timer)
        self._save_timer = self.win.after(500, self._save_config)

    def _save_config(self):
        save_config(
            {
                "host": self.host.get().strip(),
                "ssh_port": self.ssh_port.get().strip() or "22",
                "username": self.username.get().strip() or "pi",
                "password": self.password.get(),
                "key_path": self.key_path.get().strip(),
                "remote_dir": self.remote_dir.get().strip(),
                "app_port": self.app_port.get().strip() or str(DEFAULT_PORT),
                "domain": self.domain.get().strip() or DEFAULT_DOMAIN,
            }
        )

    def _settings(self):
        try:
            ssh_port = int(self.ssh_port.get().strip() or "22")
            app_port = validate_port(int(self.app_port.get().strip() or str(DEFAULT_PORT)))
        except ValueError as exc:
            raise ValueError(str(exc) or "SSH port and app port must be numbers.") from exc
        username = self.username.get().strip() or "pi"
        host = self.host.get().strip()
        if not host:
            raise ValueError("Enter the Pi's host name or IP address.")
        password = self.password.get()
        key_path = self.key_path.get().strip()
        if not password and not (key_path and os.path.isfile(key_path)):
            raise ValueError("Enter the SSH password or choose a private key.")
        remote_dir = validate_remote_dir(self.remote_dir.get(), username)
        domain = self.domain.get().strip() or DEFAULT_DOMAIN
        return {
            "host": host,
            "ssh_port": ssh_port,
            "username": username,
            "password": password,
            "key_path": key_path,
            "remote_dir": remote_dir,
            "app_port": app_port,
            "domain": domain,
        }

    def _set_busy(self, busy):
        self._busy = busy
        state = tk.DISABLED if busy else tk.NORMAL
        for button in (self.deploy_btn, self.upload_btn, self.restart_btn, self.check_btn):
            button.configure(state=state)

    def _start(self, title, work):
        if self._busy:
            return
        try:
            settings = self._settings()
        except ValueError as exc:
            messagebox.showerror("Misio deploy", str(exc))
            return
        self._save_config()
        self.log_box.delete("1.0", tk.END)
        self.log(title)
        self._set_busy(True)

        def runner():
            error = None
            try:
                work(settings)
            except Exception as exc:
                error = str(exc)
                self.log(f"FAILED: {error}")
            def finish():
                self._set_busy(False)
                if error:
                    messagebox.showerror("Misio deploy", error)
            self.win.after(0, finish)

        threading.Thread(target=runner, daemon=True).start()

    def _connect(self, settings):
        ssh = SSH(
            settings["host"],
            settings["ssh_port"],
            settings["username"],
            settings["password"],
            settings["key_path"],
        )
        self.log(f"Connecting to {settings['username']}@{settings['host']}:{settings['ssh_port']}...")
        ssh.connect()
        self.log("Connected.")
        return ssh

    def _on_deploy(self):
        def work(settings):
            ssh = self._connect(settings)
            try:
                before = snapshot(ssh)
                self.log("Other sites before deploy:")
                self.log(format_snapshot(*before))
                self.log(f"Uploading site files to {settings['remote_dir']}...")
                upload_site(ssh, settings["remote_dir"], self.log)
                install_service(ssh, settings["remote_dir"], settings["app_port"], self.log)
                after = snapshot(ssh)
                self.log("Other sites after deploy:")
                self.log(format_snapshot(*after))
                problems = neighbour_regressions(before, after)
                if problems:
                    raise RuntimeError(
                        "Misio was updated, but a neighbouring service changed:\n" + "\n".join(problems)
                    )
                if after[0].get("misio") != "active":
                    raise RuntimeError("The misio service is not active after install.")
                self.log(f"Misio is serving http://127.0.0.1:{settings['app_port']}/ on the Pi.")
                if after[0].get("cloudflared") != "active":
                    self.log("cloudflared is not active. The public name will not answer until that service is running.")
                self.log(cloudflare_steps(settings["domain"], settings["app_port"]).rstrip())
            finally:
                ssh.close()

        self._start("Deploy Misio and start the service", work)

    def _on_upload(self):
        def work(settings):
            ssh = self._connect(settings)
            try:
                self.log(f"Uploading site files to {settings['remote_dir']}...")
                upload_site(ssh, settings["remote_dir"], self.log)
                self.log("Upload finished. The running service was not restarted.")
                self.log("Use Restart Misio to pick up the new files.")
            finally:
                ssh.close()

        self._start("Upload Misio files", work)

    def _on_restart(self):
        def work(settings):
            ssh = self._connect(settings)
            try:
                before = snapshot(ssh)
                self.log("Other sites before restart:")
                self.log(format_snapshot(*before))
                install_service(ssh, settings["remote_dir"], settings["app_port"], self.log)
                after = snapshot(ssh)
                self.log("Other sites after restart:")
                self.log(format_snapshot(*after))
                problems = neighbour_regressions(before, after)
                if problems:
                    raise RuntimeError(
                        "Misio was restarted, but a neighbouring service changed:\n" + "\n".join(problems)
                    )
            finally:
                ssh.close()

        self._start("Restart the Misio service", work)

    def _on_check(self):
        def work(settings):
            ssh = self._connect(settings)
            try:
                units, ports = snapshot(ssh)
                self.log(format_snapshot(units, ports))
                code, out, err = ssh.run("bash -lc 'command -v pm2 >/dev/null && pm2 status || true'")
                if out.strip():
                    self.log(out.rstrip())
                if units.get("cloudflared") != "active":
                    self.log("cloudflared is not active. The public names will not answer until that service is up.")
                self.log("Nothing was changed.")
            finally:
                ssh.close()

        self._start("Check the other sites", work)

    def run(self):
        self.win.protocol("WM_DELETE_WINDOW", self._on_close)
        self.win.mainloop()

    def _on_close(self):
        self._save_config()
        self.win.destroy()


if __name__ == "__main__":
    os.chdir(PROJECT_ROOT)
    DeployApp().run()
