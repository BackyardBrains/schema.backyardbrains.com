// text.js — every participant-facing string (SPEC §6). Neutral, paper-faithful framing only:
// no story, no catch-trial text, no mention of eyes/gaze/blindfold/attention before the questionnaire.

export const TEXT = {
  instructions1: (cfg) => `
    <h1>Moving dots task</h1>
    <p>Please rest your chin on the chinrest and keep your head still.</p>
    <p>Each trial starts with a small black dot in the centre of the screen. Look at it, and keep your eyes on the
    centre of the screen for the whole trial.</p>
    <p>Then a patch of moving dots appears. Some of the dots move together to the LEFT or to the RIGHT; the rest move
    randomly. Decide which way the dots are moving overall.</p>
    <p>Press the <b>LEFT ARROW</b> key for left, or the <b>RIGHT ARROW</b> key for right, as quickly and as accurately
    as you can.</p>
    <p>If you do not answer within ${fmtSeconds(cfg.timing.responseWindowMs)}, you will see "Too Slow!" and the
    experiment will continue.</p>
    <p>You will start with ${cfg.practice.practiceTrials} practice trials. Press SPACE to begin.</p>`,

  practiceScore: (nCorrect, n) =>
    `Practice: you got ${nCorrect} of ${n} correct (${Math.round((100 * nCorrect) / n)} %).`,
  practicePass: 'Well done. Press SPACE to continue.',
  practiceRetry: (need, n) =>
    `You need at least ${need} of ${n} correct to go on. Let's practise once more. Press SPACE to try again.`,
  practiceFinalFail: 'Thank you. That is the end of this session. Please let the experimenter know you are finished.',

  instructions2FaceTree: `
    <h1>Main task</h1>
    <p>The task is the same. In each trial, after the black dot and before the moving dots, a drawing of a head and a
    tree will appear on the screen for a moment. <b>The drawing is irrelevant to your task.</b> Your only task is to
    report the direction of the moving dots, as quickly and accurately as you can.</p>
    <p>Keep your eyes on the centre of the screen throughout each trial. There will be short breaks.</p>
    <p>Press SPACE to begin.</p>`,
  instructions2Grating: `
    <h1>Main task</h1>
    <p>The task is the same. In each trial, after the black dot and before the moving dots, a pattern of moving
    stripes will appear on the screen for a moment. <b>The stripes are irrelevant to your task.</b> Your only task is
    to report the direction of the moving dots, as quickly and accurately as you can.</p>
    <p>Keep your eyes on the centre of the screen throughout each trial. There will be short breaks.</p>
    <p>Press SPACE to begin.</p>`,

  breakScreen: (b, B) =>
    `Block ${b} of ${B} complete. Take a short rest. Press SPACE when you are ready to continue.`,
  tooSlow: 'Too Slow!',
  end: 'Thank you! The session is complete. Please let the experimenter know.',
  endPracticeFailed: 'Thank you, that is the end of the session.',
  endAborted: 'The session was ended by the experimenter.',

  questionnaire: {
    // Same questions as the 2025-26 online study's Google Form ("Backyard Brains Starfield Survey v1.8"), chosen by
    // Greg 2026-10-07 so answers compare with the online data. Two typos fixed ("effected", "How do you think does");
    // continent and Prolific fields dropped; gender gained "Other" and "Prefer not to say".
    q_purpose: 'What do you think the purpose of the experiment is?',
    q_vision: 'How do you think human vision works? Describe in detail how we are able to see.',
    q_influence: 'Do you think the faces affected your ability to determine the direction of the stars?',
    q_influence_grating: 'Do you think the moving stripes affected your ability to determine the direction of the stars?',
    q_influence_how: 'If so, how?',
    q_gender: 'Gender (optional)',
    q_age: 'Age group (optional)',
    genderOptions: [['male', 'Male'], ['female', 'Female'], ['other', 'Other'], ['prefer_not', 'Prefer not to say']],
    ageOptions: [['under_18', 'Under 18 y'], ['18_24', '18 to 24 y'], ['25_34', '25 to 34 y'], ['35_44', '35 to 44 y'],
      ['45_54', '45 to 54 y'], ['55_64', '55 to 64 y'], ['65_up', '65 and up']],
    experimenterHeading: 'Experimenter only — please hand back the keyboard',
    fixationRating: 'How well did the participant keep fixation?',
    experimenterNotes: 'Notes',
    submit: 'Submit',
  },
};

function fmtSeconds(ms) {
  const s = ms / 1000;
  return `${Number.isInteger(s) ? s : s.toFixed(1)} second${s === 1 ? '' : 's'}`;
}
