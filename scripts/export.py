from __future__ import annotations

import json
import shutil
from pathlib import Path

import torch

try:
    from model_registry import DEFAULT_MODEL_KEY, discover_model_paths
except ModuleNotFoundError:
    from scripts.model_registry import DEFAULT_MODEL_KEY, discover_model_paths


def exported_model_record(model_path: Path) -> dict | None:
    meta_path = model_path / "meta.json"
    nearest_dir = model_path / "nearest"
    if not meta_path.exists() or not nearest_dir.is_dir():
        return None

    meta = json.loads(meta_path.read_text())
    image_ids = meta.get("image_ids") or []
    first_neighbor_path = next(iter(sorted(nearest_dir.glob("*.json"))), None)
    neighbor_count = 0
    if first_neighbor_path is not None:
        neighbor_count = len(json.loads(first_neighbor_path.read_text()))

    return {
        "id": meta["id"],
        "label": meta["label"],
        "kind": meta["kind"],
        "shape": meta["shape"],
        "image_count": len(image_ids),
        "neighbor_count": neighbor_count,
        "description": meta.get("description"),
        "model_id": meta.get("model_id"),
    }


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
        "neighbor_count": len(nearest[0]) if nearest else 0,
        "description": spec.description,
        "model_id": spec.model_id,
    }


def main():
    root = Path("data/embeddings")
    raw_model_paths = discover_model_paths(root)
    existing_exported_models = {
        child.name: exported_model_record(child)
        for child in sorted(root.iterdir())
        if child.is_dir()
    } if root.exists() else {}
    existing_exported_models = {
        key: value for key, value in existing_exported_models.items() if value is not None
    }

    if not raw_model_paths and not existing_exported_models:
        raise FileNotFoundError(f"No embedding outputs found in {root}")

    models_by_id = dict(existing_exported_models)
    for spec, path in raw_model_paths:
        models_by_id[spec.key] = export_model(spec, path, path)

    models = [models_by_id[key] for key in sorted(models_by_id)]
    default_model = DEFAULT_MODEL_KEY if any(model["id"] == DEFAULT_MODEL_KEY for model in models) else models[0]["id"]

    manifest = {
        "default_model": default_model,
        "models": models,
    }
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Wrote manifest for {len(models)} models to {root / 'manifest.json'}")


if __name__ == "__main__":
    main()
