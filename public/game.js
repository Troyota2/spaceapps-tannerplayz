// game.js - game state and UI. The browser keeps the state; the server only narrates.
'use strict';

const $ = (id) => document.getElementById(id);

const state = {
  players: [],      // { name, cls, perk, hp, maxHp, inventory[], ko, pos{x,y}, introduced }
  turn: 0,          // whose turn to roll
  poiIndex: 0,      // where the crew is
  cleared: [],      // POI ids finished
  scenes: {},       // per-POI: { enemies[], props[], progress }
  gags: [],         // running jokes, sent with every DM prompt
  log: [],          // story lines (last 6 are sent for context)
  favorite: 0,      // secret
  joke: 1,          // secret
  selectedItem: null,
  awaitContinue: false, // after a roll, wait for "Continue" so everyone can read what happened
  enemyPhaseDone: false, // enemies already acted this round
  mood: 0,          // DM mood, -3 (furious) to +3 (delighted)
  busy: false,
  won: false,
};

// ---------- sound effects: synthesized with the Web Audio API (no audio files) ----------
const sfx = (() => {
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem('moonMuted') === '1'; } catch { /* storage blocked: fine */ }
  function tone(freq, dur, { type = 'sine', vol = 0.12, at = 0, to = null } = {}) {
    const t0 = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  const sounds = {
    tick: () => tone(700 + Math.random() * 500, 0.03, { type: 'square', vol: 0.03 }),
    land: () => tone(440, 0.12, { type: 'triangle' }),
    crit: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'triangle', at: i * 0.09 })),
    fumble: () => tone(300, 0.6, { type: 'sawtooth', vol: 0.08, to: 70 }),
    hit: () => tone(180, 0.15, { type: 'square', vol: 0.08, to: 60 }),
    hurt: () => tone(220, 0.25, { type: 'sawtooth', vol: 0.06, to: 110 }),
    heal: () => [600, 900].forEach((f, i) => tone(f, 0.15, { at: i * 0.08 })),
    item: () => [880, 1320].forEach((f, i) => tone(f, 0.18, { type: 'triangle', at: i * 0.1 })),
    defeat: () => tone(600, 0.3, { type: 'square', vol: 0.06, to: 120 }),
    clear: () => [523, 784, 1047].forEach((f, i) => tone(f, 0.25, { type: 'triangle', at: i * 0.12 })),
    win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.3, { type: 'triangle', at: i * 0.15 })),
    turn: () => tone(660, 0.1, { type: 'sine', vol: 0.06 }),
    talk: () => [500, 650].forEach((f, i) => tone(f, 0.07, { type: 'sine', vol: 0.05, at: i * 0.07 })),
  };
  return {
    play(name) {
      if (muted || !sounds[name]) return;
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        sounds[name]();
      } catch { /* audio not available: stay silent */ }
    },
    toggle() { muted = !muted; try { localStorage.setItem('moonMuted', muted ? '1' : '0'); } catch { /* ignore */ } },
    get muted() { return muted; },
  };
})();

const MOODS = ['😡 furious', '😠 annoyed', '😒 grumpy', '😐 neutral', '🙂 pleased', '😄 happy', '🤩 delighted'];
const moodFace = () => MOODS[state.mood + 3];

const currentPoi = () => POIS[state.poiIndex];
const scene = () => state.scenes[currentPoi().id];
const unlockedUpTo = () => Math.min(POIS.length - 1, state.cleared.length);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- setup ----------
function setupScreen() {
  document.querySelectorAll('.dmName').forEach((el) => { el.textContent = DM_NAME; });
  document.querySelectorAll('.dmSprite').forEach((el) => { el.textContent = DM_SPRITE; });
  const names = Object.keys(CLASSES);
  [0, 1, 2].forEach((i) => {
    const sel = $('cls' + i);
    names.forEach((n) => {
      const o = document.createElement('option');
      o.value = n;
      o.textContent = `${CLASSES[n].emoji} ${n} (${CLASSES[n].hp} HP)`;
      sel.append(o);
    });
    sel.value = names[i];
  });
  $('classInfo').textContent = names.map((n) => `${CLASSES[n].emoji} ${n}: ${CLASSES[n].perk}`).join('  ·  ');
}

