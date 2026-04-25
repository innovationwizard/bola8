# S3 Buckets Setup Guide

This guide covers everything needed to wire up the 5 S3 buckets for the Bola8 Operations Platform.

## Prerequisites

1. AWS Account with access to S3
2. AWS IAM user or role with S3 permissions
3. All 5 buckets created in `us-east-2` region

## Required Environment Variables

Add these to your `.env.local` file (for local development) or your deployment platform (Vercel, etc.):

```bash
# AWS Credentials
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=us-east-2

# S3 Bucket Names (optional - defaults shown)
S3_UPLOAD_BUCKET=bola8-uploads
S3_IMAGES_BUCKET=bola8-images
LEONARDO_S3_BUCKET=bola8-leonardo-images
S3_DESIGNS_BUCKET=bola8-designs
S3_NOT_IMAGES_BUCKET=bola8-not-images
```

**Note:** If you don't set the bucket names, the code will use the defaults shown above.

## Step 1: Create S3 Buckets

Create all 5 buckets in the AWS Console (us-east-2 region):

1. **bola8-uploads**
2. **bola8-images**
3. **bola8-leonardo-images**
4. **bola8-designs**
5. **bola8-not-images**

### AWS CLI Method

```bash
aws s3 mb s3://bola8-uploads --region us-east-2
aws s3 mb s3://bola8-images --region us-east-2
aws s3 mb s3://bola8-leonardo-images --region us-east-2
aws s3 mb s3://bola8-designs --region us-east-2
aws s3 mb s3://bola8-not-images --region us-east-2
```

## Step 2: Configure Bucket Policies

Each bucket needs a policy that allows your application to read and write files. Here's a recommended policy:

### Bucket Policy Template

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAppReadWrite",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::YOUR_ACCOUNT_ID:user/YOUR_IAM_USER"
      },
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::BUCKET_NAME",
        "arn:aws:s3:::BUCKET_NAME/*"
      ]
    }
  ]
}
```

Replace:
- `YOUR_ACCOUNT_ID` - Your AWS account ID
- `YOUR_IAM_USER` - Your IAM user name (or use a role)
- `BUCKET_NAME` - The specific bucket name

### Public Read Access (Optional)

If you want files to be publicly accessible via URL, add this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/*"
    }
  ]
}
```

**Security Note:** Only enable public read if you're comfortable with files being publicly accessible. Consider using CloudFront or signed URLs for better security.

## Step 3: Configure CORS (If Needed)

If your app will be accessed from a browser and needs to upload directly to S3, configure CORS:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedOrigins": [
      "https://your-domain.com",
      "http://localhost:3000"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

## Step 4: Create IAM User/Role

### Option A: IAM User (Recommended for Development)

1. Go to IAM → Users → Create User
2. Name: `bola8-s3-user` (or your preferred name)
3. Attach policy: `AmazonS3FullAccess` (or create a custom policy below)
4. Create Access Key
5. Save the Access Key ID and Secret Access Key

### Option B: IAM Role (Recommended for Production)

1. Go to IAM → Roles → Create Role
2. Select your service (EC2, Lambda, etc.)
3. Attach policy: `AmazonS3FullAccess` (or custom policy)
4. Use role credentials in your deployment

### Custom IAM Policy (More Secure)

Instead of `AmazonS3FullAccess`, use this custom policy for better security:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::bola8-uploads",
        "arn:aws:s3:::bola8-uploads/*",
        "arn:aws:s3:::bola8-images",
        "arn:aws:s3:::bola8-images/*",
        "arn:aws:s3:::bola8-leonardo-images",
        "arn:aws:s3:::bola8-leonardo-images/*",
        "arn:aws:s3:::bola8-designs",
        "arn:aws:s3:::bola8-designs/*",
        "arn:aws:s3:::bola8-not-images",
        "arn:aws:s3:::bola8-not-images/*"
      ]
    }
  ]
}
```

## Step 5: Set Environment Variables

### Local Development (.env.local)

Create `.env.local` in the project root:

```bash
# AWS Credentials
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=us-east-2

# S3 Buckets (optional - defaults work if names match)
S3_UPLOAD_BUCKET=bola8-uploads
S3_IMAGES_BUCKET=bola8-images
LEONARDO_S3_BUCKET=bola8-leonardo-images
S3_DESIGNS_BUCKET=bola8-designs
S3_NOT_IMAGES_BUCKET=bola8-not-images
```

### Vercel Deployment

1. Go to your Vercel project → Settings → Environment Variables
2. Add each variable:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_REGION=us-east-2`
   - `S3_UPLOAD_BUCKET=bola8-uploads` (optional)
   - `S3_IMAGES_BUCKET=bola8-images` (optional)
   - `LEONARDO_S3_BUCKET=bola8-leonardo-images` (optional)
   - `S3_DESIGNS_BUCKET=bola8-designs` (optional)
   - `S3_NOT_IMAGES_BUCKET=bola8-not-images` (optional)

3. Select environments (Production, Preview, Development)
4. Redeploy after adding variables

## Step 6: Verify Setup

### Test Upload

You can test the S3 connection by:

1. **Using the app**: Upload a file through the UI
2. **Check S3 Console**: Verify files appear in the correct buckets
3. **Check logs**: Look for any S3-related errors in your application logs

### Expected File Structure

After uploading files, you should see:

```
bola8-uploads/
  uploads/
    {projectId}/
      originals/
        {timestamp}-{filename}

bola8-images/
  projects/
    {projectId}/
      {workflowStep}/
        images/
          {timestamp}-{filename}

bola8-leonardo-images/
  enhanced/
    {projectId}/
      {timestamp}-{filename}

bola8-designs/
  projects/
    {projectId}/
      {workflowStep}/
        designs/
          {timestamp}-{filename}

bola8-not-images/
  projects/
    {projectId}/
      {workflowStep}/
        documents/
          {timestamp}-{filename}
```

## Troubleshooting

### Common Issues

1. **"Access Denied" errors**
   - Check IAM user/role has correct permissions
   - Verify bucket policies allow your principal
   - Check AWS credentials are correct

2. **"Bucket not found" errors**
   - Verify bucket names match exactly (case-sensitive)
   - Check buckets are in `us-east-2` region
   - Verify bucket names in environment variables

3. **CORS errors (browser)**
   - Configure CORS on buckets
   - Check allowed origins match your domain

4. **Files not appearing**
   - Check S3 console directly
   - Verify upload succeeded (check logs)
   - Check file path structure matches expected format

### Debug Mode

Enable debug logging by checking your application logs. The S3 client will log errors if credentials or permissions are incorrect.

## Security Best Practices

1. **Never commit credentials** to git
2. **Use IAM roles** instead of users in production
3. **Limit permissions** to only required buckets
4. **Enable bucket versioning** for important files
5. **Set up lifecycle policies** to archive old files
6. **Use CloudFront** for public file access instead of direct S3 URLs
7. **Enable bucket encryption** (SSE-S3 or SSE-KMS)

## Cost Optimization

1. **Set up lifecycle policies** to move old files to Glacier or delete them
2. **Enable Intelligent-Tiering** for buckets with varying access patterns
3. **Monitor usage** with AWS Cost Explorer
4. **Set up billing alerts** to avoid surprises

## Next Steps

Once S3 is configured:

1. Test file uploads through the application
2. Verify files are organized correctly in buckets
3. Set up monitoring and alerts
4. Configure backup/archival policies
5. Review and optimize bucket policies

