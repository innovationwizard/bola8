# ML Prompt Learning System - Architecture Design

**Project**: Bola8 - Image Enhancement Prompt Optimization
**Goal**: Learn optimal prompts and parameters for photorealistic renders
**Status**: Design Phase
**Created**: 2025-01-19

---

## Executive Summary

This system implements a dual-learning approach to optimize image enhancement prompts:
1. **Fast Learning (Phase 1)**: Bayesian Optimization + Prompt Evolution (20-50 samples)
2. **Slow Learning (Phase 2)**: Deep Reward Model (200+ samples)

Both phases run simultaneously. Once fast learning produces acceptable results, it stops and slow learning continues indefinitely.

---

## Tech Stack

### Core Components
- **Frontend**: Next.js 14 (existing) + new `/train` page
- **API Layer**: Next.js API routes (TypeScript)
- **ML Service**: Python FastAPI microservice (AWS Lambda or ECS)
- **Database**: PostgreSQL (existing RDS)
- **Storage**: S3 (existing buckets)
- **Prompt Evolution**: OpenAI GPT-4 API
- **Image APIs**: Leonardo AI + Replicate (existing)

### Python ML Dependencies
```
scikit-optimize==0.9.0  # Bayesian optimization
torch==2.1.0            # Reward model (Phase 2)
torchvision==0.16.0     # Image feature extraction
fastapi==0.104.1        # API framework
pillow==10.1.0          # Image processing
numpy==1.24.3           # Numerical operations
```

### Node.js Dependencies (new)
```json
{
  "openai": "^4.20.0",
  "axios": "^1.6.0"
}
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Training UI (/train)                    │
│  ┌──────────────┐              ┌──────────────┐            │
│  │   Option A   │              │   Option B   │            │
│  │   [Image]    │              │   [Image]    │            │
│  │  Rating 1-5  │              │  Rating 1-5  │            │
│  └──────────────┘              └──────────────┘            │
│            │                           │                     │
│            └───────────┬───────────────┘                     │
│                        │ POST /api/train/rate               │
└────────────────────────┼───────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Next.js API Layer (TypeScript)                  │
│                                                              │
│  /api/enhance/train  ──────┐                                │
│  /api/train/rate           │                                │
│  /api/train/status         │                                │
└────────────────────────────┼───────────────────────────────┘
                             │
            ┌────────────────┼────────────────┐
            ▼                ▼                ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │ Python ML    │  │ GPT-4 Prompt │  │ PostgreSQL   │
    │ Service      │  │ Evolution    │  │ RDS          │
    │ (Bayesian)   │  │ API          │  │              │
    └──────────────┘  └──────────────┘  └──────────────┘
            │                                  │
            └──────────────┬───────────────────┘
                           ▼
                   ┌──────────────┐
                   │ Leonardo AI  │
                   │ Replicate    │
                   └──────────────┘
```

---

## Parameter Space (What We're Optimizing)

### 1. **API Selection**
- **Type**: Categorical
- **Options**: `["leonardo", "stablediffusion"]`
- **Current**: Both run simultaneously
- **Learning Goal**: Which API produces more photorealistic results?

### 2. **Prompt Text**
- **Type**: String (evolved via GPT-4)
- **Current**:
  ```
  "ultra-realistic, photorealistic interior design render, 8k,
   sharp focus, realistic textures on all surfaces..."
  ```
- **Learning Goal**: Find words/phrases that maximize photorealism

### 3. **Negative Prompt Text**
- **Type**: String (evolved via GPT-4)
- **Current**:
  ```
  "drawn, sketch, illustration, cartoon, blurry, distorted,
   warped, ugly, noisy, grainy, unreal..."
  ```
- **Learning Goal**: Find exclusions that prevent flat/montage look

### 4. **Init Strength** (Leonardo & SD)
- **Type**: Continuous [0.1, 0.5]
- **Current**: 0.25 (structure), 0.3 (surfaces), 0.2 (SD)
- **Learning Goal**: Balance between preservation and transformation

