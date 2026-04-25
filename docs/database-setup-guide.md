# Database Setup Guide

Complete guide to wire up PostgreSQL (AWS RDS) for the Bola8 Operations Platform.

## Prerequisites

1. AWS Account with RDS access
2. PostgreSQL client tools (psql) or database GUI (pgAdmin, DBeaver)
3. Network access to your RDS instance

## Required Environment Variables

Add these to your `.env.local` file (for local development) or your deployment platform:

```bash
# Database Connection (REQUIRED)
DB_HOST=your-rds-endpoint.region.rds.amazonaws.com
DB_PORT=5432
DB_NAME=bola8
DB_USER=your-db-username
DB_PASSWORD=your-db-password
DB_SSL=true
```

**Note:** `DB_SSL=true` is required for AWS RDS connections.

## Step 1: Create AWS RDS PostgreSQL Instance

### Option A: AWS Console

1. Go to **AWS Console → RDS → Create Database**
2. Choose **PostgreSQL** as engine
3. Select version: **PostgreSQL 15.x** or **14.x** (recommended)
4. Template: **Free tier** (for development) or **Production**
5. Settings:
   - **DB instance identifier**: `bola8-db` (or your preferred name)
   - **Master username**: `bola8_admin` (or your preferred name)
   - **Master password**: Create a strong password (save it!)
6. Instance configuration:
   - **DB instance class**: `db.t3.micro` (free tier) or `db.t3.small` (production)
7. Storage:
   - **Storage type**: General Purpose SSD (gp3)
   - **Allocated storage**: 20 GB (minimum)
8. Connectivity:
   - **VPC**: Default VPC or your custom VPC
   - **Public access**: **Yes** (if connecting from outside AWS) or **No** (if using VPC)
   - **VPC security group**: Create new or use existing
   - **Availability Zone**: No preference (or select specific)
9. Database authentication: **Password authentication**
10. Click **Create database**

### Option B: AWS CLI

```bash
aws rds create-db-instance \
  --db-instance-identifier bola8-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 15.4 \
  --master-username bola8_admin \
  --master-user-password YourSecurePassword123! \
  --allocated-storage 20 \
  --storage-type gp3 \
  --publicly-accessible \
  --db-name bola8 \
  --backup-retention-period 7 \
  --region us-east-2
```

### Important Notes

- **Wait for instance to be available** (5-10 minutes)
- **Note the endpoint** (e.g., `bola8-db.abc123.us-east-2.rds.amazonaws.com`)
- **Save the master password** securely
- **Security group** must allow inbound connections on port 5432 from your IP or application

## Step 2: Configure Security Group

Your RDS instance needs to allow connections:

1. Go to **RDS → Databases → Your Instance → Connectivity & security**
2. Click on the **VPC security group**
3. **Inbound rules → Edit inbound rules**
4. Add rule:
   - **Type**: PostgreSQL
   - **Port**: 5432
   - **Source**: 
     - For development: Your IP address (`x.x.x.x/32`)
     - For production: Your VPC CIDR or application server IP
     - For Vercel: You may need to use `0.0.0.0/0` (less secure) or set up VPC peering

## Step 3: Create Database and Run Schema

### Option A: Using psql (Command Line)

```bash
# Connect to RDS instance
psql -h your-rds-endpoint.region.rds.amazonaws.com \
     -U your-db-username \
     -d postgres \
     -p 5432

# Once connected, create the database
CREATE DATABASE bola8;

# Connect to the new database
\c bola8

# Run the schema
\i lib/db/schema.sql

# Or run it directly from command line:
psql -h your-rds-endpoint.region.rds.amazonaws.com \
     -U your-db-username \
     -d bola8 \
     -f lib/db/schema.sql
```

### Option B: Using pgAdmin or DBeaver

1. **Connect to RDS instance:**
   - Host: `your-rds-endpoint.region.rds.amazonaws.com`
   - Port: `5432`
   - Database: `postgres` (initially)
   - Username: Your master username
   - Password: Your master password
   - SSL: Enabled

2. **Create database:**
   - Right-click → Create → Database
   - Name: `bola8`
   - Owner: Your master username

3. **Run schema:**
   - Connect to `bola8` database
   - Open `lib/db/schema.sql`
   - Execute the entire script

### Option C: Using Node.js Script

Create a temporary script `setup-db.js`:

```javascript
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: 'postgres', // Connect to default database first
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function setup() {
  try {
    // Create database
    await pool.query('CREATE DATABASE bola8');
    console.log('Database created');
    
    // Connect to new database
    pool.end();
    const bola8Pool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: 'bola8',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: { rejectUnauthorized: false },
    });
    
    // Read and execute schema
    const schema = fs.readFileSync(
      path.join(__dirname, 'lib/db/schema.sql'),
      'utf8'
    );
    await bola8Pool.query(schema);
    console.log('Schema executed successfully');
    
    await bola8Pool.end();
  } catch (error) {
    console.error('Setup error:', error);
    process.exit(1);
  }
}

setup();
```

