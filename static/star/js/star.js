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
        this.UUID = generateUUID(); // Generate UUID at initialization
        
        // Summary data for visualization
        this.summary = {
            congruent: {
                correct: 0,
                incorrect: 0,
                tooSlow: 0,
                reactionTimes: []
            },
            incongruent: {
                correct: 0,
                incorrect: 0,
                tooSlow: 0,
                reactionTimes: []
            }
        };

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
        console.log("Starting Experiment");
        this.instructions.classList.remove('active');
        this.canvas.classList.add('active');
        this.generateTrials();
        
        // Set up session data
        this.session = {
            experiment_version: '1.0',
            browserData: getBrowserData(),
            startTime: new Date().toISOString()
        };
        
        console.log("Session UUID:", this.UUID);
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
        } else {
            this.dotMotion.resetDots(direction);
        }
        this.dotMotion.start();

        this.trialStartTime = performance.now();
        console.log("Test stimulus displayed, waiting for response");

        this.responseWindowOpen = true;

        // Set timeout for 2 seconds to handle 'Too Slow!' scenario
        this.responseTimeout = setTimeout(() => {
            if (this.responseWindowOpen) {
                console.log("Response window timed out. No response received.");
                this.responseWindowOpen = false;
                
                // Update summary data for too slow responses
                const condition = this.trials[this.currentTrial].condition;
                this.summary[condition].tooSlow++;
                
                // Save trial data with 'too_slow' status
                this.saveTrialData({
                    trialIndex: this.trials[this.currentTrial].trialIndex,
                    condition: this.trials[this.currentTrial].condition,
                    adaptDirection: this.trials[this.currentTrial].adaptDirection,
                    testDirection: this.trials[this.currentTrial].testDirection,
                    response: 'too_slow',
                    correct: false,
                    reactionTime: 2000 // Maximum allowed time
                });
                
                this.showTooSlowFeedback();
                this.currentTrial++;
                setTimeout(() => this.startTrial(), 1000);
            }
        }, 2000); // 2 seconds response window
    }

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

            // Update summary data
            const condition = trial.condition;
            if (correct) {
                this.summary[condition].correct++;
            } else {
                this.summary[condition].incorrect++;
            }
            this.summary[condition].reactionTimes.push(responseTime);

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
        }, 1000);
    }

    end() {
        console.log("Experiment ended");
        this.canvas.classList.remove('active');
        
        // Add summary data to session
        this.session.endTime = new Date().toISOString();
        this.session.summary = this.summary;
        
        // Create result visualization
        this.createResultGraph();
        
        this.endScreen.classList.add('active');
        this.saveData();
    }
    
    createResultGraph() {
        // Create a canvas for the results graph
        const graphCanvas = document.createElement('canvas');
        graphCanvas.id = 'results-graph';
        graphCanvas.width = 600;
        graphCanvas.height = 400;
        
        // Add it to the end screen
        const endScreenContent = document.createElement('div');
        endScreenContent.innerHTML = `
            <h3>Your Results</h3>
            <p>Average reaction times:</p>
        `;
        
        this.endScreen.appendChild(endScreenContent);
        this.endScreen.appendChild(graphCanvas);
        
        // Calculate averages
        const congruentAvgRT = this.summary.congruent.reactionTimes.length > 0 
            ? this.summary.congruent.reactionTimes.reduce((a, b) => a + b, 0) / this.summary.congruent.reactionTimes.length 
            : 0;
            
        const incongruentAvgRT = this.summary.incongruent.reactionTimes.length > 0 
            ? this.summary.incongruent.reactionTimes.reduce((a, b) => a + b, 0) / this.summary.incongruent.reactionTimes.length 
            : 0;
        
        // Calculate accuracy
        const congruentTrials = this.summary.congruent.correct + this.summary.congruent.incorrect + this.summary.congruent.tooSlow;
        const incongruentTrials = this.summary.incongruent.correct + this.summary.incongruent.incorrect + this.summary.incongruent.tooSlow;
        
        const congruentAccuracy = congruentTrials > 0 
            ? (this.summary.congruent.correct / congruentTrials) * 100 
            : 0;
            
        const incongruentAccuracy = incongruentTrials > 0 
            ? (this.summary.incongruent.correct / incongruentTrials) * 100 
            : 0;
        
        // Add numeric results
        const resultsText = document.createElement('div');
        resultsText.innerHTML = `
            <p>Congruent Trials: ${congruentAvgRT.toFixed(0)}ms (${congruentAccuracy.toFixed(1)}% correct)</p>
            <p>Incongruent Trials: ${incongruentAvgRT.toFixed(0)}ms (${incongruentAccuracy.toFixed(1)}% correct)</p>
            <p>Reaction Time Difference: ${(incongruentAvgRT - congruentAvgRT).toFixed(0)}ms</p>
        `;
        this.endScreen.appendChild(resultsText);
        
        // Draw the graph using Chart.js if available, otherwise use basic canvas
        if (typeof Chart !== 'undefined') {
            new Chart(graphCanvas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: ['Congruent', 'Incongruent'],
                    datasets: [{
                        label: 'Average Reaction Time (ms)',
                        data: [congruentAvgRT, incongruentAvgRT],
                        backgroundColor: [
                            'rgba(75, 192, 192, 0.6)',
                            'rgba(255, 99, 132, 0.6)'
                        ],
                        borderColor: [
                            'rgba(75, 192, 192, 1)',
                            'rgba(255, 99, 132, 1)'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    },
                    plugins: {
                        title: {
                            display: true,
                            text: 'Average Reaction Time by Condition'
                        }
                    }
                }
            });
        } else {
            // Fallback to basic canvas drawing if Chart.js isn't available
            const ctx = graphCanvas.getContext('2d');
            
            // Clear the canvas
            ctx.clearRect(0, 0, graphCanvas.width, graphCanvas.height);
            
            // Set up the bar chart
            const barWidth = 120;
            const spacing = 80;
            const maxHeight = 300;
            const startX = 150;
            const startY = 350;
            
            // Scale factor - max RT should be about 1000ms
            const scaleFactor = maxHeight / 1000;
            
            // Draw axis
            ctx.beginPath();
            ctx.moveTo(50, 50);
            ctx.lineTo(50, startY);
            ctx.lineTo(550, startY);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Draw y-axis labels (reaction time)
            for (let i = 0; i <= 1000; i += 200) {
                const y = startY - i * scaleFactor;
                ctx.fillStyle = '#000';
                ctx.font = '14px Arial';
                ctx.textAlign = 'right';
                ctx.fillText(i + 'ms', 45, y);
                
                // Draw horizontal grid line
                ctx.beginPath();
                ctx.moveTo(50, y);
                ctx.lineTo(550, y);
                ctx.strokeStyle = '#ccc';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            
            // Draw bars
            // Congruent bar
            ctx.fillStyle = 'rgba(75, 192, 192, 0.6)';
            const congruentHeight = congruentAvgRT * scaleFactor;
            ctx.fillRect(startX, startY - congruentHeight, barWidth, congruentHeight);
            
            // Incongruent bar
            ctx.fillStyle = 'rgba(255, 99, 132, 0.6)';
            const incongruentHeight = incongruentAvgRT * scaleFactor;
            ctx.fillRect(startX + barWidth + spacing, startY - incongruentHeight, barWidth, incongruentHeight);
            
            // Labels
            ctx.fillStyle = '#000';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Congruent', startX + barWidth/2, startY + 20);
            ctx.fillText('Incongruent', startX + barWidth + spacing + barWidth/2, startY + 20);
            
            // Title
            ctx.font = '18px Arial';
            ctx.fillText('Average Reaction Time by Condition', graphCanvas.width/2, 30);
            
            // Draw values on top of bars
            ctx.fillStyle = '#000';
            ctx.font = '14px Arial';
            ctx.fillText(`${congruentAvgRT.toFixed(0)}ms`, startX + barWidth/2, startY - congruentHeight - 10);
            ctx.fillText(`${incongruentAvgRT.toFixed(0)}ms`, startX + barWidth + spacing + barWidth/2, startY - incongruentHeight - 10);
        }
    }
    
    // Add method to properly save data to server
    saveData() {
        let data = {
            experimentName: this.experimentName,
            session: this.session,
            trials: this.trials,
            summary: this.summary
        };
        
        // Use the existing sendDataToServer function
        sendDataToServer(data, this.UUID, this.experimentName);
        console.log("Data saved to server with UUID:", this.UUID);
    }
}

// Initialize experiment when window loads
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