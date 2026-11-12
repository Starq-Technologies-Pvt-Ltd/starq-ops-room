import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deliverRecordChunks, isMirrorAllEnabled, sendWithTelegramBackoff, relayOutbound } from '../scripts/starq-bot-gateway.mjs';

const dir = mkdtempSync(join(process.cwd(), 'tests', '.tmp-mirror-'));
const rec = (seq, extra = {}) => ({
  brokerSequence: seq, eventId: String(seq).padStart(64, 'a'), recordHash: String(seq).padStart(64, 'b'),
  evaluatedDeliveryType: 'CC_CONTEXT', evaluatedAudience: 'ALL', receivedAt: '2026-11-11T00:00:00.000Z',
  event: { senderHandle: 'codex', body: `body ${seq}`, createdAt: '2026-11-11T00:00:00.000Z', metadata: { subject: 's', actionRequired: 'NONE' }, ...extra },
});
const withFlag = async (value, fn) => {
  const prev = process.env.STARQ_BOT_MIRROR_ALL;
  if (value == null) delete process.env.STARQ_BOT_MIRROR_ALL; else process.env.STARQ_BOT_MIRROR_ALL = value;
  try { return await fn(); } finally { if (prev == null) delete process.env.STARQ_BOT_MIRROR_ALL; else process.env.STARQ_BOT_MIRROR_ALL = prev; }
};

test('mirror flag: env overrides config; default off', () => {
  const on = join(dir, 'on.json'); writeFileSync(on, '{"mirrorAll":true}');
  const off = join(dir, 'off.json'); writeFileSync(off, '{"mirrorAll":false}');
  assert.equal(isMirrorAllEnabled({}, join(dir, 'missing.json')), false);
  assert.equal(isMirrorAllEnabled({}, on), true);
  assert.equal(isMirrorAllEnabled({}, off), false);
  assert.equal(isMirrorAllEnabled({ STARQ_BOT_MIRROR_ALL: '0' }, on), false);
  assert.equal(isMirrorAllEnabled({ STARQ_BOT_MIRROR_ALL: '1' }, off), true);
});

test('mirror off: informational record is suppressed and the cursor advances', async () => {
  await withFlag('0', async () => {
    const sent = []; const state = { knownChatId: 1, roomLastSeq: 9 };
    const res = await deliverRecordChunks(rec(10), state, { sendMessage: async (p) => { sent.push(p); return { ok: true }; }, persistState: () => {} });
    assert.equal(res.skipped, true); assert.equal(sent.length, 0); assert.equal(state.roomLastSeq, 10);
  });
});

test('mirror on: informational record is sent with sender, sequence and body', async () => {
  await withFlag('1', async () => {
    const sent = []; const state = { knownChatId: 1, roomLastSeq: 9 };
    const res = await deliverRecordChunks(rec(10), state, { sendMessage: async (p) => { sent.push(p); return { ok: true }; }, persistState: () => {} });
    assert.equal(res.delivered, true); assert.notEqual(res.skipped, true);
    assert.equal(sent.length, 1); assert.match(sent[0].text, /\[seq 10\] @codex/); assert.match(sent[0].text, /body 10/);
    assert.equal(state.roomLastSeq, 10); assert.equal(state.outboundProgress, undefined);
  });
});

test('mirror on: a failed send keeps the cursor and is retried after restart without loss or duplicate', async () => {
  await withFlag('1', async () => {
    const records = [rec(10), rec(11), rec(12)];
    const sent = []; let fail = true;
    const state = { knownChatId: 1, roomLastSeq: 9 };
    const sendMessage = async (p) => { if (fail && /body 11/.test(p.text)) return { ok: false, error_code: 500 }; sent.push(p.text); return { ok: true }; };
    const first = await relayOutbound(state, { sendMessage, readRecords: () => records, persistState: () => {} });
    assert.equal(first.failed, true); assert.equal(state.roomLastSeq, 10);
    // restart: same persisted state object contents, new process
    const restarted = JSON.parse(JSON.stringify(state)); fail = false;
    await relayOutbound(restarted, { sendMessage, readRecords: () => records, persistState: () => {} });
    assert.equal(restarted.roomLastSeq, 12);
    assert.deepEqual(sent.map((t) => t.match(/body (\d+)/)[1]), ['10', '11', '12']);
  });
});

test('mirror on: the Founder own Telegram message is not echoed back', async () => {
  await withFlag('1', async () => {
    const sent = []; const state = { knownChatId: 1, roomLastSeq: 9 };
    const inbound = rec(10, { senderHandle: 'mustarq', metadata: { telegramUpdateId: 5, actionRequired: 'x' } });
    await relayOutbound(state, { sendMessage: async (p) => { sent.push(p); return { ok: true }; }, readRecords: () => [inbound], persistState: () => {} });
    assert.equal(sent.length, 0); assert.equal(state.roomLastSeq, 10);
  });
});

test('429 is retried after retry_after and never duplicates', async () => {
  let calls = 0; const waits = [];
  const res = await sendWithTelegramBackoff(async () => { calls += 1; return calls < 3 ? { ok: false, error_code: 429, parameters: { retry_after: 2 } } : { ok: true }; }, {}, { sleep: async (ms) => waits.push(ms) });
  assert.equal(res.ok, true); assert.equal(calls, 3); assert.deepEqual(waits, [2000, 2000]);
  let n = 0; const hard = await sendWithTelegramBackoff(async () => { n += 1; return { ok: false, error_code: 400 }; }, {}, { sleep: async () => {} });
  assert.equal(hard.ok, false); assert.equal(n, 1);
});
