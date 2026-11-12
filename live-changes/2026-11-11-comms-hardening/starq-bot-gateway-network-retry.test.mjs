import test from 'node:test';
import assert from 'node:assert/strict';
import { isDefinitelyNotSent, relayOutbound, getRelayHealth } from '../scripts/starq-bot-gateway.mjs';

const netErr = (code) => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(code), { code }) });
const rec = (seq) => ({
  brokerSequence: seq, eventId: String(seq).padStart(64, 'a'), recordHash: String(seq).padStart(64, 'b'),
  evaluatedDeliveryType: 'CC_CONTEXT', evaluatedAudience: 'ALL',
  event: { senderHandle: 'codex', body: `body ${seq}`, metadata: { subject: 's', actionRequired: 'NONE' } },
});
const withMirror = async (fn) => { const prev = process.env.STARQ_BOT_MIRROR_ALL; process.env.STARQ_BOT_MIRROR_ALL = '1';
  try { return await fn(); } finally { if (prev == null) delete process.env.STARQ_BOT_MIRROR_ALL; else process.env.STARQ_BOT_MIRROR_ALL = prev; } };

test('classification: pre-connection errors are not-sent; resets and unknowns stay ambiguous', () => {
  for (const c of ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT']) assert.equal(isDefinitelyNotSent(netErr(c)), true, c);
  for (const c of ['UND_ERR_SOCKET', 'ECONNRESET', 'UND_ERR_HEADERS_TIMEOUT', 'ETIMEDOUT', undefined]) assert.equal(isDefinitelyNotSent(netErr(c)), false, String(c));
  assert.equal(isDefinitelyNotSent(new Error('boom')), false);
  const agg = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new AggregateError([]), { errors: [{ code: 'ECONNREFUSED' }, { code: 'ENETUNREACH' }] }) });
  assert.equal(isDefinitelyNotSent(agg), true);
  const mixed = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new AggregateError([]), { errors: [{ code: 'ECONNREFUSED' }, { code: 'ECONNRESET' }] }) });
  assert.equal(isDefinitelyNotSent(mixed), false);
});

test('network down: record is retryable (failed, not ambiguous) and is delivered once after restart', async () => {
  await withMirror(async () => {
    const records = [rec(10), rec(11), rec(12)];
    let online = false; const sent = [];
    const sendMessage = async (p) => { if (!online) throw netErr('ENOTFOUND'); sent.push(p.text.match(/body (\d+)/)[1]); return { ok: true }; };
    const state = { knownChatId: 1, roomLastSeq: 9 };
    const r1 = await relayOutbound(state, { sendMessage, readRecords: () => records, persistState: () => {} });
    assert.equal(r1.failed, true); assert.notEqual(r1.ambiguous, true);
    assert.equal(state.outboundProgress.status, 'failed');
    assert.equal(state.roomLastSeq, 9);
    assert.equal(getRelayHealth(state, 12).status, 'TRANSPORT_FAILING', 'the supervisor restarts on this status');
    online = true;
    const restarted = JSON.parse(JSON.stringify(state));
    await relayOutbound(restarted, { sendMessage, readRecords: () => records, persistState: () => {} });
    assert.deepEqual(sent, ['10', '11', '12']);
    assert.equal(restarted.roomLastSeq, 12);
    assert.equal(restarted.outboundProgress, undefined);
  });
});

test('connection reset during a send stays ambiguous and is not retried automatically', async () => {
  await withMirror(async () => {
    const sent = []; const state = { knownChatId: 1, roomLastSeq: 9 };
    const r = await relayOutbound(state, { sendMessage: async () => { throw netErr('UND_ERR_SOCKET'); }, readRecords: () => [rec(10)], persistState: () => {} });
    assert.equal(r.ambiguous, true); assert.equal(state.outboundProgress.status, 'ambiguous');
    const again = JSON.parse(JSON.stringify(state));
    await relayOutbound(again, { sendMessage: async (p) => { sent.push(p); return { ok: true }; }, readRecords: () => [rec(10)], persistState: () => {} });
    assert.equal(sent.length, 0); assert.equal(again.roomLastSeq, 9);
  });
});
