"""Launch Misio: serve the page, open it, and keep a status log."""

from __future__ import annotations

import logging
import os
import platform
import queue
import socket
import sys
import threading
import time
import traceback
import webbrowser
from datetime import datetime
from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from socketserver import ThreadingMixIn
from urllib.error import URLError
from urllib.request import urlopen

try:
    from http.server import ThreadingHTTPServer
except ImportError:  # Python older than 3.7
    from http.server import HTTPServer

    class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
        daemon_threads = True

import tkinter as tk
from tkinter import ttk

ROOT = Path(__file__).resolve().parent
LOG_DIR = ROOT / "logs"
HOST = "127.0.0.1"
PREFERRED_PORT = 8765
PAGE_FILES = ("index.html", "app.js", "styles.css")

INK = "#1c1915"
MUTED = "#6f675e"
PAPER = "#f3efe7"
PANEL = "#fffdfb"
LINE = "#e2dcd2"
ACCENT = "#184e86"
OK = "#1d6b3a"
BAD = "#8d2b2b"


class MisioServer(ThreadingHTTPServer):
    """Local file server that can drop every open socket on shutdown."""

    daemon_threads = True

    def __init__(self, server_address, request_handler):
        super().__init__(server_address, request_handler)
        self.released = False
        self._clients = set()
        self._client_lock = threading.Lock()

    def process_request(self, request, client_address):
        with self._client_lock:
            self._clients.add(request)
        super().process_request(request, client_address)

    def shutdown_request(self, request):
        self._drop_client(request)
        super().shutdown_request(request)

    def _drop_client(self, request):
        with self._client_lock:
            self._clients.discard(request)

    def close_clients(self):
        with self._client_lock:
            clients = list(self._clients)
            self._clients.clear()
        for client in clients:
            _close_socket(client)

    def server_close(self):
        self.close_clients()
        super().server_close()


def _close_socket(sock):
    try:
        sock.shutdown(socket.SHUT_RDWR)
    except OSError:
        pass
    try:
        sock.close()
    except OSError:
        pass


