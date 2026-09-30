#!/usr/bin/env python3
"""Analysis for the in-lab Guterstam & Graziano (2020) Exp 2 replication (SPEC.md section 8).

Standard library only (Python >= 3.9).  Usage:
    python3 analysis/star_inperson.py DIR [DIR ...] [--experiment star-inperson] [--iterations 10000]
        [--seed 20260929] [--fingerprint HEX] [--include-overridden] [--target-n 32] [--interim]
        [--min-valid-rt-per-cell 15] [--out-csv per_participant.csv]
Thresholds: see the PREREGISTRATION block below (printed in the report header).

Importable helpers (used by tests/star-inperson/test_analysis.py): p_t, p_normal, signflip_p, signflip_branch,
load_envelopes, dedupe, load_sessions, min_valid_rt, analyze, format_report, run, main.
"""
import argparse
import bisect
import csv
import glob
import hashlib
import json
import math
import operator
import os
import random
import statistics
import sys

# ============================================================================================ PREREGISTRATION
# Every analysis threshold lives here and is printed in the report header.  These values MUST match the
# pre-registered analysis plan (SPEC section 8/9); change them only before data collection, never after looking.
PREREGISTRATION = {
    'target_n': 32,                  # included participants (fixed-N stopping rule, SPEC 9)
    'iterations': 10000,             # accuracy permutation + Monte Carlo sign-flip iterations
    'seed': 20260929,                # analysis RNG seed
    'rt_floor_ms': 200,              # RT trial filter: correct & rt_ms > this & not timed out & not aborted
    'alpha_chance': 0.05,            # exclude if accuracy permutation p >= this
    'min_valid_rt_per_cell': 15,     # exclude if fewer valid RTs than this in ANY eye x congruency cell
                                     # (half of a 30-trial cell; added 2026-09-30 after verification)
    'april_acc': 0.80,               # robustness [C]: April rule, overall accuracy >= this
    'exact_signflip_max_n': 20,      # exact sign-flip enumeration up to this N, Monte Carlo above
}
TARGET_N = PREREGISTRATION['target_n']
ITERATIONS = PREREGISTRATION['iterations']
SEED = PREREGISTRATION['seed']
RT_FLOOR_MS = PREREGISTRATION['rt_floor_ms']
ALPHA_CHANCE = PREREGISTRATION['alpha_chance']
MIN_VALID_RT_PER_CELL = PREREGISTRATION['min_valid_rt_per_cell']
APRIL_ACC = PREREGISTRATION['april_acc']
EXACT_SIGNFLIP_MAX_N = PREREGISTRATION['exact_signflip_max_n']
# ============================================================================================================

EXCLUSION_ORDER = ['overridden_config', 'fingerprint_mismatch', 'duplicate_participant',
                   'practice_failed', 'incomplete', 'chance_accuracy', 'min_valid_rt_per_cell']
CSV_COLUMNS = ['participant_id', 'uuid', 'fingerprint', 'n_completed', 'n_timeouts', 'accuracy', 'acc_perm_p',
               'acc_binom_p', 'excluded_reason', 'rt_open_cong', 'rt_open_incong', 'rt_blind_cong',
               'rt_blind_incong', 'drt_open', 'drt_blind', 'drt_diff', 'drt_open_median', 'drt_blind_median',
               'dA_open', 'dA_blind', 'n_rt_trials', 'n_dropped_frame_trials', 'chinrest_used', 'refresh_hz_est',
               'ppd_css', 'questionnaire_influence']
CONTRASTS = {'face_tree': [('open dRT vs 0', 'open'), ('blindfold dRT vs 0', 'blindfold'),
                           ('open - blindfold', 'diff')],
             'grating': [('grating dRT vs 0', 'grating')]}


