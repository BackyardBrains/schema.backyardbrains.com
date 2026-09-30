"""Acceptance tests T32-T35 (SPEC.md 10.1) for analysis/star_inperson.py, on synthetic sessions.

Run from the repo root:  python3 -m unittest tests/star-inperson/test_analysis.py -v
"""
import csv
import itertools
import os
import statistics
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'analysis'))
sys.path.insert(0, HERE)

import star_inperson as ga          # noqa: E402
import make_synthetic as ms        # noqa: E402

ITER = 2000                        # permutation iterations in tests (speed); chance exclusion still works
HEADERS = ['EXCLUSIONS (in order)', 'CELL MEANS (ms; mean of participant means)',
           '  eyes        congruent  incongruent    dRT     SE    dA(%)',
           '  contrast                n   mean_ms     SE     dz       t     p_t   p_normal  p_signflip',
           'ROBUSTNESS [A] medians', 'sigma_within (pooled within-cell RT SD) = ']


def run(dirs, *flags):
    text, res, code = ga.run(list(dirs) + ['--iterations', str(ITER)] + list(flags))
    assert code == 0, text
    return text, res


def direct_drts(gens):
    """Group mean dRT per eyes condition computed directly from the synthetic trials (final save)."""
    per = {'open': [], 'blindfold': []}
    for g in gens:
        trials = g['envelopes'][-1]['data']['trials']
        cells = {}
        for t in trials:
            if t['phase'] == 'main' and t['correct'] is True and not t['timed_out'] and t['rt_ms'] > 200:
                cells.setdefault((t['eyes_condition'], t['congruent']), []).append(t['rt_ms'])
        for e in per:
            per[e].append(statistics.fmean(cells[(e, True)]) - statistics.fmean(cells[(e, False)]))
    diff = [o - b for o, b in zip(per['open'], per['blindfold'])]
    return {'open': statistics.fmean(per['open']), 'blindfold': statistics.fmean(per['blindfold']),
            'diff': statistics.fmean(diff), 'values': per}


def printed_means(text):
    out = {}
    block = text.split('TESTS  N=')[1].split('ROBUSTNESS')[0]
    for label, key in (('open dRT vs 0', 'open'), ('blindfold dRT vs 0', 'blindfold'), ('open - blindfold', 'diff')):
        line = [ln for ln in block.splitlines() if ln.startswith('  ' + label)][0]
        n, mean = line[len('  ') + 20:].split()[:2]
        out[key] = float(mean)
        out['n_' + key] = int(n)
    return out


def reasons(res):
    return {p['uuid']: name for name, lst in res['exclusions'].items() for p in lst}


