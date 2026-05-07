# ac-icon-wanderer

Not all who wander are lost. Wander through Asheron's Call game icons by visual similarity using vector embeddings.

## Pre-processing

Pre-req: Extracted game icons must be in `data/icons`:

```console
$ ls data/icons | head
0x06000F5A.png
0x06000F5D.png
0x06000F5E.png
0x06000F66.png
0x06000F68.png
0x06000F6A.png
0x06000F6B.png
0x06000F6C.png
0x06000F6E.png
0x06000FAA.png
```

Then run `pixi run embed` to generate similarity data for the built-in model set (`siglip2`, `clip`, and `phash-shape`):

```console
$ pixi run embed
...
  Output root: data/embeddings
  Models     : 3
```

You can limit the run to specific presets:

```sh
pixi run embed --models clip,phash-shape
```

Or append extra Hugging Face image models:

```sh
pixi run embed --hf-model laion/CLIP-ViT-L-14-laion2B-s32B-b82K
```

Then run `pixi run export` to export per-model metadata, manifests, and nearest-neighbor files into the format used by the app:

```sh
pixi run export
```

Then upload them with `rclone`:

```sh
rclone copy data/icons/ r2:ac-icon-wanderer-assets/icons --progress
rclone copy data/embeddings/ r2:ac-icon-wanderer-assets/embeddings --progress
```

The app will expose a model picker so you can switch similarity backends in the UI without redeploying code.

## Development

```bash
npm run dev
```

In local development, Vite now serves the same `/api` routes directly from `data/icons` and `data/embeddings`, so you can test the app without uploading anything or deploying to Cloudflare first. As long as you've already run `pixi run embed` and `pixi run export`, the browser will use your local files.

Production still uses the Worker + R2 path via `wrangler deploy`.

## Deploy

```bash
npm run deploy
```
