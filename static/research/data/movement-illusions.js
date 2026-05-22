(function () {
  const nose = [
    ['Dallan', '27', 'M', 50.1, 71, 20.9, 3, 'Office', ''],
    ['Rose', '19', 'F', 180, 191, 11, 3, 'Office', 'I was very confused'],
    ['Sophia', '18', 'F', 71.4, 73.4, 2, 2, 'Office', ''],
    ['Valencia', '19', 'F', 57.8, 70, 12.2, null, 'Office', "didn't know where her nose was and moved her fingers around"],
    ['Zorica', '', 'F', 78.1, 86.9, 8.8, null, 'Office', "couldn't tell where her hand was"],
    ['Ebony', '', 'F', 66, 72.8, 6.8, null, 'Office', 'I know my finger is not that far from my nose'],
    ['Jefs', '20', 'F', 47.5, 65, 17.5, null, 'Haven Hall', "didn't know where her hand was and was surprised at the end"],
    ['Avery', '19', 'F', 71, 70.3, -0.7, null, 'Shapiro', ''],
    ['Scott', '20', 'M', 64.4, 75.3, 10.9, null, 'Shapiro', ''],
    ['Amanda', '19', 'F', 63.9, 70, 6.1, null, 'Kinesiology Building', "awkwardly embarrassed that she didn't know where her nose was"],
    ['Noah', '22', 'M', 69.6, 84.2, 14.6, null, 'Angell Hall', ''],
    ['Luis', '19', 'M', 65.3, 66, 0.7, null, 'Entrance of BYB', ''],
    ['Sanjay', '19', 'M', 73.4, 76.9, 3.5, null, 'Entrance of BYB', "confused look when his finger wasn't touching his nose"],
    ['JJB', '26', 'M', 60.4, 65.8, 5.4, null, 'Shapiro', ''],
    ['Zodiac', '', '', 77.6, 76.7, -0.9, null, 'Outside', ''],
    ['Billy', '', 'M', 56.2, 78.5, 22.3, null, 'Outside', ''],
    ['michigan sweatshirt guy', '', '', 68.4, 76.4, 8, null, 'Outside', ''],
    ['white shirt mustache', '', '', 72.5, 81.9, 9.4, null, 'Outside', ''],
    ['yellow shirt grey sweats', '', '', 70.4, 87.8, 17.4, null, 'Outside', ''],
    ['Jacob', '', 'M', 76.1, 95.3, 19.2, null, 'Outside', 'felt like hand was in his head'],
    ['Purple Sweater White', '', '', 76, 86.2, 10.2, null, 'Outside', 'confused and his face turned red'],
    ['Big Demonia Boots', '', 'F', 78.8, 90.7, 11.9, null, 'Outside', "confused and laughing because she couldn't find her nose"],
    ['Ivan', '21', 'M', 73.8, 85.3, 11.5, null, 'Outside', '']
  ].map((row, index) => ({
    id: `nose-${index + 1}`,
    participant_id: row[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    participant_name: row[0],
    age: row[1],
    sex: row[2],
    starting_angle: row[3],
    ending_angle: row[4],
    angle_difference: row[5],
    attempts: row[6],
    location: row[7],
    comments: row[8],
    source: 'google-drive',
    created_at: '2026-05-19T20:53:39Z'
  }));

  const chair = [
    ['Rose', 'bicep', 25.1], ['Rose', 'tricep', 0],
    ['Sophia', 'bicep', 0], ['Sophia', 'tricep', 16],
    ['Valencia', 'bicep', 0],
    ['Josie', 'tricep', 34.5], ['Josie', 'bicep', 0],
    ['Alex', 'tricep', 35.7], ['Alex', 'bicep', 5],
    ['Zorica', 'bicep', 0], ['Zorica', 'tricep', 0],
    ['Ebony', 'tricep', 0], ['Ebony', 'bicep', 21],
    ['old guy', 'tricep', 0], ['old guy', 'bicep', 0],
    ['Alita', 'tricep', 41.3], ['Alita', 'bicep', 36.4],
    ['Noah', 'tricep', 82], ['Noah', 'bicep', 45.3],
    ['Leah', 'tricep', 0], ['Leah', 'bicep', 90],
    ['Michigan Sweatshirt', 'tricep', 0], ['Michigan Sweatshirt', 'bicep', 19.6],
    ['Jacob', 'tricep', 0], ['Jacob', 'bicep', 0],
    ['Purple Sweater White', 'bicep', 20.27], ['Purple Sweater White', 'tricep', 15],
    ['Big Demonia', 'tricep', 55.3], ['Big Demonia', 'bicep', 90.6],
    ['Ivan', 'bicep', 0], ['Ivan', 'tricep', 0]
  ].map((row, index) => ({
    id: `chair-${index + 1}`,
    participant_name: row[0],
    tendon: row[1],
    starting_angle: 0,
    ending_angle: 0,
    actual_angle: 0,
    perceived_angle: row[1] === 'tricep' ? -row[2] : row[2],
    felt_rotation: Math.abs(row[2]) > 0,
    source: 'google-drive',
    created_at: '2026-05-19T19:07:57Z'
  }));

  const floor = [
    ['Sophia', '', 'F', 42.8, 'Y'],
    ['Rose', '19', 'F', 56.4, 'Y'],
    ['Josie', '', 'F', 57.5, 'Y'],
    ['Dee', '', 'M', 54.7, 'Y'],
    ['Ivan', '', 'M', 35.4, 'Y'],
    ['Maria', '', 'F', 21.3, 'N'],
    ['Sanya', '', 'F', 9, 'N']
  ].map((row, index) => ({
    id: `floor-${index + 1}`,
    participant_name: row[0],
    age: row[1],
    sex: row[2],
    starting_angle: 0,
    perceived_angle: row[3],
    prior_knowledge: row[4],
    source: 'google-drive',
    created_at: '2026-05-21T17:38:57Z'
  }));

  const cafe = {
    record_count: 81,
    stared_lookbacks: 29,
    control_lookbacks: 15,
    stared_only: 18,
    control_only: 4,
    discordant_subjects: 22,
    two_sided_p: 0.0043,
    one_sided_p: 0.0022,
    absolute_increase_points: 17.3,
    ci95_low_points: 6.6,
    ci95_high_points: 28.0,
    paired_odds_ratio: 4.5,
    conclusion: 'People were significantly more likely to look back when someone stared at their eyes than when the same person stared at the ground.',
    sample_rows: [
      ['Red shirt', '1 min', 'L1', 'L0', 'Ondo'],
      ['Woman in white', '1 min', 'L1', 'L0', 'Ondo'],
      ['Big black glasses, croissant lady', '30 sec', 'L3', 'L0', 'Ondo'],
      ['Woman in light yellow', '1 min', 'L2', 'L1', 'Ondo'],
      ['Green older woman', '1 min', 'L1', 'L0', 'Starbucks'],
      ['Asian with matcha', '1 min', 'L2', 'L2', 'Starbucks'],
      ['Girl in the corner', '1 min', 'L1', 'L0', 'Ondo'],
      ['Blue cyan shirt', '1 min', 'L1', 'L0', 'Starbucks'],
      ['Glasses + coffee', '1 min', 'L1', 'L1', 'Ondo'],
      ['Sweatervest', '1 min', 'L1', 'L0', 'Ondo']
    ]
  };

  window.RESEARCH_DATA = {
    ...(window.RESEARCH_DATA || {}),
    nose,
    chair,
    floor,
    cafe,
    docs: {
      noseSheet: 'https://docs.google.com/spreadsheets/d/13FRF6_zxYc20K1N2sfxAXrXpJCjtyUGvLms9Lrq8_u4/edit',
      chairSheet: 'https://docs.google.com/spreadsheets/d/1-8qq0i0yyEBAWobxoi46QqpX57Tks6spNlt6Yp0LdWo/edit',
      floorSheet: 'https://docs.google.com/spreadsheets/d/1uVGI3_ph_i9mNJEmFLoMeN-2C5oUtnb-VgbeM52eDBs/edit',
      cafeSheet: 'https://docs.google.com/spreadsheets/d/1r443t6k9NDEPnduzi068iDLIdg7wlfBk3J0ojyteigo/edit',
      overview: 'https://docs.google.com/document/d/150SNfhoW8q7IekUeknDLvmk5OuRfeP042XuX-qE4Zx0/edit'
    }
  };
})();
