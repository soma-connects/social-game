# Mobile Board and Voice Mini-Game Rebuild — Handoff Walkthrough

## Status

**Walkthrough completed before implementation; implementation pass is complete; Android gameplay review is in progress.** The connected phone now shows the full-screen roadmap board and its side actions drawer. Dice timing, low-to-high-to-low pitch response, and Voice Arena still need live device checks.

### Validation status

- `npm.cmd run build` — passed; Next.js compiled, type checking and static generation finished. For Android testing, load the `NEXT_PUBLIC_FIREBASE_*` values from `.env.production` into the build process; `.env.local` contains blank values and otherwise compiles an empty project id.
- Android (Redmi 24117RN76G, Chrome, portrait) — ADB detected device `byzhlzam69gu6dnz`; the home page rendered at 1080 × 2400, then the test room and full-screen roadmap board loaded. The side actions drawer opened and closed and fit the viewport. The phone disconnected before the next live roll could be checked. Android rejects automated taps (`INJECT_EVENTS`), so gameplay buttons require manual phone input.
- Backend setup — the first room creation attempt failed because the local build had compiled an empty Firebase project id; no room was created by that attempt. After rebuilding with the configured public Firebase variables, `/api/health` and `/api/rooms/public` both return HTTP 200 and Firestore reports reachable. The user created test room `NJA-JZ3A` from the phone. The roadmap board and board-actions drawer load on-device.
- Remaining Android checks — the post-movement screen showed no dice overlay, but the live roll animation and bonus roll have not been watched end to end. Still verify portrait/landscape framing, high-to-low pitch follow, and Voice Arena start and narrow-screen controls.
- `npm.cmd test -- --run` — passed after running outside the restricted sandbox: 25 test files, 348 tests.
- `npm.cmd run lint` — the repository has no ESLint configuration, so `next lint` opened its first-run interactive setup instead of running checks.
- Git deployment — not pushed; Android gameplay validation is still outstanding.

## Implementation update

- `DiceRoller` now owns its reveal by a per-roll id; changing the face animation to its landed state no longer cancels the overlay dismissal timer. `RoadmapBoard` also clears movement timers on turn changes/unmount and reports request exceptions.
- The pitch path now uses a shorter pitch-history window, time-based movement smoothing, quicker downward following, and a much smaller convergence deadband. The Solfege needle follows pitches that move toward the target more quickly. UI state publication from the shared pitch hook is capped at 30 updates/second while the audio analysis loop continues at animation cadence.
- `roadmap_turn` and `branch_choice` use a `100dvh` mobile shell with the normal header, call bar, sidebars, page padding, and bottom nav hidden below desktop width. The square map world is sized/panned inside the portrait viewport without stretching its geometry. A side-edge button opens a drawer for roster, feed, items, mic/audio, theme, traps, sharing, home, end-match, and leave actions. Desktop board presentation keeps the original card layout.
- Voice Arena's start action now shows a pending state, blocks duplicate permission probes, invalidates a late permission result when the turn ends, and reflows its header and judging controls for narrow screens.
- The implementation files are `src/app/game/[roomId]/page.tsx`, `src/app/layout.tsx`, `src/components/MobileBoardActions.tsx`, `src/components/RoadmapBoard.tsx`, `src/components/MapRenderer.tsx`, `src/components/DiceRoller.tsx`, `src/components/VoiceGameController.tsx`, `src/components/SolfegeGame.tsx`, `src/hooks/usePitchDetection.ts`, and `src/lib/pitchTracking.ts`.

**Still needs a real Android pass:** confirm the map framing at portrait and landscape sizes, side drawer and branch-choice stacking, safe-area spacing, dice disappearance after a roll with bonuses, and a held high-to-low Karaoke/PitchBird transition. Voice Arena's browser speech support still depends on the device/browser and room microphone state; check the visible error and transcript path on the target phone.

## Latest Android follow-up

The user reported that the board action button overlaps the map view control, wants inventory visible in the side actions area with instructions for using powerups, and says Asteroid Defense does not hear their voice.

