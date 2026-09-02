# Payambar

Payambar is an elegant, minimal, and secure real-time messenger built with Go and Vue.js. It delivers real-time messaging, end-to-end encryption, and peer-to-peer voice calling inside a single self-contained binary.

---

## About Payambar

Payambar aims to make private communication simple and accessible. With zero runtime dependencies, embedded frontend assets, and an automated SQLite database, you can deploy a full-featured messenger to any Linux server or Docker container in seconds.

### Key Features

- **⚡ Real-Time Messaging** — Instant messaging powered by WebSockets with sent, delivered, and read indicators.
- **🔒 End-to-End Encryption** — Client-side encrypted text messages ensuring your conversations remain private.
- **📞 Voice Calling** — Crystal clear WebRTC audio calls with ringing status, in-app audio feedback, and microphone controls.
- **📦 Single Binary Deployment** — The entire frontend is compiled into the Go binary. No Node.js or reverse proxy needed to get started.
- **🔔 Web Push Notifications** — Receive incoming message and call alerts even when your browser is closed.
- **📱 Progressive Web App (PWA)** — Installable on desktop and mobile devices with full RTL and Farsi support.

---

## Quick Start

### 1. Linux (systemd)

Install the latest release with one command on Debian, Ubuntu, or any systemd-based Linux distribution:

```bash
curl -fsSL https://raw.githubusercontent.com/4xmen/payambar/main/install.sh | sudo bash -s -- --install
```

To upgrade an existing installation to the latest version:

```bash
curl -fsSL https://raw.githubusercontent.com/4xmen/payambar/main/install.sh | sudo bash -s -- --update
```

**Managing the service:**

```bash
# Check service status
sudo systemctl status payambar

# View live logs
sudo journalctl -u payambar -f

# Restart service after editing .env
sudo systemctl restart payambar
```

### 2. Docker Compose

Run Payambar with Docker Compose:

```bash
mkdir payambar && cd payambar
curl -O https://raw.githubusercontent.com/4xmen/payambar/main/docker-compose.yml
docker-compose up -d
```

Open `http://<server-ip>:8080` in your browser.

### 3. Local Development

Prerequisites: Go 1.25+, Node.js 20+, and Make.

```bash
# Clone the repository
git clone https://github.com/4xmen/payambar.git
cd payambar

# Build frontend and start the development server
make dev
```

---

## Configuration

Payambar is configured using environment variables or a `.env` file located in your installation directory (`/opt/payambar/.env`):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP and WebSocket server port |
| `ENVIRONMENT` | `production` | Environment mode (`production` or `development`) |
| `DATABASE_PATH` | `/opt/payambar/data/payambar.db` | Path to the SQLite database file |
| `FILE_STORAGE_PATH` | `/opt/payambar/data/uploads` | Directory for uploaded files |
| `JWT_SECRET` | *(auto-generated)* | Secret key used for signing authentication tokens |
| `CORS_ORIGINS` | `*` | Allowed CORS origins for API requests |
| `MAX_UPLOAD_SIZE` | `10485760` | Maximum file upload size in bytes (default: 10 MB) |
| `STUN_SERVERS` | `stun:stun.l.google.com:19302` | STUN server address for WebRTC NAT traversal |
| `TURN_ENABLED` | `false` | Enable the embedded TURN relay server |
| `TURN_SERVER` | *(empty)* | Custom external TURN server URL |
| `TURN_USERNAME` | *(empty)* | TURN authentication username |
| `TURN_PASSWORD` | *(empty)* | TURN authentication password |
| `TURN_REALM` | `payambar.local` | Embedded TURN realm |
| `TURN_LISTEN_PORT` | `3478` | Embedded TURN listen port (TCP and UDP) |
| `TURN_RELAY_MIN_PORT` | `49152` | Embedded TURN relay port range start |
| `TURN_RELAY_MAX_PORT` | `49252` | Embedded TURN relay port range end |
| `VAPID_PUBLIC_KEY` | *(auto-generated)* | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | *(auto-generated)* | Web Push VAPID private key |

---

## Troubleshooting

- **Service failed to start:** Check the recent logs with `sudo journalctl -u payambar -n 50`.
- **Port conflicts:** Change `PORT=8080` in `/opt/payambar/.env` to another port and restart the service.
- **Push notifications:** Web Push requires an **HTTPS** connection (or `localhost`).

---

## License

Payambar is open-source software licensed under the [GNU General Public License v3.0](LICENSE).
