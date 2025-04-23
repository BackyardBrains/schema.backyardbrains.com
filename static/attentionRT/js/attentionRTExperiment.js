let headerElement;
let timeElement;
let instructionElement;
let existingArrowIndicator;
let experiment; 
let keyboard;
let currentTime;
let timerInterval;
let startTime;   
let keydownListener;

document.addEventListener("DOMContentLoaded", function() {
  headerElement = document.getElementById('header');
  timeElement = document.getElementById('time');
  instructionElement = document.getElementById('instruction');
  keyboard = document.getElementById('keyboard');
  endpage = document.getElementById('end-page');

  // Create an instance of ReactionTimeExperiment
  experiment = new AttentionRTExperiment();
});

const translations = {
  en: {
    instructionsText: "Attention Reaction Time",
    instructionsP1: "Place your hands like this then press the <span class='badge badge-secondary'>Space Bar</span>",
    part1instr: "Part 1: Press the green key as fast as you can!",
    part2instr: "Part 2: The yellow arrow now indicates which key will turn green. Focus there.",
    colorWarning: "(Wait for the button to change color)",
    graphTitle: "Average reaction time (ms)",
    cuedTitle: "Cued (With attention)",
    uncuedTitle: "Uncued (Without attention)",
    gameOver: "Game over! Here are your average reaction times:",
    buttonText: "Back to Experiments"
  },
  rs: {
    instructionsText: "Vreme reakcije vezane za pažnju",
    instructionsP1: "Postavite ruke kao na slici i pritisnite razmak <span class='badge badge-secondary'>Space Bar</span> na tastaturi.",
    part1instr: "Deo 1: Pritisnite zeleni taster što je brže moguće!",
    part2instr: "Deo 2: Žuta strelica pokazuje koji taster će promeniti boju u zelenu. Fokusirajte se na strelicu.",
    colorWarning: "(Sacekaj da taster promeni boju)",
    graphTitle: "Prosečno vreme reakcije (ms)",
    cuedTitle: "Sa sugestijom (Sa pažnjom)",
    uncuedTitle: "Bez sugestije (Bez pažnje)",
    gameOver: "Kraj igre! Evo vaših prosečnih vremena reakcije:",
    buttonText: "Nazad na eksperimente"
  }
};

function getLanguage() {
  const urlSearchParams = new URLSearchParams(window.location.search);
  return urlSearchParams.get('lang') || 'en'; // Default to English if no parameter found
}

function updatePageContent(lang) {
  document.getElementById('instructionsText').innerText = translations[lang].instructionsText;
  document.getElementById('instructionsP1').innerHTML = translations[lang].instructionsP1;
  document.getElementById('handImg').src = `./img/Hand_${lang}.png`;
  document.getElementById('start-button').innerText = translations[lang].buttonText;
}

window.onload = function() {
  const lang = getLanguage();
  updatePageContent(lang);
};

class AttentionRTExperiment extends Experiment {

  constructor() {
    super(); 
    this.lang = getLanguage();

    // Different keyboard sets for English / Serbian
    if (this.lang == 'rs') {
      this.keys = ['A', 'S', 'D', 'F', 'H', 'J', 'K', 'L'];
    } else {
      this.keys = ['A', 'S', 'D', 'F', 'J', 'K', 'L', ';'];
    }

    this.leftKeys = this.keys.slice(0, 4);
    this.rightKeys = this.keys.slice(4);
      
    this.UUID = generateUUID();
    this.experimentName = 'rt';
    this.currentTarget = '';
  }

  start() {
    // Build the keyboard UI
    let leftHand = document.createElement('span');
    leftHand.className = 'left-hand';
    this.leftKeys.forEach((key) => {
      const keyElement = document.createElement('div');
      keyElement.className = 'key d-inline-block text-center border m-2 p-4';
      keyElement.textContent = key;
      keyElement.id = key;
      leftHand.appendChild(keyElement);
    });
    keyboard.appendChild(leftHand);

    // A spacer
    let spacer = document.createElement('span');
    spacer.className = 'spacer';
    keyboard.appendChild(spacer);

    // Right hand keys
    let rightHand = document.createElement('span');
    rightHand.className = 'right-hand';
    this.rightKeys.forEach((key) => {
      const keyElement = document.createElement('div');
      keyElement.className = 'key d-inline-block text-center border m-2 p-4';
      keyElement.textContent = key;
      keyElement.id = key;
      rightHand.appendChild(keyElement);
    });
    keyboard.appendChild(rightHand);
  }

  generateTrials(numTrials) {
    const trials = [];
    // Randomly pick keys for each trial
    for(let i = 0; i < numTrials; i++) {
      const key = this.keys[Math.floor(Math.random() * this.keys.length)];
      trials.push({key});
    }
    // First half is 'uncued', second half 'cued'
    for(let i = 0; i < numTrials/2; i++) {
      trials[i].condition = 'uncued';
    }
    for(let i = numTrials/2; i < numTrials; i++) {
      trials[i].condition = 'cued';
    }
    return trials;
  }

