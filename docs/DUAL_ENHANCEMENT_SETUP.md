# Dual Enhancement Setup Guide

**Date:** 2025-01-XX  
**Status:** Implemented

---

## Overview

The image enhancement system now returns **two enhanced images** for comparison:
- **Opción A**: Leonardo AI (optimized settings)
- **Opción B**: Stable Diffusion XL + ControlNet (via Replicate)

Both options are processed in parallel and displayed side-by-side for the user to compare.

---

## Configuration

### Environment Variables

Add to `.env.local`:

```bash
# Leonardo AI (required)
LEONARDO_API_KEY=your-leonardo-api-key

# Replicate API (required for Opción B)
REPLICATE_API_TOKEN=your-replicate-api-token
```

### Getting Replicate API Token

1. Sign up at [replicate.com](https://replicate.com)
2. Go to Account Settings → API Tokens
3. Create a new token
4. Add to `.env.local` as `REPLICATE_API_TOKEN`

---

## Leonardo AI Optimizations (Opción A)

**Settings optimized for maximum preservation:**

- **ControlNet Weight**: 0.92 (increased from 0.75)
  - Stronger structure preservation
  - Less room for AI to modify elements

- **Init Strength**: 0.25 (structure mode) / 0.3 (surfaces mode)
  - Reduced from 0.4/0.7
  - Less variation from original
  - Better preservation of materials/colors

- **Prompts**: Enhanced with preservation instructions
  - Positive: "preserve exact layout, preserve exact elements, preserve exact materials, preserve exact colors"
  - Negative: "no material changes, no color changes, no element modifications"

---

## Stable Diffusion + ControlNet (Opción B)

**Settings for maximum structure preservation:**

- **Model**: `stability-ai/sdxl` (via Replicate)
- **Strength**: 0.2 (very low for maximum preservation)
- **Guidance Scale**: 7.5
- **Inference Steps**: 30
- **Prompts**: Same preservation-focused prompts as Leonardo

**Note**: The SDXL model on Replicate uses image-to-image with low strength. For true ControlNet, a different model would be needed, but this configuration provides good structure preservation.

---

## API Response Format

The `/api/enhance` endpoint now returns:

```json
{
  "options": [
    {
      "option": "A",
      "url": "https://...",
      "imageId": "uuid",
      "version": 1
    },
    {
      "option": "B",
      "url": "https://...",
      "imageId": "uuid",
      "version": 2
    }
  ],
  "originalS3Url": "https://...",
  "projectId": "uuid",
  "errors": {
    "optionA": null,
    "optionB": null
  }
}
```

If one option fails, the other will still be returned. Errors are logged but don't block the successful option.

---

## UI Display

The enhanced images are displayed:
- **Side-by-side** on desktop (2 columns)
- **Stacked** on mobile (1 column)
- **Labeled** as "Opción A" and "Opción B" (no provider names disclosed)
- **Individual download buttons** for each option
- **Comparison-friendly layout** for easy evaluation

---

## Error Handling

- If **Opción A fails**: Opción B is still returned (if successful)
- If **Opción B fails**: Opción A is still returned (if successful)
- If **both fail**: Error message displayed
- Errors are logged but don't prevent the successful option from being shown

---

## Cost Considerations

- **Leonardo AI**: ~$0.01-0.02 per image
- **Replicate (SDXL)**: ~$0.01-0.05 per image
- **Total per enhancement**: ~$0.02-0.07

Both are processed in parallel, so total time is the longer of the two (not additive).

---

## Testing Checklist

Before deploying, verify:

- [ ] Leonardo API key configured
- [ ] Replicate API token configured
- [ ] Both options process successfully
- [ ] Images display side-by-side correctly
- [ ] Download buttons work for both options
- [ ] Error handling works if one fails
- [ ] Images saved to database with correct metadata
- [ ] Images saved to S3 correctly
- [ ] Version tracking works for both options

---

## Future Improvements

- [ ] Add ControlNet-specific model for better structure preservation in Opción B
- [ ] Add progress indicators for each option
- [ ] Add ability to select preferred option for future enhancements
- [ ] Add comparison slider (before/after for each option)
- [ ] Cache results to avoid reprocessing

---

*This dual enhancement approach allows the client to compare both solutions and choose the one that best meets their requirements for structure preservation and photorealism.*

