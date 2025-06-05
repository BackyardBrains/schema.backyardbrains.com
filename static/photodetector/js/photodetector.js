document.addEventListener('DOMContentLoaded', async () => {

  const body = document.getElementById('body');
  const startButton1 = document.getElementById('start-button1');

  console.log("Page elements initialized.");

  const delays = [500, 250, 100, 50, 0]

  session = 0;

  // Start button event listeners
  startButton1.addEventListener('click', async () => {
    if(session < delays.length)
    {
      await startSession(body, delays[session]);
    ++session;
    console.log(`Session ${session} Complete`);
    }
  })
});

async function startSession(element) {

  detection_period = 500
  let colors = ["one", "two", "three", "four", "five"]

  let trial_n = 100;
  let color_idx = [1,2,3,4,5];

  console.log(`Delay: ${delay} ms`)

  for(let trial = 0; trial < 100; ++trial){
    
    color_idx = shuffleArray(color_idx);

    for(let i = 0; i < 4; ++i) {
      for(let j = i+1; j < 5; ++j) {

        // Starting color
        element.style.backgroundColor = find_color(color_idx[i]);
        // Wait to transition
        await new Promise(r => setTimeout(r, delay));
        // Transition to next color
        element.style.backgroundColor = find_color(color_idx[j]);
        // Wait for detection
        await new Promise(r => setTimeout(r, detection_period));
        // Turn off color j to reveal color i
        element.classList.toggle(colors[j]);
        console.log(colors[i]);
      }

      await new Promise(r => setTimeout(r, detection_period));
      element.classList.toggle(colors[i]);
    }
    console.log(`Completed trial ${trial} out of ${trial_n}.`)
  }
}

function find_color(color_code) {
  const COLOR_CODES = ['#FFFFFF','#EEEEEE', '#CBCBCB', '#9F9F9F', '#7D7D7D'];

  return COLOR_CODES[color_code];
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}