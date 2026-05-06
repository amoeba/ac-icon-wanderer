import torch
import json
from pathlib import Path

# Load embeddings
embeddings = torch.load('data/embeddings/embeddings.pt', weights_only=True)
with open('data/embeddings/image_ids.json') as f:
    image_ids = json.load(f)

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

print(f"Exported {shape[0]} embeddings of dimension {shape[1]}")
print(f"Binary size: {Path('public/embeddings.bin').stat().st_size / 1024 / 1024:.1f} MB")
