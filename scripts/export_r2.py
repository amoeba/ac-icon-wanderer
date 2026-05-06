import json
import subprocess
import tempfile
from pathlib import Path
import torch
import os

BUCKET = "ac-icon-wanderer-assets"

def upload_to_r2(path: Path, key: str):
    print(f"Uploading {key}...")
    result = subprocess.run(
        ["wrangler", "r2", "object", "put", f"{BUCKET}/{key}", "-f", str(path), "--remote"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"Error uploading {key}: {result.stderr}")
    else:
        print(f"Uploaded {key}")

def main():
    embeddings = torch.load('data/embeddings/embeddings.pt', weights_only=True)
    with open('data/embeddings/image_ids.json') as f:
        image_ids = json.load(f)
    with open('data/embeddings/nearest.json') as f:
        nearest = json.load(f)

    embeddings_np = embeddings.numpy()
    shape = list(embeddings_np.shape)

    with tempfile.NamedTemporaryFile(suffix='.bin', delete=False) as tmp:
        embeddings_np.tofile(tmp.name)
        tmp_path = Path(tmp.name)
        upload_to_r2(tmp_path, "embeddings/embeddings.bin")
        tmp_path.unlink()

    meta = {
        'shape': shape,
        'image_ids': [Path(p).name for p in image_ids]
    }
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp:
        json.dump(meta, tmp)
        tmp_path = Path(tmp.name)
        upload_to_r2(tmp_path, "embeddings/meta.json")
        tmp_path.unlink()

    for idx, neighbors in enumerate(nearest):
        icon_id = image_ids[idx]
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp:
            json.dump(neighbors, tmp)
            tmp_path = Path(tmp.name)
            upload_to_r2(tmp_path, f"embeddings/nearest/{icon_id}.json")
            tmp_path.unlink()

    print(f"Exported {shape[0]} embeddings of dimension {shape[1]}")

if __name__ == "__main__":
    main()