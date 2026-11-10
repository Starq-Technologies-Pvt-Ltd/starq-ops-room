import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveIdentity } from './identityProvider.mjs';
import { evaluateEventRouting, structuredRoutingHandles } from './authorityPolicy.mjs';
import { validateRoutingDocument } from './routingInput.mjs';
import { computeEventId, generateNonce, validateAuthorEvent } from './envelope.mjs';
import { deriveProject, loadProjectRegistry } from './projectClassifier.mjs';
import { getBrokerHeadState, computeRecordHash } from './hashChain.mjs';
import { readCurrentEpoch, readEpochDiscontinuity, verifyCurrentEpoch } from './ledger-epoch.mjs';
import { resolveIngressPaths } from './ingressPaths.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const { roomFile: ROOM_FILE, lockFile: LOCK_FILE, inboxDir: INBOX_DIR } = resolveIngressPaths({ rootDir: ROOT_DIR });

fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
fs.mkdirSync(INBOX_DIR, { recursive: true });

export const ROOM_EPOCH_INTEGRITY = 'ROOM_EPOCH_INTEGRITY';
export const ROOM_EPOCH_INTEGRITY_STDERR_MARKER = `STARQ_ERROR_CODE=${ROOM_EPOCH_INTEGRITY}`;

export function roomEpochIntegrityError(detail) {
  const err = new Error(detail);
  err.code = ROOM_EPOCH_INTEGRITY;
  return err;
}

export function writeRoomPostFailure(err, write = (...parts) => console.error(...parts)) {
  if (err?.code === ROOM_EPOCH_INTEGRITY) write(ROOM_EPOCH_INTEGRITY_STDERR_MARKER);
  write(`Failed to post to room: ${err?.message || err}`);
}

/** Canonical Room ingress refuses malformed structured recipients before append. */
function assertValidStructuredRouting(metadata) {
  if (metadata?.routing === undefined || metadata?.routing === null) return;
  const result = validateRoutingDocument(metadata.routing);
  if (!result.ok) throw new Error(`Invalid structured Room routing: ${result.errors.join('; ')}`);
}

export function withLock(action) {
  let attempts = 0;
  while (attempts < 50) {
    try {
      const fd = fs.openSync(LOCK_FILE, 'wx');
      try {
        fs.writeFileSync(fd, `${process.pid}\n${Date.now()}`);
        return action();
      } finally {
        fs.closeSync(fd);
        fs.unlinkSync(LOCK_FILE);
      }
    } catch (e) {
      if (e.code === 'EEXIST') {
        attempts++;
        const delay = Math.floor(Math.random() * 20) + 10;
        const start = Date.now();
        while (Date.now() - start < delay) {}
        continue;
      }
      throw e;
    }
  }
  throw new Error('Could not acquire ingress lock after 50 attempts');
}

/**
 * Choose the next global broker sequence. A configured successor gap is
 * honored only from its exact, intact predecessor checkpoint; after the first
 * successor record, sequence allocation returns to ordinary +1 behavior.
 */
export function nextBrokerPosition(headState, epoch) {
  const discontinuity = readEpochDiscontinuity(epoch);
  if (!discontinuity) {
    return { brokerSequence: headState.sequence + 1, previousRecordHash: headState.headHash };
  }

  const checkpoint = discontinuity.checkpoint;
  const headMatchesCheckpoint = headState.sequence === checkpoint.brokerSequence
    && headState.lastRecordSequence === checkpoint.brokerSequence
    && headState.lastEventId === checkpoint.eventId
    && headState.headHash === checkpoint.recordHash
    && headState.tailIsBrokerRecord === true
    && headState.tailSequence === checkpoint.brokerSequence
    && headState.tailEventId === checkpoint.eventId
    && headState.tailRecordHash === checkpoint.recordHash;
  if (headMatchesCheckpoint) {
    return { brokerSequence: discontinuity.firstNewOperationalSequence,
      previousRecordHash: checkpoint.recordHash };
  }

  const headIsInSuccessor = headState.sequence >= discontinuity.firstNewOperationalSequence
    && headState.lastRecordSequence === headState.sequence
    && headState.tailIsBrokerRecord === true
    && headState.tailSequence === headState.sequence
    && headState.tailEventId === headState.lastEventId
    && headState.tailRecordHash === headState.headHash;
  if (headIsInSuccessor) {
    return { brokerSequence: headState.sequence + 1, previousRecordHash: headState.headHash };
  }

  throw new Error('Room head does not match the declared predecessor checkpoint or a valid successor record');
}

