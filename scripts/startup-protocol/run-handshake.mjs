import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { HerdrClient } from './herdr-client.mjs';
import { StateStore } from './state-store.mjs';
import { reconcileRun } from './reconcile.mjs';
import {
  captureBaseline,
  detectPromptDelivered,
  parseDownstreamTokens,
  parseStandaloneAck,
  slicePostBaseline,
} from './ack-parser.mjs';
import {
  makeAckToken,
  makeHandoffId,
  POLL_INTERVALS_MS,
  RETRY_POLICY,
  RUN_STATUS_BY_STEP,
  SEATS,
  STEP_ORDER,
  TIMEOUTS_MS,
} from './topology.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = resolve(__dir, '..', '..');

function defaultSleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function generateRunId() {
  const iso = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const rand = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, '0');
  return `${iso}-${rand}`;
}

function summarizeCounts(state) {
  let total = 0;
  let acked = 0;
  let missing = 0;
  let failed = 0;
  let skipped = 0;
  for (const step of STEP_ORDER) {
    const handoffs = Object.values(state.steps[step]?.handoffs ?? {});
    for (const h of handoffs) {
      total += 1;
      if (h.status === 'ACK') acked += 1;
      else if (h.status === 'MISSING') missing += 1;
      else if (h.status === 'FAILED') failed += 1;
      else if (h.status === 'SKIPPED') skipped += 1;
    }
  }
  state.summary.total_handoffs = total;
  state.summary.acked = acked;
  state.summary.missing = missing;
  state.summary.failed = failed;
  state.summary.skipped = skipped;
}

function recordHandoff(state, store, step, handoffId, ledgerRow, expectedToken = null) {
  const existing = state.steps[step].handoffs[handoffId] ?? {};
  state.steps[step].handoffs[handoffId] = {
    ...existing,
    status: ledgerRow.status,
    retry_count: ledgerRow.retry_count ?? existing.retry_count ?? 0,
    expected_token: expectedToken ?? existing.expected_token ?? null,
    acked_at: ledgerRow.acked_at ?? existing.acked_at ?? null,
  };
  summarizeCounts(state);
  store.appendLedger(ledgerRow);
  store.writeState(state);
}

/**
 * Execute a single Herdr handoff with pre-flight, baseline anchor, wait/poll,
 * strict ACK verification, and bounded diagnostic retry (never blind-resend).
 */
