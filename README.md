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

Then run `pixi run embed` to generate embeddings:

```console
$ pixi run embed
...
  Embeddings : data/embeddings/embeddings.pt  (12496, 768)
  Image IDs  : data/embeddings/image_ids.json
  Nearest    : data/embeddings/nearest.json
```

And then `pixi run export` to export the embeddings into the format used by the web app and upload them to R2:

```sh
pixi run export
```

And then upload them to R2:

```sh
rclone copy data/icons/ r2:ac-icon-wanderer-assets/icons --progress
rclone copy data/embeddings/ r2:ac-icon-wanderer-assets/embeddings --progress
```

## Development

```bash
npm run dev
```

## Deploy

```bash
npm run deploy
```
