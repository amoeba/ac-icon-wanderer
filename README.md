# ac-icon-wanderer

Explore Asheron's Call game icons using vector embeddings.

## Commands

```bash
npm run dev      # Start Vite dev server (with HMR)
npm run build    # Build Vite app to dist/
npm run deploy   # Build + deploy to Cloudflare Workers
npm run r2:upload-icons  # Upload data/icons to R2
npm run r2:upload       # Upload public/ to R2
```

## Development

```bash
npm run dev
```

Runs Vite dev server at http://localhost:5173 with hot module replacement.

To test the worker locally:

```bash
npx wrangler dev
```

## Deploy

```bash
npm run deploy
```

Builds the Vite app and deploys the Worker with static assets to Cloudflare Workers. Static assets are served from `dist/` via Cloudflare's Static Assets feature (configured in `wrangler.toml`).

## R2 Storage

Icons and embeddings are stored in R2 bucket `ac-icon-wanderer-assets`. Upload with:

```bash
npm run r2:upload-icons  # Upload icons
npm run r2:upload        # Upload embeddings
```