async function executeHandoff({
  client,
  store,
  state,
  step,
  fromPane,
  seat,
  promptText,
  promptMarker,
  expectedToken,
  downstreamExpected = null,
  timeoutMs,
  pollIntervalMs,
  dryRun = false,
  skipIfWorking = true,
  sleepFn = defaultSleep,
  abortCheck = null,
}) {
  const handoffId = makeHandoffId(state.run_id, step, fromPane, seat.address, 'request');
  const existing = state.steps[step].handoffs[handoffId];

  // Idempotency guard: never re-send an already-ACKed handoff
  if (existing?.status === 'ACK') {
    store.log('INFO', `Idempotent skip (already ACK): ${handoffId}`);
    return { status: 'ACK', skippedIdempotent: true, downstream: null };
  }

  if (dryRun) {
    recordHandoff(
      state,
      store,
      step,
      handoffId,
      {
        handoff_id: handoffId,
        run_id: state.run_id,
        step,
        from_pane: fromPane,
        to_pane: seat.address,
        direction: 'request',
        sent_at: null,
        acked_at: null,
        status: 'SKIPPED',
        evidence: 'dry_run mode: no prompt sent',
        retry_count: 0,
        notes: 'dry_run',
      },
      expectedToken
    );
    return { status: 'SKIPPED', downstream: null };
  }

  const maxRetries = RETRY_POLICY.maxRetries;
  const backoffMs = RETRY_POLICY.backoffMs[seat.machine] ?? 10_000;
  let retryCount = existing?.retry_count ?? 0;

  while (true) {
    if (abortCheck?.()) {
      const err = new Error('INTERRUPTED');
      err.code = 'INTERRUPTED';
      throw err;
    }

    // 1. Pre-flight pane check
    const plist = await client.paneList(seat.machine);
    if (!plist.ok) {
      recordHandoff(
        state,
        store,
        step,
        handoffId,
        {
          handoff_id: handoffId,
          run_id: state.run_id,
          step,
          from_pane: fromPane,
          to_pane: seat.address,
          direction: 'request',
          sent_at: null,
          acked_at: null,
          status: 'FAILED',
          evidence: plist.error ?? 'pane list failed',
          retry_count: retryCount,
          notes: 'herdr pane list unreachable',
        },
        expectedToken
      );
      return { status: 'FAILED', reason: 'herdr_unreachable', downstream: null };
    }

    const pane = plist.panes.find((p) => p.pane_id === seat.paneId);
    if (!pane) {
      recordHandoff(
        state,
        store,
        step,
        handoffId,
        {
          handoff_id: handoffId,
          run_id: state.run_id,
          step,
          from_pane: fromPane,
          to_pane: seat.address,
          direction: 'request',
          sent_at: null,
          acked_at: null,
          status: 'FAILED',
          evidence: `Pane ${seat.address} not found in pane list`,
          retry_count: retryCount,
          notes: 'pane_not_found',
        },
        expectedToken
      );
      return { status: 'FAILED', reason: 'pane_not_found', downstream: null };
    }

    if (pane.agent_status === 'blocked') {
      recordHandoff(
        state,
        store,
        step,
        handoffId,
        {
          handoff_id: handoffId,
          run_id: state.run_id,
          step,
          from_pane: fromPane,
          to_pane: seat.address,
          direction: 'request',
          sent_at: null,
          acked_at: null,
          status: 'FAILED',
          evidence: `Pre-flight agent_status=blocked on ${seat.address}; zero prompt sent`,
          retry_count: retryCount,
          notes: 'agent_blocked',
        },
        expectedToken
      );
      return { status: 'FAILED', reason: 'agent_blocked', downstream: null };
    }

    if (skipIfWorking && pane.agent_status === 'working') {
      recordHandoff(
        state,
        store,
        step,
        handoffId,
        {
          handoff_id: handoffId,
          run_id: state.run_id,
          step,
          from_pane: fromPane,
          to_pane: seat.address,
          direction: 'request',
          sent_at: null,
          acked_at: null,
          status: 'SKIPPED',
          evidence: `agent_status=working on ${seat.address}; skipped without interrupting`,
          retry_count: retryCount,
          notes: 'SKIPPED/busy',
        },
        expectedToken
      );
      return { status: 'SKIPPED', reason: 'busy', downstream: null };
    }

    // 2. Capture baseline readback anchor
    const baseRead = await client.agentRead(seat.machine, seat.paneId, {
      source: 'recent-unwrapped',
      lines: 120,
    });
    const anchorLines = baseRead.ok ? captureBaseline(baseRead.text) : [];

    // 3. Record PENDING
    const sentAt = new Date().toISOString();
    recordHandoff(
      state,
      store,
      step,
      handoffId,
      {
        handoff_id: handoffId,
        run_id: state.run_id,
        step,
        from_pane: fromPane,
        to_pane: seat.address,
        direction: 'request',
        sent_at: sentAt,
        acked_at: null,
        status: 'PENDING',
        evidence: `Dispatching to ${seat.address} (attempt ${retryCount + 1})`,
        retry_count: retryCount,
        notes: `expected_token=${expectedToken}`,
      },
      expectedToken
    );

    // 4. Send prompt
    const startMs = Date.now();
    const promptRes = await client.agentPrompt(seat.machine, seat.paneId, promptText, {
      wait: true,
      timeoutMs,
    });

    if (promptRes.status === 'agent_blocked') {
      recordHandoff(
        state,
        store,
        step,
        handoffId,
        {
          handoff_id: handoffId,
          run_id: state.run_id,
          step,
          from_pane: fromPane,
          to_pane: seat.address,
          direction: 'request',
          sent_at: sentAt,
          acked_at: null,
          status: 'FAILED',
          evidence: promptRes.stderr || promptRes.stdout || 'agent_blocked',
          retry_count: retryCount,
          notes: 'agent_blocked',
        },
        expectedToken
      );
      return { status: 'FAILED', reason: 'agent_blocked', downstream: null };
    }

    // 5. Poll readback until ACK or deadline
    const deadline = startMs + timeoutMs;
    let ackFound = null;
    let downstreamResults = null;
    let lastReadText = '';

    let shouldPoll = promptRes.status !== 'agent_prompt_stalled';
    if (!shouldPoll) {
      const stallRead = await client.agentRead(seat.machine, seat.paneId, {
        source: 'recent-unwrapped',
        lines: 120,
      });
      if (stallRead.ok) {
        const postLines = slicePostBaseline(stallRead.text, anchorLines);
        shouldPoll = detectPromptDelivered(postLines, promptMarker);
      }
    }

    if (shouldPoll) {
      while (true) {
        if (abortCheck?.()) {
          const err = new Error('INTERRUPTED');
          err.code = 'INTERRUPTED';
          throw err;
        }
        const readRes = await client.agentRead(seat.machine, seat.paneId, {
          source: 'recent-unwrapped',
          lines: 200,
        });
        if (readRes.ok) {
          lastReadText = readRes.text;
          const postLines = slicePostBaseline(readRes.text, anchorLines);
          const parsed = parseStandaloneAck(postLines, expectedToken);
          if (parsed.found) {
            ackFound = parsed;
            if (!downstreamExpected) {
              break;
            }
            downstreamResults = parseDownstreamTokens(postLines, downstreamExpected);
            const allDownstreamFound = Object.values(downstreamResults).every((r) => r.found);
            if (allDownstreamFound) {
              break;
            }
          }
        }
        if (Date.now() >= deadline) break;
        await sleepFn(Math.min(pollIntervalMs, Math.max(200, deadline - Date.now())));
      }
    }

    if (ackFound) {
      const ackedAt = new Date().toISOString();
      const elapsedMs = Date.now() - startMs;
      const evidencePath = store.writeReadbackEvidence(handoffId, retryCount + 1, lastReadText);
      recordHandoff(
        state,
        store,
        step,
        handoffId,
        {
          handoff_id: handoffId,
          run_id: state.run_id,
          step,
          from_pane: fromPane,
          to_pane: seat.address,
          direction: 'request',
          sent_at: sentAt,
          acked_at: ackedAt,
          status: 'ACK',
          evidence: `${ackFound.line} (file: ${evidencePath})`,
          retry_count: retryCount,
          notes: `verified in ${elapsedMs}ms`,
        },
        expectedToken
      );
      return { status: 'ACK', elapsedMs, downstream: downstreamResults, readText: lastReadText };
    }

    // 6. Diagnostic gate before any retry (NO blind resend)
    const diagList = await client.paneList(seat.machine);
    const diagPane = diagList.ok ? diagList.panes.find((p) => p.pane_id === seat.paneId) : null;
    const diagRead = await client.agentRead(seat.machine, seat.paneId, {
      source: 'recent-unwrapped',
      lines: 120,
    });
    const diagPost = diagRead.ok ? slicePostBaseline(diagRead.text, anchorLines) : [];
    const wasDelivered = detectPromptDelivered(diagPost, promptMarker);
    const isStalledOrTransportErr =
      promptRes.status === 'agent_prompt_stalled' || promptRes.status === 'error';

    const canRetry =
      retryCount < maxRetries &&
      isStalledOrTransportErr &&
      !wasDelivered &&
      diagPane?.agent_status !== 'working' &&
      diagPane?.agent_status !== 'blocked';

    const failStatus = promptRes.status === 'agent_prompt_stalled' || !promptRes.ok ? 'FAILED' : 'MISSING';
    const diagNote = `diag: promptRes=${promptRes.status}, delivered=${wasDelivered}, agent_status=${diagPane?.agent_status ?? 'unknown'}`;

    store.writeReadbackEvidence(handoffId, retryCount + 1, diagRead.text || lastReadText || '');
    recordHandoff(
      state,
      store,
      step,
      handoffId,
      {
        handoff_id: handoffId,
        run_id: state.run_id,
        step,
        from_pane: fromPane,
        to_pane: seat.address,
        direction: 'request',
        sent_at: sentAt,
        acked_at: null,
        status: failStatus,
        evidence: `${failStatus} on ${seat.address} (${diagNote})`,
        retry_count: retryCount,
        notes: canRetry ? 'diagnostic passed; scheduling bounded retry' : 'diagnostic blocked retry; escalate',
      },
      expectedToken
    );

    if (!canRetry) {
      return { status: failStatus, reason: diagNote, downstream: null };
    }

    retryCount += 1;
    store.log('WARN', `Diagnostic retry ${retryCount}/${maxRetries} for ${handoffId} after ${backoffMs}ms`);
    await sleepFn(backoffMs);
  }
}

