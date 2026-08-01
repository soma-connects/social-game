# Deploying

## The turn loop

The board is the main game; the voice rounds are the qualifying mini-games that
feed it. Each turn runs:

1. **Mini-game** — Voice Arena or PitchBird, picked at random per turn from
   whatever the host enabled in the lobby.
2. **Points + movement** — the score is banked as points *and* converted into
   board steps. The dice is a reveal of what was earned, not a random roll.
3. **Buff shop** — points are the currency, so buying is a trade-off against
   staying top of the table.
4. **Board move** — tile effects, dares, powerups.

Score → steps lives in `performanceToSteps` in `src/lib/gameRules.ts`. The two
mini-games score on different scales (`MINIGAME_MAX_SCORE`), so both are
normalised to 0..1 before mapping. Adjust those two together if you retune
either game — and note the server derives which mini-game was played from room
state, never from the client, so a PitchBird score cannot be graded on the voice
scale.


## Cloud Run must run as a single instance

Rooms, the event feed and the WebRTC signalling mailboxes all live in the memory
of one container. There is no database. If Cloud Run scales to two instances,
players get load-balanced across them and end up in different copies of the same
room — one player rolls the dice and nobody else sees it.

Deploy with the instance count pinned:

```bash
gcloud run deploy voice-party-roadmap-game --source . --region us-central1 --allow-unauthenticated --min-instances=1 --max-instances=1
```

`--min-instances=1` also keeps the container warm, so open rooms survive between
turns instead of being wiped by a scale-to-zero.

Known limit: a container restart (a redeploy, or a crash) still drops every open
room. Players see "ROOM … IS NOT OPEN" and start a new one. Moving room state to
Firestore or Redis is the fix if that becomes a problem.

## Voice chat and TURN

Group voice is WebRTC in a full mesh, signalled over `/api/room/[roomId]/signal`.
It uses Google's public STUN servers, which cover most home and office networks.

Players behind symmetric NAT — common on mobile carrier networks — cannot connect
peer-to-peer with STUN alone and need a TURN relay. When that happens the voice
bar shows "A peer could not connect directly." To fix it, add a TURN server to
`ICE_SERVERS` in `src/lib/voiceChat.ts`:

```ts
const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302'] },
  { urls: 'turn:YOUR_TURN_HOST:3478', username: '…', credential: '…' },
];
```

TURN relays media, so it costs bandwidth. Managed options (Twilio, Metered,
Cloudflare Calls) have free tiers that comfortably cover a party game.

## PitchBird flight model

Pitch commands **position**, not acceleration. `usePitchDetection` maps the
player's calibrated vocal range to a `lift` value of 0..1; `PitchBirdCanvas`
turns that into a target height and pulls the bird toward it with a damped
spring (`SPRING` / `DAMPING`).

Do not reintroduce gravity plus a lift force. That makes the player steer
acceleration — a double integrator — so holding a steady note produces constant
net force and flies you into the ceiling instead of hovering. Only two heights
are reachable that way: floor and ceiling.

The pitch signal is stabilised in three stages, and the order matters:

1. **Octave correction** against the running median. Autocorrelation regularly
   reports half or double the true frequency.
2. **Median filter** (`MEDIAN_WINDOW`) to reject outliers outright. Smoothing
   before this step would blend bad readings in permanently.
3. **EMA** (`SMOOTH_FACTOR`) for the final glide.

Unvoiced frames hold the last note for `UNVOICED_HOLD_MS` so a breath does not
drop the player out of the sky.

**Tuning speed:** `MAX_VY` is the effective control, not `SPRING`. Velocity is
clamped for almost the whole of a full-band traversal, so the spring rarely gets
to act. Lower `MAX_VY` to slow the bird; changing `SPRING` alone does very
little.

**Gate geometry:** gates are built from the safe zone outward — pick the lift
window the player must hold, then derive the walls — never by placing walls in
raw canvas coordinates. Doing the latter previously produced a "RAISE VOICE"
gate whose safe zone excluded the top of the player's range, and made the
highest note fatal on every gate type. Any new gate type must leave a reachable
window inside `[TOP_MARGIN + PLAYER_RADIUS, CANVAS_H - BOTTOM_MARGIN -
PLAYER_RADIUS]`, and no narrower than roughly 60px to absorb the spring's
overshoot.

## Regenerating avatar art

The square portrait crops (`public/avatars/<id>_face.jpg`) are generated from the
character art (`public/avatars/<id>.jpg`):

```bash
pwsh ./scripts/crop-avatar-faces.ps1
```

Pass a directory to preview the crops before overwriting:

```bash
pwsh ./scripts/crop-avatar-faces.ps1 ./preview
```

Crop framing per character is the `cx` / `cy` / `side` table at the top of that
script. Adjust it if the art is ever replaced.