  startTrial(condition, key) {
    // Keep track of which key should highlight
    this.currentTarget = key;
    instructionElement.textContent = ".";
  
    // We'll use a Promise so we can `await experiment.startTrial(...)`
    // in your main experiment loop.
    if (condition === "uncued") {
      headerElement.textContent = translations[this.lang].part1instr;
      return new Promise(resolve => {
        // Wait 2 seconds, then highlight key
        setTimeout(() => {
          document.getElementById(key).classList.add('highlight');
  
          // (1) Record startTime once the key is highlighted
          startTime = performance.now();
  
          // (2) Listen for the correct key
          document.removeEventListener('keydown', keydownListener);
          keydownListener = (event) => {
            const highlighted = document.querySelector('.highlight');
            if (!highlighted) {
              instructionElement.textContent = translations[this.lang].colorWarning;
              return;
            }
            // Must match the target key
            if (event.key.toUpperCase() === this.currentTarget) {
              let endTime = performance.now();
              let reactionTime = endTime - startTime;
  
              // Clear highlight from all keys
              for (let k of experiment.keys) {
                document.getElementById(k).classList.remove('highlight');
              }
  
              // (3) Only now, at the end, do we display the final RT
              // (instead of live-updating during the trial)
              if (this.lang == 'rs') {
                timeElement.textContent = `Vreme: ${(reactionTime / 1000).toFixed(3)} sekundi`;
              } else {
                timeElement.textContent = `Time: ${(reactionTime / 1000).toFixed(3)} seconds`;
              }
  
              resolve(reactionTime);
            }
          };
          document.addEventListener('keydown', keydownListener);
  
        }, 2000);
      });
    } else {
      // 'cued'
      headerElement.textContent = translations[this.lang].part2instr;
      return new Promise(resolve => {
        setTimeout(() => {
          document.getElementById(key).classList.add('arrow-up');
          // After 3 more seconds, highlight the key
          setTimeout(() => {
            document.getElementById(key).classList.add('highlight');
            startTime = performance.now();
  
            document.removeEventListener('keydown', keydownListener);
            keydownListener = (event) => {
              const highlighted = document.querySelector('.highlight');
              if (!highlighted) {
                instructionElement.textContent = translations[this.lang].colorWarning;
                return;
              }
              if (event.key.toUpperCase() === this.currentTarget) {
                let endTime = performance.now();
                let reactionTime = endTime - startTime;
  
                // Remove highlight/arrow-up
                for (let k of experiment.keys) {
                  document.getElementById(k).classList.remove('highlight');
                }
                let arrow = document.querySelector('.arrow-up');
                if (arrow) arrow.classList.remove('arrow-up');
  
                // Show final RT once
                if (this.lang == 'rs') {
                  timeElement.textContent = `Vreme: ${(reactionTime / 1000).toFixed(3)} sekundi`;
                } else {
                  timeElement.textContent = `Time: ${(reactionTime / 1000).toFixed(3)} seconds`;
                }
  
                resolve(reactionTime);
              }
            };
            document.addEventListener('keydown', keydownListener);
  
          }, 3000);
        }, 2000);
      });
    }
  }

  saveData() {
    let data = {
      session: this.session,
      trials: this.trials
    };
    sendDataToServer(data, this.UUID, this.experimentName); 
    this.endGame();
  }

  endGame() {
    headerElement.style.display = 'none';
    timeElement.style.display = 'none';
    keyboard.style.display = 'none';
    endpage.style.display = 'block';

    instructionElement.textContent = translations[this.lang].gameOver;
    document.getElementById('chart').classList.remove('d-none');
    document.removeEventListener('keydown', keydownListener);

    // Separate trials by condition
    const cuedTrials = this.trials.filter(trial => trial.condition === 'cued');
    const uncuedTrials = this.trials.filter(trial => trial.condition === 'uncued');

    // Compute averages
    const averageCued = cuedTrials.reduce((acc, t) => acc + t.rt, 0) / cuedTrials.length;
    const averageUncued = uncuedTrials.reduce((acc, t) => acc + t.rt, 0) / uncuedTrials.length;

    let ctx = document.getElementById('chart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: [
          translations[this.lang].uncuedTitle, 
          translations[this.lang].cuedTitle
        ],
        datasets: [{
          label: translations[this.lang].graphTitle,
          data: [averageUncued, averageCued],
          backgroundColor: [
            'rgba(255, 99, 132, 0.2)',
            'rgba(54, 162, 235, 0.2)'
          ],
          borderColor: [
            'rgba(255, 99, 132, 1)',
            'rgba(54, 162, 235, 1)'
          ],
          borderWidth: 1
        }]
      },
      options: { scales: { y: { beginAtZero: true } } }
    });
  }
}