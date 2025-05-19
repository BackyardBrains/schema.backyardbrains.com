document.addEventListener('DOMContentLoaded', () => {
    
    const TOTAL_TRIALS = 25;

    const instructionsScreen = document.getElementById('instructions-screen');
    const startButton = document.getElementById('start-button');
    const experimentArea = document.getElementById('experiment-area');
    const endScreen = document.getElementById('end-screen');
    const trialCounterElement = document.getElementById('trial-counter');
    const totalTrialsDisplayElement = document.getElementById('total-trials-display');
        totalTrialsDisplayElement.textContent = String(TOTAL_TRIALS);
    
    const cueDisplayElement = document.getElementById('cue-display');
    const cueShapeElement = document.getElementById('cue-shape');

    const blueDotElement = document.createElement('div');
        blueDotElement.className = 'cue-element blue-dot';
        blueDotElement.style.width = '10px';
        blueDotElement.style.height = '10px';
        blueDotElement.style.backgroundColor = 'blue';
        blueDotElement.style.borderRadius = '50%';
        blueDotElement.style.position = 'absolute';
        blueDotElement.style.left = 'calc(50% + 20px)'; // Position to the right of center
        blueDotElement.style.top = '50%';
        blueDotElement.style.transform = 'translateY(-50%)';
        blueDotElement.style.display = 'none'; // Hidden initially
        cueDisplayElement.appendChild(blueDotElement);

     const orangeDotElement = document.createElement('div');
         orangeDotElement.className = 'cue-element orange-dot';
         orangeDotElement.style.width = '10px';
         orangeDotElement.style.height = '10px';
         orangeDotElement.style.backgroundColor = 'orange';
         orangeDotElement.style.borderRadius = '50%';
         orangeDotElement.style.position = 'absolute';
         orangeDotElement.style.left = 'calc(50% + 20px)'; // Position to the right of center
         orangeDotElement.style.top = '50%';
         orangeDotElement.style.transform = 'translateY(-50%)';
         orangeDotElement.style.display = 'none'; // Hidden initially
         cueDisplayElement.appendChild(orangeDotElement);

    function updateTrialDisplay(count) {
        if (trialCounterElement) {
            trialCounterElement.textContent = String(count);
        }
    }

    function generateTrialOrder() {
        let trials = [];
        // 20% uncommon trials
        for (let i = 0; i < 0.1*TOTAL_TRIALS; i++) {
            trials.push([1, 'L']);
        }
        for (let i = 0; i < 0.1*TOTAL_TRIALS; i++) {
            trials.push([1, 'R']);
        }
        // 80% common trials
        for (let i = 0; i < 0.4*TOTAL_TRIALS; i++) {
            trials.push([2, 'L']);
        }
        for (let i = 0; i < 0.4*TOTAL_TRIALS; i++) {
            trials.push([2, 'R']);
        }
        shuffle(trials);
        return trials;
    }

    function trialSequence() {
        let count = 0;
      
        const trialOrder = generateTrialOrder();

        let dot = blueDotElement;

        function runNext() {
          if (count >= TOTAL_TRIALS) {
            endScreen.classList.remove('hidden');
            experimentArea.classList.add('hidden');
            return;          // stop after 25 runs
          }
          
          count++;
        
          updateTrialDisplay(count);

          if (trialOrder[count-1][0] === 1) {
            dot = orangeDotElement;
          }
          else {
            dot = blueDotElement;
          }

          if (trialOrder[count-1][1] === 'L') {
            dot.style.left = 'calc(50% - 30px)'; // Position to the left of center
          }
          else {
            dot.style.left = 'calc(50% + 20px)'; // Position to the right of center
          }

          setTimeout(() => {
            cueDisplayElement.classList.remove('hidden');      // show fixation cross
      
            const dotDelay = Math.random() * 500 + 500;        // 500–1000 ms
            setTimeout(() => {
              dot.style.display = 'block';          // show dot
      
              setTimeout(() => {
                dot.style.display = 'none';         // hide dot
      
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

    startButton.addEventListener('click', () => {
        if (instructionsScreen) {
            instructionsScreen.classList.add('hidden');
        }
        // For now, we directly run the fixation cross sequence.
        runFixationCrossSequence();
    });
});