# Cal's Personal Dashboard 🐱

A web dashboard for monitoring and interacting with Cal, the productive cat agent running on a Raspberry Pi.

## Live URL

**https://cal-client.com**

## Features

### Left Sidebar
- **Cal** logo with animated status indicator (connected/disconnected)
- Full navigation menu:
  - Dashboard - Overview and stats
  - Chat - Full chat interface
  - DNA - Edit SOUL.md, IDENTITY.md, USER.md
  - Memory - Browse/edit MEMORY.md and daily notes
  - Skills - View available skills
  - Cron Jobs - View scheduled tasks
  - Schedule, Goals, To Do, Mission Queue - Placeholders
  - Settings - Configuration

### Main Content Area
- **Dashboard**: Status overview, recent activity, token usage, current work, queued tasks
- **Chat**: Full WebSocket-based chat interface with Cal
- **DNA Editor**: View and edit core identity files
- **Memory Browser**: Browse daily notes and edit long-term memory
- **Skills List**: View available skill modules
- **Cron Jobs**: View active scheduled tasks

### Right Side Chat (Desktop)
- Expandable/collapsible quick chat window
- Minimizes to thin bar on right edge
- Voice input using Web Speech API
- Real-time WebSocket connection

## Tech Stack
- **Backend**: Node.js + Express
- **Frontend**: Vanilla HTML/CSS/JS
- **WebSocket**: ws library proxying to OpenClaw gateway
- **Styling**: Custom CSS with dark theme
- **Font**: Inter (Google Fonts)

## Architecture

```
Browser → Cloudflare (cal-client.com) → cloudflared tunnel → :3000 (Dashboard)
                                                          ↓
                                                    WebSocket proxy
                                                          ↓
                                              OpenClaw Gateway :18789
```

## Local Development

```bash
cd /home/dbowman/.openclaw/workspace/cal-dashboard
npm install
npm start
# Visit http://localhost:3000
```

## Services

The dashboard runs as a systemd service:

```bash
sudo systemctl status cal-dashboard  # Check status
sudo systemctl restart cal-dashboard # Restart
sudo journalctl -u cal-dashboard -f  # View logs
```

Cloudflare tunnel:
```bash
sudo systemctl status cloudflared    # Check tunnel status
sudo systemctl restart cloudflared   # Restart tunnel
```

## Configuration

- **Dashboard port**: 3000 (configurable via PORT env)
- **Gateway**: ws://127.0.0.1:18789
- **Gateway token**: Configured in server.js

## Authentication

See `CLOUDFLARE-ACCESS-SETUP.md` for instructions on setting up Cloudflare Access email authentication.

## Files

```
cal-dashboard/
├── server.js          # Express server + WebSocket proxy
├── package.json       # Dependencies
├── public/
│   ├── index.html     # Main HTML
│   ├── styles.css     # All styles (dark theme)
│   └── app.js         # Frontend JavaScript
├── README.md          # This file
└── CLOUDFLARE-ACCESS-SETUP.md
```

## Responsive Design

- Desktop: Full 3-column layout with side chat
- Tablet: Collapsible side chat
- Mobile: Hamburger menu, bottom chat button

Tested for iPhone 14 Plus and Mac Air M2 (Chrome).