function startGame() {
  state.players = [0, 1, 2].map((i) => {
    const cls = $('cls' + i).value;
    const c = CLASSES[cls];
    return {
      name: $('name' + i).value.trim().slice(0, 20) || `Astronaut ${i + 1}`,
      cls, perk: c.perk, hp: c.hp, maxHp: c.hp,
      inventory: [...c.items], statuses: [], ko: false, pos: { x: 0, y: i }, introduced: false,
    };
  });
  // Secretly pick the DM's favorite and the lovable joke (always two different people).
  state.favorite = Math.floor(Math.random() * 3);
  state.joke = (state.favorite + 1 + Math.floor(Math.random() * 2)) % 3;
  $('setup').classList.add('hidden');
  enterPoi(0);
  maybeTutorial();
}

function enterPoi(i) {
  const poi = POIS[i];
  state.poiIndex = i;
  state.enemyPhaseDone = false;
  if (!state.scenes[poi.id]) {
    state.scenes[poi.id] = {
      enemies: poi.enemies.map((e) => ({ id: e.id, name: e.name, sprite: e.sprite, boss: !!e.boss, hits: 0, turnsFought: 0, defeated: false, statuses: [], pos: { x: e.x, y: e.y } })),
      props: poi.props.map((p) => ({ id: p.id, name: p.name, sprite: p.sprite, searched: false, pos: { x: p.x, y: p.y } })),
      progress: 0,
    };
  }
  scatterPlayers();
  const done = state.cleared.includes(poi.id);
  addLog('sys', `📍 Arrived at ${poi.name}`);
  addLog('dm', done ? `${poi.name} is safe now. Chat with the crew or move on.` : poi.intro);
  setView('scene');
  render();
}

// Drop the crew on random free squares in the left half of the scene.
function scatterPlayers() {
  const s = scene();
  const taken = new Set([...s.props, ...s.enemies.filter((e) => !e.defeated)].map((o) => `${o.pos.x},${o.pos.y}`));
  const free = [];
  for (let x = 0; x < 3; x++) for (let y = 0; y < GRID.h; y++) if (!taken.has(`${x},${y}`)) free.push({ x, y });
  state.players.forEach((p) => {
    const k = Math.floor(Math.random() * free.length);
    p.pos = free.splice(k, 1)[0];
  });
}

// ---------- talking to the server ----------
async function askDM(body) {
  const s = scene();
  const payload = {
    ...body,
    state: {
      players: state.players.map(({ introduced, ...p }) => p),
      enemies: s.enemies,
      props: s.props,
      poi: { name: currentPoi().name, challenge: currentPoi().challenge, fact: currentPoi().fact, npc: currentPoi().base?.npc || '' },
      favorite: state.favorite,
      joke: state.joke,
      mood: state.mood,
      gags: state.gags,
      log: state.log.filter((l) => l.kind !== 'thinking').slice(-6).map((l) => l.text),
    },
  };
  const res = await fetch('/api/dm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error('DM unavailable');
  return res.json();
}

function d20() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] % 20) + 1;
}

async function animateDice(final) {
  const el = $('dice');
  el.className = 'dice';
  for (let i = 0; i < 12; i++) { el.textContent = d20(); sfx.play('tick'); await sleep(55); }
  el.textContent = final;
  if (final === 20) el.classList.add('crit');
  if (final === 1) el.classList.add('fumble');
}

