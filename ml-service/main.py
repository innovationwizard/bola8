"""
ML Service for Prompt Learning System
FastAPI service for Bayesian optimization of image enhancement parameters
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Literal
import uvicorn
import logging

from optimizer import BayesianOptimizer

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Bola8 ML Service",
    description="Bayesian optimization for image enhancement parameters",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize optimizer
optimizer = BayesianOptimizer()

# ============================================================================
# Request/Response Models
# ============================================================================

class ParameterSuggestion(BaseModel):
    api: Literal["leonardo", "stablediffusion"]
    init_strength: float | None = None
    strength: float | None = None
    guidance_scale: float
    controlnet_weight: float | None = None
    controlnet_conditioning_scale: float | None = None

class SuggestionRequest(BaseModel):
    mode: Literal["structure", "surfaces"]
    num_suggestions: int = 2

class UpdateResult(BaseModel):
    parameters: Dict[str, Any]
    rating: float

class UpdateRequest(BaseModel):
    results: List[UpdateResult]

class SuggestionResponse(BaseModel):
    suggestions: List[ParameterSuggestion]

class UpdateResponse(BaseModel):
    updated: bool
    samples_seen: int
    convergence_score: float

# ============================================================================
# Endpoints
# ============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "ml-service",
        "version": "1.0.0",
        "optimizer_samples": optimizer.get_sample_count()
    }

@app.post("/ml/suggest_parameters", response_model=SuggestionResponse)
async def suggest_parameters(request: SuggestionRequest):
    """
    Get Bayesian-optimized parameter suggestions

    The optimizer suggests parameter combinations that are likely to
    achieve high ratings based on previous results.
    """
    try:
        logger.info(f"Suggesting {request.num_suggestions} parameters for mode: {request.mode}")

        suggestions_raw = optimizer.suggest(n_points=request.num_suggestions)

        # Convert raw suggestions to proper format
        suggestions = []
        for suggestion in suggestions_raw:
            api = suggestion["api"]

            if api == "leonardo":
                suggestions.append(ParameterSuggestion(
                    api="leonardo",
                    init_strength=suggestion["init_strength"],
                    guidance_scale=suggestion["guidance_scale"],
                    controlnet_weight=suggestion["controlnet_weight"],
                ))
            else:
                suggestions.append(ParameterSuggestion(
                    api="stablediffusion",
                    strength=suggestion["strength"],
                    guidance_scale=suggestion["guidance_scale"],
                    controlnet_conditioning_scale=suggestion["controlnet_conditioning_scale"],
                ))

        logger.info(f"Generated {len(suggestions)} suggestions")
        return SuggestionResponse(suggestions=suggestions)

    except Exception as e:
        logger.error(f"Error suggesting parameters: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ml/update_model", response_model=UpdateResponse)
async def update_model(request: UpdateRequest):
    """
    Update Bayesian optimizer with new ratings

    The optimizer learns from ratings to improve future suggestions.
    Higher ratings indicate better parameter combinations.
    """
    try:
        logger.info(f"Updating model with {len(request.results)} new results")

        for result in request.results:
            # Convert parameters dict to list format expected by optimizer
            params = result.parameters
            rating = result.rating

            optimizer.tell(params, rating)

        convergence = optimizer.get_convergence_score()
        sample_count = optimizer.get_sample_count()

        logger.info(f"Model updated. Samples: {sample_count}, Convergence: {convergence:.2f}")

        return UpdateResponse(
            updated=True,
            samples_seen=sample_count,
            convergence_score=convergence
        )

    except Exception as e:
        logger.error(f"Error updating model: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/ml/stats")
async def get_stats():
    """Get optimizer statistics"""
    return {
        "samples_seen": optimizer.get_sample_count(),
        "convergence": optimizer.get_convergence_score(),
        "best_parameters": optimizer.get_best_parameters(),
        "best_rating": optimizer.get_best_rating(),
    }

@app.post("/ml/reset")
async def reset_optimizer():
    """Reset optimizer (for testing)"""
    global optimizer
    optimizer = BayesianOptimizer()
    logger.info("Optimizer reset")
    return {"status": "reset", "message": "Optimizer has been reset"}

# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info"
    )