- The three map camera buttons and the side action toggle now share a raised row above the fixed Roll Dice button, with the Android safe-area inset included in their bottom offset. Check the row on narrow portrait and landscape screens.
- The mobile action drawer now lists each owned powerup, quantity, effect, and an action hint (`tap to activate`, `choose a rival`, or `target the leader`). Powerups are disabled until the player's turn. Tapping one closes the drawer and invokes the existing powerup flow.
- Asteroid Defense starts Android browser speech synchronously from the START tap if there is no live room call. With a call active, it still tries streaming recognition on the shared mic. If it falls back to browser recognition, it immediately explains the mic conflict and offers `LET THE GAME HEAR ME`; microphone and recognition errors are now visible during play.
- Latest source checks — `npm.cmd run build` succeeded with the public Firebase variables loaded from `.env.production`; `npm.cmd test -- --run` passed (25 files, 348 tests); `git diff --check` is clean. The production build uses Next standalone output, so run it with `node .next/standalone/server.js` (the normal `next start` warns and does not serve this output correctly). The local server returns HTTP 200 for `/`; ADB is still disconnected.
- These latest fixes have not been checked on the phone yet because ADB is disconnected. Reconnect the Redmi device, rebuild with Firebase public settings from `.env.production`, and test map controls, drawer powerup activation, and Asteroid voice both with and without a room call before deployment.

## User request

Improve the Android/mobile game experience and repair these problems:

1. The Karaoke / “Find Your Range” pitch mechanic sometimes stays high after the player lowers their voice.
2. The roadmap board should take over the phone screen during board play, hiding the normal app header and surrounding page sections.
3. A small control at the side of the board should reveal the other room actions while the board is immersive.
4. Dice should finish their roll/reveal cleanly and get out of the way.
5. Mini-games need to respond and fit properly on phones; Voice Arena is the named example.

The supplied Android screenshot shows the current roadmap turn: the app header remains pinned at the top, the board is embedded in the normal scrolling page, a fixed mobile navigation bar sits at the bottom, and the large dice overlay covers the lower map/action area.

## Walkthrough of the current app

### 1. Room page and mobile chrome

The room page is [src/app/game/[roomId]/page.tsx](../src/app/game/%5BroomId%5D/page.tsx).

- The page shell renders `GameHeader` at line 463, then a padded content row with `LeftSidebar`, a central `<main>`, and (when available) `RightSidebar` around lines 482–925.
- `VoiceCallBar` is rendered near the top of `<main>` (line 495), so it also consumes vertical space during board turns.
- The roadmap is selected for both `roadmap_turn` and `branch_choice` near line 790.
- A fixed mobile bottom bar near line 934 opens existing roster, feed, and inventory panels. The page already has state for these panels near lines 84–88 and renders their dialogs later in the file.
- `GameHeader` includes microphone/audio controls and an overflow menu with theme, share, home, end-match, and leave actions. Hiding it during immersive play must preserve access to the actions that still make sense there.
- `getPhaseChrome()` in `src/lib/gameRules.ts` controls whether theme and inventory chrome is relevant to the active phase. The normal roster/feed are room actions and currently remain available on all phases.
- `src/app/layout.tsx` sets a device-width viewport and keeps pinch zoom enabled. The global CSS uses `min-height: 100vh`; there is no existing game-specific dynamic-viewport shell.

### 2. Roadmap board and dice flow

The board UI is [src/components/RoadmapBoard.tsx](../src/components/RoadmapBoard.tsx), and the map itself is [src/components/MapRenderer.tsx](../src/components/MapRenderer.tsx).

1. `RoadmapBoard` calls `roomStore.rollDice(room.roomId)` from its roll button.
2. The room API at `src/app/api/room/[roomId]/route.ts` is authoritative for the roll, movement, bonuses, and landing outcome. Keep that game-state contract intact while changing presentation.
3. The board stores the returned base face value and move breakdown, then mounts `DiceRoller` with `isRolling` true.
4. `RoadmapBoard` schedules one timeout to set `isRolling` false after 1.6 seconds and another to finish the movement/landing flow after `1700 + result.roll * 500` milliseconds.
5. `DiceRoller` starts its reveal timer when `isRolling` becomes true. It waits 2.5 seconds plus 0.4 seconds per bonus before hiding itself.