async function doRoll() {
  const text = $('actionText').value.trim();
  if (!text || state.busy || state.won || state.awaitContinue) return;
  const actor = state.turn;
  const roll = d20();
  setBusy(true);
  addLog('player', `${state.players[actor].name}: "${text}"${state.selectedItem ? ` (using ${state.selectedItem})` : ''}`);
  await animateDice(roll);
  sfx.play(roll === 20 ? 'crit' : roll === 1 ? 'fumble' : 'land');
  addLog('sys', `🎲 ${state.players[actor].name} rolled a ${roll}`);
  showThinking();
  const reply = await askDM({ mode: 'action', actor, roll, text, itemUsed: state.selectedItem }).catch(() => null);
  hideThinking();
  $('actionText').value = '';
  state.selectedItem = null;
  if (reply) {
    if (reply.rollingFor) addLog('sys', `↳ Rolling for: ${reply.rollingFor}`);
    applyReply(reply);
    scene().enemies.filter((e) => !e.defeated).forEach((e) => { e.turnsFought++; });
  } else {
    addLog('sys', 'Radio static... the DM missed that. Try again!');
  }
  state.awaitContinue = true;
  setBusy(false);
  render();
}

// Next player presses Continue: then the turn passes and any popups appear.
async function doContinue() {
  if (!state.awaitContinue || state.busy) return;
  state.awaitContinue = false;
  checkPoi();
  const alive = scene().enemies.filter((e) => !e.defeated);
  const roundOver = nextIndex() <= state.turn; // wrapping back to the first player
  if (roundOver && !state.enemyPhaseDone && alive.length && !state.cleared.includes(currentPoi().id)) {
    state.enemyPhaseDone = true;
    await enemyTurn(alive);
    return;
  }
  state.enemyPhaseDone = false;
  sfx.play('turn');
  nextTurn();
  render();
  maybeTutorial();
}

// After every full round, each living enemy rolls its own d20 and attacks.
async function enemyTurn(alive) {
  setBusy(true);
  $('turnBanner').textContent = '🐛 ENEMIES\' TURN!';
  $('turnBanner').classList.add('enemy');
  addLog('sys', '🐛 The enemies make their move...');
  const enemyRolls = [];
  for (const en of alive) {
    const roll = d20();
    await animateDice(roll);
    addLog('sys', `🎲 ${en.name} rolled a ${roll}`);
    enemyRolls.push({ id: en.id, roll });
  }
  showThinking();
  const reply = await askDM({ mode: 'enemy', actor: state.turn, enemyRolls }).catch(() => null);
  hideThinking();
  $('turnBanner').classList.remove('enemy');
  if (reply) applyReply(reply);
  else addLog('sys', 'The bugs got distracted by a shiny rock. Lucky!');
  checkPoi();
  state.awaitContinue = true;
  setBusy(false);
  render();
}

async function doTalk() {
  const text = $('talkText').value.trim();
  if (!text || state.busy) return;
  const talkTo = $('talkTo').value;
  const actor = state.turn;
  setBusy(true);
  addLog('player', `${state.players[actor].name} → ${talkTo === 'dm' ? DM_NAME : talkTo}: "${text}"`);
  showThinking(talkTo === 'dm' ? DM_NAME : talkTo);
  const reply = await askDM({ mode: 'talk', actor, text, talkTo }).catch(() => null);
  hideThinking();
  $('talkText').value = '';
  if (reply) { sfx.play('talk'); applyReply(reply, talkTo === 'dm' ? null : talkTo); }
  else addLog('sys', 'Radio static... try again!');
  setBusy(false);
  render();
}

