# Quick Start: Authentication Setup

## Step 1: Add Users Table

If you already have the database, run the migration:

```bash
psql -h your-rds-endpoint -U your-user -d bola8 -f lib/db/migrations/001_add_users_table.sql
```

Or the users table is already in the updated `lib/db/schema.sql` if you run it fresh.

## Step 2: Set AUTH_SECRET

Add to `.env.local`:

```bash
AUTH_SECRET=your-very-long-random-secret-key-minimum-32-characters
```

Generate one:
```bash
openssl rand -base64 32
```

## Step 3: Create First User

```bash
node scripts/create-user.js admin@bola8.com "Admin User" "YourPassword123!" admin
```

## Step 4: Test

1. Start app: `npm run dev`
2. Go to `http://localhost:3000` → redirects to `/login`
3. Login with your credentials
4. You should see your name in the header

## Done! ✅

All routes are now protected. Users must login to access the application.

