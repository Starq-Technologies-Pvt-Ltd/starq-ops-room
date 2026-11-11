# Historical records the candidate adds — review

Requested in Room #18997. Local, read-only replay through `readRoomSnapshot()` over Room
#10000 to #18994 (8995 records): delivered by both versions 365, lost 0, **gained
41**. Every gained record is listed. Message bodies are not reproduced; each rationale
paraphrases only the clause of the action-required text that names the Founder.

Common to all 41: broker type ACTION_REQUIRED; `mustarq` in the evaluated audience;
sender is not the Founder; the action-required text starts with another owner and names the
Founder as owner of a later clause.

## Classes

| Class | Meaning | Count |
|---|---|---|
| INTENDED | the Founder clause asks the Founder to decide, confirm or accept now | 15 |
| FALSE POSITIVE | the Founder clause says explicitly that nothing is asked of the Founder | 15 |
| AMBIGUOUS | FYI only, or an action that is conditional or due only after a later step | 11 |

## Records

| Seq | Event ID (first 16) | Date | Sender | Type | Audience | Class | Rationale |
|---|---|---|---|---|---|---|---|
| #11790 | `eb7ee23bd6179447` | 2026-10-23 | codex | ACTION_REQUIRED | mustarq, claude | **FALSE POSITIVE** | Founder clause says no further action is requested |
| #11792 | `6225b9526a4636aa` | 2026-10-23 | codex | ACTION_REQUIRED | mustarq, claude | **FALSE POSITIVE** | Founder clause says no decision is requested yet |
| #12150 | `25d671df0336afd1` | 2026-10-23 | claude | ACTION_REQUIRED | pi, codex, mustarq | **AMBIGUOUS** | Founder named jointly with Codex for a conditional override; action only if a condition holds |
| #12368 | `e6cf055dc56d06af` | 2026-10-24 | claude | ACTION_REQUIRED | codex, pi, mustarq, claude | **INTENDED** | Founder clause names an access decision for the Founder |
| #12511 | `b43f39b017d931ce` | 2026-10-24 | claude | ACTION_REQUIRED | codex, mustarq | **FALSE POSITIVE** | Founder clause states only that nothing is authorised; no action asked |
| #12595 | `8d8cf0b8bcd09b87` | 2026-10-24 | claude | ACTION_REQUIRED | codex, pi, mustarq, claude | **FALSE POSITIVE** | Founder clause says no decision here |
| #12677 | `1d8797f72ee60f00` | 2026-10-24 | claude | ACTION_REQUIRED | codex, mustarq, claude | **INTENDED** | Founder asked to decide the execution location |
| #12678 | `cd948b270048c765` | 2026-10-24 | claude | ACTION_REQUIRED | codex, mustarq | **INTENDED** | Founder asked to decide execution location and ownership |
| #12743 | `a0287d2713f9d6a3` | 2026-10-24 | codex | ACTION_REQUIRED | mustarq, claude, antigravity | **FALSE POSITIVE** | Founder clause reports a hold remains; no action asked |
| #12774 | `e7b19c28db5d0de8` | 2026-10-24 | claude | ACTION_REQUIRED | codex, antigravity, mustarq | **FALSE POSITIVE** | Founder clause says no decision yet |
| #12778 | `88e1eaceaa965402` | 2026-10-24 | claude | ACTION_REQUIRED | codex, antigravity, mustarq | **FALSE POSITIVE** | Founder clause says no decision here |
| #12780 | `70263ab366e0ddb1` | 2026-10-24 | claude | ACTION_REQUIRED | codex, antigravity, mustarq | **AMBIGUOUS** | Founder clause says a decision is still open but does not ask for it now |
| #12786 | `34a700a450cebc8e` | 2026-10-24 | claude | ACTION_REQUIRED | codex, antigravity, mustarq | **INTENDED** | Founder asked to decide two named scope items |
| #12793 | `8cf65ebba8ed2a9e` | 2026-10-24 | claude | ACTION_REQUIRED | codex, antigravity, mustarq, claude | **INTENDED** | Founder asked to decide between two named options |
| #12797 | `6c5bc40652d49ce2` | 2026-10-24 | claude | ACTION_REQUIRED | codex, mustarq, antigravity, claude | **FALSE POSITIVE** | Readiness ACK; Founder clause says no decisions requested yet |
| #12804 | `17073324bb66b3e7` | 2026-10-24 | claude | ACTION_REQUIRED | codex, mustarq, antigravity, claude | **FALSE POSITIVE** | Readiness ACK; Founder clause says no decision requested |
| #12805 | `9f3b5c4a1475fdf7` | 2026-10-24 | claude | ACTION_REQUIRED | codex, mustarq, antigravity | **INTENDED** | Founder asked to decide or defer listed decisions |
| #12809 | `ee99a7e759b38700` | 2026-10-24 | claude | ACTION_REQUIRED | codex, mustarq, claude | **FALSE POSITIVE** | Readiness ACK; Founder clause says no decision requested |
| #12813 | `b2c8ec71befc4402` | 2026-10-24 | claude | ACTION_REQUIRED | codex, mustarq | **FALSE POSITIVE** | Founder clause says the decision is separate and not made here |
| #12814 | `620f03d79e16dea1` | 2026-10-24 | antigravity | ACTION_REQUIRED | codex, claude, mustarq | **FALSE POSITIVE** | Founder clause says no action requested |
| #12820 | `4815f2a3fdee5513` | 2026-10-24 | claude | ACTION_REQUIRED | codex, mustarq, claude | **FALSE POSITIVE** | Readiness ACK; Founder clause says no decision requested |
| #12821 | `a886d64dea4c0f97` | 2026-10-24 | claude | ACTION_REQUIRED | codex, mustarq | **INTENDED** | Founder brief; Founder asked to decide or defer |
| #12823 | `21296a59d03d7c73` | 2026-10-24 | claude | ACTION_REQUIRED | codex, mustarq | **INTENDED** | Correction to a Founder brief; Founder asked to decide or defer |
| #12870 | `5ee79d42c57455c2` | 2026-10-24 | claude | ACTION_REQUIRED | codex, antigravity, mustarq | **FALSE POSITIVE** | Founder clause says no decision here |
| #13547 | `1ae85b043cfdb5f1` | 2026-10-25 | antigravity | ACTION_REQUIRED | claude, cursor, mustarq, codex | **INTENDED** | Founder decision requested on named items |
| #13548 | `0fd34370b53eaed1` | 2026-10-25 | claude | ACTION_REQUIRED | antigravity, cursor, mustarq, codex | **AMBIGUOUS** | Founder decision requested only after a later review |
| #13581 | `3e78d61ece7f3bc2` | 2026-10-25 | antigravity | ACTION_REQUIRED | claude, cursor, mustarq, codex | **INTENDED** | Founder decision requested on named items after review |
| #13628 | `d360e7fd543f8f39` | 2026-10-25 | antigravity | ACTION_REQUIRED | codex, claude, cursor, mustarq | **AMBIGUOUS** | Founder decision requested only after a later review |
| #15065 | `778825b69b7bb3dc` | 2026-10-26 | claude | ACTION_REQUIRED | mustarq, codex | **FALSE POSITIVE** | Founder clause says no action from the Founder yet |
| #15264 | `cf0d4720e5e0ef1c` | 2026-10-26 | claude | ACTION_REQUIRED | codex, mustarq | **INTENDED** | Founder asked to confirm a merge was intended |
| #17493 | `e11d221dd7370714` | 2026-11-03 | cursor | ACTION_REQUIRED | cursor, codex, mustarq, antigravity | **INTENDED** | Founder decisions stated as required before any write |
| #18355 | `76c9fa3f22dd6a0f` | 2026-11-06 | claude | ACTION_REQUIRED | mustarq, antigravity, vision, codex, claude | **INTENDED** | Founder asked to confirm a proposed standard |
| #18364 | `a79d025b62d7dafe` | 2026-11-06 | claude | ACTION_REQUIRED | mustarq, vision, antigravity, claude | **AMBIGUOUS** | Founder acceptance gate named, but only after a pending review passes |
| #18374 | `8c01d0c4de89da75` | 2026-11-06 | claude | ACTION_REQUIRED | mustarq, antigravity, copilot, vision, claude | **AMBIGUOUS** | Founder clause is FYI only |
| #18376 | `ab721c551ac0ed9f` | 2026-11-06 | claude | ACTION_REQUIRED | mustarq, copilot, antigravity, claude | **AMBIGUOUS** | Founder clause is FYI only |
| #18386 | `e84cd5ec10e38105` | 2026-11-06 | claude | ACTION_REQUIRED | mustarq, vision, claude | **INTENDED** | Founder asked to confirm a post-merge check |
| #18620 | `9f3d427f8f3369bb` | 2026-11-08 | claude | ACTION_REQUIRED | mustarq, codex, vision, antigravity, claude | **AMBIGUOUS** | Founder named jointly with Vision as FYI only |
| #18628 | `db75cf9c34a6e961` | 2026-11-08 | claude | ACTION_REQUIRED | mustarq, codex, antigravity, vision, claude | **AMBIGUOUS** | Founder named jointly with Vision as FYI tracking |
| #18648 | `6e0f65f800bee8b9` | 2026-11-08 | claude | ACTION_REQUIRED | mustarq, codex, vision, antigravity, claude | **AMBIGUOUS** | Founder named jointly with a builder as FYI only |
| #18653 | `9c13b47b43df1e58` | 2026-11-08 | claude | ACTION_REQUIRED | codex, antigravity, mustarq, vision, claude | **AMBIGUOUS** | Founder named jointly with Vision as FYI only |
| #18958 | `781c27ceb909174b` | 2026-11-11 | claude | ACTION_REQUIRED | claude, mustarq, codex | **INTENDED** | Floor handover; Founder asked to decide a review route and policy items |

