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

  const leftDotElement = document.createElement('div');
  leftDotElement.style.left = 'calc(50% - 192px)';
  leftDotElement.style.width = '10px';
  leftDotElement.style.height = '10px';
  leftDotElement.style.backgroundColor = 'blue';
  leftDotElement.style.borderRadius = '50%';
  leftDotElement.style.position = 'absolute';
  leftDotElement.style.top = '50%';
  leftDotElement.style.transform = 'translateY(-50%)';
  leftDotElement.style.display = 'none'; // Hidden initially
  cueDisplayElement.appendChild(leftDotElement);

  const rightDotElement = document.createElement('div');
  rightDotElement.style.left = 'calc(50% + 192px)';
  rightDotElement.style.width = '10px';
  rightDotElement.style.height = '10px';
  rightDotElement.style.backgroundColor = 'blue';
  rightDotElement.style.borderRadius = '50%';
  rightDotElement.style.position = 'absolute';
  rightDotElement.style.top = '50%';
  rightDotElement.style.transform = 'translateY(-50%)';
  rightDotElement.style.display = 'none'; // Hidden initially
  cueDisplayElement.appendChild(rightDotElement);

  const cornerSquareElement = document.createElement('div');
  cornerSquareElement.style.position = 'fixed';
  cornerSquareElement.style.bottom = '30px';
  cornerSquareElement.style.right = '30px';
  cornerSquareElement.style.width = '100px';
  cornerSquareElement.style.height = '100px';
  cornerSquareElement.style.backgroundColor = 'black';
  cornerSquareElement.style.visibility = 'hidden';
  cornerSquareElement.style.zIndex = '2000';
  document.body.appendChild(cornerSquareElement);
  console.log("Corner square initialized.");

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
      finalTrials.push(trials);

      trials_copy = JSON.parse(JSON.stringify(trials));
      shuffle(trials_copy);
      finalTrials.push(trials_copy);  
      return finalTrials;
  }

  function trialSequence() {
      let count = 0;
      let color_code = 0;

      // Initialize trials
      const trialOrder = generateTrialOrder();

      experimentUUID = generateUUID(); // From utils.js

      const sessionData = {
          trials: trialOrder,
          experiment_name: 'posner',
          experiment_date: new Date().toISOString(),
          total_trials: TOTAL_TRIALS,
          percent_uncommon: 0.15,
          experiment_uuid: experimentUUID,
          experiment_url: window.location.href,
          experiment_user_agent: navigator.userAgent,
          experiment_screen_resolution: `${window.screen.width}x${window.screen.height}`,
      }

      // Recursive function to run the trial sequence
      function runNext() {
        // Base case
        if (count >= TOTAL_TRIALS) {
          experimentArea.classList.add('hidden');
          if (session_count === TOTAL_SESSIONS) {
            endScreen.classList.remove('hidden');
            cornerSquareElement.style.visibility = 'hidden';
          }
          else {
          pauseScreen.classList.remove('hidden');
          cornerSquareElement.style.visibility = 'hidden';
          }
          sendDataToServer(sessionData, 'posner'); // from utils.js; send json to server
          return;          // stop after 25 runs
        }
        
        color_code = 0;

        count++;
        trialCounterElement.textContent = String(count);

        // If left is uncommon, set color code to 1
        if (trialOrder[0][count-1] === 1) {
          leftDotElement.style.backgroundColor = 'orange';
          color_code = 1;
        }
        else {
          leftDotElement.style.backgroundColor = 'blue';
        }

        // Check if right is uncommon
        if (trialOrder[1][count-1] === 1) {
          rightDotElement.style.backgroundColor = 'orange';
          // If both are uncommon, set color code to 3
          if (color_code === 1) {
            color_code = 3;
          }
          // If only right is uncommon, set color code to 2
          else {
            color_code = 2;
          }
        }
        else {
          rightDotElement.style.backgroundColor = 'blue';
        }

        setTimeout(() => {
          cueDisplayElement.classList.remove('hidden');      // show fixation cross
          cornerSquareElement.style.visibility = 'hidden';    // hide corner square
    
          const dotDelay = Math.random() * 500 + 500;        // 500–1000 ms
          setTimeout(() => {
            leftDotElement.style.display = 'block';          // show dot
            rightDotElement.style.display = 'block';          // show dot
            cornerSquareElement.style.visibility = 'visible';
            cornerSquareElement.style.backgroundColor = color_codes[color_code];
    
            setTimeout(() => {
              leftDotElement.style.display = 'none';          // hide dot
              rightDotElement.style.display = 'none';          // hide dot

              setTimeout(() => {
                cueDisplayElement.classList.add('hidden');   // hide cross
                
                runNext();                                   // start next trial
              }, 250);   // 0.25 s after dot disappears
            }, 250);     // blue dot visible for 0.25 s
          }, dotDelay);  // random delay before dot appears
        }, 500);         // initial 0.5 s fixation
      }

      runNext();
    }

  function runFixationCrossSequence() {
      
      cornerSquareElement.style.visibility = 'visible';

      // Make sure experiment area is visible and cue display is ready
      if (experimentArea && cueDisplayElement && cueShapeElement) {
          experimentArea.classList.remove('hidden');
          cueDisplayElement.classList.add('hidden'); // Ensure it's hidden initially
              
          // Set up the fixation cross
          cueShapeElement.className = 'cue-element fixation-cross'; // Set to be a cross
          
          // Run trials
          trialSequence();
      
      } else {
          console.error("Required elements for fixation cross not found.");
      }
  }

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
});