class TestAnalysis(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = self._tmp.name

    def tearDown(self):
        self._tmp.cleanup()

    def sub(self, name):
        path = os.path.join(self.dir, name)
        os.makedirs(path, exist_ok=True)
        return path

    # ------------------------------------------------------------------ T32
    def test_T32_known_drt_headers_and_signflip_branch(self):
        d30 = self.sub('n30')
        gens = ms.generate_dataset(d30, 30, drt_open=25, drt_blind=0, seed=32, sigma=100)
        text, res = run([d30])
        want = direct_drts(gens)
        self.assertEqual(res['n_included'], 30)
        got = {c_key: t['mean'] for (_, c_key), t in zip(ga.CONTRASTS['face_tree'], res['tests']['main'])}
        pr = printed_means(text)
        for k in ('open', 'blindfold', 'diff'):
            self.assertAlmostEqual(got[k], want[k], delta=0.5, msg=k)
            self.assertAlmostEqual(pr[k], want[k], delta=0.5, msg='printed ' + k)
            self.assertEqual(pr['n_' + k], 30, 'printed per-contrast N')
        self.assertTrue(text.startswith('STAR-INPERSON ANALYSIS  experiment=star-inperson  mode=face_tree  '
                                        'version=1.0.0  fingerprint=' + ms.FINGERPRINT[:12]))
        for h in HEADERS + ['TESTS  N=30 df=29', 'INCLUDED N=30   (chinrest_used: 30/30)',
                            'RT TRIAL FILTER: correct & rt>200 & !timed_out -> kept ',
                            'ROBUSTNESS [B] no dropped-frame trials (N=30, kept ', 'ROBUSTNESS [C] April rule acc>=80% (N=30)']:
            self.assertIn(h, text)
        self.assertEqual(text.count(HEADERS[3]), 4)      # main TESTS + 3 robustness blocks
        self.assertEqual(res['signflip_branch'], 'monte_carlo')
        self.assertTrue(all(t['signflip_branch'] == 'monte_carlo' for t in res['tests']['main']))
        # subset to 12 participants -> exact enumeration branch, checked against brute force over 2^12 patterns
        d12 = self.sub('n12')
        for g in gens[:12]:
            ms.write_session(d12, g)
        _, r12 = run([d12], '--interim')
        self.assertEqual(r12['n_included'], 12)
        self.assertEqual(r12['signflip_branch'], 'exact')
        t_open = r12['tests']['main'][0]
        self.assertEqual(t_open['signflip_branch'], 'exact')
        vals = [p['stats']['drt']['open'] for p in r12['included']]
        obs = abs(sum(vals))
        brute = sum(1 for s in itertools.product((1, -1), repeat=12)
                    if abs(sum(a * v for a, v in zip(s, vals))) >= obs - 12e-9) / 4096.0
        self.assertEqual(t_open['p_signflip'], brute)

    # ------------------------------------------------------------------ T33
    def test_T33_dedupe_highest_save_seq_and_partial_not_participant(self):
        g = ms.generate_session(331, participant_id='P001')
        paths = ms.write_session(self.dir, g, all_saves=True)        # setup .. block_5, main_done, final + download
        reasons_written = [e['data']['session']['save_reason'] for e in g['envelopes']]
        self.assertEqual(reasons_written[:3], ['setup', 'practice_passed', 'block_1'])
        self.assertEqual(reasons_written[-2:], ['main_done', 'final'])
        self.assertTrue(any(p.endswith('_final.json') and '_P001_' in p for p in paths))
        partial = ms.generate_session(332, participant_id='P002', stop_after='block_2')
        ms.write_session(self.dir, partial, all_saves=True)
        text, res = run([self.dir], '--interim')
        self.assertEqual(res['n_files'], len(paths) + len(partial['envelopes']))
        self.assertEqual(res['n_uuids'], 2)
        self.assertEqual(res['n_included'], 1)
        p = res['included'][0]
        self.assertEqual(p['uuid'], g['uuid'])
        self.assertEqual(p['save_seq'], g['envelopes'][-1]['data']['session']['save_seq'])
        self.assertEqual(p['save_reason'], 'final')
        self.assertEqual(res['non_participants'], [partial['uuid']])
        self.assertNotIn(partial['uuid'], reasons(res))              # not a participant, so not an exclusion
        self.assertNotIn('tie with differing trials', text)          # download copy == final POST
        self.assertIn('files=%d unique_uuids=2' % res['n_files'], text)

    def test_T33b_tie_with_differing_trials_keeps_more_and_warns(self):
        g = ms.generate_session(333, participant_id='P001')
        ms.write_session(self.dir, g)
        g['download']['data']['trials'] = g['download']['data']['trials'][:-1]   # corrupt the download copy
        ms.write_session(self.dir, dict(g, envelopes=[]), download=True)
        text, res = run([self.dir], '--interim')
        self.assertEqual(res['n_uuids'], 1)
        self.assertIn('tie with differing trials', text)
        self.assertEqual(res['included'][0]['n_completed'], 120)

    # ------------------------------------------------------------------ T34
    def test_T34_exclusions(self):
        good = ms.generate_dataset(self.dir, 3, seed=34)
        rand = ms.generate_session(358, participant_id='P010', accuracy=0.5, start_iso='2026-10-02T09:00:00.000Z')
        pfail = ms.generate_session(342, participant_id='P011', practice_fail=True,
                                    start_iso='2026-10-02T10:00:00.000Z')
        dup = ms.generate_session(343, participant_id='P001', start_iso='2026-09-30T09:00:00.000Z')  # earlier
        over = ms.generate_session(344, participant_id='P012', config_overridden=True,
                                   start_iso='2026-10-02T11:00:00.000Z')
        for g in (rand, pfail, dup, over):
            ms.write_session(self.dir, g)
        text, res = run([self.dir], '--interim')
        rs = reasons(res)
        self.assertEqual(rs[rand['uuid']], 'chance_accuracy')
        self.assertEqual(rs[pfail['uuid']], 'practice_failed')
        self.assertEqual(rs[over['uuid']], 'overridden_config')
        self.assertEqual(rs[good[0]['uuid']], 'duplicate_participant')   # later P001 excluded, earlier kept
        self.assertNotIn(dup['uuid'], rs)
        self.assertEqual({p['uuid'] for p in res['included']},
                         {dup['uuid'], good[1]['uuid'], good[2]['uuid']})
        chance = res['exclusions']['chance_accuracy'][0]
        self.assertGreaterEqual(chance['acc_perm_p'], 0.05)
        self.assertLess(chance['accuracy'], 0.55)   # seed 358 -> 60/120 correct
        self.assertTrue(all(p['acc_perm_p'] < 0.05 for p in res['included']))
        for line in ('  overridden_config         1', '  duplicate_participant     1', '  practice_failed           1',
                     '  incomplete                0', '  chance_accuracy           1',
                     '  min_valid_rt_per_cell     0'):
            self.assertIn(line, text)
        self.assertNotIn('  fingerprint_mismatch ', text)   # no exclusion row without --fingerprint
        _, res2 = run([self.dir], '--interim', '--include-overridden')
        self.assertNotIn(over['uuid'], reasons(res2))
        self.assertIn(over['uuid'], {p['uuid'] for p in res2['included']})
        self.assertEqual(res2['exclusions']['overridden_config'], [])

    def test_T34b_incomplete_fingerprint_and_banner(self):
        ms.generate_dataset(self.dir, 2, seed=35)
        short = ms.generate_session(351, participant_id='P020', trials_per_cell=30)
        env = short['envelopes'][-1]
        drop = {t['trial_id'] for t in env['data']['trials'] if t['phase'] == 'main' and t['eyes_condition'] == 'open'
                and t['congruent']}
        drop = set(sorted(drop)[:3])
        env['data']['trials'] = [t for t in env['data']['trials'] if t.get('trial_id') not in drop]
        other = ms.generate_session(352, participant_id='P021', fingerprint='ab' * 32)
        ms.write_session(self.dir, short)
        ms.write_session(self.dir, other)
        text, res = run([self.dir])
        self.assertEqual(reasons(res)[short['uuid']], 'incomplete')
        self.assertIn('WARNING: 2 code fingerprints present', text)
        self.assertIn('!! WARNING: N_included=3 < pre-registered target N=32', text)
        self.assertEqual(res['fingerprint'], 'MIXED')
        text2, res2 = run([self.dir], '--fingerprint', ms.FINGERPRINT[:12], '--interim')
        self.assertEqual(reasons(res2)[other['uuid']], 'fingerprint_mismatch')
        self.assertIn('  fingerprint_mismatch      1', text2)
        self.assertNotIn('N_included=', text2)
        self.assertEqual(res2['n_included'], 2)

    def test_T34c_production_default_iterations(self):
        """The CLI with NO --iterations override runs the pre-registered 10,000 permutations (SPEC 8 step 3)."""
        ms.generate_dataset(self.dir, 2, seed=36)
        text, res, code = ga.run([self.dir, '--interim'])
        self.assertEqual(code, 0, text)
        self.assertEqual(res['iterations'], 10000)
        self.assertEqual(ga.PREREGISTRATION['iterations'], 10000)
        self.assertIn('seed=20260929  iterations=10000', text)
        self.assertNotIn('differs from the PREREGISTRATION', text)
        self.assertEqual(res['n_included'], 2)
        for p in res['included']:     # p = (1 + hits) / (1 + 10000): a multiple of 1/10001
            self.assertAlmostEqual(p['acc_perm_p'] * 10001, round(p['acc_perm_p'] * 10001), places=6)

    def test_T34d_min_valid_rt_per_cell_exclusion_and_fixed_contrast_n(self):
        """Verification finding 1: a participant with too few valid RTs in one cell is excluded as
        min_valid_rt_per_cell, and every contrast then uses exactly the included N."""
        ms.generate_dataset(self.dir, 3, seed=37)
        empty = ms.generate_session(371, participant_id='P030', start_iso='2026-10-03T09:00:00.000Z')
        sparse = ms.generate_session(372, participant_id='P031', start_iso='2026-10-03T10:00:00.000Z')

        def make_wrong(g, n_wrong):
            k = 0
            for t in g['envelopes'][-1]['data']['trials']:
                if t['phase'] == 'main' and t['eyes_condition'] == 'open' and t['congruent'] and not t['timed_out']:
                    if k < n_wrong:
                        t['correct'] = False
                        t['response'] = 'left' if t['test_direction'] == 'right' else 'right'
                        k += 1
        make_wrong(empty, 99)      # every open-congruent trial wrong: 0 valid RTs, overall accuracy still ~70 %
        make_wrong(sparse, 20)     # <= 10 valid RTs in open-congruent
        for g in (empty, sparse):
            ms.write_session(self.dir, g)
        text, res = run([self.dir], '--interim')
        rs = reasons(res)
        self.assertEqual(rs[empty['uuid']], 'min_valid_rt_per_cell')
        self.assertEqual(rs[sparse['uuid']], 'min_valid_rt_per_cell')
        self.assertEqual(res['n_included'], 3)
        self.assertEqual(res['min_valid_rt_per_cell'], 15)
        for block in ('main', 'A', 'B', 'C'):
            self.assertEqual([t['n'] for t in res['tests'][block]], [3, 3, 3], block)
        self.assertIn('  min_valid_rt_per_cell     2', text)
        self.assertIn('min_valid_rt_per_cell (< 15 valid RTs', text)

        self.assertIn('PREREGISTRATION target_n=32  iterations=10000  seed=20260929  rt_floor_ms=200', text)
        # the threshold is a CLI flag; a lower one keeps the sparse participant but never the empty one
        text2, res2 = run([self.dir], '--interim', '--min-valid-rt-per-cell', '5')
        self.assertEqual(reasons(res2)[empty['uuid']], 'min_valid_rt_per_cell')
        self.assertNotIn(sparse['uuid'], reasons(res2))
        self.assertEqual([t['n'] for t in res2['tests']['main']], [4, 4, 4])
        self.assertIn('WARNING: min_valid_rt_per_cell=5 differs from the PREREGISTRATION value 15', text2)
        # the rule cannot be switched off (an empty cell would silently shrink a contrast's N)
        with self.assertRaises(ValueError):
            ga.analyze([self.dir], iterations=ITER, min_valid_rt_per_cell=0)

    def test_T34e_nodrop_cohort(self):
        """Round-2 finding: robustness [B] must not mix Ns. A participant whose open-congruent trials all have a
        dropped frame stays in the primary analysis but is omitted from [B] as a whole; all [B] contrasts share N."""
        ms.generate_dataset(self.dir, 4, seed=41)
        g = ms.generate_session(411, participant_id='P040', start_iso='2026-10-04T09:00:00.000Z')
        for t in g['envelopes'][-1]['data']['trials']:
            if t['phase'] == 'main' and t['eyes_condition'] == 'open' and t['congruent']:
                t['has_dropped_frame'] = True
        ms.write_session(self.dir, g)
        text, res = run([self.dir], '--interim')
        self.assertEqual(res['n_included'], 5)
        for block in ('main', 'A', 'C'):
            self.assertEqual([t['n'] for t in res['tests'][block]], [5, 5, 5], block)
        self.assertEqual([t['n'] for t in res['tests']['B']], [4, 4, 4])
        self.assertEqual(res['n_nodrop'], 4)
        self.assertEqual(res['nodrop_dropped'], ['P040'])
        self.assertEqual(res['kept_nodrop'], sum(p['stats_nodrop']['n_rt'] for p in res['included']
                                                 if p['participant_id'] != 'P040'))   # round-3: [B] cohort only
        self.assertIn('ROBUSTNESS [B] no dropped-frame trials (N=4,', text)
        self.assertIn('WARNING: [B] omits 1 included participant(s)', text)

    # ------------------------------------------------------------------ T35
    def test_T35_stats_helpers(self):
        self.assertAlmostEqual(ga.p_t(2.89, 23), 0.0083, delta=0.0002)
        self.assertAlmostEqual(ga.p_normal(1.96), 0.0500, delta=0.0005)
        self.assertEqual(ga.signflip_p([1, 2, 3], 1000, None), 0.25)
        self.assertEqual(ga.signflip_branch(3), 'exact')
        self.assertAlmostEqual(ga.p_t(12.7062, 1), 0.05, delta=1e-4)     # t_crit(.975, 1)
        self.assertAlmostEqual(ga.p_t(-2.0452, 29), 0.05, delta=1e-4)    # t_crit(.975, 29)
        self.assertAlmostEqual(ga.p_t(0.0, 10), 1.0, places=12)
        import random
        vals = [1.0] * 25                                                  # n > 20 -> Monte Carlo
        self.assertAlmostEqual(ga.signflip_p(vals, 2000, random.Random(1)), 1 / 2001.0, places=9)

    # ------------------------------------------------------------------ recovery / null / grating / csv / N=0
    def test_recovery_injected_drt(self):
        gens = ms.generate_dataset(self.dir, 30, drt_open=40, drt_blind=0, seed=7)
        _, res = run([self.dir])
        o, b, d = res['tests']['main']
        self.assertLess(abs(o['mean'] - 40), 3 * o['se'])
        self.assertLess(abs(b['mean']), 3 * b['se'])
        self.assertLess(o['p_signflip'], 0.05)
        self.assertLess(o['p_t'], 0.05)
        self.assertGreater(d['mean'], 0)
        self.assertAlmostEqual(o['mean'], direct_drts(gens)['open'], delta=1e-6)

    def test_null_no_injected_effect(self):
        ms.generate_dataset(self.dir, 30, drt_open=0, drt_blind=0, seed=8)
        _, res = run([self.dir])
        for t in res['tests']['main']:
            self.assertLess(abs(t['mean']), 2.5 * t['se'], t['contrast'])

    def test_grating_mode(self):
        gens = ms.generate_dataset(self.dir, 8, drt_open=50, seed=9, mode='grating')
        text, res = run([self.dir], '--experiment', 'star-inperson-grating', '--interim')
        self.assertEqual(res['mode'], 'grating')
        self.assertEqual(res['n_included'], 8)
        self.assertEqual([t['contrast'] for t in res['tests']['main']], ['grating dRT vs 0'])
        self.assertIn('  grating dRT vs 0', text)
        want = []
        for g in gens:
            c = {}
            for t in g['envelopes'][-1]['data']['trials']:
                if t['phase'] == 'main' and t['correct'] is True and not t['timed_out'] and t['rt_ms'] > 200:
                    c.setdefault(t['congruent'], []).append(t['rt_ms'])
            want.append(statistics.fmean(c[True]) - statistics.fmean(c[False]))
        self.assertAlmostEqual(res['tests']['main'][0]['mean'], statistics.fmean(want), delta=1e-6)

    def test_out_csv_columns(self):
        ms.generate_dataset(self.dir, 3, seed=10)
        out = os.path.join(self.sub('out'), 'pp.csv')
        run([self.dir], '--interim', '--out-csv', out)
        with open(out, newline='') as f:
            rows = list(csv.reader(f))
        self.assertEqual(rows[0], ga.CSV_COLUMNS)
        self.assertEqual(rows[0][0], 'participant_id')
        self.assertEqual(rows[0][-1], 'questionnaire_influence')
        self.assertEqual(len(rows), 4)
        self.assertEqual({r[0] for r in rows[1:]}, {'P001', 'P002', 'P003'})

    def test_empty_and_single_participant_do_not_crash(self):
        with open(os.path.join(self.dir, 'broken.json'), 'w') as f:
            f.write('{not json')
        text, res = run([self.dir])
        self.assertEqual(res['n_included'], 0)
        self.assertIn('n/a', text)
        self.assertIn('WARNING: skipped', text)
        ms.generate_dataset(self.dir, 1, seed=11)
        text, res = run([self.dir])
        self.assertEqual(res['n_included'], 1)
        self.assertIn('TESTS  N=1 df=0', text)


if __name__ == '__main__':
    unittest.main()
