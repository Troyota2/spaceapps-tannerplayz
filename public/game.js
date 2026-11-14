// game.js - game state and UI. The browser keeps the state; the server only narrates.
'use strict';

const $ = (id) => document.getElementById(id);

const state = {
  players: [],      // { name, hp, maxHp, points, inventory[], ko }
  turn: 0,          // whose turn to roll
  poiIndex: 0,      // where the crew is
  cleared: [],      // POI ids finished
  enemy: null,      // { name, hp, maxHp, sprite }
  progress: 0,      // for non-combat challenges
  gags: [],         // running jokes, sent with every DM prompt
  log: [],          // recent story lines, sent for context
  favorite: 0,      // secret
  joke: 1,          // secret
  selectedItem: null,
  busy: false,
  won: false,
};

// ---------- setup ----------
function startGame() {
  state.players = [0, 1, 2].map((i) => ({
    name: $('name' + i).value.trim().slice(0, 20) || `Astronaut ${i + 1}`,
    hp: 10, maxHp: 10, points: 0, inventory: [...STARTING_ITEMS[i]], ko: false,
  }));
  // Secretly pick the DM's favorite and the lovable joke (always two different people).
  state.favorite = Math.floor(Math.random() * 3);
  state.joke = (state.favorite + 1 + Math.floor(Math.random() * 2)) % 3;
  $('setup').classList.add('hidden');
  enterPoi(0);
}

function enterPoi(i) {
  const poi = POIS[i];
  state.poiIndex = i;
  const done = state.cleared.includes(poi.id);
  state.enemy = !done && poi.enemy ? { ...poi.enemy, maxHp: poi.enemy.hp } : null;
  state.progress = 0;
  addLog('sys', `📍 Arrived at ${poi.name}`);
  addLog('dm', done ? `${poi.name} is safe now. Chat with the crew or move on.` : poi.intro);
  render();
}

