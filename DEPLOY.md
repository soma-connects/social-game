# Deploying

## Screen budget during a round

A phone screen is the constraint, not the desktop layout. During an attempt the
main column must stay at roughly one screen, so anything not usable *in that
moment* is collapsed:

- `SocialVoicePanel` renders a one-line meter for the performer. Every control
  in it is `disabled={isPerformer}` — showing the full panel put ~500px of dead
  UI under the thing they are trying to do.
- `VoiceCallBar` takes `compact` during an attempt. Nobody joins or leaves a
  call mid-round.
- The board is behind `BoardPeek`, collapsed by default outside `roadmap_turn`.
  It is ~600px and nobody looks at the map while somebody is speaking.

Before adding anything to a live phase, measure it at 375px wide. The layout was
1.9 screens before this pass.

## Teams

Optional, off by default. Everyone still performs solo — the energy comes from
one person on the mic with the room watching, and splitting that in half would
waste it. What teams change is who you perform *for*:

- Points feed a shared crew total; the finish line is won by a crew, with the
  player who crossed it credited.
- `alternateByTeam` weaves the roll order so the sides swap instead of one crew
  rolling three times in a row.
- **Judging crosses the divide** — teammates would wave each other through, so
  only the opposing crew can pass/fail you. Reactions stay open to everyone;
  cheering your own crew on is the point of having one.
- Late joiners land on the smaller crew.

`MAX_PLAYERS` is 6. The voice call is a full mesh, so that is 15 peer
connections — about the ceiling for mobile. Going higher needs an SFU, not a
bigger constant.

## Presence

Every client heartbeats every 8s; the server drops a player after 25s of
silence (`PRESENCE_TIMEOUT_MS`) and calls `unstickPhase`, which skips their
mini-game turn, stops waiting for their shop confirmation, or removes them from
the roll order. `pagehide` also fires a `sendBeacon` so a deliberate close is
noticed immediately. Without this a closed tab is indistinguishable from a slow
player and the round hangs forever. If the host drops, the badge is handed to
the first remaining player.

## The turn loop

The board is the main game; the voice rounds are the qualifying mini-games that
feed it. The loop is **round-based**, not per-player:

1. **Mini-game, one player at a time** — every player takes a turn (Voice Arena
   or PitchBird), each followed by a roast intermission. Results accumulate in
   `roundResults`.
2. **Buff shop, everyone together** — all players buy simultaneously and press
   done; the board opens when the last one is ready (`shopReady`).
3. **Board, best mini-game score rolls first** — `rollOrder` is sorted by that
   round's performance, so winning the mini-game buys you first move as well as
   the most steps.
4. When the roll order is exhausted, `startNextRound` wipes round state and
   returns to step 1.

The dice is a reveal of what the mini-game earned, never a random roll.

Score → steps lives in `performanceToSteps` in `src/lib/gameRules.ts`. The two
mini-games score on different scales (`MINIGAME_MAX_SCORE`), so both are
normalised to 0..1 before mapping. Adjust those two together if you retune
either game — and note the server derives which mini-game was played from room
state, never from the client, so a PitchBird score cannot be graded on the voice
scale.


## Room state lives in Firestore

Rooms, the event feed and (cached in-process, per instance) the WebRTC
signalling mailboxes are backed by Firestore (`src/lib/server/roomServer.ts`,
via `adminDb` from `src/lib/firebase/server.ts`). `writeRoom` uses a
transaction keyed on a `rev` counter, so two overlapping requests can't
silently clobber each other — the loser gets a `RoomConflictError` and the
route replays the action against fresh state. This is what makes the app safe
to run across multiple stateless instances (Vercel serverless functions,
or Cloud Run scaled past one container) — there's no in-memory single-instance
requirement anymore.

Private per-room data (trivia answers, player auth tokens, hidden mines) lives
in a `rooms/{id}/private` subcollection that `firestore.rules` denies browsers
any access to — see that file.