function escalateAndStop(state, store, { handoffId, reason, diagnostic }) {
  state.status = 'BLOCKED_ESCALATE';
  state.escalation = {
    handoff_id: handoffId,
    reason,
    diagnostic,
    escalated_to: `OPS_VISION (${SEATS.OPS_VISION.address}) -> Command Vision (thr_7gyyc4dv22)`,
    at: new Date().toISOString(),
  };
  for (const step of STEP_ORDER) {
    if (state.steps[step].status === 'PENDING') {
      state.steps[step].status = 'SKIPPED';
    }
  }
  summarizeCounts(state);
  store.writeState(state);
  store.log('ERROR', `BLOCKED_ESCALATE: ${reason}`, state.escalation);
  return { state, store };
}

/**
 * Main orchestrator entrypoint (usable from CLI and tests).
 */
export async function runHandshake({
  repoRoot = DEFAULT_REPO_ROOT,
  runId = null,
  resume = false,
  dryRun = false,
  mode = null,
  client = new HerdrClient(),
  sleepFn = defaultSleep,
  abortSignal = null,
  onStepComplete = null,
  timeouts = TIMEOUTS_MS,
  pollIntervals = POLL_INTERVALS_MS,
} = {}) {
  const effectiveRunId = runId || generateRunId();
  const effectiveMode = mode ?? (dryRun ? 'dry_run' : 'live');
  const store = new StateStore(repoRoot, effectiveRunId);

  let interrupted = false;
  if (abortSignal) {
    if (abortSignal.aborted) interrupted = true;
    else abortSignal.addEventListener('abort', () => { interrupted = true; }, { once: true });
  }
  const sigintHandler = () => { interrupted = true; };
  process.on('SIGINT', sigintHandler);

  let state;
  let currentSnapshot = null;

  try {
    if (resume) {
      const loaded = store.loadAndReconcileForResume();
      state = loaded.state;
      if (state.status === 'READY_FOR_FOUNDER_GATE') {
        store.log('INFO', `Idempotent no-op: run ${effectiveRunId} already READY_FOR_FOUNDER_GATE`);
        return { state, store, alreadyComplete: true };
      }
      if (state.status === 'BLOCKED_ESCALATE') {
        store.log('WARN', `Run ${effectiveRunId} is BLOCKED_ESCALATE; cannot resume without remediation`);
        return { state, store, blocked: true };
      }
      store.log('INFO', `Resuming run ${effectiveRunId} from step ${state.current_step}`);
    } else {
      state = store.createInitialState(effectiveMode);
      store.writeState(state);
      store.log('INFO', `Initialized run ${effectiveRunId} (mode=${effectiveMode})`);
    }

    // Capture live/mock topology snapshot
    const [localList, xpsList] = await Promise.all([
      client.paneList('local'),
      client.paneList('XPS'),
    ]);
    if (!localList.ok && !dryRun) {
      return escalateAndStop(store ? state : state, store, {
        handoffId: makeHandoffId(effectiveRunId, 'S1', 'orchestrator', 'local', 'request'),
        reason: 'local_herdr_unreachable',
        diagnostic: localList.error,
      });
    }
    currentSnapshot = {
      captured_at: new Date().toISOString(),
      local: localList.panes ?? [],
      XPS: xpsList.ok ? xpsList.panes ?? [] : [],
      xps_error: xpsList.ok ? null : xpsList.error,
    };
    store.writeTopologySnapshot(currentSnapshot);

    const checkAbort = () => interrupted;

    for (const step of STEP_ORDER) {
      if (state.steps[step].status === 'COMPLETED') {
        store.log('INFO', `Skipping completed step ${step}`);
        continue;
      }

      if (checkAbort()) {
        state.status = 'PAUSED';
        store.writeState(state);
        return { state, store, paused: true };
      }

      state.current_step = step;
      state.status = RUN_STATUS_BY_STEP[step];
      state.steps[step].status = 'IN_PROGRESS';
      state.steps[step].started_at ??= new Date().toISOString();
      store.writeState(state);

      if (step === 'S1') {
        // Step 1: Ops Room liveness verification (no unnecessary LLM burn; w3:p2 is executor)
        const s1Handoff = makeHandoffId(effectiveRunId, 'S1', SEATS.OPS_VISION.address, SEATS.OPS_AG.address, 'request');
        if (state.steps.S1.handoffs[s1Handoff]?.status !== 'ACK') {
          if (dryRun) {
            recordHandoff(state, store, 'S1', s1Handoff, {
              handoff_id: s1Handoff,
              run_id: effectiveRunId,
              step: 'S1',
              from_pane: SEATS.OPS_VISION.address,
              to_pane: SEATS.OPS_AG.address,
              direction: 'request',
              sent_at: null,
              acked_at: null,
              status: 'SKIPPED',
              evidence: 'dry_run mode: S1 init skipped',
              retry_count: 0,
              notes: 'dry_run',
            });
          } else {
            const p1 = currentSnapshot.local.find((p) => p.pane_id === SEATS.OPS_VISION.paneId);
            const p2 = currentSnapshot.local.find((p) => p.pane_id === SEATS.OPS_AG.paneId);
            if (!p1 || !p2) {
              state.steps.S1.status = 'FAILED';
              return escalateAndStop(state, store, {
                handoffId: s1Handoff,
                reason: 'ops_room_pane_missing',
                diagnostic: `p1=${Boolean(p1)} p2=${Boolean(p2)}`,
              });
            }
            const now = new Date().toISOString();
            recordHandoff(state, store, 'S1', s1Handoff, {
              handoff_id: s1Handoff,
              run_id: effectiveRunId,
              step: 'S1',
              from_pane: SEATS.OPS_VISION.address,
              to_pane: SEATS.OPS_AG.address,
              direction: 'request',
              sent_at: now,
              acked_at: now,
              status: 'ACK',
              evidence: `S1 liveness verified: ${SEATS.OPS_VISION.address}=${p1.agent_status}, ${SEATS.OPS_AG.address}=${p2.agent_status}`,
              retry_count: 0,
              notes: 'top-of-chain init verified via pane list',
            });
          }
        }
        state.steps.S1.status = 'COMPLETED';
        state.steps.S1.completed_at = new Date().toISOString();
        store.writeState(state);
      } else if (step === 'S2') {
        // Step 2: Hybrid chain via ERP Vision (w4:p1) -> PICARD (w4:p2)
        const erpHandoffId = makeHandoffId(effectiveRunId, 'S2', 'orchestrator', SEATS.ERP_VISION.address, 'request');
        const picardHandoffId = makeHandoffId(effectiveRunId, 'S2', SEATS.ERP_VISION.address, SEATS.PICARD.address, 'request');
        const erpToken = makeAckToken(effectiveRunId, 'S2', SEATS.ERP_VISION.tag, erpHandoffId);
        const picardToken = makeAckToken(effectiveRunId, 'S2', SEATS.PICARD.tag, picardHandoffId);
        const marker = `HANDSHAKE-${effectiveRunId}-S2`;

        const prompt =
          `[${marker}] Startup handshake S2: obtain PICARD's readiness ACK from w4:p2 ` +
          `(run: herdr agent prompt w4:p2 "Startup handshake S2: reply on a new line with token ${picardToken}"), ` +
          `then reply on its own line with token ${erpToken} and include ${picardToken}.`;

        const res = await executeHandoff({
          client,
          store,
          state,
          step: 'S2',
          fromPane: 'orchestrator',
          seat: SEATS.ERP_VISION,
          promptText: prompt,
          promptMarker: marker,
          expectedToken: erpToken,
          downstreamExpected: { PICARD: picardToken },
          timeoutMs: timeouts.localChain,
          pollIntervalMs: pollIntervals.local,
          dryRun,
          sleepFn,
          abortCheck: checkAbort,
        });

        if (res.status === 'FAILED' || res.status === 'MISSING') {
          state.steps.S2.status = 'FAILED';
          return escalateAndStop(state, store, {
            handoffId: erpHandoffId,
            reason: `S2_${res.status}`,
            diagnostic: res.reason ?? res.status,
          });
        }

        if (state.steps.S2.handoffs[picardHandoffId]?.status !== 'ACK') {
          if (res.status === 'SKIPPED') {
            recordHandoff(state, store, 'S2', picardHandoffId, {
              handoff_id: picardHandoffId,
              run_id: effectiveRunId,
              step: 'S2',
              from_pane: SEATS.ERP_VISION.address,
              to_pane: SEATS.PICARD.address,
              direction: 'request',
              sent_at: null,
              acked_at: null,
              status: 'SKIPPED',
              evidence: `Upstream w4:p1 skipped (${res.reason ?? 'dry_run'})`,
              retry_count: 0,
              notes: res.reason === 'busy' ? 'SKIPPED/busy' : 'dry_run',
            }, picardToken);
          } else {
            const pFound = res.downstream?.PICARD?.found;
            if (!pFound) {
              state.steps.S2.status = 'FAILED';
              recordHandoff(state, store, 'S2', picardHandoffId, {
                handoff_id: picardHandoffId,
                run_id: effectiveRunId,
                step: 'S2',
                from_pane: SEATS.ERP_VISION.address,
                to_pane: SEATS.PICARD.address,
                direction: 'request',
                sent_at: new Date().toISOString(),
                acked_at: null,
                status: 'MISSING',
                evidence: 'ERP Vision replied without PICARD token',
                retry_count: 0,
                notes: 'downstream_token_missing',
              }, picardToken);
              return escalateAndStop(state, store, {
                handoffId: picardHandoffId,
                reason: 'S2_PICARD_TOKEN_MISSING',
                diagnostic: 'Consolidated reply from w4:p1 lacked PICARD token',
              });
            }
            const now = new Date().toISOString();
            recordHandoff(state, store, 'S2', picardHandoffId, {
              handoff_id: picardHandoffId,
              run_id: effectiveRunId,
              step: 'S2',
              from_pane: SEATS.ERP_VISION.address,
              to_pane: SEATS.PICARD.address,
              direction: 'request',
              sent_at: now,
              acked_at: now,
              status: 'ACK',
              evidence: `Consolidated via w4:p1: ${res.downstream.PICARD.line}`,
              retry_count: 0,
              notes: 'verified_via_chain',
            }, picardToken);
          }
        }

        state.steps.S2.status = 'COMPLETED';
        state.steps.S2.completed_at = new Date().toISOString();
        store.writeState(state);
      } else if (step === 'S3') {
        // Step 3: Hybrid chain via Hoadhaa Vision (w2:p8) -> DEADPOOL (XPS:w2:p1) -> {JARVIS (XPS:w2:p2), XPS_AG (XPS:w2:p3)}
        const hvHandoffId = makeHandoffId(effectiveRunId, 'S3', 'orchestrator', SEATS.HOADHAA_VISION.address, 'request');
        const dpHandoffId = makeHandoffId(effectiveRunId, 'S3', SEATS.HOADHAA_VISION.address, SEATS.DEADPOOL.address, 'request');
        const jvHandoffId = makeHandoffId(effectiveRunId, 'S3', SEATS.DEADPOOL.address, SEATS.JARVIS.address, 'request');
        const xagHandoffId = makeHandoffId(effectiveRunId, 'S3', SEATS.DEADPOOL.address, SEATS.XPS_AG.address, 'request');

        const hvToken = makeAckToken(effectiveRunId, 'S3', SEATS.HOADHAA_VISION.tag, hvHandoffId);
        const dpToken = makeAckToken(effectiveRunId, 'S3', SEATS.DEADPOOL.tag, dpHandoffId);
        const jvToken = makeAckToken(effectiveRunId, 'S3', SEATS.JARVIS.tag, jvHandoffId);
        const xagToken = makeAckToken(effectiveRunId, 'S3', SEATS.XPS_AG.tag, xagHandoffId);
        const marker = `HANDSHAKE-${effectiveRunId}-S3`;

        const prompt =
          `[${marker}] Startup handshake S3: instruct DEADPOOL (herdr --machine XPS agent prompt w2:p1) ` +
          `to obtain SEPARATE readiness ACKs from JARVIS (XPS w2:p2, token ${jvToken}) and XPS AG (XPS w2:p3, token ${xagToken}), ` +
          `consolidate with DEADPOOL token ${dpToken}, and reply to you. ` +
          `Once received, reply on its own line with token ${hvToken} and include ${dpToken}, ${jvToken}, and ${xagToken}.`;

        const res = await executeHandoff({
          client,
          store,
          state,
          step: 'S3',
          fromPane: 'orchestrator',
          seat: SEATS.HOADHAA_VISION,
          promptText: prompt,
          promptMarker: marker,
          expectedToken: hvToken,
          downstreamExpected: {
            DEADPOOL: dpToken,
            JARVIS: jvToken,
            XPS_AG: xagToken,
          },
          timeoutMs: timeouts.xpsChain,
          pollIntervalMs: pollIntervals.xps,
          dryRun,
          sleepFn,
          abortCheck: checkAbort,
        });

        if (res.status === 'FAILED' || res.status === 'MISSING') {
          state.steps.S3.status = 'FAILED';
          return escalateAndStop(state, store, {
            handoffId: hvHandoffId,
            reason: `S3_${res.status}`,
            diagnostic: res.reason ?? res.status,
          });
        }

        if (res.elapsedMs != null) {
          state.summary.xps_latencies_ms.push(res.elapsedMs);
        }

        const downstreamSpecs = [
          { key: 'DEADPOOL', id: dpHandoffId, from: SEATS.HOADHAA_VISION.address, to: SEATS.DEADPOOL.address, token: dpToken },
          { key: 'JARVIS', id: jvHandoffId, from: SEATS.DEADPOOL.address, to: SEATS.JARVIS.address, token: jvToken },
          { key: 'XPS_AG', id: xagHandoffId, from: SEATS.DEADPOOL.address, to: SEATS.XPS_AG.address, token: xagToken },
        ];

        for (const spec of downstreamSpecs) {
          if (state.steps.S3.handoffs[spec.id]?.status === 'ACK') continue;
          if (res.status === 'SKIPPED') {
            recordHandoff(state, store, 'S3', spec.id, {
              handoff_id: spec.id,
              run_id: effectiveRunId,
              step: 'S3',
              from_pane: spec.from,
              to_pane: spec.to,
              direction: 'request',
              sent_at: null,
              acked_at: null,
              status: 'SKIPPED',
              evidence: `Upstream w2:p8 skipped (${res.reason ?? 'dry_run'})`,
              retry_count: 0,
              notes: res.reason === 'busy' ? 'SKIPPED/busy' : 'dry_run',
            }, spec.token);
          } else {
            const foundObj = res.downstream?.[spec.key];
            if (!foundObj?.found) {
              state.steps.S3.status = 'FAILED';
              recordHandoff(state, store, 'S3', spec.id, {
                handoff_id: spec.id,
                run_id: effectiveRunId,
                step: 'S3',
                from_pane: spec.from,
                to_pane: spec.to,
                direction: 'request',
                sent_at: new Date().toISOString(),
                acked_at: null,
                status: 'MISSING',
                evidence: `Hoadhaa Vision reply lacked ${spec.key} token`,
                retry_count: 0,
                notes: 'downstream_token_missing',
              }, spec.token);
              return escalateAndStop(state, store, {
                handoffId: spec.id,
                reason: `S3_${spec.key}_TOKEN_MISSING`,
                diagnostic: `Consolidated reply from w2:p8 lacked ${spec.key} token`,
              });
            }
            const now = new Date().toISOString();
            recordHandoff(state, store, 'S3', spec.id, {
              handoff_id: spec.id,
              run_id: effectiveRunId,
              step: 'S3',
              from_pane: spec.from,
              to_pane: spec.to,
              direction: 'request',
              sent_at: now,
              acked_at: now,
              status: 'ACK',
              evidence: `Consolidated via w2:p8: ${foundObj.line}`,
              retry_count: 0,
              notes: 'verified_via_chain',
            }, spec.token);
          }
        }

        state.steps.S3.status = 'COMPLETED';
        state.steps.S3.completed_at = new Date().toISOString();
        store.writeState(state);
      } else if (step === 'S4') {
        // Step 4: Reconcile + deliver consolidated readiness to Ops Room Vision (w3:p1)
        const prior = store.findPriorCompletedSnapshot();
        const rec = reconcileRun({ store, currentSnapshot, prior });
        state.summary.changes_detected = rec.changesDetected;
        store.writeState(state);

        const s4HandoffId = makeHandoffId(effectiveRunId, 'S4', 'orchestrator', SEATS.OPS_VISION.address, 'request');
        const s4Token = makeAckToken(effectiveRunId, 'S4', SEATS.OPS_VISION.tag, s4HandoffId);
        const marker = `HANDSHAKE-${effectiveRunId}-S4`;

        const prompt =
          `[${marker}] Startup handshake S4 complete (run=${effectiveRunId}): ` +
          `acked=${state.summary.acked}, skipped=${state.summary.skipped}, changes_detected=${rec.changesDetected}. ` +
          `State: ${store.statePath}. Reply on its own line with token ${s4Token}.`;

        const res = await executeHandoff({
          client,
          store,
          state,
          step: 'S4',
          fromPane: 'orchestrator',
          seat: SEATS.OPS_VISION,
          promptText: prompt,
          promptMarker: marker,
          expectedToken: s4Token,
          timeoutMs: timeouts.finalize,
          pollIntervalMs: pollIntervals.local,
          dryRun,
          sleepFn,
          abortCheck: checkAbort,
        });

        if (res.status === 'FAILED' || res.status === 'MISSING') {
          state.steps.S4.status = 'FAILED';
          return escalateAndStop(state, store, {
            handoffId: s4HandoffId,
            reason: `S4_${res.status}`,
            diagnostic: res.reason ?? res.status,
          });
        }

        state.steps.S4.status = 'COMPLETED';
        state.steps.S4.completed_at = new Date().toISOString();
        store.writeState(state);
      }

      if (onStepComplete) {
        await onStepComplete(step, state);
      }
      if (checkAbort()) {
        state.status = 'PAUSED';
        store.writeState(state);
        return { state, store, paused: true };
      }
    }

    // Halt at READY_FOR_FOUNDER_GATE; NEVER trigger Step 5
    state.current_step = null;
    state.status = 'READY_FOR_FOUNDER_GATE';
    state.completed_at = new Date().toISOString();
    summarizeCounts(state);
    store.writeState(state);
    store.log('INFO', `Run ${effectiveRunId} halted at READY_FOR_FOUNDER_GATE (Step 5 not triggered)`);
    return { state, store };
  } catch (err) {
    if (err?.code === 'INTERRUPTED') {
      state.status = 'PAUSED';
      store.writeState(state);
      store.log('WARN', `Run ${effectiveRunId} interrupted; saved PAUSED state`);
      return { state, store, paused: true };
    }
    throw err;
  } finally {
    process.off('SIGINT', sigintHandler);
  }
}

function parseCliArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--resume') out.resume = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--live') out.live = true;
    else if (arg === '--run-id') { out.runId = argv[++i]; }
    else if (arg === '--repo-root') { out.repoRoot = argv[++i]; }
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.dryRun && !args.live && !args.resume) {
    console.error('Usage: node run-handshake.mjs [--dry-run | --live | --resume --run-id <id>]');
    process.exit(2);
  }
  runHandshake({
    repoRoot: args.repoRoot ?? DEFAULT_REPO_ROOT,
    runId: args.runId ?? null,
    resume: Boolean(args.resume),
    dryRun: Boolean(args.dryRun),
  })
    .then((res) => {
      console.log(
        JSON.stringify(
          {
            run_id: res.state.run_id,
            status: res.state.status,
            summary: res.state.summary,
            state_path: res.store.statePath,
            ledger_path: res.store.ledgerPath,
          },
          null,
          2
        )
      );
      if (res.state.status === 'BLOCKED_ESCALATE') process.exit(1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
