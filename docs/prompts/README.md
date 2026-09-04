# Paste-ready Gemini prompts

Each `.txt` in this folder is **one complete prompt**. Open it, select all, paste into
Gemini. Nothing to assemble — the style block is already at the top of every file.

Run them in numbered order; that order is by visual payoff, so you can stop any time and
what you have will already be the most-seen art in the game.

| # | File | Icons | Replaces the emoji in |
| --- | --- | --- | --- |
| 01 | `01-mode-cards.txt` | 7 | `RoomLobby.tsx` mode tiles |
| 02 | `02-board-tiles.txt` | 8 | `themeConfig.ts` → `nodeColors` |
| 03 | `03-journey-tiles.txt` | 10 | `boardGraph.ts` → `TILE_ICONS` |
| 04 | `04-powerups.txt` | 7 | `gameRules.ts` → `POWERUP_SHOP` |
| 05 | `05-event-bursts.txt` | 12 | `TileEventOverlay.tsx` → `EVENT_STYLES` |
| 06 | `06-role-badges.txt` | 6 | `gameContent.ts` → `AVATARS` |
| 07 | `07-room-vibes.txt` | 5 | `roomVibes.ts` → `ROOM_VIBES` |
| 08 | `08-dare-styles.txt` | 8 | `gameContent.ts` → `DARE_STYLES` |
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
