# Authentication Setup Guide

The Bola8 Operations Platform uses session-based authentication with JWT tokens stored in secure HTTP-only cookies.

## Overview

- **Authentication**: Email/password based
- **Session Management**: JWT tokens in HTTP-only cookies
- **Session Duration**: 7 days
- **Roles**: `admin`, `designer`, `viewer`

## Step 1: Add Users Table to Database

If you already ran the schema, you need to add the users table:

### Option A: Run Migration Script

```bash
psql -h your-rds-endpoint -U your-user -d bola8 -f lib/db/migrations/001_add_users_table.sql
```

### Option B: Run Updated Schema

The main schema (`lib/db/schema.sql`) now includes the users table. If you need to add it:

```sql
-- Copy the users table creation from lib/db/schema.sql
-- Or run the migration script above
```

## Step 2: Set AUTH_SECRET Environment Variable

Add to `.env.local`:

```bash
AUTH_SECRET=your-very-long-random-secret-key-minimum-32-characters-long
```

**Generate a secure secret:**
```bash
# Using openssl
openssl rand -base64 32

# Or use a password generator
# Minimum 32 characters recommended
```

**For Vercel:**
- Add `AUTH_SECRET` to environment variables
- Use a strong random string (32+ characters)

## Step 3: Create First User

Use the create-user script:

```bash
node scripts/create-user.js <email> <name> <password> [role]
```

**Example:**
```bash
# Create admin user
node scripts/create-user.js admin@bola8.com "Admin User" "SecurePassword123!" admin

# Create designer user
node scripts/create-user.js designer@bola8.com "Designer Name" "Password123" designer

# Create viewer user (read-only)
node scripts/create-user.js viewer@bola8.com "Viewer Name" "Password123" viewer
```

## Step 4: Test Authentication

1. **Start the app:**
   ```bash
   npm run dev
   ```

2. **Navigate to** `http://localhost:3000`
   - Should redirect to `/login`

3. **Login** with your created user credentials

4. **Verify:**
   - You should see your name in the header
   - You can access all pages
   - Logout button works

## User Roles

### Admin
- Full access to all features
- Can manage users (future feature)
- Can access all projects and data

### Designer
- Can create and edit projects
- Can upload files and images
- Can create quotes
- Can add notes and manage workflow

### Viewer
- Read-only access
- Can view projects and quotes
- Cannot create or edit (future implementation)

## Security Features

1. **Password Hashing**: Uses bcrypt with salt rounds
2. **JWT Tokens**: Signed with secret key
3. **HTTP-Only Cookies**: Prevents XSS attacks
4. **Secure Cookies**: Enabled in production (HTTPS required)
5. **Session Expiration**: 7 days, then requires re-login
6. **Middleware Protection**: All routes protected except `/login`

## API Endpoints

### POST `/api/auth/login`
Login with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "role": "designer"
  }
}
```

### POST `/api/auth/logout`
Logout and clear session.

**Response:**
```json
{
  "success": true
}
```

### GET `/api/auth/me`
Get current user information.

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "role": "designer"
  }
}
```

## Protected Routes

All routes are protected by default except:
- `/login` - Login page
- `/api/auth/login` - Login API
- `/api/auth/logout` - Logout API

## Troubleshooting

### "Unauthorized" errors
- Check if user exists in database
- Verify password is correct
- Check AUTH_SECRET is set
- Verify session cookie is being set

### "Database error" on login
- Verify users table exists
- Check database connection
- Verify user is active (`active = true`)

### Session not persisting
- Check cookie settings (httpOnly, secure, sameSite)
- Verify AUTH_SECRET is consistent
- Check browser allows cookies

### Can't access pages after login
- Check middleware is working
- Verify token is valid
- Check browser console for errors

## Best Practices

1. **Use strong passwords** for all users
2. **Rotate AUTH_SECRET** periodically
3. **Limit admin users** to trusted personnel
4. **Monitor login attempts** (future feature)
5. **Use HTTPS in production** (required for secure cookies)
6. **Set strong AUTH_SECRET** (32+ random characters)

## Future Enhancements

- Password reset functionality
- Two-factor authentication
- Session management (view/revoke sessions)
- User management UI
- Role-based permissions (fine-grained)
- Login attempt logging
- Account lockout after failed attempts

