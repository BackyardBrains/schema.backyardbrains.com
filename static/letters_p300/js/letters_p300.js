document.addEventListener('DOMContentLoaded', async () => {
    
  const TOTAL_TRIALS = 2000;
  const PERCENT_UNCOMMON = 0.05;


  const instructionsScreen = document.getElementById('instructions-screen');
  const startButton1 = document.getElementById('start-button1');
  // const startButton2 = document.getElementById('start-button2');
  const experimentArea = document.getElementById('experiment-area');
  const endScreen = document.getElementById('end-screen');
  
  const cueDisplayElement = document.getElementById('cue-display');
  const cueShapeElement = document.getElementById('cue-shape');
  cueShapeElement.className = 'cue-element fixation-cross'; // Set to be a cross

  const letterCue = document.getElementById('letter-cue');

  const cornerSquareElement = document.getElementById('corner-square');
  cornerSquareElement.classList.remove('hidden');

  console.log("Page elements initialized.");


  // Start button event listeners
  startButton1.addEventListener('click', async () => {
    instructionsScreen.classList.add('hidden');
    experimentArea.classList.remove('hidden');

    await startSession();

    experimentArea.classList.add('hidden');  
    endScreen.classList.remove('hidden');
  });


  async function startSession(n_trials = TOTAL_TRIALS) {
      
    //cornerSquareElement.classList.remove('hidden');
  
    // Make sure experiment area is visible and cue display is ready
    if (experimentArea && cueDisplayElement && cueShapeElement) { // Ensure it's hidden initially
        
        const trialOrder = generateTrialOrder(n_trials);

        let trialDataArray = [];

        experimentUUID = generateUUID(); // From utils.js

        let xCount = 0;

        for (let i = 0; i < n_trials; i++) {
          // Count Xs up to this point
          if (trialOrder[0][i] === 'X') {
            xCount++;
          }
          const event = (xCount % 2 === 0) ? 4 : 3;
          const square_color = (event === 4) ? '#9F9F9F' : '#CBCBCB';

          trialDataArray.push({
            trial_number: i + 1,
            letter: trialOrder[0][i],
            side: trialOrder[1][i],
            letter_color: trialOrder[1][i] == "left" ? "green" : "red",
            event: event,
            square_color: square_color
          });
        }

        const sessionGroup = getQueryParam('SG');

        sessionData = {
          session_uuid: experimentUUID,
          session_group: sessionGroup || 'N/A',
          experiment_name: "letters_p300",
          experiment_version: "1.0",
          browser_data: getBrowserData(), // From utils.js
          experiment_config: {
              session_trials: n_trials,
              percent_uncommon: PERCENT_UNCOMMON,
              experiment_url: window.location.href,
              experiment_user_agent: navigator.userAgent,
              experiment_screen_resolution: `${window.screen.width}x${window.screen.height}`
        }};

        cueDisplayElement.classList.remove('hidden');        // show fixation cross

        // Run trials
        await runTrials(trialOrder);
        
        // Send data to server in a consistent format
        const dataToSend = {
          session: sessionData,
          trials: trialDataArray
        };
        await sendDataToServer(dataToSend, experimentUUID, "letters_p300");
        
    } else {
        console.error("Required elements for fixation cross not found.");
    }
  }


  async function runTrials(trialOrder) {
  
    let n_trials = trialOrder[0].length;
    toggleSquare();

    for (let count = 0; count < n_trials; count++) {

      if (trialOrder[0][count] == "X") {
        toggleSquare()
      }

      const side = trialOrder[1][count];
      if (side === 'left') {
        letterCue.style.left = 'calc(50% - 192px)';
      } else {
        letterCue.style.left = 'calc(50% + 192px)';
      }
        
      letterCue.textContent = trialOrder[0][count];
      if (trialOrder[0][count] === 'X') {
        if (side === 'right') {
          letterCue.style.color = 'red';
        } else {
          letterCue.style.color = 'green';
        }
      } else {
        letterCue.style.color = 'black';
      }
      letterCue.style.display = 'block';

      // Bars visible for period of time
      await new Promise(resolve => setTimeout(resolve, 150));
      letterCue.style.display = 'none';
      await new Promise(resolve => setTimeout(resolve, 125));
      
    }
    // Wait for the last bar to flash
    await new Promise(resolve => setTimeout(resolve, 125));

    toggleSquare()
    // After all trials
    experimentArea.classList.add('hidden');
    // Hide fixation cross and corner square
    cueDisplayElement.classList.add('hidden');
  }


  // Randomize color appearance on left and right sides
  function generateTrialOrder(n_trials = TOTAL_TRIALS, percent_uncommon = PERCENT_UNCOMMON) {
      // Generate an array where PERCENT_UNCOMMON of the letters are 'X', rest are random (excluding 'X'),
      // X's are at least 8 characters apart, and no two identical letters are adjacent
      const letters = new Array(n_trials).fill(null);
      const alphabet = 'abcdefghijklmnopqrstuvwyzABCDEFGHIJKLMNOPQRSTUVWYZ';
      const n_uncommon = Math.max(1, Math.round(percent_uncommon * n_trials));
      let placed = 0;
      let placed_idxs = [];
      // Place X's with at least 8 apart
      while (placed < n_uncommon) {
        let possible = [];
        for (let i = 8; i < n_trials - 8; i++) {
          // Check if this position and the 8 before/after are not X
          let ok = true;
          for (let j = Math.max(0, i-8); j <= Math.min(n_trials-1, i+8); j++) {
            if (letters[j] === 'X') {
              ok = false;
              break;
            }
          }
          if (ok) possible.push(i);
        }
        if (possible.length === 0) break; // can't place more X's
        const idx = possible[Math.floor(Math.random() * possible.length)];
        letters[idx] = 'X';
        placed_idxs.push(idx);
        placed++;
      }
      // Fill in the rest with random letters (not X), ensuring no two identical letters are adjacent
      for (let i = 0; i < n_trials; i++) {
        if (letters[i] === null) {
          let tries = 0;
          let letter;
          do {
            const randomIndex = Math.floor(Math.random() * alphabet.length);
            letter = alphabet[randomIndex];
            tries++;
          } while (((i > 0 && letters[i-1] === letter) || (i < n_trials-1 && letters[i+1] === letter)) && tries < 100);
          letters[i] = letter;
        }
      }
      let sides = new Array(n_trials).fill(0).map(() => (Math.random() < 0.5) ? 'left' : 'right');
      // Make same number of left and right X cues
      let x_sides = new Array(placed);
      x_sides.fill("left", 0, placed/2);
      x_sides.fill("right", placed/2, placed);
      shuffle(x_sides)
      for (let i = 0; i < placed_idxs.length; i++) {
        sides[placed_idxs[i]] = x_sides[i];
      }
      return [letters, sides];
    }

  function toggleSquare() {
    let currentColor = cornerSquareElement.style.backgroundColor;
    if (!currentColor) {
        currentColor = window.getComputedStyle(cornerSquareElement).backgroundColor;
    }
    if (currentColor === "rgb(159, 159, 159)"){
      cornerSquareElement.style.backgroundColor = "rgb(203, 203, 203)";
    }
    else {
      cornerSquareElement.style.backgroundColor = "rgb(159, 159, 159)";
    }
  }
});