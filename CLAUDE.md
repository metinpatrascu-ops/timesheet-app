# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # install dependencies
npm start         # production server (node server.js)
npm run dev       # development with auto-reload (nodemon)
```

No test runner is configured.

## Architecture

This is a single-file Node.js/Express app. All server logic — Mongoose schemas, auth middleware, and every route — lives in [`server.js`](server.js). The frontend is two static HTML files served from `public/`.

**MongoDB schemas (defined inline in server.js):**
- `User` — email, bcrypt-hashed password, `name`, `position` (job title, e.g. "Barman"), `role` (`employee` | `manager` | `admin`)
- `Timesheet` — per-day record per user with `checkIn`, `checkOut`, nested `breaks[]`, `status` (`pending` | `approved` | `rejected`), and a transient `currentBreakStart` field (not in schema but set directly on documents)
- `Notification` — in-app notification per user (`message`, `read`)
- `Leave` — leave/vacation period per user (`startDate`, `endDate`, `type`, `notes`)

**Auth:** JWT tokens, 7-day expiry, sent as `Authorization: Bearer <token>`. `verifyToken` middleware attaches `req.userId`. Manager/admin role checks are done inline in each manager route (no shared middleware for role enforcement).

**Email:** transactional emails (welcome, approve/reject, timesheet changes, leave) are sent via the Brevo REST API over HTTPS (`brevoSend` helper; API key in `BREVO_PASS` env var). SMTP is not used — Render blocks SMTP ports. Emails are fire-and-forget: never `await` them before sending the HTTP response.

**API surface:**
- `POST /api/auth/register|login`, `GET /api/auth/me`
- `POST /api/timesheet/checkin|checkout`, `POST /api/timesheet/break/start|end`, `GET /api/timesheet/today|history`
- `GET /api/manager/pending-approvals`, `POST /api/manager/approve/:id`, `POST /api/manager/reject/:id`, `GET /api/manager/team-timesheets`
- `POST /api/manager/create-employee` (accepts `role` + `position`), `PUT|DELETE /api/manager/employee/:id`
- `POST /api/manager/add-timesheet`, `PUT|DELETE /api/manager/timesheet/:id` (dates parsed with dynamic Europe/Bucharest offset — server runs UTC on Render)
- `POST /api/manager/leave`, `GET /api/manager/leaves`, `DELETE /api/manager/leave/:id`
- `GET /api/notifications`, `POST /api/notifications/:id/read`
- `GET /api/admin/employees`, `GET /api/health` (used by the self-ping keep-alive that prevents Render free tier from sleeping)

**Frontend:**
- [`public/index.html`](public/index.html) — employee app (check-in/out, breaks, calendar, approval status)
- [`public/manager.html`](public/manager.html) — manager dashboard (approvals, team stats, employee list, leaves, Excel import)

Both pages call the API directly with `fetch`, storing the JWT in `localStorage`.

**PWA:** both pages are installable as standalone apps. Two manifests — `public/manifest.json` (employee app, start_url `/`) and `public/manifest-manager.json` (manager app, start_url `/manager.html`) — share icons (`icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png`) and one service worker (`public/sw.js`: network-first with cache fallback for static files, `/api/` never intercepted).

**Environment (`.env`):**
```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/timesheet
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
NODE_ENV=development
```

**Test accounts:** `emp@test.com` / `test123` and `manager@test.com` / `test123`
