// rng.js — seeded randomness (pure). mulberry32 PRNG; stream seeds = FNV-1a-32 of "<seed>:<stream>" (SPEC §5.4).

export function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Returns a function () -> float in [0, 1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function streamSeed(seed, name) { return fnv1a32(`${seed >>> 0}:${name}`); }
export function makeStream(seed, name) { return mulberry32(streamSeed(seed, name)); }
export function dotsSeed(seed, phase, attemptIndex) { return streamSeed(seed, `dots:${phase}:${attemptIndex}`); }

export function uniform(rng, lo, hi) { return lo + (hi - lo) * rng(); }

// Integer uniform on {lo, ..., hi} inclusive.
export function randInt(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }

// In-place Fisher-Yates; returns the array.
export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

// A fresh uint32 seed from the platform CSPRNG (browser or Node >= 19).
export function randomSeed() {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0];
}
