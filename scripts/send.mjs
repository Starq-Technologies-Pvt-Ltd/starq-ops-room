// agent-comms/scripts/send.mjs
// Usage:
//   Room broadcast:   node send.mjs --from <agent> --instance <agent>-session-fixed --room --body "<text with @mentions>" [--task <ID> --action <verb>] [--on-behalf-of <principal>] [--tag test,void] [--reply-to <eventId>]
//   Direct message:   node send.mjs --from <agent> --instance <agent>-session-fixed --to <agent> --subject "<subject>" --body "<body>"
//   Cursor must use send-cursor.mjs (hardcodes --instance cursor-session-fixed). Never omit --instance.
//
// Body safety (2026-10-24, D15): --body is a raw shell argument, so any
// backtick, `$(...)`, unescaped quote, or `$VAR` in it is interpolated by the
// CALLER'S SHELL before this process ever sees it -- not something this script
// can defend against. --body-file <path> reads the literal message body from
// a file instead (UTF-8, trailing newline trimmed), with no shell parsing of
// its content. Prefer --body-file whenever composing a message programmatically
// (e.g. from an agent writing the text via its own file tool) rather than
// interpolating the text into a shell command string.
//
// Review verbs:      --action accepted|rejected requires --task <ID> and is enforced
//                    by DEC-072 in protocol/v1/reviewer-separation.mjs: the identity
//                    that built the task may not review it. Exit 3 = self-review
//                    rejected, 4 = builder unknown, 5 = Founder override applied.
//                    Founder override is explicit: --founder-override (recorded on
//                    the event and in the ledger permanently).
//
// Delegation:         --from hermes --on-behalf-of <principal> posts as Hermes on behalf of the named authority.
//                     Sender field = hermes. onBehalfOf + delegated metadata carry the authority Principal.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { postToRoom, VALID_AGENTS } from './room.mjs';
import { buildStructuredRoomMetadata } from './room-structured-metadata.mjs';
import { claimOrRenewLease, computeInstanceId, getLeaseStatus, registerSharedHolder, listActiveHolders } from '../protocol/v1/identityLease.mjs';
import { isFounderAuthority, FOUNDER_AUTHORITY_ID } from '../protocol/v1/identityProvider.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');

// 'founder-override' must be a boolean: it is a presence flag, and if it were
// treated as a valued option it would silently swallow the argument after it.
const BOOLEAN_FLAGS = new Set(['room', 'takeover', 'founder-override', 'shared', 'register-shared']);

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      if (BOOLEAN_FLAGS.has(key)) {
        out[key] = true;
      } else {
        out[key] = args[i + 1];
        i++;
      }
    }
  }
  return out;
}

function readInbox(agent) {
  try {
    return JSON.parse(readFileSync(join(root, 'inbox', `${agent}.json`), 'utf8'));
  } catch {
    return [];
  }
}

function writeInbox(agent, messages) {
  writeFileSync(join(root, 'inbox', `${agent}.json`), JSON.stringify(messages, null, 2) + '\n');
}

function archiveSent(message) {
  const sentDir = join(root, 'sent');
  mkdirSync(sentDir, { recursive: true });
  const file = join(sentDir, `${message.timestamp.slice(0, 10)}.json`);
  let history = [];
  try {
    history = JSON.parse(readFileSync(file, 'utf8'));
  } catch {}
  history.push(message);
  writeFileSync(file, JSON.stringify(history, null, 2) + '\n');
}

const VALID_ACTIONS = ['started', 'blocked', 'done', 'accepted', 'rejected', 'claim'];
const REVIEWER_ONLY_ACTIONS = ['accepted', 'rejected'];

