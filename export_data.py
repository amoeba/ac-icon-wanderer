import torch
import json
from pathlib import Path

# Load embeddings
embeddings = torch.load('embeddings/embeddings.pt', weights_only=True)
with open('embeddings/image_ids.json') as f:
    image_ids = json.load(f)

# Save embeddings as binary (Float32Array)
embeddings_np = embeddings.numpy()
shape = list(embeddings_np.shape)
embeddings_np.tofile('web/public/embeddings.bin')

# Save metadata
meta = {
    'shape': shape,
    'image_ids': [Path(p).name for p in image_ids]
}
with open('web/public/meta.json', 'w') as f:
    json.dump(meta, f)

print(f"Exported {shape[0]} embeddings of dimension {shape[1]}")
print(f"Binary size: {Path('web/public/embeddings.bin').stat().st_size / 1024 / 1024:.1f} MB")
