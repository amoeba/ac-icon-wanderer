# ac-icon-wanderer

Not all who wander are lost. Explore Asheron's Call game icons using vector embeddings.

## Quick Start

```bash
pixi run embed      # Generate embeddings from data/icons -> data/embeddings
pixi run export     # Export to public/embeddings.bin + public/meta.json
pixi run r2-upload  # Upload icons + embeddings to R2
pixi run deploy     # Build + deploy to Cloudflare Workers
```

## Steps

### 1. Generate Embeddings

```bash
pixi run embed
```

Input: `data/icons/` (PNG images)
Output: `data/embeddings/embeddings.pt` (tensor), `data/embeddings/image_ids.json` (labels)

Generates 512-dimensional embeddings for each icon using a CLIP vision model.

### 2. Export Embeddings

```bash
pixi run export
```

Input: `data/embeddings/`
Output: `public/embeddings.bin` (Float32 binary), `public/meta.json` (shape + image_ids)

Converts PyTorch tensor to binary format for fast loading in the browser.

### 3. Upload to R2

```bash
pixi run r2-upload
```

Input: `data/icons/`, `public/`
Output: R2 bucket `ac-icon-wanderer-assets`

Uploads icons and embeddings to Cloudflare R2 for serving from the worker.

### 4. Deploy

```bash
pixi run deploy
```

Input: `dist/` (built static site), `worker.ts`
Output: https://ac-icon-wanderer.treestats.workers.dev

Builds the Vite app and deploys the Worker with R2 bindings.