// ---------- applying the DM's decision ----------
function applyReply(r, speaker) {
  const s = scene();
  addLog('dm', r.narration, speaker);
  for (const e of r.effects || []) {
    const p = state.players[e.player];
    if (!p) continue;
    const fx = [];
    if (e.hpChange) { p.hp = Math.max(0, Math.min(p.maxHp, p.hp + e.hpChange)); fx.push(`${e.hpChange > 0 ? '+' : ''}${e.hpChange} HP`); sfx.play(e.hpChange < 0 ? 'hurt' : 'heal'); }
    if (e.removeItem) {
      const k = p.inventory.findIndex((x) => x.toLowerCase() === e.removeItem.toLowerCase());
      if (k >= 0) { p.inventory.splice(k, 1); fx.push(`used up ${e.removeItem}`); }
    }
    if (e.addItem && p.inventory.length < 8) { p.inventory.push(e.addItem); fx.push(`found ${e.addItem}!`); sfx.play('item'); }
    if (fx.length) addLog('fx', `${p.name}: ${fx.join(', ')}${e.from ? ` (from ${e.from})` : ''}`);
    if (p.hp === 0 && !p.ko) { p.ko = true; addLog('sys', `💫 ${p.name} is knocked out! The simulation reboots them at the next location.`); }
    if (p.hp > 0) p.ko = false;
  }
  for (const u of r.enemyUpdates || []) {
    const en = s.enemies.find((x) => x.id === u.id);
    if (!en) continue;
    if (u.hit) { en.hits++; sfx.play('hit'); }
    if (u.defeated) { en.defeated = true; addLog('sys', `✖ ${en.name} is defeated!`); sfx.play('defeat'); }
  }
  for (const m of r.moves || []) {
    const who = m.who.startsWith('p') ? state.players[Number(m.who.slice(1))] : s.enemies.find((x) => x.id === m.who);
    if (who) who.pos = { x: m.x, y: m.y };
  }
  for (const c of r.statusChanges || []) {
    const who = c.who.startsWith('p') ? state.players[Number(c.who.slice(1))] : s.enemies.find((x) => x.id === c.who);
    if (!who) continue;
    who.statuses = who.statuses.filter((x) => !c.remove.includes(x));
    for (const a of c.add) if (!who.statuses.includes(a)) who.statuses.push(a);
    who.statuses = who.statuses.slice(-3);
    const name = who.name;
    if (c.add.length) addLog('fx', `${name} is now ${c.add.join(', ')}`);
    if (c.remove.length) addLog('fx', `${name} is no longer ${c.remove.join(', ')}`);
  }
  if (r.moodChange) {
    state.mood = Math.max(-3, Math.min(3, state.mood + r.moodChange));
    addLog('fx', `${DM_SPRITE} ${DM_NAME}'s mood ${r.moodChange > 0 ? 'went up' : 'went down'}: ${moodFace()}`);
    sfx.play(r.moodChange > 0 ? 'heal' : 'hurt');
  }
  if (r.searched) { const pr = s.props.find((x) => x.id === r.searched); if (pr) pr.searched = true; }
  if (r.progress) s.progress += r.progress;
  if (r.newGag) { state.gags.push(r.newGag); state.gags = state.gags.slice(-8); }

  // Nearly impossible to lose: if everyone is down, rewind the simulation.
  if (state.players.every((p) => p.ko)) {
    state.players.forEach((p) => { p.hp = p.maxHp; p.ko = false; });
    addLog('sys', `⏪ SIMULATION REWIND! ${DM_NAME}: "I did not see that. Nobody saw that. Again!"`);
  }
}

function nextIndex() {
  for (let i = 1; i <= 3; i++) {
    const t = (state.turn + i) % 3;
    if (!state.players[t].ko) return t;
  }
  return state.turn;
}
function nextTurn() { state.turn = nextIndex(); }