### 5. **Guidance Scale** (Leonardo & SD)
- **Type**: Continuous [5.0, 12.0]
- **Current**: 7.0 (Leonardo), 7.5 (SD)
- **Learning Goal**: Optimal adherence to prompt

### 6. **ControlNet Weight** (Leonardo only)
- **Type**: Continuous [0.7, 0.99]
- **Current**: 0.92
- **Learning Goal**: Maximum structure preservation while achieving photorealism

---

## Prompt Storage Structure

### File System: `/prompts/`
```
/prompts/
  ├── versions/
  │   ├── v1.0.0.json
  │   ├── v1.0.1.json
  │   ├── v1.1.0.json
  │   └── current.json (symlink to best version)
  ├── experiments/
  │   ├── experiment_001.json
  │   ├── experiment_002.json
  │   └── ...
  └── schema.json
```

### Prompt Version Format (`v1.0.0.json`)
```json
{
  "version": "v1.0.0",
  "created_at": "2025-01-19T10:00:00Z",
  "created_by": "system_init",
  "parent_version": null,
  "leonardo": {
    "prompt": "ultra-realistic, photorealistic interior design render...",
    "negative_prompt": "drawn, sketch, illustration, cartoon...",
    "init_strength": 0.25,
    "guidance_scale": 7.0,
    "controlnet_weight": 0.92
  },
  "stablediffusion": {
    "prompt": "ultra-realistic, photorealistic interior design render...",
    "negative_prompt": "drawn, sketch, illustration, cartoon...",
    "strength": 0.2,
    "guidance_scale": 7.5,
    "controlnet_conditioning_scale": 0.95
  },
  "performance": {
    "avg_rating": null,
    "sample_count": 0,
    "win_rate": null,
    "last_used": null
  },
  "metadata": {
    "description": "Initial hardcoded prompts from route.js",
    "tags": ["baseline", "structure-preservation", "photorealism"]
  }
}
```

### Database: `prompt_versions` Table
```sql
-- Already migrated (per your confirmation)
CREATE TABLE prompt_versions (
  id SERIAL PRIMARY KEY,
  version VARCHAR(50) UNIQUE,
  prompt TEXT,
  negative_prompt TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  performance_score FLOAT,
  usage_count INTEGER DEFAULT 0
);
```

**Note**: File system is source of truth; DB is for quick queries and tracking.

---

## Phase 1: Fast Learning (Bayesian Optimization)

### Goal
Find optimal numeric parameters in 20-50 trials using intelligent exploration.

### How Bayesian Optimization Works
1. **Start**: Try a few random parameter combinations
2. **Model**: Build a probabilistic model of "rating vs parameters"
3. **Acquire**: Choose next parameters to try (balance exploration/exploitation)
4. **Update**: User rates result, model improves
5. **Repeat**: Converges to optimal parameters

### Algorithm: Gaussian Process + Expected Improvement
- **Library**: `scikit-optimize` (Python)
- **Acquisition Function**: Expected Improvement (EI)
- **Initial Samples**: 5 random
- **Max Iterations**: 50 (then stop Phase 1)

### Optimized Parameters (Phase 1)
- `init_strength`: [0.1, 0.5]
- `guidance_scale`: [5.0, 12.0]
- `controlnet_weight`: [0.7, 0.99]
- `api`: ["leonardo", "stablediffusion"] (treated as 0/1 in GP)

**Prompts are fixed during Phase 1** (using current hardcoded prompts).

### Convergence Criteria
Phase 1 stops when:
- 50 samples collected, OR
- Best rating ≥ 4.0/5.0, OR
- Manual override by admin

---

## Phase 1.5: Prompt Evolution (Runs alongside Bayesian)

### Goal
Evolve prompt text using GPT-4 based on ratings.

### How It Works
1. **Every 10 samples**: Analyze top-rated prompts
2. **GPT-4 generates variants**:
   - Keeps high-performing phrases
   - Removes low-performing phrases
   - Suggests new photorealism-enhancing terms
