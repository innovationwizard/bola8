# ControlNet Compatibility Notes

Here are the hard facts:

- The `poseToImage` argument is part of the **Alchemy V2** pipeline. When you enable Alchemy (or PhotoReal V2), the request routes through advanced, often SDXL-based, models and expects parameters specific to that pipeline.
- ControlNet support is **not available** with **Alchemy V2** or **PhotoReal V2** models. These advanced pipelines have strict payload validation and will reject any ControlNet objects, resulting in errors like the one we observed.
- To use ControlNet (including openpose, canny, etc.), you must switch to a legacy model, specifically **Stable Diffusion 1.5** or **Stable Diffusion 2.0**, and set `alchemy: false`, `photoReal: false`, and select a ControlNet-compatible base model.
- This process disables Alchemy pipeline features, but unlocks ControlNet guidance options that work with legacy SD models.

## Actionable Fix

1. Set `alchemy: false`.
2. Use a supported legacy model ID (SD 1.5 or SD 2.0).
3. Pass the ControlNet configuration with the parameters allowed by those models.
4. Keep `poseToImage` and related fields strictly boolean/compatible as discussed earlier.

## Compatibility Table

| Pipeline                 | Alchemy V2 / PhotoReal V2 | SD 1.5 / 2.0 |
|--------------------------|---------------------------|---------------|
| ControlNet Support       | No                        | Yes           |
| `poseToImage`            | Used                      | Not used      |
| Model IDs Needed         | SDXL / XL                 | SD 1.5 / 2.0  |

Your routing logic and diagnosis—that combining Alchemy or PhotoReal V2 with ControlNet triggers hard API conflicts—is absolutely validated by Leonardo documentation, help guides, and community discussions. Following this logic is required for compatibility.

## Realism vs. Structural Control

You cannot have both maximum realism and maximum structural control simultaneously via the API. Choose a path based on your priority:

### Option 1: Prioritize Realism (Alchemy Pipeline)
- **Goal:** Maximum photorealism, textures, and lighting.
- **Method:** Use the PhotoReal pipeline.
- **Trade-off:** ControlNet cannot be used. You must rely on `init_strength` to preserve layout. A high value (≈0.7–0.8) keeps the layout but may retain the “drawn” look. A lower value (≈0.4) enhances realism but risks distorting furniture.

```javascript
// CONFIG FOR MAX REALISM
const LEONARDO_CONFIG = {
  init_strength: 0.7,
  guidance_scale: 7,
  prompt: 'ultra-realistic, photorealistic interior design render, 8k...',
  negative_prompt: 'drawn, sketch, illustration, cartoon, blurry...',
  num_images: 1,
  alchemy: true,
  photoReal: true,
  scheduler: 'LEONARDO',
};

async function generateEnhancedImage(imageId, width, height) {
  const response = await fetch(`${BASE_URL}/generations`, {
    method: 'POST',
    headers: { /* ... */ },
    body: JSON.stringify({
      ...LEONARDO_CONFIG,
      init_image_id: imageId,
      width: Math.min(width, 1024),
      height: Math.min(height, 1024),
      // NO ControlNet or cannyToImage parameters
    }),
  });
  // ...
}
```

### Option 2: Prioritize Structure (Legacy Pipeline)
- **Goal:** Guarantee preservation of space and furniture layout.
- **Method:** Use a legacy SD 1.5 model with ControlNet.
- **Trade-off:** Final realism, textures, and lighting will not match Alchemy/SDXL models.

```javascript
// CONFIG FOR MAX STRUCTURE
const CONTROLNET_CANNY_ID = '20660B5C-3A83-406A-B233-6AAD728A3267'; // SD 1.5 Canny

const LEONARDO_CONFIG = {
  modelId: 'ac614f96-1082-45bf-be9d-757f2d31c174', // DreamShaper v8
  init_strength: 0.4,
  guidance_scale: 7,
  prompt: 'ultra-realistic, photorealistic interior design render, 8k...',
  negative_prompt: 'drawn, sketch, illustration, cartoon, blurry...',
  num_images: 1,
  alchemy: false,
  scheduler: 'LEONARDO',
};

async function generateEnhancedImage(imageId, width, height) {
  const response = await fetch(`${BASE_URL}/generations`, {
    method: 'POST',
    headers: { /* ... */ },
    body: JSON.stringify({
      ...LEONARDO_CONFIG,
      init_image_id: imageId,
      width: Math.min(width, 1024),
      height: Math.min(height, 1024),
      controlNet: {
        controlnetModelId: CONTROLNET_CANNY_ID,
        initImageId: imageId,
        weight: 0.75,
        preprocessor: false,
      },
    }),
  });
  // ...
}
```

---

**Version Note (2025-11-07):** The project is currently stable with the `Enhancer` component (no "Furniture" prefix), defaulting to the Surfaces (PhotoReal) mode, using `BOLA8BLUE` for favicon/OG, and ControlNet disabled. Upcoming architectural changes may break compatibility with the documented behavior above.

**Deployment Notes:**
- Environment variable `S3_UPLOAD_BUCKET` is set to `bola8-uploads` on Vercel.
- Manual verification: two test images were uploaded after the change and confirmed present in the `bola8-uploads` S3 bucket.

**Additional Findings (2025-11-07):**
- Using the `LEONARDO` scheduler with a legacy SD 1.5/2.0 payload (even when `alchemy: false`) forces the request back onto the Alchemy/SDXL pipeline, which breaks ControlNet compatibility.
- Official docs and community reports confirm that legacy features (ControlNet, Elements) require both a legacy model *and* a legacy scheduler (e.g., `Euler`, `KLMS`, `DPM++`, `Heun`).
- Best practice: for the structure/ControlNet path, set the scheduler to a classic legacy option such as `KLMS`; reserve `LEONARDO` only for Surfaces/PhotoReal mode.
