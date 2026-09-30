// design.js — trial lists (pure, seeded). SPEC §5.4 (main list), §4.4 (grating list), §5.5 (re-queue), §5.7 (practice).
import { makeStream, shuffle, randInt } from './rng.js';

export const opposite = (d) => (d === 'left' ? 'right' : 'left');
const pad3 = (i) => String(i).padStart(3, '0');

// Face-tree list: eyes x congruent x face_side, trialsPerCell/2 repeats each, then Fisher-Yates (order stream).
export function faceTreeList(cfg, seed) {
  const half = cfg.design.trialsPerCell / 2;
  const list = [];
  let idx = 1;
  for (const eyes of ['open', 'blindfold']) {
    for (const congruent of [true, false]) {
      for (const face_side of ['left', 'right']) {
        for (let r = 0; r < half; r++) {
          const implied = face_side === 'left' ? 'right' : 'left';
          list.push({
            trial_id: 'T' + pad3(idx++),
            adaptor_type: 'face_tree',
            eyes_condition: eyes,
            congruent,
            face_side,
            tree_side: opposite(face_side),
            gaze_direction: implied,
            implied_direction: implied,
            test_direction: congruent ? implied : opposite(implied),
            grating_direction: null,
            grating_phase0: null,
          });
        }
      }
    }
  }
  return shuffle(list, makeStream(seed, 'order'));
}

// Grating list (Exp 1 rig check): grating_direction x congruent, trialsPerCell/2 each.
// phase0 ~ U[0, 2pi) per config from the order stream (drawn before shuffling, so it is part of the config).
export function gratingList(cfg, seed) {
  const half = cfg.design.trialsPerCell / 2;
  const rng = makeStream(seed, 'order');
  const list = [];
  let idx = 1;
  for (const dir of ['left', 'right']) {
    for (const congruent of [true, false]) {
      for (let r = 0; r < half; r++) {
        list.push({
          trial_id: 'T' + pad3(idx++),
          adaptor_type: 'grating',
          eyes_condition: null,
          congruent,
          face_side: null,
          tree_side: null,
          gaze_direction: null,
          implied_direction: dir,
          test_direction: congruent ? dir : opposite(dir),
          grating_direction: dir,
          grating_phase0: rng() * 2 * Math.PI,
        });
      }
    }
  }
  return shuffle(list, rng);
}

export function mainList(cfg, seed) {
  return cfg.design.adaptor === 'grating' ? gratingList(cfg, seed) : faceTreeList(cfg, seed);
}

// Practice: one stream for the whole session, advanced per attempt -> every attempt is a fresh sequence.
export class PracticeLists {
  constructor(cfg, seed) { this.n = cfg.practice.practiceTrials; this.rng = makeStream(seed, 'practice'); }
  next() {
    const n = this.n;
    let nLeft = Math.floor(n / 2);
    if (n % 2 === 1 && this.rng() < 0.5) nLeft += 1;      // odd n: extra direction from the practice stream
    const dirs = [];
    for (let i = 0; i < n; i++) dirs.push(i < nLeft ? 'left' : 'right');
    shuffle(dirs, this.rng);
    return dirs.map((d) => ({
      trial_id: null, adaptor_type: 'blank', eyes_condition: null, congruent: null,
      face_side: null, tree_side: null, gaze_direction: null, implied_direction: null,
      test_direction: d, grating_direction: null, grating_phase0: null,
    }));
  }
}

// Insert `item` into `queue` (index 0 = next trial) at j ~ U{min(1,R), ..., R}; appended if R = 0. Returns j.
export function requeueInsert(queue, item, rng) {
  const R = queue.length;
  const j = randInt(rng, Math.min(1, R), R);
  queue.splice(j, 0, item);
  return j;
}
