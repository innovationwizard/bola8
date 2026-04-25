#!/bin/bash
# ML Service Deployment Script
# Follows QUICK_START_ML.md deployment steps

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting ML Service Deployment${NC}"

# Step 1: Set variables
export AWS_REGION=${AWS_REGION:-us-east-2}
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR_REPO_NAME=bola8-ml-service

if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo -e "${RED}❌ Error: AWS credentials not configured${NC}"
    echo "Please run: aws configure"
    exit 1
fi

echo -e "${GREEN}✓ AWS Account ID: $AWS_ACCOUNT_ID${NC}"
echo -e "${GREEN}✓ AWS Region: $AWS_REGION${NC}"
echo -e "${GREEN}✓ ECR Repository: $ECR_REPO_NAME${NC}"

# Step 2: Create ECR repository (if it doesn't exist)
echo -e "\n${YELLOW}📦 Creating ECR repository...${NC}"
aws ecr create-repository --repository-name $ECR_REPO_NAME --region $AWS_REGION 2>/dev/null || \
    echo "Repository already exists, continuing..."

# Step 3: Build and push Docker image (for linux/amd64 platform)
echo -e "\n${YELLOW}🐳 Building Docker image for linux/amd64...${NC}"
docker build --platform linux/amd64 -t $ECR_REPO_NAME:latest .

echo -e "\n${YELLOW}🔐 Logging into ECR...${NC}"
aws ecr get-login-password --region $AWS_REGION | \
    docker login --username AWS --password-stdin \
    $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

echo -e "\n${YELLOW}📤 Tagging and pushing image...${NC}"
docker tag $ECR_REPO_NAME:latest \
    $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME:latest

docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME:latest

# Step 4: Create ECS cluster
echo -e "\n${YELLOW}🏗️  Creating ECS cluster...${NC}"
aws ecs create-cluster --cluster-name bola8-ml-cluster --region $AWS_REGION 2>/dev/null || \
    echo "Cluster already exists, continuing..."

# Step 5: Create log group
echo -e "\n${YELLOW}📝 Creating CloudWatch log group...${NC}"
aws logs create-log-group --log-group-name /ecs/bola8-ml-service --region $AWS_REGION 2>/dev/null || \
    echo "Log group already exists, continuing..."

# Step 6: Set execution role ARN (role should already exist)
echo -e "\n${YELLOW}🔍 Using ECS execution role...${NC}"
EXECUTION_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/ecsTaskExecutionRole"
echo -e "${GREEN}✓ Execution role ARN: $EXECUTION_ROLE_ARN${NC}"
echo -e "${YELLOW}Note: If role doesn't exist, task definition registration will fail${NC}"

# Step 7: Update task definition with actual values
echo -e "\n${YELLOW}📋 Updating task definition...${NC}"
sed "s/<AWS_ACCOUNT_ID>/$AWS_ACCOUNT_ID/g; s/<AWS_REGION>/$AWS_REGION/g" \
    ecs-task-definition.json > ecs-task-definition-temp.json

# Step 8: Register task definition
echo -e "\n${YELLOW}📝 Registering task definition...${NC}"
aws ecs register-task-definition \
    --cli-input-json file://ecs-task-definition-temp.json \
    --region $AWS_REGION

# Step 9: Get VPC and subnet info
echo -e "\n${YELLOW}🌐 Getting VPC and subnet information...${NC}"
export VPC_ID=$(aws ec2 describe-vpcs --query 'Vpcs[0].VpcId' --output text --region $AWS_REGION)
export SUBNET_IDS=$(aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=$VPC_ID" \
    --query 'Subnets[0:2].SubnetId' \
    --output text --region $AWS_REGION | tr '\t' ',')

echo "VPC ID: $VPC_ID"
echo "Subnet IDs: $SUBNET_IDS"

# Step 10: Create security group
echo -e "\n${YELLOW}🔒 Creating security group...${NC}"
export SG_ID=$(aws ec2 create-security-group \
    --group-name bola8-ml-service-sg \
    --description "Security group for ML service" \
    --vpc-id $VPC_ID \
    --query 'GroupId' \
    --output text \
    --region $AWS_REGION 2>/dev/null || \
    aws ec2 describe-security-groups \
        --filters "Name=group-name,Values=bola8-ml-service-sg" "Name=vpc-id,Values=$VPC_ID" \
        --query 'SecurityGroups[0].GroupId' \
        --output text \
        --region $AWS_REGION)

echo "Security Group ID: $SG_ID"

# Allow inbound on port 8000
aws ec2 authorize-security-group-ingress \
    --group-id $SG_ID \
    --protocol tcp \
    --port 8000 \
    --cidr 0.0.0.0/0 \
    --region $AWS_REGION 2>/dev/null || \
    echo "Security group rule already exists, continuing..."

# Step 11: Create ECS service
echo -e "\n${YELLOW}🚀 Creating ECS service...${NC}"
aws ecs create-service \
    --cluster bola8-ml-cluster \
    --service-name bola8-ml-service \
    --task-definition bola8-ml-service \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_IDS],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
    --region $AWS_REGION 2>/dev/null || \
    echo "Service already exists, updating..."

# Wait for service to be stable
echo -e "\n${YELLOW}⏳ Waiting for service to be stable...${NC}"
aws ecs wait services-stable \
    --cluster bola8-ml-cluster \
    --services bola8-ml-service \
    --region $AWS_REGION

# Step 12: Get ML service URL
echo -e "\n${YELLOW}🔍 Getting ML service URL...${NC}"
sleep 10  # Wait a bit for task to start

export TASK_ARN=$(aws ecs list-tasks \
    --cluster bola8-ml-cluster \
    --service-name bola8-ml-service \
    --query 'taskArns[0]' \
    --output text \
    --region $AWS_REGION)

if [ -z "$TASK_ARN" ]; then
    echo -e "${RED}❌ No task found. Service may still be starting.${NC}"
    echo "Check status with: aws ecs describe-services --cluster bola8-ml-cluster --services bola8-ml-service --region $AWS_REGION"
    exit 1
fi

export ENI_ID=$(aws ecs describe-tasks \
    --cluster bola8-ml-cluster \
    --tasks $TASK_ARN \
    --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' \
    --output text \
    --region $AWS_REGION)

export PUBLIC_IP=$(aws ec2 describe-network-interfaces \
    --network-interface-ids $ENI_ID \
    --query 'NetworkInterfaces[0].Association.PublicIp' \
    --output text \
    --region $AWS_REGION)

# Cleanup temp file
rm -f ecs-task-definition-temp.json

echo -e "\n${GREEN}✅ Deployment Complete!${NC}"
echo -e "\n${GREEN}ML Service URL: http://$PUBLIC_IP:8000${NC}"
echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. Add to .env.local:"
echo "   ML_SERVICE_URL=http://$PUBLIC_IP:8000"
echo ""
echo "2. Test the service:"
echo "   curl http://$PUBLIC_IP:8000/health"
echo ""
echo "3. View logs:"
echo "   aws logs tail /ecs/bola8-ml-service --follow --region $AWS_REGION"

