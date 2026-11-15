// SI disclosure: this file was written with help from Claude (Anthropic), an AI assistant, and reviewed/deployed by Troy.
// data.js - all game content. Edit text here without touching game logic.
// Change the DM's name here (and in dm.js on the server).
const DM_NAME = 'Magic the Tanner';
const DM_SPRITE = '🎩';
const GRID = { w: 6, h: 4 };

const CLASSES = {
  Tank: { emoji: '🛡️', hp: 6, items: ['Moon Shield', 'Duct Tape', 'Space Snack'], perk: 'Extra health. Great at protecting teammates.' },
  Scout: { emoji: '🔭', hp: 5, items: ['Grappling Hook', 'Flashlight', 'Space Snack'], perk: 'Finds better stuff when searching.' },
  Engineer: { emoji: '🔧', hp: 4, items: ['Laser Cutter', 'Repair Kit', 'Drone Buddy', 'Space Snack'], perk: 'Fragile, but has the best gadgets.' },
};

const ITEM_INFO = {
  'Moon Shield': 'Blocks a hit for you or a teammate.',
  'Duct Tape': 'Fixes almost anything. Almost.',
  'Space Snack': 'Heals a little. The DM decides how much.',
  'Grappling Hook': 'Climb crater walls or yank things toward you.',
  Flashlight: 'Lights up dark places. Bugs hate it.',
  'Laser Cutter': 'Cuts through ice, rock, and bug shells.',
  'Repair Kit': 'Patch up gear or a teammate.',
  'Drone Buddy': 'A tiny robot that scouts, distracts, or beeps loudly.',
};

// Each location has a scene grid (6 wide x 4 tall). Players start in the left column.
// enemies: individual bugs (no health bar; the DM decides when they're defeated).
// props: search spots. Each can be searched once to maybe find an item.
const POIS = [
  {
    id: 'mouton',
    name: 'Mons Mouton Plateau',
    base: { name: 'Mouton Base Camp', npc: 'Commander Juniper Vance', npcSprite: '👩‍🚀' },
    intro: 'Your lander touches down on a wide, flat mountaintop. Mouton Base Camp blinks hello... and two moon bugs are chewing on the cargo straps!',
    challenge: 'Shoo the moon bugs away from the supplies.',
    enemies: [
      { id: 'bugA', name: 'Moon Bug A', sprite: '🐛', x: 4, y: 0 },
      { id: 'bugB', name: 'Moon Bug B', sprite: '🐛', x: 5, y: 2 },
    ],
    props: [
      { id: 'crate', name: 'Cargo Crate', sprite: '📦', x: 2, y: 0 },
      { id: 'rock', name: 'Big Rock', sprite: '🪨', x: 3, y: 3 },
    ],
    fact: 'Mons Mouton Plateau is one of nine regions NASA picked in 2024 as possible landing spots for Artemis III, the mission to land astronauts near the Moon\'s south pole.',
    source: { title: 'NASA: Update on Artemis III Moon Landing Regions (2024)', url: 'https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/' },
  },
  {
    id: 'rim',
    name: 'Shackleton Rim',
    intro: 'Sunlight skims across the crater rim like a spotlight on a stage. Perfect for solar panels... if you can get them set up.',
    challenge: 'Set up the solar panels so they face the low Sun (3 successes).',
    goal: 3,
    enemies: [],
    props: [
      { id: 'panels', name: 'Solar Panel Stack', sprite: '🔋', x: 2, y: 1 },
      { id: 'boulder', name: 'Wobbly Boulder', sprite: '🪨', x: 4, y: 0 },
      { id: 'pit', name: 'Tiny Crater', sprite: '🕳️', x: 4, y: 3 },
    ],
    fact: 'Some areas near Shackleton crater get sunlight for over 200 Earth days in a row, which makes them great spots for solar power.',
    source: { title: 'NASA Solar System: The Moon\'s South Pole in NASA\'s Landing Sites', url: 'https://solarsystem.nasa.gov/news/907/moons-south-pole-in-nasas-landing-sites' },
  },
  {
    id: 'faustini',
    name: 'Faustini Shadow Zone',
    intro: 'You step into a permanently shadowed crater. It is DARK. It is COLD. Your heater makes a nervous little beep.',
    challenge: 'Cross the dark crater and plant a temperature sensor (3 successes).',
    goal: 3,
    enemies: [{ id: 'glow', name: 'Glow Bug', sprite: '🪰', x: 5, y: 1 }],
    props: [
      { id: 'ice', name: 'Frosty Rock', sprite: '🧊', x: 2, y: 2 },
      { id: 'probe', name: 'Old Probe', sprite: '🛰️', x: 3, y: 0 },
    ],
    fact: 'Permanently shadowed craters near the lunar south pole have some of the coldest temperatures in the solar system: down to about -414°F (-248°C).',
    source: { title: 'NASA Solar System: The Moon\'s South Pole in NASA\'s Landing Sites', url: 'https://solarsystem.nasa.gov/news/907/moons-south-pole-in-nasas-landing-sites' },
  },
  {
    id: 'cabeus',
    name: 'Cabeus Ice Station',
    base: { name: 'Cabeus Ice Station', npc: 'Dr. Pip Okoro', npcSprite: '🧑‍🔬' },
    intro: 'Cabeus Ice Station hums with drills. Dr. Pip waves frantically: three ice mites are eating the ice core samples!',
    challenge: 'Protect the ice drill from the ice mites.',
    enemies: [
      { id: 'miteA', name: 'Ice Mite A', sprite: '🪲', x: 4, y: 0 },
      { id: 'miteB', name: 'Ice Mite B', sprite: '🪲', x: 5, y: 1 },
      { id: 'miteC', name: 'Ice Mite C', sprite: '🪲', x: 4, y: 3 },
    ],
    props: [
      { id: 'drill', name: 'Ice Drill', sprite: '⛏️', x: 2, y: 1 },
      { id: 'locker', name: 'Supply Locker', sprite: '🗄️', x: 1, y: 3 },
    ],
    fact: 'In 2009, NASA\'s LCROSS mission crashed a used rocket stage into Cabeus crater on purpose, and the debris cloud proved there was water ice inside.',
    source: { title: 'NASA: LCROSS found water ice in a dark, cold lunar crater', url: 'https://www.nasa.gov/?p=263227' },
  },
  {
    id: 'floor',
    name: 'Shackleton Crater Floor',
    intro: 'The ground rumbles. Something ENORMOUS has been napping at the bottom of Shackleton crater. The Giant Moon Worm wakes up, and it is grumpy.',
    challenge: 'Defeat the Giant Moon Worm to graduate as Junior Astronauts!',
    boss: true,
    enemies: [{ id: 'worm', name: 'Giant Moon Worm', sprite: '🪱', x: 5, y: 1, boss: true }],
    props: [
      { id: 'stal', name: 'Ice Spike', sprite: '🧊', x: 2, y: 0 },
      { id: 'hole', name: 'Worm Hole', sprite: '🕳️', x: 3, y: 3 },
    ],
    fact: 'Shackleton crater is about 12 miles (19 km) across, and the Moon\'s south pole sits right on its rim.',
    source: { title: 'NASA Solar System: The Moon\'s South Pole in NASA\'s Landing Sites', url: 'https://solarsystem.nasa.gov/news/907/moons-south-pole-in-nasas-landing-sites' },
  },
];