**High-confidence dice defect:** when the parent changes `isRolling` to false at 1.6 seconds, the `DiceRoller` effect cleanup cancels its longer timeout. There is no `isRolling === false` branch that hides the already-visible overlay. That can leave the dice on screen after the spin, matching the screenshot. The face animation state and the overlay/reveal lifetime are coupled to the same flag even though they need different durations. Separate the animation phase from the reveal/close phase or have the roller report completion to its parent; make timeout cleanup and turn changes deterministic.

`MapRenderer` currently draws a square map viewport (`aspect-square`) capped at 560px and includes its own title/progress header and footer. On a phone it zooms and follows the active player, but it remains inside a scrolling page. An immersive portrait view should size the map viewport against the available visual height, keep the map proportions intact, and retain camera-follow so the active token and nearby path remain readable. Do not stretch the square map art out of shape.

### 3. Karaoke pitch and “Find Your Range” behavior

There are two pitch-driven games. The wording in the request most closely matches the calibration copy in `SolfegeGame`, but the related flight mechanic is `PitchBirdCanvas`. Both use [src/hooks/usePitchDetection.ts](../src/hooks/usePitchDetection.ts), so inspect both before changing shared detection behavior.

- `SolfegeGame` displays “FINDING YOUR RANGE…” around line 292. It reads `pitch` from `usePitchDetection`, compares it with the target note, smooths the displayed cents value at a 0.28 follow rate (around lines 167–180), and updates a vertical pitch meter. A pitch drop-out sets the live reading to null.
- `PitchBirdCanvas` reads `lift` from the same hook and passes it into `stepBird()` in `src/lib/pitchBirdPhysics.ts`. The flight movement is therefore downstream of the hook’s lift smoother, separate from Solfege’s target-note meter.
- Calibration lasts 3.5 seconds (`CALIBRATION_MS`). The hook detects pitch with Pitchy and a five-frame median; it exposes raw-ish `pitch`, `volume`, and smoothed `lift`.
- `src/lib/pitchTracking.ts` converts frequency to semitones, derives a personal range, uses a nine-frame median history, rejects one-frame octave jumps until three frames agree, holds through silence for 220 ms, and follows a changed pitch by 20% per frame. Those constants can create latency on low-frame-rate phones. The current unit tests cover steady notes, pitch-up, octave errors, and silence, but do not explicitly cover a sustained high-to-low glide or repeated up/down changes.
- Pitch commands use vocal **pitch**, not loudness. `PitchBirdCanvas` separately uses volume to trigger its “overheating” feedback; do not let volume alter vertical control.

**Unconfirmed pitch cause:** the shared hook’s history/jump filter and the separate smoothing in Solfege/PitchBird can each make downward movement feel delayed. First identify which screen the user means and compare the displayed detected Hz, pitch meter/cents, lift, and bird position during a controlled high-to-low vocal glide. If the detected Hz itself stays high, fix detection/history. If Hz falls but the Solfege needle or bird does not, fix the corresponding display/physics smoothing. Check whether a calibrated range excludes the player’s lower note and whether Android’s lower animation/audio frame rate exaggerates per-frame smoothing.

### 4. Voice Arena mobile responsiveness

Voice Arena is [src/components/VoiceGameController.tsx](../src/components/VoiceGameController.tsx), selected for `qualifying_voice` in the room page.

- The component is limited to `max-w-3xl` and adds horizontal padding. Its card adds `p-6` on small screens, and the top row places the avatar/player details, mic control, and timer in a single flex row.
- The live-state view has two judge buttons in a fixed two-column grid around line 469. Their labels are long for narrow phones.
- `handleStartAttempt()` awaits the microphone permission probe before setting status to `listening`; there is no explicit “starting” state/lock while the probe is pending. On a slow permission prompt or device this can look like a dead tap and allow repeated starts.
- Speech recognition is handled by `src/lib/speechService.ts`, which includes Android-specific restart timing/diagnostics and mic sharing behavior. The app also has `MicContentionNotice` for the call-versus-recognizer conflict. Check the actual browser capability, secure-context/mic errors, recognition engine, transcript events, and start/stop lifecycle before attributing all mobile failures to CSS.

