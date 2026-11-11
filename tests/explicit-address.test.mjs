import test from 'node:test';
import assert from 'node:assert/strict';

process.env.COMMS_IDENTITIES_PATH = process.env.COMMS_IDENTITIES_PATH || 'tests/fixtures/identities.json';
const { parseExplicitAddress } = await import('../protocol/v1/explicitAddress.mjs');

test('body mentions and quoted/forwarded mentions are not addresses', () => {
  for (const body of [
    '@claude please review',
    'Forwarded: @claude please review',
    '> /to @claude role=ops-room-deputy\nquoted text',
  ]) {
    const parsed = parseExplicitAddress(body);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.addressed, false);
    assert.equal(parsed.routing, null);
    assert.equal(parsed.actionRequired, 'NONE');
    assert.equal(parsed.body, body);
  }
});

test('strict first-line header validates and removes only its own line', () => {
  const parsed = parseExplicitAddress(
    '/to @claude role=ops-room-deputy backend=windows/default; @codex\r\n\r\nPlease inspect the attached routing issue.',
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.addressed, true);
  assert.deepEqual(parsed.routing, {
    schema: 'starq.routing/1',
    targets: [
      { handle: 'claude', role: 'ops-room-deputy', backend: 'windows/default' },
      { handle: 'codex' },
    ],
  });
  assert.equal(parsed.actionRequired, 'Respond to this explicitly addressed Room message');
  assert.equal(parsed.body, '\r\nPlease inspect the attached routing issue.');
});

test('shared handles remain unqualified unless the sender supplies a selector', () => {
  const parsed = parseExplicitAddress('/to @claude\nPlease take a look.');
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.routing.targets, [{ handle: 'claude' }]);
  assert.equal(parsed.routing.targets[0].role, undefined);
  assert.equal(parsed.routing.targets[0].instance, undefined);
  assert.equal(parsed.routing.targets[0].backend, undefined);
});

test('Founder notice never becomes an agent routing target', () => {
  const founderOnly = parseExplicitAddress('/to @mustarq\nFYI');
  assert.equal(founderOnly.ok, true);
  assert.equal(founderOnly.founderNotice, true);
  assert.equal(founderOnly.routing, null);
  assert.equal(founderOnly.actionRequired, 'NONE');

  const mixed = parseExplicitAddress('/to @mustarq; @codex\nPlease triage.');
  assert.equal(mixed.ok, true);
  assert.equal(mixed.founderNotice, true);
  assert.deepEqual(mixed.routing.targets, [{ handle: 'codex' }]);
});

test('malformed, unknown, duplicate, or empty recipients fail closed', () => {
  for (const message of [
    '/to',
    '/to @not-registered\nDo work.',
    '/to @codex pane=p1\nDo work.',
    '/to @codex role=erp-floor-lead role=ops-room-deputy\nDo work.',
    '/to @mustarq role=ops-room-deputy\nDo work.',
    '/to ; @codex\nDo work.',
  ]) {
    const parsed = parseExplicitAddress(message);
    assert.equal(parsed.ok, false, message);
    assert.equal(parsed.routing, null, message);
    assert.equal(parsed.actionRequired, 'NONE', message);
    assert.ok(parsed.errors.length, message);
  }
});
