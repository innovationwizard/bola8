# ML Prompt Learning System - Data Flow

**Visual guide to how data flows through the system**

---

## Training Flow (User Perspective)

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Upload Image                                            │
│ Trainer uploads interior design image                           │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: System Generates 2 Variants                             │
│ Uses Bayesian-optimized parameters + current prompts            │
│ ├─ Option A: Leonardo (params from ML service)                  │
│ └─ Option B: Stable Diffusion (params from ML service)          │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Trainer Rates Both Options                              │
│ Rates A: 3/5 ("Good depth, colors slightly off")                │
│ Rates B: 5/5 ("Perfect photorealism!")                          │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: System Learns                                           │
│ ML model updates based on ratings                               │
│ Future generations will favor Option B's parameters             │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: Prompt Evolution (Every 10 Samples)                     │
│ GPT-4 analyzes what's working and evolves prompts               │
│ New prompt tested in next batch                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technical Data Flow

### Flow 1: Training Image Enhancement

```
┌──────────────┐
│  Trainer     │
│  (Browser)   │
└──────┬───────┘
       │
       │ POST /api/enhance/train
       │ FormData: {image, project_id, mode}
       ▼
┌─────────────────────────────────────────────────────────────┐
│  Next.js API: /api/enhance/train                            │
│                                                              │
│  1. Receive image                                           │
│  2. Save original to S3 (bola8-uploads)                    │
│  3. Call ML service for parameter suggestions               │
│  4. Load current prompt versions                            │
│  5. Generate 2 variants                                     │
│  6. Save enhanced images to S3 (bola8-leonardo-images)     │
│  7. Save metadata to PostgreSQL                             │
│  8. Return experiment_id + URLs                             │
└────┬───────────────────┬────────────────────────────────────┘
     │                   │
     │                   │ GET /ml/suggest_parameters
     │                   ▼
     │            ┌─────────────────────────────────────┐
     │            │  Python ML Service (AWS Lambda)     │
     │            │                                      │
     │            │  Bayesian Optimizer suggests:       │
     │            │  - Option A: {api: "leonardo",      │
     │            │               init_strength: 0.28,  │
     │            │               guidance: 7.2, ...}   │
     │            │  - Option B: {api: "stablediff",    │
     │            │               strength: 0.22, ...}  │
     │            └─────────────────────────────────────┘
     │
     ├─── Call Leonardo API with Option A params
     │    └─ POST https://cloud.leonardo.ai/api/rest/v1/generations
     │
     └─── Call Replicate API with Option B params
          └─ POST https://api.replicate.com/v1/predictions

┌──────────────────────────────────────────────────────────────┐
│  Storage Layer                                               │
├──────────────────────────────────────────────────────────────┤
│  S3: bola8-uploads/               (original images)         │
│  S3: bola8-leonardo-images/       (enhanced images)         │
│  RDS: images table                 (image metadata)          │
│  RDS: parameter_experiments table  (params used)             │
└──────────────────────────────────────────────────────────────┘

       Response to browser:
       ▼
┌──────────────────────────────────────────────────────┐
│  {                                                   │
│    "experiment_id": "exp_12345",                     │
│    "options": [                                      │
│      {                                               │
│        "option": "A",                                │
│        "url": "https://s3.../enhanced-a.jpg",        │
│        "parameters": {...}                           │
│      },                                              │
│      {                                               │
│        "option": "B",                                │
│        "url": "https://s3.../enhanced-b.jpg",        │
│        "parameters": {...}                           │
│      }                                               │
│    ]                                                 │
│  }                                                   │
└──────────────────────────────────────────────────────┘
```

### Flow 2: Rating Submission

```
┌──────────────┐
│  Trainer     │
│  (Browser)   │
└──────┬───────┘
       │
       │ POST /api/train/rate
       │ {
       │   experiment_id: "exp_12345",
       │   ratings: [
       │     {option: "A", image_id: 123, rating: 3, comments: "..."},
       │     {option: "B", image_id: 124, rating: 5, comments: "..."}
       │   ]
       │ }
       ▼
┌─────────────────────────────────────────────────────────────┐
│  Next.js API: /api/train/rate                               │
│                                                              │
│  1. Validate ratings (1-5 range)                            │
│  2. Save to enhancement_ratings table                       │
│  3. Update parameter_experiments table                      │
│  4. Update prompt_versions performance scores               │
│  5. Call ML service to update Bayesian model                │
│  6. Check if prompt evolution needed (every 10 samples)     │
│  7. Return updated status                                   │
└────┬───────────────────┬──────────────────┬─────────────────┘
     │                   │                  │
     │                   │                  │ Check: samples % 10 == 0?
     │                   │                  ▼
     │                   │           ┌─────────────────────────────┐
     │                   │           │  Prompt Evolution           │
     │                   │           │                             │
     │                   │           │  1. Analyze recent ratings  │
     │                   │           │  2. Call GPT-4 API          │
     │                   │           │  3. Generate new prompt     │
     │                   │           │  4. Save as new version     │
     │                   │           │  5. Schedule A/B test       │
     │                   │           └─────────────────────────────┘
     │                   │
     │                   │ POST /ml/update_model
     │                   ▼
     │            ┌─────────────────────────────────────┐
     │            │  Python ML Service                  │
     │            │                                      │
     │            │  optimizer.tell([params], [rating]) │
     │            │  - Updates Gaussian Process model   │
     │            │  - Learns: high rating → good params│
     │            │  - Next suggestions will be better  │
     │            └─────────────────────────────────────┘
     │
     │ Save to PostgreSQL
     ▼
┌──────────────────────────────────────────────────────────────┐
│  PostgreSQL Tables Updated:                                  │
│  ├─ enhancement_ratings                                      │
│  │   (id, image_id, option, rating, comments, rated_by)     │
│  ├─ parameter_experiments                                    │
│  │   (id, image_id, prompt_version_id, parameters, rating)  │
│  └─ prompt_versions                                          │
│      (id, version, performance_score, usage_count)           │
└──────────────────────────────────────────────────────────────┘

       Response to browser:
       ▼
┌──────────────────────────────────────────────────────┐
│  {                                                   │
│    "success": true,                                  │
│    "ml_updated": true,                               │
│    "current_best_rating": 4.2,                       │
│    "samples_collected": 23,                          │
│    "phase_1_complete": false                         │
│  }                                                   │
└──────────────────────────────────────────────────────┘
```