// DEC-072 enforcement, wired 2026-09-28 into the PRODUCTION writer.
//
// The previous gate here was a three-name allowlist:
//     const REVIEW_AUTHORITIES = ['ali', 'mustarq', 'claude'];
//     if (REVIEWER_ONLY_ACTIONS.includes(action) && !REVIEW_AUTHORITIES.includes(from)) ...
// That was NOT DEC-072. An allowlist can only say "one of these three", which a
// builder who is also on the list satisfies trivially — 'claude' could build a
// task and then accept it, and the old check said that was fine.
//
// reviewer-separation.mjs enforces the actual rule: the identity that built a
// task may not accept or reject it. That is a property of the pair
// (builder, reviewer), not a property of a name, so it is what gates here now.
// The allowlist is REMOVED rather than kept as a second gate, because keeping it
// would re-introduce the exact defect DEC-072 exists to close: it would make
// "separation" a fiction for any reviewer outside those three names, and the
// test 'a valid seat on no allowlist can review independently' is the case that
// proves the rule is separation rather than a list.
const { evaluateReview, REVIEW_VERBS } = await import('../protocol/v1/reviewer-separation.mjs');

// Label governance, 2026-09-14 (Founder: "we can't afford all to have access ... need
// structure"). The 'pinned' tag drives the [HIGH PRIORITY] marker and the pinned.mjs
// digest — access-gated so it can't be self-granted by every seat marking its own
// routine status important, which would dilute it into noise within days.
//
// Founder identity closure 2026-09-29: the Founder is matched by AUTHORITY
// IDENTITY, not by a two-string allowlist. `founder` is the canonical authority
// group id, so the Founder is recognised through `ali` (legacy), `mustarq`,
// `@founder`, `@musthaq` and any future founder-group alias automatically. A
// hardcoded ['ali','mustarq'] pair is exactly the list-shaped defect this
// closure removes: it would silently exclude a new alias and would need editing
// every time one is added. The staff seats below stay an explicit list — they
// are individuals, not an alias group.
const PIN_AUTHORITY_IDS = [FOUNDER_AUTHORITY_ID, 'claude', 'codex'];
const PIN_STAFF_HANDLES = ['claude', 'codex'];
const hasPinAuthority = (handle) => isFounderAuthority(handle) || PIN_STAFF_HANDLES.includes(handle);

// Identity integrity, 2026-09-14 (Founder: "make it linked to my id ... so I
// can't [be impersonated]"). Nothing previously stopped any local process
// from posting --from ali with full Founder authority and no verification.
// Now the ONLY legitimate path is the Telegram gateway (starq-bot-gateway.mjs),
// which only relays messages from the Founder's specific verified Telegram
// user ID. Every other --from ali attempt is refused.
const FOUNDER_TELEGRAM_USER_ID = '790631400';

const args = parseArgs();

// --whoami <handle>: report the current identity-lease holder without sending anything.
if (args.whoami) {
  const status = getLeaseStatus(args.whoami);
  if (!status.held) {
    console.log(`No live lease on "${args.whoami}"${status.stale ? ' (last holder went stale)' : ''} - open to claim.`);
  } else {
    const l = status.lease;
    console.log(`"${args.whoami}" primary: instance ${l.instanceId} (host=${l.hostname}, pid=${l.pid}${l.label ? `, label="${l.label}"` : ''}) since ${l.claimedAt}, last seen ${l.lastSeenAt}.`);
  }
  const shared = (status.holders || []).filter((h) => h.mode === 'shared');
  if (shared.length) {
    console.log(`  shared co-holders (${shared.length}):`);
    for (const h of shared) {
      console.log(`    - ${h.instanceId} (host=${h.hostname}, pid=${h.pid}${h.label ? `, label="${h.label}"` : ''}) since ${h.claimedAt}, last seen ${h.lastSeenAt}`);
    }
  }
  process.exit(0);
}

