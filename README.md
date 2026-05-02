# Harsh Makeovers API

Backend API for the Harsh Makeovers website. It is built with Express, TypeScript, Prisma, PostgreSQL, Supabase storage, JWT authentication, and Vitest.

## Tech Stack

- Node.js
- Express 5
- TypeScript
- Prisma
- PostgreSQL
- Supabase
- Vitest

## Getting Started

Install dependencies:

```bash
npm install
```

Create a `.env` file in the backend root:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
JWT_ACCESS_SECRET="replace-with-a-secure-access-secret"
JWT_REFRESH_SECRET="replace-with-a-secure-refresh-secret"
FRONTEND_URL="http://localhost:3000"
ALLOWED_ORIGINS="http://localhost:3000"
NODE_ENV="development"
PORT="5000"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
ADMIN_NOTIFICATION_EMAIL="admin@example.com"
SMTP_USER=""
SMTP_PASS=""
```

Run Prisma migrations:

```bash
npx prisma migrate dev
```

Seed the database:

```bash
npm run seed
```

Start the development server:

```bash
npm run dev
```

The API runs at:

```text
http://localhost:5000/api/v1
```

Health check:

```text
GET /api/v1/health
```

## Scripts

```bash
npm run dev
npm run seed
npm test
```

## API Areas

- Auth
- Users
- Services
- Bookings
- Reviews
- Portfolio
- Inquiries
- Admin

## Notes

Do not commit `.env`, logs, `node_modules`, build output, or local upload/runtime files. The repository includes a `.gitignore` to keep those files out of Git.