3. **Test variants**: Next 5 samples use evolved prompts
4. **Keep best**: If avg rating improves, adopt new prompt

### GPT-4 Meta-Prompt Template
```
You are an expert in AI image generation prompts for photorealistic interior design.

GOAL: Generate a better prompt that maximizes photorealism while preserving:
- Exact spatial layout
- Exact element shapes and colors
- Exact materials

CURRENT PROMPT (rating: {rating}/5.0):
"{current_prompt}"

TOP ISSUES FROM LOW RATINGS:
- Flat/montage appearance
- Lack of depth
- Unrealistic lighting

GENERATE:
1. An improved prompt (keep what works, enhance what doesn't)
2. Explanation of changes
3. Expected improvements

Output JSON:
{
  "improved_prompt": "...",
  "changes": ["added X", "removed Y", "strengthened Z"],
  "reasoning": "..."
}
```

### Prompt Evolution Criteria
- **Trigger**: Every 10 samples
- **Condition**: If best rating < 4.5/5.0
- **Method**: GPT-4 generates 2 variants
- **Selection**: A/B test for next 5 samples each

---

## Phase 2: Slow Learning (Reward Model)

### Goal
Train a deep neural network to predict "photorealism score" from image features.

### Timeline
Starts immediately, becomes reliable after 200+ samples.

### How It Works
1. **Extract image features** from enhanced images:
   - CLIP embeddings (visual-semantic features)
   - Color histograms
   - Edge density (Canny)
   - Texture analysis (Gabor filters)
   - Lighting distribution
2. **Train reward model**: Features → Rating (1-5)
3. **Use for generation**: Predict rating before showing to user
4. **Active learning**: Show user the most uncertain predictions

### Architecture
```python
class PhotorealismRewardModel(torch.nn.Module):
    def __init__(self):
        super().__init__()
        # CLIP features: 512-dim
        self.clip_encoder = CLIPVisionModel.from_pretrained("openai/clip-vit-base-patch32")

        # Classical features: ~200-dim
        # (color, edges, texture, lighting)

        # Fusion network
        self.fc1 = nn.Linear(512 + 200, 256)
        self.fc2 = nn.Linear(256, 128)
        self.fc3 = nn.Linear(128, 1)  # Output: rating [1-5]

    def forward(self, image, features):
        clip_features = self.clip_encoder(image).pooler_output
        combined = torch.cat([clip_features, features], dim=1)
        x = F.relu(self.fc1(combined))
        x = F.relu(self.fc2(x))
        rating = torch.sigmoid(self.fc3(x)) * 4 + 1  # Scale to [1, 5]
        return rating
```

### Training
- **Loss**: Mean Squared Error (predicted rating vs actual)
- **Optimizer**: AdamW (lr=1e-4)
- **Batch size**: 16
- **Validation split**: 20%
- **Early stopping**: If validation loss doesn't improve for 10 epochs

### Usage (once trained)
- **Pre-filter**: Generate 10 variants, predict ratings, show top 2 to user
- **Active learning**: Prioritize showing uncertain predictions (high variance)

---

## API Endpoints

### 1. `POST /api/enhance/train`
**Purpose**: Generate 2 Bayesian-optimized variants for training.

**Request**:
```json
{
  "image": "multipart/form-data",
  "project_id": "optional",
  "site_visit_id": "optional",
  "mode": "structure" // or "surfaces"
}
```

**Response**:
```json
{
  "experiment_id": "exp_12345",
  "options": [
    {
      "option": "A",
      "url": "https://s3.../enhanced-a.jpg",
      "image_id": 123,
      "prompt_version": "v1.2.3",
      "parameters": {
        "api": "leonardo",
        "init_strength": 0.28,
        "guidance_scale": 7.2,
        "controlnet_weight": 0.89
      }
    },
    {
      "option": "B",
      "url": "https://s3.../enhanced-b.jpg",
      "image_id": 124,
      "prompt_version": "v1.2.4",
      "parameters": {
        "api": "stablediffusion",
        "strength": 0.22,
        "guidance_scale": 8.1
      }
    }
  ],
  "original_url": "https://s3.../original.jpg"
}
```

