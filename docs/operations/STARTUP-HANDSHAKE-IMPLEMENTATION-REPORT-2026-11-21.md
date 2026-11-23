# Startup Handshake Protocol — Implementation & Test Report

**Date:** 2026-11-21  
**Author:** Ops AG (`w3:p2`)  
**Brief:** `docs/operations/_briefs/AG-BRIEF-STARTUP-HANDSHAKE-BUILD-TEST-2026-11-21.md`  
**Step 5 Statement:** **Step 5 (execution gate) was NOT triggered.** No live-work authorization was announced or granted.  

---

## 1. Files Created / Modified

| File | Size | SHA-256 |
|---|---|---|
| `D:\StarqTech\starq-ops-room\scripts\startup-protocol\topology.mjs` | 2,790 B | `7A4D115EA059C07E003B75314072FE734DAE435CF7F2D9160EC4963FFFCE6EED` |
| `D:\StarqTech\starq-ops-room\scripts\startup-protocol\herdr-client.mjs` | 3,239 B | `0298688DB19E0DE0A7A02C786B264AD8DE2A2DB81A7800945D108A17129FE3A5` |
| `D:\StarqTech\starq-ops-room\scripts\startup-protocol\state-store.mjs` | 5,322 B | `5B33868B0BAB8E779F4D75E3B3CBA7398262F9CDD45194DA5D99DAD84D1614F1` |
| `D:\StarqTech\starq-ops-room\scripts\startup-protocol\ack-parser.mjs` | 2,810 B | `B61493B3DEA5D04DA7D7BB3D5A81BB39FE299D7173ECA7F30FF44E1131AD6866` |
| `D:\StarqTech\starq-ops-room\scripts\startup-protocol\reconcile.mjs` | 3,959 B | `6C74EB3773CDD7D0F267C2F8EDBE6982B58CE80393E6A969E19FC9010C312FC7` |
| `D:\StarqTech\starq-ops-room\scripts\startup-protocol\run-handshake.mjs` | 32,109 B | `077B1F899895F9C148B5466A3A3C6366E7EC24CF4DC53D78A9670124F40D1C3D` |
| `D:\StarqTech\starq-ops-room\scripts\startup-protocol\test-scenarios.mjs` | 10,916 B | `0781F0C5DBDB9FBBFE45E3939BBE683F8414CF6B0B169E8958593F8B7B1F27E1` |
| `D:\StarqTech\starq-ops-room\docs\operations\STARTUP-HANDSHAKE-PROTOCOL-v1-SOP.md` | 6,027 B | `51616D00B2297E03613F147D44E220EE6F38477A8F3F53BB2770061D1EC22325` |
| `D:\StarqTech\starq-ops-room\.gitignore` | modified (+1 line) | Added `runs/startup/*/logs/` |

`docs/operations/OPS-ROOM-OPERATING-PROCEDURE-v1-DRAFT.md`, `watch/`, `protocol/`, `api/`, `scripts/send.mjs`, and `scripts/room-watch-*.mjs` were NOT modified.

---

## 2. Test Results (Scenarios 1–7)

### Scenarios 1–6 (Mock Transport via `HerdrClient` DI)

Command:
```powershell
node scripts/startup-protocol/test-scenarios.mjs
```

Output:
```json
{
  "allPassed": true,
  "results": [
    { "scenario": 1, "name": "Dry-run topology", "status": "PASS", "prompts": 0, "skipped": 8 },
    { "scenario": 2, "name": "Induced interruption", "status": "PASS", "pausedAt": "S2", "ledgerLines": 4 },
    { "scenario": "3a", "name": "Induced MISSING (no blind resend)", "status": "PASS", "promptsToW4p1": 1, "finalStatus": "BLOCKED_ESCALATE" },
    { "scenario": "3b", "name": "Induced FAILED (agent_blocked)", "status": "PASS", "promptsToW4p1": 0, "finalStatus": "BLOCKED_ESCALATE" },
    { "scenario": 4, "name": "Resume", "status": "PASS", "promptsSentOnResume": 2, "finalStatus": "READY_FOR_FOUNDER_GATE" },
    { "scenario": 5, "name": "Idempotency", "status": "PASS", "newPrompts": 0, "ledgerLinesUnchanged": 11 },
    { "scenario": 6, "name": "Doc-update-only-on-change", "status": "PASS", "sameChanges": false, "changedDeltaWritten": true }
  ]
}
```

| Scenario | Result | Verification |
|---|---|---|
| 1. Dry-run topology | **PASS** | `topology_snapshot.json` written, 0 prompts sent, 8 handoffs `SKIPPED` |
| 2. Induced interruption | **PASS** | `PAUSED` after `S2`, `state.json` preserved, `ledger.jsonl` has 4 clean JSONL lines |
| 3a. Induced MISSING | **PASS** | Diagnostic saw prompt delivered + idle without ACK; blocked blind resend; `BLOCKED_ESCALATE` |
| 3b. Induced FAILED (`agent_blocked`) | **PASS** | Pre-flight saw `agent_status=blocked`; 0 prompts sent; `BLOCKED_ESCALATE` |
| 4. Resume | **PASS** | Skipped `S1` & `S2`; completed `S3` & `S4` to `READY_FOR_FOUNDER_GATE` |
| 5. Idempotency | **PASS** | Re-running `--resume` on completed run sent 0 prompts; `ledger.jsonl` remained 11 lines |
| 6. Doc-update-only-on-change | **PASS** | Identical snapshot -> `changesDetected=false` (no `sop-delta.md`); modified `cwd` -> `sop-delta.md` written |

