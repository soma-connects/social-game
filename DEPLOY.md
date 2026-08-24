# Deploying

## Vercel (current)

GCP billing got interrupted, so Vercel is the deployment target for now. The
game's room/signalling state used to live in one process's memory, which only
worked because Cloud Run was pinned to a single container — Vercel gives no
such pinning, so that state was moved to Redis (`src/lib/server/roomServer.ts`,
via `@upstash/redis`). Every server instance now reads/writes the same store,
so this works correctly on Vercel's stateless functions (and, as a side
effect, removes the old single-instance requirement from the Cloud Run path
below too).

Setup:

1. Import the repo into a Vercel project (zero-config — it's a standard
   Next.js app, `next build` / `next start`).
2. Add a Redis database: **Storage → Marketplace → Upstash → Redis** in the
   Vercel dashboard, and connect it to this project. That injects
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` into the project's
   environment automatically — `Redis.fromEnv()` picks them up with no extra
   config.
3. Deploy. No instance-count flags needed.

For local dev, copy the same two env vars into `.env.local` (pull them from
the Vercel project, or from Upstash's own dashboard if you created the
database directly). Without them, `npm run dev` still boots and pages render,
but any `/api/room/*` call will fail — the routes need a real Redis instance
to talk to.

## Cloud Run (on hold)

Kept in case billing gets sorted out and GCP is worth returning to — the
`Dockerfile`, `.gcloudignore` and the steps below still work. Set the same
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` env vars on the Cloud
Run service (`--set-env-vars` or via Secret Manager); the old
`--min-instances=1 --max-instances=1` pin is no longer required since state
lives in Redis now, not in the container:

```bash
gcloud run deploy voice-party-roadmap-game --source . --region us-central1 --allow-unauthenticated
```

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


## Room state lives in Redis

Rooms, the event feed and the WebRTC signalling mailboxes are all stored in
Redis (`src/lib/server/roomServer.ts`), keyed by room id with a 6-hour TTL
that refreshes on every write. See the **Vercel** section above for the env
vars this needs. A room only disappears if it goes untouched for 6 hours —
a redeploy or a crashed instance no longer drops open rooms, since nothing
important lives in the container/function itself anymore.

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
