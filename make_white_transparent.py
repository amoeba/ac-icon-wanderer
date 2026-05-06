#!/usr/bin/env python3
"""Make white pixels transparent in PNG icons. Usage: uv run --with pillow make_white_transparent.py"""
import os
import sys
from PIL import Image

def make_white_transparent(img, threshold=240):
    """Convert pixels with RGB all above threshold to transparent."""
    if img.mode != 'RGBA':
        img = img.convert('RGBA')

    pixels = img.load()
    width, height = img.size

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if r >= threshold and g >= threshold and b >= threshold:
                pixels[x, y] = (r, g, b, 0)

    return img

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Make white pixels transparent in PNG icons.')
    parser.add_argument('icons_dir', nargs='?', default='icons',
                        help='Path to icons directory (default: ./icons)')
    parser.add_argument('--threshold', type=int, default=240,
                        help='RGB threshold for "white" (0-255, default: 240)')
    parser.add_argument('--output-dir', default=None,
                        help='Output directory (default: overwrite originals)')
    args = parser.parse_args()

    icons_dir = args.icons_dir
    output_dir = args.output_dir or icons_dir

    if not os.path.isdir(icons_dir):
        print(f"Error: '{icons_dir}' is not a valid directory", file=sys.stderr)
        sys.exit(1)

    if output_dir != icons_dir:
        os.makedirs(output_dir, exist_ok=True)

    processed = 0
    for fname in os.listdir(icons_dir):
        if fname.lower().endswith('.png'):
            fpath = os.path.join(icons_dir, fname)
            try:
                with Image.open(fpath) as img:
                    result = make_white_transparent(img, args.threshold)
                    out_path = os.path.join(output_dir, fname)
                    result.save(out_path, 'PNG')
                    processed += 1
            except Exception as e:
                print(f"Warning: Skipping {fpath}: {e}", file=sys.stderr)

    print(f"Processed {processed} PNGs")

if __name__ == '__main__':
    main()
