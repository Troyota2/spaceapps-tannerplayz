'use strict';
// SI disclosure: this file was written with help from Claude (Anthropic), an AI assistant, and reviewed/deployed by Troy.
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
const req = (over = {}) => dm.sanitizeRequest({ mode: 'action', actor: 0, roll: 12, text: 'I attack the bug', state: state(), ...over });

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

test('self-damage only on 1-3; friendly fire max 1; can only remove items the player has', () => {
  const hit = (roll, player = 0) => dm.sanitizeReply({ effects: [{ player, hpChange: -99 }] }, req({ roll })).effects[0].hpChange;
  assert.strictEqual(hit(12), 0, 'a 12 never hurts you');
  assert.strictEqual(hit(8), 0, 'an 8 never hurts you');
  assert.strictEqual(hit(3), -1);
  assert.strictEqual(hit(1), -2);
  assert.strictEqual(hit(15, 1), -1, 'friendly fire max 1');
  const out = dm.sanitizeReply({ effects: [{ player: 0, hpChange: -99, removeItem: 'Laser' }, { player: 0, removeItem: 'space snack' }] }, req({ roll: 1 }));
  assert.strictEqual(out.effects[0].hpChange, -2);
  assert.strictEqual(out.effects[0].removeItem, null);
  assert.strictEqual(out.effects[1].removeItem, 'Space Snack');
});

test('enemies: boss needs 4 hits, unknown ids ignored', () => {
  const out = dm.sanitizeReply({ enemyUpdates: [{ id: 'w', hit: true, defeated: true }, { id: 'ghost', hit: true, defeated: true }, { id: 'b1', hit: true, defeated: true }] }, req());
  assert.deepStrictEqual(out.enemyUpdates, [{ id: 'w', hit: true, defeated: false }, { id: 'b1', hit: true, defeated: true }]);
  const s = state(); s.enemies[1].hits = 3;
  const out2 = dm.sanitizeReply({ enemyUpdates: [{ id: 'w', hit: true, defeated: true }] }, dm.sanitizeRequest({ mode: 'action', actor: 0, roll: 15, text: 'I hit the worm', state: s }));
  assert.strictEqual(out2.enemyUpdates[0].defeated, true);
});

test('moves: inside grid, no stacking, no unknown movers', () => {
  const out = dm.sanitizeReply({ moves: [{ who: 'p0', x: 99, y: -5 }, { who: 'p1', x: 4, y: 1 }, { who: 'zz', x: 1, y: 1 }, { who: 'b1', x: 1, y: 1 }] }, req());
  assert.deepStrictEqual(out.moves, [{ who: 'p0', x: 5, y: 0 }, { who: 'b1', x: 1, y: 1 }]);
});

test('searching from far away walks the player next to the spot', () => {
  // Ava is at (0,0); the Big Rock is at (3,3).
  const out = dm.sanitizeReply({ searched: 'rock', effects: [] }, req());
  const mv = out.moves.find((m) => m.who === 'p0');
  assert.ok(mv, 'a move was added');
  assert.ok(Math.max(Math.abs(mv.x - 3), Math.abs(mv.y - 3)) <= 1, 'now adjacent');
  // Already adjacent: no move added.
  const s = state(); s.players[0].pos = { x: 2, y: 3 };
  const out2 = dm.sanitizeReply({ searched: 'rock' }, dm.sanitizeRequest({ mode: 'action', actor: 0, roll: 12, text: 'x', state: s }));
  assert.strictEqual(out2.moves.length, 0);
});

test('points are gone from the reply', () => {
  const out = dm.sanitizeReply({ effects: [{ player: 0, pointsChange: 50 }] }, req());
  assert.ok(!('pointsChange' in out.effects[0]));
});

test('talk mode never moves, damages, or gives items', () => {
  const out = dm.sanitizeReply({ effects: [{ player: 0, hpChange: -2, addItem: 'Gift' }], moves: [{ who: 'p0', x: 1, y: 1 }], enemyUpdates: [{ id: 'b1', hit: true, defeated: true }] }, req({ mode: 'talk' }));
  assert.deepStrictEqual(out.effects[0], { player: 0, hpChange: 0, addItem: null, removeItem: null });
  assert.deepStrictEqual([out.moves, out.enemyUpdates], [[], []]);
});

test('fallback: damage rule (6-9 = 1, 1-5 = 2), favorite twist, search finds', () => {
  const ben = (roll, text = 'attack') => dm.fallbackReply(req({ actor: 1, roll, text }));
  assert.strictEqual(ben(7).effects[0].hpChange, -1);
  assert.strictEqual(ben(3).effects[0].hpChange, -2);
  assert.ok(ben(3).narration.includes('Classic Ben'), 'joke gets roasted');
  const fav = dm.fallbackReply(req({ actor: 0, roll: 5 }));
  assert.ok(fav.enemyUpdates[0].hit, 'favorite bad roll still lands');
  const search = ben(15, 'I search behind the rock');
  assert.strictEqual(search.searched, 'rock');
  assert.ok(search.effects[0].addItem);
});

