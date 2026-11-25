# BuildTech projects dashboard

The platform owner's dashboard: every customer of every product, the plans on
offer, subscriptions and payments, suspending a customer, and opening a
customer's own dashboard.

It is the private half of the `buildtech-projects` platform. The two are
separate projects on separate addresses that share one database.

## How it fits together

- **The database** is created by the platform project (`npm run migrate`
  there). This dashboard reads and writes the tables that are the same for
  every product: accounts, plans, payments, sign-ins, and the event log.
- **Products** are owned by the platform. This dashboard asks the platform
  which products exist and what to ask when creating a customer
  (`src/lib/products.ts`), so a new product appears here with no change to
  this code. Product-specific work is done by the platform through its
  private `/internal` routes, guarded by a secret both projects hold.
- **Opening a customer's dashboard** sends the browser to the platform with a
  one-use pass (`createDashboardPass` in `src/lib/platform.ts`).

## Settings

Three values, the same on the host as in `.env` for local work:

- `DATABASE_URL` — the same database as the platform.
- `PLATFORM_URL` — where the platform is published.
- `INTERNAL_API_SECRET` — the same value as in the platform project.

For local work, run the platform project first (`npm run dev` there). It
serves its demo database on this machine, and `.env` here points at it:

```
DATABASE_URL=postgresql://postgres@127.0.0.1:54330/postgres
PLATFORM_URL=http://localhost:4340
INTERNAL_API_SECRET=<the same value as in the platform's .env>
```

The demo owner sign-in is in the platform's `src/lib/dev-seed.ts`. That
local database answers one query at a time, which is why `src/lib/db.ts`
queues queries when it is in use; a real database has no such limit.

## Run it

```
npm install
npm run dev
```

## The first owner account

Put the three settings in `.env.deploy` (ignored by git), then:

```
npm run create-owner -- <email> "<name>"
```

It prints a one-time password for that account.

## Keep in step with the platform

`src/lib/passwords.ts` must hash exactly as the platform's `src/lib/auth.ts`
does, and `src/lib/accounts.ts` must match its accounts table.
`src/styles/app.css` is a copy of the platform's stylesheet.
