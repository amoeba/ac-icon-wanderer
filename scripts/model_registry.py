from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ModelSpec:
    key: str
    label: str
    kind: str
    model_id: str | None = None


DEFAULT_MODEL_KEY = "siglip2"

PRESET_MODEL_SPECS = {
    "siglip2": ModelSpec(
        key="siglip2",
        label="SigLIP 2",
        kind="huggingface",
        model_id="google/siglip2-base-patch16-224",
    ),
    "clip": ModelSpec(
        key="clip",
        label="CLIP",
        kind="huggingface",
        model_id="openai/clip-vit-base-patch32",
    ),
    "phash-shape": ModelSpec(
        key="phash-shape",
        label="pHash + Shape",
        kind="handcrafted",
    ),
}


def slugify_model_key(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    if not slug:
        raise ValueError(f"Could not derive a model key from {value!r}")
    return slug


def model_label_from_id(model_id: str) -> str:
    tail = model_id.split("/")[-1]
    return tail.replace("-", " ").replace("_", " ").title()


def model_dir(root: Path, key: str) -> Path:
    return root / key


def parse_model_specs(
    requested_models: str | None,
    extra_hf_models: list[str] | None = None,
) -> list[ModelSpec]:
    requested = [part.strip() for part in (requested_models or "all").split(",") if part.strip()]
    extra_hf_models = extra_hf_models or []

    specs: list[ModelSpec] = []
    seen: set[str] = set()

    def add(spec: ModelSpec):
        if spec.key not in seen:
            specs.append(spec)
            seen.add(spec.key)

    for item in requested:
        if item == "all":
            for spec in PRESET_MODEL_SPECS.values():
                add(spec)
            continue
        preset = PRESET_MODEL_SPECS.get(item)
        if preset is None:
            raise ValueError(
                f"Unknown model preset {item!r}. Use one of {', '.join(PRESET_MODEL_SPECS)} or --hf-model."
            )
        add(preset)

    for model_id in extra_hf_models:
        add(
            ModelSpec(
                key=slugify_model_key(model_id),
                label=model_label_from_id(model_id),
                kind="huggingface",
                model_id=model_id,
                description=f"Custom Hugging Face model: {model_id}",
            )
        )

    return specs


def read_model_spec(model_path: Path) -> ModelSpec | None:
    metadata_path = model_path / "model.json"
    if not metadata_path.exists():
        return None

    data = json.loads(metadata_path.read_text())
    return ModelSpec(
        key=data["id"],
        label=data["label"],
        kind=data["kind"],
        model_id=data.get("model_id"),
        description=data.get("description"),
    )


def write_model_spec(model_path: Path, spec: ModelSpec) -> None:
    metadata = {
        "id": spec.key,
        "label": spec.label,
        "kind": spec.kind,
    }
    if spec.model_id:
        metadata["model_id"] = spec.model_id
    if spec.description:
        metadata["description"] = spec.description
    (model_path / "model.json").write_text(json.dumps(metadata, indent=2) + "\n")


def infer_model_spec(model_key: str) -> ModelSpec:
    preset = PRESET_MODEL_SPECS.get(model_key)
    if preset is not None:
        return preset
    return ModelSpec(
        key=model_key,
        label=model_key.replace("-", " ").title(),
        kind="custom",
    )


def discover_model_paths(root: Path) -> list[tuple[ModelSpec, Path]]:
    model_paths: list[tuple[ModelSpec, Path]] = []
    if root.exists():
        for child in sorted(root.iterdir()):
            if not child.is_dir():
                continue
            if not all((child / name).exists() for name in ("embeddings.pt", "image_ids.json", "nearest.json")):
                continue
            spec = read_model_spec(child) or infer_model_spec(child.name)
            model_paths.append((spec, child))

    if model_paths:
        return model_paths

    legacy_files = ["embeddings.pt", "image_ids.json", "nearest.json"]
    if all((root / name).exists() for name in legacy_files):
        return [(PRESET_MODEL_SPECS[DEFAULT_MODEL_KEY], root)]

    return []