function checkPoi() {
  const poi = currentPoi();
  const s = scene();
  if (state.cleared.includes(poi.id)) return;
  const done = poi.goal ? s.progress >= poi.goal : s.enemies.every((e) => e.defeated);
  if (!done) return;
  state.cleared.push(poi.id);
  state.players.forEach((p) => { if (p.ko) { p.ko = false; p.hp = Math.ceil(p.maxHp / 2); } });
  if (poi.boss) {
    state.won = true;
    const fav = state.players[state.favorite].name, joke = state.players[state.joke].name;
    sfx.play('win');
    queuePopup('🎓 Junior Astronauts Certified!', [
      'The Giant Moon Worm is defeated!',
      `Training fact: ${poi.fact}`,
      `Secret reveal: ${DM_NAME}'s favorite was ${fav} (that's why they kept getting lucky), and the lovable joke of the crew was ${joke}.`,
    ], poi.source);
  } else {
    sfx.play('clear');
    queuePopup(`✅ ${poi.name} complete!`, [`Real NASA fact: ${poi.fact}`, `Next stop: ${POIS[state.poiIndex + 1].name}. Press the yellow 🚀 Travel button under the scene to go there.`], poi.source);
  }
}

// ---------- popups and tutorials ----------
const popupQueue = [];
function queuePopup(title, lines, source) {
  popupQueue.push({ title, lines, source });
  if ($('popup').classList.contains('hidden')) nextPopup();
}
function nextPopup() {
  const p = popupQueue.shift();
  if (!p) { $('popup').classList.add('hidden'); return; }
  $('popupTitle').textContent = p.title;
  const body = $('popupBody');
  body.textContent = '';
  for (const line of p.lines) { const el = document.createElement('p'); el.textContent = line; body.append(el); }
  $('popupLink').textContent = p.source ? `Source: ${p.source.title}` : '';
  $('popupLink').href = p.source ? p.source.url : '#';
  $('popup').classList.remove('hidden');
}

function maybeTutorial() {
  const p = state.players[state.turn];
  if (!p || p.introduced || state.won) return;
  p.introduced = true;
  const c = CLASSES[p.cls];
  queuePopup(`🎯 ${p.name}'s first turn!`, [
    `You are a ${c.emoji} ${p.cls} with ${p.maxHp} ❤️. ${p.perk}`,
    'Your items:',
    ...p.inventory.map((it) => `• ${it}: ${ITEM_INFO[it] || 'Who knows? Try it.'}`),
    'To use an item, click it on your card, then describe what you do and roll.',
    'Ideas: attack a bug, search a rock or crate (it might have loot), help a teammate, or try something silly. Click things in the Scene to fill in an action.',
    'Want to chat instead? Use the 💬 Talk tab. It does not use your turn.',
  ]);
}

// ---------- rendering ----------
function addLog(kind, text, speaker) {
  state.log.push({ kind, text, speaker });
  if (state.log.length > 100) state.log.shift();
  renderLog();
}

function showThinking(who = DM_NAME) {
  addLog('thinking', `⏳ ${who} is thinking`);
  $('turnBanner').textContent = `⏳ ${who} is thinking...`;
  $('turnBanner').classList.add('thinking');
}
function hideThinking() {
  state.log = state.log.filter((l) => l.kind !== 'thinking');
  $('turnBanner').classList.remove('thinking');
  renderLog();
}

function renderLog() {
  const box = $('log');
  box.textContent = '';
  for (const l of state.log) {
    const p = document.createElement('p');
    p.className = l.kind;
    if (l.kind === 'dm') {
      const b = document.createElement('b');
      b.textContent = `${l.speaker || DM_SPRITE + ' ' + DM_NAME}: `;
      p.append(b, document.createTextNode(l.text));
    } else {
      p.textContent = l.text;
      if (l.kind === 'thinking') p.classList.add('dots');
    }
    box.append(p);
  }
  box.scrollTop = box.scrollHeight;
}

function svg(tag, attrs, text) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text) el.textContent = text;
  return el;
}

