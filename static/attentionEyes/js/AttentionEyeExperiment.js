class AttentionEyeExperiment extends Experiment {
    constructor() {
        super();
        this.experimentName = 'attentionEyes';
        this.UUID = '';
        this.currentPhase = 1;
        this.currentTrial = 0;
        this.trialsPerPhase = 10;
        this.player = null;
        this.isTransitioning = false;
        this.currentVideoIndex = 0;
        this.trialStartTime = 0;
        this.currentTrialData = {};
        this.phase1Trials = [];
        this.phase2Trials = [];
        this.correctVideoURLs = [];
        this.scrambledVideoURLs = [];
        this.mismatchedVideoURLs = [];
        this.videoPairs = [];
        this.allPairsForPhase = [];
        this.randomizedIndices = [];
        this.participantInfo = null;

        // Load video URLs from files
        this.loadVideoURLs().then(() => {
            // Generate video pairs for first phase
            this.generateAllPairsForPhase();
            // Initialize UI elements
            this.initializeUI();
        });

        // Bind event handlers
        this.handleOptionClick = this.handleOptionClick.bind(this);
        this.handleConfidenceClick = this.handleConfidenceClick.bind(this);
        this.onPlayerStateChange = this.onPlayerStateChange.bind(this);
        this.handleParticipantInfoSubmit = this.handleParticipantInfoSubmit.bind(this);
    }

    async loadVideoURLs() {
        try {
            // Fetch correct video URLs
            const correctResponse = await fetch('../attentionEyes/links/correct.txt');
            if (!correctResponse.ok) {
                throw new Error(`HTTP error! status: ${correctResponse.status}`);
            }
            const correctText = await correctResponse.text();
            this.correctVideoURLs = this.parseURLsFromText(correctText);
            console.log('Loaded correct URLs:', this.correctVideoURLs);

            // Fetch scrambled video URLs
            const scrambledResponse = await fetch('../attentionEyes/links/scrambled.txt');
            if (!scrambledResponse.ok) {
                throw new Error(`HTTP error! status: ${scrambledResponse.status}`);
            }
            const scrambledText = await scrambledResponse.text();
            this.scrambledVideoURLs = this.parseURLsFromText(scrambledText);
            console.log('Loaded scrambled URLs:', this.scrambledVideoURLs);

            // Fetch mismatched video URLs
            const mismatchedResponse = await fetch('../attentionEyes/links/mismatched.txt');
            if (!mismatchedResponse.ok) {
                throw new Error(`HTTP error! status: ${mismatchedResponse.status}`);
            }
            const mismatchedText = await mismatchedResponse.text();
            this.mismatchedVideoURLs = this.parseURLsFromText(mismatchedText);
            console.log('Loaded mismatched URLs:', this.mismatchedVideoURLs);

            if (!this.correctVideoURLs.length || !this.scrambledVideoURLs.length || !this.mismatchedVideoURLs.length) {
                throw new Error('One or more URL arrays is empty');
            }

            console.log('Final URLs loaded:', {
                correct: this.correctVideoURLs,
                scrambled: this.scrambledVideoURLs,
                mismatched: this.mismatchedVideoURLs
            });
        } catch (error) {
            console.error('Error loading video URLs:', error);
            // Set default URLs as fallback
            this.correctVideoURLs = ['https://youtu.be/yl5LPxqlJJ0'];
            this.scrambledVideoURLs = ['https://youtu.be/knMkOPauSXk'];
            this.mismatchedVideoURLs = ['https://youtu.be/hBGwAb_Fnrc'];
        }
    }

    parseURLsFromText(text) {
        if (!text) return [];
        return text.trim().split('\n')
            .map(line => {
                if (!line) return null;
                const parts = line.split('\t');
                const url = parts.length > 1 ? parts[1] : parts[0];
                if (!url) return null;
                return this.reformatYouTubeURL(url.trim());
            })
            .filter(url => url !== null);
    }

    reformatYouTubeURL(url) {
        if (!url) return null;
        console.log('Original URL:', url);
        // Extract video ID from various YouTube URL formats
        const videoId = this.getVideoId(url);
        console.log('Extracted video ID:', videoId);
        if (!videoId) return null;
        // Return the reformatted URL
        return `https://youtu.be/${videoId}`;
    }

    getVideoId(url) {
        if (!url) return null;
        let videoId = '';
        const patterns = [
            /youtu\.be\/([^#\&\?]{11})/,  // youtu.be/ format
            /[?&]v=([^#\&\?]{11})/,       // ?v= or &v= format
            /embed\/([^#\&\?]{11})/,       // embed/ format
            /([^#\&\?]{11})/              // just the ID itself
        ];
        
        for (const pattern of patterns) {
            try {
                const match = url.match(pattern);
                if (match && match[1]) {
                    videoId = match[1];
                    break;
                }
            } catch (error) {
                console.warn('Error matching pattern:', error);
                continue;
            }
        }
        
        if (!videoId) {
            console.warn(`Could not extract video ID from URL: ${url}`);
        }
        return videoId;
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    generateRandomIndices() {
        // Create array of indices and shuffle it
        const indices = Array.from({ length: this.trialsPerPhase }, (_, i) => i);
        this.shuffleArray(indices);
        this.randomizedIndices = indices;
        console.log('Generated random indices:', this.randomizedIndices);
    }

    generateAllPairsForPhase() {
        const pairs = [];
        console.log('Generating all pairs for phase:', this.currentPhase);
        
        // Generate new random order for this phase
        this.generateRandomIndices();
        
        // Generate all possible pairs for the current phase
        for (let i = 0; i < this.trialsPerPhase; i++) {
            const pairIndex = i % this.correctVideoURLs.length;
            const isCorrectFirst = Math.random() < 0.5;
            
            if (this.currentPhase === 1) {
                // Phase 1: Correct vs Scrambled
                if (isCorrectFirst) {
                    pairs.push({
                        video1: this.correctVideoURLs[pairIndex],
                        video2: this.scrambledVideoURLs[pairIndex],
                        isReal: 1,
                        pairIndex: pairIndex
                    });
                } else {
                    pairs.push({
                        video1: this.scrambledVideoURLs[pairIndex],
                        video2: this.correctVideoURLs[pairIndex],
                        isReal: 2,
                        pairIndex: pairIndex
                    });
                }
            } else {
                // Phase 2: Correct vs Mismatched
                if (isCorrectFirst) {
                    pairs.push({
                        video1: this.correctVideoURLs[pairIndex],
                        video2: this.mismatchedVideoURLs[pairIndex],
                        isReal: 1,
                        pairIndex: pairIndex
                    });
                } else {
                    pairs.push({
                        video1: this.mismatchedVideoURLs[pairIndex],
                        video2: this.correctVideoURLs[pairIndex],
                        isReal: 2,
                        pairIndex: pairIndex
                    });
                }
            }
        }
        
        this.allPairsForPhase = pairs;
        console.log('Generated pairs:', pairs);
        
        // Set initial pair using randomized index
        this.setCurrentPair();
    }

    setCurrentPair() {
        if (this.currentTrial < this.trialsPerPhase) {
            const randomIndex = this.randomizedIndices[this.currentTrial];
            this.videoPairs = [this.allPairsForPhase[randomIndex]];
            console.log('Current trial:', this.currentTrial);
            console.log('Using random index:', randomIndex);
            console.log('Current pair:', this.videoPairs[0]);
        }
    }

    initializeUI() {
        // Get UI elements
        this.startButton = document.getElementById('start-button');
        this.instructionsScreen = document.getElementById('instructions-screen');
        this.experimentArea = document.getElementById('experiment-area');
        this.questionnaireArea = document.getElementById('questionnaire-area');
        this.endScreen = document.getElementById('end-screen');
        this.breakScreen = document.getElementById('break-screen');
        this.participantInfoScreen = document.getElementById('participant-info-screen');
        this.continueButton = document.getElementById('continue-button');
        this.trialCounter = document.getElementById('trial-counter');
        this.phaseCounter = document.getElementById('phase-counter');
        this.totalTrialsDisplay = document.getElementById('total-trials-display');
        this.downloadPhase1Button = document.getElementById('download-phase1-results');
        this.downloadPhase2Button = document.getElementById('download-phase2-results');
        this.submitParticipantInfoButton = document.getElementById('submit-participant-info');

        // Update total trials display
        if (this.totalTrialsDisplay) {
            this.totalTrialsDisplay.textContent = this.trialsPerPhase;
        }

        // Add event listeners
        this.startButton.addEventListener('click', () => this.start());
        this.continueButton.addEventListener('click', () => this.startPhase2());
        this.downloadPhase1Button.addEventListener('click', () => this.downloadResults(1));
        this.downloadPhase2Button.addEventListener('click', () => this.downloadResults(2));
        this.submitParticipantInfoButton.addEventListener('click', this.handleParticipantInfoSubmit);

        // Add click handlers for questionnaire buttons
        document.querySelectorAll('.option-btn').forEach(button => {
            button.addEventListener('click', this.handleOptionClick.bind(this));
        });
        document.querySelectorAll('.confidence-btn').forEach(button => {
            button.addEventListener('click', this.handleConfidenceClick.bind(this));
        });
    }

    start() {
        // Initialize session data
        const sessionGroup = getQueryParam('SG');
        this.session = {
            session_group: sessionGroup,
            experiment_version: '1.0',
            file_version: '1.0',
            browserData: getBrowserData(),
            experiment_config: {
                total_trials: this.trialsPerPhase,
                correct_video_urls: this.correctVideoURLs,
                scrambled_video_urls: this.scrambledVideoURLs,
                mismatched_video_urls: this.mismatchedVideoURLs
            }
        };
        this.UUID = generateUUID();

        // Hide instructions and show experiment area
        this.instructionsScreen.classList.add('hidden');
        this.experimentArea.classList.remove('hidden');

        // Initialize YouTube player
        this.initializeYouTubePlayer();
    }

    initializeYouTubePlayer() {
        console.log('Initializing player with video pairs:', this.videoPairs);
        if (!this.videoPairs || !this.videoPairs[0]) {
            console.error('No valid video pairs available');
            return;
        }

        const firstVideoId = this.getVideoId(this.videoPairs[0].video1);
        if (!firstVideoId) {
            console.error('Could not get valid video ID for first video');
            return;
        }

        this.player = new YT.Player('youtube-player-container', {
            height: '450',
            width: '800',
            videoId: firstVideoId,
            playerVars: {
                'controls': 0,
                'disablekb': 1,
                'modestbranding': 1,
                'rel': 0,
                'playsinline': 1
            },
            events: {
                'onReady': () => {
                    console.log('Player ready with video ID:', firstVideoId);
                    this.player.loadVideoById(firstVideoId);
                },
                'onStateChange': this.onPlayerStateChange.bind(this),
                'onError': (event) => {
                    console.error('YouTube player error:', event.data);
                }
            }
        });
    }

    onPlayerStateChange(event) {
        console.log('Player state changed:', event.data);
        if (event.data === YT.PlayerState.ENDED) {
            if (this.currentVideoIndex === 0) {
                // First video ended, play second video
                this.currentVideoIndex = 1;
                const secondVideoId = this.getVideoId(this.videoPairs[this.currentTrial].video2);
                console.log('Loading second video with ID:', secondVideoId);
                this.player.loadVideoById(secondVideoId);
            } else {
                // Second video ended, show questionnaire
                this.showQuestionnaire();
            }
        }
    }

    showQuestionnaire() {
        this.experimentArea.classList.add('hidden');
        this.questionnaireArea.classList.remove('hidden');
        
        // Reset button states
        document.querySelectorAll('.option-btn, .confidence-btn').forEach(button => {
            button.classList.remove('selected');
        });

        // Get the current video pair
        const currentPair = this.videoPairs[0];

        // Initialize current trial data
        this.currentTrialData = {
            trial_number: this.currentTrial + 1,
            video1: {
                id: this.getVideoId(currentPair.video1),
                url: currentPair.video1,
                position: 1
            },
            video2: {
                id: this.getVideoId(currentPair.video2),
                url: currentPair.video2,
                position: 2
            },
            correct_video_position: currentPair.isReal,
            pair_index: currentPair.pairIndex,
            phase: this.currentPhase,
            timestamp: new Date().toISOString()
        };
    }

    handleOptionClick(event) {
        // Remove selected class from all option buttons
        document.querySelectorAll('.option-btn').forEach(button => {
            button.classList.remove('selected');
        });
        
        // Add selected class to clicked button
        event.target.classList.add('selected');
        
        // Store response
        this.currentTrialData.selected_video = parseInt(event.target.dataset.value);
    }

    handleConfidenceClick(event) {
        // Remove selected class from all confidence buttons
        document.querySelectorAll('.confidence-btn').forEach(button => {
            button.classList.remove('selected');
        });
        
        // Add selected class to clicked button
        event.target.classList.add('selected');
        
        // Store confidence rating and complete trial
        this.currentTrialData.confidence_rating = parseInt(event.target.dataset.value);
        this.currentTrialData.selected_video = parseInt(this.currentTrialData.selected_video);
        this.currentTrialData.is_correct = this.currentTrialData.selected_video === this.currentTrialData.correct_video_position;
        
        // Save trial data to appropriate phase
        if (this.currentPhase === 1) {
            this.phase1Trials.push({...this.currentTrialData});
        } else {
            this.phase2Trials.push({...this.currentTrialData});
        }
        
        this.nextTrial();
    }

    showBreakScreen() {
        this.experimentArea.classList.add('hidden');
        this.questionnaireArea.classList.add('hidden');
        this.breakScreen.classList.remove('hidden');
        this.phaseCounter.textContent = '2';
    }

    startPhase2() {
        console.log('Starting Phase 2');
        this.currentPhase = 2;
        this.currentTrial = 0;
        this.currentVideoIndex = 0;
        
        // Generate new pairs for Phase 2
        this.generateAllPairsForPhase();
        
        this.breakScreen.classList.add('hidden');
        this.experimentArea.classList.remove('hidden');
        this.trialCounter.textContent = this.currentTrial + 1;
        
        // Destroy existing player
        if (this.player) {
            this.player.destroy();
        }
        
        // Initialize YouTube player for phase 2
        this.initializeYouTubePlayer();
    }

    initializeYouTubePlayer() {
        console.log('Initializing player with video pairs:', this.videoPairs);
        if (!this.videoPairs || !this.videoPairs[0]) {
            console.error('No valid video pairs available');
            return;
        }

        const firstVideoId = this.getVideoId(this.videoPairs[0].video1);
        if (!firstVideoId) {
            console.error('Could not get valid video ID for first video');
            return;
        }

        // Create new player instance
        this.player = new YT.Player('youtube-player-container', {
            height: '450',
            width: '800',
            videoId: firstVideoId,
            playerVars: {
                'controls': 0,
                'disablekb': 1,
                'modestbranding': 1,
                'rel': 0,
                'playsinline': 1
            },
            events: {
                'onReady': () => {
                    console.log('Player ready with video ID:', firstVideoId);
                    this.player.loadVideoById(firstVideoId);
                },
                'onStateChange': (event) => this.onPlayerStateChange(event),
                'onError': (event) => {
                    console.error('YouTube player error:', event.data);
                }
            }
        });
    }

    onPlayerStateChange(event) {
        console.log('Player state changed:', event.data);
        if (event.data === YT.PlayerState.ENDED) {
            if (this.currentVideoIndex === 0) {
                // First video ended, play second video
                this.currentVideoIndex = 1;
                const secondVideoId = this.getVideoId(this.videoPairs[0].video2);
                console.log('Loading second video with ID:', secondVideoId);
                if (this.player && this.player.loadVideoById) {
                    this.player.loadVideoById(secondVideoId);
                } else {
                    console.error('Player not properly initialized');
                    // Attempt to recover by reinitializing
                    this.initializeYouTubePlayer();
                }
            } else {
                // Second video ended, show questionnaire
                this.showQuestionnaire();
            }
        }
    }

    nextTrial() {
        this.currentTrial++;
        this.currentVideoIndex = 0;
        
        if (this.currentTrial >= this.trialsPerPhase) {
            if (this.currentPhase === 1) {
                this.showBreakScreen();
            } else {
                this.end();
            }
            return;
        }

        // Update trial counter
        this.trialCounter.textContent = this.currentTrial + 1;
        
        // Hide questionnaire and show experiment area
        this.questionnaireArea.classList.add('hidden');
        this.experimentArea.classList.remove('hidden');
        
        // Set next pair and load first video
        this.setCurrentPair();
        this.player.loadVideoById(this.getVideoId(this.videoPairs[0].video1));
    }

    end() {
        // Hide experiment areas and show participant info screen
        this.experimentArea.classList.add('hidden');
        this.questionnaireArea.classList.add('hidden');
        this.participantInfoScreen.classList.remove('hidden');
    }

    handleParticipantInfoSubmit() {
        const nameInput = document.getElementById('participant-name');
        const ageInput = document.getElementById('participant-age');

        if (!nameInput.value || !ageInput.value) {
            alert('Please fill in both name and age fields.');
            return;
        }

        this.participantInfo = {
            name: nameInput.value,
            age: parseInt(ageInput.value)
        };

        // Hide participant info screen and show end screen
        this.participantInfoScreen.classList.add('hidden');
        this.endScreen.classList.remove('hidden');
        
        // Save all data
        this.saveData();
    }

    downloadResults(phase) {
        // Calculate summary statistics
        const trials = phase === 1 ? this.phase1Trials : this.phase2Trials;
        const totalCorrect = trials.reduce((sum, trial) => sum + (trial.is_correct ? 1 : 0), 0);
        const totalConfidence = trials.reduce((sum, trial) => sum + trial.confidence_rating, 0);
        const averageConfidence = totalConfidence / trials.length;
        
        const data = {
            session: {
                ...this.session,
                phase: phase,
                experiment_version: '1.1',
                file_version: '1.1',
                total_trials: this.trialsPerPhase,
                participant: this.participantInfo
            },
            results: {
                total_correct: totalCorrect,
                total_possible: this.trialsPerPhase,
                accuracy_percentage: (totalCorrect / this.trialsPerPhase) * 100,
                total_confidence: totalConfidence,
                average_confidence: averageConfidence
            },
            trials: trials
        };
        
        // Create and download JSON file
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attention_eyes_phase${phase}_results_${this.UUID}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Initialize experiment when YouTube API is ready
window.onYouTubeIframeAPIReady = function() {
    const experiment = new AttentionEyeExperiment();
};

