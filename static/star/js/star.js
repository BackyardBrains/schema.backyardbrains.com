// star.js
console.log("star.js loaded");


class StarExperiment extends Experiment {
    constructor() {
        super();
        this.experimentName = "star";
        console.log("StarExperiment class instantiated");

        this.canvas = document.getElementById('stimulus-canvas');
        if (!this.canvas) {
            console.error("Canvas element not found!");
        } else {
            this.ctx = this.canvas.getContext('2d');
            console.log("Canvas context obtained");
        }

        this.startButton = document.getElementById('start-button');
        if (!this.startButton) {
            console.error("Start button not found!");
        }

        this.feedbackText = document.getElementById('feedback-text');
        this.instructions = document.getElementById('instructions');
        this.feedback = document.getElementById('feedback');
        this.endScreen = document.getElementById('end-screen');
        this.currentTrial = 0;
        this.totalTrials = 60; // 60 trials as per methods
        this.adaptDirection = null; // 'left' or 'right'
        this.testDirection = null; // 'left' or 'right'
        this.trialStartTime = 0;
        this.responseWindowOpen = false; // Flag to indicate if response window is open
        this.responseTimeout = null; // To store the timeout ID

        // Bind event listeners
        this.startButton.addEventListener('click', () => {
            console.log("Start button clicked");
            this.start();
        });
        document.addEventListener('keydown', (e) => this.handleResponse(e));
    }

    generateTrials() {
        console.log("Generating trials");
        // Generate 60 trials: 30 congruent, 30 incongruent
        const trialsPerCondition = this.totalTrials / 2;
        for (let i = 0; i < trialsPerCondition; i++) {
            // Congruent trials: Adapt and Test in same direction
            let adaptDir = Math.random() < 0.5 ? 'left' : 'right';
            let testDir = adaptDir;
            this.trials.push({
                trialIndex: this.trials.length,
                condition: 'congruent',
                adaptDirection: adaptDir,
                testDirection: testDir
            });

            // Incongruent trials: Adapt and Test in opposite directions
            adaptDir = Math.random() < 0.5 ? 'left' : 'right';
            testDir = adaptDir === 'left' ? 'right' : 'left';
            this.trials.push({
                trialIndex: this.trials.length,
                condition: 'incongruent',
                adaptDirection: adaptDir,
                testDirection: testDir
            });
        }

        // Shuffle trials to randomize order
        shuffle(this.trials);
        console.log("Trials generated and shuffled:", this.trials);
    }

    async start() {
        console.log("Starting Experiment 1");
        this.instructions.classList.remove('active');
        this.canvas.classList.add('active');
        this.generateTrials();
        this.session = generateUUID();
        console.log("Session UUID:", this.session);
        await this.startTrial();
    }
        
    async startTrial() {
        if (this.currentTrial >= this.totalTrials) {
            this.end();
            return;
        }

        let trial = this.trials[this.currentTrial];
        console.log(`Starting Trial ${this.currentTrial}:`, trial);

        this.canvas.classList.add('active');
        this.feedback.classList.remove('active');
        this.feedbackText.textContent = '';

        await this.showAdaptingStimulus(trial.adaptDirection);
        this.showTestStimulus(trial.testDirection);
    }

    
    // ORIGINAL
    // async startTrial() {
    //     if (this.currentTrial >= this.totalTrials) {
    //         this.end();
    //         return;
    //     }

    //     let trial = this.trials[this.currentTrial];
    //     console.log(`Starting Trial ${this.currentTrial}:`, trial);
    //     // Show adapting stimulus
    //     await this.showAdaptingStimulus(trial.adaptDirection);
    //     // Show test stimulus and collect response
    //     this.showTestStimulus(trial.testDirection);
    // }

    async showAdaptingStimulus(direction) {
        console.log(`Showing adapting stimulus direction: ${direction}`);
        return new Promise((resolve) => {
            // Clear canvas
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            // Draw adapting stimulus (sinusoidal grating)
            const grating = new Grating(this.ctx, this.canvas.width, this.canvas.height, direction);
            grating.start(1.5, () => { // 1.5 seconds duration
                console.log("Adapting stimulus completed");
                resolve();
            });
        });
    }
    
    showTestStimulus(direction) {
        console.log(`Showing test stimulus direction: ${direction}`);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (!this.dotMotion) {
            this.dotMotion = new RandomDotMotion(this.ctx, this.canvas.width, this.canvas.height, direction);
        }
        this.dotMotion.resetDots(direction);
        this.dotMotion.start();

        this.trialStartTime = performance.now();
        console.log("Test stimulus displayed, waiting for response");

        this.responseWindowOpen = true;

        this.responseTimeout = setTimeout(() => {
            if (this.responseWindowOpen) {
                console.log("Response window timed out. No response received.");
                this.responseWindowOpen = false;
                this.showTooSlowFeedback();
                this.currentTrial++;
                setTimeout(() => this.startTrial(), 1000);
            }
        }, 2000);
    }

    
    // ORIGINAL
    // showTestStimulus(direction) {
    //     console.log(`Showing test stimulus direction: ${direction}`);
    //     // Draw test stimulus (random dot motion)
    //     this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    //     const dotMotion = new RandomDotMotion(this.ctx, this.canvas.width, this.canvas.height, direction);
    //     dotMotion.start();
    //     // Record the time when test stimulus is shown
    //     this.trialStartTime = performance.now();
    //     console.log("Test stimulus displayed, waiting for response");

