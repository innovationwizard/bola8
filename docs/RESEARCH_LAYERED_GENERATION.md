# Research — Layered AI Image Generation for Professional Designer Workflows

_Compiled: 2026-05-20_
_Trigger: user observed working in Photoshop per-layer; adoption of all-in-one Bola8 output dropped._

---

## The thesis (validated by 2026 industry)

The professional standard in 2026 architectural visualization and marketing is **hybrid, not pure-AI**. The most successful studios use AI for speed at the front end and Photoshop for precision at the back end. Clients now actively prefer "traditional 3D workflows with AI augmentation" over "AI-only generation" — even at higher cost — because pure-AI revisions are unpredictable and uncomposable.

This means our user's behavior (manually compositing layers in Photoshop) is not a regression. It is the industry-standard workflow we should serve, not replace.

Bola8 should output **layered assets that drop into Photoshop**, not single images that try to be the final deliverable.

---

## State of the art — five approaches

### 1. Adobe Firefly + Photoshop Generative Fill (the consumer/prosumer standard)

Adobe's approach is the reference design for AI-augmented layered work.

**How it works:**
- Each generative action creates a new **Generative Layer** in Photoshop, marked with a star icon.
- Generation is non-destructive — the layer can be re-prompted, hidden, masked, or deleted without affecting the underlying image.
- Generative Fill works on any selection. Generative Expand extends the canvas. Both produce dedicated layers.
- The Firefly Image 3 Foundation Model is trained on Adobe Stock — commercially safe, no IP contamination.

**Why it's relevant to Bola8:**
- Confirms that **one-generation-per-layer is the correct abstraction**, not one-generation-per-image.
- Designers think in layers; the AI should output in layers.
- Adobe deliberately uses non-destructive composition. Each layer is a self-contained, editable asset.

---

### 2. LayerDiffuse (the native transparency approach)

**Paper:** "Transparent Image Layer Diffusion using Latent Transparency" (lllyasviel, 2024).

**How it works:**
- Adds a "latent transparency" encoding to Stable Diffusion's latent space — a 4-channel VAE (RGB + alpha).
- Generates transparent PNGs natively from the model. No background-removal post-processing required.
- Supports both single transparent layers and multi-layer scenes.
- User study reports 97% preference for natively-generated transparency over removal-based approaches.

**Where it runs:**
- SD-Forge (faster A1111 fork) or ComfyUI (node-based).
- Requires self-hosting — no major hosted API as of May 2026.
- Works with any SD1.5 or SDXL checkpoint.

**Limitation for Bola8:**
- We would need to self-host or move to a hosted SD provider. Switching our base model (Imagen 4 / Gemini 3 → SDXL) means re-tuning every brand prompt that currently works. Significant migration cost.

---

### 3. Qwen-Image-Layered (the decomposition approach) — **new and significant**

**Paper:** "Qwen-Image-Layered: Towards Inherent Editability via Layer Decomposition" (Alibaba, December 2025).

**How it works:**
- Takes a single complete image and decomposes it into **3–10 RGBA layers**.
- Each layer comes out with clean transparency, ready to drop into Photoshop.
- Recursive: any layer can itself be decomposed further.
- Architecture: VLD-MMDiT (vision-language decomposition multimodal diffusion transformer).

**Where it runs:**
- **fal.ai** hosted API: ~$0.05/image. 15–30 seconds typical.
- **Replicate**: ~$0.03/decomposition.
- Hugging Face weights are public.

**Why this matters for Bola8:**
- This is the **lowest-friction path** to layered output from our current pipeline. We keep the Gemini 3 render-anchored generation we just shipped, then add one extra API call to decompose the result.
- Total per-post cost: ~$0.085 (Gemini $0.035 + Qwen decomposition $0.05).
- Designed exactly for "AI image → PSD-like editing surface."

---

### 4. ComfyUI compositional pipelines (the studio-grade approach)

ComfyUI is the node-based workflow tool that has become the de facto standard for production AI compositing in 2026.

**Key capabilities (from NVIDIA / OpenArt / Comfy enterprise case studies):**
- Deconstruct images into foreground / midground / background with clean transparency.
- Direct round-trip to Photoshop, After Effects, DaVinci Resolve.
- Inject spatial conditioning at inference time (ControlNet, depth maps, normal maps, segmentation masks).
- Combine multiple models in a single workflow — e.g., SDXL for base + LayerDiffuse for transparency + IPAdapter for style.

**How studios use it:**
- Architecture: ControlNet on depth/normals to keep building geometry exact while restyling around it. This is conceptually what our render-anchored generation already does at a smaller scale via Gemini.
- Real-estate marketing: separate passes for environment, vegetation, people, sky — each generated under shared style guidance, then layered in Photoshop.

**Why Bola8 should not adopt this directly:**
- Self-hosted ComfyUI is operationally heavy (GPU servers, queue management, workflow versioning).
- We are a small team. The maintenance cost outweighs the flexibility for our use case.
- We can absorb the patterns (per-element generation, shared style conditioning) without taking on the infrastructure.

