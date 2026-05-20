# 🚀 Quick Start - ML Training System

**⚡ Get up and running in 30 minutes**

---

## Prerequisites Checklist

- [ ] PostgreSQL database (existing) ✅
- [ ] S3 buckets (existing) ✅
- [ ] Leonardo API (existing) ✅
- [ ] Replicate API (existing) ✅
- [ ] OpenAI API key (get one)
- [ ] Docker installed
- [ ] AWS CLI configured

---

## Step 1: Install Dependencies (2 min)

```bash
# In project root
npm install

# Should add: openai@^4.20.0
```

---

## Step 2: Get OpenAI API Key (5 min)

1. Visit: https://platform.openai.com/api-keys
2. Create key: `bola8-ml-training`
3. Copy key: `sk-proj-...`
4. Add billing: https://platform.openai.com/account/billing

---

## Step 3: Deploy ML Service (15 min)

```bash
# Set variables
export AWS_REGION=us-east-2
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR_REPO_NAME=bola8-ml-service

# 1. Create ECR repository
aws ecr create-repository --repository-name $ECR_REPO_NAME --region $AWS_REGION

# 2. Build and push Docker image
cd ml-service
docker build -t $ECR_REPO_NAME:latest .

aws ecr get-login-password --region $AWS_REGION | \
    docker login --username AWS --password-stdin \
    $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

docker tag $ECR_REPO_NAME:latest \
    $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME:latest

docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME:latest

# 3. Create ECS cluster
aws ecs create-cluster --cluster-name bola8-ml-cluster --region $AWS_REGION

# 4. Create log group
aws logs create-log-group --log-group-name /ecs/bola8-ml-service --region $AWS_REGION

# 5. Register task definition (edit ecs-task-definition.json first!)
aws ecs register-task-definition \
    --cli-input-json file://ecs-task-definition.json \
    --region $AWS_REGION

# 6. Get VPC and subnet info
export VPC_ID=$(aws ec2 describe-vpcs --query 'Vpcs[0].VpcId' --output text)
export SUBNET_IDS=$(aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=$VPC_ID" \
    --query 'Subnets[0:2].SubnetId' \
    --output text | tr '\t' ',')

# 7. Create security group
export SG_ID=$(aws ec2 create-security-group \
    --group-name bola8-ml-service-sg \
    --description "Security group for ML service" \
    --vpc-id $VPC_ID \
    --query 'GroupId' \
    --output text)

aws ec2 authorize-security-group-ingress \
    --group-id $SG_ID \
    --protocol tcp \
    --port 8000 \
    --cidr 0.0.0.0/0

# 8. Create ECS service
aws ecs create-service \
    --cluster bola8-ml-cluster \
    --service-name bola8-ml-service \
    --task-definition bola8-ml-service \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_IDS],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
    --region $AWS_REGION

# 9. Get ML service URL
export TASK_ARN=$(aws ecs list-tasks \
    --cluster bola8-ml-cluster \
    --service-name bola8-ml-service \
    --query 'taskArns[0]' \
    --output text)

export ENI_ID=$(aws ecs describe-tasks \
    --cluster bola8-ml-cluster \
    --tasks $TASK_ARN \
    --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' \
    --output text)

export PUBLIC_IP=$(aws ec2 describe-network-interfaces \
    --network-interface-ids $ENI_ID \
    --query 'NetworkInterfaces[0].Association.PublicIp' \
    --output text)

echo "ML Service URL: http://$PUBLIC_IP:8000"
```

---

## Step 4: Configure Environment Variables (2 min)

Add to `.env`:

```bash
# New variables
OPENAI_API_KEY=sk-proj-your-key-here
ML_SERVICE_URL=http://YOUR_PUBLIC_IP:8000
ENABLE_TRAINING_MODE=true
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

---

## Step 5: Test Locally (3 min)

```bash
# Back to project root
cd ..

# Build
npm run build

# Run
npm run dev

# Visit http://localhost:3000/train
```

---

## Step 6: Deploy to Production (5 min)

```bash
# For Vercel
vercel env add OPENAI_API_KEY
vercel env add ML_SERVICE_URL
vercel env add ENABLE_TRAINING_MODE
vercel --prod

# For other platforms, add env vars to their dashboard
```

---

## Step 7: Verify (5 min)

### Test ML Service
```bash
curl http://YOUR_PUBLIC_IP:8000/health
# Should return: {"status":"healthy",...}
```

### Test Training UI
```
Visit: https://your-domain.com/train
Should see:
✅ Status panel
✅ Upload section
✅ No errors
```

### Test Full Flow
1. Upload an image
2. Wait 2-3 minutes for variants
3. Rate both options (1-5 stars)
4. Submit
5. Check status panel updates

---

## Quick Commands Reference

```bash
# Check ML service status
curl $ML_SERVICE_URL/health
curl $ML_SERVICE_URL/ml/stats

# Check ECS service
aws ecs describe-services \
    --cluster bola8-ml-cluster \
    --services bola8-ml-service

# View logs
aws logs tail /ecs/bola8-ml-service --follow

# Manual prompt evolution
curl -X POST https://your-domain.com/api/train/evolve

# Check training stats
curl https://your-domain.com/api/train/status
```

---

## Costs Summary

| Item | Monthly Cost |
|------|--------------|
| ECS Fargate (512 CPU, 1GB) | ~$30 |
| OpenAI API (200 samples) | ~$1 |
| Leonardo (200 images) | ~$4 |
| Replicate (200 images) | ~$8 |
| **Total** | **~$45/month** |

---

## Training Process

1. **Daily goal**: 5-10 images
2. **Time per image**: ~3 minutes
3. **Target**: 50 samples in 1-2 weeks
4. **Success**: Best rating ≥ 4.0/5.0

---

## Key Files

| File | Purpose |
|------|---------|
| `/train` | Training UI page |
| `MANUAL_ENTRENAMIENTO.md` | Training manual (Spanish) |
| `DEPLOYMENT.md` | Full deployment guide |
| `ML_PROMPT_LEARNING_SYSTEM.md` | System architecture |

---

## Troubleshooting

### ML Service not responding
```bash
# Check logs
aws logs tail /ecs/bola8-ml-service --follow

# Restart service
aws ecs update-service \
    --cluster bola8-ml-cluster \
    --service bola8-ml-service \
    --force-new-deployment
```

### Can't access /train page
```bash
# Check build
npm run build

# Check for errors
npm run dev
# Visit http://localhost:3000/train
```

### Database errors
```sql
-- Verify tables exist
\dt

-- Should see:
-- enhancement_ratings
-- parameter_experiments
-- prompt_versions
```

---

## What Happens Next

### Week 1
- Train personnel using MANUAL_ENTRENAMIENTO.md
- Start collecting samples (5-10/day)
- Monitor progress on `/train` page

### Week 2
- Reach 50 samples
- System reaches Phase 1 convergence
- Best rating ≥ 4.0/5.0

### Ongoing
- Prompt evolution every 10 samples
- Continuous improvement
- System learns preferences automatically

---

## Support

- **Full docs**: See `docs/` directory
- **ML service**: See `ml-service/README.md`
- **Training manual**: See `docs/MANUAL_ENTRENAMIENTO.md`
- **Deployment**: See `docs/DEPLOYMENT.md`

---

**Ready? Let's go! 🚀**

```bash
npm install
# Get OpenAI API key
# Deploy ML service
# Configure .env
# Deploy app
# Start training!
```
