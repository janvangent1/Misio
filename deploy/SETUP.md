# Misio on the Raspberry Pi

On the Pi, `serve.py` serves the editor and stores reports. It listens on `127.0.0.1` only, and the existing Cloudflare tunnel publishes it.

```
Browser
  └── Cloudflare Tunnel (jbouquet)
        ├── regenboog.jbouquet.be  →  localhost:3000
        ├── trackwise.jbouquet.be  →  localhost:8000
        └── misio.jbouquet.be      →  localhost:8765
```

The deployer writes two things:

- the site files in `/home/pi/misio`
- the systemd unit `/etc/systemd/system/misio.service`

HTTP and HTTPS are the same service. Cloudflare had been keeping a separate copy of the stylesheet for each, so each upload adds a new version to the stylesheet and script links. Both addresses then load the files just uploaded.

It leaves nginx, cloudflared, regenboog, and trackwise as it found them. Regenboog stays on port 3000 (pm2). TrackWise stays on port 8000 (systemd). Misio uses port 8765. Reports stay in `reports.json` on the Pi, and the admin page is `/admin.html`. The first sign-in is user `admin` and password `100`. A later deploy does not upload `reports.json` or `admin.json`, so those stay on the Pi.

## One-time Cloudflare hostname

The tunnel is managed in the Cloudflare dashboard, so this step is manual. Do it once, after the service is running.

1. Open [https://one.dash.cloudflare.com](https://one.dash.cloudflare.com)
2. **Networks** → **Tunnels**
3. Tunnel `jbouquet` → **⋯** → **Configure**
4. **Public Hostname** → **Add a public hostname**
5. Fill in:
   - **Subdomain:** `misio`
   - **Domain:** `jbouquet.be`
   - **Path:** empty
   - **Service type:** `HTTP`
   - **URL:** `localhost:8765`
6. **Save hostname**

Cloudflare creates the DNS record. Nothing else is required in the DNS tab, and no second tunnel is required.

Then open `https://misio.jbouquet.be`.

## Deploy from this PC

```powershell
py -3 -m venv deploy/.venv
deploy/.venv/Scripts/python -m pip install -r deploy/requirements.txt
deploy/.venv/Scripts/python deploy/deploy_misio.py
```

Fill in the Pi's SSH host, user, and password (or a key). **Deploy and start** uploads the site and installs the service.

Later updates are the same button: it uploads the files again and restarts only `misio`.

The window remembers the last settings in `deploy/deploy_config.json`, including the SSH password. That file is gitignored.

## What gets uploaded

`serve.py`, `admin.html`, `index.html`, `styles.css`, `app.js`, `lang.js`, `arei.js`, `network.js`, `schematic.js`, `visio.js`, `favicon.svg`, `favicon.ico`, and `eendraadschema.json`.

`misio.py` stays on the PC. It is the desktop launcher.

## Checks the script runs

Before it restarts anything, it records whether cloudflared, trackwise, nginx, and the regenboog/trackwise ports are up. After the restart it records them again. If one of those drops, the log says so.

On the Pi, Misio itself is checked with a request to `http://127.0.0.1:8765/`.

## Useful commands on the Pi

```bash
systemctl status misio
journalctl -u misio -n 50 --no-pager
curl -I http://127.0.0.1:8765/
systemctl status cloudflared
```

Drawings still download as JSON in the browser. Reports sent from the editor are stored by `serve.py` on the Pi.