// --register-shared: register as a shared co-holder of --from and exit. No
// Room event is emitted. Rationale (requirement #4, 2026-11-06): registering
// another instance must not notify or invalidate the existing primary, so
// the registration path must be callable without piggy-backing on an actual
// post. Useful when a session is coming online before it has anything to say.
if (args['register-shared']) {
  const handle = args.from;
  if (!handle) {
    console.error('--register-shared requires --from <handle>.');
    process.exit(1);
  }
  if (!args.instance) {
    console.error('--register-shared requires --instance <stable-session-id>. See the identityLease.mjs header for why.');
    process.exit(1);
  }
  if (args.takeover) {
    console.error('--register-shared and --takeover are mutually exclusive. --takeover is an exclusive-seat handoff; --register-shared explicitly does not disturb the primary.');
    process.exit(1);
  }
  const instanceId = computeInstanceId(args.instance);
  const result = registerSharedHolder(handle, instanceId, { label: args.label || null });
  const primaryLine = result.mode === 'primary'
    ? `primary slot assumed (handle had no live primary when we registered)`
    : `registered as SHARED co-holder (primary slot untouched)`;
  console.log(`✓ identity "${handle}" ${primaryLine}: instance ${result.entry.instanceId} (host=${result.entry.hostname}, pid=${result.entry.pid}${result.entry.label ? `, label="${result.entry.label}"` : ''})`);
  const coHolders = listActiveHolders(handle).filter((h) => h.instanceId !== instanceId);
  if (coHolders.length) {
    console.log(`  co-holders (${coHolders.length}) left intact:`);
    for (const h of coHolders) {
      console.log(`    - [${h.mode}] ${h.instanceId} (host=${h.hostname}, last seen ${h.lastSeenAt})`);
    }
  }
  process.exit(0);
}

const from = args.from;
const to = args.to;
const subject = args.subject;
if (args.body != null && args['body-file'] != null) {
  console.error('Pass only one of --body or --body-file, not both.');
  process.exit(1);
}
const body = args['body-file'] != null
  ? readFileSync(args['body-file'], 'utf8').replace(/\r?\n$/, '')
  : args.body;
const thread = args.thread;
const task = args.task;
const action = args.action;
const status = args.status || null;
const actionRequired = args['action-required'] ?? null;
const references = args.references == null
  ? null
  : args.references.split(',').map((value) => value.trim()).filter(Boolean);
const room = args.room || false;
const type = args.type || null;
const onBehalfOf = args['on-behalf-of'] || args.onBehalfOf || null;
const tags = args.tag ? args.tag.split(',').map((t) => t.trim()).filter(Boolean) : [];
const replyTo = args['reply-to'] || args.replyTo || null;
const verifiedVia = args['verified-via'] || null;
const verifiedUserId = args['verified-user-id'] || null;

if (!from || !body || (!room && !to && to !== 'room')) {
  console.error('Usage:');
  console.error('  Room post:   node send.mjs --from <agent> --room --body "<text with @mentions>" [--task <ID> --action <verb>] [--on-behalf-of <principal>]');
  console.error('  Direct msg:  node send.mjs --from <agent> --to <agent> --subject "<subject>" --body "<body>"');
  process.exit(1);
}

// A Room body that starts with "Reply to #<n>" is a threaded reply. Without
// --reply-to it is recorded unthreaded (see Room #14643/#14644), so refuse it
// before anything is posted and point at the flag.
if ((room || to === 'room') && /^\s*Reply to #\d+/i.test(body) && !replyTo) {
  console.error('Refusing to post: the body starts with "Reply to #<n>" but --reply-to is missing.');
  console.error('Pass the event ID of the record you reply to: --reply-to <eventId>. Keep --task separate.');
  process.exit(1);
}

// --- Delegation semantics ---
// When --on-behalf-of is set, the actual sender must be hermes (the relay operator).
// The authority Principal (onBehalfOf) is recorded in event metadata, not as the sender.
if (onBehalfOf) {
  // 2026-09-12 identity migration: the relay-operator seat moved from the
  // retired 'nexus' agent identity to 'deadpool' (Deadpool / DP). 'hermes'
  // stays accepted as the legacy runtime handle; 'nexus' is no longer a valid
  // sender at all (excluded from VALID_AGENTS by status).
  if (from !== 'hermes' && from !== 'deadpool') {
    console.error(`Delegation requires sender = deadpool (or legacy hermes). You specified --from ${from}.`);
    console.error(`Use: --from deadpool --on-behalf-of ${onBehalfOf}`);
    process.exit(1);
  }
  if (!VALID_AGENTS.includes(onBehalfOf)) {
    console.error(`Invalid --on-behalf-of "${onBehalfOf}". Must be one of: ${VALID_AGENTS.join(', ')}`);
    process.exit(1);
  }
  // Derive a UI hint for rendering
  const uiHint = `Hermes · on behalf of @${onBehalfOf}`;
}

if (!VALID_AGENTS.includes(from)) {
  console.error(`Invalid sender "${from}". Must be one of: ${VALID_AGENTS.join(', ')}`);
  process.exit(1);
}

