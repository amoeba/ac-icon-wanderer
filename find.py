"""
find_similar.py

Looks up a query image's embedding from a precomputed store (no model needed)
and displays the top-K most similar images in a grid.

Usage:
    python find_similar.py --query ./photos/dog.jpg --embeddings_dir ./embeddings
    python find_similar.py --query ./photos/dog.jpg --embeddings_dir ./embeddings --top_k 100
    python find_similar.py --query ./photos/dog.jpg --embeddings_dir ./embeddings --no_display --save results.png
"""

import argparse
import json
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import torch
from PIL import Image


def load_store(embeddings_dir: Path) -> tuple[torch.Tensor, list[str]]:
    embeddings_path = embeddings_dir / "embeddings.pt"
    ids_path = embeddings_dir / "image_ids.json"

    if not embeddings_path.exists():
        raise FileNotFoundError(f"No embeddings.pt in {embeddings_dir}")
    if not ids_path.exists():
        raise FileNotFoundError(f"No image_ids.json in {embeddings_dir}")

    embeddings = torch.load(embeddings_path, weights_only=True)
    image_ids = json.loads(ids_path.read_text())
    return embeddings, image_ids


def lookup_query_embedding(
    query_path: Path,
    store_embeddings: torch.Tensor,
    image_ids: list[str],
) -> tuple[torch.Tensor, int]:
    resolved = query_path.resolve()
    for i, path in enumerate(image_ids):
        if Path(path).resolve() == resolved:
            return store_embeddings[i].unsqueeze(0), i
    raise ValueError(
        f"Query image not found in embedding store: {query_path}\n"
        f"Run compute_embeddings.py on the directory containing this image first."
    )


def find_top_k(
    query_embedding: torch.Tensor,
    store_embeddings: torch.Tensor,
    image_ids: list[str],
    top_k: int,
    exclude_index: int,
) -> list[tuple[str, float]]:
    sims = (query_embedding @ store_embeddings.T).squeeze(0)  # (N,)
    sims[exclude_index] = -2.0  # exclude the query itself

    top_k_values, top_k_indices = sims.topk(min(top_k, len(image_ids) - 1))

    return [
        (image_ids[idx], float(score))
        for idx, score in zip(top_k_indices.tolist(), top_k_values.tolist())
    ]


def display_results(
    query_path: Path,
    results: list[tuple[str, float]],
    save_path: str | None = None,
    no_display: bool = False,
):
    n = len(results)
    cols = 5
    rows = (n + cols - 1) // cols
    total_rows = rows + 1  # +1 for query row

    fig = plt.figure(figsize=(cols * 3, total_rows * 3 + 0.5), facecolor="#0f0f0f")
    fig.suptitle("SigLIP2 Image Similarity Search", color="white", fontsize=14, y=0.98)

    gs = gridspec.GridSpec(total_rows, cols, figure=fig, hspace=0.4, wspace=0.1)

    # Query image (spans middle columns)
    query_ax = fig.add_subplot(gs[0, 1:4])
    try:
        query_img = Image.open(query_path).convert("RGB")
        query_ax.imshow(query_img)
    except Exception:
        query_ax.text(0.5, 0.5, "Could not load", ha="center", va="center", color="white")
    query_ax.set_title("Query Image", color="#00d4ff", fontsize=11, pad=6)
    query_ax.axis("off")
    for spine in query_ax.spines.values():
        spine.set_edgecolor("#00d4ff")
        spine.set_linewidth(2)
        spine.set_visible(True)

    for col in list(range(0, 1)) + list(range(4, cols)):
        fig.add_subplot(gs[0, col]).axis("off")

    # Result images
    for i, (path, score) in enumerate(results):
        ax = fig.add_subplot(gs[(i // cols) + 1, i % cols])
        try:
            ax.imshow(Image.open(path).convert("RGB"))
        except Exception:
            ax.set_facecolor("#1a1a1a")
            ax.text(0.5, 0.5, "Load error", ha="center", va="center", color="white", fontsize=7)

        ax.set_title(
            f"#{i+1}  {score:.3f}",
            color="#ffffff" if score > 0.7 else "#aaaaaa",
            fontsize=8,
            pad=4,
        )
        ax.axis("off")

        border_color = "#00ff88" if score > 0.85 else "#ffcc00" if score > 0.70 else "#ff6644"
        for spine in ax.spines.values():
            spine.set_edgecolor(border_color)
            spine.set_linewidth(1.5)
            spine.set_visible(True)

    # Fill empty cells in last row
    last_row_used = len(results) % cols
    if last_row_used != 0:
        for col in range(last_row_used, cols):
            fig.add_subplot(gs[rows, col]).axis("off")

    fig.text(
        0.5, 0.01,
        "■ green > 0.85   ■ yellow > 0.70   ■ red ≤ 0.70   (cosine similarity)",
        ha="center", color="#888888", fontsize=8,
    )

    if save_path:
        plt.savefig(save_path, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
        print(f"Saved to {save_path}")

    if not no_display:
        plt.show()
    else:
        plt.close()


def main():
    parser = argparse.ArgumentParser(description="Find similar images from a precomputed embedding store")
    parser.add_argument("--query", required=True, help="Path to the query image (must be in the embedding store)")
    parser.add_argument("--embeddings_dir", default="./embeddings", help="Directory with embeddings.pt and image_ids.json")
    parser.add_argument("--top_k", type=int, default=100, help="Number of results to show")
    parser.add_argument("--save", default=None, help="Save the result grid to this path")
    parser.add_argument("--no_display", action="store_true", help="Don't open a window")
    args = parser.parse_args()

    query_path = Path(args.query)
    if not query_path.exists():
        raise FileNotFoundError(f"Query image not found: {query_path}")

    print(f"Loading embedding store from {args.embeddings_dir}...")
    store_embeddings, image_ids = load_store(Path(args.embeddings_dir))
    print(f"  {len(image_ids)} images in store")

    print(f"Looking up query embedding for: {query_path}")
    query_embedding, query_index = lookup_query_embedding(query_path, store_embeddings, image_ids)

    print(f"Searching for top {args.top_k}...")
    results = find_top_k(query_embedding, store_embeddings, image_ids, args.top_k, query_index)

    print("\nTop results:")
    for i, (path, score) in enumerate(results, 1):
        print(f"  {i:2d}. {score:.4f}  {path}")

    display_results(query_path, results, save_path=args.save, no_display=args.no_display)


if __name__ == "__main__":
    main()