// ---------- talking to the server ----------
async function askDM(body) {
  const payload = {
    ...body,
    state: {
      players: state.players,
      poi: { name: currentPoi().name, challenge: currentPoi().challenge, fact: currentPoi().fact, npc: currentPoi().base?.npc || '' },
      enemy: state.enemy,
      favorite: state.favorite,
      joke: state.joke,
      gags: state.gags,
      log: state.log.slice(-6).map((l) => l.text),
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
  for (let i = 0; i < 10; i++) { el.textContent = d20(); await sleep(50); }
  el.textContent = final;
  if (final === 20) el.classList.add('crit');
  if (final === 1) el.classList.add('fumble');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function doRoll() {
  const text = $('actionText').value.trim();
  if (!text || state.busy || state.won) return;
  const actor = state.turn;
  const roll = d20();
  setBusy(true);
  addLog('player', `${state.players[actor].name}: "${text}"${state.selectedItem ? ` (using ${state.selectedItem})` : ''}`);
  const [reply] = await Promise.all([
    askDM({ mode: 'action', actor, roll, text, itemUsed: state.selectedItem }).catch(() => null),
    animateDice(roll),
  ]);
  $('actionText').value = '';
  state.selectedItem = null;
  if (reply) {
    addLog('sys', `🎲 ${reply.rollingFor ? reply.rollingFor + ': ' : ''}rolled ${roll}`);
    applyReply(reply);
  } else {
    addLog('sys', 'Radio static... the DM missed that. Try again!');
  }
  nextTurn();
  checkPoi();
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
  const reply = await askDM({ mode: 'talk', actor, text, talkTo }).catch(() => null);
  $('talkText').value = '';
  if (reply) applyReply(reply, talkTo === 'dm' ? null : talkTo);
  else addLog('sys', 'Radio static... try again!');
  setBusy(false);
  render();
}

// ---------- applying the DM's decision ----------
function applyReply(r, speaker) {
  addLog('dm', r.narration, speaker);
  for (const e of r.effects || []) {
    const p = state.players[e.player];
    if (!p) continue;
    const fx = [];
    if (e.hpChange) { p.hp = Math.max(0, Math.min(p.maxHp, p.hp + e.hpChange)); fx.push(`${e.hpChange > 0 ? '+' : ''}${e.hpChange} HP`); }
    if (e.pointsChange) { p.points += e.pointsChange; fx.push(`${e.pointsChange > 0 ? '+' : ''}${e.pointsChange} points`); }
    if (e.removeItem) {
      const k = p.inventory.findIndex((x) => x.toLowerCase() === e.removeItem.toLowerCase());
      if (k >= 0) { p.inventory.splice(k, 1); fx.push(`lost ${e.removeItem}`); }
    }
    if (e.addItem && p.inventory.length < 8) { p.inventory.push(e.addItem); fx.push(`got ${e.addItem}`); }
    if (fx.length) addLog('fx', `${p.name}: ${fx.join(', ')}`);
    if (p.hp === 0 && !p.ko) { p.ko = true; addLog('sys', `💫 ${p.name} is knocked out! The simulation will reboot them at the next location.`); }
    if (p.hp > 0) p.ko = false;
  }
  if (state.enemy && r.enemyDamage) {
    state.enemy.hp = Math.max(0, state.enemy.hp - r.enemyDamage);
    addLog('fx', `${state.enemy.name}: -${r.enemyDamage} HP`);
  }
  if (r.progress) state.progress += r.progress;
  if (r.newGag) { state.gags.push(r.newGag); state.gags = state.gags.slice(-8); }

  // Nearly impossible to lose: if everyone is down, rewind the simulation.
  if (state.players.every((p) => p.ko)) {
    state.players.forEach((p) => { p.hp = p.maxHp; p.ko = false; });
    addLog('sys', `⏪ SIMULATION REWIND! ${DM_NAME}: "I did not see that. Nobody saw that. Again!"`);
  }
}

function nextTurn() {
  for (let i = 1; i <= 3; i++) {
    const t = (state.turn + i) % 3;
    if (!state.players[t].ko) { state.turn = t; return; }
  }
}

function checkPoi() {
  const poi = currentPoi();
  if (state.cleared.includes(poi.id)) return;
  const done = poi.enemy ? state.enemy && state.enemy.hp <= 0 : state.progress >= poi.goal;
  if (!done) return;
  state.cleared.push(poi.id);
  state.enemy = null;
  // Reboot knocked-out astronauts.
  state.players.forEach((p) => { if (p.ko) { p.ko = false; p.hp = Math.ceil(p.maxHp / 2); } });
  if (poi.boss) {
    state.won = true;
    const fav = state.players[state.favorite].name, joke = state.players[state.joke].name;
    showPopup('🎓 Junior Astronauts Certified!',
      `The Giant Moon Worm is defeated! Training fact: ${poi.fact}\n\nSecret reveal: ${DM_NAME}'s favorite was ${fav}, and the lovable joke of the crew was ${joke}.`, poi.source);
  } else {
    showPopup(`✅ ${poi.name} complete!`, `Training log, real NASA fact: ${poi.fact}`, poi.source);
  }
}

// ---------- rendering ----------
const currentPoi = () => POIS[state.poiIndex];
const unlockedUpTo = () => Math.min(POIS.length - 1, state.cleared.length);

function addLog(kind, text, speaker) {
  state.log.push({ kind, text, speaker });
  if (state.log.length > 80) state.log.shift();
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
    } else p.textContent = l.text;
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

function renderMap() {
  const m = $('map');
  m.textContent = '';
  m.append(svg('circle', { cx: 250, cy: 250, r: 230, fill: 'none', stroke: '#2a2d38' }));
  m.append(svg('text', { x: 250, y: 292, fill: '#8a8d99', 'text-anchor': 'middle' }, '✛ south pole (on Shackleton\'s rim)'));
  for (let i = 0; i < POIS.length - 1; i++) {
    const a = POIS[i], b = POIS[i + 1];
    m.append(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#2a2d38', 'stroke-dasharray': '4 4' }));
  }
  POIS.forEach((p, i) => {
    const locked = i > unlockedUpTo();
    const done = state.cleared.includes(p.id);
    const here = i === state.poiIndex;
    const g = svg('g', { class: 'poi', opacity: locked ? 0.3 : 1 });
    g.append(svg('circle', { cx: p.x, cy: p.y, r: here ? 14 : 10, fill: done ? '#7bd88f' : '#07080c', stroke: here ? '#ffd166' : '#e8e8ea', 'stroke-width': 2 }));
    const right = p.x > 300; // flip labels on the right half so they don't clip
    g.append(svg('text', { x: right ? p.x - 18 : p.x + 18, y: p.y + 4, 'text-anchor': right ? 'end' : 'start' }, `${i + 1}. ${p.name}${p.base ? ' 🏠' : ''}${locked ? ' 🔒' : ''}`));
    if (!locked) g.addEventListener('click', () => { if (!state.busy && i !== state.poiIndex) enterPoi(i); });
    m.append(g);
  });
}

function renderPoi() {
  const poi = currentPoi();
  const c = $('poiCard');
  c.textContent = '';
  const h = document.createElement('h3');
  h.textContent = `${poi.name}${poi.base ? ' · ' + poi.base.name : ''}`;
  const ch = document.createElement('p');
  const done = state.cleared.includes(poi.id);
  ch.textContent = done ? '✅ Cleared! Talk to the crew or click the next location on the map.' : `Challenge: ${poi.challenge}`;
  c.append(h, ch);
  if (state.enemy) {
    const e = document.createElement('div');
    e.innerHTML = '<div class="enemyName"></div><div class="bar enemy"><i></i></div>';
    e.querySelector('.enemyName').textContent = `${state.enemy.sprite} ${state.enemy.name} - ${state.enemy.hp}/${state.enemy.maxHp} HP`;
    e.querySelector('i').style.width = `${(100 * state.enemy.hp) / state.enemy.maxHp}%`;
    c.append(e);
  } else if (!done && poi.goal) {
    const pr = document.createElement('p');
    pr.textContent = `Progress: ${'■'.repeat(Math.min(state.progress, poi.goal))}${'□'.repeat(Math.max(0, poi.goal - state.progress))}`;
    c.append(pr);
  }
  if (poi.base) {
    const npc = document.createElement('p');
    npc.className = 'tiny';
    npc.textContent = `${poi.base.npcSprite} ${poi.base.npc} is here. Use the Talk tab to chat!`;
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
    d.innerHTML = '<div class="name"></div><div class="bar"><i></i></div><div class="stats"></div><div class="items"></div>';
    d.querySelector('.name').textContent = `🧑‍🚀 ${p.name}`;
    d.querySelector('i').style.width = `${(100 * p.hp) / p.maxHp}%`;
    d.querySelector('.stats').innerHTML = '<span class="hp"></span> · <span class="points"></span>';
    d.querySelector('.hp').textContent = p.ko ? 'KO 💫' : `${p.hp}/${p.maxHp} HP`;
    d.querySelector('.points').textContent = `${p.points} pts`;
    const items = d.querySelector('.items');
    p.inventory.forEach((it) => {
      const b = document.createElement('button');
      b.textContent = it;
      if (i === state.turn && state.selectedItem === it) b.classList.add('sel');
      b.disabled = i !== state.turn;
      b.title = i === state.turn ? 'Use with your next roll' : 'Not your turn';
      b.addEventListener('click', () => { state.selectedItem = state.selectedItem === it ? null : it; render(); });
      items.append(b);
    });
    row.append(d);
  });
  box.append(row);
}

function renderControls() {
  const p = state.players[state.turn];
  $('turnLabel').textContent = state.won ? '🎓 Training complete!' : `${p.name}'s turn`;
  $('itemLabel').textContent = state.selectedItem || 'none';
  const sel = $('talkTo');
  const want = ['dm', ...(currentPoi().base ? [currentPoi().base.npc] : [])];
  if (sel.dataset.key !== want.join('|')) {
    sel.textContent = '';
    want.forEach((w) => { const o = document.createElement('option'); o.value = w; o.textContent = w === 'dm' ? `${DM_SPRITE} ${DM_NAME} (the DM)` : `${currentPoi().base.npcSprite} ${w}`; sel.append(o); });
    sel.dataset.key = want.join('|');
  }
}

function render() { renderMap(); renderPoi(); renderParty(); renderControls(); }

function setBusy(b) {
  state.busy = b;
  ['rollBtn', 'talkBtn'].forEach((id) => { $(id).disabled = b; });
}

function showPopup(title, text, source) {
  $('popupTitle').textContent = title;
  $('popupText').textContent = text;
  $('popupText').style.whiteSpace = 'pre-line';
  $('popupLink').textContent = source ? `Source: ${source.title}` : '';
  $('popupLink').href = source ? source.url : '#';
  $('popup').classList.remove('hidden');
}

// ---------- wiring ----------
$('dmNameSetup').textContent = DM_NAME;
$('dmSpriteSetup').textContent = DM_SPRITE;
$('startBtn').addEventListener('click', startGame);
$('rollBtn').addEventListener('click', doRoll);
$('talkBtn').addEventListener('click', doTalk);
$('actionText').addEventListener('keydown', (e) => { if (e.key === 'Enter') doRoll(); });
$('talkText').addEventListener('keydown', (e) => { if (e.key === 'Enter') doTalk(); });
$('popupBtn').addEventListener('click', () => $('popup').classList.add('hidden'));
$('tabRoll').addEventListener('click', () => { $('rollPane').classList.remove('hidden'); $('talkPane').classList.add('hidden'); $('tabRoll').classList.add('active'); $('tabTalk').classList.remove('active'); });
$('tabTalk').addEventListener('click', () => { $('talkPane').classList.remove('hidden'); $('rollPane').classList.add('hidden'); $('tabTalk').classList.add('active'); $('tabRoll').classList.remove('active'); });
fetch('/api/health').then((r) => r.json()).then((h) => { $('aiStatus').textContent = h.ai ? 'AI DM online' : 'DM offline mode'; }).catch(() => {});