/**
 * Creates a portable, signable Author Event (NexusEventV1).
 */
export function createAuthorEvent({
  sender,
  body,
  type = 'MESSAGE',
  taskId = null,
  threadId = null,
  replyTo = null,
  explicitMentions = [],
  metadata = {},
  delegation = null,  // delegated authority: { onBehalfOf, delegated, source, authority }
}) {
  const identity = resolveIdentity(sender);
  if (!identity || identity.status !== 'active') {
    throw new Error(`Invalid or inactive identity: ${sender}`);
  }

  // If delegation is present, sender must be the actual creator (e.g. hermes),
  // onBehalfOf carries the authority Principal.
  if (delegation && delegation.onBehalfOf) {
    const principal = resolveIdentity(delegation.onBehalfOf);
    if (!principal || principal.status !== 'active') {
      throw new Error(`Invalid or inactive delegation principal: ${delegation.onBehalfOf}`);
    }
  }

  // For structured routing, the validated metadata is the sole recipient list.
  // This prevents quoted/forwarded @mentions from leaking into the Room
  // audience used by legacy readers. Invalid structured routing fails closed.
  const structuredMentions = structuredRoutingHandles(metadata);

  // Parse mentions from body only for legacy, unstructured Room events.
  const bodyMentions = [];
  if (structuredMentions === null) {
    const mentionMatches = body.match(/@[a-zA-Z0-9_-]+/g) || [];
    for (const m of mentionMatches) {
      const ident = resolveIdentity(m);
      if (ident && !bodyMentions.includes(ident.canonicalHandle)) {
        bodyMentions.push(ident.canonicalHandle);
      }
    }
  }
  const allMentions = structuredMentions === null
    ? [...new Set([...bodyMentions, ...explicitMentions])]
    : structuredMentions;

  // Merge delegation fields into metadata (NOT into canonical hash — delegation
  // is transport/transport semantics, not cryptographic identity).
  assertValidStructuredRouting(metadata);
  const eventMetadata = { ...metadata };
  if (delegation) {
    eventMetadata.delegated = delegation.delegated !== false; // default true
    eventMetadata.onBehalfOf = delegation.onBehalfOf;
    if (delegation.source) eventMetadata.source = delegation.source;
    if (delegation.authority) eventMetadata.authority = delegation.authority;
    // UI hint for rendering
    if (delegation.uiHint) eventMetadata.uiHint = delegation.uiHint;
  }

  // Read-side channel classification stamp. Same transport-semantics slot
  // pattern as delegation/uiHint above: metadata.project is consumed by the
  // Comms Bus channel splitter, never by routing or identity. Never overrides
  // an explicit caller-supplied project.
  if (eventMetadata.project === undefined) {
    eventMetadata.project = deriveProject({ taskId: taskId || null, body }, loadProjectRegistry());
  }

  const authorEvent = {
    protocolVersion: '1.0',
    createdAt: new Date().toISOString(),
    senderIdentityId: identity.identityId,
    senderHandle: identity.canonicalHandle,
    nonce: generateNonce(),
    type: String(type).toUpperCase(),
    body: body.trim(),
    mentions: allMentions,
    taskId: taskId || null,
    threadId: threadId || null,
    replyTo: replyTo || null,
    signatureAlgorithm: identity.signatureAlgorithm || 'none',
    signature: null,
    metadata: eventMetadata,
  };

  authorEvent.eventId = computeEventId(authorEvent);
  validateAuthorEvent(authorEvent);
  return authorEvent;
}

/**
 * Authoritative single ingress point for StarqNexus.
 * Takes an AuthorEvent (or builds one), evaluates AuthorityPolicy, wraps in BrokerRecordV1,
 * and atomically persists.
 */
