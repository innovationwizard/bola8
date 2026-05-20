# 🚀 Deployment Guide - ML Training System

Complete deployment instructions for the ML prompt learning system.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables Setup](#environment-variables-setup)
3. [OpenAI API Setup](#openai-api-setup)
4. [Python ML Service Deployment (ECS Fargate)](#python-ml-service-deployment)
5. [Next.js App Deployment](#nextjs-app-deployment)
6. [Post-Deployment Verification](#post-deployment-verification)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Services
- ✅ AWS Account with appropriate permissions
- ✅ PostgreSQL database (already set up)
- ✅ S3 buckets (already set up)
- ✅ Leonardo AI API key (already set up)
- ✅ Replicate API key (already set up)

### New Requirements
- ⬜ OpenAI API account (for GPT-4)
- ⬜ Docker installed locally
- ⬜ AWS CLI configured
- ⬜ AWS ECR repository
- ⬜ AWS ECS Fargate cluster

### Tools Needed
```bash
# Install AWS CLI (if not installed)
brew install awscli  # macOS
# or
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Install Docker
# https://docs.docker.com/get-docker/

# Verify installations
aws --version
docker --version
```

---

## Environment Variables Setup

### 1. OpenAI API Key

Add to your `.env` file:

```bash
# OpenAI API (for prompt evolution)
OPENAI_API_KEY=sk-proj-...your-key-here...
```

### 2. ML Service URL

After deploying ML service, add:

```bash
# ML Service (will be filled after deployment)
ML_SERVICE_URL=http://your-alb-url.region.elb.amazonaws.com
```

### 3. Complete `.env` Example

```bash
# Existing variables
LEONARDO_API_KEY=...
REPLICATE_API_TOKEN=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
DATABASE_URL=postgresql://...
S3_UPLOAD_BUCKET=bola8-uploads
LEONARDO_S3_BUCKET=bola8-leonardo-images
AWS_REGION=us-east-1

# New for ML Training
OPENAI_API_KEY=sk-proj-...
ML_SERVICE_URL=http://ml-service-alb-xxxxx.us-east-1.elb.amazonaws.com
ENABLE_TRAINING_MODE=true
NEXT_PUBLIC_BASE_URL=https://your-app-url.com
```

---

## OpenAI API Setup

### Step 1: Create OpenAI Account

1. Go to [https://platform.openai.com/signup](https://platform.openai.com/signup)
2. Sign up or log in
3. Navigate to **API Keys**: [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)

### Step 2: Create API Key

1. Click **"Create new secret key"**
2. Name it: `bola8-ml-training`
3. Copy the key immediately (you won't see it again!)
4. Save it to your `.env` file:
   ```bash
   OPENAI_API_KEY=sk-proj-...
   ```

### Step 3: Add Billing

1. Go to **Settings → Billing**: [https://platform.openai.com/account/billing/overview](https://platform.openai.com/account/billing/overview)
2. Add payment method
3. Set monthly budget (recommended: $20-50 for training)

### Step 4: Verify Access

```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

Should return list of available models including `gpt-4-turbo`.

**Estimated Cost**:
- Prompt evolution: ~$0.01-0.03 per evolution
- Triggered every 10 samples
- Total for 50 samples: ~$0.05-0.15
- Monthly (200 samples): ~$0.20-0.60

---

## Python ML Service Deployment

We'll deploy the ML service to **AWS ECS Fargate** for simplicity and scalability.

### Architecture Overview

```
┌─────────────┐
│   Next.js   │
│     App     │
└──────┬──────┘
       │ HTTP
       ▼
┌─────────────┐       ┌──────────────┐
│     ALB     │───────│  ECS Fargate │
│ (Optional)  │       │  (ML Service)│
└─────────────┘       └──────────────┘
```

### Step 1: Create ECR Repository

```bash
# Set variables
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO_NAME=bola8-ml-service

# Create repository
aws ecr create-repository \
    --repository-name $ECR_REPO_NAME \
    --region $AWS_REGION
```

### Step 2: Build and Push Docker Image

```bash
# Navigate to ml-service directory
cd ml-service

# Build Docker image
docker build -t $ECR_REPO_NAME:latest .

# Login to ECR
aws ecr get-login-password --region $AWS_REGION | \
    docker login --username AWS --password-stdin \
    $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Tag image
docker tag $ECR_REPO_NAME:latest \
    $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME:latest

# Push to ECR
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME:latest
```

### Step 3: Create ECS Cluster

```bash
# Create Fargate cluster
aws ecs create-cluster \
    --cluster-name bola8-ml-cluster \
    --region $AWS_REGION
```

### Step 4: Create Task Definition

Create file `ecs-task-definition.json`:

```json
{
  "family": "bola8-ml-service",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "ml-service",
      "image": "<AWS_ACCOUNT_ID>.dkr.ecr.<AWS_REGION>.amazonaws.com/bola8-ml-service:latest",
      "portMappings": [
        {
          "containerPort": 8000,
          "protocol": "tcp"
        }
      ],
      "essential": true,
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/bola8-ml-service",
          "awslogs-region": "<AWS_REGION>",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

**Replace `<AWS_ACCOUNT_ID>` and `<AWS_REGION>`**, then register:

```bash
# Create CloudWatch Logs group
aws logs create-log-group \
    --log-group-name /ecs/bola8-ml-service \
    --region $AWS_REGION

# Register task definition
aws ecs register-task-definition \
    --cli-input-json file://ecs-task-definition.json \
    --region $AWS_REGION
```

### Step 5: Create ECS Service

**Simple Setup (No Load Balancer)**:

```bash
# Get your VPC ID
VPC_ID=$(aws ec2 describe-vpcs --query 'Vpcs[0].VpcId' --output text)

# Get subnet IDs (use private subnets if available)
SUBNET_IDS=$(aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=$VPC_ID" \
    --query 'Subnets[0:2].SubnetId' \
    --output text | tr '\t' ',')

# Create security group for ML service
SG_ID=$(aws ec2 create-security-group \
    --group-name bola8-ml-service-sg \
    --description "Security group for ML service" \
    --vpc-id $VPC_ID \
    --query 'GroupId' \
    --output text)

# Allow inbound on port 8000 from your VPC
aws ec2 authorize-security-group-ingress \
    --group-id $SG_ID \
    --protocol tcp \
    --port 8000 \
    --cidr 0.0.0.0/0  # For testing; restrict to your VPC CIDR in production

# Create ECS service
aws ecs create-service \
    --cluster bola8-ml-cluster \
    --service-name bola8-ml-service \
    --task-definition bola8-ml-service \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_IDS],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
    --region $AWS_REGION
```

### Step 6: Get Service URL

```bash
# Get task ARN
TASK_ARN=$(aws ecs list-tasks \
    --cluster bola8-ml-cluster \
    --service-name bola8-ml-service \
    --query 'taskArns[0]' \
    --output text)

# Get task details
aws ecs describe-tasks \
    --cluster bola8-ml-cluster \
    --tasks $TASK_ARN \
    --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' \
    --output text

# Get public IP (if assigned)
ENI_ID=$(aws ecs describe-tasks \
    --cluster bola8-ml-cluster \
    --tasks $TASK_ARN \
    --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' \
    --output text)

PUBLIC_IP=$(aws ec2 describe-network-interfaces \
    --network-interface-ids $ENI_ID \
    --query 'NetworkInterfaces[0].Association.PublicIp' \
    --output text)

echo "ML Service URL: http://$PUBLIC_IP:8000"
```

### Step 7: Test ML Service

```bash
# Health check
curl http://$PUBLIC_IP:8000/health

# Should return:
# {"status":"healthy","service":"ml-service","version":"1.0.0","optimizer_samples":0}

# Test parameter suggestion
curl -X POST http://$PUBLIC_IP:8000/ml/suggest_parameters \
  -H "Content-Type: application/json" \
  -d '{"mode":"structure","num_suggestions":2}'
```

### Step 8: Update Environment Variables

Add to your Next.js `.env`:

```bash
ML_SERVICE_URL=http://<PUBLIC_IP>:8000
```

**For production**, set up an Application Load Balancer (see Optional ALB Setup below).

---

## Optional: Application Load Balancer Setup

For production, use ALB for:
- HTTPS support
- Auto-scaling
- Health checks
- Domain names

### Create ALB

```bash
# Create ALB security group
ALB_SG_ID=$(aws ec2 create-security-group \
    --group-name bola8-ml-alb-sg \
    --description "ALB for ML service" \
    --vpc-id $VPC_ID \
    --query 'GroupId' \
    --output text)

# Allow HTTP/HTTPS
aws ec2 authorize-security-group-ingress \
    --group-id $ALB_SG_ID \
    --protocol tcp \
    --port 80 \
    --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
    --group-id $ALB_SG_ID \
    --protocol tcp \
    --port 443 \
    --cidr 0.0.0.0/0

# Create target group
TG_ARN=$(aws elbv2 create-target-group \
    --name bola8-ml-tg \
    --protocol HTTP \
    --port 8000 \
    --vpc-id $VPC_ID \
    --target-type ip \
    --health-check-path /health \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text)

# Get public subnet IDs
PUBLIC_SUBNETS=$(aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=$VPC_ID" "Name=map-public-ip-on-launch,Values=true" \
    --query 'Subnets[0:2].SubnetId' \
    --output text | tr '\t' ',')

# Create ALB
ALB_ARN=$(aws elbv2 create-load-balancer \
    --name bola8-ml-alb \
    --subnets $(echo $PUBLIC_SUBNETS | tr ',' ' ') \
    --security-groups $ALB_SG_ID \
    --scheme internet-facing \
    --type application \
    --query 'LoadBalancers[0].LoadBalancerArn' \
    --output text)

# Create listener
aws elbv2 create-listener \
    --load-balancer-arn $ALB_ARN \
    --protocol HTTP \
    --port 80 \
    --default-actions Type=forward,TargetGroupArn=$TG_ARN

# Get ALB DNS name
ALB_DNS=$(aws elbv2 describe-load-balancers \
    --load-balancer-arns $ALB_ARN \
    --query 'LoadBalancers[0].DNSName' \
    --output text)

echo "ML Service ALB URL: http://$ALB_DNS"
```

Update ECS service to use ALB:

```bash
aws ecs update-service \
    --cluster bola8-ml-cluster \
    --service bola8-ml-service \
    --load-balancers targetGroupArn=$TG_ARN,containerName=ml-service,containerPort=8000 \
    --region $AWS_REGION
```

Update `.env`:

```bash
ML_SERVICE_URL=http://<ALB_DNS>
```

---

## Next.js App Deployment

### Step 1: Install New Dependencies

```bash
# In your project root
npm install openai
```

### Step 2: Update Environment Variables

Add to `.env`:

```bash
OPENAI_API_KEY=sk-proj-...
ML_SERVICE_URL=http://...
ENABLE_TRAINING_MODE=true
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

### Step 3: Build and Test Locally

```bash
# Build
npm run build

# Test locally
npm run start

# Visit http://localhost:3000/train
```

### Step 4: Deploy to Production

Deploy as usual (Vercel, AWS Amplify, EC2, etc.).

**Example for Vercel**:

```bash
# Add environment variables to Vercel
vercel env add OPENAI_API_KEY
vercel env add ML_SERVICE_URL
vercel env add ENABLE_TRAINING_MODE

# Deploy
vercel --prod
```

---

## Post-Deployment Verification

### 1. Test Training UI

```bash
# Visit training page
https://your-domain.com/train

# Should see:
# - Status panel with 0 samples
# - Upload section
# - No errors in browser console
```

### 2. Test Full Flow

1. Upload an image
2. Wait for variants to generate (~2-3 min)
3. Rate both options
4. Submit ratings
5. Verify in database:

```sql
SELECT COUNT(*) FROM enhancement_ratings;
SELECT COUNT(*) FROM parameter_experiments;
SELECT COUNT(*) FROM prompt_versions;
```

### 3. Test ML Service Integration

```bash
# Check ML service health
curl $ML_SERVICE_URL/health

# Check stats
curl $ML_SERVICE_URL/ml/stats
```

### 4. Test Prompt Evolution

After 10 samples, evolution should trigger automatically.

Or manually trigger:

```bash
curl -X POST https://your-domain.com/api/train/evolve
```

Check logs for:
```
=== Starting Prompt Evolution ===
Calling GPT-4 for prompt evolution...
New version created: v1.0.1
```

---

## Troubleshooting

### ML Service Issues

#### Service won't start
```bash
# Check logs
aws logs tail /ecs/bola8-ml-service --follow

# Common issues:
# - Docker image not found: Re-push to ECR
# - Port already in use: Check security groups
# - Out of memory: Increase task memory (1024 → 2048)
```

#### Can't reach ML service
```bash
# Check security group rules
aws ec2 describe-security-groups --group-ids $SG_ID

# Verify service is running
aws ecs describe-services \
    --cluster bola8-ml-cluster \
    --services bola8-ml-service
```

### OpenAI API Issues

#### Rate limiting
```
Error: Rate limit exceeded
```

**Solution**: Add retry logic or wait 1 minute between evolution attempts.

#### Invalid API key
```
Error: Invalid API key
```

**Solution**: Verify key in `.env` and restart app.

### Database Issues

#### Foreign key constraint errors
```bash
# Verify migrations ran
psql $DATABASE_URL -c "\dt"

# Should see:
# - enhancement_ratings
# - parameter_experiments
# - prompt_versions
```

### Next.js Issues

#### Can't access /train page
```
404: Page not found
```

**Solution**: Ensure Next.js build succeeded:
```bash
npm run build
# Check for errors
```

#### TypeScript errors
```bash
# Check for type errors
npx tsc --noEmit

# Common fix:
npm install --save-dev @types/node
```

---

## Cost Estimates

### Monthly Costs (Assuming continuous training)

| Service | Cost |
|---------|------|
| **ECS Fargate** (512 CPU, 1GB RAM) | ~$30/month |
| **ALB** (optional) | ~$20/month |
| **OpenAI API** (200 samples/month) | ~$1/month |
| **CloudWatch Logs** | ~$2/month |
| **Leonardo API** (200 images) | ~$4/month |
| **Replicate** (200 images) | ~$8/month |
| **Total** | **~$65/month** |

### One-Time Costs
- **Development/Setup**: Already covered ✅
- **ECR Storage**: ~$0.10/GB/month (negligible)

---

## Maintenance

### Weekly
- Check training progress: `/train` page
- Review ML stats: `curl $ML_SERVICE_URL/ml/stats`
- Monitor costs in AWS console

### Monthly
- Review prompt evolution history
- Check best-performing parameters
- Update training targets if needed

### As Needed
- Update ML service: rebuild and push new Docker image
- Upgrade Next.js dependencies: `npm update`
- Scale ECS service if needed: `aws ecs update-service --desired-count 2`

---

## Security Checklist

- [ ] Restrict security group to specific IPs/VPCs
- [ ] Use HTTPS for ALB (add SSL certificate)
- [ ] Rotate OpenAI API key every 90 days
- [ ] Enable CloudWatch alarms for errors
- [ ] Set up WAF rules for public endpoints
- [ ] Use IAM roles instead of access keys where possible

---

## Next Steps

1. ✅ Deploy ML service to ECS Fargate
2. ✅ Configure OpenAI API
3. ✅ Deploy Next.js app with new features
4. ✅ Train personnel using MANUAL_ENTRENAMIENTO.md
5. ⏸️ Collect 50 training samples
6. ⏸️ Monitor Phase 1 convergence
7. ⏸️ Implement Phase 2 reward model (future)

---

**Deployment Complete! 🎉**

Your ML training system is now live and ready to learn.
