'use strict';
const test = require('node:test');
const assert = require('node:assert');
const dm = require('../dm');
const { createApp, createLimiter } = require('../server');

const state = () => ({
  players: [
    { name: 'Ava', hp: 10, maxHp: 10, points: 0, inventory: ['Duct Tape'] },
    { name: 'Ben', hp: 10, maxHp: 10, points: 0, inventory: [] },
    { name: 'Cy', hp: 10, maxHp: 10, points: 0, inventory: [] },
  ],
  poi: { name: 'Cabeus', challenge: 'Drill', fact: 'LCROSS found water ice here.' },
  enemy: { name: 'Ice Mites', hp: 10, maxHp: 10 },
  favorite: 0, joke: 1, gags: ['Ben fell in a crater'], log: [],
});

test('rollBand edges', () => {
  const expect = { 1: 'CRIT_FAIL', 2: 'VERY_BAD', 3: 'VERY_BAD', 4: 'BAD', 9: 'BAD', 10: 'CLOSE_CALL', 11: 'SUCCESS', 17: 'SUCCESS', 18: 'GREAT', 19: 'GREAT', 20: 'CRIT_SUCCESS' };
  for (const [r, b] of Object.entries(expect)) assert.strictEqual(dm.rollBand(Number(r)), b, `roll ${r}`);
});

test('sanitizeRequest rejects junk and clips long text', () => {
  assert.throws(() => dm.sanitizeRequest({}), /mode/);
  assert.throws(() => dm.sanitizeRequest({ mode: 'action', text: 'hi', state: { players: [] } }), /players/);
  const r = dm.sanitizeRequest({ mode: 'action', actor: 9, roll: 99, text: 'x'.repeat(5000), state: state() });
  assert.strictEqual(r.text.length, 300);
  assert.strictEqual(r.roll, 20);
  assert.strictEqual(r.actor, 2);
});

test('sanitizeReply clamps crazy model output', () => {
  const req = dm.sanitizeRequest({ mode: 'action', actor: 0, roll: 5, text: 'attack', state: state() });
  const out = dm.sanitizeReply({ narration: 'hi', effects: [{ player: 7, hpChange: -999, pointsChange: 1e9 }], enemyDamage: 500, progress: 9 }, req);
  assert.deepStrictEqual(out.effects[0], { player: 2, hpChange: -4, pointsChange: 200, addItem: null, removeItem: null });
  assert.strictEqual(out.enemyDamage, 12);
  assert.strictEqual(out.progress, 2);
  assert.strictEqual(dm.sanitizeReply(null, req).narration.length > 0, true);
});

test('fallback: favorite bad roll is twisted, joke loses points, nat 1 hurts', () => {
  const s = state();
  const fav = dm.fallbackReply(dm.sanitizeRequest({ mode: 'action', actor: 0, roll: 5, text: 'go', state: s }));
  assert.ok(fav.enemyDamage > 0 && fav.effects[0].pointsChange > 0);
  const joke = dm.fallbackReply(dm.sanitizeRequest({ mode: 'action', actor: 1, roll: 5, text: 'go', state: s }));
  assert.ok(joke.effects[0].pointsChange < 0);
  const one = dm.fallbackReply(dm.sanitizeRequest({ mode: 'action', actor: 2, roll: 1, text: 'go', state: s }));
  assert.ok(one.effects[0].hpChange < 0);
});

test('limiter: per-minute and daily cap', () => {
  let t = Date.UTC(2026, 10, 14, 12);
  const lim = createLimiter({ perMinute: 2, dailyCap: 3, now: () => t });
  assert.ok(lim('a').ok); assert.ok(lim('a').ok);
  assert.strictEqual(lim('a').reason, 'minute');
  assert.ok(lim('b').ok);
  assert.strictEqual(lim('c').reason, 'daily');
  t += 24 * 3600 * 1000;
  assert.ok(lim('c').ok);
});

async function withServer(opts, fn) {
  const server = createApp(opts).listen(0);
  await new Promise((r) => server.once('listening', r));
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}
const post = (base, body) => fetch(base + '/api/dm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('endpoint uses Gemini, sends key only in header, clamps reply', async () => {
  let seen;
  const fakeFetch = async (url, init) => {
    seen = { url, init };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"narration":"Boom","rollingFor":"Strength","effects":[{"player":0,"hpChange":-50}],"enemyDamage":3,"progress":1,"newGag":"Ava punched a rock"}' }] } }] }) };
  };
  await withServer({ apiKey: 'TEST_KEY', model: 'm', fetchImpl: fakeFetch }, async (base) => {
    const res = await post(base, { mode: 'action', actor: 0, roll: 15, text: 'punch the bug', state: state() });
    const out = await res.json();
    assert.strictEqual(out.narration, 'Boom');
    assert.strictEqual(out.effects[0].hpChange, -4);
    assert.strictEqual(out.newGag, 'Ava punched a rock');
    assert.strictEqual(seen.init.headers['x-goog-api-key'], 'TEST_KEY');
    assert.ok(!seen.url.includes('TEST_KEY'));
    assert.ok(seen.init.body.includes('Ben fell in a crater'), 'gags are sent with every prompt');
  });
});

test('endpoint falls back when Gemini errors, and 400s on bad input', async () => {
  const failing = async () => ({ ok: false, status: 429 });
  await withServer({ apiKey: 'K', model: 'm', fetchImpl: failing }, async (base) => {
    const out = await (await post(base, { mode: 'talk', actor: 0, text: 'hi', talkTo: 'dm', state: state() })).json();
    assert.strictEqual(out.offline, true);
    assert.strictEqual((await post(base, { mode: 'nope' })).status, 400);
  });
});

test('endpoint rate limits but still answers', async () => {
  await withServer({ apiKey: '', perMinute: 1, dailyCap: 100 }, async (base) => {
    const body = { mode: 'action', actor: 0, roll: 12, text: 'go', state: state() };
    await post(base, body);
    const out = await (await post(base, body)).json();
    assert.strictEqual(out.limited, 'minute');
  });
});
