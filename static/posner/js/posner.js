document.addEventListener('DOMContentLoaded', () => {
    
  const TOTAL_TRIALS = 10;
  const TOTAL_SESSIONS = 2;

  let session_count = 0;

  // 3FFFF - two common
  // 6FFFF - left uncommon
  // CFFFF - right uncommon
  // FFFFF - two uncommon
  const color_codes = ['#333333', '#555555', '#888888', '#CCCCCC'];
  
  const instructionsScreen = document.getElementById('instructions-screen');
  const startButton1 = document.getElementById('start-button1');
  const startButton2 = document.getElementById('start-button2');
  const experimentArea = document.getElementById('experiment-area');
  const pauseScreen = document.getElementById('pause-screen');
  const endScreen = document.getElementById('end-screen');
  const trialCounterElement = document.getElementById('trial-counter');
  const totalTrialsDisplayElement = document.getElementById('total-trials-display');
      totalTrialsDisplayElement.textContent = String(TOTAL_TRIALS);
  
  const cueDisplayElement = document.getElementById('cue-display');
  const cueShapeElement = document.getElementById('cue-shape');

  const leftDotElement = document.getElementById('left-dot');
  cueDisplayElement.appendChild(leftDotElement);

  const rightDotElement = document.getElementById('right-dot');
  cueDisplayElement.appendChild(rightDotElement);

  const cornerSquareElement = document.createElement('div');
  document.body.appendChild(cornerSquareElement);
  console.log("Corner square initialized.");

  startButton1.addEventListener('click', () => {
    instructionsScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    // For now, we directly run the fixation cross sequence.
    runFixationCrossSequence();
    session_count++;
  });
  startButton2.addEventListener('click', () => {
    instructionsScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    // For now, we directly run the fixation cross sequence.
    runFixationCrossSequence();
    session_count++;
  });

  async function runFixationCrossSequence(trials = 10, sessions = 2) {
      
    cornerSquareElement.style.visibility = 'visible';
  
    // Make sure experiment area is visible and cue display is ready
    if (experimentArea && cueDisplayElement && cueShapeElement) {
        experimentArea.classList.remove('hidden');
        cueDisplayElement.classList.add('hidden'); // Ensure it's hidden initially
            
        // Set up the fixation cross
        cueShapeElement.className = 'cue-element fixation-cross'; // Set to be a cross
        
        // Run trials
        runTrials(trials, sessions);
    
    } else {
        console.error("Required elements for fixation cross not found.");
    }
  }
  
  // Randomize color appearance on left and right sides
  function generateTrialOrder() {
    let trials = [];
    let finalTrials = [];
  
    // 15% uncommon trials
    for (let i = 0; i < 0.15*TOTAL_TRIALS; i++) {
        trials.push(1);
    }
    // 85% common trials
    for (let i = 0; i < 0.85*TOTAL_TRIALS; i++) {
        trials.push(0);
    }
    
    shuffle(trials);
    // Push pushes a refernce, not a deep copy
    finalTrials.push(trials);
  
    trials_copy = JSON.parse(JSON.stringify(trials));
    shuffle(trials_copy);
    finalTrials.push(trials_copy);
  
    return finalTrials;
  }
  
  async function runTrials(trials, sessions) {
  
    let count = 0;
    let color_code = 0;
  
    // Initialize trials
    const trialOrder = generateTrialOrder();
  
    experimentUUID = generateUUID(); // From utils.js
  
    const sessionData = {
        trials: trialOrder,
        experiment_name: 'posner',
        experiment_date: new Date().toISOString(),
        total_trials: trials,
        percent_uncommon: 0.15,
        experiment_uuid: experimentUUID,
        experiment_url: window.location.href,
        experiment_user_agent: navigator.userAgent,
        experiment_screen_resolution: `${window.screen.width}x${window.screen.height}`,
    }
  
    for (; count < trials; count++) {
      color_code = 0;
      trialCounterElement.textContent = String(count + 1);
  
      // Set left dot color and color_code
      if (trialOrder[0][count] === 1) {
        leftDotElement.style.backgroundColor = 'orange';
        color_code = 1;
      } else {
        leftDotElement.style.backgroundColor = 'blue';
      }
  
      // Set right dot color and update color_code accordingly
      if (trialOrder[1][count] === 1) {
        rightDotElement.style.backgroundColor = 'orange';
        if (color_code === 1) {
          color_code = 3;
        } else {
          color_code = 2;
        }
      } else {
        rightDotElement.style.backgroundColor = 'blue';
      }
  
      cueDisplayElement.classList.remove('hidden');        // show fixation cross
      cornerSquareElement.style.visibility = 'hidden';      // hide corner square
  
      // Wait 500ms (fixation)
      await new Promise(r => setTimeout(r, 500));
  
      // Wait random dot delay (500-1000ms)
      const dotDelay = Math.random() * 500 + 500;
      await new Promise(r => setTimeout(r, dotDelay));
  
      // Show dots and corner square
      leftDotElement.style.display = 'block';
      rightDotElement.style.display = 'block';
      cornerSquareElement.style.visibility = 'visible';
      cornerSquareElement.style.backgroundColor = color_codes[color_code];
  
      // Dots visible for 250ms
      await new Promise(r => setTimeout(r, 250));
  
      // Hide dots
      leftDotElement.style.display = 'none';
      rightDotElement.style.display = 'none';
  
      // Wait 250ms after dots disappear
      await new Promise(r => setTimeout(r, 250));
  
      // Hide fixation cross
      cueDisplayElement.classList.add('hidden');
    }
  
    // After all trials
    experimentArea.classList.add('hidden');
  
    if (session_count === sessions) {
      endScreen.classList.remove('hidden');
      cornerSquareElement.style.visibility = 'hidden';
    } else {
      pauseScreen.classList.remove('hidden');
      cornerSquareElement.style.visibility = 'hidden';
    }
  
    sendDataToServer(sessionData, 'posner'); // send JSON to server
  }
});