if (isFounderAuthority(from) && !onBehalfOf) {
  if (verifiedVia !== 'telegram' || verifiedUserId !== FOUNDER_TELEGRAM_USER_ID) {
    console.error(`REFUSED: --from ${from} requires --verified-via telegram --verified-user-id <the Founder's verified Telegram ID>.`);
    console.error('The only legitimate source for this is agent-comms/scripts/starq-bot-gateway.mjs, which relays only messages from the Founder\'s own verified Telegram account.');
    console.error(`If you are relaying something the Founder said (not posting through the gateway), post it under your OWN identity and say "Founder said..." — never --from ${from} directly.`);
    process.exit(1);
  }
}

const telegramUpdateIdRaw = args['telegram-update-id'];
let telegramUpdateId = null;
if (telegramUpdateIdRaw != null) {
  if (verifiedVia !== 'telegram' || verifiedUserId !== FOUNDER_TELEGRAM_USER_ID || !isFounderAuthority(from) || onBehalfOf) {
    console.error('REFUSED: --telegram-update-id is only allowed on the verified Founder Telegram send path.');
    process.exit(1);
  }
  const parsedUpdateId = Number(telegramUpdateIdRaw);
  if (!Number.isSafeInteger(parsedUpdateId) || parsedUpdateId < 0) {
    console.error('REFUSED: --telegram-update-id must be a non-negative safe integer.');
    process.exit(1);
  }
  telegramUpdateId = parsedUpdateId;
}

if (action && !VALID_ACTIONS.includes(action)) {
  console.error(`Invalid --action "${action}". Must be one of: ${VALID_ACTIONS.join(', ')}`);
  process.exit(1);
}

// --- DEC-072: reviewer separation, enforced at the production writer ---
// A review verb requires a task (that is what a review is OF) and requires the
// reviewer to be someone other than the identity that built it. Both failure
// modes fail CLOSED: an unattributed task is not accepted by assertion, and an
// unknown reviewer is not accepted because it was passed on the command line.
//
// The Founder override is explicit (--founder-override) and is recorded on the
// event as a permanent, auditable override rather than a silent pass.
if (action && REVIEWER_ONLY_ACTIONS.includes(action)) {
  if (!task) {
    console.error(`REFUSED: --action ${action} requires --task <ID>. A review verdict is about a specific task; without one there is no builder to be separate from.`);
    process.exit(3);
  }

  const founderOverride = Boolean(args['founder-override'] || args.founderOverride);
  const review = evaluateReview({ taskId: task, reviewer: from, founderOverride });

  if (review.decision !== 'ACCEPTED' && review.decision !== 'ACCEPTED_FOUNDER_OVERRIDE') {
    console.error(`REFUSED: DEC-072 — ${action} on ${task} by ${from} is not permitted.`);
    console.error(`  rule: ${review.rule}`);
    console.error(`  reason: ${review.reason}`);
    if (review.decision === 'REJECTED_SELF_REVIEW' && review.evidence) {
      console.error(`  builder evidence: ${review.builder} ${review.evidence.action} at seq ${review.evidence.seq} (${review.evidence.at})`);
    }
    if (review.decision === 'REJECTED_OVERRIDE_REQUIRED') {
      console.error('  The Founder may override with --founder-override. The override is recorded permanently.');
    }
    console.error('Exit 3 = self-review rejected, 4 = builder unknown. Neither is a warning; both are refusals.');
    process.exit(review.decision === 'REJECTED_UNKNOWN_BUILDER' ? 4 : 3);
  }

  if (review.decision === 'ACCEPTED_FOUNDER_OVERRIDE') {
    console.warn(`⚠ FOUNDER OVERRIDE: ${from} is accepting ${task}, which they built. ${review.auditNote}`);
  }
  // Carried onto the event so the override is visible in the ledger, not just here.
  args.__dec072 = review;
}

if (tags.includes('pinned') && !hasPinAuthority(from)) {
  console.error(`--tag pinned (and the [HIGH PRIORITY] marker) is reserved for the Founder (@mustarq) and ${PIN_STAFF_HANDLES.map((a) => `@${a}`).join('/')} — ${from} cannot set it.`);
  console.error(`If this is genuinely durable (a standing rule, Founder ruling, or handover pointer), ask one of them to post it instead.`);
  process.exit(1);
}