export function emitEvent(eventOrParams) {
  let authorEvent;
  if (eventOrParams.protocolVersion === '1.0' && eventOrParams.eventId) {
    authorEvent = eventOrParams;
    assertValidStructuredRouting(authorEvent.metadata);
    validateAuthorEvent(authorEvent);
  } else {
    authorEvent = createAuthorEvent(eventOrParams);
  }

  return withLock(() => {
    // 1. Evaluate Broker-side Authority Policy (Never trust client-supplied deliveryType)
    const routing = evaluateEventRouting(authorEvent.senderHandle, authorEvent.body, authorEvent.mentions, authorEvent.metadata);

    // 2. Broker Sequence & Previous Hash
    const epoch = readCurrentEpoch();
    const discontinuity = readEpochDiscontinuity(epoch);
    if (discontinuity) {
      const audit = verifyCurrentEpoch({ epoch, roomPath: ROOM_FILE });
      if (!audit.ok) {
        throw roomEpochIntegrityError(`current Room epoch verification failed (${audit.failureCount} failures)`);
      }
    }
    const headState = getBrokerHeadState(ROOM_FILE);
    const position = nextBrokerPosition(headState, epoch);
    const brokerSequence = position.brokerSequence;
    const previousRecordHash = position.previousRecordHash;
    const receivedAt = new Date().toISOString();

    const brokerRecord = {
      brokerRecordVersion: '1.0',
      brokerSequence,
      ...(discontinuity ? { ledgerEpochId: epoch.epochId } : {}),
      receivedAt,
      eventId: authorEvent.eventId,
      previousRecordHash,
      evaluatedAudience: routing.targetAudience,
      evaluatedDeliveryType: routing.deliveryType,
      authorityDecision: {
        allowed: true,
        // Reason comes from the policy, not re-derived here: there is now more
        // than one way to earn ACTION_REQUIRED (Founder Directive vs Lane
        // Dispatch) and two copies of that logic would drift.
        reason: routing.authorityReason
          || (routing.deliveryType === 'ACTION_REQUIRED' ? 'Founder Directive' : 'Standard Transmission'),
        // Which authority level the grant was made at. Recorded on every
        // record so an actuation is traceable to the rule that allowed it.
        senderAuthorityLevel: routing.senderAuthorityLevel || 'UNKNOWN'
      },
      event: authorEvent
    };

    brokerRecord.recordHash = computeRecordHash(brokerRecord);

    // 3. Append BrokerRecord to room.jsonl
    // Defensive: if a prior writer's append ever landed without its trailing
    // newline (seen in production, seq 1412/1413 concatenated on one line),
    // repair the join point rather than propagate the corruption.
    if (fs.existsSync(ROOM_FILE)) {
      const fd = fs.openSync(ROOM_FILE, 'r+');
      try {
        const size = fs.fstatSync(fd).size;
        if (size > 0) {
          const buf = Buffer.alloc(1);
          fs.readSync(fd, buf, 0, 1, size - 1);
          if (buf[0] !== 0x0a) fs.writeSync(fd, '\n', size);
        }
      } finally {
        fs.closeSync(fd);
      }
    }
    fs.appendFileSync(ROOM_FILE, JSON.stringify(brokerRecord) + '\n', 'utf8');

    // 4. Dispatch to recipient inboxes WITHOUT advancing cursors
    if (routing.deliveryType === 'ACTION_REQUIRED' && Array.isArray(routing.targetAudience)) {
      for (const target of routing.targetAudience) {
        const inboxFile = path.join(INBOX_DIR, `${target}.json`);
        // Every inbox on disk is a bare array (postToRoom's shape). Reading one
        // into { pending } and pushing there attaches a non-index property to an
        // array, which JSON.stringify drops — the directive was written to a
        // field that never survived serialisation. Detect the shape, keep it.
        let entries = [];
        let wrapped = false;
        if (fs.existsSync(inboxFile)) {
          try {
            const parsed = JSON.parse(fs.readFileSync(inboxFile, 'utf8'));
            if (Array.isArray(parsed)) {
              entries = parsed;
            } else if (parsed && Array.isArray(parsed.pending)) {
              entries = parsed.pending;
              wrapped = true;
            }
          } catch {}
        }
        entries.push({
          id: authorEvent.eventId,
          from: authorEvent.senderHandle,
          to: target,
          status: 'unread',
          isRoomBroadcast: true,
          mentions: Array.isArray(authorEvent.mentions) ? authorEvent.mentions : [],
          timestamp: authorEvent.createdAt,
          type: authorEvent.type,
          subject: `[ROOM] ${authorEvent.type}: ${authorEvent.body.slice(0, 50)}...`,
          body: authorEvent.body,
          taskId: authorEvent.taskId,
          task: authorEvent.taskId,
          action: authorEvent.metadata?.action || null,
          threadId: authorEvent.threadId,
          deliveryType: routing.deliveryType,
          brokerSequence: brokerRecord.brokerSequence
        });
        fs.writeFileSync(inboxFile, JSON.stringify(wrapped ? { pending: entries } : entries, null, 2), 'utf8');
      }
    }

    return brokerRecord;
  });
}
