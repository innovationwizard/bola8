# ML Prompt Learning System - Implementation Checklist

**Quick Reference**: Step-by-step implementation guide

**Prerequisites**:
- ✅ Database migrations completed
- ✅ Design document reviewed ([ML_PROMPT_LEARNING_SYSTEM.md](./ML_PROMPT_LEARNING_SYSTEM.md))

---

## Phase 1: Foundation (Week 1)

### 1.1 Prompt Storage Structure
- [ ] Create `/prompts/` directory structure:
  ```
  mkdir -p prompts/versions prompts/experiments
  ```
- [ ] Create `prompts/schema.json` (defines prompt version format)
- [ ] Export current hardcoded prompts to `prompts/versions/v1.0.0.json`
- [ ] Create symlink `prompts/versions/current.json → v1.0.0.json`
- [ ] Implement `lib/prompt-loader.ts`:
  - `loadCurrentPromptVersion()`
  - `loadPromptVersion(version: string)`
  - `savePromptVersion(version: PromptVersion)`

### 1.2 Database Utilities
- [ ] Create `lib/db/training.ts`:
  - `saveRating()`
  - `saveExperiment()`
  - `getBestParameters()`
  - `getTrainingHistory()`
- [ ] Test database queries

### 1.3 Training UI Page
- [ ] Create `app/train/page.tsx`
- [ ] Create components:
  - `components/training/StatusPanel.tsx`
  - `components/training/UploadSection.tsx`
  - `components/training/ResultsGrid.tsx`
  - `components/training/RatingForm.tsx`
- [ ] Style with Tailwind CSS
- [ ] Add to navigation menu

---

## Phase 2: API Endpoints (Week 2)

### 2.1 Training Enhancement Endpoint
- [ ] Create `app/api/enhance/train/route.ts`
- [ ] Implement parameter loading from prompt versions
- [ ] Call Leonardo API with custom parameters
- [ ] Call Replicate API with custom parameters
- [ ] Save results with experiment tracking
- [ ] Return experiment_id + options

### 2.2 Rating Submission Endpoint
- [ ] Create `app/api/train/rate/route.ts`
- [ ] Validate ratings (1-5 scale)
- [ ] Save to `enhancement_ratings` table
- [ ] Link to `parameter_experiments` table
- [ ] Update `prompt_versions` performance scores
- [ ] Call ML service (when ready)

### 2.3 Status & History Endpoints
- [ ] Create `app/api/train/status/route.ts`
- [ ] Create `app/api/train/history/route.ts`
- [ ] Implement analytics calculations:
  - Average ratings per API
  - Rating trends over time
  - Convergence metrics

### 2.4 Frontend Integration
- [ ] Connect UI to APIs
- [ ] Add loading states
- [ ] Add error handling
- [ ] Test full upload → rate → submit flow

---

## Phase 3: Python ML Service (Week 3)

### 3.1 Setup Python Project
- [ ] Create `/ml-service/` directory
- [ ] Initialize Python project:
  ```bash
  cd ml-service
  python3 -m venv venv
  source venv/bin/activate
  pip install fastapi uvicorn scikit-optimize numpy
  ```
- [ ] Create `requirements.txt`
- [ ] Create `main.py` (FastAPI app)

### 3.2 Implement Bayesian Optimizer
- [ ] Create `ml-service/optimizer.py`:
  - Define parameter space
  - Initialize `Optimizer` from scikit-optimize
  - Implement `suggest_parameters()`
  - Implement `update_model()`
- [ ] Add persistence (save optimizer state)
- [ ] Add convergence calculation

### 3.3 Deploy to AWS Lambda
- [ ] Create `serverless.yml` or use AWS SAM
- [ ] Package dependencies as Lambda layer
- [ ] Deploy function
- [ ] Set environment variables
- [ ] Get Lambda endpoint URL

### 3.4 Integrate with Node.js
- [ ] Add ML service URL to `.env`:
  ```
  ML_SERVICE_URL=https://your-lambda-url.amazonaws.com
  ```
- [ ] Create `lib/ml-client.ts`:
  - `suggestParameters()`
  - `updateModel()`
- [ ] Update `/api/enhance/train` to call ML service
- [ ] Update `/api/train/rate` to update ML model

---

## Phase 4: Prompt Evolution (Week 4)

### 4.1 OpenAI Integration
- [ ] Add OpenAI API key to `.env`:
  ```
  OPENAI_API_KEY=sk-...
  ```
- [ ] Install OpenAI SDK:
  ```bash
  npm install openai
  ```
- [ ] Create `lib/prompt-evolution.ts`:
  - `evolvePrompt()`
  - `analyzeCommonIssues()`
  - `createPromptVersion()`

### 4.2 Evolution System Prompt
- [ ] Create `prompts/evolution-system-prompt.txt`
- [ ] Test prompt with sample data
- [ ] Refine based on results

### 4.3 Evolution Triggers
- [ ] Create `lib/training/evolution-scheduler.ts`:
  - Check if evolution needed (every 10 samples)
  - Trigger GPT-4 call
  - Create new prompt version
  - Schedule A/B test
- [ ] Integrate with `/api/train/rate` endpoint
- [ ] Add manual trigger endpoint: `POST /api/train/evolve`