**Backend Logic**:
1. Call Python ML service: `POST /ml/suggest_parameters`
2. ML service returns 2 parameter sets (Bayesian-optimized)
3. Load current prompt versions from `/prompts/current.json`
4. Generate 2 images (one with each parameter set)
5. Save to S3 + DB
6. Return experiment for rating

---

### 2. `POST /api/train/rate`
**Purpose**: Submit ratings for training variants.

**Request**:
```json
{
  "experiment_id": "exp_12345",
  "ratings": [
    {
      "option": "A",
      "image_id": 123,
      "rating": 4,
      "comments": "Good depth, but colors slightly off"
    },
    {
      "option": "B",
      "image_id": 124,
      "rating": 5,
      "comments": "Perfect photorealism!"
    }
  ],
  "rated_by": "trainer@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Ratings saved",
  "ml_updated": true,
  "current_best_rating": 4.8,
  "samples_collected": 23,
  "phase_1_complete": false
}
```

**Backend Logic**:
1. Save ratings to `enhancement_ratings` table
2. Update `parameter_experiments` table
3. Call Python ML service: `POST /ml/update_model`
4. ML service updates Bayesian optimizer
5. Check if Phase 1 complete (50 samples or rating ≥ 4.0)
6. Trigger prompt evolution if needed (every 10 samples)

---

### 3. `GET /api/train/status`
**Purpose**: Get current learning system status.

**Response**:
```json
{
  "phase_1": {
    "active": true,
    "samples_collected": 23,
    "best_rating": 3.8,
    "convergence": 0.46,
    "estimated_trials_remaining": 27
  },
  "phase_2": {
    "active": true,
    "training_samples": 23,
    "model_accuracy": null,
    "ready_for_inference": false
  },
  "prompt_evolution": {
    "current_version": "v1.2.3",
    "last_evolution": "2025-01-19T12:30:00Z",
    "next_evolution_at_sample": 30
  },
  "current_best": {
    "api": "stablediffusion",
    "avg_rating": 4.2,
    "parameters": {...}
  }
}
```

---

### 4. `GET /api/train/history`
**Purpose**: Get training history and analytics.

**Query Params**:
- `limit`: Number of experiments (default: 50)
- `min_rating`: Filter by rating
- `api`: Filter by API

**Response**:
```json
{
  "experiments": [
    {
      "experiment_id": "exp_12345",
      "created_at": "2025-01-19T10:00:00Z",
      "options": [
        {
          "option": "A",
          "rating": 4.0,
          "api": "leonardo",
          "parameters": {...}
        }
      ]
    }
  ],
  "analytics": {
    "total_samples": 23,
    "avg_rating": 3.6,
    "rating_trend": [3.2, 3.4, 3.6],
    "best_parameters": {...},
    "api_performance": {
      "leonardo": {"avg_rating": 3.4, "count": 12},
      "stablediffusion": {"avg_rating": 3.8, "count": 11}
    }
  }
}
```

---

## Python ML Service

### Deployment Options

**Option A: AWS Lambda** (Recommended for low volume)
- **Pros**: Serverless, auto-scaling, pay-per-use
- **Cons**: Cold starts, 15min timeout
- **Cost**: ~$5-10/month for training workload

**Option B: AWS ECS Fargate** (Better for Phase 2)
- **Pros**: Persistent, faster inference, can run PyTorch
- **Cons**: Always-on costs
- **Cost**: ~$30-50/month for small instance

**Recommendation**: Start with Lambda for Phase 1, migrate to ECS for Phase 2.

### Service API

#### `POST /ml/suggest_parameters`
Bayesian optimizer suggests next 2 parameter sets to try.

**Request**:
```json
{
  "mode": "structure",
  "num_suggestions": 2
}
```

**Response**:
```json
{
  "suggestions": [
    {
      "api": "leonardo",
      "init_strength": 0.28,
      "guidance_scale": 7.2,
      "controlnet_weight": 0.89
    },
    {
      "api": "stablediffusion",
      "strength": 0.22,
      "guidance_scale": 8.1,
      "controlnet_conditioning_scale": 0.93
    }
  ]
}
```