// Simple route map: 5 stops top to bottom.
function renderMap() {
  const m = $('map');
  m.textContent = '';
  const y = (i) => 35 + i * 65;
  m.append(svg('line', { x1: 40, y1: y(0), x2: 40, y2: y(POIS.length - 1), stroke: '#2a2d38', 'stroke-width': 3, 'stroke-dasharray': '6 6' }));
  POIS.forEach((p, i) => {
    const locked = i > unlockedUpTo();
    const done = state.cleared.includes(p.id);
    const here = i === state.poiIndex;
    const g = svg('g', { class: 'poi', opacity: locked ? 0.35 : 1 });
    g.append(svg('rect', { x: 15, y: y(i) - 25, width: 470, height: 52, fill: 'transparent' })); // whole row is clickable
    g.append(svg('circle', { cx: 40, cy: y(i), r: here ? 15 : 11, fill: done ? '#7bd88f' : '#07080c', stroke: here ? '#ffd166' : '#e8e8ea', 'stroke-width': 2 }));
    g.append(svg('text', { x: 70, y: y(i) }, `${i + 1}. ${p.name}${p.base ? ' 🏠' : ''}${p.boss ? ' 🪱' : ''}`));
    const status = here ? 'You are here 🧑‍🚀🧑‍🚀🧑‍🚀' : done ? 'Cleared ✓' : locked ? 'Locked 🔒' : 'Unlocked: click to travel';
    g.append(svg('text', { x: 70, y: y(i) + 18, class: 'sub' }, status));
    if (!locked) g.addEventListener('click', () => { if (!state.busy && i !== state.poiIndex) enterPoi(i); });
    m.append(g);
  });
}

// Scene grid: players, bugs, and search spots.
function renderScene() {
  const s = scene();
  const box = $('scene');
  box.textContent = '';
  const at = new Map();
  s.props.forEach((p) => at.set(`${p.pos.x},${p.pos.y}`, { kind: 'prop', ref: p }));
  s.enemies.filter((e) => !e.defeated).forEach((e) => at.set(`${e.pos.x},${e.pos.y}`, { kind: 'enemy', ref: e }));
  state.players.forEach((p, i) => at.set(`${p.pos.x},${p.pos.y}`, { kind: 'player', ref: p, i }));
  for (let y = 0; y < GRID.h; y++) {
    for (let x = 0; x < GRID.w; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const o = at.get(`${x},${y}`);
      if (o) {
        const icon = document.createElement('span');
        const label = document.createElement('small');
        if (o.kind === 'player') {
          cell.classList.add('player');
          if (o.i === state.turn) cell.classList.add('active');
          if (o.ref.ko) cell.classList.add('ko');
          icon.textContent = o.ref.ko ? '💫' : CLASSES[o.ref.cls].emoji;
          label.textContent = o.ref.statuses.length ? `${o.ref.name} (${o.ref.statuses[0]})` : o.ref.name;
          cell.title = `${o.ref.name} (${o.ref.cls})${o.ref.statuses.length ? `: ${o.ref.statuses.join(', ')}` : ''}`;
        } else if (o.kind === 'enemy') {
          cell.classList.add('enemy');
          if (o.ref.boss) cell.classList.add('boss');
          icon.textContent = o.ref.sprite;
          label.textContent = o.ref.name;
          if (o.ref.hits) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = '💥'.repeat(Math.min(o.ref.hits, 4)); cell.append(t); }
          cell.title = `${o.ref.name}: hit ${o.ref.hits} time(s)${o.ref.statuses.length ? `, ${o.ref.statuses.join(', ')}` : ''}. Click to attack.`;
          if (o.ref.statuses.length) label.textContent = `${o.ref.name} (${o.ref.statuses[0]})`;
          cell.addEventListener('click', () => suggest(`I attack ${o.ref.name}`));
        } else {
          cell.classList.add('prop');
          if (o.ref.searched) cell.classList.add('searched');
          icon.textContent = o.ref.sprite;
          label.textContent = o.ref.searched ? `${o.ref.name} (searched)` : o.ref.name;
          cell.title = o.ref.searched ? 'Already searched' : `Click to search the ${o.ref.name}`;
          if (!o.ref.searched) cell.addEventListener('click', () => suggest(`I search the ${o.ref.name}`));
        }
        cell.prepend(icon);
        cell.append(label);
      }
      box.append(cell);
    }
  }
}

