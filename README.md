# Tab Out

**Keep tabs on your tabs.**

Tab Out replaces your Chrome new tab page with a lightweight dashboard for saving tabs for later. It starts as a clean checklist, shows archived items, and stays local to your machine.

Built for people who want a simple, local place to park things they want to revisit.

---

## Features

- **Save for later** -- bookmark individual tabs to a checklist before closing them
- **Active checklist + archive** -- keep a short list of current items and browse older saved tabs later
- **100% local** -- your browsing data never leaves your machine. No AI, no external API calls
- **Always on** -- starts automatically when you log in, runs silently in the background

---

## Manual Setup

Set up the project locally:

**1. Clone and install**

```bash
git clone https://github.com/crbrasfield/tab-out.git
cd tab-out
npm install
```

**2. Run the setup script**

```bash
npm run install-service
```

This creates `~/.mission-control/`, writes a default config, and installs an auto-start service for your platform (macOS Launch Agent, Linux systemd, or Windows Startup script).

**3. Load the Chrome extension**

1. Go to `chrome://extensions` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder from this repo

**4. Start the server**

```bash
npm start
```

Open a new tab -- you'll see Tab Out. The server auto-starts on future logins.

---

## Configuration

Config lives at `~/.mission-control/config.json`:

| Field | Default | What it does |
|-------|---------|-------------|
| `port` | `3456` | Local port for the dashboard |

---

## How it works

```
You open a new tab
  -> Chrome extension loads Tab Out in an iframe
  -> Dashboard shows your saved-for-later checklist
  -> You archive or dismiss items as you work through them
  -> Repeat
```

The server runs silently in the background. It starts on login and restarts if it crashes. You never think about it.

---

## Tech stack

| What | How |
|------|-----|
| Server | Node.js + Express |
| Database | better-sqlite3 (local SQLite) |
| Extension | Chrome Manifest V3 |
| Auto-start | macOS Launch Agent / Linux systemd / Windows Startup |
| Sound | Web Audio API (synthesized, no files) |
| Animations | CSS transitions + JS confetti particles |

---

## License

MIT
