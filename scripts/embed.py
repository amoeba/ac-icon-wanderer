"""
Walk a directory of images, compute similarity features for one or more models, and
save each model under its own subdirectory in the output directory.

Outputs per model:
  - embeddings.pt   : float32 tensor of shape (N, D)
  - image_ids.json  : list of icon ids parallel to the tensor rows
  - nearest.json    : nearest-neighbor indices for each icon
  - model.json      : model metadata used by the export step
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModel, AutoProcessor

try:
    from model_registry import model_dir, parse_model_specs, write_model_spec
except ModuleNotFoundError:
    from scripts.model_registry import model_dir, parse_model_specs, write_model_spec

IMAGE_EXTENSIONS = {".png"}


def find_images(image_dir: Path) -> list[Path]:
    paths = [p for p in sorted(image_dir.rglob("*")) if p.suffix.lower() in IMAGE_EXTENSIONS]
    if not paths:
        raise FileNotFoundError(f"No images found in {image_dir}")
    return paths


def load_image(path: Path, mode: str = "RGB") -> Image.Image | None:
    try:
        with Image.open(path) as img:
            return img.convert(mode)
    except Exception as exc:
        print(f"  Warning: could not open {path}: {exc}")
        return None


def normalize_embeddings(embeddings: torch.Tensor) -> torch.Tensor:
    norms = embeddings.norm(p=2, dim=-1, keepdim=True).clamp_min(1e-12)
    return embeddings / norms


def extract_model_features(outputs) -> torch.Tensor:
    if isinstance(outputs, torch.Tensor):
        return outputs

    for attr in ("image_embeds", "pooler_output"):
        value = getattr(outputs, attr, None)
        if value is not None:
            return value

    last_hidden_state = getattr(outputs, "last_hidden_state", None)
    if last_hidden_state is not None:
        return last_hidden_state.mean(dim=1)

    if isinstance(outputs, (tuple, list)) and outputs:
        first = outputs[0]
        if isinstance(first, torch.Tensor):
            return first.mean(dim=1) if first.ndim == 3 else first

    raise TypeError(f"Unsupported model output type: {type(outputs)!r}")


def load_processor(model_id: str):
    try:
        return AutoProcessor.from_pretrained(model_id)
    except Exception:
        return AutoImageProcessor.from_pretrained(model_id)


def compute_hf_embeddings(
    image_paths: list[Path],
    model_id: str,
    batch_size: int,
    device: torch.device,
) -> tuple[torch.Tensor, list[str]]:
    print(f"Loading model: {model_id}")
    processor = load_processor(model_id)
    model = AutoModel.from_pretrained(model_id).eval().to(device)

    all_embeddings = []
    valid_paths = []

    for batch_start in range(0, len(image_paths), batch_size):
        batch_paths = image_paths[batch_start : batch_start + batch_size]
        batch_num = batch_start // batch_size + 1
        total_batches = (len(image_paths) + batch_size - 1) // batch_size
        print(f"  Batch {batch_num}/{total_batches} ({len(batch_paths)} images)...")

        images = []
        paths_this_batch = []
        for path in batch_paths:
            image = load_image(path, mode="RGB")
            if image is not None:
                images.append(image)
                paths_this_batch.append(path.stem)

        if not images:
            continue

        inputs = processor(images=images, return_tensors="pt")
        inputs = {key: value.to(device) for key, value in inputs.items()}

        with torch.no_grad():
            if hasattr(model, "get_image_features"):
                outputs = model.get_image_features(**inputs)
            else:
                outputs = model(**inputs)

        embeddings = normalize_embeddings(extract_model_features(outputs))
        all_embeddings.append(embeddings.cpu())
        valid_paths.extend(paths_this_batch)

    return torch.cat(all_embeddings, dim=0), valid_paths


def build_dct_matrix(size: int) -> torch.Tensor:
    x = torch.arange(size, dtype=torch.float32)
    k = torch.arange(size, dtype=torch.float32).unsqueeze(1)
    matrix = torch.cos((math.pi / size) * (x + 0.5) * k)
    matrix[0] *= math.sqrt(1 / size)
    matrix[1:] *= math.sqrt(2 / size)
    return matrix


def compute_phash_shape_embeddings(image_paths: list[Path]) -> tuple[torch.Tensor, list[str]]:
    dct_matrix = build_dct_matrix(32)
    embeddings = []
    valid_paths = []

    for index, path in enumerate(image_paths, start=1):
        if index % 500 == 0 or index == 1:
            print(f"  Processed {index}/{len(image_paths)} images...")

        rgba = load_image(path, mode="RGBA")
        if rgba is None:
            continue

        alpha = np.asarray(rgba.getchannel("A").resize((16, 16), Image.Resampling.LANCZOS), dtype=np.float32) / 255.0
        grayscale = np.asarray(rgba.convert("L").resize((32, 32), Image.Resampling.LANCZOS), dtype=np.float32) / 255.0

        gray_tensor = torch.from_numpy(grayscale)
        dct = dct_matrix @ gray_tensor @ dct_matrix.T
        low_frequency = dct[:8, :8].flatten()[1:]
        median = torch.median(low_frequency)
        phash_bits = (low_frequency >= median).float()

        alpha_tensor = torch.from_numpy(alpha).flatten()
        feature = torch.cat([phash_bits, alpha_tensor], dim=0)
        embeddings.append(feature)
        valid_paths.append(path.stem)

    stacked = torch.stack(embeddings, dim=0)
    return normalize_embeddings(stacked), valid_paths


def compute_embeddings_for_model(
    image_paths: list[Path],
    model_spec,
    batch_size: int,
    device: torch.device,
) -> tuple[torch.Tensor, list[str]]:
    print(f"\n=== {model_spec.label} ({model_spec.key}) ===")
    if model_spec.kind == "handcrafted":
        return compute_phash_shape_embeddings(image_paths)
    if not model_spec.model_id:
        raise ValueError(f"Missing model_id for {model_spec.key}")
    return compute_hf_embeddings(image_paths, model_spec.model_id, batch_size, device)


def compute_nearest(embeddings: torch.Tensor, k: int) -> list[list[int]]:
    print("Computing nearest neighbors...")
    count = embeddings.shape[0]
    neighbors = []

    for index in range(count):
        if index % 500 == 0:
            print(f"  Progress: {index}/{count}")

        query = embeddings[index : index + 1]
        similarities = torch.matmul(query, embeddings.T)[0]
        topk_indices = torch.topk(similarities, k + 1).indices
        nearest = [candidate_index for candidate in topk_indices if (candidate_index := int(candidate)) != index][:k]
        neighbors.append(nearest)

    return neighbors


def save_model_outputs(
    output_dir: Path,
    model_spec,
    embeddings: torch.Tensor,
    image_ids: list[str],
    nearest: list[list[int]],
) -> None:
    model_output_dir = model_dir(output_dir, model_spec.key)
    if model_output_dir.exists():
        shutil.rmtree(model_output_dir)
    model_output_dir.mkdir(parents=True, exist_ok=True)

    torch.save(embeddings, model_output_dir / "embeddings.pt")
    (model_output_dir / "image_ids.json").write_text(json.dumps(image_ids, indent=2) + "\n")
    (model_output_dir / "nearest.json").write_text(json.dumps(nearest) + "\n")
    write_model_spec(model_output_dir, model_spec)

    print(f"  Saved     : {model_output_dir}")
    print(f"  Shape     : {tuple(embeddings.shape)}")
    print(f"  Image IDs : {len(image_ids)}")


def main():
    parser = argparse.ArgumentParser(description="Compute image similarity features for one or more models")
    parser.add_argument("--image_dir", required=True, help="Directory of images")
    parser.add_argument("--output_dir", default="./embeddings", help="Where to save output files")
    parser.add_argument("--batch_size", type=int, default=128, help="Images per batch for Hugging Face models")
    parser.add_argument("--models", default="all", help="Comma-separated preset keys to run (default: all)")
    parser.add_argument(
        "--hf-model",
        action="append",
        default=[],
        help="Additional Hugging Face model id to run; may be specified multiple times",
    )
    parser.add_argument("--top_k", type=int, default=100, help="Number of nearest neighbors to compute")
    args = parser.parse_args()

    image_dir = Path(args.image_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    model_specs = parse_model_specs(args.models, args.hf_model)
    print(f"Selected models: {', '.join(spec.key for spec in model_specs)}")

    print(f"Scanning {image_dir} for images...")
    image_paths = find_images(image_dir)
    print(f"Found {len(image_paths)} images")

    for model_spec in model_specs:
        embeddings, image_ids = compute_embeddings_for_model(image_paths, model_spec, args.batch_size, device)
        nearest = compute_nearest(embeddings, args.top_k)
        save_model_outputs(output_dir, model_spec, embeddings, image_ids, nearest)

    print("\nDone.")
    print(f"  Output root: {output_dir}")
    print(f"  Models     : {len(model_specs)}")


if __name__ == "__main__":
    main()
