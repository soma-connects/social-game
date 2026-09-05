#!/usr/bin/env python3
"""
Slice a generated icon SHEET into individual square PNGs with transparency.

Image models return a grid of icons on one canvas — that keeps the art
consistent, but leaves you cropping by hand. This does the cropping.

It does not assume an even grid. It builds a background mask, finds each
icon by its own content bounds, and crops to that — so uneven spacing,
empty cells and strips all work.

    python3 scripts/slice-sheet.py sheet.png -o public/modes \
        -n board,voice,party,ai_master,team_battle,chess,ludo

Backgrounds, best to worst:
  * real alpha (a transparent PNG)  -> used as-is. Ask for this.
  * flat black / near-black         -> keyed out; add --soft so glows fade properly
  * a grey checkerboard             -> WARNED ABOUT, and the result will have grey
                                       fringes. A checkerboard is a picture OF
                                       transparency: the soft edges are already
                                       blended into it and cannot be recovered.

Only background CONNECTED TO THE EDGE is removed, so a black bomb or a navy
chess knight keeps its own dark pixels.

Useful flags:
  --grid RxC        force a fixed grid instead of auto-detection
  --drop-bottom PX  cut a baked-in text label off each cell first
  --size N          output square size (default 512)
  --pad F           breathing room around the art, as a fraction (default 0.06)
  --dry-run         report what it would write, write nothing

Output is palette-quantised by default — visually identical at icon sizes and
about 5x smaller, which matters when the audience is on mobile data. --no-quantize
turns it off.
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image

try:
    from scipy import ndimage
except ImportError:
    sys.exit("needs scipy: pip install scipy pillow numpy")


# ---------------------------------------------------------------- background

def checkerboard_warning(rgba: np.ndarray) -> str:
    """Detect the grey transparency checkerboard, which means a lost alpha channel.

    A checkerboard in the pixels is a picture OF transparency, not transparency.
    Everything soft — glows, shadows, antialiased edges — got blended into two
    greys on the way, and no keying can pull them apart again. Worth saying
    loudly, because the fix is upstream and takes ten seconds.
    """
    if (rgba[..., 3] < 250).mean() > 0.02:
        return ""                                    # real alpha, nothing to warn about

    strip = rgba[:60, :, :3].astype(np.int16)
    grey = strip[(strip.max(axis=2) - strip.min(axis=2)) <= 12]
    if len(grey) < strip.shape[0] * strip.shape[1] * 0.5:
        return ""

    level = grey.mean(axis=1)
    lo, hi = np.percentile(level, 10), np.percentile(level, 90)
    if hi - lo < 25 or lo < 40:
        return ""                                    # flat background, or plain black — fine
    near = ((np.abs(level - lo) < 12) | (np.abs(level - hi) < 12)).mean()
    if near < 0.8:
        return ""
    return (f"the background is a grey checkerboard ({lo:.0f}/{hi:.0f}), so this file is a "
            "flattened picture of transparency, not a transparent image.\n"
            "  Every glow and soft edge is already blended into those greys and cannot be "
            "recovered — expect grey fringes.\n"
            "  Fix upstream: download the generator's PNG rather than a screenshot or JPEG "
            "export, or re-generate on flat #000000 and slice with --soft.")


def background_mask(rgba: np.ndarray, dark: int = 55, tol: int = 26) -> np.ndarray:
    """True where the pixel is sheet background rather than artwork.

    Real alpha wins when the file has any. Otherwise we look at what colour
    sits in the sheet's border ring and treat matching low-saturation pixels
    as background — that covers both flat black and a baked checkerboard,
    which is just two greys.
    """
    alpha = rgba[..., 3]
    if (alpha < 250).mean() > 0.02:
        return alpha < 128

    rgb = rgba[..., :3].astype(np.int16)
    ring = np.concatenate([
        rgb[:3].reshape(-1, 3), rgb[-3:].reshape(-1, 3),
        rgb[:, :3].reshape(-1, 3), rgb[:, -3:].reshape(-1, 3),
    ])
    # A checkerboard contributes two greys, a flat background one. Rounding to
    # a coarse grid and taking the top hits finds them without real clustering.
    keys, counts = np.unique((ring // 12).astype(np.int32) @ np.array([65536, 256, 1]),
                             return_counts=True)
    seeds = []
    for key in keys[np.argsort(-counts)][:4]:
        seeds.append(np.array([(key // 65536) * 12, (key // 256 % 256) * 12, (key % 256) * 12]))

    spread = rgb.max(axis=2) - rgb.min(axis=2)   # cheap saturation stand-in
    mask = (rgb.max(axis=2) <= dark) & (spread <= 22)
    for seed in seeds:
        if int(seed.max() - seed.min()) > 26:
            continue                              # a coloured seed is artwork, not background
        mask |= (np.abs(rgb - seed).max(axis=2) <= tol) & (spread <= 26)
    return mask


def edge_connected(mask: np.ndarray) -> np.ndarray:
    """Keep only the background that reaches the sheet edge.

    Without this, every dark pixel inside an icon reads as background and the
    bomb comes out as a ring.
    """
    labels, n = ndimage.label(mask)
    if n == 0:
        return mask
    touching = set(labels[0]) | set(labels[-1]) | set(labels[:, 0]) | set(labels[:, -1])
    touching.discard(0)
    return np.isin(labels, list(touching))


# ------------------------------------------------------------------ segmentation

def runs(profile: np.ndarray, min_len: int) -> list:
    """Contiguous True stretches, ignoring ones shorter than min_len."""
    out, start = [], None
    for i, v in enumerate(profile):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= min_len:
                out.append((start, i))
            start = None
    if start is not None and len(profile) - start >= min_len:
        out.append((start, len(profile)))
    return out


def find_cells(content: np.ndarray, min_frac: float = 0.03) -> list:
    """Locate each icon: split into horizontal bands, then columns within each."""
    h, w = content.shape
    cells = []
    for top, bottom in runs(content.any(axis=1), max(8, int(h * min_frac))):
        band = content[top:bottom]
        for left, right in runs(band.any(axis=0), max(8, int(w * min_frac))):
            ys, xs = np.nonzero(band[:, left:right])
            if not len(ys):
                continue
            cells.append((left + xs.min(), top + ys.min(),
                          left + xs.max() + 1, top + ys.min() + ys.max() + 1))
    return cells


def grid_cells(content: np.ndarray, rows: int, cols: int) -> list:
    """Fixed grid, then trim each cell to whatever content it holds."""
    h, w = content.shape
    cells = []
    for r in range(rows):
        for c in range(cols):
            y0, y1 = round(r * h / rows), round((r + 1) * h / rows)
            x0, x1 = round(c * w / cols), round((c + 1) * w / cols)
            ys, xs = np.nonzero(content[y0:y1, x0:x1])
            if len(ys) < 64:
                continue                          # an empty cell, as the prompts ask for
            cells.append((x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1))
    return cells


# ----------------------------------------------------------------------- output

def soften(patch: np.ndarray, knee: int = 90) -> None:
    """Turn a glow that fades into black into a glow that fades into alpha.

    A hard cutoff leaves a dark ring around anything with an outer glow,
    because the glow's dim outer pixels are kept at full opacity. Art on black
    is effectively premultiplied, so brightness IS the coverage: take alpha
    from it and divide the premultiplication back out.
    """
    luma = patch[..., :3].max(axis=2).astype(np.float32)
    partial = (patch[..., 3] > 0) & (luma < knee)
    scale = np.clip(luma / knee, 0, 1)
    patch[..., 3] = np.where(partial, (scale * 255).astype(np.uint8), patch[..., 3])
    safe = np.maximum(scale[partial], 1e-3)[:, None]
    patch[..., :3][partial] = np.clip(patch[..., :3][partial] / safe, 0, 255).astype(np.uint8)


def export(rgba: np.ndarray, bg: np.ndarray, box, size: int, pad: float,
           soft: bool = False, quantize: bool = True) -> Image.Image:
    """Crop to a square around the art, key the background out, resize."""
    x0, y0, x1, y1 = box
    side = max(x1 - x0, y1 - y0)
    side = int(side * (1 + pad * 2))
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2

    out = np.zeros((side, side, 4), dtype=np.uint8)
    sx0, sy0 = cx - side // 2, cy - side // 2
    # Clip against the sheet edge; whatever falls outside stays transparent.
    rx0, ry0 = max(0, sx0), max(0, sy0)
    rx1, ry1 = min(rgba.shape[1], sx0 + side), min(rgba.shape[0], sy0 + side)
    patch = rgba[ry0:ry1, rx0:rx1].copy()
    patch[..., 3] = np.where(bg[ry0:ry1, rx0:rx1], 0, 255)
    if soft:
        soften(patch)
    out[ry0 - sy0:ry1 - sy0, rx0 - sx0:rx1 - sx0] = patch

    icon = Image.fromarray(out).resize((size, size), Image.LANCZOS)
    if quantize:
        # FASTOCTREE keeps the alpha channel, unlike the default median cut.
        icon = icon.quantize(colors=255, method=Image.FASTOCTREE)
    return icon


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("sheet")
    ap.add_argument("-o", "--out", default=".", help="output directory")
    ap.add_argument("-n", "--names", default="", help="comma-separated output names, in reading order")
    ap.add_argument("--grid", help="force a grid, e.g. 4x2 (rows x cols)")
    ap.add_argument("--drop-bottom", type=int, default=0,
                    help="pixels to cut off the bottom of each cell, for baked-in labels")
    ap.add_argument("--size", type=int, default=512)
    ap.add_argument("--pad", type=float, default=0.06)
    ap.add_argument("--soft", action="store_true",
                    help="fade outer glows into alpha instead of cutting them off; "
                         "for art generated on a black background")
    ap.add_argument("--no-quantize", action="store_true",
                    help="keep full 24-bit colour; ~5x larger files")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    rgba = np.array(Image.open(args.sheet).convert("RGBA"))
    warning = checkerboard_warning(rgba)
    if warning:
        print(f"WARNING: {warning}\n")
    bg = edge_connected(background_mask(rgba))
    content = ~bg

    if args.grid:
        rows, cols = (int(v) for v in args.grid.lower().split("x"))
        cells = grid_cells(content, rows, cols)
    else:
        cells = find_cells(content)

    if args.drop_bottom:
        trimmed = []
        for x0, y0, x1, y1 in cells:
            y1 = max(y0 + 1, y1 - args.drop_bottom)
            ys, xs = np.nonzero(content[y0:y1, x0:x1])
            if len(ys) < 64:
                continue
            trimmed.append((x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1))
        cells = trimmed

    names = [n.strip() for n in args.names.split(",") if n.strip()]
    print(f"{os.path.basename(args.sheet)}: found {len(cells)} icons"
          f"{f', {len(names)} names given' if names else ''}")
    if names and len(names) != len(cells):
        print(f"  ! count mismatch — extras will be numbered. Check the sheet, or pass --grid.")

    os.makedirs(args.out, exist_ok=True) if not args.dry_run else None
    for i, box in enumerate(cells):
        name = names[i] if i < len(names) else f"icon_{i + 1:02d}"
        path = os.path.join(args.out, f"{name}.png")
        w, h = box[2] - box[0], box[3] - box[1]
        print(f"  {name:16} from {w:4}x{h:<4} at ({box[0]:4},{box[1]:4}) -> {path}")
        if not args.dry_run:
            export(rgba, bg, box, args.size, args.pad, args.soft,
                   not args.no_quantize).save(path, optimize=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