# ----------------------------------------------------------------------------------------------- statistics
def _betacf(a, b, x, maxit=300, eps=3e-16):
    """Continued fraction for the incomplete beta function (Numerical Recipes betacf, modified Lentz)."""
    fpmin = 1e-300
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c, d = 1.0, 1.0 - qab * x / qap
    d = 1.0 / (d if abs(d) > fpmin else fpmin)
    h = d
    for m in range(1, maxit + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        d = 1.0 / (d if abs(d) > fpmin else fpmin)
        c = 1.0 + aa / c
        c = c if abs(c) > fpmin else fpmin
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        d = 1.0 / (d if abs(d) > fpmin else fpmin)
        c = 1.0 + aa / c
        c = c if abs(c) > fpmin else fpmin
        de = d * c
        h *= de
        if abs(de - 1.0) < eps:
            break
    return h


def betai(a, b, x):
    """Regularised incomplete beta I_x(a, b)."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    bt = math.exp(math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b) + a * math.log(x) + b * math.log1p(-x))
    if x < (a + 1.0) / (a + b + 2.0):
        return bt * _betacf(a, b, x) / a
    return 1.0 - bt * _betacf(b, a, 1.0 - x) / b


def p_t(t, df):
    """Two-sided Student-t p value: I_{df/(df+t^2)}(df/2, 1/2)."""
    if t is None or df is None or df <= 0 or math.isnan(t):
        return None
    if math.isinf(t):
        return 0.0
    return betai(df / 2.0, 0.5, df / (df + t * t))


def p_normal(t):
    """Two-sided normal-approximation p value, erfc(|t|/sqrt 2)."""
    return None if t is None else math.erfc(abs(t) / math.sqrt(2.0))


def signflip_branch(n):
    return 'exact' if n <= EXACT_SIGNFLIP_MAX_N else 'monte_carlo'


def signflip_p(values, iterations=ITERATIONS, rng=None):
    """Two-sided sign-flip permutation p for mean == 0.  Exact enumeration of all 2^n patterns if n <= 20
    (meet-in-the-middle over the two halves' subset sums), else `iterations` random flips (Monte Carlo)."""
    vals = [float(v) for v in values]
    n = len(vals)
    if n == 0:
        return None
    thr = abs(sum(vals)) - n * 1e-9          # |mean_perm| >= |mean_obs| - 1e-9, in sum units
    if thr <= 0:
        return 1.0
    if signflip_branch(n) == 'exact':
        def sums(vs):
            out = [0.0]
            for v in vs:
                out = [s + v for s in out] + [s - v for s in out]
            return out
        half = n // 2
        left, right = sums(vals[:half]), sorted(sums(vals[half:]))
        count = 0
        for a in left:                        # |a+b| >= thr  <=>  b >= thr-a  or  b <= -thr-a (disjoint)
            count += len(right) - bisect.bisect_left(right, thr - a) + bisect.bisect_right(right, -thr - a)
        return count / float(2 ** n)
    rng = rng or random.Random(0)
    hits = 0
    for _ in range(iterations):
        s = sum(v if rng.random() < 0.5 else -v for v in vals)
        if abs(s) >= thr:
            hits += 1
    return (1 + hits) / (1.0 + iterations)


def group_test(values, label, iterations, seed):
    vals = [v for v in values if v is not None]
    n = len(vals)
    r = {'contrast': label, 'n': n, 'df': n - 1 if n else None, 'mean': statistics.fmean(vals) if n else None,
         'sd': None, 'se': None, 'dz': None, 't': None, 'p_t': None, 'p_normal': None,
         'p_signflip': signflip_p(vals, iterations, random.Random(seed)) if n else None,
         'signflip_branch': signflip_branch(n) if n else None}
    if n >= 2:
        r['sd'] = statistics.stdev(vals)
        r['se'] = r['sd'] / math.sqrt(n)
        if r['sd'] > 0:
            r['dz'] = r['mean'] / r['sd']
            r['t'] = r['mean'] / r['se']
            r['p_t'], r['p_normal'] = p_t(r['t'], n - 1), p_normal(r['t'])
    return r


def binom_p_one_sided(k, n):
    """P(X >= k), X ~ Binomial(n, 0.5)."""
    return sum(math.comb(n, i) for i in range(k, n + 1)) / float(2 ** n) if n else None


def uuid_int(uuid):
    return int.from_bytes(hashlib.sha256(str(uuid).encode('utf-8')).digest()[:8], 'big')


def accuracy_perm_p(responses, directions, iterations, rng):
    """Permute the response vector across trials (dot directions fixed); p = (1 + #{a_perm >= a}) / (1 + iter)."""
    n = len(responses)
    if n == 0:
        return None
    obs = sum(map(operator.eq, responses, directions))
    resp = list(responses)
    hits = 0
    for _ in range(iterations):
        rng.shuffle(resp)
        if sum(map(operator.eq, resp, directions)) >= obs:
            hits += 1
    return (1 + hits) / (1.0 + iterations)


# ----------------------------------------------------------------------------------------------- loading
def load_envelopes(dirs, experiment):
    """Return (list of (path, envelope) with envelope['experiment'] == experiment, warnings)."""
    out, warnings = [], []
    for d in dirs:
        for path in sorted(glob.glob(os.path.join(d, '*.json'))):
            try:
                with open(path, encoding='utf-8') as f:
                    env = json.load(f)
                if not isinstance(env, dict) or not isinstance(env.get('data'), dict) \
                        or not isinstance(env['data'].get('session'), dict):
                    raise ValueError('not an {experiment, UUID, data:{session, trials}} envelope')
            except (OSError, ValueError) as e:
                warnings.append('WARNING: skipped %s (%s)' % (path, e))
                continue
            if env.get('experiment') == experiment:
                out.append((path, env))
    return out, warnings


def dedupe(envelopes):
    """SPEC 7.5: per UUID keep the single file with the highest save_seq; tie -> identical trials required,
    else keep the one with more trial records (+ warning).  Never merges.  Returns (sessions, warnings)."""
    groups, warnings = {}, []
    for path, env in envelopes:
        uuid = env.get('UUID') or env['data']['session'].get('session_uuid')
        groups.setdefault(uuid, []).append((path, env))
    sessions = []
    for uuid, items in groups.items():
        best_path, best = items[0]
        for path, env in items[1:]:
            s_new, s_old = env['data']['session'].get('save_seq', 0), best['data']['session'].get('save_seq', 0)
            if s_new > s_old:
                best_path, best = path, env
            elif s_new == s_old and env['data'].get('trials') != best['data'].get('trials'):
                n_new, n_old = len(env['data'].get('trials') or []), len(best['data'].get('trials') or [])
                keep = path if n_new > n_old else best_path
                warnings.append('WARNING: UUID %s save_seq %s tie with differing trials (%s vs %s); kept %s'
                                % (uuid, s_new, os.path.basename(best_path), os.path.basename(path),
                                   os.path.basename(keep)))
                if n_new > n_old:
                    best_path, best = path, env
        sess = dict(best['data']['session'])
        sessions.append({'uuid': uuid, 'path': best_path, 'n_files': len(items), 'session': sess,
                         'trials': best['data'].get('trials') or []})
    return sessions, warnings


def load_sessions(dirs, experiment):
    envs, warnings = load_envelopes(dirs, experiment)
    sessions, w2 = dedupe(envs)
    return sessions, {'n_files': len(envs), 'n_uuids': len(sessions), 'warnings': warnings + w2}


# ----------------------------------------------------------------------------------------------- per participant
def _get(d, *keys, default=None):
    for k in keys:
        if not isinstance(d, dict) or k not in d:
            return default
        d = d[k]
    return d


def session_mode(sess):
    return _get(sess, 'config_effective', 'design', 'adaptor', default='face_tree')


def completed_main(trials):
    """Completed main trials (not timed out, not aborted), one per trial_id: its final completion."""
    by_id, out = {}, []
    for t in trials:
        if t.get('phase') != 'main' or t.get('timed_out') or t.get('aborted') or t.get('correct') is None:
            continue
        if t.get('trial_id') is None:
            out.append(t)
        else:
            prev = by_id.get(t['trial_id'])
            if prev is None or (t.get('attempt_index') or 0) >= (prev.get('attempt_index') or 0):
                by_id[t['trial_id']] = t
    return out + list(by_id.values())


def cell_eyes(t, mode):
    return 'grating' if mode == 'grating' else t.get('eyes_condition')


def _opp(d):
    return {'left': 'right', 'right': 'left'}.get(d)


def rt_stats(trials, mode, drop_dropped=False):
    """Per-cell RT means/medians/SDs, dRT per eyes condition, dA per eyes condition."""
    comp = completed_main(trials)
    eyes_list = ['grating'] if mode == 'grating' else ['open', 'blindfold']
    cells = {(e, c): [] for e in eyes_list for c in (True, False)}
    acc = {(e, c): [] for e in eyes_list for c in (True, False)}
    for t in comp:
        key = (cell_eyes(t, mode), bool(t.get('congruent')))
        if key not in cells:
            continue
        acc[key].append(1.0 if t.get('correct') else 0.0)
        rt = t.get('rt_ms')
        if t.get('correct') is True and rt is not None and rt > RT_FLOOR_MS \
                and not (drop_dropped and t.get('has_dropped_frame')):
            cells[key].append(float(rt))
    st = {'mean': {}, 'median': {}, 'n': {}, 'ss': 0.0, 'dfw': 0, 'drt': {}, 'drt_median': {}, 'dA': {},
          'n_rt': sum(len(v) for v in cells.values()), 'n_completed': len(comp),
          'n_dropped': sum(1 for t in comp if t.get('has_dropped_frame'))}
    for k, v in cells.items():
        st['n'][k] = len(v)
        st['mean'][k] = statistics.fmean(v) if v else None
        st['median'][k] = statistics.median(v) if v else None
        if len(v) >= 2:
            st['ss'] += statistics.variance(v) * (len(v) - 1)
            st['dfw'] += len(v) - 1
    for e in eyes_list:
        for src, dst in (('mean', 'drt'), ('median', 'drt_median')):
            a, b = st[src][(e, True)], st[src][(e, False)]
            st[dst][e] = a - b if a is not None and b is not None else None
        a, b = acc[(e, True)], acc[(e, False)]
        st['dA'][e] = statistics.fmean(a) - statistics.fmean(b) if a and b else None
    for dst in ('drt', 'drt_median'):
        o, b = st[dst].get('open'), st[dst].get('blindfold')
        st[dst]['diff'] = o - b if o is not None and b is not None else None
    return st


def participant_row(s, mode):
    sess, trials = s['session'], s['trials']
    comp = completed_main(trials)
    n = len(comp)
    resp = [t.get('response') or (t.get('test_direction') if t.get('correct') else _opp(t.get('test_direction')))
            for t in comp]
    dirs = [t.get('test_direction') for t in comp]
    k = sum(map(operator.eq, resp, dirs))
    return {'participant_id': _get(sess, 'setup', 'participant_id', default=''), 'uuid': s['uuid'],
            'fingerprint': sess.get('code_fingerprint') or '', 'version': sess.get('experiment_version'),
            'save_seq': sess.get('save_seq'), 'save_reason': sess.get('save_reason'), 'status': sess.get('status'),
            'mode': mode, 'n_completed': n, 'n_correct': k, 'accuracy': k / n if n else None,
            'n_timeouts': sum(1 for t in trials if t.get('phase') == 'main' and t.get('timed_out')),
            'responses': resp, 'directions': dirs, 'acc_perm_p': None, 'acc_binom_p': binom_p_one_sided(k, n),
            'excluded_reason': '', 'stats': rt_stats(trials, mode),
            'stats_nodrop': rt_stats(trials, mode, drop_dropped=True),
            'chinrest_used': _get(sess, 'setup', 'chinrest_used'),
            'refresh_hz_est': _get(sess, 'display', 'refresh_hz_est'),
            'ppd_css': _get(sess, 'calibration', 'ppd_css'),
            'questionnaire_influence': _get(sess, 'questionnaire', 'q_influence'),
            'start_iso': _get(sess, 'timing', 'start_iso', default='') or ''}


def is_incomplete(s, mode):
    tpc = _get(s['session'], 'config_effective', 'design', 'trialsPerCell', default=30)
    counts = {}
    for t in completed_main(s['trials']):
        key = (cell_eyes(t, mode), bool(t.get('congruent')))
        counts[key] = counts.get(key, 0) + 1
    eyes_list = ['grating'] if mode == 'grating' else ['open', 'blindfold']
    return any(counts.get((e, c), 0) < tpc for e in eyes_list for c in (True, False))


def min_valid_rt(stats):
    """Smallest number of valid RTs (correct, main, rt > RT_FLOOR_MS, not timed out/aborted) over the cells."""
    return min(stats['n'].values()) if stats['n'] else 0


# ----------------------------------------------------------------------------------------------- pipeline
def analyze(dirs, experiment='star-inperson', iterations=ITERATIONS, seed=SEED, fingerprint=None,
            include_overridden=False, target_n=TARGET_N, interim=False, min_valid_rt_per_cell=MIN_VALID_RT_PER_CELL):
    if min_valid_rt_per_cell < 1:
        raise ValueError('min_valid_rt_per_cell must be >= 1 (otherwise a contrast could silently lose participants)')
    sessions, info = load_sessions(dirs, experiment)
    warnings = list(info['warnings'])
    pool = [s for s in sessions if s['session'].get('main_done') is True
            or s['session'].get('status') == 'practice_failed']
    non_participants = [s['uuid'] for s in sessions if s not in pool]
    rows = {s['uuid']: participant_row(s, session_mode(s['session'])) for s in pool}
    excl = {name: [] for name in EXCLUSION_ORDER}

    def exclude(pred, name):
        for s in list(remaining):
            if pred(s):
                rows[s['uuid']]['excluded_reason'] = name
                excl[name].append(rows[s['uuid']])
                remaining.remove(s)

    remaining = list(pool)
    if not include_overridden:
        exclude(lambda s: bool(s['session'].get('config_overridden')), 'overridden_config')
    fps = {}
    for s in remaining:
        fp = s['session'].get('code_fingerprint') or 'none'
        fps[fp] = fps.get(fp, 0) + 1
    if fingerprint:
        want = fingerprint.lower()
        exclude(lambda s: not (s['session'].get('code_fingerprint') or '').lower().startswith(want),
                'fingerprint_mismatch')
    elif len(fps) > 1:
        warnings.append('WARNING: %d code fingerprints present (use --fingerprint): %s' % (
            len(fps), ', '.join('%s x%d' % (k[:12], v) for k, v in sorted(fps.items(), key=lambda kv: -kv[1]))))
    first = {}
    for s in sorted(remaining, key=lambda s: (rows[s['uuid']]['start_iso'], s['uuid'])):
        pid = str(rows[s['uuid']]['participant_id'] or '').strip().casefold()
        if pid:
            first.setdefault(pid, s['uuid'])
    exclude(lambda s: first.get(str(rows[s['uuid']]['participant_id'] or '').strip().casefold(),
                                s['uuid']) != s['uuid'], 'duplicate_participant')
    exclude(lambda s: s['session'].get('status') == 'practice_failed' or s['session'].get('main_done') is not True,
            'practice_failed')
    exclude(lambda s: is_incomplete(s, session_mode(s["session"])), "incomplete")
    enough_rts = lambda s: min_valid_rt(rows[s['uuid']]['stats']) >= min_valid_rt_per_cell   # noqa: E731
    april = [rows[s['uuid']] for s in remaining if (rows[s['uuid']]['accuracy'] or 0) >= APRIL_ACC and enough_rts(s)]
    for s in remaining:
        r = rows[s['uuid']]
        r['acc_perm_p'] = accuracy_perm_p(r['responses'], r['directions'], iterations,
                                          random.Random(seed + uuid_int(s['uuid'])))
    exclude(lambda s: rows[s['uuid']]['acc_perm_p'] is None or rows[s['uuid']]['acc_perm_p'] >= ALPHA_CHANCE,
            'chance_accuracy')
    exclude(lambda s: not enough_rts(s), 'min_valid_rt_per_cell')
    included = [rows[s['uuid']] for s in remaining]
    modes = sorted({r['mode'] for r in included}) or sorted({r['mode'] for r in rows.values()}) or ['face_tree']
    if len(modes) > 1:
        raise ValueError('mixed modes among included sessions: %s' % modes)
    mode = modes[0]

    def uniform(key):
        vals = sorted({str(r[key]) for r in included if r[key]})
        return vals[0] if len(vals) == 1 else ('MIXED' if vals else 'n/a')

    def tests(parts, stat_key='stats', value='drt', strict=True):
        """strict: every contrast must use exactly len(parts) participants (fixed N; SPEC 8 step 2)."""
        out = []
        for i, (label, key) in enumerate(CONTRASTS[mode]):
            out.append(group_test([p[stat_key][value].get(key) for p in parts], label, iterations, seed + i))
            if strict and out[-1]['n'] != len(parts):
                raise ValueError('contrast %r uses N=%d but %d participants are included (empty RT cell)'
                                 % (label, out[-1]['n'], len(parts)))
        return out

    eyes_list = ['grating'] if mode == 'grating' else ['open', 'blindfold']
    cells = {}
    for e in eyes_list:
        cong = [p['stats']['mean'][(e, True)] for p in included if p['stats']['mean'].get((e, True)) is not None]
        inc = [p['stats']['mean'][(e, False)] for p in included if p['stats']['mean'].get((e, False)) is not None]
        dA = [p['stats']['dA'][e] for p in included if p['stats']['dA'].get(e) is not None]
        cells[e] = {'congruent': statistics.fmean(cong) if cong else None,
                    'incongruent': statistics.fmean(inc) if inc else None,
                    'dA_pct': 100 * statistics.fmean(dA) if dA else None}
    ss, dfw = sum(p['stats']['ss'] for p in included), sum(p['stats']['dfw'] for p in included)
    main_tests = tests(included)
    # [B] has its own fixed cohort: included participants who still meet min_valid_rt_per_cell once dropped-frame
    # trials are removed. All three [B] contrasts use exactly that cohort (strict), and its N is printed.
    nodrop = [dict(p, stats=p['stats_nodrop']) for p in included
              if min_valid_rt(p['stats_nodrop']) >= min_valid_rt_per_cell]
    for (_, key), c in zip(CONTRASTS[mode], main_tests):
        if key in cells:
            cells[key].update({'drt': c['mean'], 'se': c['se']})
    return {
        'experiment': experiment, 'mode': mode, 'iterations': iterations, 'seed': seed,
        'version': uniform('version'), 'fingerprint': (fingerprint or uniform('fingerprint'))[:12],
        'n_files': info['n_files'], 'n_uuids': info['n_uuids'], 'non_participants': non_participants,
        'warnings': warnings, 'fingerprints': fps, 'fingerprint_filter': fingerprint,
        'exclusions': excl, 'included': included, 'n_included': len(included), 'rows': list(rows.values()),
        'chinrest': (sum(1 for p in included if p['chinrest_used']), len(included)),
        'rt_filter': (sum(p['stats']['n_rt'] for p in included), sum(p['stats']['n_completed'] for p in included)),
        'cells': cells, 'tests': {'main': main_tests, 'A': tests(included, value='drt_median'),
                                  'B': tests(nodrop), 'C': tests(april)},
        'n_nodrop': len(nodrop), 'nodrop_dropped': [p['participant_id'] or p['uuid'] for p in included
                                                                  if min_valid_rt(p['stats_nodrop']) < min_valid_rt_per_cell],
        'min_valid_rt_per_cell': min_valid_rt_per_cell,
        'kept_nodrop': sum(p['stats']['n_rt'] for p in nodrop), 'n_april': len(april),
        'sigma_within': math.sqrt(ss / dfw) if dfw else None,
        'signflip_branch': signflip_branch(len(included)),
        'target_n': target_n, 'interim': interim,
    }


# ----------------------------------------------------------------------------------------------- output
def _f(x, fmt, width, sign=False):
    if x is None:
        return 'n/a'.rjust(width)
    return (('%+' if sign else '%') + fmt) % x if width == 0 else ((('%+' if sign else '%') + fmt) % x).rjust(width)


TEST_HEADER = '  contrast                n   mean_ms     SE     dz       t     p_t   p_normal  p_signflip'
CELL_HEADER = '  eyes        congruent  incongruent    dRT     SE    dA(%)'


def format_tests(tests):
    lines = [TEST_HEADER]
    for c in tests:
        lines.append('  ' + c['contrast'].ljust(20) + ('%5d' % c['n']) + _f(c['mean'], '.1f', 10, True)
                     + _f(c['se'], '.1f', 7)
                     + _f(c['dz'], '.2f', 7) + _f(c['t'], '.3f', 8) + _f(c['p_t'], '.4f', 8)
                     + _f(c['p_normal'], '.4f', 10) + _f(c['p_signflip'], '.4f', 12))
    return lines


def format_report(r):
    L = ['STAR-INPERSON ANALYSIS  experiment=%s  mode=%s  version=%s  fingerprint=%s'
         % (r['experiment'], r['mode'], r['version'], r['fingerprint']),
         'files=%d unique_uuids=%d  seed=%d  iterations=%d' % (r['n_files'], r['n_uuids'], r['seed'], r['iterations']),
         'PREREGISTRATION ' + '  '.join('%s=%s' % kv for kv in PREREGISTRATION.items()),
         'EXCLUSION RULES: overridden_config, fingerprint_mismatch (with --fingerprint), duplicate_participant, '
         'practice_failed, incomplete (< trialsPerCell completed main trials in any cell), chance_accuracy '
         '(accuracy permutation p >= %s), min_valid_rt_per_cell (< %d valid RTs = correct & main & rt>%d ms & '
         '!timed_out, in any eye x congruency cell)' % (ALPHA_CHANCE, r['min_valid_rt_per_cell'], RT_FLOOR_MS)]
    used = {'iterations': r['iterations'], 'seed': r['seed'], 'target_n': r['target_n'],
            'min_valid_rt_per_cell': r['min_valid_rt_per_cell']}
    for k, v in used.items():
        if v != PREREGISTRATION[k]:
            L.append('WARNING: %s=%s differs from the PREREGISTRATION value %s' % (k, v, PREREGISTRATION[k]))
    if r['non_participants']:
        L.append('not participant sessions (never reached main_done): %d' % len(r['non_participants']))
    L += r['warnings']
    L.append('EXCLUSIONS (in order)')
    for name in EXCLUSION_ORDER:
        if name == 'fingerprint_mismatch' and not r['fingerprint_filter']:
            continue
        L.append('  %-26s%d' % (name, len(r['exclusions'][name])))
        for p in r['exclusions'][name]:
            extra = ''
            if name == 'chance_accuracy':
                extra = '  acc=%.3f perm_p=%.4f binom_p=%.4f' % (p['accuracy'] or 0, p['acc_perm_p'] or 0,
                                                                 p['acc_binom_p'] or 0)
            elif name == 'min_valid_rt_per_cell':
                extra = '  min valid RTs in a cell=%d' % min_valid_rt(p['stats'])
            L.append('      - %s  uuid=%s  start=%s%s' % (p['participant_id'] or '?', p['uuid'], p['start_iso'], extra))
    n = r['n_included']
    L.append('INCLUDED N=%d   (chinrest_used: %d/%d)' % (n, r['chinrest'][0], r['chinrest'][1]))
    if n < r['target_n'] and not r['interim']:
        bar = '!' * 88
        L += [bar, '!! WARNING: N_included=%d < pre-registered target N=%d. Stopping rule (SPEC 9): do not'
              % (n, r['target_n']), '!! interpret dRT before the target is reached. Use --interim only for'
              ' pre-registered looks.', bar]
    kept, tot = r['rt_filter']
    L.append('RT TRIAL FILTER: correct & rt>%d & !timed_out -> kept %d/%d (%s)'
             % (RT_FLOOR_MS, kept, tot, ('%.1f%%' % (100.0 * kept / tot)) if tot else 'n/a'))
    L += ['', 'CELL MEANS (ms; mean of participant means)', CELL_HEADER]
    for e, c in r['cells'].items():
        L.append('  ' + e.ljust(12) + _f(c['congruent'], '.1f', 9) + _f(c['incongruent'], '.1f', 13)
                 + _f(c.get('drt'), '.1f', 8, True) + _f(c.get('se'), '.1f', 7) + _f(c['dA_pct'], '.1f', 8, True))
    df = ('%d' % (n - 1)) if n else 'n/a'
    L += ['', 'TESTS  N=%d df=%s   primary p = sign-flip (exact if N<=20, else %d random flips)'
          % (n, df, r['iterations'])] + format_tests(r['tests']['main'])
    L += ['', 'ROBUSTNESS [A] medians'] + format_tests(r['tests']['A'])
    L += ['', 'ROBUSTNESS [B] no dropped-frame trials (N=%d, kept %d trials)' % (r['n_nodrop'], r['kept_nodrop'])]
    if r['nodrop_dropped']:
        L.append('WARNING: [B] omits %d included participant(s) with < %d valid RTs in a cell once dropped-frame '
                 'trials are removed: %s' % (len(r['nodrop_dropped']), r['min_valid_rt_per_cell'],
                                             ', '.join(map(str, r['nodrop_dropped']))))
    L += format_tests(r['tests']['B'])
    L += ['', 'ROBUSTNESS [C] April rule acc>=80%% (N=%d)' % r['n_april']] + format_tests(r['tests']['C'])
    L += ['', 'sigma_within (pooled within-cell RT SD) = %s ms' % _f(r['sigma_within'], '.1f', 0)]
    return '\n'.join(L) + '\n'


def write_csv(r, path):
    eyes = 'grating' if r['mode'] == 'grating' else 'open'
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(CSV_COLUMNS)
        for p in sorted(r['rows'], key=lambda p: (p['start_iso'], p['uuid'])):
            st = p['stats']
            m = st['mean']
            vals = [p['participant_id'], p['uuid'], p['fingerprint'], p['n_completed'], p['n_timeouts'],
                    p['accuracy'], p['acc_perm_p'], p['acc_binom_p'], p['excluded_reason'],
                    m.get((eyes, True)), m.get((eyes, False)), m.get(('blindfold', True)),
                    m.get(('blindfold', False)), st['drt'].get(eyes), st['drt'].get('blindfold'),
                    st['drt'].get('diff'), st['drt_median'].get(eyes), st['drt_median'].get('blindfold'),
                    st['dA'].get(eyes), st['dA'].get('blindfold'), st['n_rt'], st['n_dropped'],
                    p['chinrest_used'], p['refresh_hz_est'], p['ppd_css'], p['questionnaire_influence']]
            w.writerow(['' if v is None else ('%.10g' % v if isinstance(v, float) else v) for v in vals])


def build_parser():
    ap = argparse.ArgumentParser(description='Starfield in-person analysis (SPEC section 8)')
    ap.add_argument('dirs', nargs='+', metavar='DIR')
    ap.add_argument('--experiment', default='star-inperson')
    ap.add_argument('--iterations', type=int, default=ITERATIONS)
    ap.add_argument('--seed', type=int, default=SEED)
    ap.add_argument('--fingerprint', default=None, metavar='HEX')
    ap.add_argument('--include-overridden', action='store_true')
    ap.add_argument('--target-n', type=int, default=TARGET_N)
    ap.add_argument('--min-valid-rt-per-cell', type=int, default=MIN_VALID_RT_PER_CELL, metavar='K',
                    help='exclude participants with < K valid RTs in any eye x congruency cell (pre-registered: %d)'
                    % MIN_VALID_RT_PER_CELL)
    ap.add_argument('--interim', action='store_true')
    ap.add_argument('--out-csv', default=None)
    return ap


def run(argv=None):
    """Returns (report_text, results_dict, exit_code)."""
    a = build_parser().parse_args(argv)
    try:
        r = analyze(a.dirs, a.experiment, a.iterations, a.seed, a.fingerprint, a.include_overridden,
                    a.target_n, a.interim, a.min_valid_rt_per_cell)
    except ValueError as e:
        return 'ERROR: %s\n' % e, None, 2
    if a.out_csv:
        write_csv(r, a.out_csv)
    return format_report(r), r, 0


def main(argv=None):
    text, _, code = run(argv)
    if sys.stdout.isatty():
        text = '\n'.join('\033[31m%s\033[0m' % ln if ln.startswith(('WARNING', '!!', 'ERROR')) else ln
                         for ln in text.split('\n'))
    sys.stdout.write(text)
    return code


if __name__ == '__main__':
    sys.exit(main())