**Backend** (Python):
```python
from skopt import Optimizer
from skopt.space import Real, Categorical

# Initialize Bayesian optimizer
space = [
    Categorical(["leonardo", "stablediffusion"], name="api"),
    Real(0.1, 0.5, name="init_strength"),
    Real(5.0, 12.0, name="guidance_scale"),
    Real(0.7, 0.99, name="controlnet_weight")
]

optimizer = Optimizer(
    dimensions=space,
    base_estimator="GP",  # Gaussian Process
    acq_func="EI",        # Expected Improvement
    random_state=42
)

@app.post("/ml/suggest_parameters")
def suggest_parameters(request: SuggestionRequest):
    suggestions = optimizer.ask(n_points=request.num_suggestions)
    return {"suggestions": [dict(zip(param_names, s)) for s in suggestions]}
```

#### `POST /ml/update_model`
Update Bayesian optimizer with new ratings.

**Request**:
```json
{
  "results": [
    {
      "parameters": {
        "api": "leonardo",
        "init_strength": 0.28,
        "guidance_scale": 7.2,
        "controlnet_weight": 0.89
      },
      "rating": 4.0
    }
  ]
}
```

**Response**:
```json
{
  "updated": true,
  "samples_seen": 23,
  "convergence_score": 0.46
}
```

**Backend** (Python):
```python
@app.post("/ml/update_model")
def update_model(request: UpdateRequest):
    for result in request.results:
        params = [result.parameters[k] for k in param_names]
        rating = result.rating
        optimizer.tell(params, -rating)  # Minimize negative rating = maximize rating

    return {
        "updated": True,
        "samples_seen": len(optimizer.Xi),
        "convergence_score": calculate_convergence(optimizer)
    }
```

#### `POST /ml/extract_features` (Phase 2)
Extract image features for reward model.

**Request**: Image (multipart)

**Response**:
```json
{
  "features": {
    "clip_embedding": [0.12, -0.34, ...],  // 512-dim
    "color_histogram": [...],              // 64-dim
    "edge_density": 0.42,
    "texture_score": 0.67,
    "lighting_distribution": [...]
  }
}
```

#### `POST /ml/predict_rating` (Phase 2)
Predict photorealism rating from image.

**Request**: Image (multipart)

**Response**:
```json
{
  "predicted_rating": 4.2,
  "confidence": 0.85,
  "features_analyzed": ["depth", "lighting", "texture"]
}
```

---

## Training UI: `/train` Page

### Layout
```
┌─────────────────────────────────────────────────────────────┐
│  Training Dashboard                        [Status] [History]│
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Upload Image:  [Choose File] [Upload & Generate]           │
│                                                              │
│  Current Status:                                             │
│  ├─ Samples Collected: 23/50                                │
│  ├─ Best Rating: 3.8/5.0                                    │
│  ├─ Phase 1: Active (54% converged)                         │
│  └─ Phase 2: Training (not ready for inference)             │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                   Enhancement Results                        │
├────────────────────────────┬────────────────────────────────┤
│         Option A            │         Option B               │
│                            │                                │
│  ┌──────────────────────┐  │  ┌──────────────────────┐     │
│  │                      │  │  │                      │     │
│  │   [Enhanced Image]   │  │  │   [Enhanced Image]   │     │
│  │                      │  │  │                      │     │
│  └──────────────────────┘  │  └──────────────────────┘     │
│                            │                                │
│  API: Leonardo             │  API: Stable Diffusion         │
│  Init Strength: 0.28       │  Strength: 0.22                │
│  Guidance: 7.2             │  Guidance: 8.1                 │
│  ControlNet: 0.89          │  ControlNet: 0.93              │
│                            │                                │
│  Rating: ☆☆☆☆☆ (1-5)      │  Rating: ☆☆☆☆☆ (1-5)          │
│                            │                                │
│  Comments:                 │  Comments:                     │
│  [Text area]               │  [Text area]                   │
│                            │                                │
├────────────────────────────┴────────────────────────────────┤
│                   [Submit Ratings]                           │
└─────────────────────────────────────────────────────────────┘
```

