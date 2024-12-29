
// baseExperiment.js
class Experiment {

    constructor() {
      this.trials = [];
    }

    generateTrials(){
        // trail generation logic
    }
  
    start() {
      // start logic 
    }
  
    end() {
      // end logic
    }
  
    startTrial() {
      // start trial logic
    }
  
    endTrial() {
      // end trial logic 
    }
  
    saveTrialData(trialData) {
      // save trial data
      this.trials.push(trialData);
    }
  
    saveData() {
      // save all data
      let data = {session: this.session, 
                   trials: this.trials };
      sendDataToServer(data, this.UUID, this.experimentName); 

    }
  
  }