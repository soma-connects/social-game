#!/usr/bin/env python3
"""
Check the icon files in public/ against the ids the code actually uses.

Art arrives sheet by sheet over weeks, named by hand from a prompt. This is
what catches the gap the eye doesn't: an icon the code needs that nobody ever
generated, or a file named something the code will never ask for.

It also reports whether each group is RENDERED — whether any component calls
its helper from lib/gameIcons.ts. A folder full of correctly named art that no
screen draws looks identical to a finished job from the filesystem, and that is
exactly how eighteen icons sat unused here: they were generated from data
arrays that turned out to have no render site.

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


# Each group: where the files live, where the ids come from, and the
# lib/gameIcons.ts helper a component has to call for any of it to appear.
GROUPS = [
    ("public/powerups", "powerupArt",
     lambda: union_members("src/lib/types.ts", "PowerupType")),
    ("public/tiles", "tileArt",
     lambda: [t for t in union_members("src/lib/types.ts", "TileNodeType") if t != "empty"]),
    ("public/themes/icons", "themeArt",
     lambda: union_members("src/lib/types.ts", "MapTheme")),
    ("public/tiles/journey", "journeyArt",
     lambda: object_keys("src/lib/boardGraph.ts", "TILE_TYPE_ICONS")),
    ("public/events", "eventArt",
     lambda: object_keys("src/components/TileEventOverlay.tsx", "LOOKS")),
    ("public/dares", "dareArt",
     lambda: array_ids("src/lib/gameContent.ts", "DARE_CATEGORIES")),
    ("public/vibes", "vibeArt",
     lambda: object_keys("src/lib/roomVibes.ts", "ROOM_VIBES")),
]

# No single array to check against — these are named from the prompt.
LOOSE = [
    ("public/modes", "modeArt", 7),
    ("public/badges", "badgeArt", 6),
    ("public/social", "socialArt", 15),
]


def source_files():
    """Every component and route file, which is everywhere art can be drawn."""
    for base in ("src/components", "src/app"):
        for root, _, files in os.walk(os.path.join(ROOT, base)):
            for name in sorted(files):
                if name.endswith((".tsx", ".ts")):
                    yield os.path.join(root, name)


def renders(helper: str):
    """
    How a helper is called: (files that call it, the ids they ask for).

    The second half is what a plain call count misses. `journeyArt` is called
    from one component, which looked like a rendered folder — but it is only
    ever called as `journeyArt('finish')`, so nine of the ten files in that
    folder have no render site at all. Counting files says "drawn in 1";
    counting arguments says one id of ten.

    Returns ids as a set of literals, or None when the helper is called with a
    variable — `tileArt(nodeType)` can reach every id, and there is no way to
    know which from the source alone, so those groups are reported as dynamic
    rather than guessed at.
    """
    files, ids, dynamic = 0, set(), False
    call = re.compile(rf"\b{helper}\(\s*([^)]*?)\s*\)")
    for path in source_files():
        with open(path, encoding="utf-8") as f:
            src = f.read()
        if f"{helper}(" not in src:
            continue
        files += 1
        for arg in call.findall(src):
            literal = re.fullmatch(r"'([^']*)'", arg)
            if literal:
                ids.add(literal.group(1))
            else:
                dynamic = True
    return files, (None if dynamic else ids)


def describe(files: int, asked) -> str:
    """One phrase for how a group is reached from the code."""
    if files == 0:
        return "NOT RENDERED"
    if asked is None:
        return f"drawn in {files} (dynamic)"
    return f"drawn in {files}, asks for {len(asked)}"


def main() -> int:
    problems = 0
    total = 0
    unrendered = []
    idle = []  # art whose group is drawn, but whose own id is never asked for

    def report(folder, helper, want, counted_label):
        nonlocal problems, total
        have = sorted(os.path.basename(p)[:-4]
                      for p in glob.glob(os.path.join(ROOT, folder, "*.png")))
        total += len(have)
        files, asked = renders(helper)
        if want is None:  # LOOSE: no id list, only an expected count
            missing, extra = [], []
            flag = "ok" if len(have) == counted_label else "CHECK"
            counts = f"{len(have):3} files / {counted_label:3} named"
            problems += len(have) != counted_label
        else:
            missing = [w for w in want if w not in have]
            extra = [h for h in have if h not in want]
            flag = "ok" if not missing and not extra else "MISMATCH"
            counts = f"{len(have):3} files / {len(want):3} ids  "
            problems += len(missing) + len(extra)

        print(f"{folder:24} {counts}  {flag:9} {describe(files, asked)}")
        for m in missing:
            print(f"    no art yet for id: {m}")
        for e in extra:
            print(f"    no code id for file: {e}.png")

        if files == 0:
            unrendered.append(folder)
        elif asked is not None:
            # Every id is a literal here, so anything absent is genuinely
            # unreachable rather than merely unprovable.
            for name in have:
                if name not in asked:
                    idle.append(f"{folder}/{name}.png")

    for folder, helper, source in GROUPS:
        report(folder, helper, list(dict.fromkeys(source())), None)

    for folder, helper, expected in LOOSE:
        report(folder, helper, None, expected)

    if unrendered:
        print("\nArt with no render site — correct on disk, invisible in the game:")
        for folder in unrendered:
            print(f"  {folder}")

    if idle:
        print("\nArt in a rendered group that nothing ever asks for:")
        for path in idle:
            print(f"  {path}")

    print(f"\n{total} icons, {problems} problem(s)")
    return 1 if problems and "--strict" in sys.argv else 0


if __name__ == "__main__":
    sys.exit(main())
