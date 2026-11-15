'use strict';
const test = require('node:test');
const assert = require('node:assert');
const dm = require('../dm');
const { createApp, createLimiter } = require('../server');

const state = () => ({
  players: [
    { name: 'Ava', cls: 'Tank', hp: 6, maxHp: 6, points: 0, inventory: ['Duct Tape', 'Space Snack'], pos: { x: 0, y: 0 } },
    { name: 'Ben', cls: 'Scout', hp: 5, maxHp: 5, points: 0, inventory: ['Grappling Hook'], pos: { x: 0, y: 1 } },
    { name: 'Cy', cls: 'Engineer', hp: 4, maxHp: 4, points: 0, inventory: [], pos: { x: 0, y: 2 } },
  ],
  enemies: [
    { id: 'b1', name: 'Moon Bug A', hits: 0, pos: { x: 4, y: 1 } },
    { id: 'w', name: 'Giant Moon Worm', boss: true, hits: 2, pos: { x: 5, y: 3 } },
  ],
  props: [{ id: 'rock', name: 'Big Rock', pos: { x: 3, y: 3 } }, { id: 'crate', name: 'Crate', searched: true, pos: { x: 2, y: 0 } }],
  poi: { name: 'Cabeus', challenge: 'Drill', fact: 'LCROSS found water ice here.' },
  favorite: 0, joke: 1, gags: ['Ben fell in a crater'], log: [],
});
const req = (over = {}) => dm.sanitizeRequest({ mode: 'action', actor: 0, roll: 12, text: 'go', state: state(), ...over });

test('rollBand edges', () => {
  const expect = { 1: 'CRIT_FAIL', 2: 'VERY_BAD', 3: 'VERY_BAD', 4: 'BAD', 9: 'BAD', 10: 'CLOSE_CALL', 11: 'SUCCESS', 17: 'SUCCESS', 18: 'GREAT', 19: 'GREAT', 20: 'CRIT_SUCCESS' };
  for (const [r, b] of Object.entries(expect)) assert.strictEqual(dm.rollBand(Number(r)), b, `roll ${r}`);
});

test('sanitizeRequest rejects junk, clips text, and drops items you do not own', () => {
  assert.throws(() => dm.sanitizeRequest({}), /mode/);
  assert.throws(() => dm.sanitizeRequest({ mode: 'action', text: 'hi', state: { players: [] } }), /players/);
  const r = req({ actor: 9, roll: 99, text: 'x'.repeat(5000) });
  assert.strictEqual(r.text.length, 300);
  assert.strictEqual(r.roll, 20);
  assert.strictEqual(r.actor, 2);
  assert.strictEqual(req({ itemUsed: 'Moon Nuke' }).itemUsed, null);
  assert.strictEqual(req({ itemUsed: 'duct tape' }).itemUsed, 'Duct Tape');
});

test('no conjuring: items only appear from a real search or a nat 20, max 1', () => {
  const conjure = { effects: [{ player: 0, addItem: 'Moon Nuke' }] };
  assert.strictEqual(dm.sanitizeReply(conjure, req()).effects[0].addItem, null);
  const searchedTwice = { searched: 'crate', effects: [{ player: 0, addItem: 'Nuke' }] };
  assert.strictEqual(dm.sanitizeReply(searchedTwice, req()).effects[0].addItem, null, 'crate was already searched');
  const legit = { searched: 'rock', effects: [{ player: 0, addItem: 'Spare Bolt' }, { player: 1, addItem: 'Second Bolt' }] };
  const out = dm.sanitizeReply(legit, req());
  assert.strictEqual(out.searched, 'rock');
  assert.deepStrictEqual(out.effects.map((e) => e.addItem), ['Spare Bolt', null]);
  assert.strictEqual(dm.sanitizeReply(conjure, req({ roll: 20 })).effects[0].addItem, 'Moon Nuke');
});

test('damage capped at 2, can only remove items the player has', () => {
  const out = dm.sanitizeReply({ effects: [{ player: 0, hpChange: -99, removeItem: 'Laser' }, { player: 0, removeItem: 'space snack' }] }, req());
  assert.strictEqual(out.effects[0].hpChange, -2);
  assert.strictEqual(out.effects[0].removeItem, null);
  assert.strictEqual(out.effects[1].removeItem, 'Space Snack');
});

