// Universal session routing (Founder directive 2026-11-07: "One Room protocol,
// one universal dispatcher, independently addressable sessions across supported
// floors.")
//
// A single dispatcher DISCOVERS live Herdr agent sessions (`herdr agent list`,
// across Windows and WSL floors), identifies each one's canonical Room handle,
// instance (durable session UUID), workspace (cwd), host/floor and pane, then
// routes each Room event to the correct session(s) — no per-agent watcher, no
// manual seat config.
//
// This module is the PURE routing core (no I/O, fully unit-testable). The
// dispatcher daemon (scripts/room-dispatcher.mjs) supplies discovered sessions
// and performs the pane wake. Classification authority stays ROOM-PROTO-1
// (authorityPolicy.mjs); seat-qualifier parsing is shared with seatRouting.mjs.
//
// DELIVERY PRECEDENCE (Founder, 2026-11-07):
//   1. Explicit target session/instance/role when supplied (structured metadata,
//      a @handle#<token> qualifier, or a [FLOOR·pane] subject hint).
//   2/3. Unambiguous project/workspace affinity among the live sessions.
//   4. If more than one candidate remains and nothing disambiguates -> HOLD the
//      delivery and REPORT the ambiguity. NEVER wake all, never silently pick.
//
// A shared handle (e.g. @claude held by Cloudroom, Windows Elder, WSL worker and
// Operations Room) does NOT authorize broadcast: the same ROOM-PROTO-1 gate that
// suppresses FYI/CC_CONTEXT applies per session, and only the resolved session(s)
// are woken.

import path from 'node:path';
import { isOutstandingAction, isActionAddressedTo } from './authorityPolicy.mjs';
import { seatTargetsFor } from './seatRouting.mjs';
import { resolveIdentity } from './identityProvider.mjs';

// Herdr's agent-kind label -> canonical Room handle, where they differ.
// Everything else falls back to identity resolution, then to "unroutable".
// Extend via COMMS_HERDR_AGENT_MAP (JSON) without code changes.
export const DEFAULT_HERDR_AGENT_MAP = {
  claude: 'claude',
  codex: 'codex',
  cursor: 'cursor',
  copilot: 'copilot',
  agy: 'antigravity',
  antigravity_cli: 'antigravity',
  vision: 'vision',
  deadpool: 'deadpool',
};

/** Resolve a Herdr agent-kind label to a canonical Room handle, or null. */
export function mapHerdrAgentToHandle(agentKind, map = DEFAULT_HERDR_AGENT_MAP) {
  if (!agentKind) return null;
  const k = String(agentKind).toLowerCase();
  if (map[k]) return map[k];
  const resolved = resolveIdentity(k);
  if (resolved && resolved.status === 'active') return resolved.canonicalHandle;
  return null;
}

/**
 * Normalize one raw `herdr agent list` entry into a routing session descriptor.
 * `extra` carries dispatcher-supplied context not in the agent list, e.g.
 * { host: 'windows'|'wsl'|..., role: 'floor-lead'|'worker'|... }.
 */
export function normalizeSession(raw, map = DEFAULT_HERDR_AGENT_MAP, extra = {}) {
  if (!raw) return null;
  const cwd = raw.cwd || '';
  return {
    handle: mapHerdrAgentToHandle(raw.agent, map),
    agent: raw.agent || null,
    sessionId: raw.agent_session?.value || null,
    pane: raw.pane_id || null,
    workspace: raw.workspace_id || null,
    cwd,
    cwdBase: cwd ? path.basename(cwd).toLowerCase() : '',
    status: raw.agent_status || null,
    focused: Boolean(raw.focused),
    stateSeq: Number.isFinite(raw.state_change_seq) ? raw.state_change_seq
      : (Number.isFinite(raw.revision) ? raw.revision : 0),
    title: raw.terminal_title_stripped || raw.terminal_title || '',
    host: extra.host || raw.host || null,
    role: (extra.role || raw.role || null) ? String(extra.role || raw.role).toLowerCase() : null,
  };
}

