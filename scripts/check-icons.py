#!/usr/bin/env python3
"""
Check the icon files in public/ against the ids the code actually uses.

Art arrives sheet by sheet over weeks, named by hand from a prompt. This is
what catches the gap the eye doesn't: an icon the code needs that nobody ever
generated, or a file named something the code will never ask for.

    python3 scripts/check-icons.py           # report
    python3 scripts/check-icons.py --strict  # exit 1 on any mismatch, for CI
"""

import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(path: str) -> str:
    with open(os.path.join(ROOT, path), encoding="utf-8") as f:
        return f.read()


def union_members(path: str, name: str) -> list:
    """Ids from a TypeScript string-literal union: `export type X = 'a' | 'b';`"""
    body = re.search(rf"export type {name} =([^;]+);", read(path), re.S)
    return re.findall(r"'([^']+)'", body.group(1)) if body else []


def object_keys(path: str, anchor: str) -> list:
    """Top-level keys of the object literal that `anchor` introduces."""
    src = read(path)
    # Anchor on the assignment, not the next brace: a type annotation like
    # Record<K, { icon: string }> puts an object literal in the way.
    start = src.index("= {", src.index(anchor)) + 2
    depth, end = 0, start
    for i in range(start, len(src)):
        depth += (src[i] == "{") - (src[i] == "}")
        if depth == 0:
            end = i
            break
    return re.findall(r"^\s{2}(\w+):", src[start:end], re.M)


def array_ids(path: str, anchor: str) -> list:
    """`id:` values inside the array literal that `anchor` introduces."""
    src = read(path)
    start = src.index(anchor)
    end = src.index("\n];", start)
    return re.findall(r"\bid: '([^']+)'", src[start:end])


# Each group: where the files live, and where the truth lives.
GROUPS = [
    ("public/powerups",     lambda: union_members("src/lib/types.ts", "PowerupType")),
    ("public/tiles",        lambda: [t for t in union_members("src/lib/types.ts", "TileNodeType")
                                     if t != "empty"]),
    ("public/themes/icons", lambda: union_members("src/lib/types.ts", "MapTheme")),
    ("public/tiles/journey", lambda: object_keys("src/lib/boardGraph.ts", "TILE_TYPE_ICONS")),
    ("public/events",       lambda: object_keys("src/components/TileEventOverlay.tsx", "LOOKS")),
    ("public/dares",        lambda: array_ids("src/lib/gameContent.ts", "DARE_CATEGORIES")),
    ("public/vibes",        lambda: object_keys("src/lib/roomVibes.ts", "ROOM_VIBES")),
]

# No single array to check against — these are named from the prompt.
LOOSE = {
    "public/modes": 7,
    "public/badges": 6,
    "public/social": 15,
}


def main() -> int:
    problems = 0
    total = 0
    for folder, source in GROUPS:
        want = list(dict.fromkeys(source()))
        have = sorted(os.path.basename(p)[:-4]
                      for p in glob.glob(os.path.join(ROOT, folder, "*.png")))
        total += len(have)
        missing = [w for w in want if w not in have]
        extra = [h for h in have if h not in want]
        flag = "ok" if not missing and not extra else "MISMATCH"
        print(f"{folder:24} {len(have):3} files / {len(want):3} ids   {flag}")
        for m in missing:
            print(f"    no art yet for id: {m}")
        for e in extra:
            print(f"    no code id for file: {e}.png")
        problems += len(missing) + len(extra)

    for folder, want in LOOSE.items():
        have = len(glob.glob(os.path.join(ROOT, folder, "*.png")))
        total += have
        flag = "ok" if have == want else "CHECK"
        print(f"{folder:24} {have:3} files / {want:3} expected   {flag}   (no source array)")
        problems += have != want

    print(f"\n{total} icons, {problems} problem(s)")
    return 1 if problems and "--strict" in sys.argv else 0


if __name__ == "__main__":
    sys.exit(main())
