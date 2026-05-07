from __future__ import annotations

import json
import shutil
from pathlib import Path

import torch

try:
    from model_registry import DEFAULT_MODEL_KEY, discover_model_paths
except ModuleNotFoundError:
    from scripts.model_registry import DEFAULT_MODEL_KEY, discover_model_paths


def export_model(spec, model_path: Path, public_root: Path) -> dict:
    embeddings = torch.load(model_path / "embeddings.pt", weights_only=True)
    image_ids = json.loads((model_path / "image_ids.json").read_text())
    nearest = json.loads((model_path / "nearest.json").read_text())

    model_public_dir = public_root / spec.key
    shutil.rmtree(model_public_dir, ignore_errors=True)
    model_public_dir.mkdir(parents=True, exist_ok=True)

    embeddings_np = embeddings.numpy()
    embeddings_np.tofile(model_public_dir / "embeddings.bin")
    shape = list(embeddings_np.shape)

    meta = {
        "id": spec.key,
        "label": spec.label,
        "kind": spec.kind,
        "shape": shape,
        "image_ids": image_ids,
    }
    if spec.model_id:
        meta["model_id"] = spec.model_id
    if spec.description:
        meta["description"] = spec.description

    (model_public_dir / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")

    nearest_dir = model_public_dir / "nearest"
    nearest_dir.mkdir(parents=True, exist_ok=True)
    for index, neighbors in enumerate(nearest):
        icon_id = image_ids[index]
        (nearest_dir / f"{icon_id}.json").write_text(json.dumps(neighbors))

    print(f"Exported {spec.key}: {shape[0]} embeddings of dimension {shape[1]}")
    print(f"  Binary size: {(model_public_dir / 'embeddings.bin').stat().st_size / 1024 / 1024:.1f} MB")

    return {
        "id": spec.key,
        "label": spec.label,
        "kind": spec.kind,
        "shape": shape,
        "image_count": len(image_ids),
        "description": spec.description,
        "model_id": spec.model_id,
    }


def main():
    root = Path("data/embeddings")
    public_root = Path("public/embeddings")
    model_paths = discover_model_paths(root)
    if not model_paths:
        raise FileNotFoundError(f"No embedding outputs found in {root}")

    shutil.rmtree(public_root, ignore_errors=True)
    public_root.mkdir(parents=True, exist_ok=True)

    models = [export_model(spec, path, public_root) for spec, path in model_paths]
    default_model = DEFAULT_MODEL_KEY if any(model["id"] == DEFAULT_MODEL_KEY for model in models) else models[0]["id"]
    default_public_dir = public_root / default_model
    shutil.copyfile(default_public_dir / "meta.json", public_root / "meta.json")
    shutil.rmtree(public_root / "nearest", ignore_errors=True)
    shutil.copytree(default_public_dir / "nearest", public_root / "nearest")

    manifest = {
        "default_model": default_model,
        "models": models,
    }
    (public_root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Wrote manifest for {len(models)} models to {public_root / 'manifest.json'}")


if __name__ == "__main__":
    main()