### Flow 3: Prompt Evolution (Triggered Every 10 Samples)

```
┌─────────────────────────────────────────────────────────────┐
│  Trigger: 10, 20, 30, ... samples collected                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  lib/prompt-evolution.ts                                    │
│                                                              │
│  1. Query last 10 experiments from DB                       │
│  2. Calculate avg rating for current prompt                 │
│  3. Analyze common issues from low-rated comments           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ POST https://api.openai.com/v1/chat/completions
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  OpenAI GPT-4 API                                           │
│                                                              │
│  System: "You are an expert in photorealistic prompts..."   │
│  User: {                                                    │
│    current_prompt: "ultra-realistic, photorealistic...",    │
│    rating: 3.6,                                             │
│    issues: ["flat appearance", "poor depth"]                │
│  }                                                           │
│                                                              │
│  GPT-4 Response:                                            │
│  {                                                           │
│    "improved_prompt": "professional photography quality,    │
│                        photorealistic interior, cinematic   │
│                        depth of field, volumetric lighting, │
│                        ray-traced reflections, 8k...",      │
│    "changes": [                                             │
│      "Added 'cinematic depth of field' for better depth",   │
│      "Added 'volumetric lighting' for realism",             │
│      "Emphasized 'professional photography' over 'render'"  │
│    ],                                                        │
│    "reasoning": "The term 'render' may trigger flat         │
│                  appearance. 'Professional photography'     │
│                  signals real-world depth and lighting."    │
│  }                                                           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Save New Prompt Version                                    │
│                                                              │
│  File: /prompts/versions/v1.0.1.json                        │
│  DB: INSERT INTO prompt_versions (                          │
│        version='v1.0.1',                                    │
│        prompt='professional photography quality...',        │
│        parent_version='v1.0.0'                              │
│      )                                                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Schedule A/B Test                                          │
│                                                              │
│  Next 5 samples:                                            │
│  - Sample 11, 13, 15: Use v1.0.0 (old)                      │
│  - Sample 12, 14: Use v1.0.1 (new)                          │
│                                                              │
│  After 5 samples:                                           │
│  - Compare avg ratings                                      │
│  - If v1.0.1 wins: Update current.json → v1.0.1            │
│  - If v1.0.0 wins: Keep current.json → v1.0.0              │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema Relationships

```
┌─────────────────────────────────────────────────────────────┐
│  images                                                      │
│  ├─ id (PK)                                                  │
│  ├─ project_id                                              │
│  ├─ image_type ('original', 'enhanced')                     │
│  ├─ s3_bucket                                               │
│  ├─ s3_key                                                  │
│  ├─ width, height                                           │
│  ├─ metadata (JSONB)                                        │
│  └─ parent_image_id (FK → images.id)                        │
└────────┬────────────────────────────────────────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────────────────────────────────────────────────┐
│  enhancement_ratings                                         │
│  ├─ id (PK)                                                  │
│  ├─ image_id (FK → images.id)                               │
│  ├─ option ('A', 'B')                                       │
│  ├─ rating (1-5)                                            │
│  ├─ comments (TEXT)                                         │
│  ├─ rated_by                                                │
│  └─ rated_at                                                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  prompt_versions                                             │
│  ├─ id (PK)                                                  │
│  ├─ version (UNIQUE, e.g., 'v1.0.0')                        │
│  ├─ prompt (TEXT)                                           │
│  ├─ negative_prompt (TEXT)                                  │
│  ├─ created_at                                              │
│  ├─ performance_score (avg rating)                          │
│  └─ usage_count                                             │
└────────┬────────────────────────────────────────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────────────────────────────────────────────────┐
│  parameter_experiments                                       │
│  ├─ id (PK)                                                  │
│  ├─ image_id (FK → images.id)                               │
│  ├─ prompt_version_id (FK → prompt_versions.id)             │
│  ├─ init_strength                                           │
│  ├─ guidance_scale                                          │
│  ├─ controlnet_weight                                       │
│  ├─ rating (copied from enhancement_ratings for quick query)│
│  └─ created_at                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## File System Structure

