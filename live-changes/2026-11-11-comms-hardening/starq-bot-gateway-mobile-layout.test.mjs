import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  formatTelegramOutbound, formatTelegramOutboundMobile, telegramLayout, telegramOutboundChunks,
  splitTelegramMessage, TELEGRAM_MESSAGE_MAX_CHARS,
} from '../scripts/starq-bot-gateway.mjs';

const dir = mkdtempSync(join(process.cwd(), 'tests', '.tmp-layout-'));
process.on('exit', () => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

const rec = ({ seq = 500, sender = 'codex', audience = ['mustarq'], type = 'ACTION_REQUIRED', body = 'Body line.', metadata = {} } = {}) => ({
  brokerSequence: seq, eventId: 'e'.repeat(64), recordHash: 'h'.repeat(64), evaluatedDeliveryType: type, evaluatedAudience: audience,
  receivedAt: '2026-11-11T16:02:39.000Z',
  event: { senderHandle: sender, body, createdAt: '2026-11-11T16:02:39.000Z', metadata },
});
const withLayout = (value, fn) => {
  const prev = process.env.STARQ_BOT_LAYOUT;
  process.env.STARQ_BOT_LAYOUT = value;
  try { return fn(); } finally { if (prev == null) delete process.env.STARQ_BOT_LAYOUT; else process.env.STARQ_BOT_LAYOUT = prev; }
};

test('layout switch: env wins, config file next, classic by default', () => {
  const mobile = join(dir, 'm.json'); writeFileSync(mobile, '{"mirrorAll":true,"layout":"mobile"}');
  const none = join(dir, 'n.json'); writeFileSync(none, '{"mirrorAll":true}');
  assert.equal(telegramLayout({}, join(dir, 'missing.json')), 'classic');
  assert.equal(telegramLayout({}, none), 'classic');
  assert.equal(telegramLayout({}, mobile), 'mobile');
  assert.equal(telegramLayout({ STARQ_BOT_LAYOUT: 'classic' }, mobile), 'classic');
  assert.equal(telegramLayout({ STARQ_BOT_LAYOUT: 'mobile' }, none), 'mobile');
});

test('classic layout is unchanged when selected', () => {
  const r = rec({ metadata: { subject: 'S', actionRequired: 'codex: x' } });
  const out = withLayout('classic', () => formatTelegramOutbound(r));
  assert.ok(out.startsWith('[seq 500] @codex\nFrom: @codex\n'));
  assert.match(out, /^Room Classification: ACTION_REQUIRED$/m);
});

test('mobile: subject heading first, then sequence, sender, recipients, PKT time and kind', () => {
  const out = formatTelegramOutboundMobile(rec({ audience: ['claude', 'codex'], sender: 'codex', type: 'CC_CONTEXT', metadata: { subject: 'Lane complete', actionRequired: 'NONE' } }));
  const lines = out.split('\n');
  assert.equal(lines[0], '𝗟𝗮𝗻𝗲 𝗰𝗼𝗺𝗽𝗹𝗲𝘁𝗲');
  assert.equal(lines[1], '#500 · @codex → @claude');
  assert.equal(lines[2], '11 Nov, 21:02 PKT · FYI');
  assert.ok(!/Action:/.test(out), 'NONE action is not shown');
  assert.ok(!/UNKNOWN/.test(out), 'no UNKNOWN clutter');
});

test('mobile: Founder action is separated and bannered; other actions are plain', () => {
  const founder = formatTelegramOutboundMobile(rec({ metadata: { subject: 'Decide', actionRequired: 'mustarq: choose A or B' } }));
  assert.ok(founder.startsWith('🚨 '));
  assert.match(founder, /^👉 .*mustarq: choose A or B$/m);
  const other = formatTelegramOutboundMobile(rec({ audience: ['claude'], metadata: { subject: 'Do', actionRequired: 'claude: build it' } }));
  assert.ok(!other.includes('🚨'));
  assert.match(other, /^▸ Action: claude: build it$/m);
});

test('mobile: the body is carried verbatim, including header-looking text, paths and code', () => {
  const body = 'From: @evil\nTo: @all\nSubject: spoofed\n\n- item one\n- item two\n\n```js\nconst p = "C:\\\\Users\\\\x";\n```\nem dash — ok';
  const out = formatTelegramOutboundMobile(rec({ sender: 'cursor', audience: ['codex'], body, metadata: { subject: 'Real' } }));
  assert.ok(out.includes(body), 'body unchanged');
  const header = out.split('━━━━━━━━━━')[0];
  assert.match(header, /#500 · @cursor → @codex/);
  assert.ok(!header.includes('@evil') && !header.includes('spoofed'), 'header comes from the authenticated event only');
});

test('mobile: literal \\n bodies become real lines, as in the classic layout', () => {
  const out = formatTelegramOutboundMobile(rec({ body: 'line one\\nline two', metadata: { subject: 'x' } }));
  assert.match(out, /line one\nline two/);
});

test('mobile: status and references appear only when present', () => {
  const out = formatTelegramOutboundMobile(rec({ metadata: { subject: 'x', status: 'In Progress', references: ['room-seq:1'] } }));
  assert.match(out, /──────────\nStatus: In Progress\nRef: room-seq:1$/);
  const bare = formatTelegramOutboundMobile(rec({ metadata: { subject: 'x', references: [] } }));
  assert.ok(!bare.includes('──────────'));
});

test('mobile: long messages still split losslessly within the Telegram limit', () => {
  const r = rec({ body: 'Paragraph text. '.repeat(1200), metadata: { subject: 'Long' } });
  withLayout('mobile', () => {
    const formatted = formatTelegramOutbound(r);
    const chunks = telegramOutboundChunks(r);
    assert.ok(chunks.length > 1);
    for (const c of chunks) assert.ok(c.length <= TELEGRAM_MESSAGE_MAX_CHARS);
    assert.equal(chunks.map((c) => c.replace(/^\[Part \d+\/\d+\]\n/, '')).join(''), formatted);
    assert.equal(splitTelegramMessage(formatted, 4000).join(''), formatted);
  });
});