function suggest(text) {
  if (state.busy || state.awaitContinue) return;
  $('tabRoll').click();
  $('actionText').value = text;
  $('actionText').focus();
}

function renderPoi() {
  const poi = currentPoi();
  const s = scene();
  const c = $('poiCard');
  c.textContent = '';
  const h = document.createElement('h3');
  h.textContent = `${poi.name}${poi.base ? ' · ' + poi.base.name : ''}`;
  const ch = document.createElement('p');
  const done = state.cleared.includes(poi.id);
  ch.textContent = done ? '✅ Area cleared!' : `Challenge: ${poi.challenge}`;
  c.append(h, ch);
  const next = POIS[state.poiIndex + 1];
  if (done && next && !state.won) {
    const b = document.createElement('button');
    b.className = 'big continue';
    b.textContent = `🚀 Travel to ${next.name}`;
    b.disabled = state.busy || state.awaitContinue;
    b.title = state.awaitContinue ? 'Press Continue first' : '';
    b.addEventListener('click', () => { if (!state.busy && !state.awaitContinue) { sfx.play('clear'); enterPoi(state.poiIndex + 1); } });
    c.append(b);
  }
  if (!done && poi.goal) {
    const pr = document.createElement('p');
    pr.textContent = `Progress: ${'■'.repeat(Math.min(s.progress, poi.goal))}${'□'.repeat(Math.max(0, poi.goal - s.progress))}`;
    c.append(pr);
  }
  if (s.enemies.length) {
    const ul = document.createElement('ul');
    ul.className = 'tiny';
    s.enemies.forEach((e) => {
      const li = document.createElement('li');
      li.textContent = e.defeated ? `✖ ${e.name}: defeated` : `${e.sprite} ${e.name}: hit ${e.hits} time${e.hits === 1 ? '' : 's'}, fighting for ${e.turnsFought} turn${e.turnsFought === 1 ? '' : 's'}${e.statuses.length ? ` · ${e.statuses.join(', ')}` : ''}`;
      ul.append(li);
    });
    c.append(ul);
  }
  if (poi.base) {
    const npc = document.createElement('p');
    npc.className = 'tiny';
    npc.textContent = `${poi.base.npcSprite} ${poi.base.npc} is here. Use the 💬 Talk tab to chat!`;
    c.append(npc);
  }
}

function renderParty() {
  const box = $('party');
  box.textContent = '';
  const row = document.createElement('div');
  row.className = 'party-row';
  state.players.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'pc' + (i === state.turn ? ' active' : '') + (p.ko ? ' ko' : '');
    d.innerHTML = '<div class="name"></div><div class="cls"></div><div class="hearts"></div><div class="statuses"></div><div class="items"></div>';
    d.querySelector('.statuses').textContent = p.statuses.length ? `✨ ${p.statuses.join(', ')}` : '';
    d.querySelector('.name').textContent = `${i === state.turn ? '🎯 ' : ''}${p.name}`;
    d.querySelector('.cls').textContent = `${CLASSES[p.cls].emoji} ${p.cls}`;
    d.querySelector('.hearts').textContent = p.ko ? '💫 knocked out' : '❤️'.repeat(p.hp) + '🖤'.repeat(p.maxHp - p.hp);
    const items = d.querySelector('.items');
    p.inventory.forEach((it) => {
      const b = document.createElement('button');
      b.textContent = it;
      if (i === state.turn && state.selectedItem === it) b.classList.add('sel');
      b.disabled = i !== state.turn;
      b.title = `${ITEM_INFO[it] || 'A mysterious find.'}${i === state.turn ? ' Click to use it with your next roll.' : ''}`;
      b.addEventListener('click', () => { state.selectedItem = state.selectedItem === it ? null : it; render(); });
      items.append(b);
    });
    row.append(d);
  });
  box.append(row);
}