```
/bola8/
├── app/
│   ├── api/
│   │   ├── enhance/
│   │   │   ├── route.js                    (existing production endpoint)
│   │   │   └── train/
│   │   │       └── route.ts                (NEW: training endpoint)
│   │   └── train/
│   │       ├── rate/
│   │       │   └── route.ts                (NEW: rating submission)
│   │       ├── status/
│   │       │   └── route.ts                (NEW: status dashboard)
│   │       └── history/
│   │           └── route.ts                (NEW: training history)
│   └── train/
│       └── page.tsx                        (NEW: training UI)
│
├── lib/
│   ├── prompt-loader.ts                    (NEW: load/save prompt versions)
│   ├── prompt-evolution.ts                 (NEW: GPT-4 integration)
│   ├── ml-client.ts                        (NEW: call Python ML service)
│   └── db/
│       └── training.ts                     (NEW: training-specific DB queries)
│
├── prompts/                                (NEW: prompt storage)
│   ├── schema.json
│   ├── evolution-system-prompt.txt
│   ├── versions/
│   │   ├── v1.0.0.json
│   │   ├── v1.0.1.json
│   │   └── current.json → v1.0.0.json
│   └── experiments/
│       ├── experiment_001.json
│       └── experiment_002.json
│
└── ml-service/                             (NEW: Python ML microservice)
    ├── main.py                             (FastAPI app)
    ├── optimizer.py                        (Bayesian optimizer)
    ├── reward_model.py                     (Phase 2: PyTorch model)
    ├── feature_extraction.py               (Phase 2: image features)
    ├── requirements.txt
    └── serverless.yml                      (AWS Lambda deployment)
```

---

## Learning Cycle Visualization

```
┌────────────────────────────────────────────────────────────────┐
│  Iteration 1: Random Exploration                               │
│  ├─ Parameters: Random within ranges                           │
│  ├─ Rating: 2.5/5.0 (Poor)                                     │
│  └─ Learning: "These parameters don't work"                    │
└────────────────────────────────────────────────────────────────┘
                         ▼
┌────────────────────────────────────────────────────────────────┐
│  Iteration 5: Bayesian Starts Working                          │
│  ├─ Parameters: Model suggests promising regions              │
│  ├─ Rating: 3.2/5.0 (Better)                                   │
│  └─ Learning: "Higher guidance_scale helps"                    │
└────────────────────────────────────────────────────────────────┘
                         ▼
┌────────────────────────────────────────────────────────────────┐
│  Iteration 10: First Prompt Evolution                          │
│  ├─ Prompt: GPT-4 evolves based on ratings                    │
│  ├─ Parameters: Bayesian converging                           │
│  ├─ Rating: 3.8/5.0 (Good)                                     │
│  └─ Learning: "New prompt + optimal params = better results"   │
└────────────────────────────────────────────────────────────────┘
                         ▼
┌────────────────────────────────────────────────────────────────┐
│  Iteration 20: Second Prompt Evolution                         │
│  ├─ Prompt: Further refined                                   │
│  ├─ Parameters: Near-optimal                                  │
│  ├─ Rating: 4.2/5.0 (Great)                                    │
│  └─ Learning: "Found winning combination!"                     │
└────────────────────────────────────────────────────────────────┘
                         ▼
┌────────────────────────────────────────────────────────────────┐
│  Iteration 50: Phase 1 Complete                               │
│  ├─ Best Parameters: {init_strength: 0.23, guidance: 8.2, ...}│
│  ├─ Best Prompt: "professional photography quality, cinematic" │
│  ├─ Best API: Stable Diffusion (avg 4.5 vs Leonardo 3.8)      │
│  ├─ Rating: 4.5/5.0 (Excellent)                                │
│  └─ Result: Phase 1 stops, Phase 2 continues                  │
└────────────────────────────────────────────────────────────────┘
                         ▼
┌────────────────────────────────────────────────────────────────┐
│  Iteration 200: Phase 2 Reward Model Trained                  │
│  ├─ Model can predict ratings from images (85% accuracy)       │
│  ├─ Active learning: Generate 10, show top 2                  │
│  ├─ Rating: 4.8/5.0 (Near-perfect)                             │
│  └─ Result: System consistently produces photorealistic results│
└────────────────────────────────────────────────────────────────┘
```

---

## Summary: Key Data Flows

1. **Training Flow**: Upload → ML suggests params → Generate 2 variants → Return to user
2. **Rating Flow**: User rates → Save to DB → Update ML model → Check evolution trigger
3. **Evolution Flow**: Every 10 samples → GPT-4 analyzes → New prompt → A/B test
4. **Learning Flow**: Ratings → Bayesian updates → Better param suggestions → Higher ratings
5. **Inference Flow** (Phase 2): Image → Extract features → Predict rating → Filter top variants

**All flows converge on one goal: Consistently photorealistic outputs.**
