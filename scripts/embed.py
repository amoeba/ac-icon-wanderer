"""
compute_embeddings.py

Walks a directory of images, computes SigLIP2 embeddings, and saves:
  - embeddings.pt   : float32 tensor of shape (N, D)
  - image_ids.json  : list of file paths, parallel to the tensor rows

Usage:
    python compute_embeddings.py --image_dir ./photos --output_dir ./embeddings
    python compute_embeddings.py --image_dir ./photos --output_dir ./embeddings --batch_size 16
"""

import argparse
import json
from pathlib import Path

import torch
from PIL import Image
from transformers import AutoModel, AutoProcessor

IMAGE_EXTENSIONS = {".png"}
MODEL_ID = "google/siglip2-base-patch16-224"


def find_images(image_dir: Path) -> list[Path]:
    paths = [
        p for p in sorted(image_dir.rglob("*"))
        if p.suffix.lower() in IMAGE_EXTENSIONS
    ]
    if not paths:
        raise FileNotFoundError(f"No images found in {image_dir}")
    return paths


def load_image(path: Path) -> Image.Image | None:
    try:
        return Image.open(path).convert("RGB")
    except Exception as e:
        print(f"  Warning: could not open {path}: {e}")
        return None


def compute_embeddings(
    image_paths: list[Path],
    processor,
    model,
    batch_size: int,
    device: torch.device,
) -> tuple[torch.Tensor, list[str]]:
    all_embeddings = []
    valid_paths = []

    for batch_start in range(0, len(image_paths), batch_size):
        batch_paths = image_paths[batch_start : batch_start + batch_size]
        batch_num = batch_start // batch_size + 1
        total_batches = (len(image_paths) + batch_size - 1) // batch_size
        print(f"  Batch {batch_num}/{total_batches} ({len(batch_paths)} images)...")

        images = []
        paths_this_batch = []
        for p in batch_paths:
            img = load_image(p)
            if img is not None:
                images.append(img)
                paths_this_batch.append(p.stem)

        if not images:
            continue

        inputs = processor(images=images, return_tensors="pt").to(device)

        with torch.no_grad():
          embeddings = model.get_image_features(**inputs).pooler_output

        # L2-normalise for cosine similarity via dot product
        embeddings = embeddings / embeddings.norm(p=2, dim=-1, keepdim=True)

        all_embeddings.append(embeddings.cpu())
        valid_paths.extend(paths_this_batch)

    return torch.cat(all_embeddings, dim=0), valid_paths


def compute_nearest(embeddings: torch.Tensor, k: int) -> list[list[int]]:
    print("Computing nearest neighbors...")
    N = embeddings.shape[0]
    nearest = []

    for i in range(N):
        if i % 500 == 0:
            print(f"  Progress: {i}/{N}")

        q = embeddings[i:i+1]
        dots = torch.matmul(q, embeddings.T)[0]

        topk_vals, topk_idx = torch.topk(dots, k + 1)
        indices = [int(idx) for idx in topk_idx if idx != i][:k]
        nearest.append(indices)

    return nearest


def main():
    parser = argparse.ArgumentParser(description="Compute SigLIP2 image embeddings")
    parser.add_argument("--image_dir", required=True, help="Directory of images")
    parser.add_argument("--output_dir", default="./embeddings", help="Where to save output files")
    parser.add_argument("--batch_size", type=int, default=128, help="Images per batch")
    parser.add_argument("--model_id", default=MODEL_ID, help="HuggingFace model ID")
    parser.add_argument("--top_k", type=int, default=100, help="Number of nearest neighbors to compute")
    args = parser.parse_args()

    image_dir = Path(args.image_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    print(f"Loading model: {args.model_id}")
    processor = AutoProcessor.from_pretrained(args.model_id)
    model = AutoModel.from_pretrained(args.model_id).eval().to(device)

    print(f"Scanning {image_dir} for images...")
    image_paths = find_images(image_dir)
    print(f"Found {len(image_paths)} images")

    print("Computing embeddings...")
    embeddings, valid_paths = compute_embeddings(
        image_paths, processor, model, args.batch_size, device
    )

    embeddings_path = output_dir / "embeddings.pt"
    ids_path = output_dir / "image_ids.json"
    nearest_path = output_dir / "nearest.json"

    torch.save(embeddings, embeddings_path)
    ids_path.write_text(json.dumps(valid_paths, indent=2))

    nearest = compute_nearest(embeddings, args.top_k)
    nearest_path.write_text(json.dumps(nearest))

    print(f"\nDone.")
    print(f"  Embeddings : {embeddings_path}  {tuple(embeddings.shape)}")
    print(f"  Image IDs  : {ids_path}")
    print(f"  Nearest    : {nearest_path}")
    print(f"  Skipped    : {len(image_paths) - len(valid_paths)} images (unreadable)")


if __name__ == "__main__":
    main()
