document.addEventListener('DOMContentLoaded', async () => {

  const body = document.getElementById('body');
  const startButton1 = document.getElementById('start-button1');

  console.log("Page elements initialized.");

  const delays = [500, 250, 100, 50]

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

async function startSession(element, delay) {

  let trial_n = 100;
  eventOrder = []
  
  console.log(`Delay: ${delay} ms`)

  for(let trial = 0; trial < trial_n; ++trial) {

    let color_idx = shuffleArray([0,1,2,3,4]);

    for(let i = 0; i < 4; ++i) {
      for(let j = i+1; j < 5; ++j) {

        // Starting color
        element.style.backgroundColor = find_color(color_idx[i]);
        eventOrder.push(color_idx[i]+1);
        // Wait to transition
        await new Promise(r => setTimeout(r, delay));
        // Transition to next color
        element.style.backgroundColor = find_color(color_idx[j]);
        eventOrder.push(color_idx[j]+1);
        // Wait for detection
        await new Promise(r => setTimeout(r, delay));
        // Return to original color at beginning of next loop
      }
    }

    console.log(`Completed trial ${trial+1} out of ${trial_n}.`)
  }

  const experimentUUID = generateUUID();
  const dataToSend = {
    hightime: delay,
    eventOrder: eventOrder
  }
  sendDataToServer(dataToSend, experimentUUID, "photodetector");
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