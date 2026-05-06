#!/usr/bin/env python3
"""Move non-32x32 PNGs out of icons dir. Requires Pillow. Usage: uv run filter_icons.py"""
import os
import sys
import shutil
from PIL import Image

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Keep only 32x32 PNGs in icons directory.')
    parser.add_argument('icons_dir', nargs='?', default='icons',
                        help='Path to icons directory (default: ./icons)')
    parser.add_argument('--others-dir', default=None,
                        help='Directory for non-32x32 PNGs (default: icons_others)')
    args = parser.parse_args()

    icons_dir = args.icons_dir
    others_dir = args.others_dir or f"{icons_dir}_others"

    if not os.path.isdir(icons_dir):
        print(f"Error: '{icons_dir}' is not a valid directory", file=sys.stderr)
        sys.exit(1)

    os.makedirs(others_dir, exist_ok=True)

    kept = moved = 0
    for fname in os.listdir(icons_dir):
        if fname.lower().endswith('.png'):
            fpath = os.path.join(icons_dir, fname)
            try:
                with Image.open(fpath) as img:
                    w, h = img.size
                    if w == 32 and h == 32:
                        kept += 1
                    else:
                        shutil.move(fpath, os.path.join(others_dir, fname))
                        moved += 1
            except Exception as e:
                print(f"Warning: Skipping {fpath}: {e}", file=sys.stderr)

    print(f"Kept {kept} 32x32 PNGs in {icons_dir}")
    print(f"Moved {moved} non-32x32 PNGs to {others_dir}")

if __name__ == '__main__':
    main()
