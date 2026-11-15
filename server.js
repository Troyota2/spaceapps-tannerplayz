'use strict';
// server.js - serves the game from /public and exposes POST /api/dm.
// The browser never talks to Gemini; it talks to this endpoint.
require('dotenv').config({ quiet: true });
const path = require('path');
const express = require('express');
const dm = require('./dm');

// ---------- simple rate limiter (per IP per minute + global daily cap) ----------
function createLimiter({ perMinute, dailyCap, now = () => Date.now() }) {
  const hits = new Map(); // ip -> [timestamps]
  let day = new Date(now()).toISOString().slice(0, 10);
  let dayCount = 0;
  return function check(ip) {
    const t = now();
    const today = new Date(t).toISOString().slice(0, 10);
    if (today !== day) { day = today; dayCount = 0; hits.clear(); }
    if (dayCount >= dailyCap) return { ok: false, reason: 'daily' };
    const recent = (hits.get(ip) || []).filter((x) => t - x < 60_000);
    if (recent.length >= perMinute) { hits.set(ip, recent); return { ok: false, reason: 'minute' }; }
    recent.push(t);
    hits.set(ip, recent);
    dayCount++;
    return { ok: true };
  };
}

function createApp({ apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || 'gemini-flash-latest',
  perMinute = Number(process.env.RATE_PER_MINUTE) || 12, dailyCap = Number(process.env.DAILY_CAP) || 1500,
  fetchImpl = fetch } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback'); // Nginx on the same machine
  app.use(express.json({ limit: '20kb' }));
  // no-cache = browsers and Cloudflare must re-check for a new version on every load,
// so a deploy never mixes a new index.html with an old game.js.
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));

  const limiter = createLimiter({ perMinute, dailyCap });
  // Backup DM replies go through the same rule checks as Gemini's.
  const offline = (clean) => ({ ...dm.sanitizeReply(dm.fallbackReply(clean), clean), offline: true });

  app.get('/api/health', (_req, res) => res.json({ ok: true, ai: !!apiKey }));

  app.post('/api/dm', async (req, res) => {
    const ip = req.get('cf-connecting-ip') || req.ip;
    let clean;
    try {
      clean = dm.sanitizeRequest(req.body);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    const gate = limiter(ip);
    if (!gate.ok) {
      // Still return a playable answer so the game never freezes.
      const reply = offline(clean);
      reply.narration = (gate.reason === 'minute' ? 'Whoa, slow down, cadets! ' : '') + reply.narration;
      return res.status(200).json({ ...reply, limited: gate.reason });
    }
    if (!apiKey) return res.json(offline(clean));
    try {
      const raw = await dm.callGemini(clean, { apiKey, model, fetchImpl });
      return res.json(dm.sanitizeReply(raw, clean));
    } catch (err) {
      console.error('[dm] Gemini failed:', err.message); // never log the key or the body
      return res.json(offline(clean));
    }
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3050;
  createApp().listen(port, '127.0.0.1', () => {
    console.log(`Moon Trainer on http://127.0.0.1:${port} (AI ${process.env.GEMINI_API_KEY ? 'on' : 'OFF - fallback mode'})`);
  });
}

module.exports = { createApp, createLimiter };