test('enemy turn: damage comes from the enemy roll, 1 = hurts itself, blocked = -1', () => {
  const s = state(); s.enemies.push({ id: 'b2', name: 'Moon Bug B', pos: { x: 1, y: 0 } }, { id: 'b3', name: 'Moon Bug C', pos: { x: 5, y: 0 } });
  const r = dm.sanitizeRequest({ mode: 'enemy', state: s, enemyRolls: [{ id: 'b1', roll: 18 }, { id: 'w', roll: 12 }, { id: 'b2', roll: 1 }, { id: 'b3', roll: 5 }, { id: 'ghost', roll: 20 }] });
  assert.strictEqual(r.enemyRolls.length, 4, 'unknown enemy dropped');
  const out = dm.sanitizeReply({ effects: [{ player: 0, hpChange: -2 }], enemyActions: [{ id: 'b1', target: 'p2' }, { id: 'w', target: 'p1', blocked: true }] }, r);
  assert.deepStrictEqual(out.effects.map((e) => [e.player, e.hpChange]), [[2, -2]], 'AI hp effects ignored; blocked 1-damage hit becomes 0; miss does nothing');
  assert.deepStrictEqual(out.enemyUpdates, [{ id: 'b2', hit: true, defeated: true }]);
  const boss = dm.sanitizeReply({}, dm.sanitizeRequest({ mode: 'enemy', state: state(), enemyRolls: [{ id: 'w', roll: 1 }] }));
  assert.deepStrictEqual(boss.enemyUpdates, [{ id: 'w', hit: true, defeated: false }], 'boss survives a self-bonk');
  const noTarget = dm.sanitizeReply({}, dm.sanitizeRequest({ mode: 'enemy', state: state(), enemyRolls: [{ id: 'b1', roll: 15 }] }));
  assert.strictEqual(noTarget.effects[0].hpChange, -1, 'picks nearest player when the AI gives no target');
  assert.throws(() => dm.sanitizeRequest({ mode: 'enemy', state: state(), enemyRolls: [] }), /enemyRolls/);
});

test('statuses and mood are cleaned up', () => {
  const out = dm.sanitizeReply({ moodChange: -7, statusChanges: [{ who: 'b1', add: ['Weakened', 'Scared', 'Dizzy', 'Extra'] }, { who: 'nobody', add: ['x'] }] }, req());
  assert.strictEqual(out.moodChange, -1);
  assert.deepStrictEqual(out.statusChanges, [{ who: 'b1', add: ['weakened', 'scared', 'dizzy'], remove: [] }]);
  assert.strictEqual(dm.sanitizeReply({ moodChange: 1 }, req({ mode: 'talk' })).moodChange, 1, 'talking can change mood');
});

test('actions not aimed at an enemy leave enemies alone', () => {
  const reply = { enemyUpdates: [{ id: 'b1', hit: true, defeated: true }], statusChanges: [{ who: 'b1', add: ['weakened'] }, { who: 'p0', add: ['embarrassed'] }] };
  const insult = dm.sanitizeReply(reply, req({ roll: 17, text: 'Fuck you Magic the Tanner.' }));
  assert.deepStrictEqual(insult.enemyUpdates, []);
  assert.deepStrictEqual(insult.statusChanges.map((c) => c.who), ['p0'], 'player status still allowed');
  const attack = dm.sanitizeReply(reply, req({ roll: 17, text: 'I zap Moon Bug A with my laser' }));
  assert.strictEqual(attack.enemyUpdates.length, 1);
  assert.deepStrictEqual(attack.statusChanges.map((c) => c.who), ['b1', 'p0']);
  assert.ok(dm.aimsAtEnemy('I show them my aura', []));
  assert.ok(!dm.aimsAtEnemy('I search the crate', []));
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

test('offline DM searching also walks the player over', async () => {
  await withServer({ apiKey: '' }, async (base) => {
    const out = await (await post(base, { mode: 'action', actor: 0, roll: 15, text: 'I search the Big Rock', state: state() })).json();
    assert.strictEqual(out.searched, 'rock');
    const mv = out.moves.find((m) => m.who === 'p0');
    assert.ok(mv && Math.max(Math.abs(mv.x - 3), Math.abs(mv.y - 3)) <= 1);
    assert.strictEqual(out.offline, true);
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
