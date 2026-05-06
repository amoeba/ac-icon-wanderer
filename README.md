# ac-icon-wanderer

Not all who wander are lost. Wander through Asheron's Call game icons by visual similarity using vector embeddings.

## Pre-processing

Pre-req: Extracted game icons must be in data/icons.

Then run `pixi run embed` to generate embeddings.
And then `pixi run export` to export the embeddings into the format used by the web app.

## Development

```bash
npm run dev
```

## Deploy

```bash
npm run deploy
```
