#!/usr/bin/env python3
"""Synthetic star-inperson sessions for testing analysis/star_inperson.py (stdlib only).

Writes POST envelopes {experiment, UUID, data:{session, trials}} shaped like SPEC section 7.

    python3 tests/star-inperson/make_synthetic.py OUTDIR --n 24 --drt-open 25 --drt-blind 0 --seed 1
        [--sigma 100] [--mode face_tree|grating] [--trials-per-cell 30] [--all-saves]

RT model per participant: base ~ N(740, 60); per eyes condition the true dRT = drt + N(0, drt_sd); congruent
cell mean = base + dRT/2, incongruent = base - dRT/2; trial RT ~ N(cell mean, sigma).  RT >= 2000 ms -> timeout
(re-queued like the real build), plus random timeouts, anticipations (RT 120-200 ms) and dropped-frame flags.
"""
import argparse
import datetime
import hashlib
import json
import os
import random

FINGERPRINT = hashlib.sha256(b'synthetic-star-inperson-v1').hexdigest()


def _opp(d):
    return 'left' if d == 'right' else 'right'


def trial_list(rng, mode, trials_per_cell):
    configs = []
    if mode == 'grating':
        for gdir in ('left', 'right'):
            for cong in (True, False):
                for _ in range(trials_per_cell // 2):
                    configs.append({'eyes_condition': None, 'congruent': cong, 'face_side': None,
                                    'gaze_direction': None, 'implied_direction': gdir, 'grating_direction': gdir,
                                    'test_direction': gdir if cong else _opp(gdir)})
    else:
        for eyes in ('open', 'blindfold'):
            for cong in (True, False):
                for side in ('left', 'right'):
                    for _ in range(trials_per_cell // 2):
                        implied = 'right' if side == 'left' else 'left'
                        configs.append({'eyes_condition': eyes, 'congruent': cong, 'face_side': side,
                                        'gaze_direction': implied, 'implied_direction': implied,
                                        'grating_direction': None,
                                        'test_direction': implied if cong else _opp(implied)})
    for i, c in enumerate(configs):
        c['trial_id'] = 'T%03d' % (i + 1)
    rng.shuffle(configs)
    return configs


def _record(ctx, phase, attempt_index, cfg, rt, response, timed_out, **extra):
    ctx['t'] += ctx['rng'].uniform(1000, 2000) + 3000
    onset = round(ctx['t'], 1)
    correct = None if timed_out else (response == cfg['test_direction'])
    rec = {'session_uuid': ctx['uuid'], 'participant_id': ctx['pid'], 'phase': phase,
           'practice_attempt': None, 'attempt_index': attempt_index, 'trial_id': cfg.get('trial_id'),
           'requeue_count': cfg.get('requeue_count', 0), 'requeued_from': cfg.get('requeued_from'),
           'block': None, 'trial_in_block': None,
           'adaptor_type': 'blank' if phase == 'practice' else ('grating' if ctx['mode'] == 'grating'
                                                                else 'face_tree'),
           'eyes_condition': cfg.get('eyes_condition'),
           'face_direction': 'towards' if cfg.get('eyes_condition') else None,
           'face_side': cfg.get('face_side'), 'tree_side': _opp(cfg['face_side']) if cfg.get('face_side') else None,
           'gaze_direction': cfg.get('gaze_direction'), 'implied_direction': cfg.get('implied_direction'),
           'test_direction': cfg['test_direction'], 'congruent': cfg.get('congruent'),
           'congruent_gaze': cfg.get('congruent') if cfg.get('eyes_condition') else None,
           'grating_direction': cfg.get('grating_direction'), 'response': response,
           'response_key': None if response is None else ('ArrowLeft' if response == 'left' else 'ArrowRight'),
           'correct': correct, 'timed_out': timed_out, 'aborted': False, 'abort_reason': None,
           'rt_ms': rt, 'rt_handler_ms': None if rt is None else round(rt + 0.4, 1),
           'dots_onset_ts': onset, 'onset_latency_ms': 0.3, 'dots_frames_drawn': int((rt or 2000) / 16.7),
           'dropped_frames_n': 0, 'has_dropped_frame': False, 'max_frame_interval_ms': 16.9,
           'rdk_engine': 'guterstam2020', 'measured_speed_deg_s': 1.4, 'dot_size_device_px': 2}
    rec.update(extra)
    if rec['has_dropped_frame']:
        rec['dropped_frames_n'], rec['max_frame_interval_ms'] = 1, 33.4
    ctx['t'] += (rt or 7000)
    return rec


def generate_session(seed, participant_id='P001', uuid=None, drt_open=25.0, drt_blind=0.0, sigma=100.0,
                     drt_sd=10.0, accuracy=0.92, mode='face_tree', trials_per_cell=30, block_size=20,
                     timeout_rate=0.02, fast_rate=0.01, dropped_rate=0.03, practice_fail=False, stop_after=None,
                     config_overridden=False, start_iso='2026-10-01T09:00:00.000Z', experiment=None,
                     fingerprint=FINGERPRINT):
    """Returns {'uuid', 'participant_id', 'envelopes': [save-order POST envelopes], 'download': envelope|None}.
    stop_after: a save_reason ('setup', 'practice_passed', 'block_<b>') after which the session is abandoned."""
    rng = random.Random(seed)
    uuid = uuid or '%08x-%04x-4%03x-a%03x-%012x' % (rng.getrandbits(32), rng.getrandbits(16), rng.getrandbits(12),
                                                  rng.getrandbits(12), rng.getrandbits(48))
    experiment = experiment or ('star-inperson-grating' if mode == 'grating' else 'star-inperson')
    base = rng.gauss(740, 60)
    true_drt = {'open': drt_open + rng.gauss(0, drt_sd), 'blindfold': drt_blind + rng.gauss(0, drt_sd)}
    true_drt[None] = true_drt['open']            # grating mode: drt_open is the grating dRT
    ctx = {'rng': rng, 'uuid': uuid, 'pid': participant_id, 'mode': mode, 't': 5000.0}
    session = {
        'experiment': experiment, 'experiment_version': '1.0.0', 'code_fingerprint': fingerprint,
        'file_hashes': {}, 'session_uuid': uuid, 'status': 'in_progress', 'partial': True, 'complete': False,
        'main_done': False, 'save_seq': 0, 'save_reason': None, 'saved_at_iso': start_iso,
        'setup': {'participant_id': participant_id, 'experimenter': 'SYN', 'monitor_width_cm': 53.1,
                  'viewing_distance_cm': 54, 'chinrest_used': True, 'room_dark': True, 'monitor_model': 'synthetic'},
        'calibration': {'cm_per_deg': 0.94249, 'ppd_css': 39.68, 'ppd_device': 39.68, 'dpr_effective': 1},
        'display': {'refresh_median_interval_ms': 16.67, 'refresh_hz_est': 60.0},
        'config_effective': {'meta': {'experimentName': 'star-inperson', 'experimentVersion': '1.0.0'},
                             'rdk': {'engine': 'guterstam2020', 'dotSpeedDegPerSec': 1.4, 'coherence': 0.4},
                             'design': {'adaptor': mode, 'trialsPerCell': trials_per_cell,
                                        'blockSize': block_size, 'requeueTimeouts': True}},
        'config_overrides': {'dotSpeedDegPerSec': {'default': 1.4, 'value': 2}} if config_overridden else {},
        'config_overridden': config_overridden, 'pilot': False, 'test': False, 'seed': seed,
        'timing': {'start_iso': start_iso, 'end_iso': None}, 'practice': {'attempts': [], 'passed': False},
        'main_summary': None, 'questionnaire': None, 'saves': []}
    trials, out = [], {'uuid': uuid, 'participant_id': participant_id, 'envelopes': [], 'download': None}

    def save(reason, **flags):
        session.update(flags)
        session['save_seq'] += 1
        session['save_reason'] = reason
        env = json.loads(json.dumps({'experiment': experiment, 'UUID': uuid,
                                     'data': {'session': session, 'trials': trials}}))
        out['envelopes'].append(env)
        session['saves'].append({'seq': session['save_seq'], 'reason': reason, 'ok': True})
        return reason == stop_after

    if save('setup'):
        return out
    for attempt in range(1, 5):                  # practice: 9/10 correct passes, 5/10 fails
        n_ok = 5 if practice_fail else 9
        dirs = ['left', 'right'] * 5
        rng.shuffle(dirs)
        for i, d in enumerate(dirs):
            resp = d if i < n_ok else _opp(d)
            trials.append(_record(ctx, 'practice', len([t for t in trials if t['phase'] == 'practice']),
                                  {'test_direction': d}, round(rng.gauss(800, 120), 1), resp, False,
                                  practice_attempt=attempt))
        session['practice']['attempts'].append({'attempt': attempt, 'n': 10, 'n_correct': n_ok,
                                                'accuracy': n_ok / 10, 'passed': not practice_fail})
        if not practice_fail:
            break
    if practice_fail:
        session['practice']['passed'] = False
        save('practice_failed', status='practice_failed', partial=False, complete=True)
        out['download'] = out['envelopes'][-1]
        return out
    session['practice']['passed'] = True
    if save('practice_passed'):
        return out
    queue = trial_list(rng, mode, trials_per_cell)
    attempt, block, in_block, n_blocks = 0, 1, 0, -(-len(queue) // block_size)
    while queue:
        cfg = queue.pop(0)
        eyes = cfg['eyes_condition']
        mean = base + (0.5 if cfg['congruent'] else -0.5) * true_drt[eyes]
        rt = rng.uniform(120, 200) if rng.random() < fast_rate else rng.gauss(mean, sigma)
        if rt >= 2000 or rng.random() < timeout_rate:
            trials.append(_record(ctx, 'main', attempt, cfg, None, None, True, block=block))
            new = dict(cfg, requeue_count=cfg.get('requeue_count', 0) + 1, requeued_from=attempt)
            queue.insert(rng.randint(min(1, len(queue)), len(queue)), new)
        else:
            resp = cfg['test_direction'] if rng.random() < accuracy else _opp(cfg['test_direction'])
            in_block += 1
            trials.append(_record(ctx, 'main', attempt, cfg, round(rt, 1), resp, False, block=block,
                                  trial_in_block=in_block, has_dropped_frame=rng.random() < dropped_rate))
            if in_block == block_size and queue:
                if save('block_%d' % block):
                    return out
                block, in_block = block + 1, 0
        attempt += 1
    main = [t for t in trials if t['phase'] == 'main' and not t['timed_out']]
    session['main_summary'] = {'n_completed': len(main), 'n_attempts': attempt,
                               'n_timeouts': attempt - len(main),
                               'accuracy': sum(t['correct'] for t in main) / max(1, len(main)), 'n_blocks': n_blocks}
    if save('main_done', main_done=True):
        return out
    session['questionnaire'] = {'q_purpose': 'reaction time', 'q_influence': rng.choice(['no', 'not_sure', 'yes']),
                                'q_influence_how': '', 'q_vision': 'light enters the eye',
                                'q_gender': None, 'q_age': None}
    end = datetime.datetime.strptime(start_iso[:19], '%Y-%m-%dT%H:%M:%S') + datetime.timedelta(minutes=18)
    session['timing']['end_iso'] = end.strftime('%Y-%m-%dT%H:%M:%S.000Z')
    save('final', status='complete', partial=False, complete=True)
    out['download'] = out['envelopes'][-1]
    return out


def write_session(outdir, gen, all_saves=False, download=None):
    """Write the final envelope (server-style name), or every save (+ the local download copy) if all_saves."""
    os.makedirs(outdir, exist_ok=True)
    envs = gen['envelopes'] if all_saves else gen['envelopes'][-1:]
    paths = []
    for env in envs:
        seq = env['data']['session']['save_seq']
        name = '%s_%s_20261001-09%02d%02d.json' % (env['experiment'], gen['uuid'], seq // 60, seq % 60)
        paths.append(os.path.join(outdir, name))
    if (all_saves if download is None else download) and gen['download'] is not None:
        env = gen['download']
        paths.append(os.path.join(outdir, '%s_%s_%s_%s.json' % (env['experiment'], gen['participant_id'],
                                                                  gen['uuid'], env['data']['session']['save_reason'])))
        envs = list(envs) + [env]
    for path, env in zip(paths, envs):
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(env, f)
    return paths


def generate_dataset(outdir, n, drt_open=25.0, drt_blind=0.0, seed=1, all_saves=False, **kw):
    """n participants P001..; returns the list of generated sessions (each with its envelopes)."""
    rng = random.Random(seed)
    gens = []
    for i in range(n):
        start = (datetime.datetime(2026, 10, 1, 9) + datetime.timedelta(hours=i)).strftime('%Y-%m-%dT%H:%M:%S.000Z')
        g = generate_session(rng.getrandbits(32), participant_id='P%03d' % (i + 1), drt_open=drt_open,
                             drt_blind=drt_blind, start_iso=start, **kw)
        if outdir:
            write_session(outdir, g, all_saves=all_saves)
        gens.append(g)
    return gens


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('outdir')
    ap.add_argument('--n', type=int, default=24)
    ap.add_argument('--drt-open', type=float, default=25.0)
    ap.add_argument('--drt-blind', type=float, default=0.0)
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--sigma', type=float, default=100.0)
    ap.add_argument('--mode', choices=['face_tree', 'grating'], default='face_tree')
    ap.add_argument('--trials-per-cell', type=int, default=30)
    ap.add_argument('--all-saves', action='store_true', help='write every partial save + the local download')
    a = ap.parse_args(argv)
    gens = generate_dataset(a.outdir, a.n, a.drt_open, a.drt_blind, a.seed, all_saves=a.all_saves, sigma=a.sigma,
                            mode=a.mode, trials_per_cell=a.trials_per_cell)
    print('wrote %d synthetic sessions to %s' % (len(gens), a.outdir))


if __name__ == '__main__':
    main()