Likely UI improvements to evaluate: allow the header row to wrap or stack at narrow widths; use a responsive one-column judge layout when needed; prevent long prompts and labels from forcing horizontal overflow; make the pending permission/start state visibly busy and ignore duplicate taps; keep controls comfortably tappable. Preserve the existing manual judge fallback and clear microphone/browser errors.

## Follow-up walkthrough

1. **Verify the pitch target.** Walk through Solfege and PitchBird separately. Reproduce a low → high → low held-note sequence, then repeat with silence and a gradual glide. Keep pitch and loudness distinct.
2. **Review the roll lifecycle.** Confirm the spin animation, landed result, token movement, and overlay dismissal have separate timing. Check request errors and turn changes so stale timers cannot leave an overlay or clear a newer roll.
3. **Review the immersive board shell.** Confirm it is scoped to roadmap board phases on small touch screens and that the ordinary header, sidebars, call bar, page gutters, and bottom action bar stay hidden while the board is active. Check `100dvh`/safe-area sizing and the desktop fallback.
4. **Verify the board-side action toggle.** Check roster/feed/inventory panels and the preserved room actions (sound/mic, theme/trap when relevant, share, home, end/leave). Confirm the drawer opens/closes cleanly, responds to Escape, and stays above branch/dice layers.
5. **Review pitch response and Voice Arena on narrow screens.** Confirm shared smoothing responds to low/high changes. Check the pending-start guard, top-control reflow, judge buttons, and touch targets.
6. **Review the result on phone-sized layouts and Android.** Cover portrait/landscape, short viewport, safe areas, pending roll, landed dice, bonus steps, branch choice, drawer open, next turn, microphone permission wait/error, and low/high/low pitch transitions. Record any browser-only speech-recognition limitation separately from app layout/logic behavior.

## Acceptance checklist

- In a roadmap turn on a phone, the board is the primary full-height app surface, without the normal page header, call bar, sidebars, or bottom nav competing for space.
- The side toggle reaches roster, feed, inventory/powerups, and the relevant room controls; closing it returns directly to the board state.
- Dice roll once, show the server-returned result/bonus arithmetic, then disappear. The result does not remain over the map and no old timer alters a later turn.
- A held high note followed by a lower held note produces a clear downward response in the intended pitch UI/game; a brief consonant/silence does not cause a false reset.
- Voice Arena start gives immediate feedback while mic access/recognition starts, never starts duplicate sessions from repeated taps, and its main controls fit without horizontal scrolling at narrow widths.
- Board movement, roll order, scoring, room synchronization, and desktop board layout remain unchanged by the mobile presentation work.

## Files to start from

| Area | Files |
|---|---|
| Room shell and mobile panels | `src/app/game/[roomId]/page.tsx`, `src/components/GameHeader.tsx`, `src/components/VoiceCallBar.tsx`, `src/app/layout.tsx`, `src/app/globals.css` |
| Board, map, dice | `src/components/RoadmapBoard.tsx`, `src/components/MapRenderer.tsx`, `src/components/DiceRoller.tsx`, `src/app/api/room/[roomId]/route.ts` |
| Karaoke / range and flight | `src/components/SolfegeGame.tsx`, `src/components/PitchBirdCanvas.tsx`, `src/hooks/usePitchDetection.ts`, `src/lib/pitchTracking.ts`, `src/lib/pitchBirdPhysics.ts` |
| Voice Arena | `src/components/VoiceGameController.tsx`, `src/lib/speechService.ts`, `src/components/MicContentionNotice.tsx`, `src/lib/micStream.ts` |

## Workspace note

At inspection time, Git also showed pre-existing untracked `.claude/settings.local.json`, `.deploy-origin-main/`, and `.vscode/`. Leave those artifacts untouched while implementing this brief.