// --- Structured routing input (COMMS-ROUTING-20261110 phase 2) ---
// --routing-file <json> lets the author name exact recipients by role and/or
// instance: { "schema": "starq.routing/1", "targets": [ { handle, role?, instance?, backend? } ] }.
// The document is validated in full BEFORE the lease is touched or anything is
// published; any error refuses the send. Recipients are never inferred from the
// body, subject or quoted text, and there is no broadcast form. The validated
// document is written to metadata.routing, and its handles are passed to the
// broker as explicit mentions so the existing ACTION_REQUIRED gate (unchanged)
// sees a directed post. When the flag is absent nothing below runs and the
// sender behaves exactly as before.
let structuredRouting = null;
let structuredRoutingHandles = [];
if (args['routing-file'] != null) {
  const refuseRouting = (lines) => {
    console.error('REFUSED: --routing-file was not accepted; nothing was posted.');
    for (const line of lines) console.error(`  ${line}`);
    process.exit(1);
  };
  if (!(room || to === 'room')) refuseRouting(['--routing-file applies to Room posts only (use --room).']);
  const { loadRoutingFile, routingHandles } = await import('../protocol/v1/routingInput.mjs');
  const { evaluateEventRouting, isNoneActionRequired } = await import('../protocol/v1/authorityPolicy.mjs');
  const loaded = loadRoutingFile(args['routing-file']);
  if (!loaded.ok) refuseRouting(loaded.errors);
  if (actionRequired == null || !String(actionRequired).trim() || isNoneActionRequired(actionRequired)) {
    refuseRouting(['routing targets need a specific --action-required; a NONE or missing action is not delivered to anyone.']);
  }
  const handles = routingHandles(loaded.routing);
  const preview = evaluateEventRouting(from, body, handles, {
    actionRequired, action, status, routing: loaded.routing,
    ...(onBehalfOf ? { onBehalfOf, delegated: true } : {}),
  });
  if (preview.deliveryType !== 'ACTION_REQUIRED') {
    refuseRouting([`sender "${from}" cannot dispatch an ACTION_REQUIRED Room event, so these targets would never be delivered.`]);
  }
  structuredRouting = loaded.routing;
  structuredRoutingHandles = handles;
}

