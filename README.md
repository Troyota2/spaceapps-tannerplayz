# Junior Astronaut Mission Trainer 🌑

**Play it:** https://spaceapps.tannerplayz.com
**Challenge:** NASA Space Apps Challenge 2026: *Build a Junior Astronaut Mission Trainer*

A D&D-style training adventure at the Moon's south pole for 3 junior astronauts on one device. An AI Dungeon Master, **Magic the Tanner** 🎩, narrates everything and reacts to whatever the players try. At each of 5 real lunar south pole locations, the crew clears a challenge and unlocks a real fact from NASA.

## How to play
1. Enter 3 astronaut names and pick a class for each: 🛡️ **Tank** (6 HP, protects teammates), 🔭 **Scout** (5 HP, finds better loot), or 🔧 **Engineer** (4 HP, best gadgets). Pass the device around or play all three yourself.
2. **🎲 Roll:** on your turn, type what you want to do, optionally click one of your items, and roll the d20. The DM decides what the roll was for and what happens:
   - **1** backfires on you in a funny way. **2-3** go really badly. **4-9** fail or only half work.
   - **10** usually slides. **11-17** succeed. **18-19** go really well. **20** succeeds with a bonus.
   - Your own roll only hurts you on a **1 (up to 2 HP) or 2-3 (up to 1 HP)**.
   - After every full round, the **enemies take a turn**: each bug rolls its own d20. **1** = it bonks itself, **2-9** = miss, **10-17** = 1 damage, **18-20** = 2 damage. The server enforces these numbers; the AI only picks targets and narrates.
3. **🎒 Items:** you can only use what's in your inventory; trying to use something you don't have (like a "moon nuke") fails comically. Find new items by **searching** rocks, crates and lockers. Each spot can be searched once. The server enforces this, not just the AI.
4. **🧭 Scene / 🗺️ Map:** the Scene shows a grid with where every astronaut, bug and search spot is, and the DM moves people as the story happens. The Map shows the 5-stop route.
5. **Enemies have no health bars.** Each bug is tracked separately (hits taken, turns fought), and the DM decides when it's defeated. The boss needs at least 4 hits.
6. **✨ Statuses** (scared, weakened, shielded, dizzy, inspired...) on players and bugs drive what the DM decides. A natural 20, even on "umm idk", gives you something awesome like a bug-scaring aura.
7. **🎩 DM mood and ego:** the DM's mood (shown in the header) goes up when you compliment it or get creative and down when you're rude or boring. A happy DM bends things your way; an annoyed one gets petty (in funny, kid-safe ways).
8. **Friendly fire** is allowed, but deliberately sabotaging a teammate usually backfires on the saboteur (in a slapstick way).
9. **💬 Talk:** chat with the DM or the NPC astronauts at the two moon bases. Talking doesn't use your turn.
10. After an area is cleared, press the yellow **🚀 Travel** button to go to the next stop.
11. It's nearly impossible to lose. Knocked-out astronauts reboot at the next location, and if the whole crew goes down, the simulation rewinds.

**Secret DM mechanics** (revealed at the end of the game): the DM secretly picks a *favorite*, whose bad rolls get twisted into ridiculous luck and who gets called "so smart" for anything, and a *lovable joke of the crew*, who gets funnier (never mean) misfortunes. The DM also keeps a list of running gags and keeps bringing them back.

**Turn flow:** after each roll, the next player presses **Continue ▶** so everyone can read what happened first. Searching requires standing next to the spot; if the DM forgets to move you, the server walks you over. Sound effects are synthesized in the browser with the Web Audio API (no audio files), with a 🔊 mute button.

