from __future__ import annotations

import json
import shutil
from pathlib import Path

import torch

try:
    from model_registry import DEFAULT_MODEL_KEY, discover_model_paths
except ModuleNotFoundError:
    from scripts.model_registry import DEFAULT_MODEL_KEY, discover_model_paths


def export_model(spec, source_path: Path, output_path: Path) -> dict:
    embeddings = torch.load(source_path / "embeddings.pt", weights_only=True)
    image_ids = json.loads((source_path / "image_ids.json").read_text())
    nearest = json.loads((source_path / "nearest.json").read_text())

    if output_path != source_path:
        shutil.rmtree(output_path, ignore_errors=True)
        output_path.mkdir(parents=True, exist_ok=True)

    shape = list(embeddings.shape)
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

    (output_path / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")

    nearest_dir = output_path / "nearest"
    shutil.rmtree(nearest_dir, ignore_errors=True)
    nearest_dir.mkdir(parents=True, exist_ok=True)
    for index, neighbors in enumerate(nearest):
        icon_id = image_ids[index]
        (nearest_dir / f"{icon_id}.json").write_text(json.dumps(neighbors))

    print(f"Exported {spec.key}: {shape[0]} embeddings of dimension {shape[1]}")
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
    model_paths = discover_model_paths(root)
    if not model_paths:
        raise FileNotFoundError(f"No embedding outputs found in {root}")

    exported_paths: list[tuple[str, Path]] = []
    models = []
    for spec, path in model_paths:
        output_path = path if path != root else root / spec.key
        models.append(export_model(spec, path, output_path))
        exported_paths.append((spec.key, output_path))

    default_model = DEFAULT_MODEL_KEY if any(model["id"] == DEFAULT_MODEL_KEY for model in models) else models[0]["id"]
    default_model_path = next(path for key, path in exported_paths if key == default_model)

    shutil.copyfile(default_model_path / "meta.json", root / "meta.json")
    shutil.rmtree(root / "nearest", ignore_errors=True)
    shutil.copytree(default_model_path / "nearest", root / "nearest")

    manifest = {
        "default_model": default_model,
        "models": models,
    }
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Wrote manifest for {len(models)} models to {root / 'manifest.json'}")


if __name__ == "__main__":
    main()