/**
 * Does an explicit target token identify this session? Matches, case-insensitively:
 * session-UUID (full or >=4-char prefix), workspace id, pane (`w1:p5` or `p5`),
 * cwd basename, host, or role. Durable identifiers (UUID, host, role, workspace)
 * are preferred over pane ids, which can change after recovery.
 */
export function sessionMatchesToken(session, token) {
  if (!session || !token) return false;
  const t = String(token).toLowerCase();
  const pane = String(session.pane || '').toLowerCase();
  const paneShort = pane.includes(':') ? pane.split(':').pop() : pane;
  const sid = String(session.sessionId || '').toLowerCase();
  return t === sid
    || (t.length >= 4 && sid.startsWith(t))
    || t === String(session.workspace || '').toLowerCase()
    || t === String(session.host || '').toLowerCase()
    || t === String(session.role || '').toLowerCase()
    || t === session.cwdBase
    || t === pane
    || t === paneShort;
}

/** Is `handle` in the record's evaluated audience (or an @all broadcast)? */
export function handleInAudience(record, handle) {
  const h = String(handle || '').replace(/^@/, '').toLowerCase();
  const aud = record?.evaluatedAudience ?? record?.targetAudience ?? [];
  const list = Array.isArray(aud)
    ? aud.map((a) => String(a).replace(/^@/, '').toLowerCase())
    : [String(aud).replace(/^@/, '').toLowerCase()];
  return list.includes('all') || list.includes(h);
}

/**
 * Does this session's workspace correspond to the event's project token?
 * Tolerant match: the broker's project token ("starq-erp", "hoadha") and the
 * cwd basename ("starqerp", "hoadhaa") differ in punctuation/length, so both
 * sides are normalized (lowercase, alphanumerics only) before comparing.
 */
export function sessionMatchesProject(session, project) {
  if (!session || !project) return false;
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const p = norm(project);
  if (!p || p === 'all' || p === 'general' || p === 'none') return false;
  const base = norm(session.cwdBase);
  const cwd = norm(session.cwd);
  return base === p || cwd.includes(p) || (base.length >= 4 && p.includes(base));
}

/**
 * Collect explicit target tokens for `handle` from (in order): the @handle#token
 * seat qualifier, structured routing metadata, and a [FLOOR·pane] subject hint.
 * Structured metadata is authoritative; the subject hint is best-effort because
 * pane ids can change after recovery.
 */
export function explicitTargetsFor(record, handle) {
  const h = String(handle || '').replace(/^@/, '').toLowerCase();
  const md = record?.event?.metadata || record?.metadata || {};
  const tokens = [];
  const push = (v) => {
    if (v == null) return;
    for (const part of String(v).split(/[\s,]+/)) {
      const tok = part.trim().replace(/^@/, '').toLowerCase();
      if (tok && !tokens.includes(tok)) tokens.push(tok);
    }
  };
  // 1. @handle#<token> / @handle:<token>
  for (const t of seatTargetsFor(record, h)) push(t);
  // 2. structured routing metadata (authoritative, durable)
  push(md.targetInstance);
  push(md.targetSession);
  push(md.targetWorkspace);
  push(md.targetHost);
  push(md.targetRole);
  if (md.routing && typeof md.routing === 'object') {
    push(md.routing.instance); push(md.routing.session); push(md.routing.workspace);
    push(md.routing.host); push(md.routing.role); push(md.routing.pane);
  }
  // 3. [FLOOR·pane] subject hint (best-effort): capture the pane after the middle dot.
  const subject = String(md.subject || '');
  const m = subject.match(/^\s*\[[^\]·]*[··]\s*([a-z0-9:_-]+)\s*\]/i);
  if (m) push(m[1]);
  return tokens;
}

/**
 * Decide which discovered sessions a Room record should wake, honoring the
 * Founder delivery precedence. Never wakes every session of a shared handle.
 *
 * @returns {{ wake, unreachable, ambiguous, unroutable, decisions }}
 *   wake        sessions to wake
 *   unreachable explicit targets that matched no live session {handle, token}
 *   ambiguous   handles HELD because >1 candidate and nothing disambiguated
 *               {handle, candidates:[{pane,workspace,host,sessionId}]}
 *   unroutable  live sessions with no canonical Room handle (reported, never woken)
 *   decisions   per-handle audit trail
 */