---

### 5. Bria RMBG 2.0 (the production-grade background removal API)

**What it is:**
- Hosted, dichotomous image-segmentation model purpose-built for cutting subjects from backgrounds.
- Outputs a single-channel 8-bit grayscale alpha matte — high edge quality, including hair, glass, motion blur.
- Trained on professional-grade licensed data.

**Where it runs:**
- fal.ai, WaveSpeed, Hugging Face (self-host option).
- Pricing on fal.ai: a few cents per image (much cheaper than generation).

**Why it matters for Bola8:**
- Bridges the gap between "Gemini doesn't output transparency" and "we want transparent layers."
- Generate per-element on a neutral background → run through Bria → get a clean transparent PNG.
- Two-step pipeline, ~3 seconds of added latency per layer, ~$0.003 per cutout.

---

## The Gemini transparency problem (confirmed)

This is the single biggest constraint on staying with our current stack.

**Reality:**
- Gemini 3 Pro Image and Imagen 4 Ultra **do not** generate native transparent PNGs. Even when explicitly prompted ("transparent background", "PNG with alpha"), they output a solid background.
- This is a fundamental limitation of how these models render — they produce pixels, not alpha data.

**Documented workarounds:**
1. **Background removal post-processing** — generate on white/neutral, then run Bria RMBG. This is the pragmatic path.
2. **Dual-background trick** — generate the same image once on white, once on black; tools like Transparify diff the two to recover an alpha channel. More expensive (2x generations) but higher edge quality on hair and translucent objects.
3. **Code-execution alpha threshold** — Gemini 3 Flash can be asked to apply an alpha threshold to its own output, producing a usable sprite. Lower quality than Bria.

For Bola8: option 1 is the right default; option 2 is reserved for layers where edge precision is critical (people).

---

## Industry consensus on the "tab per layer" pattern

What our user is doing in Photoshop matches well-documented professional patterns:

| Discipline | Layer breakdown | Reference |
|------------|----------------|-----------|
| Architectural rendering | Beauty pass + AO + reflection + shadow + sky + entourage | Standard V-Ray / Corona render-pass workflow |
| Real-estate marketing | Building cutout + sky + ground + vegetation + people + signage | ArchRender 2026 guide |
| Adobe Firefly in Photoshop | One generative layer per intent (object, background, expansion) | Adobe Firefly docs |
| Qwen-Image-Layered | 3–10 RGBA layers, recursively decomposable | Qwen paper |

The pattern is consistent: **independent, named, transparent layers that compose non-destructively**. Tab-per-layer UI is the natural surface for this pattern.

---

## Mapping the user's 8 layers to industry patterns

| User's layer | Photoshop equivalent | Generation strategy |
|--------------|---------------------|---------------------|
| 1. Background | "Sky / environment" layer | Imagen 4 Ultra text-to-image, opaque, no building |
| 2. Building selection | Smart object from render | Pinned render → Bria RMBG cutout (no generation) |
| 3. Building size/position/orientation | Free Transform on building layer | Pure UX — handled in Photoshop, but we provide the building at a known size |
| 4. Environment surrounding | Vegetation / ground plane layer | Gemini composition w/ render anchor → Bria RMBG (keep foliage, remove building+sky) |
| 5. Featured feature (optional) | Specific subject layer | Gemini composition focused on that element → Bria RMBG |
| 6. Ornamental features (optional) | Object accents layer | Same as #5 but for smaller objects (lamps, benches, flowers) |
| 7. People (optional) | Person cutout layer | Imagen 4 (person on neutral bg) → Bria RMBG |
| 8. Style / look / feel | Adjustment layer / color LUT | NOT an image — this is metadata: palette swatches + mood notes the designer applies via Photoshop adjustment layers |

**Insight:** Layers 1–7 are visual assets. Layer 8 is metadata. They are different kinds of outputs and should have different surface treatments in the UI. The "Style" tab should not produce a PNG — it should produce a palette + mood card the designer can pin next to her Photoshop canvas.

---

## Cost comparison — three viable paths

Assumptions: one post = one full asset pack. All tabs filled (worst case).

### Path A — Qwen-Image-Layered decomposition (cheapest)
```
1× Gemini render-anchored composition          $0.035
1× Qwen-Image-Layered decomposition (8 layers) $0.050
                                              ─────────
                                              ≈ $0.085 / post
```
**Trade-off:** Layers are derived from one composition. The model chooses how to split. Less control per layer.

### Path B — Per-tab generation with Bria cutout (most control, highest cost)
```
Background:    Imagen 4 Ultra              $0.060
Building:      Bria RMBG only              $0.003
Environment:   Gemini + Bria               $0.038
Featured:      Gemini + Bria               $0.038
Ornaments:     Gemini + Bria               $0.038
People:        Imagen + Bria               $0.063
Style:         text-only (no API cost)     $0.000
Composite:     Gemini composition          $0.035
                                          ─────────
                                          ≈ $0.275 / post (all tabs)
                                          ≈ $0.115 / post (3 tabs typical)
```
**Trade-off:** ~3× cost vs current, but each layer has its own prompt and reference set. Maximum control.