## Assessment

- The candidate does what it was written to do: it recovers 15 records in which the
  Founder was asked to act and the live filter stayed silent, including #18958.
- It also adds 15 records whose Founder clause says "no action" or "no decision". The
  filter reads who is named as an owner; it does not read what the clause asks. This is not a
  new kind of error: the live filter already sends a record whose **first** clause is
  "mustarq: no action". The candidate extends the same behaviour to later clauses.
- The 11 ambiguous records are FYI or deferred items. Whether the Founder wants FYI
  clauses on Telegram is a policy question, not a parsing one.
- No change was made to the candidate after this review. A rule that suppresses "no action"
  or "FYI" clauses would be a guess at wording and could silence a real request; it is not
  proposed here.

**Verdict:** acceptable to send for independent review, with this file attached and the
false-positive rate stated: 15 of 41 gained records (37%) are noise, 11 more are
arguable.

## Unresolved, for the reviewer and the Founder

1. Should an FYI clause naming the Founder reach Telegram? (6 FYI records; 5 deferred or conditional.)
2. Should "Founder: no action" clauses be prevented at the source instead — a sender rule that
   the Founder is named as an owner only when something is asked of him? That costs no code
   and removes the false positives in both the live filter and the candidate.
3. The classification is one reader's judgement from the action text alone; bodies were not
   re-read for context.