function renderControls() {
  const p = state.players[state.turn];
  if (!state.busy) {
    const next = state.players[nextIndex()];
    const enemiesNext = nextIndex() <= state.turn && !state.enemyPhaseDone && scene().enemies.some((e) => !e.defeated) && !state.cleared.includes(currentPoi().id);
    $('turnBanner').textContent = state.won ? '🎓 TRAINING COMPLETE!'
      : state.awaitContinue ? `📖 Read what happened, then press Continue`
      : state.cleared.includes(currentPoi().id) && POIS[state.poiIndex + 1] ? `✅ AREA CLEAR! Press 🚀 Travel when ready · ${p.name}'s turn`
      : `🎯 ${p.name.toUpperCase()}'S TURN · ${CLASSES[p.cls].emoji} ${p.cls}`;
    if (state.awaitContinue) $('continueBtn').textContent = enemiesNext ? 'Continue ▶ (🐛 enemies attack!)' : `Continue ▶ (${next.name}'s turn)`;
  }
  $('dmMood').textContent = `${DM_SPRITE} mood: ${moodFace()}`;
  $('rollBtn').classList.toggle('hidden', state.awaitContinue);
  $('actionText').classList.toggle('hidden', state.awaitContinue);
  $('continueBtn').classList.toggle('hidden', !state.awaitContinue);

  $('itemLabel').textContent = state.selectedItem || 'none';
  const sel = $('talkTo');
  const base = currentPoi().base;
  const want = ['dm', ...(base ? [base.npc] : [])];
  if (sel.dataset.key !== want.join('|')) {
    sel.textContent = '';
    want.forEach((w) => { const o = document.createElement('option'); o.value = w; o.textContent = w === 'dm' ? `${DM_SPRITE} ${DM_NAME} (the DM)` : `${base.npcSprite} ${w}`; sel.append(o); });
    sel.dataset.key = want.join('|');
  }
}

function render() { renderMap(); renderScene(); renderPoi(); renderParty(); renderControls(); }

function setBusy(b) {
  state.busy = b;
  ['rollBtn', 'talkBtn', 'actionText', 'talkText'].forEach((id) => { $(id).disabled = b; });
}

function setView(v) {
  $('sceneView').classList.toggle('hidden', v !== 'scene');
  $('mapView').classList.toggle('hidden', v !== 'map');
  $('viewScene').classList.toggle('active', v === 'scene');
  $('viewMap').classList.toggle('active', v === 'map');
}

// ---------- wiring ----------
setupScreen();
$('startBtn').addEventListener('click', startGame);
$('rollBtn').addEventListener('click', doRoll);
$('continueBtn').addEventListener('click', doContinue);
$('muteBtn').addEventListener('click', () => { sfx.toggle(); $('muteBtn').textContent = sfx.muted ? '🔇' : '🔊'; });
$('muteBtn').textContent = sfx.muted ? '🔇' : '🔊';
$('talkBtn').addEventListener('click', doTalk);
$('actionText').addEventListener('keydown', (e) => { if (e.key === 'Enter') doRoll(); });
$('talkText').addEventListener('keydown', (e) => { if (e.key === 'Enter') doTalk(); });
$('popupBtn').addEventListener('click', nextPopup);
$('viewScene').addEventListener('click', () => setView('scene'));
$('viewMap').addEventListener('click', () => setView('map'));
$('tabRoll').addEventListener('click', () => { $('rollPane').classList.remove('hidden'); $('talkPane').classList.add('hidden'); $('tabRoll').classList.add('active'); $('tabTalk').classList.remove('active'); });
$('tabTalk').addEventListener('click', () => { $('talkPane').classList.remove('hidden'); $('rollPane').classList.add('hidden'); $('tabTalk').classList.add('active'); $('tabRoll').classList.remove('active'); });
fetch('/api/health').then((r) => r.json()).then((h) => { $('aiStatus').textContent = h.ai ? 'AI DM online' : 'DM offline mode'; }).catch(() => {});
