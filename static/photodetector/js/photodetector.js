document.addEventListener('DOMContentLoaded', async () => {

  const body = document.getElementById('body');
  const startButton1 = document.getElementById('start-button1');

  console.log("Page elements initialized.");

  // Start button event listeners
  startButton1.addEventListener('click', async () => {
    await startSession(body, 1000);
  });
})

async function startSession(element, delay) {

  for(let i = 0; i < 5; ++i) {
    for(let j = i; j < 5; ++j) {

      // Starting color
      element.style.backgroundColor = find_color(i);
      // Wait to transition
      await new Promise(r => setTimeout(r, delay));
      // Transition to next color
      element.style.backgroundColor = find_color(j);
      // Wait for detection
      await new Promise(r => setTimeout(r, delay));
      // Return to original color at beginning of next loop
    }
  }
}

function find_color(color_code) {
  const COLOR_CODES = ['#FFFFFF','#EEEEEE', '#CBCBCB', '#9F9F9F', '#7D7D7D'];

  return COLOR_CODES[color_code];
}