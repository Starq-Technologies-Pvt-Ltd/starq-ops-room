# Vision's four specialists cannot answer: their model's free period ended (2026-11-12)

Status: **OPEN.** The Founder is handling the inference recovery himself (#19163, #19166). Recorded by the Operations
Room Deputy from Room and the logs the Acting CE read. Room: #19109, #19113, #19122, #19123, #19134, #19136, #19137,
#19159, #19161, #19162, #19163, #19165, #19166.

## What was observed

- The repaired Vision bridge candidate (built by WSL Claude, #19109; pre-read PASS by OpenCode, #19113) was run as a
  synthetic-only real-host E2E by Cursor under Founder #19122 item 4 (#19123). The candidate script, the manifest and the
  scratch copy matched their shas; the production script was not touched.
- **First attempt (#19134):** stopped in 2.4 seconds with `profile_mismatch`: the wrong `HERMES_HOME`. No retry; no
  specialist replies.
- **Second attempt (#19159):** with `HERMES_HOME=...\profiles\vision` the Vision group accepted the dispatch and the
  assignment id matched the prompt (so fix (a) of the repair worked), but none of sentinel, evidence, planner or reporter
  replied. It timed out at 600 seconds and again after the one allowed resume. No real package was used.

## Cause (read-only, from the department's own logs, Acting CE #19161)

All four specialist profiles use the Nous provider with the model `reflection/beam-1.0-501b-a23b:free`. At dispatch time
each received the request and failed the same way: HTTP 404, "This model's free period has ended", three retries and then
give up. The earlier synthetic success of 2026-11-08 was before the free period ended. So the four-specialist
department cannot work, with or without the bridge, until its model line is changed. Vision itself runs on its own
profile; Vision reported its profile active (#19165), which Ops has not verified.

## Effect

- The department bridge has **not** passed real-host acceptance and no record may say it has (#19166).
- Stage 6 (independent verification) for PR #204 (ERP-465) and HOA-253 waits behind it; an interim one-off Vision review
  needs the Founder's authorization.

## Decision and holds

The fix is a config-only change to the model line in each of the four profiles, with a backup and a rollback. The
Founder was offered three options (#19161: switch to the paid model the error names; switch to another configured
provider; or keep Founder-authorized interim reviews) and took the recovery himself (#19163, #19166). **Hold:** no change
to Vision's models, credentials, gateway or configuration by anyone else, and no further bridge retries until the Founder
confirms the department is operational. When he does, the Acting CE assigns one E2E rerun and routes its evidence to
Vision for acceptance under #18642.
