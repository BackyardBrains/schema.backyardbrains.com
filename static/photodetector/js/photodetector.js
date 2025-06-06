document.addEventListener('DOMContentLoaded', async () => {

  const body = document.getElementById('body');
  const startButton1 = document.getElementById('start-button1');

  console.log("Page elements initialized.");

  const hightimes = [250, 100, 50]

  session = 0;

  // Start button event listeners
  startButton1.addEventListener('click', async () => {
    if(session < hightimes.length)
    {
      await startSession(body, hightimes[session]);
    ++session;
    console.log(`Session ${session} Complete`);
    }
  })
});

async function startSession(element, hightime) {

  let trial_n = 100;
  eventOrder = []
  
  console.log(`Hightime: ${hightime} ms`)

  start_color = '#FFFFFF'

  for(let trial = 0; trial < trial_n; ++trial) {

    let color_idx = shuffleArray([0,1,2,3,4])
    while (start_color === find_color(color_idx[0])) {
      color_idx = shuffleArray([0,1,2,3,4])
    }

    for(let i = 0; i < 4; ++i) {
      for(let j = i+1; j < 5; ++j) {

        // Starting color
        element.style.backgroundColor = find_color(color_idx[i]);
        console.log(color_idx[i]+1);
        eventOrder.push(color_idx[i]+1);
        if (eventOrder.length > 1) {
          if(eventOrder[eventOrder.length-2]===eventOrder[eventOrder.length-1]){
            throw "Happened";
          }        
        }
        
        // Wait to transition
        await new Promise(r => setTimeout(r, hightime));
        // Transition to next color
        element.style.backgroundColor = find_color(color_idx[j]);
        console.log(color_idx[j]+1);
        eventOrder.push(color_idx[j]+1);
        // Wait for detection
        await new Promise(r => setTimeout(r, hightime));
        // Return to original color at beginning of next loop
      }
    }

    console.log(`Completed trial ${trial+1} out of ${trial_n}.`)
    start_color = find_color(color_idx[4])
  }

  const experimentUUID = generateUUID();
  const dataToSend = {
    hightime: hightime,
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