// --- Identity Lease Protocol ---
// Added 2026-09-08 after two separate sessions both posted as "claude" within
// the same hour, unaware of each other. A live lease held by a DIFFERENT
// instance blocks this send unless --takeover is explicit. See
// protocol/v1/identityLease.mjs for the full rationale.
// Delegated sends (--on-behalf-of, always from=hermes/nexus relaying a
// principal) are exempt: the relay is a single trusted process by design.
// senderInstanceId is set during the lease-registration branch so we can
// carry it onto the Room event metadata below, making attribution survive
// into the ledger (requirement: "task claims, execution ownership and
// privileged operations individually attributable" when multiple instances
// act under one handle).
let senderInstanceIdForMetadata = null;
if (!onBehalfOf) {
  const instanceId = computeInstanceId(args.instance);
  if (!args.instance) {
    console.error(`NOTE: no --instance given, falling back to hostname:ppid (${instanceId}). If your runtime re-spawns a fresh process per command (as Claude Code's Bash tool does), this fingerprint changes every call and will falsely block your own next send. Pass a stable --instance <your-session-id> instead.`);
  }
  if (args.shared && args.takeover) {
    console.error('--shared and --takeover are mutually exclusive. --takeover is an exclusive-seat handoff; --shared is a non-disruptive co-registration under the same handle.');
    process.exit(1);
  }
  const takeover = Boolean(args.takeover);
  const label = args.label || null;
  senderInstanceIdForMetadata = instanceId;

  if (args.shared) {
    // Shared co-holder path. Never blocks on, invalidates, or notifies the
    // primary. If the handle currently has no live primary, we are promoted
    // into that slot silently (see registerSharedHolder header for why).
    const result = registerSharedHolder(from, instanceId, { label });
    if (result.mode === 'primary') {
      console.log(`✓ identity "${from}" has no live primary; registered as PRIMARY (instance ${instanceId}). Subsequent --shared sessions will co-hold alongside this session.`);
    }
    // No Room notification on --shared registration - requirement #4.
  } else {
    const claim = claimOrRenewLease(from, instanceId, { takeover, label });
    if (!claim.ok) {
      const h = claim.holder;
      console.error(`REFUSED: identity "${from}" primary slot is currently held by a different session.`);
      console.error(`  holder instance: ${h.instanceId} (host=${h.hostname}, pid=${h.pid}${h.label ? `, label="${h.label}"` : ''})`);
      console.error(`  claimed: ${h.claimedAt}, last seen: ${h.lastSeenAt}`);
      console.error(`If this is a deliberate handoff (the other session is done, or you're intentionally taking over), re-run with --takeover.`);
      console.error(`If you want to co-hold this identity alongside the other session WITHOUT taking the primary seat, re-run with --shared instead. Co-holders operate independently under the same handle; each post is individually attributed via senderInstanceId.`);
      console.error(`To check who holds an identity at any time: node send.mjs --whoami ${from}`);
      process.exit(1);
    }
    if (claim.wasTakeover) {
      console.log(`⚠ Took over identity "${from}" primary slot from instance ${claim.previousHolder.instanceId} (host=${claim.previousHolder.hostname}, pid=${claim.previousHolder.pid}).`);
      // Takeovers are posted to the room automatically - a deliberate handoff
      // must be visible to everyone, never quiet. Note: this notifies only
      // about the EXCLUSIVE-seat handoff; any shared co-holders of the
      // handle are not affected and are not mentioned.
      try {
        const { emitEvent } = await import('../protocol/v1/ingress.mjs');
        await emitEvent({
          sender: from,
          body: `[IDENTITY LEASE] "${from}" taken over: instance ${instanceId}${label ? ` (${label})` : ''} superseded instance ${claim.previousHolder.instanceId} (host=${claim.previousHolder.hostname}, pid=${claim.previousHolder.pid}), which last posted at ${claim.previousHolder.lastSeenAt}.`,
          type: 'MESSAGE',
          metadata: { system: 'identity-lease-takeover', senderInstanceId: instanceId },
        });
      } catch { /* best-effort notice; do not block the actual send on this */ }
    }
  }
}