## The 5 locations and NASA facts
| # | Location | Challenge | Real fact | Source |
|---|---|---|---|---|
| 1 | Mons Mouton Plateau (base + NPC) | Moon Bug Swarm | One of nine possible Artemis III landing regions NASA named in 2024 | [NASA news release](https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/) |
| 2 | Shackleton Rim | Solar panel setup | Some areas near Shackleton get 200+ Earth days of constant sunlight | [NASA Solar System Exploration](https://solarsystem.nasa.gov/news/907/moons-south-pole-in-nasas-landing-sites) |
| 3 | Faustini Shadow Zone | Cross a permanently shadowed crater | Shadowed craters reach about -414°F (-248°C) | [NASA Solar System Exploration](https://solarsystem.nasa.gov/news/907/moons-south-pole-in-nasas-landing-sites) |
| 4 | Cabeus Ice Station (base + NPC) | Ice Mites | LCROSS impacted Cabeus in 2009 and found water ice | [NASA: LCROSS](https://www.nasa.gov/?p=263227) |
| 5 | Shackleton Crater Floor | Giant Moon Worm (boss) | Shackleton is about 12 mi (19 km) across, with the south pole on its rim | [NASA Solar System Exploration](https://solarsystem.nasa.gov/news/907/moons-south-pole-in-nasas-landing-sites) |

### NASA data and resources used
- NASA, *NASA Provides Update on Artemis III Moon Landing Regions* (Oct 2024): https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/
- NASA Solar System Exploration, *The Moon's South Pole in NASA's Landing Sites* (LRO data on illumination and temperatures): https://solarsystem.nasa.gov/news/907/moons-south-pole-in-nasas-landing-sites
- NASA, LCROSS mission results: https://www.nasa.gov/?p=263227
- NASA Goddard Scientific Visualization Studio, *LRO Peers into Permanent Shadows*: https://svs.gsfc.nasa.gov/4043

No NASA logos, insignia or mission patches are used. The map is a simplified diagram, not to scale.

## Time log (time-boxed to ~2 hours)
I signed up and only remembered the night before, so I gave myself a strict ~2 hour build window. All times are PT, Sat Nov 14 2026.

| Time | What happened |
|---|---|
| 3:27 PM | Research: DM style inspiration, lunar south pole sites, NASA sources |
| 3:41 PM | Finalized design: roll bands, points system for the favorite/joke, talk vs. roll |
| 3:43 PM | Server written: Express, Gemini proxy, rate limiting, offline fallback DM. 8 automated tests passing |
| 3:47 PM | Game client written and tested headless through a full playthrough to the boss |
| ~4:10 PM | Tier 1 deployed to spaceapps.tannerplayz.com (separate repo, PM2 process, Nginx block, DNS record) |
| 4:32 PM | Playtested; feedback round: classes, 5 HP, inventory-only items + searching, per-enemy tracking, scene grid with positions, turn banner, thinking indicator, intro + first-turn tutorials |
| 4:41 PM | v2 written, 12 automated tests + full headless playthrough passing |
| 4:55 PM | Live AI DM was timing out: the default model was overloaded (HTTP 503 after 22s); switched to `gemini-3.5-flash-lite` (1s responses) |
| 5:05 PM | Fixed stale cached JS after deploy (cache-busting + no-cache headers) |
| 5:15 PM | Second playtest with the real AI DM. Removed points, Continue button between turns, scattered starts, walk-to-search, synthesized sound effects, small-screen scene; 15 tests passing |
| 5:34 PM | Third playtest feedback. Added statuses, DM mood/ego, enemy turns with their own rolls, self-damage only on 1-3, a 🚀 Travel button; 17 tests passing |
| _fill in_ | Real Gemini DM tested live |
| _fill in_ | End of build |

**Cut to stay in the time box:** 3-device online multiplayer rooms (Socket.io), custom sprite art (emoji are used as sprites), sound, save/load, and a special dice "twist" rule.

## AI disclosure
- **Gemini (Google)** powers the in-game Dungeon Master at runtime. The browser sends each player action to this project's own server (`POST /api/dm`), and the server calls the Gemini API. The API key exists only in the server's environment and is never sent to the browser. The endpoint is rate limited per IP and has a daily cap.
- **Claude (Anthropic)** helped write the code (server, game client, tests) and this README, and helped research the NASA sources. I reviewed and deployed everything.

## Credits
- DM style inspired by Magic the Noah's D&D videos (inspiration credit only; no names, voices, catchphrases or content are used).
- Built by Troy.

## Run it locally
```bash
npm install
cp .env.example .env   # add your own GEMINI_API_KEY (optional: without it, the DM runs in offline mode)
npm test
npm start              # http://127.0.0.1:3050
```

## Files
- `server.js`: Express server, static files, rate limiter, `/api/dm` endpoint
- `dm.js`: DM prompt, Gemini call, input/output validation, offline fallback
- `public/data.js`: all story content (locations, facts, items, DM name)
- `public/game.js`: game state, turns, dice, map and UI
- `test/dm.test.js`: Node tests (`npm test`)
