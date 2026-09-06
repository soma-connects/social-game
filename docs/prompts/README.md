# Paste-ready Gemini prompts

Each `.txt` in this folder is **one complete prompt**. Open it, select all, paste into
Gemini. Nothing to assemble — the style block is already at the top of every file.

Run them in numbered order; that order is by visual payoff, so you can stop any time and
what you have will already be the most-seen art in the game.

| # | File | Icons | Replaces the emoji in |
| --- | --- | --- | --- |
| 01 | `01-mode-cards.txt` | 7 | `RoomLobby.tsx` mode tiles |
| 02 | `02-board-tiles.txt` | 8 | `themeConfig.ts` → `nodeColors` |
| 03 | `03-journey-tiles.txt` | 10 | `boardGraph.ts` → `TILE_TYPE_ICONS` |
| 04 | `04-powerups.txt` | 7 | `gameRules.ts` → `POWERUP_SHOP` |
| 05 | `05-event-bursts.txt` | 13 | `TileEventOverlay.tsx` → `LOOKS` |
| 06 | `06-role-badges.txt` | 6 | `gameContent.ts` → `AVATARS` |
| 07 | `07-room-vibes.txt` | 5 | `roomVibes.ts` → `ROOM_VIBES` |
| 08 | `08-dare-styles.txt` | 8 | `gameContent.ts` → `DARE_CATEGORIES` |
| 09 | `09-soundboard-reactions.txt` | 15 | `RoastIntermission.tsx`, `AiMasterGame.tsx` |
| 10 | `10-theme-icons.txt` | 7 | `themeConfig.ts` → theme `icon` |

**85 icons in 10 prompts.** Each returns one grid image that you slice into the named
files — the filenames in each prompt's `AFTER:` line are the ids the code already uses.

Sheet 06 is the only one that needs a file uploaded with it
(`public/avatars/paul.jpg`, so the badge style matches the existing avatar cards).

Not in this folder, because they should NOT be AI-generated: the ~20 control glyphs
(mic, mute, settings, lock, tick, cross). Those want `lucide-react` vector icons — see
§7 of `../AI_ASSET_PROMPTS.md`. And the ~250 emoji sitting inside sentences stay as
emoji — see §8.

Background removal, resizing and wiring the files into the code: §4 of
`../AI_ASSET_PROMPTS.md`.

---

## Cropping: don't do it by hand

`scripts/slice-sheet.py` cuts a sheet into individual square PNGs with the background
keyed out. It finds each icon by its own content bounds rather than assuming an even
grid, so uneven spacing, empty cells and single-row strips all work.

```bash
pip install pillow numpy scipy      # once

python3 scripts/slice-sheet.py ~/Downloads/sheet.png -o public/modes --size 512 \
  -n board,voice,party,ai_master,team_battle,chess,ludo
```

Names are applied in reading order — left to right, top to bottom — and each prompt's
`AFTER:` line already lists them in that order, ready to paste after `-n`.

Add `--dry-run` first: it prints what it found and where, and writes nothing. If the
count it reports doesn't match your names, the sheet is the problem, not the tool —
check it before writing 15 mislabelled files.

Baked-in text labels are handled without a flag: captions that separate into their own
blobs are ignored as too small, and one still attached to a tall icon is recognised by
shape — a short, wide band with a gap above it — and cut. Both are reported.

Flags worth knowing:

| Flag | When |
| --- | --- |
| `--soft` | art generated on a **black** background — fades outer glows into alpha instead of cutting them off, which is what removes the dark ring around glowing icons |
| `--grid RxC` | auto-detection merged or split icons; forces an even grid instead |
| `--drop-bottom PX` | manual override when a baked-in label survives the automatic trim |
| `--size N` | output size, default 512 (use 256 for tile and badge sheets) |
| `--dry-run` | report only |

**What it cannot fix.** Keying only removes background that touches the edge of the
sheet. If the model drew each icon on its own dark panel, or scattered a starfield
behind them, that is artwork as far as any tool is concerned — it comes out attached to
the icon. That is what the Background block in every prompt is defending against, and
if a sheet comes back that way the fix is to regenerate it, not to fight the crop.

### Save the PNG, not a screenshot

This is the single biggest quality difference in the whole pipeline, and it has
nothing to do with the prompt.

If the file you hand the slicer has a **grey checkerboard** background, the alpha
channel is already gone. A checkerboard is how an editor *draws* transparency on
screen; once that view is flattened to a JPEG, every soft pixel — glow, shadow,
antialiased edge — is permanently mixed with two greys. Keying can remove the flat
squares, but the blended fringe around each icon stays, and no tool recovers it.

Measured across the first batch of sheets:

| What arrived | Result |
| --- | --- |
| PNG with a real alpha channel | clean |
| JPEG on flat `#000000` black (use `--soft`) | clean |
| JPEG showing a grey checkerboard | grey fringes, unusable |

So: use the generator's **download** button and keep the `.png`. Don't screenshot the
preview, don't re-export as JPEG, don't paste it through anything that flattens it.
The slicer warns when it sees a checkerboard, before it writes any files.

If a PNG isn't available, the fallback that works is flat black — the Background block
in every prompt already asks for exactly that.

### Checking coverage against the code

```bash
python3 scripts/check-icons.py            # report
python3 scripts/check-icons.py --strict   # exit 1 on any mismatch, for CI
```

It reads the ids straight out of the source — the `PowerupType`, `TileNodeType` and
`MapTheme` unions in `src/lib/types.ts`, and the `TILE_TYPE_ICONS`, `LOOKS`,
`DARE_CATEGORIES` and `ROOM_VIBES` literals — and compares them with what is actually
in `public/`. It reports both directions: an id the code needs with no art yet, and a
file whose name no code id will ever ask for.

That second direction is the one worth having. A misnamed file looks completely fine in
a folder listing and simply never loads.
