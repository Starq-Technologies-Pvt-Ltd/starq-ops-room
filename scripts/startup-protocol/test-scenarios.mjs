import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HerdrClient } from './herdr-client.mjs';
import { reconcileRun } from './reconcile.mjs';
import { runHandshake } from './run-handshake.mjs';
import { StateStore } from './state-store.mjs';

const FAST_TIMEOUTS = { local: 200, localChain: 200, xpsChain: 200, finalize: 200 };
const FAST_POLL = { local: 10, xps: 10 };
const fastSleep = () => Promise.resolve();

function makeDefaultPanes() {
  return {
    local: [
      { pane_id: 'w3:p3', agent: 'hermes', agent_status: 'idle', cwd: 'D:\\StarqTech\\starq-ops-room', label: 'Ops Vision' },
      { pane_id: 'w3:p2', agent: 'agy', agent_status: 'working', cwd: 'D:\\StarqTech\\starq-ops-room', label: 'Ops AG' },
      { pane_id: 'w4:p1', agent: 'hermes', agent_status: 'idle', cwd: 'D:\\StarqTech\\Projects\\StarqERP', label: 'ERP Vision' },
      { pane_id: 'w4:p2', agent: 'hermes', agent_status: 'idle', cwd: 'D:\\StarqTech\\Projects\\StarqERP', label: 'PICARD' },
      { pane_id: 'w2:p8', agent: 'hermes', agent_status: 'idle', cwd: 'D:\\StarqTech\\Projects\\Hoadhaa', label: 'Hoadhaa Vision' },
    ],
    XPS: [
      { pane_id: 'w2:p1', agent: 'hermes', agent_status: 'idle', cwd: '/home/mustarq', label: 'DEADPOOL' },
      { pane_id: 'w2:p2', agent: 'hermes', agent_status: 'idle', cwd: '/home/mustarq/Work/jarvis', label: 'JARVIS' },
      { pane_id: 'w2:p3', agent: 'agy', agent_status: 'done', cwd: '/home/mustarq/Work', label: 'AG' },
    ],
  };
}

class MockHerdrTransport {
  constructor({ panesByMachine = makeDefaultPanes(), behavior = {} } = {}) {
    this.panesByMachine = panesByMachine;
    this.behavior = behavior; // { [paneId]: 'ack' | 'silent_after_delivery' | 'blocked' }
    this.readBuffers = new Map();
    this.promptCalls = [];
  }

  _key(machine, paneId) {
    return `${machine}:${paneId}`;
  }

  async paneList(machine = 'local') {
    return { ok: true, panes: this.panesByMachine[machine] ?? [], error: null };
  }

  async agentRead(machine = 'local', paneId) {
    const k = this._key(machine, paneId);
    const buf = this.readBuffers.get(k) ?? 'initial prompt>\n';
    return { ok: true, text: buf, error: null };
  }

  async agentPrompt(machine = 'local', paneId, text) {
    this.promptCalls.push({ machine, paneId, text });
    const k = this._key(machine, paneId);
    const mode = this.behavior[paneId] ?? 'ack';

    if (mode === 'blocked') {
      return { ok: false, code: 1, status: 'agent_blocked', stdout: '', stderr: 'agent_blocked' };
    }

    const prev = this.readBuffers.get(k) ?? 'initial prompt>\n';
    if (mode === 'silent_after_delivery') {
      // Echoes the prompt marker (proving delivery) but emits NO ACK token
      this.readBuffers.set(k, `${prev}${text}\n(idle without ack)\n`);
      return { ok: true, code: 0, status: 'ok', stdout: '', stderr: '' };
    }

    // Extract all ACK::... tokens from the prompt and emit them as standalone lines
    const tokens = text.match(/ACK::[A-Za-z0-9_-]+::S[1-4]::[A-Z0-9_-]+::[0-9a-f]{4}/g) ?? [];
    const replyLines = tokens.map((t) => t).join('\n');
    this.readBuffers.set(k, `${prev}${text}\n${replyLines}\n`);
    return { ok: true, code: 0, status: 'ok', stdout: '', stderr: '' };
  }
}

