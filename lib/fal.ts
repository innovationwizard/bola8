/**
 * fal.ai client — gated behind FAL_API_KEY.
 *
 * FAL hosts the two non-Google models we use in this stack:
 *   - fal-ai/bria/background/remove          → transparency (Batch B2)
 *   - fal-ai/qwen-image-layered              → layer decomposition (Batch B3)
 *
 * The key may be absent in a given environment. Every consumer of this module
 * MUST check FAL_AVAILABLE before calling `fal.*`. When the key is missing,
 * downstream code should degrade gracefully (skip transparency, skip
 * decomposition) instead of throwing — see the operating constraints in
 * docs/IMPLEMENTATION_BATCHES_LAYERED.md.
 *
 * This module does not throw on missing credentials. It silently leaves the
 * client unconfigured. Calling fal.* without credentials would fail at the
 * network layer; the gate is the caller's responsibility.
 */

import { fal } from '@fal-ai/client';

const rawKey = process.env.FAL_API_KEY?.trim();

/** True when FAL_API_KEY is set in the environment. Computed once at module init. */
export const FAL_AVAILABLE: boolean = !!rawKey;

if (FAL_AVAILABLE) {
  fal.config({ credentials: rawKey });
}

export { fal };
