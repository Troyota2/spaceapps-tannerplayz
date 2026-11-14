// data.js - all game content. Edit text here without touching game logic.
// Change the DM's name here (and in dm.js on the server).
const DM_NAME = 'Old Regolith';
const DM_SPRITE = '🪨';

const STARTING_ITEMS = [
  ['Duct Tape', 'Space Snack', 'Flashlight'],
  ['Rubber Chicken', 'Space Snack', 'Grappling Hook'],
  ['Moon Shovel', 'Space Snack', 'Shiny Rock'],
];

// Map coordinates are on a 500x500 SVG with the south pole near the center.
// Positions are approximate - the map is a diagram, not to scale.
const POIS = [
  {
    id: 'mouton',
    name: 'Mons Mouton Plateau',
    x: 110, y: 330,
    base: { name: 'Mouton Base Camp', npc: 'Commander Juniper Vance', npcSprite: '👩‍🚀' },
    intro: 'Your lander touches down on a wide, flat mountaintop. Mouton Base Camp blinks hello... and moon bugs are chewing on the cargo straps!',
    challenge: 'Unload the lander and shoo the moon bugs away from the supplies.',
    enemy: { name: 'Moon Bug Swarm', hp: 8, sprite: '🐛' },
    fact: 'Mons Mouton Plateau is one of nine regions NASA picked in 2024 as possible landing spots for Artemis III, the mission to land astronauts near the Moon\'s south pole.',
    source: { title: 'NASA: Update on Artemis III Moon Landing Regions (2024)', url: 'https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/' },
  },
  {
    id: 'rim',
    name: 'Shackleton Rim',
    x: 230, y: 200,
    intro: 'Sunlight skims across the crater rim like a spotlight on a stage. Perfect for solar panels... if the glow bugs stop sitting on them.',
    challenge: 'Set up the solar panels so they always face the low Sun.',
    goal: 3,
    fact: 'Some areas near Shackleton crater get sunlight for over 200 Earth days in a row, which makes them great spots for solar power.',
    source: { title: 'NASA Solar System: The Moon\'s South Pole in NASA\'s Landing Sites', url: 'https://solarsystem.nasa.gov/news/907/moons-south-pole-in-nasas-landing-sites' },
  },
  {
    id: 'faustini',
    name: 'Faustini Shadow Zone',
    x: 350, y: 375,
    intro: 'You step into a permanently shadowed crater. It is DARK. It is COLD. Your heater makes a nervous little beep.',
    challenge: 'Cross the dark crater floor and plant a temperature sensor without freezing your snacks.',
    goal: 3,
    fact: 'Permanently shadowed craters near the lunar south pole have some of the coldest temperatures in the solar system: down to about -414°F (-248°C).',
    source: { title: 'NASA Solar System: The Moon\'s South Pole in NASA\'s Landing Sites', url: 'https://solarsystem.nasa.gov/news/907/moons-south-pole-in-nasas-landing-sites' },
  },
  {
    id: 'cabeus',
    name: 'Cabeus Ice Station',
    x: 390, y: 140,
    base: { name: 'Cabeus Ice Station', npc: 'Dr. Pip Okoro', npcSprite: '🧑‍🔬' },
    intro: 'Cabeus Ice Station hums with drills. Dr. Pip waves frantically: the ice mites are eating the ice core samples!',
    challenge: 'Protect the ice drill from the ice mites and bring up a water-ice sample.',
    enemy: { name: 'Ice Mites', hp: 12, sprite: '🪲' },
    fact: 'In 2009, NASA\'s LCROSS mission crashed a used rocket stage into Cabeus crater on purpose, and the debris cloud proved there was water ice inside.',
    source: { title: 'NASA: LCROSS found water ice in a dark, cold lunar crater', url: 'https://www.nasa.gov/?p=263227' },
  },
  {
    id: 'floor',
    name: 'Shackleton Crater Floor',
    x: 250, y: 250,
    intro: 'The ground rumbles. Something ENORMOUS has been napping at the bottom of Shackleton crater. The Giant Moon Worm wakes up, and it is grumpy.',
    challenge: 'Defeat the Giant Moon Worm to graduate as Junior Astronauts!',
    enemy: { name: 'Giant Moon Worm', hp: 30, sprite: '🪱' },
    boss: true,
    fact: 'Shackleton crater is about 12 miles (19 km) across, and the Moon\'s south pole sits right on its rim.',
    source: { title: 'NASA Solar System: The Moon\'s South Pole in NASA\'s Landing Sites', url: 'https://solarsystem.nasa.gov/news/907/moons-south-pole-in-nasas-landing-sites' },
  },
];