async function runAll() {
  const testRoot = mkdtempSync(join(tmpdir(), 'starq-handshake-test-'));
  const results = [];

  try {
    // 1. Dry-run topology (mock transport, --dry-run)
    {
      const transport = new MockHerdrTransport();
      const client = new HerdrClient(transport);
      const { state, store } = await runHandshake({
        repoRoot: testRoot,
        runId: 'sc1-dryrun',
        dryRun: true,
        client,
        sleepFn: fastSleep,
        timeouts: FAST_TIMEOUTS,
        pollIntervals: FAST_POLL,
      });
      assert.equal(state.status, 'READY_FOR_FOUNDER_GATE');
      assert.equal(transport.promptCalls.length, 0, 'dry-run must send 0 prompts');
      assert.ok(existsSync(store.snapshotPath), 'topology_snapshot.json must exist');
      const ledger = store.readLedger();
      assert.ok(ledger.length > 0 && ledger.every((r) => r.status === 'SKIPPED'));
      results.push({ scenario: 1, name: 'Dry-run topology', status: 'PASS', prompts: transport.promptCalls.length, skipped: ledger.length });
    }

    // 2. Induced interruption (mock) — abort mid-S2
    {
      const transport = new MockHerdrTransport();
      const client = new HerdrClient(transport);
      const ac = new AbortController();
      const { state, store, paused } = await runHandshake({
        repoRoot: testRoot,
        runId: 'sc2-interrupt',
        mode: 'mock',
        client,
        sleepFn: fastSleep,
        abortSignal: ac.signal,
        onStepComplete: async (step) => {
          if (step === 'S2') ac.abort();
        },
        timeouts: FAST_TIMEOUTS,
        pollIntervals: FAST_POLL,
      });
      assert.equal(paused, true);
      assert.equal(state.status, 'PAUSED');
      assert.equal(state.steps.S1.status, 'COMPLETED');
      assert.equal(state.steps.S2.status, 'COMPLETED');
      assert.equal(state.steps.S3.status, 'PENDING');
      const ledger = store.readLedger(); // parses every line cleanly -> no partial lines
      assert.ok(ledger.length >= 3);
      results.push({ scenario: 2, name: 'Induced interruption', status: 'PASS', pausedAt: state.current_step, ledgerLines: ledger.length });
    }

    // 3a. Induced MISSING (delivered-but-silent -> diagnostic blocks blind resend -> BLOCKED_ESCALATE)
    {
      const transport = new MockHerdrTransport({ behavior: { 'w4:p1': 'silent_after_delivery' } });
      const client = new HerdrClient(transport);
      const { state, store } = await runHandshake({
        repoRoot: testRoot,
        runId: 'sc3a-missing',
        mode: 'mock',
        client,
        sleepFn: fastSleep,
        timeouts: FAST_TIMEOUTS,
        pollIntervals: FAST_POLL,
      });
      assert.equal(state.status, 'BLOCKED_ESCALATE');
      assert.equal(transport.promptCalls.filter((c) => c.paneId === 'w4:p1').length, 1, 'must NOT blind-resend when delivered');
      const ledger = store.readLedger();
      assert.ok(ledger.some((r) => r.status === 'MISSING' && r.notes.includes('diagnostic blocked retry')));
      results.push({ scenario: '3a', name: 'Induced MISSING (no blind resend)', status: 'PASS', promptsToW4p1: 1, finalStatus: state.status });
    }

    // 3b. Induced FAILED (agent_blocked -> zero prompt sent -> BLOCKED_ESCALATE)
    {
      const panes = makeDefaultPanes();
      panes.local.find((p) => p.pane_id === 'w4:p1').agent_status = 'blocked';
      const transport = new MockHerdrTransport({ panesByMachine: panes });
      const client = new HerdrClient(transport);
      const { state, store } = await runHandshake({
        repoRoot: testRoot,
        runId: 'sc3b-blocked',
        mode: 'mock',
        client,
        sleepFn: fastSleep,
        timeouts: FAST_TIMEOUTS,
        pollIntervals: FAST_POLL,
      });
      assert.equal(state.status, 'BLOCKED_ESCALATE');
      assert.equal(transport.promptCalls.filter((c) => c.paneId === 'w4:p1').length, 0, 'zero prompt sent on agent_blocked');
      const ledger = store.readLedger();
      assert.ok(ledger.some((r) => r.status === 'FAILED' && r.notes === 'agent_blocked'));
      results.push({ scenario: '3b', name: 'Induced FAILED (agent_blocked)', status: 'PASS', promptsToW4p1: 0, finalStatus: state.status });
    }

    // 4. Resume after Scenario 2
    {
      const transport = new MockHerdrTransport();
      const client = new HerdrClient(transport);
      const { state, store } = await runHandshake({
        repoRoot: testRoot,
        runId: 'sc2-interrupt',
        resume: true,
        client,
        sleepFn: fastSleep,
        timeouts: FAST_TIMEOUTS,
        pollIntervals: FAST_POLL,
      });
      assert.equal(state.status, 'READY_FOR_FOUNDER_GATE');
      assert.equal(transport.promptCalls.filter((c) => c.paneId === 'w4:p1').length, 0, 'S2 already COMPLETED must not re-run');
      assert.equal(transport.promptCalls.filter((c) => c.paneId === 'w2:p8').length, 1);
      assert.equal(transport.promptCalls.filter((c) => c.paneId === 'w3:p3').length, 1);
      results.push({ scenario: 4, name: 'Resume', status: 'PASS', promptsSentOnResume: transport.promptCalls.length, finalStatus: state.status });
    }

    // 5. Idempotency (re-run --resume on completed sc2-interrupt)
    {
      const storeBefore = new StateStore(testRoot, 'sc2-interrupt');
      const linesBefore = storeBefore.readLedger().length;
      const transport = new MockHerdrTransport();
      const client = new HerdrClient(transport);
      const { state, alreadyComplete } = await runHandshake({
        repoRoot: testRoot,
        runId: 'sc2-interrupt',
        resume: true,
        client,
        sleepFn: fastSleep,
        timeouts: FAST_TIMEOUTS,
        pollIntervals: FAST_POLL,
      });
      const linesAfter = storeBefore.readLedger().length;
      assert.equal(alreadyComplete, true);
      assert.equal(state.status, 'READY_FOR_FOUNDER_GATE');
      assert.equal(transport.promptCalls.length, 0);
      assert.equal(linesAfter, linesBefore);
      results.push({ scenario: 5, name: 'Idempotency', status: 'PASS', newPrompts: 0, ledgerLinesUnchanged: linesAfter });
    }

    // 6. Doc-update-only-on-change (mock reconcile)
    {
      const storeSame = new StateStore(testRoot, 'sc6-same');
      const snapA = makeDefaultPanes();
      const recSame = reconcileRun({
        store: storeSame,
        currentSnapshot: snapA,
        prior: { runId: 'prior-1', snapshot: snapA },
      });
      assert.equal(recSame.changesDetected, false);
      assert.equal(recSame.sopDeltaPath, null);
      assert.equal(existsSync(storeSame.sopDeltaPath), false);

      const storeChanged = new StateStore(testRoot, 'sc6-changed');
      const snapB = makeDefaultPanes();
      snapB.local.find((p) => p.pane_id === 'w4:p2').cwd = 'D:\\StarqTech\\Projects\\StarqERP-v2';
      const recChanged = reconcileRun({
        store: storeChanged,
        currentSnapshot: snapB,
        prior: { runId: 'prior-1', snapshot: snapA },
      });
      assert.equal(recChanged.changesDetected, true);
      assert.ok(recChanged.sopDeltaPath && existsSync(recChanged.sopDeltaPath));
      const deltaText = readFileSync(recChanged.sopDeltaPath, 'utf8');
      assert.ok(deltaText.includes('local:w4:p2'));
      results.push({ scenario: 6, name: 'Doc-update-only-on-change', status: 'PASS', sameChanges: false, changedDeltaWritten: true });
    }

    // 7. Primary-token-first poll wait (primary arrives on poll 1, downstream on poll 2)
    {
      const transport = new MockHerdrTransport();
      let deferredPicardToken = null;
      let w4p1PostPromptReads = 0;
      const origPrompt = transport.agentPrompt.bind(transport);
      const origRead = transport.agentRead.bind(transport);
      transport.agentPrompt = async (machine, paneId, text) => {
        if (paneId === 'w4:p1') {
          transport.promptCalls.push({ machine, paneId, text });
          const tokens = text.match(/ACK::[A-Za-z0-9_-]+::S[1-4]::[A-Z0-9_-]+::[0-9a-f]{4}/g) ?? [];
          const erpToken = tokens.find((t) => t.includes('::ERP_VISION::'));
          deferredPicardToken = tokens.find((t) => t.includes('::PICARD::'));
          const prev = transport.readBuffers.get('local:w4:p1') ?? 'initial prompt>\n';
          transport.readBuffers.set('local:w4:p1', `${prev}${text}\n${erpToken}\n`);
          return { ok: true, code: 0, status: 'ok', stdout: '', stderr: '' };
        }
        return origPrompt(machine, paneId, text);
      };
      transport.agentRead = async (machine, paneId) => {
        if (paneId === 'w4:p1' && deferredPicardToken) {
          w4p1PostPromptReads += 1;
          if (w4p1PostPromptReads === 2) {
            const prev = transport.readBuffers.get('local:w4:p1') ?? '';
            transport.readBuffers.set('local:w4:p1', `${prev}${deferredPicardToken}\n`);
            deferredPicardToken = null;
          }
        }
        return origRead(machine, paneId);
      };
      const client = new HerdrClient(transport);
      const { state } = await runHandshake({
        repoRoot: testRoot,
        runId: 'sc7-primary-first',
        mode: 'mock',
        client,
        sleepFn: fastSleep,
        timeouts: FAST_TIMEOUTS,
        pollIntervals: FAST_POLL,
      });
      assert.equal(state.status, 'READY_FOR_FOUNDER_GATE');
      assert.ok(w4p1PostPromptReads >= 2, 'must keep polling until downstream token arrives');
      assert.equal(state.steps.S2.status, 'COMPLETED');
      results.push({ scenario: 7, name: 'Primary-token-first poll wait', status: 'PASS', w4p1Polls: w4p1PostPromptReads });
    }

    console.log(JSON.stringify({ allPassed: true, results }, null, 2));
  } finally {
    rmSync(testRoot, { recursive: true, force: true });
  }
}

runAll().catch((err) => {
  console.error('TEST FAILURE:', err);
  process.exit(1);
});
