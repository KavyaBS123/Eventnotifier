# Real-Time Event Intelligence System

A full-stack system that scrapes Bangalore tech events (Hackathons, AI meetups, Startups) from Devfolio, Devpost, Meetup, and Luma — and delivers real-time notifications via a **Chrome Extension** and **Email**.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Backend (Node.js)                  │
│                                                         │
│  Express API  ◄───► PostgreSQL (Prisma ORM)             │
│       │                     ▲                           │
│  BullMQ Worker ──► Scrapers─┘                           │
│       │            (Playwright)                         │
│       └──► Nodemailer (Email Alerts)                    │
└─────────────────────────────────────────────────────────┘
          ▲                     ▲
          │ REST API             │ REST API
┌─────────┴──────────┐  ┌───────┴──────────┐
│  Chrome Extension  │  │   Direct Access   │
│  (Manifest v3)     │  │   (curl / browser)│
└────────────────────┘  └──────────────────┘
```

---

## Quick Start

### 1. Start Services (PostgreSQL + Redis)

```bash
docker-compose up -d
```

### 2. Set Up Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your email credentials

npm install
npx playwright install chromium  # Install browser for scraping
npm run db:generate               # Generate Prisma client
npm run db:migrate                # Create tables
```

### 3. Run the Backend API

```bash
npm run dev
# API available at http://localhost:3001
```

### 4. Run the Background Worker (separate terminal)

```bash
npm run worker
# Scrapes all sources every 30 minutes
# Also triggers an immediate scrape on startup
```

### 5. Manually Trigger a Scrape

```bash
# Option A: via npm script
npm run scrape:now

# Option B: via API
curl -X POST http://localhost:3001/api/scrape/trigger
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/events` | List events (with filters) |
| GET | `/api/events/new?since=<ISO>` | Events added after timestamp |
| POST | `/api/subscribe` | Subscribe to email alerts |
| POST | `/api/scrape/trigger` | Manually trigger a scrape |

### Query Params for `GET /api/events`

| Param | Example | Description |
|-------|---------|-------------|
| `page` | `1` | Page number |
| `limit` | `20` | Items per page |
| `tags` | `hackathon,ai` | Filter by tags (CSV) |
| `source` | `Devfolio` | Filter by source |
| `search` | `AI Bootcamp` | Text search |
| `upcoming` | `true` | Only future events |

---

## Chrome Extension

### Loading the Extension

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder

### How It Works

- Polls `GET /api/events/new` every **5 minutes** using `chrome.alarms`
- Shows a **native Chrome notification** for each new event
- Clicking the notification button opens the event link
- The **popup** shows all upcoming events with tag filters
- Subscribe to email alerts directly from the popup

### Icons

Place PNG icons in `extension/icons/`:
- `icon16.png` (16×16)
- `icon48.png` (48×48)  
- `icon128.png` (128×128)

You can generate placeholder icons by running:
```bash
node extension/generate-icons.js
```

---

## Email Configuration

Edit `backend/.env`:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_gmail@gmail.com
EMAIL_PASS=your_app_password   # From Google App Passwords
EMAIL_FROM="Event Notifier <your_gmail@gmail.com>"
```

> **Note**: Use a [Gmail App Password](https://myaccount.google.com/apppasswords), not your account password.

### Test Email

```bash
# In node REPL or a quick script:
const { sendTestEmail } = require('./src/services/email');
sendTestEmail('recipient@email.com');
```

---

## Project Structure

```
eventnotifier/
├── docker-compose.yml
├── backend/
│   ├── .env.example
│   ├── package.json
│   ├── prisma/
│   │   └── schema.prisma
│   └── src/
│       ├── server.js
│       ├── queue/
│       │   ├── producer.js
│       │   └── worker.js
│       ├── scrapers/
│       │   ├── index.js       # Orchestrator + dedup
│       │   ├── devfolio.js
│       │   ├── devpost.js
│       │   ├── luma.js
│       │   └── meetup.js
│       └── services/
│           ├── email.js
│           └── deduplication.js
└── extension/
    ├── manifest.json
    ├── background.js
    ├── popup.html
    ├── popup.js
    ├── popup.css
    └── icons/
        ├── icon16.png
        ├── icon48.png
        └── icon128.png
```

---

## Deduplication Logic

Events are considered duplicates if:
1. **Exact URL match** — same `link` field
2. **Title similarity ≥ 75%** — using `string-similarity` Dice coefficient

---

## Adding a New Scraper

1. Create `backend/src/scrapers/yoursite.js` — export an async function returning `Event[]`
2. Import and add it to the `scrapers` array in `backend/src/scrapers/index.js`

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Prisma connection error | Ensure `docker-compose up -d` is running |
| Playwright timeout | Run `npx playwright install chromium` |
| No notifications in Chrome | Ensure backend is on port 3001; check `host_permissions` in manifest |
| Email not sending | Verify App Password; check `EMAIL_USER`/`EMAIL_PASS` in `.env` |
