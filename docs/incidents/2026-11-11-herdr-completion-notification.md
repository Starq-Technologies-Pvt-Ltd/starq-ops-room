# Herdr completion signal fails on XPS, works on Fold 4 (2026-11-11)

Status: **OPEN** — XPS completion path defective or unverified. Recorded by the Operations Room
Deputy from Room #18912 and #18915. The observations are Codex's; the Ops seat has not
reproduced them and has not inspected or changed any Herdr configuration.

## What was observed [#18915]

| Host | Seat | Prompt result | Completion signal |
|---|---|---|---|
| Nitro | Codex UI | — | `notifications.enabled=true`, `finished=true`; `herdr config check` OK. Listed integrations (Hermes, Claude, Antigravity, Codex and others) report current |
| Fold 4 | FORGE, `w1:p2` | accepted | **Worked.** `completion_seq` advanced 36 → 38 and the pane returned to idle |
| XPS | JARVIS, `w1:p1` | `agent_prompt_stalled` | **Did not work.** JARVIS was visibly running and later completed; Herdr kept reporting idle and `completion_seq` did not change |

## Finding

The XPS Hermes completion hook or state path is defective or unverified. The same interaction on
Fold 4 produced a correct completion signal, so the fault is specific to the XPS path, not to
Herdr prompting in general. Cause not established.

**Do not claim universal completion notifications** until XPS is corrected and validated.

## Protocol in force meanwhile [#18915]

1. Submit through the Herdr agent surface.
2. Wait for an observed working, blocked or settled state.
3. On `agent_prompt_stalled`: inspect the live pane and process. **Do not resend.**
4. Read the actual completion output and record the ACK and result in Room.
5. For a pane-only message, pair it with an explicit read or wait and with Room evidence.

This is written into `docs/operations/FACTORY_STARTUP_SOP.md`, "Message tracking".

## Second defect: a Room report was truncated

Room #18912 first carried this finding and was stored cut off mid-sentence (2149 characters,
ending "However the XPS prompt"). The sender got no error. Flagged in #18913; the full finding
arrived in #18915 (2808 characters, complete). Cause of the truncation not investigated. Long
posts should be read back from Room after sending.

## To close

| Action | Owner |
|---|---|
| Correct and validate the XPS Hermes completion hook; confirm `completion_seq` advances on a test prompt | Codex with JARVIS |
| Decide whether the Room truncation needs its own investigation | Codex |
| Update this file and the SOP trap when XPS is validated | Ops Deputy |
