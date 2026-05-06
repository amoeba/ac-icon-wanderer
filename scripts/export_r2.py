import json
import os
from pathlib import Path
import torch

def main():
    embeddings = torch.load('data/embeddings/embeddings.pt', weights_only=True)
    with open('data/embeddings/image_ids.json') as f:
        image_ids = json.load(f)
    with open('data/embeddings/nearest.json') as f:
        nearest = json.load(f)

    embeddings_np = embeddings.numpy()
    shape = list(embeddings_np.shape)


    meta = {
        'shape': shape,
        'image_ids': [Path(p).name for p in image_ids]
    }
    with open("data/embeddings/meta.json", "w") as f:
        json.dump(meta, f)

    os.mkdir("data/embeddings/nearest")
    for idx, neighbors in enumerate(nearest):
        icon_id = image_ids[idx]
        with open(f"data/embeddings/nearest/{icon_id}.json", "w") as f:
            json.dump(neighbors, f)

    print(f"Exported {shape[0]} embeddings of dimension {shape[1]}")

if __name__ == "__main__":
    main()