### Component Structure
```typescript
// app/train/page.tsx
export default function TrainPage() {
  // State
  const [originalImage, setOriginalImage] = useState<File | null>(null);
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [status, setStatus] = useState<TrainingStatus | null>(null);

  // Handlers
  const handleUpload = async () => { ... };
  const handleRatingChange = (option: string, rating: number) => { ... };
  const handleSubmit = async () => { ... };

  return (
    <div className="training-dashboard">
      <StatusPanel status={status} />
      <UploadSection onUpload={handleUpload} />
      {experiment && (
        <ResultsGrid
          options={experiment.options}
          onRatingChange={handleRatingChange}
        />
      )}
      <SubmitButton onClick={handleSubmit} />
    </div>
  );
}
```

### Key Features
1. **Side-by-side comparison**: Easy visual comparison
2. **Parameter visibility**: Show what's different between options
3. **Quick rating**: Star rating (1-5) + optional comments
4. **Real-time status**: Show learning progress
5. **History view**: Link to past experiments

---

## Prompt Evolution System

### GPT-4 Integration

**Service**: `lib/prompt-evolution.ts`

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function evolvePrompt(
  currentPrompt: string,
  avgRating: number,
  topIssues: string[]
): Promise<EvolvedPrompt> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [
      {
        role: 'system',
        content: PROMPT_EVOLUTION_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: JSON.stringify({
          current_prompt: currentPrompt,
          rating: avgRating,
          issues: topIssues,
        }),
      },
    ],
    response_format: { type: 'json_object' },
  });

  return JSON.parse(response.choices[0].message.content);
}
```

**System Prompt** (saved to `/prompts/evolution-system-prompt.txt`):
```
You are an expert in AI image generation prompts for photorealistic interior design renders.

Your goal is to evolve prompts that maximize photorealism while preserving:
- Exact spatial layout
- Exact element shapes and colors
- Exact materials

CRITICAL REQUIREMENTS:
1. Photorealism is the #1 priority
2. NEVER suggest prompts that modify space/elements/materials/colors
3. Focus on rendering quality, lighting, texture detail, depth

WHEN GIVEN:
- Current prompt
- Average rating (1-5)
- Common issues from low ratings

YOU MUST:
1. Analyze what's working (keep it)
2. Identify weaknesses (improve it)
3. Generate an improved prompt
4. Explain your reasoning