---

### Scenario 7 (ONE Live End-to-End Run — Halted & Escalated on `S2`)

Command:
```powershell
node scripts/startup-protocol/run-handshake.mjs --live
```

Output (`run_id`: `20261121T115836Z-2c88`, exit code `1`):
```json
{
  "run_id": "20261121T115836Z-2c88",
  "status": "BLOCKED_ESCALATE",
  "summary": {
    "total_handoffs": 2,
    "acked": 1,
    "missing": 0,
    "failed": 1,
    "skipped": 0,
    "changes_detected": null,
    "xps_latencies_ms": []
  },
  "state_path": "D:\\StarqTech\\starq-ops-room\\runs\\startup\\20261121T115836Z-2c88\\state.json",
  "ledger_path": "D:\\StarqTech\\starq-ops-room\\runs\\startup\\20261121T115836Z-2c88\\ledger.jsonl"
}
```

**Scenario 7 Verdict:** **FAIL / HALTED AT `BLOCKED_ESCALATE` (expected fail-closed behavior; did NOT iterate)**

**What happened (observed in readback evidence):**
1. `S1` passed (`w3:p1=idle`, `w3:p2=working` verified via `herdr pane list`).
2. `S2` dispatched the prompt to `w4:p1` (`ERP Vision`).
3. `herdr agent prompt w4:p1 ... --wait --timeout 120000` exited with `agent_prompt_stalled` after 5,000ms.
4. Readback evidence (`runs/startup/20261121T115836Z-2c88/logs/readbacks/20261121T115836Z-2c88_S2_orchestrator-_w4_p1_request__attempt_1.txt`, lines 49–70) proves:
   - The prompt **WAS** delivered to `w4:p1` (line 49).
   - `w4:p1` (`Hermes` / `claude-opus-4-7`) actually started processing (`Preparing mcp__terminal… · 5s` at line 67), but Herdr's `--wait` 5,000ms stall detector fired before `agent_status` transitioned from `idle` to `working`.
5. Per the fail-closed no-blind-resend rule, the diagnostic gate saw `delivered=true` and `agent_status=idle`, refused to blind-resend, transitioned to `BLOCKED_ESCALATE`, and skipped `S3`/`S4`.

**Evidence files:**
- `D:\StarqTech\starq-ops-room\runs\startup\20261121T115836Z-2c88\state.json`
- `D:\StarqTech\starq-ops-room\runs\startup\20261121T115836Z-2c88\ledger.jsonl`
- `D:\StarqTech\starq-ops-room\runs\startup\20261121T115836Z-2c88\topology_snapshot.json`
- `D:\StarqTech\starq-ops-room\runs\startup\20261121T115836Z-2c88\logs\readbacks\20261121T115836Z-2c88_S2_orchestrator-_w4_p1_request__attempt_1.txt`

---

## 3. Deviations from Design & Root-Cause Finding

1. **Hybrid chain timeouts:** Increased `S2` (`localChain`) timeout from `60,000 ms` to `120,000 ms` because `w4:p1` must perform a nested `w4:p1 -> w4:p2` turn before replying.
2. **Real-world Herdr `--wait` race discovered in Scenario 7:** `herdr agent prompt --wait` enforces a hardcoded 5,000ms window to observe `working`/`blocked`; when Hermes takes >5s to initialize tools (`Preparing mcp__terminal…`), `--wait` returns `agent_prompt_stalled` even though the prompt was delivered and accepted. Furthermore, `run-handshake.mjs` treated `agent_prompt_stalled` as an immediate `FAILED` without polling `agent read` for the remaining timeout window.
   - **Recommended fix (pending authorization):** Submit `herdr agent prompt` *without* `--wait` (or ignore `agent_prompt_stalled` when `detectPromptDelivered` is `true` and proceed to the `agent read` polling loop for the full timeout).

---

## 4. XPS Latency & UNKNOWNs

- **Measured XPS hop latency (`p50` / `p95`):** **UNKNOWN** — Scenario 7 halted at `S2` (`BLOCKED_ESCALATE`) before reaching `S3` (`XPS`).
- **Remaining UNKNOWNs:**
  - Live end-to-end completion of `S2` (`w4:p1 -> w4:p2`), `S3` (`w2:p8 -> XPS w2:p1 -> {w2:p2, w2:p3}`), and `S4` (`w3:p1`) once the `--wait` 5s stall-race is resolved.
  - Actual `p50` / `p95` latency for `herdr --machine XPS` chain hops.
