import torch
import json
from pathlib import Path

# Load embeddings
embeddings = torch.load('data/embeddings/embeddings.pt', weights_only=True)
with open('data/embeddings/image_ids.json') as f:
    image_ids = json.load(f)
with open('data/embeddings/nearest.json') as f:
    nearest = json.load(f)

# Save embeddings as binary (Float32Array)
embeddings_np = embeddings.numpy()
shape = list(embeddings_np.shape)
embeddings_np.tofile('public/embeddings.bin')

# Save metadata
meta = {
    'shape': shape,
    'image_ids': [Path(p).name for p in image_ids]
}
with open('public/meta.json', 'w') as f:
    json.dump(meta, f)

# Save individual nearest files
nearest_dir = Path('public/data/embeddings/nearest')
nearest_dir.mkdir(parents=True, exist_ok=True)
for idx, neighbors in enumerate(nearest):
    icon_id = image_ids[idx]
    (nearest_dir / f'{icon_id}.json').write_text(json.dumps(neighbors))

print(f"Exported {shape[0]} embeddings of dimension {shape[1]}")
print(f"Binary size: {Path('public/embeddings.bin').stat().st_size / 1024 / 1024:.1f} MB")
print(f"Nearest files: {len(nearest)}")
