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
- `User` — email, bcrypt-hashed password, `role` (`employee` | `manager` | `admin`)
- `Timesheet` — per-day record per user with `checkIn`, `checkOut`, nested `breaks[]`, `status` (`pending` | `approved` | `rejected`), and a transient `currentBreakStart` field (not in schema but set directly on documents)

**Auth:** JWT tokens, 7-day expiry, sent as `Authorization: Bearer <token>`. `verifyToken` middleware attaches `req.userId`. Manager/admin role checks are done inline in each manager route (no shared middleware for role enforcement).

**API surface:**
- `POST /api/auth/register|login`, `GET /api/auth/me`
- `POST /api/timesheet/checkin|checkout`, `POST /api/timesheet/break/start|end`, `GET /api/timesheet/today|history`
- `GET /api/manager/pending-approvals`, `POST /api/manager/approve/:id`, `POST /api/manager/reject/:id`, `GET /api/manager/team-timesheets`
- `GET /api/admin/employees`

**Frontend:**
- [`public/index.html`](public/index.html) — employee app (check-in/out, breaks, calendar, approval status)
- [`public/manager.html`](public/manager.html) — manager dashboard (approvals, team stats, employee list)

Both pages call the API directly with `fetch`, storing the JWT in `localStorage`.

**Environment (`.env`):**
```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/timesheet
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
NODE_ENV=development
```

**Test accounts:** `emp@test.com` / `test123` and `manager@test.com` / `test123`
