document.addEventListener('DOMContentLoaded', async () => {
    
  const TOTAL_TRIALS = 500;
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
  cornerSquareElement.classList.remove('hidden');

  console.log("Page elements initialized.");


  // Start button event listeners
  startButton1.addEventListener('click', async () => {
    instructionsScreen.classList.add('hidden');
    experimentArea.classList.remove('hidden');
    //pauseScreen.classList.add('hidden');
    await startSession(session,combos[session-1][0], combos[session-1][1][0]);
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


  async function startSession(session, attend_side, attend_color, n_trials = TOTAL_TRIALS) {
      
    //cornerSquareElement.classList.remove('hidden');
  
    // Make sure experiment area is visible and cue display is ready
    if (experimentArea && cueDisplayElement && cueShapeElement) { // Ensure it's hidden initially
        
        const trialOrder = generateTrialOrder(n_trials);

        let trialDataArray = [];

        experimentUUID = generateUUID(); // From utils.js

        for (let i = 0; i < n_trials; i++) {

          const side = trialOrder[0][i] ? 'right' : 'left';
          const color = trialOrder[1][i] ? 'red' : 'blue';
          const short = trialOrder[2][i] ? 'short' : 'tall';
          const event = 4 - (i % 2); // 4 if i is 0 and 3 if i is odd
          const square_color = (event === 4) ? '#9F9F9F' : '#CBCBCB';

          let code = 'C';
          if(attend_color === color) {
            code = code + '+';
          }
          else {
            code = code + '-';
          }
          code = code + 'L';
          if(attend_side === side) {
            code = code + '+';
          }
          else {
            code = code + '-';
          }

          attending = attend_side + " " + attend_color;
          
          trialDataArray.push({
            trial_number: i + 1,
            side: side,
            color: color,
            height: short,
            event: event,//find_color_code(trialOrder[0][i]),
            square_color: square_color,//find_color(find_color_code(trialOrder[0][i])),
            code: code,
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
              session_trials: n_trials,
              attending: attending,
              session: session,
              percent_uncommon: PERCENT_UNCOMMON,
              experiment_url: window.location.href,
              experiment_user_agent: navigator.userAgent,
              experiment_screen_resolution: `${window.screen.width}x${window.screen.height}`
        }};

        cueDisplayElement.classList.remove('hidden');        // show fixation cross

        // Run trials
        await runTrials(trialOrder);

        //cornerSquareElement.classList.add('hidden');
        cornerSquareElement.style.backgroundColor = '#CBCBCB';
        
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
      bar.className = `bar ${trialOrder[0][count] ? 'right-bar' : 'left-bar'}` + 
                  `${trialOrder[1][count] ? ' red' : ' blue'}` +
                  `${trialOrder[2][count] ? ' short' : ''}`;

      // Wait 500ms (fixation)
      //await new Promise(r => setTimeout(r, 500));
  
      //cornerSquareElement.classList.add('hidden');      // hide corner square

      // Wait random bar delay
      await new Promise(r => setTimeout(r, trialOrder[3][count]));
  
      // Show bars and corner square
      bar.style.display = 'block';
      if (count % 2 === 0) {
        cornerSquareElement.style.backgroundColor = '#9F9F9F';//find_color(find_color_code(trialOrder[0][count]))
      }
      else {
        cornerSquareElement.style.backgroundColor = '#CBCBCB';
      }
        

      // Bars visible for period of time
      setTimeout(()=>bar.style.display = 'none', 32); 
  
      // Hide bars
      bar.style.display = 'hidden';
  
      // Wait 250ms after bars disappear
      //await new Promise(r => setTimeout(r, 250));
      //cornerSquareElement.style.backgroundColor = '#CBCBCB';
    }
  
    // After all trials
    experimentArea.classList.add('hidden');
    // Hide fixation cross and corner square
    cueDisplayElement.classList.add('hidden');
  }


  // Randomize color appearance on left and right sides
  function generateTrialOrder(n_trials) {
    // Color and location
    let cl_trials = [];
    let delays = [];
    let finalTrials = [];

    // Evenly split trials between location and color
    for (let i = 0; i < 0.5 * n_trials; i++) {
      cl_trials.push(0);
    }
    for (let i = cl_trials.length; i < n_trials; i++) {
      cl_trials.push(1);
    }
    shuffle(cl_trials);

    // Copy and shuffle for the other dimension
    let loc_trials = JSON.parse(JSON.stringify(cl_trials));
    shuffle(loc_trials);

    // Prepare height (t_trials) stratified by (color, location)
    let t_trials = new Array(n_trials).fill(0);
    // Map from (color, location) to indices
    let group_indices = {
      '0_0': [], // color=0, loc=0
      '0_1': [],
      '1_0': [],
      '1_1': []
    };
    for (let i = 0; i < n_trials; i++) {
      let key = `${cl_trials[i]}_${loc_trials[i]}`;
      group_indices[key].push(i);
    }
    // For each group, assign PERCENT_UNCOMMON 1s, rest 0s
    for (let key in group_indices) {
      let idxs = group_indices[key];
      let n_uncommon = Math.round(PERCENT_UNCOMMON * idxs.length);
      let arr = new Array(idxs.length).fill(0);
      for (let j = 0; j < n_uncommon; j++) {
        arr[j] = 1;
      }
      shuffle(arr);
      // Assign to t_trials
      for (let j = 0; j < idxs.length; j++) {
        t_trials[idxs[j]] = arr[j];
      }
    }

    for (let i = 0; i < n_trials; i++) {
      delays.push(Math.random() * 150 + 350);
    }

    finalTrials.push(cl_trials);
    finalTrials.push(loc_trials);
    finalTrials.push(t_trials);
    finalTrials.push(delays);

    return finalTrials;
  }

// function find_color_code(right) {
  
//   color_code = -1;
  
//   // Left  bar
//   if (right === 0) {
//     color_code = 2;
//   }
//   // Left red bar
//   else if (right === 1){
//     color_code = 4;
//   }

//   return color_code;
// }

// function find_color(color_code) {
//   const COLOR_CODES = ['#FFFFFF','#EEEEEE', 'CBCBCB', '#9F9F9F', '#7D7D7D'];

//   return COLOR_CODES[color_code-1]
// }