class Handler(SimpleHTTPRequestHandler):
    """Serve the Misio folder and report each request to the launcher."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        if getattr(self.server, "released", False):
            return
        code = args[1] if len(args) > 1 else "-"
        level = logging.INFO
        try:
            if int(code) >= 400:
                level = logging.WARNING
        except (TypeError, ValueError):
            level = logging.INFO
        self.server.launcher.log(level, "%s %s", self.address_string(), fmt % args)
        self.server.launcher.note_request()

    def log_error(self, fmt, *args):
        if getattr(self.server, "released", False):
            return
        self.server.launcher.log(logging.ERROR, fmt % args)


class Launcher(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Misio")
        self.geometry("760x560")
        self.minsize(640, 460)
        self.configure(bg=PAPER)

        self.httpd = None
        self.thread = None
        self.started_at = None
        self.request_count = 0
        self.url = ""
        self.log_path = None
        self.logger = logging.getLogger("misio")
        self.logger.setLevel(logging.DEBUG)
        self.logger.propagate = False
        self.events = queue.Queue()
        self._release_lock = threading.Lock()

        self._build()
        self._open_logs()
        self.protocol("WM_DELETE_WINDOW", self._on_close)
        self.after(100, self._poll_events)
        self.after(500, self._tick)
        self.after(200, self.start_server)

    def _build(self):
        header = tk.Frame(self, bg=PANEL, highlightbackground=LINE, highlightthickness=1)
        header.pack(fill="x")
        brand = tk.Frame(header, bg=PANEL)
        brand.pack(fill="x", padx=16, pady=12)
        tk.Label(brand, text="Misio", bg=PANEL, fg=INK, font=("Segoe UI", 18, "bold")).pack(anchor="w")
        tk.Label(
            brand,
            text="A small flowchart editor",
            bg=PANEL,
            fg=MUTED,
            font=("Segoe UI", 10),
        ).pack(anchor="w")

        status = tk.Frame(self, bg=PAPER)
        status.pack(fill="x", padx=16, pady=(12, 6))
        self.state_label = tk.Label(status, text="Stopped", bg=PAPER, fg=MUTED, font=("Segoe UI", 12, "bold"))
        self.state_label.grid(row=0, column=0, sticky="w")
        self.url_value = tk.StringVar(value="Not started")
        url_entry = tk.Entry(
            status,
            textvariable=self.url_value,
            readonlybackground=PAPER,
            fg=INK,
            relief="flat",
            font=("Consolas", 11),
            state="readonly",
            width=48,
        )
        url_entry.grid(row=1, column=0, sticky="we", pady=(4, 0))
        status.columnconfigure(0, weight=1)

        facts = tk.Frame(self, bg=PAPER)
        facts.pack(fill="x", padx=16, pady=(0, 8))
        self.uptime_label = tk.Label(facts, text="Uptime: —", bg=PAPER, fg=MUTED, font=("Segoe UI", 9))
        self.uptime_label.pack(side="left")
        self.count_label = tk.Label(facts, text="Requests: 0", bg=PAPER, fg=MUTED, font=("Segoe UI", 9))
        self.count_label.pack(side="left", padx=(16, 0))
        self.error_label = tk.Label(facts, text="Last error: none", bg=PAPER, fg=MUTED, font=("Segoe UI", 9))
        self.error_label.pack(side="left", padx=(16, 0))

        buttons = tk.Frame(self, bg=PAPER)
        buttons.pack(fill="x", padx=16, pady=(0, 8))
        self.start_button = self._button(buttons, "Start", self.start_server)
        self.stop_button = self._button(buttons, "Stop", self.stop_server)
        self.open_button = self._button(buttons, "Open page", self.open_page)
        self.folder_button = self._button(buttons, "Open log folder", self.open_log_folder)
        for button in (self.start_button, self.stop_button, self.open_button, self.folder_button):
            button.pack(side="left", padx=(0, 6))
        self.stop_button.configure(state="disabled")
        self.open_button.configure(state="disabled")

        log_frame = tk.Frame(self, bg=PAPER)
        log_frame.pack(fill="both", expand=True, padx=16, pady=(0, 14))
        tk.Label(log_frame, text="Server log", bg=PAPER, fg=MUTED, font=("Segoe UI", 9)).pack(anchor="w")
        body = tk.Frame(log_frame, bg=PANEL, highlightbackground=LINE, highlightthickness=1)
        body.pack(fill="both", expand=True, pady=(4, 0))
        scroll = ttk.Scrollbar(body)
        scroll.pack(side="right", fill="y")
        self.log_view = tk.Text(
            body,
            height=16,
            wrap="word",
            bg=PANEL,
            fg=INK,
            relief="flat",
            font=("Consolas", 10),
            yscrollcommand=scroll.set,
            padx=8,
            pady=8,
        )
        self.log_view.pack(side="left", fill="both", expand=True)
        scroll.configure(command=self.log_view.yview)
        self.log_view.tag_configure("error", foreground=BAD)
        self.log_view.tag_configure("warning", foreground="#8a5a12")
        self.log_view.configure(state="disabled")
        self.log_path_label = tk.Label(log_frame, text="", bg=PAPER, fg=MUTED, font=("Segoe UI", 8))
        self.log_path_label.pack(anchor="w", pady=(4, 0))

    def _button(self, parent, text, command):
        return tk.Button(
            parent,
            text=text,
            command=command,
            bg=PANEL,
            fg=INK,
            activebackground="#f7f4ee",
            relief="solid",
            borderwidth=1,
            font=("Segoe UI", 10),
            padx=10,
            pady=4,
            cursor="hand2",
        )

    def _open_logs(self):
        LOG_DIR.mkdir(exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        session_path = LOG_DIR / f"misio-{stamp}.log"
        latest_path = LOG_DIR / "misio.log"
        formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s", "%Y-%m-%d %H:%M:%S")
        for path in (session_path, latest_path):
            handler = logging.FileHandler(path, mode="w", encoding="utf-8")
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)
        self.log_path = session_path
        self.log_path_label.configure(text=f"Log file: {session_path}")
        self.log(logging.INFO, "Misio launcher")
        self.log(logging.INFO, "Python %s", sys.version.replace("\n", " "))
        self.log(logging.INFO, "Platform %s", platform.platform())
        self.log(logging.INFO, "Folder %s", ROOT)

    def log(self, level, message, *args):
        self.logger.log(level, message, *args)
        try:
            text = message % args if args else message
        except TypeError:
            text = f"{message} {args}"
        self.events.put((level, text))

    def note_request(self):
        self.request_count += 1
        self.events.put(("count", self.request_count))

    def _poll_events(self):
        try:
            while True:
                kind, payload = self.events.get_nowait()
                if kind == "count":
                    self.count_label.configure(text=f"Requests: {payload}")
                elif kind == "state" and payload == "stopped":
                    self._mark_stopped()
                elif kind == "state" and payload == "crashed":
                    self._mark_crashed()
                else:
                    self._append_log(kind, payload)
        except queue.Empty:
            pass
        self.after(100, self._poll_events)

    def _append_log(self, level, text):
        stamp = datetime.now().strftime("%H:%M:%S")
        line = f"{stamp} {logging.getLevelName(level):<8} {text}\n"
        tag = "error" if level >= logging.ERROR else "warning" if level >= logging.WARNING else ""
        self.log_view.configure(state="normal")
        if tag:
            self.log_view.insert("end", line, tag)
        else:
            self.log_view.insert("end", line)
        if level >= logging.ERROR:
            self.error_label.configure(text=f"Last error: {text}", fg=BAD)
        self.log_view.see("end")
        self.log_view.configure(state="disabled")

    def _set_state(self, text, color):
        self.state_label.configure(text=text, fg=color)

    def start_server(self):
        if self.httpd is not None:
            return
        missing = [name for name in PAGE_FILES if not (ROOT / name).is_file()]
        if missing:
            self._set_state("Error", BAD)
            self.log(logging.ERROR, "Missing page files: %s", ", ".join(missing))
            return
        port = self._choose_port()
        try:
            self.httpd = MisioServer((HOST, port), Handler)
        except OSError as exc:
            self.httpd = None
            self._set_state("Error", BAD)
            self.log(logging.ERROR, "Could not start the server: %s", exc)
            return
        self.httpd.launcher = self
        self.httpd.daemon_threads = True
        bound_host, bound_port = self.httpd.server_address
        self.url = f"http://{bound_host}:{bound_port}/"
        self.url_value.set(self.url)
        self.started_at = datetime.now()
        self.request_count = 0
        self.count_label.configure(text="Requests: 0")
        self.error_label.configure(text="Last error: none", fg=MUTED)
        self.thread = threading.Thread(target=self._serve, name="misio-server", daemon=True)
        self.thread.start()
        self._set_state("Running", OK)
        self.start_button.configure(state="disabled")
        self.stop_button.configure(state="normal")
        self.open_button.configure(state="normal")
        self.log(logging.INFO, "Serving %s", self.url)
        if port != PREFERRED_PORT:
            self.log(logging.WARNING, "Port %s was busy, so this session uses %s", PREFERRED_PORT, port)
        threading.Thread(target=self._check_page, name="misio-check", daemon=True).start()
        self.open_page()

    def _choose_port(self):
        for port in range(PREFERRED_PORT, PREFERRED_PORT + 20):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                try:
                    probe.bind((HOST, port))
                except OSError:
                    continue
                return port
        return 0

    def _serve(self):
        try:
            self.httpd.serve_forever(poll_interval=0.2)
        except OSError:
            if self.httpd is None or not self.httpd.released:
                self.log(logging.ERROR, "Server thread crashed:\n%s", traceback.format_exc())
                self.events.put(("state", "crashed"))
        except Exception:
            self.log(logging.ERROR, "Server thread crashed:\n%s", traceback.format_exc())
            self.events.put(("state", "crashed"))

    def _mark_crashed(self):
        self._set_state("Error", BAD)
        self.httpd = None
        self.start_button.configure(state="normal")
        self.stop_button.configure(state="disabled")
        self.open_button.configure(state="disabled")

    def _check_page(self):
        last_error = None
        for _ in range(10):
            try:
                with urlopen(self.url, timeout=2) as response:
                    self.log(logging.INFO, "Page check returned %s", response.status)
                    return
            except (URLError, TimeoutError, OSError) as exc:
                last_error = exc
                time.sleep(0.1)
        self.log(logging.ERROR, "Page check failed: %s", last_error)

    def stop_server(self):
        httpd = self.httpd
        if httpd is None:
            return
        self.log(logging.INFO, "Stopping server")
        threading.Thread(
            target=self._shutdown,
            args=(httpd, self.thread),
            name="misio-stop",
            daemon=True,
        ).start()

    def _shutdown(self, httpd, thread):
        try:
            self._release_server(httpd)
            if thread is not None:
                thread.join(timeout=2)
        except Exception:
            self.log(logging.ERROR, "Stop failed:\n%s", traceback.format_exc())
        self.events.put(("state", "stopped"))

    def _release_server(self, httpd):
        """Stop accepting, close open connections, and free the listen port."""
        if httpd is None:
            return
        with self._release_lock:
            if httpd.released:
                return
            httpd.released = True
            stopper = threading.Thread(target=self._stop_accepting, args=(httpd,), name="misio-shutdown", daemon=True)
            try:
                httpd.close_clients()
                stopper.start()
                stopper.join(timeout=2)
            finally:
                try:
                    httpd.server_close()
                except OSError:
                    pass
                stopper.join(timeout=1)

    def _stop_accepting(self, httpd):
        try:
            httpd.shutdown()
        except Exception:
            self.logger.exception("Could not shut down the accept loop")

    def _mark_stopped(self):
        self.httpd = None
        self.thread = None
        self.started_at = None
        self.url_value.set("Not started")
        self._set_state("Stopped", MUTED)
        self.uptime_label.configure(text="Uptime: —")
        self.start_button.configure(state="normal")
        self.stop_button.configure(state="disabled")
        self.open_button.configure(state="disabled")
        self.log(logging.INFO, "Server stopped")

    def open_page(self):
        if not self.url:
            self.log(logging.WARNING, "There is no page to open yet")
            return
        opened = webbrowser.open(self.url)
        if opened:
            self.log(logging.INFO, "Opened %s", self.url)
        else:
            self.log(logging.ERROR, "The browser did not open. Use %s", self.url)

    def open_log_folder(self):
        LOG_DIR.mkdir(exist_ok=True)
        self.log(logging.INFO, "Opening log folder %s", LOG_DIR)
        if sys.platform == "win32":
            os.startfile(LOG_DIR)  # type: ignore[attr-defined]
            return
        import subprocess

        command = ["open", str(LOG_DIR)] if sys.platform == "darwin" else ["xdg-open", str(LOG_DIR)]
        subprocess.run(command, check=False)

    def _tick(self):
        if self.started_at is not None:
            elapsed = datetime.now() - self.started_at
            total = int(elapsed.total_seconds())
            self.uptime_label.configure(text=f"Uptime: {total // 3600:02d}:{(total % 3600) // 60:02d}:{total % 60:02d}")
        self.after(500, self._tick)

    def _on_close(self):
        httpd = self.httpd
        thread = self.thread
        self.log(logging.INFO, "Launcher closing")
        try:
            self._release_server(httpd)
            if thread is not None and thread.is_alive():
                thread.join(timeout=2)
        except Exception:
            self.logger.exception("Could not stop the server while closing")
        self._close_logs()
        self.destroy()

    def _close_logs(self):
        for handler in list(self.logger.handlers):
            try:
                handler.flush()
                handler.close()
            except OSError:
                pass
            self.logger.removeHandler(handler)


def main():
    Launcher().mainloop()


if __name__ == "__main__":
    main()