// Check if this is a Room message
if (room || to === 'room' || to === 'all') {
  // COMMS_ROOM_PATH redirects the Room file (isolated test seam, see
  // protocol/v1/ingressPaths.mjs). Never let that happen silently: a leaked
  // variable would otherwise divert posts while the normal success line prints.
  // stderr only, so stdout stays identical for callers that parse it.
  const roomRedirect = process.env.COMMS_ROOM_PATH;
  const isRedirected = roomRedirect != null && roomRedirect !== '';
  if (isRedirected) {
    console.error('WARNING: COMMS_ROOM_PATH is set. This post goes to an ISOLATED Room file, NOT the canonical Room:');
    console.error(`  ${roomRedirect}`);
    console.error('  Other agents and the Founder will not see it. Unset COMMS_ROOM_PATH for a real post.');
  }
  try {
    const { emitEvent } = await import('../protocol/v1/ingress.mjs');
    const { evaluateEventRouting } = await import('../protocol/v1/authorityPolicy.mjs');
    const eventType = type || (task && action === 'claim' ? 'TASK_CLAIM' : 'MESSAGE');
    const metadataForRouting = {
      actionRequired,
      action,
      status,
      ...(structuredRouting ? { routing: structuredRouting } : {}),
      ...(onBehalfOf ? { onBehalfOf, delegated: true } : {})
    };
    const route = evaluateEventRouting(from, body, structuredRoutingHandles, metadataForRouting);
    const structured = buildStructuredRoomMetadata({
      subject, status, action, actionRequired, references, replyTo, telegramUpdateId,
      deliveryType: route.deliveryType,
    });
    const record = emitEvent({
      sender: from,
      body,
      type: eventType,
      taskId: task,
      action,
      threadId: thread,
      replyTo,
      ...(structuredRouting ? { explicitMentions: structuredRoutingHandles } : {}),
      metadata: {
        task, action,
        subject: structured.subject,
        status: structured.status,
        actionRequired: structured.actionRequired,
        references: structured.references,
        ...(structuredRouting ? { routing: structuredRouting } : {}),
        ...(args.project ? { project: args.project } : {}),
        ...(tags.length ? { tags } : {}),
        ...(telegramUpdateId != null ? { telegramUpdateId } : {}),
        // Sender instance attribution. When an identity has multiple
        // concurrent co-holders (primary + shared), senderHandle alone no
        // longer tells you WHICH instance posted this. The lease file knows
        // but the Room ledger wouldn't - adding it to metadata closes that
        // gap. Omitted when --instance was not supplied so historical
        // single-instance records remain byte-identical in shape.
        ...(senderInstanceIdForMetadata ? { senderInstanceId: senderInstanceIdForMetadata } : {}),
        // DEC-072 verdict travels with the event so the ledger shows WHO reviewed
        // and on what basis. A Founder override is permanently marked here.
        ...(args.__dec072 ? {
          dec072: {
            builder: args.__dec072.builder ?? null,
            reviewer: from,
            decision: args.__dec072.decision,
            founderOverride: Boolean(args.__dec072.founderOverride),
            ...(args.__dec072.founderOverride ? { auditNote: args.__dec072.auditNote } : {}),
          },
        } : {}),
      },
      delegation: onBehalfOf
        ? { onBehalfOf, delegated: true, source: 'telegram-relay', authority: 'founder-delegated' }
        : null
    });
    const senderLine = onBehalfOf
      ? `✓ NEP-1 Broker Record #${record.brokerSequence} posted [${record.eventId.slice(0, 8)}] by @${record.event.senderHandle} on behalf of @${onBehalfOf}`
      : `✓ NEP-1 Broker Record #${record.brokerSequence} posted [${record.eventId.slice(0, 8)}] by @${from}`;
    console.log(senderLine);
    if (record.evaluatedDeliveryType === 'ACTION_REQUIRED') {
      const audience = record.evaluatedAudience;
      const handles = Array.isArray(audience)
        ? audience
        : (typeof audience === 'string' && audience.trim() ? [audience.trim()] : []);
      const tagged = handles.map((handle) => {
        const value = String(handle).replace(/^@/, '');
        return value.toLowerCase() === 'all' ? '@all' : `@${value}`;
      }).join(', ');
      console.log(`  → Action Required tagged: ${tagged || 'UNKNOWN'}`);
    } else {
      console.log(`  → Broadcast to all agents (CC_CONTEXT)`);
    }
    if (isRedirected) {
      console.error(`WARNING: record #${record.brokerSequence} was written to the ISOLATED Room at ${roomRedirect}, not the canonical Room.`);
    }
  } catch (err) {
    const { writeRoomPostFailure } = await import('../protocol/v1/ingress.mjs');
    writeRoomPostFailure(err);
    process.exit(1);
  }
} else {
  // Traditional Direct Message
  if (!VALID_AGENTS.includes(to)) {
    console.error(`Invalid recipient "${to}". Must be one of: ${VALID_AGENTS.join(', ')} or "room"`);
    process.exit(1);
  }

  const message = {
    id: randomUUID(),
    from,
    to,
    subject: subject || `Direct message from ${from}`,
    body,
    timestamp: new Date().toISOString(),
    thread_id: thread ?? null,
    status: 'unread',
    deliveryType: 'DIRECT',
    ...(task ? { task, action } : {}),
  };

  const inbox = readInbox(to);
  inbox.push(message);
  writeInbox(to, inbox);
  archiveSent(message);

  console.log(`✓ Direct message sent → ${to} [${message.id.slice(0, 8)}]`);
  console.warn(
    `⚠ PRIVATE inbox message, NOT posted to the Room — the rest of the crew and the Founder will ` +
    `not see this in room.jsonl. Standing policy (2026-09-14): Room is the default channel for all ` +
    `task/status/ACK/blocker content; --to is an exception for Founder-directed 1:1 routing, ` +
    `genuinely sensitive content, or bulky handoff detail. If this is any of the former, re-send ` +
    `with --room instead (and if you deliberately used --to for a valid exception, consider also ` +
    `posting a one-line Room note that a DM went out, so visibility isn't lost).`
  );
}
