# AI Asset Prompt Pack — Voice Party Arcade

A copy-paste kit for generating this game's art with **Gemini** (the "Nano Banana"
image models, in the Gemini app or AI Studio).

Everything here is derived from what the code actually asks for — the palette in
`tailwind.config.ts`, the tile types in `src/lib/themeConfig.ts`, the power-ups in
`src/lib/gameRules.ts`, the avatars in `src/lib/gameContent.ts`, and the mockup in
`public/designs/`. So the art you get back drops straight into `public/` instead of
being "nice pictures we can't use".

---

## 0. How to use this (read once, then skip)

**Where:** Gemini app → ask for an image, or [aistudio.google.com](https://aistudio.google.com)
→ pick the image model. AI Studio gives you aspect-ratio control and no chat clutter, so
prefer it for batches.

**The three rules that decide whether this works:**

1. **Always paste the Style Block (§1) first.** An image model has no memory of your
   game. The Style Block is what makes asset #40 look like it belongs beside asset #1.
2. **Upload a reference image.** Drag `public/avatars/paul.jpg` (for characters) or
   `public/designs/ChatGPT Image Aug 3, 2026, 09_46_43 PM.png` (for UI) into the prompt
   and say *"match this style exactly."* This is worth more than any adjective.
3. **Generate icon sets as one sheet, not one at a time.** Ask for a 4×2 grid on one
   canvas and the model keeps the lighting, weight and perspective consistent across all
   eight. Then you slice the sheet. Eight separate prompts = eight slightly different
   art styles.

**Two things Gemini is bad at, and the workaround:**

| Problem | Workaround |
| --- | --- |
| Transparent backgrounds are unreliable | Ask for transparent PNG **and** add: *"if transparency is unavailable, use a pure `#000000` black background with no gradient or vignette."* Pure black keys out cleanly, and this codebase already uses `mix-blend-screen` (see `MapRenderer.tsx`), where pure black renders as invisible. |
| Text inside images comes out misspelled | Add *"no text, no letters, no numbers, no watermark"* to every prompt. Put real text in HTML/CSS where you control it. |

---

## 1. THE STYLE BLOCK — paste this at the top of every prompt

```
STYLE BIBLE — "Voice Party Arcade" (mobile-first multiplayer voice party game)

Art direction: premium mobile game UI. Glossy semi-3D vector illustration with soft
inner bevels, rim lighting and neon glow. Think Stickman Party / Fall Guys polish
sitting on a dark cosmic glassmorphism interface. Playful and bold, never childish,
never corporate-flat.

Palette — use ONLY these:
  Gold / primary accent   #FFD166  (also #FFD000 for hits)
  Cosmic void background  #050814
  Card / panel navy       #0B132B
  Hot pink / danger       #FF4757
  Cyan / electric         #00F0FF
  Emerald / buff-success  #10B981
  Terracotta / warm alert #FF5722

Lighting: single top-left key light, cool cyan rim light from the lower right,
soft outer glow in the object's own accent colour.
Edges: thick clean silhouette, readable at 32×32 px.
Finish: subtle noise-free gradients, gentle specular highlight, no drop-shadow text.
Never: photorealism, stock-photo look, watermarks, text, letters, numbers,
      3D render turntables, busy background clutter.
```

---

## 2. THE MASTER TEMPLATE — the one prompt to reuse forever

Paste the Style Block, then this, filling in the four `[ ]` slots:

```
Using the STYLE BIBLE above, generate: [WHAT IT IS].

Subject: [DESCRIBE THE OBJECT — one concrete noun phrase, the pose, the material]
Dominant accent colour: [HEX from the palette]
Composition: object centred, filling ~85% of the frame, generous even margin,
             straight-on 3/4 view, no cropping at the edges.
Background: transparent PNG. If transparency is unavailable, pure #000000 black,
            flat, no gradient, no vignette, no shadow on the ground.
Output: [SIZE] px, [ASPECT] aspect ratio.
Must read clearly when scaled down to 40×40 px.
No text, no letters, no numbers, no watermark, no border frame.
```

> **Why each line is there:** *"filling ~85%"* stops the model from producing a tiny
> object in a big empty field. *"reads at 40×40"* pushes it toward a bold silhouette
> instead of fine detail that turns to mush in the sidebar. *"no border frame"* stops
> the decorative ring it loves to add, which would clash with the CSS border the app
> already draws.

---

## 3. Ready-made prompts, by asset

Each block: **what the code expects → where the file goes → the prompt.**

### A. Power-up icons  →  `public/powerups/*.png`, 512×512

Defined in `src/lib/gameRules.ts` (currently emoji). Generate as **one sheet**, slice into seven.

```
[STYLE BLOCK]

Generate ONE image: a 4-column × 2-row grid of seven game power-up icons on a single
canvas, evenly spaced, each in its own invisible square cell, identical lighting,
identical scale, identical 3/4 view. Leave the 8th cell empty.

1. ROCKET NITRO — a chunky cartoon rocket tilted 45° up-right, emerald #10B981 body,
   gold #FFD166 fins, cyan flame trail.
2. REWIND TRAP — a glossy double-left-arrow rewind symbol inside a rounded square
   button, cyan #00F0FF on navy #0B132B, motion streaks trailing right.
3. MAGIC SHIELD — a heraldic kite shield, gold #FFD166 rim, deep navy face, a soft
   cyan energy dome shimmering over it.
4. DARE GUN — a retro chrome stage microphone re-imagined as a toy blaster, gold body,
   hot pink #FF4757 trigger and muzzle glow.
5. ICE FREEZE — a six-point crystal snowflake, thick faceted ice, cyan #00F0FF core,
   white frost highlights, cold vapour at the tips.
6. POINT BOMB — a classic round black cartoon bomb, glossy highlight, gold fuse cap,
   a lit sparking fuse in hot pink #FF4757.
7. BURIED MINE — a spiked naval sea-mine half-buried in glowing cracked ground,
   terracotta #FF5722 spikes, red warning light on top.

Background: transparent, or pure #000000 flat black.
Each icon must read clearly at 40×40 px. No text, no numbers, no labels, no captions.
Output 2048×1024.
```

Then slice → `boost.png`, `rewind.png`, `shield.png`, `dare_gun.png`, `freeze.png`,
`bomb.png`, `mine.png`.

---

### B. Board tile icons  →  `public/tiles/*.png`, 256×256

The eight `TileNodeType`s from `src/lib/types.ts`. These sit on a coloured disc the CSS
already draws, so **generate the glyph only** — no disc, no ring.

```
[STYLE BLOCK]

Generate ONE image: a 4×2 grid of eight game-board tile glyphs on a single canvas,
identical scale and lighting, each centred in its own invisible square cell.
These are SYMBOLS ONLY — do not draw a circle, disc, badge, ring or plate behind them.

1. NORMAL — a simple four-point sparkle star, soft white-gold #FFD166.
2. BUFF — an upward chevron with a speed-boost swoosh, emerald #10B981, glowing.
3. DEBUFF — a downward broken chevron, cracked, hot pink #FF4757.
4. DARE — a stage microphone with two sound-wave arcs, purple-magenta with cyan rim.
5. MYSTERY — a bold question mark, glossy gold #FFD166, with a faint sparkle.
6. BONUS — a five-point star, thick gold, cyan #00F0FF inner glow.
7. TRAP — a bear-trap seen from above, jaws open, terracotta #FF5722 teeth, red glow.
8. DUEL — two crossed sabres, silver blades, gold hilts, magenta energy along the edges.

Background: transparent, or pure #000000 flat black.
Bold silhouettes, must read at 24×24 px. No text, no letters, no numbers.
Output 2048×1024.
```

---

### C. Theme board backgrounds  →  `public/themes/<theme>_bg.jpg`, 1920×1080

One per theme in `src/lib/themeConfig.ts`. These sit **behind** the board path, so the
centre must stay quiet or the tiles become unreadable.

```
[STYLE BLOCK]

Generate a wide game-board background illustration: [THEME LINE BELOW].

Camera: high isometric 3/4 view looking down at a stylised landscape.
CRITICAL: keep the centre of the frame calm, low-contrast and uncluttered — a game
path and player tokens will be drawn on top of it. Push all detail, landmarks and
bright elements to the outer edges and corners.
Mood: night-time, deep #050814 shadows, neon accent lighting, gentle atmospheric haze.
Output 1920×1080, 16:9. No text, no UI elements, no characters, no game pieces.

THEME LINE — pick one:
  MAGIC FOREST   — enchanted emerald pine forest, glowing mushrooms, fireflies,
                   a moonlit stream, emerald #10B981 and teal light.
  NAIJA VILLAGE  — a warm West African village at dusk: thatched round huts, palm
                   trees, red-earth paths, market canopies, lanterns, gold #FFD000
                   and amber light, a big low moon.
  SAHARA DESERT  — moonlit dunes, a camel caravan silhouette on the horizon, ancient
                   ruined pillars, terracotta #FF5722 and deep orange light.
  ARCTIC SNOW    — frozen tundra, ice floes, aurora borealis overhead, snow-laden
                   pines, cyan #00F0FF and pale blue light.
  VOLCANO LAVA   — black volcanic rock, glowing lava rivers, ember sparks in the air,
                   an erupting cone at the far edge, red and terracotta #FF5722 light.
  GALACTIC VOYAGE— deep space, a ringed planet, nebula clouds, distant starfield,
                   indigo and cyan #00F0FF light.
  NEON CYBERPUNK — a rain-slick futuristic city grid from above, holographic signage,
                   neon pink #FF4757 and cyan #00F0FF reflections.
```

---

### D. Mini-game cards  →  `public/minigames/<id>.jpg`, 1024×768 (4:3)

The ten games in `ELIGIBLE_GAMES` (`src/components/TeamBattleGameSelect.tsx`). Cards for
the game-select screen, so a bit of scene is good — unlike icons.

```
[STYLE BLOCK]

Generate a game-mode card illustration, 4:3, 1024×768: [SCENE].
Composition: single clear focal subject, centred, dark navy #0B132B to #050814
vignette at the edges so white UI text stays readable over the top and bottom thirds.
No text, no letters, no numbers, no logos.

SCENE — pick one:
  VOICE ARENA      — a glowing gold stage microphone in a spotlight, cyan sound rings
                     radiating outward in a dark arena.
  PITCH BIRD       — a cute chubby cyan bird flying through a canyon of glowing
                     sound-wave bars, gold trail behind it.
  SOLFEGE          — glowing musical notes rising up a neon staircase of light,
                     emerald and cyan.
  TRUTH OR BLUFF   — two theatre masks, one gold and honest, one hot-pink and sly,
                     facing each other across a dark table.
  SPELLING BEE     — a friendly cartoon bee in gold and black hovering over glowing
                     alphabet blocks with blank faces (no letters drawn).
  STORY BUILDER    — an open glowing book with a ribbon of light unspooling out of it
                     into small floating scenes.
  DEBATE           — a pair of brass balance scales, one pan cyan and one hot pink,
                     spotlit on a debate podium.
  GUESS THE VOICE  — a detective silhouette in a trench coat and hat holding a
                     magnifying glass up to a glowing sound waveform.
  TRIVIA SHOWDOWN  — a glowing brain made of circuitry with a gold buzzer button in
                     front of it, cyan energy arcs.
  ASTEROID DEFENSE — a small ship firing gold energy bolts at incoming asteroids,
                     deep space, cyan explosions.
```

---

### E. Characters & avatars  →  `public/avatars/`

The eight existing characters live in `src/lib/gameContent.ts` as `AVATARS`, each with a
`cardUrl` (~264×301 portrait card) and a `faceUrl` (square crop). Match them exactly:
**upload `public/avatars/paul.jpg` as the reference every time.**

**E1 — a new character**

```
[STYLE BLOCK]
[UPLOAD public/avatars/paul.jpg AND SAY: "match this exact illustration style,
 rendering, lighting and framing"]

Generate a character portrait card in the same style as the reference image.

Character: [NAME] — [AGE/BUILD], [SKIN TONE], [HAIR / HEADWEAR], [OUTFIT], [EXPRESSION
— e.g. a confident half-smile], [ONE PROP].
Framing: head and upper chest, facing camera, warm smile, eyes to the lens.
Behind the head: a large glowing oval halo in [ACCENT HEX], exactly like the reference.
Card: rounded rectangle, dark navy #0B132B border, portrait 2:3.
Top-left corner: a small gold circular badge with a simple [ROLE SYMBOL] emblem.
No text, no name plate, no letters.
Output 1024×1536.
```

Existing accents to reuse or avoid clashing with: Paul `#FFD000`, Chibuike `#10B981`,
Victor `#A855F7`, Samuel `#38BDF8`, Michael `#EF4444`, Tunde `#EC4899`, Chibuzor
`#F59E0B`, Emeka `#F97316`.

**E2 — the missing robot avatar** (the code already points at `/avatars/robot_face.jpg`
for the "Deep Star" chess/AI bot in `src/app/api/room/[roomId]/route.ts`, and the file
does not exist — this one is a live broken image, not a nice-to-have)

```
[STYLE BLOCK]
[UPLOAD public/avatars/paul.jpg — "match this style and framing"]

Generate a character portrait in the reference style: a friendly AI robot opponent
called Deep Star. Chrome-and-navy head with soft rounded edges, a single wide visor
face glowing cyan #00F0FF, a small gold antenna, faint circuit tracery on the temples,
a calm confident expression. Behind the head: a glowing cyan oval halo.
Square 1:1 crop, head and shoulders, centred. No text.
Output 512×512.
```

**E3 — the expression sheet** (the `AvatarExpression` type wants `normal`, `talking`,
`surprised`, `sweating`, `laughing` — five faces per character)

```
[STYLE BLOCK]
[UPLOAD the character's existing face crop, e.g. public/avatars/paul_face.jpg]

Generate ONE image: a 5-column × 1-row sheet of the SAME character from the reference,
same face, same hair, same clothing, same lighting, same halo colour, changing only
the expression:
1. NEUTRAL — calm, relaxed half-smile, mouth closed.
2. TALKING — mouth open mid-word, eyebrows lifted, animated.
3. SURPRISED — wide eyes, raised brows, small open mouth.
4. SWEATING — nervous grin, one sweat drop on the temple, eyes glancing sideways.
5. LAUGHING — head tipped back, eyes squeezed shut, big open laugh.
Each face square, identical crop and scale. No text.
Output 2560×512.
```

---

### F. App icon, PWA & social  →  `public/`

Replacing `icon-192.png` / `icon-512.png` (currently a flat gold mic on navy).

```
[STYLE BLOCK]

Generate a mobile app icon: a bold gold #FFD166 stage microphone, front-facing,
centred, with two cyan #00F0FF sound-wave arcs curving out from either side, on a
deep cosmic navy #050814 rounded-square background with a soft radial glow behind
the mic and a scatter of tiny distant stars.
Flat-but-glossy modern app-icon style, thick readable silhouette, no bevelled 3D.
IMPORTANT: keep all artwork inside the centre 80% of the frame — the outer 10% on
every side must be empty background so the icon survives circular masking on Android.
Perfect square, 1024×1024. No text, no letters, no app-store framing or mockup.
```

Export at 1024 → downscale to `icon-512.png`, `icon-192.png`, plus a 180×180
`apple-touch-icon.png` and a `favicon.ico`. Add `"purpose": "maskable"` entries in
`public/manifest.json` once you have the safe-zone version.

**Social share card** (`public/og-image.png`, 1200×630 — what shows in WhatsApp when
someone shares a room link):

```
[STYLE BLOCK]

Generate a 1200×630 social share banner: four stylised party-game characters
(diverse, West African and international, joyful) leaning in around a huge glowing
gold microphone in the centre, confetti and neon sound-waves flying outward, deep
cosmic navy #050814 background with a starfield.
Leave the lower third darker and emptier for a text overlay.
No text, no letters, no logos in the image itself.
```

---

### G. Board furniture — dice, tokens, teams, ranks

```
[STYLE BLOCK]

Generate ONE image, a 3×2 grid of six game pieces, identical lighting and scale:
1. A glossy gold #FFD166 six-sided die, 3/4 view, showing a 5-pip face, navy pips.
2. A cyan #00F0FF six-sided die, same angle, showing a 3-pip face.
3. A teardrop map-pin player token, gold rim, empty dark circular window in the middle
   for a player photo, soft glow underneath.
4. RED CREW emblem — a circular team crest, red #EF4444, a stylised flame + mic motif.
5. BLUE CREW emblem — the same crest shape, sky blue #38BDF8, a lightning + mic motif.
6. A gold laurel-wreath rank badge, empty in the centre, first-place feel.

Background: transparent, or pure #000000 flat black.
No text, no numbers on the badges. Output 1536×1024.
```

---

### H. Space-theme replacements  →  `public/images/*.png`

`MapRenderer.tsx` currently loads `planet_ringed.jpg`, `glowing_sun.jpg`,
`asteroids.jpg`, `satellite.jpg`, `space_station.jpg`, `teleport_portal.jpg` as JPEGs
and hides their square backgrounds with `mix-blend-screen` + a radial CSS mask. That's a
workaround for JPEG having no alpha, and it dims the art. Regenerating these as PNGs on
pure black lets you drop the mask later:

```
[STYLE BLOCK]

Generate a single space object on a pure #000000 black background — flat black, no
nebula, no stars, no gradient, no vignette, nothing but the object:
[ONE OF: a ringed gas giant planet, tilted, cyan and violet bands
       | a glowing golden sun with a soft corona
       | a cluster of grey-brown asteroids
       | a satellite with gold foil and cyan solar panels
       | an orbital space station, ring-shaped, lit windows
       | a swirling teleport portal, cyan and magenta vortex]
Centred, filling ~80% of the frame, square 1:1, stylised semi-3D game art.
Output 1024×1024 PNG. No text, no starfield, no background scenery.
```

---

## 4. What to do with the files afterwards

1. **Check the background is really gone.** Open the PNG on a white page. If you see a
   black box, it isn't transparent — run it through a background remover, or keep it
   black and rely on `mix-blend-screen`.
2. **Resize before committing.** Gemini gives you 1024–2048 px. A 40 px sidebar icon
   does not need 2048 px — it just makes the game slower to load on mobile data.
   `npx sharp-cli` or Squoosh will do it.
3. **Name files after the code's ids**, not after what you see: `boost.png`, not
   `rocket-nitro-final-v2.png`. The ids are in `gameRules.ts`, `types.ts`,
   `themeConfig.ts`.
4. **Where each one wires in:**
   - Power-ups → add an `image` field beside `icon` in `POWERUP_SHOP` (`src/lib/gameRules.ts`)
   - Tiles → add an `iconUrl` beside `icon` in each theme's `nodeColors` (`src/lib/themeConfig.ts`)
   - Themes → reference from `MapRenderer.tsx`, the way `space` already does
   - Avatars → `AVATARS` in `src/lib/gameContent.ts` (`faceUrl` + `cardUrl`)
   - App icons → `public/manifest.json` and `src/app/layout.tsx`
5. **Keep emoji as the fallback.** Every one of those fields is a string the UI already
   renders. Add the image path as a *new* field and fall back to the emoji when the
   image is missing — the same way `AvatarIllustration.tsx` already falls back when an
   avatar image fails to load. That way half-finished art never leaves a blank hole.

---

## 5. Asset gaps found in the code

Worth knowing before you start generating:

- **`/avatars/robot_face.jpg` does not exist.** It's referenced twice in
  `src/app/api/room/[roomId]/route.ts` for the "Deep Star" AI opponent, so that avatar
  is a broken image today. §E2 generates it.
- **Space art is JPEG.** Six files in `public/images/` are square JPEGs shown through a
  `mix-blend-screen` + radial-mask trick, which is why they look washed out. §H fixes it.
- **Every tile and power-up icon is an emoji string.** They render differently on
  Android, iOS and Windows — the game looks like a different product on each. §A and §B
  are the fix, and step 4.5 above is how to land it without a big-bang rewrite.

---

# PART TWO — Emoji → real art: the complete replacement set

An audit of `src/` found **114 distinct emoji in 405 places**. They are not all the
same kind of thing, and that decides how each one gets replaced:

| Group | What it is | How to replace it | Count |
| --- | --- | --- | --- |
| **A. Game iconography** | Data-driven icons in arrays — tiles, power-ups, modes, vibes, dares | **Generated PNG art** — §6 below | ~90 slots |
| **B. UI chrome** | Functional controls — mic, mute, settings, lock, tick, cross, back | **A vector icon library, not AI art** — §7 | ~20 slots |
| **C. Inline text** | Emoji inside sentences: event-log lines, AI-host chatter, coaching labels | **Leave as emoji** — §8 | ~250 uses |

Getting this split right matters more than the art itself. Generating a raster
"settings gear" is strictly worse than an SVG one — it blurs when scaled, it can't
inherit colour on hover, and it costs a network request. And turning
`"🔥 Sammy is on a roll!"` into an image breaks screen readers and copy-paste for no
gain. **Generate art for things that carry game identity; use vectors for controls;
leave prose alone.**

---

## 6. Group A — the generation sheets

Nine sheets, ~90 icons. Each one is a single Gemini prompt producing a grid you slice.
Prompts assume the Style Block from §1 is pasted above them — that's what keeps sheet 9
looking like sheet 1.

Sheets 1 and 2 are already written up as **§A (power-ups)** and **§B (board tile types)**
above. Here are the other seven.

---

### Sheet 3 — Journey tiles  →  `public/tiles/journey/*.png`, 256×256

Source: `TILE_ICONS` in `src/lib/boardGraph.ts` (10 icons). These mark what a space on
the road *does*, so each needs an instantly readable silhouette. Glyph only — the CSS
draws the coloured disc behind it.

```
[STYLE BLOCK]

Generate ONE image: a 5-column × 2-row grid of ten game-board space markers on a single
canvas, evenly spaced, identical scale, identical lighting, each centred in its own
invisible square cell. SYMBOLS ONLY — do not draw a circle, disc, plate or badge behind
any of them.

1.  MINIGAME    — a stage microphone with two curved sound waves, gold #FFD166 body,
                  cyan #00F0FF waves.
2.  AI CHALLENGE— a friendly robot head, rounded navy #0B132B casing, single wide cyan
                  #00F0FF visor, small gold antenna.
3.  TREASURE    — a cut gemstone, brilliant facets, cyan #00F0FF core with gold rim light.
4.  TRAP        — a steel bear-trap seen from above, jaws sprung open, terracotta
                  #FF5722 teeth, faint red danger glow.
5.  MYSTERY     — a bold rounded question mark, glossy gold #FFD166, one small sparkle.
6.  SHOP        — a market stall awning with gold and navy stripes above a small counter,
                  warm gold light underneath.
7.  SPLIT ROUTE — a road forking into two glowing paths, seen in perspective, emerald
                  #10B981 left branch and hot pink #FF4757 right branch.
8.  TELEPORT    — a swirling spiral vortex seen face-on, cyan #00F0FF outer arms winding
                  into a bright white core.
9.  VOLCANO     — a small erupting volcano cone, terracotta #FF5722 lava, ember sparks.
10. FINISH      — a victory trophy cup with handles, thick gold #FFD166, star on the bowl,
                  soft golden glow.

Background: transparent, or pure #000000 flat black.
Bold silhouettes, must read at 24×24 px. No text, no letters, no numbers.
Output 2560×1024.
```

Slice → `minigame.png`, `ai_challenge.png`, `treasure.png`, `trap.png`, `mystery.png`,
`shop.png`, `split_route.png`, `teleport.png`, `volcano.png`, `finish.png`.

---

### Sheet 4 — Tile event bursts  →  `public/events/*.png`, 512×512

Source: `EVENT_STYLES` in `src/components/TileEventOverlay.tsx` (12 icons). These fire
as a big animated overlay when you land on something, so unlike the tile glyphs they
**should** be dramatic — energy, motion, impact.

```
[STYLE BLOCK]

Generate ONE image: a 4-column × 3-row grid of twelve dramatic game-event icons on a
single canvas, identical scale and lighting, each centred in its own invisible square
cell. These are impact moments — give each one motion, energy and glow, but keep the
silhouette clean.

1.  WORMHOLE     — a violet-and-indigo spiral tunnel viewed head-on, receding rings,
                   bright core.
2.  ASTEROID     — a burning meteor streaking diagonally, terracotta #FF5722 fire trail.
3.  SHIELD BLOCK — a gold kite shield with a cyan energy dome flaring on impact, small
                   deflection sparks at the point of contact.
4.  SHIELD GAIN  — a satellite with gold foil body and cyan solar panels, beaming a soft
                   protective cone of light downward.
5.  SHIELD UP    — the same gold kite shield rising, calm steady emerald #10B981 aura,
                   no impact sparks.
6.  SUPPLY DROP  — a wooden crate under a small gold parachute, drifting down.
7.  DARE         — a stage microphone in a hot pink #FF4757 spotlight cone, sound rings
                   radiating outward.
8.  DUEL         — two crossed sabres clashing, spark burst at the crossing point,
                   terracotta and gold.
9.  FINISH       — a gold trophy erupting with confetti and light rays.
10. BOOST        — a rocket climbing steeply, cyan #00F0FF flame, speed streaks behind.
11. FREEZE       — a large crystalline snowflake with ice shards spreading from it,
                   cyan #00F0FF, cold vapour.
12. BOMB         — a black cartoon bomb mid-detonation, hot pink #FF4757 blast ring
                   bursting outward from it.

Background: transparent, or pure #000000 flat black.
No text, no letters, no numbers. Output 2048×1536.
```

Slice → `wormhole.png`, `asteroid.png`, `shield_block.png`, `shield_gain.png`,
`shield_up.png`, `supply_drop.png`, `dare.png`, `duel.png`, `finish.png`, `boost.png`,
`freeze.png`, `bomb.png`.

---

### Sheet 5 — Dare styles  →  `public/dares/*.png`, 256×256

Source: `DARE_STYLES` in `src/lib/gameContent.ts` (8 icons). These are the performance
styles a player can be forced into — the funniest part of the game, so let the art be
funny too.

```
[STYLE BLOCK]

Generate ONE image: a 4×2 grid of eight comedic performance-style icons on a single
canvas, identical scale and lighting, each centred in its own invisible square cell.
Playful and expressive, slightly exaggerated, like party-game category badges.

1. SING IT              — a microphone with musical notes spiralling up out of it, gold
                          and cyan.
2. ACCENT CHALLENGE     — a speech bubble with a mouth and stylised sound waves inside,
                          hot pink #FF4757 outline.
3. DRAMATIC READING     — twin theatre masks, one gold, one navy, slightly overlapping.
4. WHISPER MODE         — a hand cupped beside an open mouth, tiny quiet sound wisps,
                          muted cyan.
5. TONGUE TWISTER       — a lightning bolt striking through a curled tongue shape, gold
                          #FFD166 bolt, pink tongue.
6. ANGRY MARKET WOMAN   — a woven market basket with produce, an emphatic pointing hand
                          beside it, warm terracotta #FF5722.
7. NEWS REPORTER        — a boxy retro TV set with a handheld reporter's mic in front of
                          it, cyan screen glow.
8. NOLLYWOOD CRYING     — a single dramatic teardrop with a film-clapperboard corner
                          behind it, deep navy and gold.

Background: transparent, or pure #000000 flat black.
Must read at 32×32 px. No text, no letters, no numbers, no faces with realistic detail.
Output 2048×1024.
```

Slice → `sing.png`, `accent.png`, `dramatic.png`, `whisper.png`, `twister.png`,
`market.png`, `news.png`, `crying.png`.

---

### Sheet 6 — Room vibes  →  `public/vibes/*.png`, 512×512

Source: `ROOM_VIBES` in `src/lib/roomVibes.ts` (5). These set the tone of a whole room,
so they can be richer than a flat glyph — small scenes, badge-like.

```
[STYLE BLOCK]

Generate ONE image: a 5-column × 1-row strip of five room-mood badges on a single
canvas, identical scale and lighting, each centred in its own invisible square cell.
Each is a small glossy emblem, richer than a flat icon but still a single clear shape.

1. CLASSIC PARTY       — a party popper bursting with gold #FFD166 and cyan confetti.
2. GETTING TO KNOW YOU — two overlapping speech bubbles with a small warm gold heart
                         where they meet.
3. BROS HANGOUT        — two beer bottles clinking, amber glass, gold highlights, small
                         impact sparkle.
4. ANIME SQUAD         — a stylised narutomaki fish-cake swirl, pink and white, with two
                         small anime-style sparkle stars beside it.
5. FLIRTY & WILD       — a stylised flame with a subtle heart shape inside it, hot pink
                         #FF4757 into gold gradient.

Background: transparent, or pure #000000 flat black.
No text, no letters, no numbers. Output 2560×512.
```

Slice → `classic_party.png`, `getting_to_know.png`, `bros_hangout.png`,
`anime_squad.png`, `flirty_wild.png`.

---

### Sheet 7 — Role badges  →  `public/badges/*.png`, 256×256

Source: the `role` / `emoji` fields on `AVATARS` in `src/lib/gameContent.ts` (6 distinct
roles across 8 characters). These sit on the avatar card's gold corner disc — so this
time, **do** draw the disc, matching the badge already on `public/avatars/paul.jpg`.

```
[STYLE BLOCK]
[UPLOAD public/avatars/paul.jpg — "match the small gold corner badge in this image"]

Generate ONE image: a 3×2 grid of six circular character-role badges on a single canvas,
identical size and lighting. Each is a gold #FFD166 circular medallion with a subtle
raised rim and a dark navy #0B132B emblem inset in the centre — matching the badge in
the reference image.

1. LEADER      — a five-point crown.
2. DEFENDER    — a kite shield.
3. SPEEDSTER   — a rocket tilted 45°.
4. STRATEGIST  — a target with an arrow in the bullseye.
5. SUPPORT     — a five-point star.
6. PLAYMAKER   — a running figure in motion.

Emblems must be simple, solid and readable at 20×20 px.
Background: transparent, or pure #000000 flat black.
No text, no letters, no numbers. Output 1536×1024.
```

Slice → `leader.png`, `defender.png`, `speedster.png`, `strategist.png`, `support.png`,
`playmaker.png`.

---

### Sheet 8 — Game mode cards  →  `public/modes/*.png`, 512×512

Source: the mode tiles in `src/components/RoomLobby.tsx` (lines ~480–710). These are the
biggest buttons on the lobby screen — the first thing a new player sees — so they get
the most visual weight of any icon in the game.

```
[STYLE BLOCK]

Generate ONE image: a 4-column × 2-row grid of seven bold game-mode emblems on a single
canvas, identical scale and lighting, each centred in its own invisible square cell.
Leave the 8th cell empty. These are large hero icons for big tappable menu cards —
chunky, confident, high contrast.

1. ROADMAP BOARD  — a pair of gold #FFD166 dice resting on a winding neon board path
                    that recedes into the distance.
2. VOICE ARENA    — a gold stage microphone inside a ring of cyan #00F0FF sound waves.
3. PARTY MODE     — two beer bottles clinking amid gold confetti and a burst of light.
4. AI MASTER      — a robot head with a cyan #00F0FF visor wearing a small gold crown.
5. TEAM BATTLE    — two crossed sabres over a split shield, one half red #EF4444, the
                    other half sky blue #38BDF8.
6. CHESS          — a chess knight in profile, glossy navy #0B132B with gold rim light.
7. LUDO           — four ludo tokens in red, blue, emerald and gold arranged around a
                    single die.

Background: transparent, or pure #000000 flat black.
Must read at 64×64 px. No text, no letters, no numbers. Output 2048×1024.
```

Slice → `board.png`, `voice.png`, `party.png`, `ai_master.png`, `team_battle.png`,
`chess.png`, `ludo.png`.

---

### Sheet 9 — Soundboard, reactions & AI Master rounds  →  `public/social/*.png`, 256×256

Sources: `SOUNDBOARD` + `REACTIONS` in `src/components/RoastIntermission.tsx` and the
round-type labels in `src/components/AiMasterGame.tsx` (15 icons). The soundboard six
are deliberately Nigerian — keep that; it's the personality of the room.

```
[STYLE BLOCK]

Generate ONE image: a 5-column × 3-row grid of fifteen small social-interaction icons on
a single canvas, identical scale and lighting, each centred in its own invisible square
cell.

Row 1 — SOUNDBOARD (Nigerian street sounds):
 1. DANFO HORN      — a bus air-horn, chrome and gold, sound bursts from the mouth.
 2. GENERATOR REV   — a small portable generator, terracotta #FF5722 body, exhaust puff.
 3. VENDOR BELL     — a hand bell mid-swing, brass, motion arcs on both sides.
 4. NOLLYWOOD BRASS — a brass trumpet angled up, gold, three musical notes leaving it.
 5. CHOI CHIME      — a four-point sparkle with a small chime bar behind it, cyan.

Row 2 — REACTIONS:
 6. LAUGH   — a rounded speech bubble with a wide laughing mouth and a tear of laughter.
 7. FIRE    — a clean stylised flame, hot pink #FF4757 into gold #FFD166.
 8. APPLAUD — two hands clapping with small impact lines, warm gold.
 9. DRAMA   — a single theatre mask tilted, gold face, navy features.
10. ALARM   — a rotating warning beacon, red dome, light beams sweeping out.

Row 3 — AI MASTER ROUNDS:
11. TRUTH   — a hand over a mouth, wide eye above it, cyan #00F0FF accent.
12. DARE    — twin theatre masks with a small lightning bolt between them.
13. TRIVIA  — a stylised brain made of glowing circuit lines, cyan on navy.
14. STORY   — an open book with a ribbon of light rising from the pages, gold.
15. BRIBE   — two hands shaking, gold coin glinting above the handshake.

Background: transparent, or pure #000000 flat black.
Must read at 28×28 px. No text, no letters, no numbers. Output 2560×1536.
```

Slice → `horn.png`, `gen.png`, `bell.png`, `brass.png`, `choi.png`, `laugh.png`,
`fire.png`, `almost.png`, `drama.png`, `whaala.png`, `truth.png`, `dare.png`,
`trivia.png`, `story.png`, `bribe.png`.

---

### Sheet 10 — Theme selector icons  →  `public/themes/icons/*.png`, 256×256

Source: the `icon` field on each theme in `src/lib/themeConfig.ts` (7). Small circular
world-emblems for the theme picker.

```
[STYLE BLOCK]

Generate ONE image: a 4×2 grid of seven circular world emblems on a single canvas,
identical size and lighting. Leave the 8th cell empty. Each is a small round scene
medallion — a landscape vignette inside a soft circular vignette, no hard border ring.

1. MAGIC FOREST    — glowing emerald pines with a floating firefly.
2. NAIJA VILLAGE   — a thatched round hut beside a palm tree at golden dusk.
3. SAHARA DESERT   — moonlit dunes with a lone cactus silhouette.
4. ARCTIC SNOW     — a snow-capped peak under a cyan aurora ribbon.
5. VOLCANO LAVA    — an erupting cone with glowing terracotta #FF5722 lava.
6. GALACTIC VOYAGE — a ringed planet against a starfield.
7. NEON CYBERPUNK  — a neon city skyline in hot pink #FF4757 and cyan #00F0FF.

Background: transparent, or pure #000000 flat black.
Must read at 32×32 px. No text, no letters, no numbers. Output 2048×1024.
```

Slice → `forest.png`, `village.png`, `desert.png`, `snow.png`, `volcano.png`,
`space.png`, `cyberpunk.png`.

---

### Sheet 11 (optional) — Per-theme landmark scatter  →  `public/themes/<theme>/*.png`

Source: the `landmarks` object per theme in `themeConfig.ts` — `trees`, `water`,
`hills`, `special`, scattered as decoration across the board. Six themes × 4 = 24 pieces.
Lowest priority: they're background dressing, and the `space` theme already uses real
images for this. Run this once per theme, substituting the four subjects:

```
[STYLE BLOCK]

Generate ONE image: a 4×1 strip of four board-decoration props for the [THEME NAME]
theme, identical scale and lighting, each centred in its own invisible square cell.
Small isometric 3/4 scenery pieces that will be scattered across a game board.

Subjects: [TREES], [WATER], [HILLS], [SPECIAL]

  forest    → glowing pine tree | a rushing stream bend | a mossy rock outcrop | a cluster of glowing mushrooms
  village   → a tall palm tree  | a reed-lined river bend | a thatched round hut | a gold chief's crown on a cushion
  desert    → a saguaro cactus  | a resting camel        | a sand dune ridge     | a blazing low sun
  snow      → a snow-laden pine | a floating ice floe    | a jagged ice peak     | a snowman with a scarf
  volcano   → a charred bare tree | a lava flow bend     | a cracked basalt boulder | an ember burst
  cyberpunk → a neon signage tower | an electric arc conduit | a rooftop block cluster | a small service robot

Background: transparent, or pure #000000 flat black.
No text, no letters, no numbers. Output 2048×512.
```

---

## 7. Group B — UI chrome: use vectors, do NOT generate these

These emoji are **controls**, not art: mic on/off, mute, settings, lock, tick, cross,
back, leave, copy, search, user, users, flag, refresh, plug, bell, lightbulb, coin,
compass, medal. Found across `GameHeader.tsx`, `VoiceCallBar.tsx`, `LeftSidebar.tsx`,
`RoomLobby.tsx`, `AiMasterGame.tsx`, `ChessGame.tsx`, `page.tsx`.

Generating them as PNGs would be a mistake: a control icon has to stay razor-sharp at
16 px, flip colour on hover and focus, respond to `currentColor`, and never cost an HTTP
request. Raster art does none of that. Install a vector set instead:

```bash
npm install lucide-react
```

Then the mapping is direct:

| Emoji | Where | lucide-react |
| --- | --- | --- |
| 🎙️ 🎤 | mic button, header | `Mic` |
| 📴 🚫 | muted state | `MicOff` |
| 🔊 | soundboard / volume | `Volume2` |
| 🔒 | locked mode card | `Lock` |
| ✅ | survived / confirm | `Check` / `CircleCheck` |
| ❌ | failed / dismiss | `X` / `CircleX` |
| 🔄 | rematch / retry | `RotateCw` |
| 👋 | leave room | `LogOut` |
| 🔌 | disconnected | `Unplug` |
| 👤 👥 | player / team count | `User` / `Users` |
| 🏳️ | resign | `Flag` |
| 🥇 🏆 | winner (in UI chrome) | `Trophy` |
| 🧭 | navigation / map legend | `Compass` |
| 💡 | tip line | `Lightbulb` |
| 💬 | chat | `MessageCircle` |
| 🔍 | search / spectate | `Search` |
| 💸 | cost / price | `Coins` |
| 🔔 | notification | `Bell` |
| → ↑ ⬆ ⬇ | arrows in labels | `ArrowRight` / `ArrowUp` / `ArrowDown` |

They inherit Tailwind colour classes directly: `<Mic className="w-5 h-5 text-partyYellow" />`.

---

## 8. Group C — leave these alone

Roughly 250 of the 405 uses are emoji **inside sentences**:

- `src/app/api/room/[roomId]/route.ts` (87) — event-log lines like
  `🔥 ${name} is on a roll!`
- `src/lib/aiGameMaster.ts` (26) — AI host banter
- `src/components/PitchBirdCanvas.tsx` (16) — canvas coaching labels
  (`RAISE VOICE ⬆️`), drawn with `ctx.fillText`
- WhatsApp invite text, section headings, mode blurbs

Converting these to images would cost you: screen readers lose them, users can't copy
the text, WhatsApp invites break, and `ctx.fillText` can't draw a PNG anyway. Emoji are
the right tool for text-flow decoration. **Leave them.**

---

## 9. Suggested order of work

You do not need all nine sheets before shipping anything. Highest visual return first:

1. **Sheet 8 — mode cards.** Biggest elements on the first screen a new player sees.
2. **§B — tile types** and **Sheet 3 — journey tiles.** The board is the game; this is
   where cross-platform emoji drift is most obvious.
3. **§A — power-ups.** Shown large in the shop and the inventory rail.
4. **Sheet 4 — event bursts.** Full-screen moments, so a low-quality emoji reads worst here.
5. **Sheet 7 — role badges** and **Sheet 6 — vibes.** Small, but they sell the identity.
6. **Sheets 5, 9, 10, 11.** Polish.

Do Group B (§7 lucide) in one pass whenever you like — it's a dependency install and a
find-replace, no art needed, and it makes the interface look tidier on its own.

---

## 10. Two inconsistencies worth fixing while you're in there

- **`solfege` is called two different things.** `RoomLobby.tsx` labels it *"Karaoke"*,
  `TeamBattleGameSelect.tsx` labels it *"Solfege"*, and the two files keep separate
  hard-coded game lists that have already drifted apart (the lobby list is missing
  `story_builder`, `debate` and `guess_the_voice`). One shared `MINI_GAMES` array in
  `src/lib/gameContent.ts` — id, label, blurb, icon, image — would fix the drift and give
  every sheet above a single place to land.
- **Two `🎯 STRATEGIST`s and two shield-badge roles.** Samuel and Chibuzor share
  Strategist; Chibuike is `🛡️ DEFENDER` while Emeka is `🛡️ PLAYMAKER` (mismatched emoji
  and label). Worth deciding whether roles are unique before art is drawn for them.
