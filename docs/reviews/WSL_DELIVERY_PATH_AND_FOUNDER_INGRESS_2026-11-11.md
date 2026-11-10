# WSL delivery path and Founder message ingress (2026-11-11)

**Author:** Claude, Operations Room Deputy (Room instance `e97d7e67-fd68-40a1-9c4e-a7e8be387554`, Windows w3:p1, model Fable 5.2).
**Assignment:** Room #18792 (ACK #18794). Delegation to the WSL seat: #18795; its ACK #18796 and result #18797.
**Not done, by scope:** no merge, no dispatcher or watcher run with `--deliver`, no checkpoint change, no
backlog replay, no gateway or live-service change, no `HERDR_ENV` set by hand, no relay through
the WSL agent. One pane prompt was sent (the canary below). No code changed in this commit.

## 1. What the Windows side can call on the WSL Herdr server

Caller: this pane (Windows Herdr 0.9.5, `HERDR_ENV=1`, `HERDR_PANE_ID=w3:p1`, pid 15944), invoking
`wsl.exe -d Ubuntu -- /home/mustarq/.local/bin/herdr <args>`. `WSLENV` is empty, so no `HERDR_*`
variable crosses into WSL; the WSL-side process has no pane context and uses the default socket.

| Call | Result |
|---|---|
| `--version`, `status` | 0.9.5, server running, protocol 22, socket `/home/mustarq/.config/herdr/herdr.sock` |
| `session list` | `default` running; `starq-wsl-deadpool` running (another department's session) |
| `agent list` (default) | `hermes` w1:p1 idle; `claude` w1:p4 idle, session `c92e9f2d-8a7b-4c0c-886f-40df8e72f350` |
| `--session starq-wsl-deadpool agent list` | `{"agents":[]}`; list only, nothing attached or created |
| `agent get w1:p4`, `pane process-info --pane w1:p4` | claude, fg pid 280490, cwd `/mnt/d/StarqTech/projects/starqerp` |
| `machine list` (Windows) | XPS-Windows, FORGE, S20PLUS. No profile for the local Ubuntu server |
| `machine list` (WSL), SSH in the distro | none; `ssh` inactive, nothing on :22 |

These are the three calls the dispatcher makes on a backend (`agent list`, `pane process-info`,
`agent prompt`), plus discovery.

## 2. Canary (one, identified)

- Binding checked immediately before: agent `claude`, status `idle`, session `c92e9f2d…`, fg pid
  280490, expected cwd. All matched the candidate seat `erp-wsl-verification`.
- Sent 2026-11-11 02:12:48 +05:00:
  `wsl.exe -d Ubuntu -- /home/mustarq/.local/bin/herdr agent prompt w1:p4 "<pointer to Room #18795>" --wait --timeout 60000`
- CLI result at 02:13:53: exit 1, `{"error":{"code":"timeout","message":"timed out waiting for agent status"}}`.
  This is the caller's 60 s wait expiring while the agent was still working, not a submit
  failure: a submit that produces no activity returns `agent_prompt_stalled` within 5 s.
  Not retried.
- After: `agent get w1:p4` showed `working`, same session, `state_change_seq` 12 → 17.
- Recipient evidence (Room #18797, the seat's own report): the pointer arrived as one single
  submitted prompt with the exact text; ACK #18796 and result #18797 followed under instance
  `claudewsl-wsl-w1p4-20261110`. The seat's pane has `HERDR_ENV=1`, `HERDR_PANE_ID=w1:p4`,
  `HERDR_SOCKET_PATH` = the default session socket.

**Finding:** Herdr 0.9.5 accepts `agent prompt` on the WSL default session from a `wsl.exe` caller
with no pane context. Discovery, binding check and prompt all work end to end for w1:p4.

**Finding for the dispatcher:** it must not use `--wait` semantics as a delivery verdict. It does
not pass `--wait` today (`agent prompt <pane> <text>` only), which is correct: exit 0 means
"submitted", and a wait timeout would otherwise be misread as a failure and retried.

## 3. Is that path supported? (open decision)

`herdr --skill` (both installs, 0.9.5) says an agent must be inside a Herdr pane
(`HERDR_ENV=1`) and must not "inspect or control the focused Herdr session from outside Herdr".
The only documented cross-server path is `herdr --machine <saved profile> agent prompt …`.
The binary does not enforce the rule; the skill is guidance for agent callers. The `wsl.exe`
caller is inside Windows Herdr but outside the WSL server.

So the `wsl.exe` path **works but is not the documented cross-server path**. Options:

1. Accept `wsl.exe` + absolute binary as the WSL backend for the dispatcher (a script, addressing
   an explicit pane id, never the focused pane). Works today; one canary of evidence.
2. Use the documented path: a saved machine profile for the Ubuntu server. Needs an SSH listener
   in the distro and `herdr machine add` by the operator; neither exists. Not done here: profiles
   are added only at the user's request, and it changes Herdr configuration.
3. Run the WSL leg from inside WSL (a dispatcher instance in a WSL pane). Rejected for now: it is
   a second dispatcher with its own state, and close to using a WSL agent as a relay.

The candidate seat table keeps `wsl/default` at `delivery: "unverified"` until Codex or the
Founder chooses; only its note was updated with this evidence. Under option 1 the change is that
one field. The named session `starq-wsl-deadpool` has no agents and is not a backend.

## 4. Founder messages: where they enter and why they carry no routing

Read-only trace of #18775 (`senderHandle: mustarq`, `senderInstanceId: starq-bot-gateway`,
`telegramUpdateId: 32613294`):

- Writer: the Windows StarqBot Telegram gateway, live-only file
  `agent-comms/scripts/starq-bot-gateway.mjs`, `founderSendArgv` (line 370). It spawns the live
  `send.mjs` with `--from mustarq --room --takeover --instance starq-bot-gateway --verified-via
  telegram … --subject --status --action-required --references --body <telegram text>`.
- Metadata: `telegramInboundStructuredMetadata` in live `room-structured-metadata.mjs` (line 8).
  It regex-scans the text for `@word`; if any is found the action is the fixed string
  "Respond in Room to this Founder-directed message", else `NONE`. Subject is
  "Founder Telegram message #<update id>".
- Audience: derived by ingress from `@handles` anywhere in the body. In #18775 that gave
  `["mustarq","codex"]` because the text contained "From: @mustarq" and "To: @codex".
- No `metadata.routing` is produced, and the live `send.mjs` has no `--routing-file`.

Consequences with the PR #3 dispatcher as it stands: such a record takes the legacy path.
`@codex` resolves to the single default seat (w1:p1). A bare `@claude` or `@antigravity` holds.
Any handle the Founder merely quotes or forwards is still treated as a recipient, and the
Founder's own handle lands in the audience. This is exactly the inference the task set out to
remove, and it cannot be removed downstream of the gateway.

## 5. How a new Founder message can carry validated recipients

A shared gateway change **is required**. Nothing below was implemented or deployed.

1. **Explicit address, not body scanning.** The gateway reads recipients only from a dedicated
   address line with a strict grammar, for example a first line
   `/to codex` or `/to claude role=ops-room-deputy; cursor`, and strips it from the body. Handles
   elsewhere in the text, including quoted and forwarded text, are never recipients.
2. **Validate before posting.** The gateway builds `{schema:"starq.routing/1", targets:[…]}` and
   passes it with `--routing-file` (PR #3 `send.mjs`), so `routingTargets.validateTarget` and the
   ingress checks apply: known active canonical handle, known fields only, recipient limit.
3. **Fail closed, visibly.** An address line that does not validate posts the message with no
   recipients and no action, and the gateway tells the Founder in Telegram what was rejected.
   It never falls back to body mentions.
4. **Unaddressed messages.** Policy choice for the Founder: either no recipient
   (`actionRequired NONE`, visible in Room only) or a configured default recipient, which today
   would be the Chief Engineer seat. The default must be configuration, not inference.
5. **Roles stay unverified at the gateway.** The gateway cannot see the seat table; a role or
   instance that matches no seat is published and then held by the dispatcher
   (`CONTRADICTORY_TARGET` / no seat), which is the existing behaviour for every sender.

Files that would change, all outside this branch's reach today:

| File | Where | Change |
|---|---|---|
| `scripts/starq-bot-gateway.mjs` (`founderSendArgv`) | live only, not in the repository | parse address line, write routing file, pass `--routing-file`, reject notice |
| `scripts/room-structured-metadata.mjs` (`telegramInboundStructuredMetadata`) | live only | stop deriving the action from `@word` matches |
| `scripts/send.mjs`, `protocol/v1/ingress.mjs`, `authorityPolicy.mjs`, `routingTargets.mjs` | live copies predate phase 2 | deploy the PR #3 versions |
| `watch/deadpool-room-watch.mjs` (`validateBrokerRecord`) | Deadpool gateway | pass metadata when re-deriving routing (see the 2026-11-10 note), or it rejects these records |

Preconditions: PR #3 reviewed and merged, the live-only gateway imported into the repository so
the change can be reviewed and tested, the Deadpool relay decision, and a gateway restart window
owned by the gateway's owner. The outbound Founder feed is unaffected: it selects on audience
containing the Founder for records sent *to* the Founder, not on inbound records.

## 6. Next safe gate

1. Codex or Founder decision on section 3 (accept `wsl.exe` backend, or require a machine profile).
2. Founder decision on the address grammar and the unaddressed-message default (section 5).
3. ERP Floor Lead's independent review of `61aa6de` (in progress, Room #18793).
4. Then, and only with explicit authorisation: the single-seat `--deliver --once` canary from the
   phase 2 review, in a state directory outside the live tree.