    //     // Open response window
    //     this.responseWindowOpen = true;

    //     // Set timeout for 2 seconds to handle 'Too Slow!' scenario
    //     this.responseTimeout = setTimeout(() => {
    //         if (this.responseWindowOpen) {
    //             console.log("Response window timed out. No response received.");
    //             this.responseWindowOpen = false;
    //             this.showTooSlowFeedback();
    //             this.currentTrial++;
    //             // Start next trial after short delay
    //             setTimeout(() => this.startTrial(), 1000);
    //         }
    //     }, 2000); // 2000 ms = 2 seconds
    // }

    handleResponse(e) {
        if (!this.responseWindowOpen) {
            // Ignore responses outside the response window
            return;
        }

        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const responseTime = performance.now() - this.trialStartTime;
            const responseDirection = e.key === 'ArrowLeft' ? 'left' : 'right';
            const trial = this.trials[this.currentTrial];
            const correct = responseDirection === trial.testDirection;

            // Optional: Ignore responses that are too fast (e.g., < 200 ms)
            if (responseTime < 200) {
                console.log(`Ignored response: Too fast (${responseTime.toFixed(2)} ms)`);
                return;
            }

            console.log(`Trial ${this.currentTrial}: Response - ${responseDirection}, Correct - ${correct}, RT - ${responseTime.toFixed(2)} ms`);

            this.saveTrialData({
                trialIndex: trial.trialIndex,
                condition: trial.condition,
                adaptDirection: trial.adaptDirection,
                testDirection: trial.testDirection,
                response: responseDirection,
                correct: correct,
                reactionTime: responseTime
            });

            // Provide feedback
            this.showFeedback(correct, responseTime);

            // Close response window
            this.responseWindowOpen = false;

            // Clear the timeout to prevent 'Too Slow!' feedback
            clearTimeout(this.responseTimeout);

            this.currentTrial++;
            // Start next trial after short delay
            setTimeout(() => this.startTrial(), 1000);
        }
    }

    showFeedback(correct, reactionTime) {
        console.log(`Feedback: ${correct ? 'Correct' : 'Incorrect'} - RT: ${reactionTime.toFixed(2)} ms`);
        this.canvas.classList.remove('active');
        this.feedbackText.textContent = correct ? `Correct! RT: ${reactionTime.toFixed(0)} ms` : `Incorrect! RT: ${reactionTime.toFixed(0)} ms`;
        this.feedback.classList.add('active');
        // Hide feedback after 1 second
        setTimeout(() => {
            this.feedback.classList.remove('active');
            this.canvas.classList.add('active');
        }, 1000);
    }

    showTooSlowFeedback() {
        console.log("Too Slow! Feedback displayed.");
        this.canvas.classList.remove('active');
        this.feedbackText.textContent = "Too Slow!";
        this.feedback.classList.add('active');

        setTimeout(() => {
            this.feedback.classList.remove('active');
            this.canvas.classList.add('active');
            this.startTrial();
        }, 1000);
    }
    // ORIGINAL
    // showTooSlowFeedback() {
    //     console.log("Too Slow! Feedback displayed.");
    //     this.canvas.classList.remove('active');
    //     this.feedbackText.textContent = "Too Slow!";
    //     this.feedback.classList.add('active');
    //     // Hide feedback after 5 seconds as per methods
    //     setTimeout(() => {
    //         this.feedback.classList.remove('active');
    //         this.canvas.classList.add('active');
    //     }, 5000);
    // }

    end() {
        console.log("Experiment ended");
        this.canvas.classList.remove('active');
        this.endScreen.classList.add('active');
        this.saveData();
    }
}

// Initialize Experiment 1 based on URL parameter
window.onload = () => {
    console.log("Window onload triggered");
    const urlParams = new URLSearchParams(window.location.search);
    let experimentType = urlParams.get('type');

    if (experimentType === '1' || !experimentType) { // Default to 1 if type is not specified
        console.log("Starting Experiment 1");
        const exp1 = new StarExperiment();
    } else {
        console.log("Invalid Experiment Type");
        document.getElementById('instructions').innerHTML = "<h1>Invalid Experiment Type</h1><p>Please specify a valid experiment type in the URL.</p>";
    }
};
