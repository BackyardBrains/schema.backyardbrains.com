let headerElement;
let timeElement;
let instructionElement;
let existingArrowIndicator;
let experiment; 
let keyboard;
let currentTime, timerInterval;
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

console.log("Language set to: ", lang); // Debugging line
//console.log("Translations for language: ", translations[lang]); // Debugging line

document.getElementById('instructionsText').innerText = translations[lang].instructionsText;
document.getElementById('instructionsP1').innerHTML = translations[lang].instructionsP1;
document.getElementById('handImg').src = `./img/Hand_${lang}.png`;
document.getElementById('start-button').innerText = translations[lang].buttonText;

}

window.onload = function() {
    
  const lang = getLanguage(); // You need to define getLanguage() to read the 'lang' URL parameter
  updatePageContent(lang); // And define updatePageContent() to update the page's content

}

class AttentionRTExperiment extends Experiment {

  constructor() {
    super(); 

    this.lang = getLanguage();

    if (this.lang == 'rs') {
      this.keys = ['A', 'S', 'D', 'F', 'H', 'J', 'K', 'L']; /* 'Č' */
    } else {
      this.keys = ['A', 'S', 'D', 'F', 'J', 'K', 'L', ';'];
    }

    this.leftKeys = this.keys.slice(0, 4);
    this.rightKeys = this.keys.slice(4);
      
    this.UUID = generateUUID(); // Replace with a function call when in an app.
    this.experimentName = 'rt';
    this.currentTarget = '';
  }


  start() {

    //Left Hand
    let handKeyboard = document.createElement('span');
    handKeyboard.className = 'left-hand'; 
    this.leftKeys.forEach((key) => {
      const keyElement = document.createElement('div');
      keyElement.className = 'key d-inline-block text-center border m-2 p-4';
      keyElement.textContent = key;
      keyElement.id = key;
      handKeyboard.appendChild(keyElement);
    });
    keyboard.appendChild(handKeyboard);
    
    //Add some space for visual improvements
    handKeyboard = document.createElement('span');
    handKeyboard.className = 'spacer'; 
    keyboard.appendChild(handKeyboard);

    //Right Hand
    handKeyboard = document.createElement('span');
    handKeyboard.className = 'right-hand'; 
    this.rightKeys.forEach((key) => {
      const keyElement = document.createElement('div');
      keyElement.className = 'key d-inline-block text-center border m-2 p-4';
      keyElement.textContent = key;
      keyElement.id = key;
      handKeyboard.appendChild(keyElement);
     
    });
    keyboard.appendChild(handKeyboard);

  

  }

  generateTrials(numTrials) {

    const trials = [];
    
    // Generate keys
    for(let i = 0; i < numTrials; i++) {
      const key = this.keys[Math.floor(Math.random() * this.keys.length)];
      trials.push({key});
    }
  
    // Mark first half as uncued
    for(let i = 0; i < numTrials/2; i++) {
      trials[i].condition = 'uncued';
    }
  
    // Mark second half as cued
    for(let i = numTrials/2; i < numTrials; i++) {
      trials[i].condition = 'cued';
    }
  
    return trials;
  
  }

  startTrial(condition, key) {
    this.currentTarget = key
    console.log(condition + " - " + this.currentTarget)
    instructionElement.textContent = ".";

    if (condition == "uncued") {
      headerElement.textContent = translations[this.lang].part1instr;
      setTimeout(() => {
      document.getElementById(key).classList.add('highlight');
     
      startTime = new Date();
      timerInterval = setInterval(() => {
            currentTime = new Date();
            if (this.lang == 'rs') {
              timeElement.textContent = `Vreme:  ${(currentTime - startTime)/ 1000} sekundi`;
            } else {
              timeElement.textContent = `Time: ${(currentTime - startTime)/ 1000} seconds`;
            }
          }, 100);
        },2000);
    } else {
      // 'cued'
      headerElement.textContent = translations[this.lang].part2instr;
        
      setTimeout(() => {
        
        //const arrowIndicator = document.createElement('span');
        //arrowIndicator.classList.add('arrow-up');
        document.getElementById(key).classList.add('arrow-up');
        //document.getElementById(key).appendChild(arrowIndicator);

        setTimeout(() => {
            document.getElementById(key).classList.add('highlight');
            startTime = new Date();
            timerInterval = setInterval(() => {
                        currentTime = new Date();
                        if (this.lang == 'rs') {
                          timeElement.textContent = `Vreme:  ${(currentTime - startTime)/ 1000} sekundi`;
                        } else {
                          timeElement.textContent = `Time: ${(currentTime - startTime)/ 1000} seconds`;
                        }
                    }, 100);
                }, 3000);
            }, 2000);
    }
 

    return new Promise(resolve => {

      document.removeEventListener('keydown', keydownListener);     

      keydownListener = (event) => {

        key = experiment.currentTarget
        console.log(key + " was pressed")
        if (!document.querySelector('.highlight')) {
          instructionElement.textContent = translations[this.lang].colorWarning;
          return; 
        }

          if (event.key.toUpperCase() == key) {
            
            let endTime = Date.now();
            let reactionTime = endTime - startTime;
            clearInterval(timerInterval); 
         
            for (let key of experiment.keys) {
              document.getElementById(key).classList.remove('highlight');
            }

            existingArrowIndicator = document.querySelector('.arrow-up');
            if (existingArrowIndicator) existingArrowIndicator.classList.remove('arrow-up');
      
            resolve(reactionTime);

          }
        } 

        document.addEventListener('keydown', keydownListener);     

    });

 } 
 
  saveData() {
    // save trial data
    let data = {session: this.session, 
        trials: this.trials };
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

    const cuedTrials = this.trials.filter(trial => trial.condition === 'cued');
    const uncuedTrials = this.trials.filter(trial => trial.condition === 'uncued');
  
    const averageCued = cuedTrials.reduce((acc, trial) => acc + trial.rt, 0) / cuedTrials.length;
    const averageUncued = uncuedTrials.reduce((acc, trial) => acc + trial.rt, 0) / uncuedTrials.length;
  
    let averageTimes = [averageUncued, averageCued];
  
    let ctx = document.getElementById('chart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [translations[this.lang].uncuedTitle, translations[this.lang].cuedTitle],
            datasets: [{
                label: translations[this.lang].graphTitle,
                data: averageTimes,
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
        options: {
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
  }

}