export function selectWakeTargets(record, rawSessions, { map = DEFAULT_HERDR_AGENT_MAP, project, sessionExtra = () => ({}) } = {}) {
  const sessions = (rawSessions || []).map((s) => normalizeSession(s, map, sessionExtra(s) || {})).filter(Boolean);
  const unroutable = sessions.filter((s) => !s.handle);
  const routable = sessions.filter((s) => s.handle);
  const proj = project ?? record?.event?.metadata?.project ?? record?.metadata?.project ?? null;

  const byHandle = new Map();
  for (const s of routable) {
    if (!byHandle.has(s.handle)) byHandle.set(s.handle, []);
    byHandle.get(s.handle).push(s);
  }

  const wake = [];
  const unreachable = [];
  const ambiguous = [];
  const decisions = [];
  const addWake = (s) => { if (!wake.includes(s)) wake.push(s); };

  // A genuine outstanding action exists at all? (null target => no handle-level
  // self-guard: self-suppression is applied per SEAT below via senderInstanceId,
  // so one claude seat CAN wake another claude seat — e.g. a WSL worker's
  // completion routed to the ERP floor-lead.)
  const outstanding = isOutstandingAction(record, null);
  const senderInstance = String(
    record?.event?.metadata?.senderInstanceId ?? record?.metadata?.senderInstanceId ?? '',
  ).toLowerCase();

  for (const [handle, groupAll] of byHandle) {
    // Addressed to this handle (audience + named-owner), and a real action exists.
    if (!outstanding || !handleInAudience(record, handle) || !isActionAddressedTo(record, handle)) continue;
    // Never wake the seat that sent the record (seat-level self-exclusion).
    const group = senderInstance
      ? groupAll.filter((s) => String(s.sessionId || '').toLowerCase() !== senderInstance)
      : groupAll;
    if (group.length === 0) continue;

    // Precedence 1: explicit target(s).
    const tokens = explicitTargetsFor(record, handle);
    if (tokens.length > 0) {
      let anyMatched = false;
      for (const token of tokens) {
        const matched = group.filter((s) => sessionMatchesToken(s, token));
        if (matched.length === 0) {
          unreachable.push({ handle, token });
          decisions.push({ handle, mode: 'explicit', token, result: 'unreachable' });
        } else {
          matched.forEach(addWake);
          anyMatched = true;
          decisions.push({ handle, mode: 'explicit', token, result: matched.map((m) => m.pane) });
        }
      }
      // Explicit targeting is authoritative: do not fall back to affinity even
      // if some tokens were unreachable. (A wholly-unreachable explicit target
      // is reported, not silently redirected.)
      if (!anyMatched) decisions.push({ handle, mode: 'explicit', result: 'held-all-unreachable' });
      continue;
    }

    // Sole live session of the handle -> unambiguous.
    if (group.length === 1) {
      addWake(group[0]);
      decisions.push({ handle, mode: 'sole-session', chosen: group[0].pane });
      continue;
    }

    // Precedence 2/3: unambiguous project/workspace affinity.
    const byProj = proj ? group.filter((s) => sessionMatchesProject(s, proj)) : [];
    if (byProj.length === 1) {
      addWake(byProj[0]);
      decisions.push({ handle, mode: 'project-affinity', project: proj, chosen: byProj[0].pane });
      continue;
    }

    // Precedence 4: ambiguous -> HOLD and report. Never wake all; never guess.
    const candidates = (byProj.length > 1 ? byProj : group)
      .map((s) => ({ pane: s.pane, workspace: s.workspace, host: s.host, sessionId: s.sessionId }));
    ambiguous.push({ handle, project: proj, candidates });
    decisions.push({ handle, mode: 'ambiguous-held', project: proj, candidates: candidates.length });
  }

  return { wake, unreachable, ambiguous, unroutable, decisions };
}