Run it:
```bash
DB_HOST=your-endpoint DB_USER=your-user DB_PASSWORD=your-password node setup-db.js
```

## Step 4: Verify Schema

After running the schema, verify tables were created:

```sql
-- Connect to bola8 database
\c bola8

-- List all tables
\dt

-- Should see:
-- - projects
-- - site_visits
-- - images
-- - quotes
-- - design_files
-- - client_reviews
-- - project_notes

-- Check projects table structure
\d projects
```

## Step 5: Set Environment Variables

### Local Development (.env.local)

Create `.env.local` in project root:

```bash
# Database
DB_HOST=bola8-db.abc123.us-east-2.rds.amazonaws.com
DB_PORT=5432
DB_NAME=bola8
DB_USER=bola8_admin
DB_PASSWORD=YourSecurePassword123!
DB_SSL=true
```

### Vercel Deployment

1. Go to **Vercel Project → Settings → Environment Variables**
2. Add each variable:
   - `DB_HOST`
   - `DB_PORT=5432`
   - `DB_NAME=bola8`
   - `DB_USER`
   - `DB_PASSWORD`
   - `DB_SSL=true`
3. Select environments (Production, Preview, Development)
4. **Redeploy** after adding variables

## Step 6: Test Connection

### Test from Application

The app will automatically test the connection on first API call. Check your logs for:

```
Executed query { text: 'SELECT NOW()', duration: 45, rows: 1 }
```

### Test Manually

Create a test script `test-db.js`:

```javascript
const { query } = require('./lib/db');

async function test() {
  try {
    const result = await query('SELECT NOW() as current_time, version() as pg_version');
    console.log('✅ Database connected!');
    console.log('Current time:', result.rows[0].current_time);
    console.log('PostgreSQL version:', result.rows[0].pg_version);
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  }
  process.exit(0);
}

test();
```

Run:
```bash
node test-db.js
```

## Troubleshooting

### Common Issues

1. **"Connection timeout"**
   - Check security group allows your IP
   - Verify endpoint is correct
   - Check if instance is in "available" state
   - Verify port 5432 is open

2. **"Password authentication failed"**
   - Double-check username and password
   - Verify you're using the master username
   - Check for typos in environment variables

3. **"SSL connection required"**
   - Set `DB_SSL=true` in environment variables
   - RDS requires SSL connections

4. **"Database does not exist"**
   - Make sure you created the `bola8` database
   - Verify `DB_NAME=bola8` in environment variables

5. **"Permission denied"**
   - Ensure master user has proper permissions
   - Check if database was created with correct owner

### Connection String Format

If you prefer connection strings:

```bash
# Format
DATABASE_URL=postgresql://username:password@host:port/database?sslmode=require

# Example
DATABASE_URL=postgresql://bola8_admin:password@bola8-db.abc123.us-east-2.rds.amazonaws.com:5432/bola8?sslmode=require
```

**Note:** The current code uses individual environment variables, not `DATABASE_URL`. You'd need to update `lib/db/index.ts` to support connection strings.

## Security Best Practices

1. **Use strong passwords** (12+ characters, mixed case, numbers, symbols)
2. **Enable encryption at rest** (RDS default)
3. **Use SSL/TLS** (required for RDS)
4. **Limit security group access** to specific IPs when possible
5. **Rotate passwords** regularly
6. **Use IAM database authentication** for production (advanced)
7. **Enable automated backups** (RDS default: 7 days)
8. **Enable Multi-AZ** for production (high availability)

## Cost Optimization

1. **Use db.t3.micro** for development (free tier eligible)
2. **Stop instance** when not in use (development)
3. **Enable auto-stop** for non-production instances
4. **Monitor storage** usage
5. **Set up billing alerts**

## Database Schema Overview

The schema includes:

- **projects** - Core project tracking with 14 workflow states
- **site_visits** - On-site visit data and measurements
- **images** - Original and enhanced images (links to S3)
- **quotes** - Quote calculations and pricing
- **design_files** - Design files and documents (links to S3)
- **client_reviews** - Client feedback and revision tracking
- **project_notes** - Notes for each workflow step

See `lib/db/schema.sql` for complete schema definition.

## Next Steps

Once database is connected:

1. ✅ Test creating a project through the UI
2. ✅ Test uploading files and verify they're linked in database
3. ✅ Test quote calculations and saving
4. ✅ Verify workflow step transitions
5. ✅ Set up database backups
6. ✅ Monitor connection pool usage
7. ✅ Set up database monitoring/alerting

## Maintenance

- **Regular backups**: RDS automated backups (7 days retention by default)
- **Monitor performance**: Use RDS Performance Insights
- **Update PostgreSQL**: Plan for minor version updates
- **Scale instance**: Upgrade instance class as needed
- **Monitor storage**: Add storage before reaching limits

