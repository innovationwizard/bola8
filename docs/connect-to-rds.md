# Connecting to Your RDS Instance

Based on your RDS instance details, here's how to connect and set it up.

## Your RDS Instance Details

- **DB Identifier**: `bola8-db-instance`
- **Engine**: PostgreSQL 17.4
- **Instance Class**: db.t4g.micro
- **Region**: us-east-2b
- **Status**: Available ✅

## Step 1: Get Connection Endpoint

1. In AWS Console, go to **RDS → Databases → bola8-db-instance**
2. Click on **Connectivity & security** tab
3. Find the **Endpoint** (looks like: `bola8-db-instance.xxxxx.us-east-2.rds.amazonaws.com`)
4. Note the **Port** (should be `5432`)

## Step 2: Get Master Username

1. Go to **Configuration** tab
2. Find **Master username** (this is your `DB_USER`)

**Note:** If you don't remember the master password, you'll need to reset it:
- Go to **Actions → Modify**
- Scroll to **Database authentication**
- Click **Reset master password**

## Step 3: Configure Security Group

Your instance needs to allow connections:

1. Go to **Connectivity & security** tab
2. Click on the **VPC security group** link
3. **Inbound rules → Edit inbound rules**
4. Add rule:
   - **Type**: PostgreSQL
   - **Port**: 5432
   - **Source**: 
     - For local development: Your IP (`x.x.x.x/32`)
     - For Vercel: `0.0.0.0/0` (or use VPC peering for better security)
5. **Save rules**

## Step 4: Create Database and Run Schema

### Option A: Using psql (Command Line)

```bash
# Connect to the instance (will connect to default 'postgres' database)
psql -h YOUR_ENDPOINT \
     -U YOUR_MASTER_USERNAME \
     -d postgres \
     -p 5432

# Once connected, create the bola8 database
CREATE DATABASE bola8;

# Connect to the new database
\c bola8

# Run the schema
\i lib/db/schema.sql

# Or exit and run from command line:
\q

psql -h YOUR_ENDPOINT \
     -U YOUR_MASTER_USERNAME \
     -d bola8 \
     -f lib/db/schema.sql
```

### Option B: Using pgAdmin or DBeaver

1. **Add new server:**
   - Host: `bola8-db-instance.xxxxx.us-east-2.rds.amazonaws.com`
   - Port: `5432`
   - Database: `postgres` (initially)
   - Username: Your master username
   - Password: Your master password
   - SSL: Enable (required for RDS)

2. **Create database:**
   - Right-click on server → Create → Database
   - Name: `bola8`
   - Owner: Your master username

3. **Run schema:**
   - Connect to `bola8` database
   - Open `lib/db/schema.sql`
   - Execute the script

## Step 5: Set Environment Variables

### Local Development (.env.local)

Create or update `.env.local`:

```bash
# Database Connection
DB_HOST=bola8-db-instance.xxxxx.us-east-2.rds.amazonaws.com
DB_PORT=5432
DB_NAME=bola8
DB_USER=your-master-username
DB_PASSWORD=your-master-password
DB_SSL=true
```

**Replace:**
- `xxxxx` with your actual endpoint
- `your-master-username` with your master username
- `your-master-password` with your master password

### Vercel Deployment

1. Go to **Vercel Project → Settings → Environment Variables**
2. Add:
   - `DB_HOST` = `bola8-db-instance.xxxxx.us-east-2.rds.amazonaws.com`
   - `DB_PORT` = `5432`
   - `DB_NAME` = `bola8`
   - `DB_USER` = your master username
   - `DB_PASSWORD` = your master password
   - `DB_SSL` = `true`
3. Select environments (Production, Preview, Development)
4. **Redeploy** after adding variables

## Step 6: Test Connection

### Quick Test Script

Create `test-connection.js`:

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function test() {
  try {
    const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('✅ Database connected successfully!');
    console.log('Current time:', result.rows[0].current_time);
    console.log('PostgreSQL version:', result.rows[0].pg_version);
    
    // Test tables exist
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('\n📊 Tables found:', tables.rows.map(r => r.table_name).join(', '));
    
    await pool.end();
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    process.exit(1);
  }
}

test();
```

Run:
```bash
node test-connection.js
```

### Test from Application

The app will automatically test the connection when you:
1. Create a new project
2. Upload a file
3. Calculate a quote

Check your application logs for:
```
Executed query { text: 'SELECT ...', duration: 45, rows: 1 }
```

## Troubleshooting

### "Connection timeout"
- ✅ Check security group allows your IP
- ✅ Verify endpoint is correct
- ✅ Check instance status is "Available"

### "Password authentication failed"
- ✅ Double-check username and password
- ✅ Reset password if needed (Actions → Modify → Reset master password)

### "Database does not exist"
- ✅ Make sure you created the `bola8` database
- ✅ Verify `DB_NAME=bola8` in environment variables

### "SSL connection required"
- ✅ Set `DB_SSL=true` in environment variables
- ✅ RDS requires SSL connections

## Next Steps

Once connected:

1. ✅ Verify tables were created (should see 7 tables)
2. ✅ Test creating a project through the UI
3. ✅ Test uploading files
4. ✅ Test quote calculations
5. ✅ Monitor connection in RDS console

## Important Notes

- **PostgreSQL 17.4** is a very recent version - make sure your `pg` package is up to date
- **db.t4g.micro** is ARM-based (Graviton2) - good for cost efficiency
- **Backups** are enabled by default (7-day retention)
- **Multi-AZ** is not enabled (single AZ) - consider enabling for production

