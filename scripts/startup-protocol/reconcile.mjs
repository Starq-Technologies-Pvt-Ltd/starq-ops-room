import { SEATS } from './topology.mjs';

function indexPanes(snapshot) {
  const map = new Map();
  for (const machine of ['local', 'XPS']) {
    const panes = snapshot?.[machine] ?? [];
    for (const p of panes) {
      map.set(`${machine}:${p.pane_id}`, {
        key: `${machine}:${p.pane_id}`,
        machine,
        pane_id: p.pane_id,
        agent: p.agent ?? null,
        display_agent: p.display_agent ?? null,
        label: p.label ?? null,
        cwd: p.cwd ?? null,
      });
    }
  }
  return map;
}

function baselineFromSeats() {
  const map = new Map();
  for (const seat of Object.values(SEATS)) {
    const key = `${seat.machine}:${seat.paneId}`;
    map.set(key, {
      key,
      machine: seat.machine,
      pane_id: seat.paneId,
      agent: null,
      display_agent: null,
      label: null,
      cwd: null,
    });
  }
  return map;
}

/**
 * Compare current topology_snapshot against prior completed run (or SEATS baseline).
 * Never mutates OPS-ROOM-OPERATING-PROCEDURE-v1-DRAFT.md.
 * Writes runs/startup/<run_id>/sop-delta.md ONLY when real changes are detected.
 */
export function reconcileRun({ store, currentSnapshot, prior = null }) {
  const currentMap = indexPanes(currentSnapshot);
  const referenceMap = prior ? indexPanes(prior.snapshot) : baselineFromSeats();
  const referenceLabel = prior ? `prior run ${prior.runId}` : 'topology.mjs SEATS baseline';

  const added = [];
  const removed = [];
  const changed = [];

  if (prior) {
    for (const [key, cur] of currentMap.entries()) {
      if (!referenceMap.has(key)) {
        added.push(cur);
      } else {
        const prev = referenceMap.get(key);
        const diffs = [];
        if (cur.agent !== prev.agent) diffs.push(`agent: ${prev.agent} -> ${cur.agent}`);
        if (cur.cwd !== prev.cwd) diffs.push(`cwd: ${prev.cwd} -> ${cur.cwd}`);
        if (cur.label !== prev.label) diffs.push(`label: ${prev.label} -> ${cur.label}`);
        if (diffs.length > 0) {
          changed.push({ key, diffs });
        }
      }
    }
    for (const [key, prev] of referenceMap.entries()) {
      if (!currentMap.has(key)) {
        removed.push(prev);
      }
    }
  } else {
    // First run: check only that all expected SEATS are present
    for (const [key, expected] of referenceMap.entries()) {
      if (!currentMap.has(key)) {
        removed.push(expected);
      }
    }
  }

  const changesDetected = added.length > 0 || removed.length > 0 || changed.length > 0;
  let sopDeltaPath = null;

  if (changesDetected && store) {
    const lines = [
      `# Proposed SOP Delta — Run \`${store.runId}\``,
      '',
      `**Reference:** ${referenceLabel}`,
      `**Note:** \`docs/operations/OPS-ROOM-OPERATING-PROCEDURE-v1-DRAFT.md\` was NOT modified. Review and apply only on Founder approval.`,
      '',
      '## Detected Topology / Config Changes',
      '',
    ];
    if (added.length > 0) {
      lines.push('### Added Panes');
      for (const a of added) lines.push(`- \`${a.key}\` (agent=${a.agent}, cwd=${a.cwd})`);
      lines.push('');
    }
    if (removed.length > 0) {
      lines.push('### Missing / Removed Panes');
      for (const r of removed) lines.push(`- \`${r.key}\``);
      lines.push('');
    }
    if (changed.length > 0) {
      lines.push('### Modified Panes');
      for (const c of changed) lines.push(`- \`${c.key}\`: ${c.diffs.join('; ')}`);
      lines.push('');
    }
    lines.push(
      '## Proposed Cross-Reference Addendum for `OPS-ROOM-OPERATING-PROCEDURE-v1-DRAFT.md`',
      '',
      '> - **Startup handshake:** Daily readiness verification follows [STARTUP-HANDSHAKE-PROTOCOL-v1-SOP.md](file:///D:/StarqTech/starq-ops-room/docs/operations/STARTUP-HANDSHAKE-PROTOCOL-v1-SOP.md) (pending Founder approval).'
    );
    sopDeltaPath = store.writeSopDelta(lines.join('\n') + '\n');
  }

  return {
    changesDetected,
    referenceLabel,
    added,
    removed,
    changed,
    sopDeltaPath,
  };
}
