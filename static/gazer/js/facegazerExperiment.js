const config = {
  experiment_name: 'gazer',
  experiment_version: '0.5',
  trialDuration: 3000, // Duration in milliseconds
  hideCursorDuringTrials: true, //show the red dot over eyes?
  numberOfImages: 8,
  numberOfTrials: 6 // We can have more images then trials, so we can randomize the images.
  // ... other config properties
};

const translations = {
  en: {
      instructionsText: "Instructions",
      instructionsP1: "In this experiment, we will use your webcam to estimate your eye position as you look at pictures.",
      instructionsP2: "You will need to keep your head still. It can be helpful to stabilize your head on a stack of books to increase accuracy.",
      instructionsP3: "Before we begin, we need to do some calibration.  Find the small green box and click on it 3 times.  This will happen several times.",
      closeButton: "Start Experiment",
      loadingImagesTitle: "Loading Images",
      loadingImages1: "10 images will be shown for 3 seconds each.  Just enjoy the images and keep still. Easy!",
      EndTitle: "All done",
      End1: "What did you notice?  Where did you tend to look?",
      End2: "We will be processing your results (anonymous eye positions) to determine where people look on average.",
      End3: "Back to Experiments"

  },
  rs: {
      instructionsText: "Instrukcije",
      instructionsP1: "U ovom eksperimentu koristićemo Vašu veb kameru da bi procenili poziciju vaših očiju dok gledate slike.",
      instructionsP2: "Moraćete da držite glavu mirno. Možeti sebi pomoći u ovome tako što ćete nasloniti glavu na gomilu knjiga kako biste povećali preciznost.",
      instructionsP3: "Pre nego što počnemo, moramo da izvršimo kalibraciju. Nađite mali zeleni okvir i kliknite na njega 3 puta. Ovo će se ponoviti nekoliko puta.",
      closeButton: "Počni Eksperiment",
      loadingImagesTitle: "Učitavanje slika",
      loadingImages1: "Videćete 10 slika, svaku u trajanju od 4 sekunde. Trudite se da budete što mirniji i da ne pomerate telo i glavu. Uživajte u slikama!",
      EndTitle: "Hvala!",
      End1: "Šta ste primetili?   U koji deo slike ste najčešće gledali?",
      End2: "Analiziraćemo rezultate kako bi utvrdili gde ljudi u proseku najčešće gledaju.",
      End3: "Povratak na eksperimente"
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
document.getElementById('instructionsP1').innerText = translations[lang].instructionsP1;
document.getElementById('instructionsP2').innerText = translations[lang].instructionsP2;
document.getElementById('instructionsP3').innerText = translations[lang].instructionsP3;
document.getElementById('closeButton').innerText = translations[lang].closeButton;
document.getElementById('loadingImagesTitle').innerText = translations[lang].loadingImagesTitle;
document.getElementById('loadingImages1').innerText = translations[lang].loadingImages1;
document.getElementById('EndTitle').innerText = translations[lang].EndTitle;
document.getElementById('End1').innerText = translations[lang].End1;
document.getElementById('End2').innerText = translations[lang].End2;
document.getElementById('End3').innerText = translations[lang].End3;
}

window.onload = function() {
    
  const lang = getLanguage(); // You need to define getLanguage() to read the 'lang' URL parameter
  updatePageContent(lang); // And define updatePageContent() to update the page's content

}

class EyeTrackingExperiment extends Experiment {


  constructor() {
    super();
    
    
    this.experimentName = config.experiment_name;

    // Experiment setup
    this.instructionEl = document.getElementById('instructions');
    this.closeButtonEl = document.getElementById('closeButton');
    this.tracker = document.getElementById('tracker');    
    this.recordData = false;

    this.calibrationClicksPerLocation = 3;
    this.calibrationLocations = 8;
    this.currentCalibrationClicks = 0;
    this.currentCalibrationLocation = 0;

    
    // Calibration
    this.calibrationLocations = [ { left: '90%', top: '10%' },
                                  { left: '30%', top: '10%' },
                                  { left: '50%', top: '50%' },
                                  { left: '10%', top: '90%' },
                                  { left: '90%', top: '90%' },
                                  { left: '30%', top: '30%' },
                                  { left: '70%', top: '70%' },
                                  { left: '50%', top: '80%' },
                                  { left: '40%', top: '20%' },
                                  { left: '20%', top: '40%' }];
    
    //this.calibrationLocations = [ { left: '90%', top: '10%' } ];
    this.gazeData = [];

    this.session = {
      version: config.experiment_version,
      startTime: new Date().toISOString(),
      calibrtaionPoints: this.calibrationLocations.length
    };
  }

  async generateTrials() {
    this.faces = [];
    for(let i = 1; i <= config.numberOfImages; i++) {
      // Pad the number with leading zeros so that it is always 3 digits
      let paddedNumber = String(i).padStart(3, '0');
      this.faces.push(`face${paddedNumber}.png`);
    }
    this.faces = shuffle(this.faces);
    this.faces = this.faces.slice(0, config.numberOfTrials); 
    this.images = [];

    const loadPromises = this.faces.map(face => {
        return new Promise((resolve, reject) => {
            let img = new Image();
            img.src = `./img/${face}`;

            img.onload = () => {

                document.getElementById("faceContainer").style.backgroundImage = `url(${img.src})`;

                this.images.push({
                    imageName: face,
                    width: img.width,
                    height: img.height
                });
                resolve();
            };

            img.onerror = () => {
                console.log(`Image ${face} could not be loaded`);
                reject(new Error(`Image ${face} could not be loaded`));
            };
        });
    });

    await Promise.all(loadPromises);
  }


  async start() {

    document.getElementById('initialInstructionSection').style.display = 'none';

    this.webgazerInstance = await webgazer.setRegression('ridge') 
      .setTracker('TFFacemesh')
      .begin();
  
    this.webgazerInstance.showVideoPreview(true) 
      .showPredictionPoints(true) 
      .applyKalmanFilter(true); 
  
    webgazer.setGazeListener(this.gazeListener.bind(this));
  
    await this.calibrate();
    await this.runTrials();

  }

  async runTrials() {
    for (const [index, trial] of this.images.entries()) {
      await this.startTrial(index);
    }
    this.showFinalInstructions();
  }
  
  showFinalInstructions() {
      document.getElementById('faceContainer').style.display = 'none';
      document.getElementById('finalInstructionsSection').style.display = 'block';
  }

  gazeListener(data, elapsedTime) {
    if (data == null) {
        return;
    }

    if (this.recordData) {
      this.gazeData.push({x: parseFloat(data.x.toFixed(2)), y: parseFloat(data.y.toFixed(2))});
    }
    
  }

  async startTrial(trialIndex) {
    // Display face
    let faceContainer = document.getElementById('faceContainer');
    console.log(`Starting trial ${trialIndex}`);
    // Add new face
    let img = document.createElement('img');
    img.src = "img/"+this.images[trialIndex].imageName;

    //faceContainer.appendChild(img);
    faceContainer.style.backgroundImage = `url(${img.src})`;

  
    // Deselect any selected element
    window.getSelection().removeAllRanges();

    // Initialize an empty array for the current trial's gaze data
    let gazeData = [];
    this.recordData = true;

    await this.endTrial(trialIndex);
  }
  
  async endTrial(trialIndex) {
    await new Promise(resolve => setTimeout(resolve, config.trialDuration));
    this.recordData = false;
    
    // Remove any previous face
    let faceContainer = document.getElementById('faceContainer');
    let imgRect, windowScrollX, windowScrollY, windowWidth, windowHeight, visibleImageWidth, visibleImageHeight;

    if (faceContainer) {
      imgRect = 0;//faceContainer.firstChild.getBoundingClientRect();
      windowScrollX = window.scrollX;
      windowScrollY = window.scrollY;
      windowWidth = window.innerWidth;
      windowHeight = window.innerHeight;
      visibleImageWidth = faceContainer.clientWidth;
      visibleImageHeight = faceContainer.clientHeight;
      while (faceContainer.firstChild) {
        faceContainer.removeChild(faceContainer.firstChild);
      }
    }
    
    
    this.saveTrialData({
      trial: trialIndex,
      image: this.images[trialIndex],
      gazeData: this.gazeData,
      layout: {
        imgRect,
        windowScroll: { x: windowScrollX, y: windowScrollY },
        windowSize: { width: windowWidth, height: windowHeight },
        visibleImageSize:{width:visibleImageWidth, height:visibleImageHeight}
      }
    });

    this.gazeData = []; //Clear it out.
  }

  end() {
    // End WebGazer
    this.session.endTime = new Date().toISOString();

    // Save all data
    this.saveData(); 
  }

  calibrate() {
    return new Promise((resolve, reject) => {
      // Reset current calibration location
      this.currentCalibrationLocation = 0;
  
      // Initialize calibrationButton if needed
      const calibrationButton = document.getElementById('calibrationButton');
  
      // Start at the first location
      calibrationButton.style.left = this.calibrationLocations[0].left;
      calibrationButton.style.top = this.calibrationLocations[0].top;
      calibrationButton.style.display = 'block';
      this.currentCalibrationClicks = 0;
      
      const calibrationClick = () => {
        webgazer.showVideoPreview(false);
        this.currentCalibrationClicks++;
        if (this.currentCalibrationClicks >= this.calibrationClicksPerLocation) {
          this.currentCalibrationClicks = 0;
          this.currentCalibrationLocation++;
          if (this.currentCalibrationLocation >=  this.calibrationLocations.length) {
              // All calibration done, hide button and remove event listener
              calibrationButton.style.display = 'none';
              calibrationButton.removeEventListener('click', this.calibrationClick);
              
              this.webgazerInstance.showPredictionPoints(!config.hideCursorDuringTrials);
              
              const loadingInstructionsSection = document.getElementById('loadingInstructionsSection');
              loadingInstructionsSection.style.display = 'block';

              this.webgazerInstance.showPredictionPoints(!config.hideCursorDuringTrials);
                  
              setTimeout(() => {
                  loadingInstructionsSection.style.display = 'none';
                  document.getElementById('faceContainer').style.display = 'block';

                  resolve();

              }, 3000);
          } else {
              // Move to the next location
              calibrationButton.style.left = this.calibrationLocations[this.currentCalibrationLocation].left;
              calibrationButton.style.top = this.calibrationLocations[this.currentCalibrationLocation].top;
          }
        }
      };
  
      calibrationButton.addEventListener('click', calibrationClick);
    });
  }

}

