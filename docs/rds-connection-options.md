# RDS Connection Options for Non-Public Instance

Your RDS instance (`bola8-db-instance`) is configured with **Publicly accessible: No**, which means it's only accessible from within the VPC (`ingepro-vpc-link`).

## Connection Options

### Option 1: Enable Public Access (Easiest for Development)

**When to use:** Local development, testing, quick setup

**Steps:**
1. Go to **AWS Console → RDS → Databases → bola8-db-instance**
2. Click **Actions → Modify**
3. Scroll to **Connectivity** section
4. Check **Publicly accessible** → Change to **Yes**
5. Click **Continue** → **Modify DB instance**
6. Wait 5-10 minutes for the change to apply

**Security Note:** 
- Make sure your security group only allows your IP
- Consider reverting this for production

**After enabling:**
- Update security group to allow your IP on port 5432
- Use endpoint: `bola8-db-instance.c324iiw8m4j3.us-east-2.rds.amazonaws.com`

---

### Option 2: Connect from EC2 Instance (Recommended for Production)

**When to use:** Production deployments, better security

**Steps:**
1. Launch an EC2 instance in the same VPC (`ingepro-vpc-link`)
2. Use the same security group or allow EC2 security group in RDS security group
3. Connect from EC2 instance:
   ```bash
   psql -h bola8-db-instance.c324iiw8m4j3.us-east-2.rds.amazonaws.com \
        -U your-username \
        -d postgres
   ```

**For Application:**
- Deploy your Next.js app on EC2
- Or use AWS App Runner, ECS, or Lambda in the same VPC

---

### Option 3: Use Bastion Host / SSH Tunnel

**When to use:** Secure access from local machine

**Steps:**
1. Launch a small EC2 instance (bastion) in the VPC
2. Configure SSH tunnel:
   ```bash
   ssh -L 5432:bola8-db-instance.c324iiw8m4j3.us-east-2.rds.amazonaws.com:5432 \
       user@bastion-instance-ip \
       -N
   ```
3. Connect locally using `localhost:5432`:
   ```bash
   psql -h localhost -U your-username -d postgres
   ```

**For Application:**
- Update `.env.local`:
  ```bash
  DB_HOST=localhost
  DB_PORT=5432
  ```
- Keep SSH tunnel running while developing

---

### Option 4: Vercel with VPC Peering (Advanced)

**When to use:** Production deployment on Vercel with secure VPC access

**Steps:**
1. Set up VPC peering between Vercel and your AWS VPC
2. Configure routing tables
3. Update security groups
4. Deploy on Vercel

**Note:** This requires Vercel Enterprise plan and AWS networking expertise.

---

### Option 5: AWS Systems Manager Session Manager (No SSH)

**When to use:** Secure access without managing SSH keys

**Steps:**
1. Install Session Manager plugin
2. Use port forwarding:
   ```bash
   aws ssm start-session \
     --target i-your-ec2-instance-id \
     --document-name AWS-StartPortForwardingSession \
     --parameters '{"portNumber":["5432"],"localPortNumber":["5432"]}'
   ```
3. Connect to `localhost:5432`

---

## Recommended Approach

### For Development:
1. **Enable public access** temporarily
2. **Restrict security group** to your IP only
3. **Disable public access** when done

### For Production:
1. **Keep public access disabled**
2. **Deploy app on EC2/ECS/Lambda** in the same VPC
3. **Use security groups** to control access

## Security Group Configuration

Your current security group: `default (sg-029c32a854bebdf2d)`

**For Public Access:**
```
Type: PostgreSQL
Protocol: TCP
Port: 5432
Source: Your IP (x.x.x.x/32)
```

**For VPC Access:**
```
Type: PostgreSQL
Protocol: TCP
Port: 5432
Source: VPC CIDR or specific security group
```

## Testing Connection

Once you've chosen an option, test with:

```bash
# If public access enabled
psql -h bola8-db-instance.c324iiw8m4j3.us-east-2.rds.amazonaws.com \
     -U your-username \
     -d postgres

# If using SSH tunnel
psql -h localhost -U your-username -d postgres

# Or use the test script
node scripts/test-connection.js
```

## Current Configuration Summary

- **Endpoint**: `bola8-db-instance.c324iiw8m4j3.us-east-2.rds.amazonaws.com`
- **Port**: `5432`
- **VPC**: `ingepro-vpc-link (vpc-0ccffa2ab02dfc923)`
- **Security Group**: `default (sg-029c32a854bebdf2d)`
- **Public Access**: ❌ Disabled
- **Subnets**: 3 subnets across availability zones