### Path C — Hybrid (recommended)
```
Default flow: Path A (one composition → Qwen decompose)            $0.085
Optional per-tab regeneration when user wants to redo a single
layer: Path B for that one tab                                     +$0.038–$0.063
```
**Trade-off:** Cheap by default, expensive only when the user explicitly asks for surgical control. Mirrors how Adobe Firefly works in Photoshop (full generation + Generative Fill for surgical edits).

---

## What the best in the world would tell us to do

Synthesizing across Adobe's product design, the academic LayerDiffuse work, the Qwen paper, ComfyUI enterprise case studies, and the 2026 architectural-viz field reports:

1. **Treat the designer as the final compositor.** Bola8 is the asset prep tool, not the final renderer. The deliverable is a layered PSD-like pack, not a JPG.

2. **Default to one composition + decomposition, allow per-layer regeneration.** Match Adobe Firefly's pattern: a full image arrives quickly, then the user can edit specific layers.

3. **Hold style globally; vary content per layer.** Every layer prompt inherits the same brand DNA + project brand + Pinterest Inspo. Only the subject and framing change. This is what keeps the eight outputs feeling like one coherent image.

4. **Style is metadata, not an asset.** Color palettes, mood notes, brand voice — these belong as a sidebar / card / reference panel, not as an image layer.

5. **Make the layered output the default deliverable.** Don't bury it behind a toggle. The user does not want one composite image; she wants the parts.

6. **Name layers semantically, not by index.** `background.png`, `building.png`, `people-running.png`. Photoshop layer panels are name-driven, and the user reads them top-to-bottom.

7. **Provide a preview composite alongside the layers.** Adobe's preview shows "here is what we generated" so the user can decide whether to keep the layers or regenerate. This calibrates expectation.

8. **Respect that some layers are optional.** Layers 5 (featured), 6 (ornaments), 7 (people) are not always present. The UI should make absence a first-class state, not a forced empty.

---

## Sources

- [Transparent Image Layer Diffusion using Latent Transparency (LayerDiffuse paper)](https://arxiv.org/html/2402.17113v3)
- [LayerDiffuse GitHub (lllyasviel)](https://github.com/lllyasviel/LayerDiffuse)
- [Stable Diffusion transparent background guide](https://stable-diffusion-art.com/transparent-background/)
- [Qwen-Image-Layered paper (arXiv 2512.15603)](https://arxiv.org/html/2512.15603v1)
- [Qwen-Image-Layered on fal.ai](https://fal.ai/models/fal-ai/qwen-image-layered/api)
- [Qwen-Image-Layered ComfyUI tutorial](https://docs.comfy.org/tutorials/image/qwen/qwen-image-layered)
- [Qwen-Image-Layered hands-on (DataCamp)](https://www.datacamp.com/tutorial/qwen-image-layered)
- [Bria RMBG-2.0 on Hugging Face](https://huggingface.co/briaai/RMBG-2.0)
- [Bria background removal API docs](https://docs.bria.ai/image-editing/endpoints/background-remove)
- [Bria RMBG 2.0 on fal.ai](https://fal.ai/models/fal-ai/bria/background/remove)
- [Adobe Firefly Generative Fill docs](https://helpx.adobe.com/firefly/web/edit-images/prompt-to-edit/generative-fill.html)
- [Adobe Firefly Image 3 + Generative Fill announcement](https://news.adobe.com/news/news-details/2024/new-adobe-photoshop-with-advanced-generative-fill-and-generate-image-brings-new-superpowers-to-all)
- [Gemini transparency limitation (Hacker News thread)](https://news.ycombinator.com/item?id=46343260)
- [Gemini background removal via code execution (Stéphane Giron, Medium)](https://medium.com/google-cloud/background-removal-on-the-fly-with-gemini-and-code-execution-48621565fa9f)
- [FLUX.1 Kontext paper (in-context image editing)](https://arxiv.org/abs/2506.15742)
- [ComfyUI for architects (Novatr)](https://www.novatr.com/blog/comfyui-for-architects-ai-powered-visualization-workflows-explained)
- [Moment Factory + ComfyUI enterprise case study](https://www.comfy.org/cloud/enterprise-case-studies/comfyui-at-architectural-scale-how-moment-factory-reimagined-3d-projection-mapping)
- [Photoshop vs AI rendering 2026 (illustrarch)](https://illustrarch.com/articles/design-softwares/74661-photoshop-vs-ai-rendering.html)
- [Rendering Workflow Explained for Photorealism 2026 (Rendimension)](https://rendimension.com/rendering-workflow-photorealistic-architecture-2026/)
- [Real Estate Rendering Complete Guide 2026 (ArchRender)](https://www.archrender.ai/blog/real-estate-rendering-the-complete-guide-2026)
- [AI in Architectural Visualization 2025-2026 reality check (Ravelin3D)](https://ravelin3d.com/blog/ai-in-architectural-visualization-revolution-or-hype-2025-2026-reality-check.html)