test('enemies: boss needs 4 hits, unknown ids ignored', () => {
  const out = dm.sanitizeReply({ enemyUpdates: [{ id: 'w', hit: true, defeated: true }, { id: 'ghost', hit: true, defeated: true }, { id: 'b1', hit: true, defeated: true }] }, req());
  assert.deepStrictEqual(out.enemyUpdates, [{ id: 'w', hit: true, defeated: false }, { id: 'b1', hit: true, defeated: true }]);
  const s = state(); s.enemies[1].hits = 3;
  const out2 = dm.sanitizeReply({ enemyUpdates: [{ id: 'w', hit: true, defeated: true }] }, dm.sanitizeRequest({ mode: 'action', actor: 0, roll: 15, text: 'x', state: s }));
  assert.strictEqual(out2.enemyUpdates[0].defeated, true);
});

test('moves: inside grid, no stacking, no unknown movers', () => {
  const out = dm.sanitizeReply({ moves: [{ who: 'p0', x: 99, y: -5 }, { who: 'p1', x: 4, y: 1 }, { who: 'zz', x: 1, y: 1 }, { who: 'b1', x: 1, y: 1 }] }, req());
  assert.deepStrictEqual(out.moves, [{ who: 'p0', x: 5, y: 0 }, { who: 'b1', x: 1, y: 1 }]);
});

test('talk mode never moves, damages, or gives items', () => {
  const out = dm.sanitizeReply({ effects: [{ player: 0, hpChange: -2, pointsChange: 50, addItem: 'Gift' }], moves: [{ who: 'p0', x: 1, y: 1 }], enemyUpdates: [{ id: 'b1', hit: true, defeated: true }] }, req({ mode: 'talk' }));
  assert.deepStrictEqual(out.effects[0], { player: 0, hpChange: 0, pointsChange: 50, addItem: null, removeItem: null });
  assert.deepStrictEqual([out.moves, out.enemyUpdates], [[], []]);
});

test('fallback: damage rule (6-9 = 1, 1-5 = 2), favorite twist, search finds', () => {
  const ben = (roll, text = 'attack') => dm.fallbackReply(req({ actor: 1, roll, text }));
  assert.strictEqual(ben(7).effects[0].hpChange, -1);
  assert.strictEqual(ben(3).effects[0].hpChange, -2);
  assert.ok(ben(3).effects[0].pointsChange < 0, 'joke loses points');
  const fav = dm.fallbackReply(req({ actor: 0, roll: 5 }));
  assert.ok(fav.enemyUpdates[0].hit && fav.effects[0].pointsChange > 0);
  const search = ben(15, 'I search behind the rock');
  assert.strictEqual(search.searched, 'rock');
  assert.ok(search.effects[0].addItem);
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

test('endpoint uses Gemini, skips thought parts, sends key only in header', async () => {
  let seen;
  const fakeFetch = async (url, init) => {
    seen = { url, init };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ thought: true, text: 'thinking {nope}' }, { text: '```json\n{"narration":"Boom","enemyUpdates":[{"id":"b1","hit":true,"defeated":false}],"newGag":"Ava punched a rock"}\n```' }] } }] }) };
  };
  await withServer({ apiKey: 'TEST_KEY', model: 'm', fetchImpl: fakeFetch }, async (base) => {
    const out = await (await post(base, { mode: 'action', actor: 0, roll: 15, text: 'punch the bug', state: state() })).json();
    assert.strictEqual(out.narration, 'Boom');
    assert.strictEqual(out.enemyUpdates[0].hit, true);
    assert.strictEqual(seen.init.headers['x-goog-api-key'], 'TEST_KEY');
    assert.ok(!seen.url.includes('TEST_KEY'));
    assert.ok(seen.init.body.includes('Ben fell in a crater'), 'gags are sent with every prompt');
  });
});

test('endpoint falls back when Gemini errors, and 400s on bad input', async () => {
  const failing = async () => ({ ok: false, status: 404, text: async () => 'model not found' });
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
