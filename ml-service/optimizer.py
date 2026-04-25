"""
Bayesian Optimizer for Image Enhancement Parameters

Uses Gaussian Process to intelligently explore parameter space
and find optimal combinations for photorealistic results.
"""

from skopt import Optimizer
from skopt.space import Real, Categorical
import numpy as np
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)

class BayesianOptimizer:
    """
    Bayesian optimizer for image enhancement parameters

    Optimizes:
    - API selection (Leonardo vs Stable Diffusion)
    - Init strength / strength
    - Guidance scale
    - ControlNet weight
    """

    def __init__(self):
        """Initialize Bayesian optimizer"""

        # Define parameter space
        # Note: We'll optimize for both APIs simultaneously
        self.space = [
            Categorical(["leonardo", "stablediffusion"], name="api"),
            Real(0.1, 0.5, name="init_strength"),      # For both APIs
            Real(5.0, 12.0, name="guidance_scale"),    # For both APIs
            Real(0.7, 0.99, name="controlnet_weight"), # For both APIs
        ]

        # Parameter names (for easier access)
        self.param_names = ["api", "init_strength", "guidance_scale", "controlnet_weight"]

        # Initialize optimizer
        self.optimizer = Optimizer(
            dimensions=self.space,
            base_estimator="GP",        # Gaussian Process
            acq_func="EI",              # Expected Improvement
            acq_optimizer="sampling",   # How to optimize acquisition function
            random_state=42,
            n_initial_points=5,         # Random exploration first
        )

        # Track statistics
        self.samples_seen = 0
        self.best_rating = 0.0
        self.best_params = None

        logger.info("Bayesian optimizer initialized")

    def suggest(self, n_points: int = 2) -> List[Dict[str, Any]]:
        """
        Suggest n parameter combinations to try next

        Args:
            n_points: Number of suggestions to generate

        Returns:
            List of parameter dictionaries
        """
        # Get suggestions from optimizer
        suggestions_raw = self.optimizer.ask(n_points=n_points)

        # Convert to dict format
        suggestions = []
        for suggestion in suggestions_raw:
            params_dict = {}
            for i, name in enumerate(self.param_names):
                params_dict[name] = suggestion[i]

            # Format based on API
            formatted = self._format_suggestion(params_dict)
            suggestions.append(formatted)

        logger.info(f"Generated {len(suggestions)} suggestions")
        return suggestions

    def tell(self, parameters: Dict[str, Any], rating: float):
        """
        Update optimizer with a new result

        Args:
            parameters: Dictionary of parameters that were tested
            rating: Rating achieved (1-5)
        """
        # Convert dict to list format
        param_list = self._dict_to_list(parameters)

        # Optimizer minimizes, so negate rating to maximize
        # (We want to maximize rating, but optimizer minimizes)
        score = -rating

        # Update optimizer
        self.optimizer.tell(param_list, score)

        # Update statistics
        self.samples_seen += 1
        if rating > self.best_rating:
            self.best_rating = rating
            self.best_params = parameters.copy()

        logger.info(f"Updated with rating {rating:.1f}. Best so far: {self.best_rating:.1f}")

    def get_best_parameters(self) -> Dict[str, Any] | None:
        """Get best parameters seen so far"""
        return self.best_params

    def get_best_rating(self) -> float:
        """Get best rating seen so far"""
        return self.best_rating

    def get_sample_count(self) -> int:
        """Get number of samples seen"""
        return self.samples_seen

    def get_convergence_score(self) -> float:
        """
        Calculate convergence score (0.0 = just started, 1.0 = converged)

        Based on:
        - Number of samples (more samples = more converged)
        - Best rating achieved (high rating = good convergence)
        """
        if self.samples_seen == 0:
            return 0.0

        # Sample-based convergence (0-50 samples)
        sample_score = min(self.samples_seen / 50.0, 1.0)

        # Rating-based convergence (0-4.0 rating target)
        rating_score = min(self.best_rating / 4.0, 1.0) if self.best_rating > 0 else 0.0

        # Combined score (weighted average)
        convergence = 0.6 * sample_score + 0.4 * rating_score

        return convergence

    def _format_suggestion(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Format suggestion based on API

        Different APIs use different parameter names
        """
        api = params["api"]

        if api == "leonardo":
            return {
                "api": "leonardo",
                "init_strength": round(params["init_strength"], 2),
                "guidance_scale": round(params["guidance_scale"], 1),
                "controlnet_weight": round(params["controlnet_weight"], 2),
            }
        else:  # stablediffusion
            return {
                "api": "stablediffusion",
                "strength": round(params["init_strength"], 2),  # Note: using init_strength as strength
                "guidance_scale": round(params["guidance_scale"], 1),
                "controlnet_conditioning_scale": round(params["controlnet_weight"], 2),
            }

    def _dict_to_list(self, params: Dict[str, Any]) -> List[Any]:
        """
        Convert parameter dict to list format expected by optimizer

        Handles different naming conventions for different APIs
        """
        api = params.get("api", "leonardo")

        # Normalize parameter names
        if api == "leonardo":
            init_strength = params.get("init_strength", 0.25)
            guidance_scale = params.get("guidance_scale", 7.0)
            controlnet_weight = params.get("controlnet_weight", 0.92)
        else:  # stablediffusion
            init_strength = params.get("strength", 0.2)  # SD uses "strength"
            guidance_scale = params.get("guidance_scale", 7.5)
            controlnet_weight = params.get("controlnet_conditioning_scale", 0.95)

        return [api, init_strength, guidance_scale, controlnet_weight]
