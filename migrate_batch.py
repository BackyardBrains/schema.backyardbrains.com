#!/usr/bin/env python3
"""Convert old attentionEyes download files to new format and POST them."""
import json
import re
import glob
import urllib.request

SERVER_URL = 'https://schema.backyardbrains.com/data'
BASE_DIR = '/Users/gagegreg/Documents/rhub/schema.backyardbrains.com'

def convert_and_upload(phase1_path, phase2_path, uuid):
    with open(phase1_path) as f:
        phase1 = json.load(f)
    with open(phase2_path) as f:
        phase2 = json.load(f)

    all_trials = phase1.get('trials', []) + phase2.get('trials', [])
    old_session = phase1.get('session', {})
    old_config = old_session.get('experiment_config', {})
    trials_per_phase = old_session.get('total_trials', 64)

    session = {
        'session_group': old_session.get('session_group', ''),
        'experiment_version': '2.0',
        'file_version': '2.0',
        'start_time': phase1['trials'][0]['timestamp'] if phase1.get('trials') else '',
        'migrated_from': 'attentionEyes_v1.1_download',
        'participant': old_session.get('participant', {}),
        'experiment_config': {
            'total_phases': 2,
            'trials_per_phase': trials_per_phase,
            'total_trials': trials_per_phase * 2,
            'phases': [
                {'phase': 1, 'name': 'Correct vs Scrambled',
                 'description': 'Real human attention spotlight vs randomly scrambled path'},
                {'phase': 2, 'name': 'Correct vs Mismatched',
                 'description': 'Real human attention spotlight vs real gaze path from a different image'}
            ],
            'correct_video_urls': old_config.get('correct_video_urls', []),
            'scrambled_video_urls': old_config.get('scrambled_video_urls', []),
            'mismatched_video_urls': old_config.get('mismatched_video_urls', [])
        }
    }

    payload = {
        'experiment': 'attentionModelVideo',
        'UUID': uuid,
        'data': {'session': session, 'trials': all_trials}
    }

    participant = session.get('participant', {})
    print(f"  Participant: {participant.get('name', '?')}, age {participant.get('age', '?')}")
    print(f"  Trials: {len(phase1.get('trials', []))} + {len(phase2.get('trials', []))} = {len(all_trials)}")

    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(SERVER_URL, data=data,
                                 headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())
        print(f"  -> {resp.status}: {result}\n")

# Find all phase1 files and pair with phase2
phase1_files = sorted(glob.glob(f'{BASE_DIR}/attention_eyes_phase1_results_*.json'))
already_done = ''

for p1 in phase1_files:
    uuid_match = re.search(r'([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})', p1)
    if not uuid_match:
        continue
    uuid = uuid_match.group(1)
    if uuid == already_done:
        print(f"SKIP {uuid} (already uploaded)\n")
        continue
    p2 = p1.replace('phase1', 'phase2')
    print(f"Uploading {uuid}...")
    convert_and_upload(p1, p2, uuid)

print("Done!")
