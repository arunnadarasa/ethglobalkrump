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