### Required env vars

Firebase Admin needs a service account (`NEXT_PUBLIC_FIREBASE_PROJECT_ID`,
`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` — see the credential handling
in `src/lib/firebase/server.ts` for exact formatting pitfalls), plus the
client-side `NEXT_PUBLIC_FIREBASE_*` config values for the Firebase Web SDK.
Both sets must be present in whatever's deploying this — Vercel project
settings, or `--set-env-vars` / Secret Manager on Cloud Run.

`ADMIN_DASHBOARD_TOKEN` gates `/admin`, the analytics dashboard over the match
and session archives. Optional: leave it unset and the dashboard reports itself
as not configured and serves no data. It must be at least 16 characters — the
route refuses a shorter one rather than pretending to be locked. Generate one
with `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`.

Because it is a single shared secret, everyone who has it is the same
principal: there is no per-person audit trail, and revoking one person means
rotating it for everyone. That is a deliberate trade — the game's only identity
is anonymous Firebase auth, which cannot express "this person is staff" (an
anonymous uid dies with its browser's site data). The upgrade path when it
matters is real Google sign-in plus a uid allowlist, behind the same
`isAdminRequest` seam in `src/lib/server/adminAuth.ts`.

### Vercel

Zero-config Next.js import works as-is. Add the Firebase env vars above (plus
`GEMINI_API_KEY` for the AI Game Master, and `CLOUDFLARE_TURN_API_TOKEN` /
`CLOUDFLARE_TURN_KEY_ID` if TURN relay is enabled — see **Voice chat and
TURN** below, and `ADMIN_DASHBOARD_TOKEN` for the `/admin` dashboard) under
Project → Settings → Environment Variables, then deploy.

### Cloud Run

Still works if GCP is ever the target again — `Dockerfile` and
`.gcloudignore` are kept up to date. The old `--min-instances=1
--max-instances=1` pin is no longer required since state lives in Firestore,
not the container:

```bash
gcloud run deploy voice-party-roadmap-game --source . --region us-central1 --allow-unauthenticated
```

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

## Karaoke (solfège)

`src/lib/solfege.ts` holds the theory and scoring; `SolfegeGame.tsx` runs the
rounds. Uses no speech recognition at all — there is nothing to transcribe, only
a frequency to measure — which is why it scores accurately where the Voice Arena
cannot.

Three rules that must not be broken:

1. **Relative, never absolute.** The tonic is played, then an interval is asked
   for. Naming an absolute pitch would require perfect pitch and fail everyone.
2. **The tonic is picked from the player's measured range** (`getRange()`), so a
   bass and a soprano are set the same task rather than one impossible one.
3. **Octave errors are forgiven** — `centsError` folds the ratio into one octave.
   Singing the right note an octave down is musically correct, and the detector
   itself occasionally reports the wrong octave.

**The target note is played, not just the tonic.** Playing only the key turned
each round into an ear-training exam — work out where So sits above Do, then
produce it. That is a musician's task. Hearing the note makes it imitation.

**The instruction is the interface, not the meter.** A tuning needle is a
musician's tool; the player needs "GO HIGHER" in words, large. The meter runs
vertically (pitch is up and down, not left and right) over ±300 cents, and the
displayed marker is smoothed separately from the scored samples — scoring wants
the raw signal, the eye needs something that does not vibrate.

Scored in cents (a semitone is 100), on sustain rather than instant hit: what
counts is the share of the hold window spent on pitch, after a `GRACE_SECONDS`
lead-in that is not graded because nobody lands on a note instantly. `playReferenceTone`
deliberately ignores the SFX mute — it is the question being asked, not a sound
effect, and muting party noise must not silently make the game impossible.

**This is the karaoke engine.** A song is a pitch contour over time; a solfège
round is that contour with one point. Adding real melodies means feeding these
same functions a sequence of targets, not writing new scoring.

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
