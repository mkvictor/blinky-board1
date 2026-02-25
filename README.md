# Laptop Repair App (Postgres Edition)

A free-first starter app for laptop repair shops where clients can:

- Open a ticket for a laptop issue.
- Track motherboard repair progress.
- Receive in-app alerts when repair is complete.
- Pay in-app (payment confirmation flow).

## Tech Stack

- Node.js built-in `http` server
- PostgreSQL database (directly, no ORM)
- Vanilla HTML/CSS/JS frontend

## Prerequisites

- Node.js 20+
- `psql` CLI available on your PATH
- Running PostgreSQL database

## Run Locally

Set `DATABASE_URL` first:

```bash
export DATABASE_URL='postgres://postgres:postgres@localhost:5432/laptop_repair'
npm run start
```

Open http://localhost:3000.

The app auto-creates required tables on startup.

## API Endpoints

- `POST /api/tickets` - Create client ticket.
- `GET /api/tickets` - List all tickets.
- `GET /api/tickets/:id` - Get one ticket.
- `PATCH /api/tickets/:id/progress` - Technician updates motherboard status/progress.
- `GET /api/notifications?email=<email>` - Fetch client alerts.
- `POST /api/tickets/:id/pay` - Mark payment as complete.

## Notes for Free Deployment

- Use Neon or Supabase free Postgres.
- Keep this app on a free host (Vercel/Render/Fly/Cloudflare Workers with API proxy).
- Configure `DATABASE_URL` in the host environment variables.
