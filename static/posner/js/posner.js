document.addEventListener('DOMContentLoaded', async () => {
    
  const TOTAL_TRIALS = 167;

  // EEEEEE - two common
  // CBCBCB - left uncommon
  // 9F9F9F - right uncommon
  // 7D7D7D - two uncommon
  const color_codes = ['#EEEEEE', '#CBCBCB', '#9F9F9F', '#7D7D7D'];
  

  // Load page elements
  const instructionsScreen = document.getElementById('instructions-screen');
  const startButton1 = document.getElementById('start-button1');
  const startButton2 = document.getElementById('start-button2');
  const experimentArea = document.getElementById('experiment-area');
  const pauseScreen = document.getElementById('pause-screen');
  pauseScreen.classList.add('hidden');
  const endScreen = document.getElementById('end-screen');
  const trialCounterElement = document.getElementById('trial-counter');
  const totalTrialsDisplayElement = document.getElementById('total-trials-display');
      totalTrialsDisplayElement.textContent = String(TOTAL_TRIALS);
  
  const cueDisplayElement = document.getElementById('cue-display');
  const cueShapeElement = document.getElementById('cue-shape');
  cueShapeElement.className = 'cue-element fixation-cross'; // Set to be a cross

  const leftDotElement = document.getElementById('left-dot');
  cueDisplayElement.appendChild(leftDotElement);

  const rightDotElement = document.getElementById('right-dot');
  cueDisplayElement.appendChild(rightDotElement);

  const cornerSquareElement = document.getElementById('corner-square');

  console.log("Page elements initialized.");


  // Start button event listeners
  startButton1.addEventListener('click', async () => {
    cornerSquareElement.style.backgroundColor = 'black';
    cornerSquareElement.classList.remove('hidden');
    instructionsScreen.classList.add('hidden');
    await startSession();
    pauseScreen.classList.remove('hidden');
  });

  startButton2.addEventListener('click', async () => {
    cornerSquareElement.style.backgroundColor = 'black';
    cornerSquareElement.classList.remove('hidden');
    instructionsScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    await startSession();
    pauseScreen.classList.add('hidden');
    endScreen.classList.remove('hidden');
    cornerSquareElement.classList.add('hidden');
  });


  async function startSession(trials = TOTAL_TRIALS) {
      
    cornerSquareElement.classList.remove('hidden');
  
    // Make sure experiment area is visible and cue display is ready
    if (experimentArea && cueDisplayElement && cueShapeElement) {
        experimentArea.classList.remove('hidden');
        cueDisplayElement.classList.add('hidden'); // Ensure it's hidden initially
        
        const trialOrder = generateTrialOrder();

        let trial_colors = []

        experimentUUID = generateUUID(); // From utils.js
        for (let i = 0; i < TOTAL_TRIALS; i++) {
          trial_colors.push([trialOrder[0][i] ? 'orange' : 'blue',
                             trialOrder[1][i] ? 'orange' : 'blue']);
        }

        const sessionGroup = getQueryParam('SG');

        sessionData = {
          session_uuid: experimentUUID,
          session_group: sessionGroup || 'N/A',
          experiment_name: "posner",
          experiment_version: "1.0",
          browser_data: getBrowserData(), // From utils.js
          experiment_config: {
              session_trials: TOTAL_TRIALS,
              percent_uncommon: 0.15,
              trial_colors: trial_colors,
              experiment_url: window.location.href,
              experiment_user_agent: navigator.userAgent,
              experiment_screen_resolution: `${window.screen.width}x${window.screen.height}`
        }};

        // Run trials
        await runTrials(trialOrder);

        cornerSquareElement.classList.add('hidden');

        // Send session data to server
        await sendDataToServer(sessionData, experimentUUID, "posner");
        
    } else {
        console.error("Required elements for fixation cross not found.");
    }
  }


  async function runTrials(trialOrder) {
  
    let count = 0;
    let color_code = 0;
  
    let trials = trialOrder[0].length;
  
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
  
      // Wait 500ms (fixation)
      await new Promise(r => setTimeout(r, 500));
  
      cueDisplayElement.classList.remove('hidden');        // show fixation cross
      cornerSquareElement.classList.add('hidden');      // hide corner square

      // Wait random dot delay (500-1000ms)
      const dotDelay = Math.random() * 500 + 500;
      await new Promise(r => setTimeout(r, dotDelay));
  
      // Show dots and corner square
      leftDotElement.style.display = 'block';
      rightDotElement.style.display = 'block';
      cornerSquareElement.classList.remove('hidden');
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
    for (let i = Math.ceil(0.15*TOTAL_TRIALS); i < TOTAL_TRIALS; i++) {  
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
});