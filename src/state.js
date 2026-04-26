const dancers = [
  { id: "dancer-1", name: "NOVA", tipsMinor: 0 },
  { id: "dancer-2", name: "SHADOW", tipsMinor: 0 },
  { id: "dancer-3", name: "RAWFIRE", tipsMinor: 0 }
];

const tutorialClips = [
  { id: "clip-1", title: "Chest Pop Fundamentals", priceMinor: 25, creator: "NOVA" },
  { id: "clip-2", title: "Arm Swing Variations", priceMinor: 40, creator: "SHADOW" },
  { id: "clip-3", title: "Stomp Timing and Control", priceMinor: 30, creator: "RAWFIRE" }
];

const entries = [];
const payments = [];
const payouts = [];
const unlocks = new Map();
const feedbackRequests = [];
const practiceRooms = [
  { id: "room-1", name: "Downtown Cypher Studio", rate_minor_per_min: 12, mode: "in_person" },
  { id: "room-2", name: "Arc Virtual Lab", rate_minor_per_min: 8, mode: "virtual" }
];
const practiceBookings = [];
const samplePacks = [
  {
    id: "pack-1",
    title: "Battle Chants Vol. 1",
    creator: "NOVA",
    tiers: [
      { id: "tier-personal", name: "Personal", price_minor: 300 },
      { id: "tier-commercial", name: "Commercial", price_minor: 1200 }
    ]
  },
  {
    id: "pack-2",
    title: "Stomp Percussion Toolkit",
    creator: "SHADOW",
    tiers: [
      { id: "tier-personal", name: "Personal", price_minor: 250 },
      { id: "tier-commercial", name: "Commercial", price_minor: 1000 }
    ]
  }
];
const issuedLicenses = [];
const challenges = [];
const challengeSubmissions = [];
const challengePayouts = [];
const crews = [];
const crewSettlements = [];
const merchCatalog = [
  { id: "merch-1", name: "KRUMP Hoodie", price_minor: 4500, category: "apparel" },
  { id: "merch-2", name: "Battle Gloves", price_minor: 1800, category: "gear" },
  { id: "merch-3", name: "Crew Cap", price_minor: 1200, category: "apparel" }
];
const merchOrders = [];

let battleClosed = false;

function nowIso() {
  return new Date().toISOString();
}

function toUsd(minor) {
  return (minor / 100).toFixed(2);
}

function makeId(prefix) {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

module.exports = {
  dancers,
  tutorialClips,
  entries,
  payments,
  payouts,
  unlocks,
  feedbackRequests,
  practiceRooms,
  practiceBookings,
  samplePacks,
  issuedLicenses,
  challenges,
  challengeSubmissions,
  challengePayouts,
  crews,
  crewSettlements,
  merchCatalog,
  merchOrders,
  get battleClosed() {
    return battleClosed;
  },
  set battleClosed(value) {
    battleClosed = value;
  },
  helpers: {
    nowIso,
    toUsd,
    makeId
  }
};
