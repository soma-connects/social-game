# Design reference

The original mockups this game's interface was built against — the dark cosmic
board screen with the glass side panels, the inventory rail and the event log.

They live here rather than in `public/` because they were being served. The
Dockerfile copies `public/` wholesale into the runtime image, so 3.9 MB of
mockups shipped with every deploy and were downloaded by nobody: nothing in
`src/` ever referenced them.

Still worth keeping. They are the reference for what the interface is aiming at,
and `../prompts/` was written to match their look.