OUTPUT FORMAT (JSON):
{
  "improved_prompt": "string (the new prompt)",
  "changes": ["array of specific changes made"],
  "reasoning": "why these changes improve photorealism",
  "expected_improvement": "what should improve"
}
```

### Evolution Triggers

1. **Every 10 samples**: Check if evolution needed
2. **Low performance**: If best rating < 4.0 after 20 samples
3. **Plateau**: If no improvement in last 15 samples
4. **Manual**: Admin can trigger via UI

### Evolution Process

```typescript
async function triggerPromptEvolution() {
  // 1. Get current best prompt and rating
  const currentBest = await getBestPromptVersion();

  // 2. Analyze recent ratings to identify issues
  const recentExperiments = await getRecentExperiments(10);
  const issues = analyzeCommonIssues(recentExperiments);

  // 3. Evolve prompt via GPT-4
  const evolved = await evolvePrompt(
    currentBest.prompt,
    currentBest.avg_rating,
    issues
  );

  // 4. Create new prompt version
  const newVersion = await createPromptVersion({
    prompt: evolved.improved_prompt,
    parent_version: currentBest.version,
    metadata: {
      evolution_reasoning: evolved.reasoning,
      changes: evolved.changes,
    },
  });

  // 5. A/B test: next 5 samples use new prompt
  await scheduleABTest(currentBest.version, newVersion, 5);

  // 6. After 5 samples, compare performance
  // Keep winner as current.json
}
```

---

## Implementation Roadmap

### Week 1: Foundation
- [ ] Create `/prompts/` directory structure
- [ ] Export current prompts to `v1.0.0.json`
- [ ] Implement prompt version loader
- [ ] Create training UI page (`/train`)
- [ ] Build basic upload + display flow

### Week 2: API Integration
- [ ] Implement `/api/enhance/train` endpoint
- [ ] Implement `/api/train/rate` endpoint
- [ ] Implement `/api/train/status` endpoint
- [ ] Connect UI to APIs
- [ ] Test end-to-end flow

### Week 3: Python ML Service (Phase 1)
- [ ] Set up Python FastAPI service
- [ ] Implement Bayesian optimizer
- [ ] Deploy to AWS Lambda
- [ ] Integrate with Node.js APIs
- [ ] Test parameter suggestions

### Week 4: Prompt Evolution
- [ ] Set up OpenAI API integration
- [ ] Implement prompt evolution service
- [ ] Create evolution triggers
- [ ] Test with historical data
- [ ] Deploy to production

### Week 5-6: Testing & Refinement
- [ ] Hire training personnel
- [ ] Collect 50+ samples
- [ ] Monitor convergence
- [ ] Refine parameter ranges
- [ ] Document best practices

### Week 7+: Phase 2 (Reward Model)
- [ ] Migrate ML service to ECS (for PyTorch)
- [ ] Implement feature extraction
- [ ] Build reward model architecture
- [ ] Train on collected data
- [ ] Deploy inference endpoint

---

## Success Metrics

### Phase 1 Success
- ✅ Collected 50 training samples
- ✅ Best rating ≥ 4.0/5.0
- ✅ Clear parameter convergence
- ✅ Identified best API (Leonardo vs SD)

### Phase 2 Success
- ✅ Reward model accuracy ≥ 80%
- ✅ Can predict ratings within ±0.5 points
- ✅ Active learning reduces rating workload by 50%

### Overall Success
- ✅ Client consistently gets photorealistic renders (≥4.5/5.0)
- ✅ System learns from feedback automatically
- ✅ Prompts evolve to match client preferences
- ✅ 90%+ of enhancements meet "crystal clear photorealism" standard

---

## Cost Estimates

### Development
- **Engineering time**: 6-8 weeks (1 developer)
- **Training personnel**: $20-30/hr × 20-40 hrs = $400-1200

### Infrastructure (Monthly)
- **AWS Lambda (Phase 1)**: ~$5-10
- **AWS ECS (Phase 2)**: ~$30-50
- **RDS (existing)**: No additional cost
- **S3 (existing)**: +$5-10 for training images
- **OpenAI API**: ~$10-20 (GPT-4 calls)
- **Total**: ~$50-90/month

### API Costs (Per Training Sample)
- **Leonardo**: ~$0.01-0.02 per generation
- **Replicate**: ~$0.02-0.04 per generation
- **50 samples**: ~$1.50-3.00

---

## Risk Mitigation

### Risk: Bayesian optimizer doesn't converge
**Mitigation**:
- Use multiple random restarts
- Expand parameter ranges
- Fall back to grid search

### Risk: GPT-4 evolves prompts in wrong direction
**Mitigation**:
- Human review before deploying evolved prompts
- A/B test all evolved prompts
- Keep version history for rollback

### Risk: Not enough training samples
**Mitigation**:
- Use existing enhancement data as bootstrap
- Synthetic data augmentation
- Active learning to maximize info per sample

### Risk: Slow ML service (cold starts)
**Mitigation**:
- Keep Lambda warm with scheduled pings
- Cache frequent computations
- Migrate to ECS if needed

---

## Next Steps

1. **Review this design document**
2. **Ask clarifying questions**
3. **Approve architecture**
4. **I'll implement in this order:**
   - Prompt storage structure
   - Training UI
   - Training API endpoints
   - Python ML service
   - GPT-4 integration
   - Testing & deployment

**Ready to proceed with implementation?**
