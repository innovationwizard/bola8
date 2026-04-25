# Quick Start: Connect Your RDS Database

Your RDS instance is ready! Follow these steps to connect it.

## Your Instance Details

- **Instance**: `bola8-db-instance`
- **Endpoint**: `bola8-db-instance.c324iiw8m4j3.us-east-2.rds.amazonaws.com`
- **Port**: `5432`
- **Engine**: PostgreSQL 17.4
- **Class**: db.t4g.micro
- **Region**: us-east-2b
- **Status**: ✅ Available
- **Publicly Accessible**: ❌ **No** (Important - see below)

## Step 1: Connection Details

✅ **You already have these:**
- **Endpoint**: `bola8-db-instance.c324iiw8m4j3.us-east-2.rds.amazonaws.com`
- **Port**: `5432`
- **VPC**: `ingepro-vpc-link`
- **Security Group**: `default (sg-029c32a854bebdf2d)`

⚠️ **Important**: Your instance is **NOT publicly accessible**. This means:

**Option A: Enable Public Access** (Easier for development)
1. Go to **Actions → Modify**
2. Scroll to **Connectivity**
3. Check **Publicly accessible** → **Yes**
4. Click **Continue** → **Modify DB instance**
5. Wait 5-10 minutes for changes to apply

**Option B: Connect from VPC** (More secure)
- Deploy your app on EC2/Lambda in the same VPC
- Or use a bastion host/VPN to access

**Option C: Use Vercel with VPC Peering** (Production)
- Set up VPC peering between Vercel and your VPC
- More complex but secure

## Step 2: Choose Connection Method

⚠️ **Your instance is NOT publicly accessible**. You need to choose one:

### Option A: Enable Public Access (Quickest)

1. **Actions → Modify**
2. **Connectivity → Publicly accessible → Yes**
3. **Continue → Modify DB instance**
4. Wait 5-10 minutes

Then configure security group:
1. Click **VPC security group** link (`default`)
2. **Inbound rules → Edit inbound rules**
3. Add rule:
   - Type: **PostgreSQL**
   - Port: **5432**
   - Source: **Your IP** (`x.x.x.x/32`) - Get it from [whatismyip.com](https://whatismyip.com)
4. **Save rules**

### Option B: Use EC2/Bastion (More Secure)

See `docs/rds-connection-options.md` for detailed instructions.

## Step 3: Create .env.local File

Create `.env.local` in the project root:

```bash
# Database Connection
DB_HOST=bola8-db-instance.c324iiw8m4j3.us-east-2.rds.amazonaws.com
DB_PORT=5432
DB_NAME=bola8
DB_USER=your-master-username
DB_PASSWORD=your-master-password
DB_SSL=true

# AWS S3 (you already have these)
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
S3_UPLOAD_BUCKET=bola8-uploads
S3_IMAGES_BUCKET=bola8-images
LEONARDO_S3_BUCKET=bola8-leonardo-images
S3_DESIGNS_BUCKET=bola8-designs
S3_NOT_IMAGES_BUCKET=bola8-not-images

# Leonardo AI
LEONARDO_API_KEY=your-key
```

**Replace:**
- `xxxxx` with your actual endpoint
- `your-master-username` with your RDS master username
- `your-master-password` with your RDS master password

## Step 4: Setup Database

Run the setup script:

```bash
node scripts/setup-database.js
```

This will:
- ✅ Test connection
- ✅ Create `bola8` database
- ✅ Run the schema (create all tables)

## Step 5: Test Connection

```bash
node scripts/test-connection.js
```

You should see:
- ✅ Connection successful
- ✅ All 7 tables present
- ✅ Table access verified

## Step 6: Start Your App

```bash
npm run dev
```

The app will automatically use the database connection!

## Troubleshooting

### "Connection timeout" or "ECONNREFUSED"
- ✅ **If public access disabled**: Enable it or use Option B (EC2/Bastion)
- ✅ Check security group allows your IP (if public access enabled)
- ✅ Verify endpoint is correct: `bola8-db-instance.c324iiw8m4j3.us-east-2.rds.amazonaws.com`

### "Password authentication failed"
- ✅ Double-check username/password
- ✅ Reset password: **Actions → Modify → Reset master password**

### "Database does not exist"
- ✅ Run: `node scripts/setup-database.js`

### "Publicly accessible: No" error
- ✅ See `docs/rds-connection-options.md` for connection options
- ✅ Enable public access OR use EC2/Bastion/VPC connection

## Next Steps

Once connected:
1. ✅ Create a test project in the UI
2. ✅ Upload a file
3. ✅ Calculate a quote
4. ✅ Verify data appears in database

## Need Help?

See detailed guides:
- `docs/rds-connection-options.md` - **Connection options for non-public instance**
- `docs/database-setup-guide.md` - Complete setup guide
- `docs/connect-to-rds.md` - Connection troubleshooting

