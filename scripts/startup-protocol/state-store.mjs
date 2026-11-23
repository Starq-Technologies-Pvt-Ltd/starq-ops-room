import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { safeHandoffFilename, STEP_ORDER } from './topology.mjs';

export class StateStore {
  constructor(repoRoot, runId) {
    this.repoRoot = repoRoot;
    this.runId = runId;
    this.runsRoot = join(repoRoot, 'runs', 'startup');
    this.runDir = join(this.runsRoot, runId);
    this.logsDir = join(this.runDir, 'logs');
    this.readbacksDir = join(this.logsDir, 'readbacks');
    this.statePath = join(this.runDir, 'state.json');
    this.ledgerPath = join(this.runDir, 'ledger.jsonl');
    this.snapshotPath = join(this.runDir, 'topology_snapshot.json');
    this.runLogPath = join(this.logsDir, 'run.log');
    this.sopDeltaPath = join(this.runDir, 'sop-delta.md');
  }

  initDirs() {
    mkdirSync(this.readbacksDir, { recursive: true });
  }

  log(level, message, extra = null) {
    this.initDirs();
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
      ...(extra ? { extra } : {}),
    });
    appendFileSync(this.runLogPath, line + '\n', 'utf8');
  }

  createInitialState(mode = 'live') {
    const now = new Date().toISOString();
    const steps = {};
    for (const step of STEP_ORDER) {
      steps[step] = {
        status: 'PENDING',
        started_at: null,
        completed_at: null,
        handoffs: {},
      };
    }
    return {
      schema_version: '1.0',
      run_id: this.runId,
      mode,
      status: 'INIT',
      current_step: 'S1',
      created_at: now,
      updated_at: now,
      completed_at: null,
      steps,
      summary: {
        total_handoffs: 0,
        acked: 0,
        missing: 0,
        failed: 0,
        skipped: 0,
        changes_detected: null,
        xps_latencies_ms: [],
      },
      escalation: null,
    };
  }

  writeState(state) {
    this.initDirs();
    state.updated_at = new Date().toISOString();
    const tmpPath = `${this.statePath}.tmp.${process.pid}`;
    writeFileSync(tmpPath, JSON.stringify(state, null, 2) + '\n', 'utf8');
    renameSync(tmpPath, this.statePath);
  }

  readState() {
    if (!existsSync(this.statePath)) {
      throw new Error(`state.json not found for run_id=${this.runId} at ${this.statePath}`);
    }
    return JSON.parse(readFileSync(this.statePath, 'utf8'));
  }

  appendLedger(entry) {
    this.initDirs();
    appendFileSync(this.ledgerPath, JSON.stringify(entry) + '\n', 'utf8');
  }

  readLedger() {
    if (!existsSync(this.ledgerPath)) return [];
    const raw = readFileSync(this.ledgerPath, 'utf8');
    const entries = [];
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      entries.push(JSON.parse(trimmed));
    }
    return entries;
  }

  /**
   * Reconcile state.json forward from ledger.jsonl in case of crash between writes.
   */
  loadAndReconcileForResume() {
    const state = this.readState();
    const ledger = this.readLedger();
    for (const row of ledger) {
      const stepObj = state.steps?.[row.step];
      if (!stepObj) continue;
      const existing = stepObj.handoffs[row.handoff_id] ?? {};
      if (row.status === 'ACK') {
        stepObj.handoffs[row.handoff_id] = {
          ...existing,
          status: 'ACK',
          retry_count: row.retry_count ?? existing.retry_count ?? 0,
          acked_at: row.acked_at ?? existing.acked_at ?? null,
        };
      } else if (existing.status !== 'ACK') {
        stepObj.handoffs[row.handoff_id] = {
          ...existing,
          status: row.status,
          retry_count: row.retry_count ?? existing.retry_count ?? 0,
        };
      }
    }
    return { state, ledger };
  }

  writeTopologySnapshot(snapshot) {
    this.initDirs();
    writeFileSync(this.snapshotPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  }

  writeReadbackEvidence(handoffId, attempt, text) {
    this.initDirs();
    const file = join(
      this.readbacksDir,
      `${safeHandoffFilename(handoffId)}__attempt_${attempt}.txt`
    );
    writeFileSync(file, text, 'utf8');
    return file;
  }

  writeSopDelta(markdown) {
    this.initDirs();
    writeFileSync(this.sopDeltaPath, markdown, 'utf8');
    return this.sopDeltaPath;
  }

  /**
   * Find the most recent prior completed run's topology_snapshot.json (excluding current runId).
   */
  findPriorCompletedSnapshot() {
    if (!existsSync(this.runsRoot)) return null;
    const dirs = readdirSync(this.runsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== this.runId)
      .map((d) => d.name)
      .sort()
      .reverse();

    for (const dirName of dirs) {
      const sPath = join(this.runsRoot, dirName, 'state.json');
      const snapPath = join(this.runsRoot, dirName, 'topology_snapshot.json');
      if (!existsSync(sPath) || !existsSync(snapPath)) continue;
      try {
        const s = JSON.parse(readFileSync(sPath, 'utf8'));
        if (s.status === 'READY_FOR_FOUNDER_GATE' && s.mode === 'live') {
          return {
            runId: dirName,
            snapshot: JSON.parse(readFileSync(snapPath, 'utf8')),
          };
        }
      } catch {
        // Ignore corrupt/incomplete prior runs
      }
    }
    return null;
  }
}
