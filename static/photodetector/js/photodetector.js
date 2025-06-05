document.addEventListener('DOMContentLoaded', async () => {

  const body = document.getElementById('body');
  const startButton1 = document.getElementById('start-button1');

  console.log("Page elements initialized.");

  session = 0;

  // Start button event listeners
  startButton1.addEventListener('click', async () => {
    if(session < 3)
    {
      await startSession(body);
      ++session;
    console.log(`Session ${session} Complete`);
    }
  })
});

async function startSession(element) {

  detection_period = 1000
  let colors = ["one", "two", "three", "four", "five"]

  for(let trial = 0; trial < 100; ++trial)
    for(let i = 0; i < 4; ++i) {

      // Starting color
      element.classList.toggle(colors[i]);
      console.log(colors[i]);

      for(let j = i+1; j < 5; ++j) {

        // Wait for photodetector to detect
        await new Promise(r => setTimeout(r, detection_period));
        // Transition to next color
        element.classList.toggle(colors[j])
        console.log(colors[j]);
        // Wait for detection
        await new Promise(r => setTimeout(r, detection_period));
        // Turn off new color
        element.classList.toggle(colors[j]);
        console.log(colors[i]);
      }

      await new Promise(r => setTimeout(r, detection_period));
    }
}

function find_color(color_code) {
  const COLOR_CODES = ['#FFFFFF','#EEEEEE', '#CBCBCB', '#9F9F9F', '#7D7D7D'];

  return COLOR_CODES[color_code];
}