### 4.4 A/B Testing
- [ ] Implement prompt version selection logic
- [ ] Track which version used for each experiment
- [ ] Compare performance after N samples
- [ ] Auto-promote winner to `current.json`

---

## Phase 5: Testing (Week 5-6)

### 5.1 Manual Testing
- [ ] Upload 5 test images
- [ ] Rate all variants
- [ ] Verify ratings saved correctly
- [ ] Check ML model updates
- [ ] Verify parameter convergence

### 5.2 Hire Training Personnel
- [ ] Document training process
- [ ] Train personnel on rating criteria
- [ ] Set daily targets (5-10 samples/day)
- [ ] Monitor quality of ratings

### 5.3 Collect Initial Dataset
- [ ] Target: 50 samples for Phase 1
- [ ] Track progress daily
- [ ] Monitor system performance
- [ ] Fix bugs as discovered

### 5.4 Analysis
- [ ] Analyze parameter trends
- [ ] Identify best API (Leonardo vs SD)
- [ ] Review evolved prompts
- [ ] Calculate improvement metrics

---

## Phase 6: Reward Model (Week 7+)

### 6.1 Migrate ML Service to ECS
- [ ] Create Docker image for Python service
- [ ] Install PyTorch + dependencies
- [ ] Deploy to ECS Fargate
- [ ] Update ML_SERVICE_URL

### 6.2 Feature Extraction
- [ ] Implement CLIP feature extraction
- [ ] Implement classical features:
  - Color histograms
  - Edge density (Canny)
  - Texture analysis (Gabor)
  - Lighting distribution
- [ ] Create feature vector (512 + 200 dim)

### 6.3 Reward Model Architecture
- [ ] Implement PyTorch model (see design doc)
- [ ] Create training pipeline
- [ ] Implement validation loop
- [ ] Add model checkpointing

### 6.4 Training
- [ ] Load all rated images from S3
- [ ] Extract features for all images
- [ ] Split train/val (80/20)
- [ ] Train model
- [ ] Evaluate on validation set

### 6.5 Inference
- [ ] Add endpoint: `POST /ml/predict_rating`
- [ ] Integrate with `/api/enhance/train`:
  - Generate 10 variants
  - Predict ratings for all
  - Return top 2 to user
- [ ] Implement active learning:
  - Prioritize uncertain predictions

---

## Environment Variables

Add to `.env`:

```bash
# Existing
LEONARDO_API_KEY=...
REPLICATE_API_TOKEN=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
DATABASE_URL=...

# New for ML System
OPENAI_API_KEY=sk-...                           # GPT-4 for prompt evolution
ML_SERVICE_URL=https://your-lambda-url.amazonaws.com  # Python ML service
ENABLE_TRAINING_MODE=true                       # Feature flag
TRAINING_ADMIN_EMAILS=admin@example.com         # Who can access /train
```

---

## Testing Checklist

### Unit Tests
- [ ] Prompt loader functions
- [ ] Rating validation
- [ ] Parameter range validation
- [ ] ML client (mock responses)

### Integration Tests
- [ ] Upload → Generate → Rate flow
- [ ] ML service integration
- [ ] Database operations
- [ ] S3 uploads

### E2E Tests
- [ ] Full training session
- [ ] Prompt evolution trigger
- [ ] Status dashboard accuracy

---

## Deployment Checklist

### Before Production
- [ ] Review all environment variables
- [ ] Test with production data
- [ ] Set up monitoring/logging
- [ ] Document training procedures
- [ ] Train personnel

### Production Deployment
- [ ] Deploy ML service first
- [ ] Deploy Node.js changes
- [ ] Verify connectivity
- [ ] Run smoke tests
- [ ] Monitor for errors

### Post-Deployment
- [ ] Monitor ML service performance
- [ ] Track training progress
- [ ] Review first 10 samples
- [ ] Adjust parameters if needed

---

## Success Criteria

### Week 1-2
- ✅ Training UI functional
- ✅ Can upload, enhance, and rate images
- ✅ Data saved to DB correctly

### Week 3-4
- ✅ ML service deployed and working
- ✅ Bayesian optimizer suggesting parameters
- ✅ Prompt evolution triggered automatically

### Week 5-6
- ✅ 50+ training samples collected
- ✅ Best rating ≥ 4.0/5.0
- ✅ Clear parameter convergence visible

### Week 7+
- ✅ Reward model trained (accuracy ≥ 80%)
- ✅ Active learning reduces workload
- ✅ System produces consistent photorealistic results

---

## Troubleshooting

### ML Service Not Responding
1. Check Lambda logs in CloudWatch
2. Verify ML_SERVICE_URL is correct
3. Check IAM permissions
4. Try invoking directly (curl/Postman)

### Poor Convergence
1. Review parameter ranges (may be too narrow/wide)
2. Check if ratings are consistent
3. Try more initial random samples
4. Consider expanding parameter space

### Evolved Prompts Worse
1. Review GPT-4 system prompt
2. Add more specific constraints
3. Manual review before auto-promotion
4. Increase A/B test sample size

### Database Errors
1. Verify migrations ran successfully
2. Check foreign key constraints
3. Review data types (especially JSONB)
4. Check connection pooling

---

**Ready to start implementation? Begin with Phase 1.1!**
