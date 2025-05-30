document.addEventListener('DOMContentLoaded', async () => {
    
  const TOTAL_TRIALS = 250;
  const PERCENT_UNCOMMON = 0.2;
  
  const lr = ["left", "right"];
  const colors = ["red", "blue"]

  let combos = []
  for (let i = 0; i < 2; ++i) {
    for (let j = 0; j < 2; ++j) {
      combos.push([lr[i], [colors[j]]])
    }
  }

  shuffle(combos)

  let session = 1;

  // Load page elements
  const side = document.getElementById('side');
  //const otherSide = document.getElementById('other-side');
  //let randomIndex = Math.floor(Math.random() * lr.length);
  //const sideWord = lr[randomIndex];
  //const otherSideWord = lr[(randomIndex + 1) % lr.length];

  //otherSide.textContent = otherSideWord;

  // Load page elements
  const color = document.getElementById('color');
  //const otherColor = document.getElementById('other-color');
  //randomIndex = Math.floor(Math.random() * lr.length);
  //const colorWord = colors[randomIndex];
  //const otherColorWord = lr[(randomIndex + 1) % lr.length];

  side.textContent = combos[session-1][0];
  color.textContent = combos[session-1][1];
  //otherColor.textContent = otherColorWord;

  const instructionsScreen = document.getElementById('instructions-screen');
  const startButton1 = document.getElementById('start-button1');
  // const startButton2 = document.getElementById('start-button2');
  const experimentArea = document.getElementById('experiment-area');
  const pauseScreen = document.getElementById('pause-screen');
  pauseScreen.classList.add('hidden');
  const endScreen = document.getElementById('end-screen');
  const trialCounterElement = document.getElementById('trial-counter');
  const totalTrialsDisplayElement = document.getElementById('total-trials-display');
      totalTrialsDisplayElement.textContent = String(4);
  
  const cueDisplayElement = document.getElementById('cue-display');
  const cueShapeElement = document.getElementById('cue-shape');
  cueShapeElement.className = 'cue-element fixation-cross'; // Set to be a cross

  const leftBarElement = document.getElementById('left-bar');
  cueDisplayElement.appendChild(leftBarElement);

  const rightBarElement = document.getElementById('right-bar');
  cueDisplayElement.appendChild(rightBarElement);

  const cornerSquareElement = document.getElementById('corner-square');

  console.log("Page elements initialized.");


  // Start button event listeners
  startButton1.addEventListener('click', async () => {
    instructionsScreen.classList.add('hidden');
    experimentArea.classList.remove('hidden');
    //pauseScreen.classList.add('hidden');
    await startSession();
    experimentArea.classList.add('hidden');
  
    if (session === 4) {
      endScreen.classList.remove('hidden');
    } 
    else {
      session++;
      trialCounterElement.textContent = String(session);
      side.textContent = combos[session-1][0]
      color.textContent = combos[session-1][1]
      instructionsScreen.classList.remove('hidden')
    }
  });

  // startButton2.addEventListener('click', async () => {
  //   instructionsScreen.classList.add('hidden');
  //   pauseScreen.classList.add('hidden');
  //   await startSession();
  //   pauseScreen.classList.add('hidden');
  //   endScreen.classList.remove('hidden');
  // });


  async function startSession(trials = TOTAL_TRIALS) {
      
    cornerSquareElement.classList.remove('hidden');
  
    // Make sure experiment area is visible and cue display is ready
    if (experimentArea && cueDisplayElement && cueShapeElement) { // Ensure it's hidden initially
        
        const trialOrder = generateTrialOrder();

        let trialDataArray = [];

        experimentUUID = generateUUID(); // From utils.js

        for (let i = 0; i < trials; i++) {

          const side = trialOrder[0][i] ? 'right' : 'left';
          const color = trialOrder[1][i] ? 'red' : 'blue';
          const short = trialOrder[2][i] ? 'short' : 'tall';
          
          trialDataArray.push({
            trial_number: i + 1,
            side: side,
            color: color,
            height: short,
            event: find_color_code(trialOrder[0][i], trialOrder[1][i]),
            bar_delay_ms: trialOrder[3][i]
          });
        }

        const sessionGroup = getQueryParam('SG');

        sessionData = {
          session_uuid: experimentUUID,
          session_group: sessionGroup || 'N/A',
          experiment_name: "posner",
          experiment_version: "1.0",
          browser_data: getBrowserData(), // From utils.js
          experiment_config: {
              session_trials: trials,
              percent_uncommon: PERCENT_UNCOMMON,
              experiment_url: window.location.href,
              experiment_user_agent: navigator.userAgent,
              experiment_screen_resolution: `${window.screen.width}x${window.screen.height}`
        }};

        // Run trials
        await runTrials(trialOrder);

        cornerSquareElement.classList.add('hidden');

        // Send data to server in a consistent format
        const dataToSend = {
          session: sessionData,
          trials: trialDataArray
        };
        await sendDataToServer(dataToSend, experimentUUID, "posner");
        
    } else {
        console.error("Required elements for fixation cross not found.");
    }
  }


  async function runTrials(trialOrder) {
  
    let n_trials = trialOrder[0].length;
  
    for (let count = 0; count < n_trials; count++) {
      color_code = 0;
  
      const bar = document.getElementById(trialOrder[0][count] ? 'right-bar' : 'left-bar');

      // Define bar properties by trials generated
      bar.className = `bar ${trialOrder[0][count] ? 'right-bar' : 'left-bar'} 
                  ${trialOrder[1][count] ? 'red' : 'blue'}` +
                  (trialOrder[2][count] ? ' short' : '');

      // Wait 500ms (fixation)
      //await new Promise(r => setTimeout(r, 500));
  
      cornerSquareElement.classList.add('hidden');      // hide corner square
      cueDisplayElement.classList.remove('hidden');        // show fixation cross

      // Wait random bar delay
      await new Promise(r => setTimeout(r, trialOrder[3][count]));
  
      // Show bars and corner square
      bar.style.display = 'block';
      color_code = find_color_code(trialOrder[0][count], trialOrder[1][count])
      cornerSquareElement.style.backgroundColor = find_color(color_code)
      cornerSquareElement.classList.remove('hidden');

      // Bars visible for period of time
      setTimeout(()=> bar.style.display = 'none', 32); 
  
      // Hide bars
      bar.style.display = 'hidden';
  
      // Wait 250ms after bars disappear
      await new Promise(r => setTimeout(r, 250));
    }
  
    // After all trials
    experimentArea.classList.add('hidden');
    // Hide fixation cross and corner square
    cueDisplayElement.classList.add('hidden');
  }


  // Randomize color appearance on left and right sides
  function generateTrialOrder() {
    let cl_trials = [];
    let t_trials = [];
    let delays = [];
    let finalTrials = [];
  
    // Evenly split trials between location and color
    for (let i = 0; i < 0.5*TOTAL_TRIALS; i++) {
      cl_trials.push(0);
    }
    for (let i = cl_trials.length; i < TOTAL_TRIALS; i++) {  
      cl_trials.push(1);
    }

    // 1-percent_uncommon of trials are common
    for (let i = 0; i < (1-PERCENT_UNCOMMON)*TOTAL_TRIALS; i++) {  
      t_trials.push(0);
    }
    // percent_uncommon of trials are uncommon
    for (let i = t_trials.length; i < TOTAL_TRIALS; i++) {
      t_trials.push(1);
    }

    for (let i = 0; i < TOTAL_TRIALS; i++) {
      delays.push(Math.random() * 150 + 350)
    }

    shuffle(cl_trials);

    finalTrials.push(cl_trials);
    trials_copy = JSON.parse(JSON.stringify(cl_trials));
    shuffle(trials_copy);
    finalTrials.push(trials_copy);
    
    shuffle(t_trials);
    finalTrials.push(t_trials);

    finalTrials.push(delays)
 
    return finalTrials;
  }
});

function find_color_code(right, red) {
  
  color_code = -1;
  
  // Left blue bar
  if (right === 0 && red === 0) {
    color_code = 2;
  }
  // Left red bar
  else if (right === 0 && red === 1) {
    color_code = 3;
  }
  // Right blue bar
  else if (right === 1 && red === 0) {
    color_code = 4;
  }
  // Right red bar
  else {
    color_code = 5;
  }

  return color_code;
}

function find_color(color_code) {
  const COLOR_CODES = ['#EEEEEE', '#CBCBCB', '#9F9F9F', '#7D7D7D'];

  return COLOR_CODES[color_code-2]
}