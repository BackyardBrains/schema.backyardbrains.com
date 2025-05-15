class SqueezeExperiment extends Experiment {
    constructor() {
        super(); // Calls Experiment base class constructor
        this.experimentName = "squeeze";
        this.UUID = '';
        this.sessionType = 'video_cues'; // Or similar descriptive name

        // DOM Elements
        this.instructionsScreen = document.getElementById('instructions-screen');
        this.startButton = document.getElementById('start-button');
        this.experimentArea = document.getElementById('experiment-area');
        this.videoPlayer = document.getElementById('stimulus-video');
        this.cueDisplay = document.getElementById('cue-display');
        this.cueShape = document.getElementById('cue-shape');
        this.trialInfo = document.getElementById('trial-info');
        this.trialCounterDisplay = document.getElementById('trial-counter');
        this.totalTrialsDisplay = document.getElementById('total-trials-display');
        this.feedbackArea = document.getElementById('feedback-area');
        this.feedbackText = document.getElementById('feedback-text');
        this.endScreen = document.getElementById('end-screen');

        // Experiment Parameters
        this.PRACTICE_TRIAL_COUNT = 10;
        this.MAIN_TRIAL_COUNT_PER_BLOCK = 120; // As per user request for one block

        this.VIDEO_PATH = './img/'; // Relative to index.html in squeeze folder
        this.HARD_VIDEOS = ['hard1.mp4', 'hard2.mp4', 'hard3.mp4', 'hard4.mp4'];
        this.SOFT_VIDEOS = ['soft1.mp4', 'soft2.mp4', 'soft3.mp4', 'soft4.mp4', 'Soft5.mp4'];
        // TODO: Add baseline image paths if provided by user

        this.CUE_TYPES = {
            HARD: { color: 'orange', shape: 'dot', response: 'hard' },
            SOFT: { color: 'green', shape: 'dot', response: 'soft' },
            NEUTRAL: { color: 'blue', shape: 'polygon', response: null } // Or 'square'
        };
        // For now, orange = hard, green = soft. This can be made a setting.
        this.cueMapping = {
            orange: this.CUE_TYPES.HARD,
            green: this.CUE_TYPES.SOFT,
            blue: this.CUE_TYPES.NEUTRAL
        };
        this.RESPONSE_KEYS = { 'h': 'hard', 's': 'soft' }; // Key: response

        this.MIN_CUE_ONSET_MS = 1000; // e.g., 1 second
        this.MAX_CUE_ONSET_MS = 3000; // e.g., 3 seconds
        this.CUE_DURATION_MS = 1000;    // How long the cue stays visible
        this.RESPONSE_WINDOW_MS = 2000; // Time allowed to respond after cue onset
        this.ITI_MS = 1500; // Inter-trial interval

        this.MAX_VIDEO_LOAD_ATTEMPTS = 3;
        this.VIDEO_RETRY_DELAY_MS = 500;

        // State Variables
        this.currentTrialIndex = 0;
        this.allTrials = []; // Will hold practice + main trials
        this.trialStartTime = 0;
        this.responseWindowTimeout = null;
        this.videoEndTimeout = null;
        this.cueOffTimeout = null;
        this.nextTrialTimeout = null;
        this.participantResponded = false;
        this.responseWindowOpen = false; // Added state for clarity
        this.currentVideoLoadAttempts = 0;
        this.lastConcludedTrialId = null;
        this.lastConcludedStatus = null;
        this.experimentEnded = false;

        // Bindings
        this.startButton.addEventListener('click', () => this.start());
        document.addEventListener('keydown', (e) => this.handleKeyResponse(e));
        this.videoPlayer.addEventListener('ended', () => this.onVideoEnd());
        this.videoPlayer.addEventListener('loadeddata', () => this.onVideoLoaded());
        this.videoPlayer.addEventListener('error', (e) => {
            const trialForErrorReporting = this.allTrials[this.currentTrialIndex]; // Get trial context at time of error
            const videoError = this.videoPlayer.error;
            const srcAtErrorTime = this.videoPlayer.getAttribute('src'); // What is src AT THIS MOMENT?
            const currentSrcAtErrorTime = this.videoPlayer.currentSrc; // What is currentSrc AT THIS MOMENT?

            let errorMsg = "Video Error (event listener):";
            if (videoError) {
                errorMsg += ` Code: ${videoError.code}, Message: ${videoError.message}`;
            }
            console.error(errorMsg, 
                "src attribute at error time:", srcAtErrorTime,
                "currentSrc at error time:", currentSrcAtErrorTime,
                "Reported for trial ID (if available):", trialForErrorReporting?.trialId, 
                "Expected videoFile for this trial (if available):", trialForErrorReporting?.videoFile,
                "Full Error Object:", videoError, 
                "Event Object:", e);

            // Pass the specific trial context that was active when video load was INITIATED for this attempt.
            // The `trial` argument in handleVideoLoadError will be the one from the attemptVideoLoad call.
            // This is more reliable than this.allTrials[this.currentTrialIndex] if error is delayed.
            // However, attemptVideoLoad already calls handleVideoLoadError for its own initiated loads.
            // This event listener is more of a catch-all.
            // We need to be careful not to double-handle. 
            // For now, let handleVideoLoadError (called from attemptVideoLoad/onVideoLoaded) manage retries.
            // This listener will just log verbosely.
            // If a video load was initiated and then an error occurs outside of the retry loop of handleVideoLoadError,
            // we might still want to trigger it. Let's use a flag or check state.

            // Only call handleVideoLoadError if the error seems genuinely tied to an active loading process
            // that isn't already being handled by retries within handleVideoLoadError itself.
            // This is tricky. The original call to handleVideoLoadError from error event was:
            // if (trial && trial.videoFile) { this.handleVideoLoadError(trial, 'load_event_error'); }
            // Let's stick to logging from this event handler for now to avoid complex double-handling logic,
            // since handleVideoLoadError is also called from play().catch and attemptVideoLoad's timeout.
        });
    }

    generateTrials() {
        const mainTrials = [];
        let trialIdCounter = 0;

        const conditions = [
            { name: 'congruent_hard', count: 10, videoType: 'hard', cueColor: 'orange', expectedResponse: 'hard' },
            { name: 'congruent_soft', count: 10, videoType: 'soft', cueColor: 'green', expectedResponse: 'soft' },
            { name: 'incongruent_hard', count: 10, videoType: 'soft', cueColor: 'orange', expectedResponse: 'hard' },
            { name: 'incongruent_soft', count: 10, videoType: 'hard', cueColor: 'green', expectedResponse: 'soft' },
            { name: 'baseline_hard', count: 20, videoType: 'baseline', cueColor: 'orange', expectedResponse: 'hard' },
            { name: 'baseline_soft', count: 20, videoType: 'baseline', cueColor: 'green', expectedResponse: 'soft' },
            { name: 'neutral_catch', count: 40, videoType: 'random_video', cueColor: 'blue', expectedResponse: null }
        ];

        conditions.forEach(cond => {
            for (let i = 0; i < cond.count; i++) {
                let videoFileRelativePath = null;
                let chosenVideoName = null; // To store just the filename like 'hard1.mp4'

                if (cond.videoType === 'hard') {
                    chosenVideoName = this.HARD_VIDEOS[Math.floor(Math.random() * this.HARD_VIDEOS.length)];
                } else if (cond.videoType === 'soft') {
                    chosenVideoName = this.SOFT_VIDEOS[Math.floor(Math.random() * this.SOFT_VIDEOS.length)];
                } else if (cond.videoType === 'random_video') { 
                    const isHardVideo = Math.random() < 0.5;
                    const videoList = isHardVideo ? this.HARD_VIDEOS : this.SOFT_VIDEOS;
                    chosenVideoName = videoList[Math.floor(Math.random() * videoList.length)];
                }

                if (chosenVideoName) {
                    videoFileRelativePath = this.VIDEO_PATH + chosenVideoName;
                }

                mainTrials.push({
                    trialId: trialIdCounter++,
                    conditionName: cond.name,
                    videoType: cond.videoType,
                    videoFile: videoFileRelativePath, // This is the relative path, e.g., ./img/hard1.mp4
                    actualVideoName: chosenVideoName, // Store the base name for debugging/checks
                    cueColor: cond.cueColor,
                    cueShape: this.cueMapping[cond.cueColor].shape,
                    expectedResponse: cond.expectedResponse,
                    isPractice: false
                });
            }
        });

        const practiceTrials = [];
        if (mainTrials.length >= this.PRACTICE_TRIAL_COUNT) {
            const practiceIndices = new Set();
            while (practiceIndices.size < this.PRACTICE_TRIAL_COUNT) {
                practiceIndices.add(Math.floor(Math.random() * mainTrials.length));
            }
            practiceIndices.forEach(index => {
                practiceTrials.push({ ...mainTrials[index], trialId: trialIdCounter++, isPractice: true });
            });
        } else {
            console.warn("Not enough main trials for practice trials. Adjusting practice count.");
            // Use fewer practice trials if not enough unique main trials are available
            const uniqueMainTrialsForPractice = [...new Map(mainTrials.map(item => [item.videoFile || item.conditionName, item])).values()];
            const numPractice = Math.min(this.PRACTICE_TRIAL_COUNT, uniqueMainTrialsForPractice.length);
            for(let i=0; i < numPractice; i++) {
                 practiceTrials.push({ ...uniqueMainTrialsForPractice[i], trialId: trialIdCounter++, isPractice: true });
            }
        }
        
        shuffle(practiceTrials);
        this.allTrials = [...practiceTrials, ...mainTrials];
        // Update experiment config with actual number of practice trials generated
        if (this.session && this.session.experiment_config) {
            this.session.experiment_config.total_practice_trials = practiceTrials.length;
        } else if (this.session) {
            this.session.experiment_config = { total_practice_trials: practiceTrials.length };
        } else {
            // This case should ideally not happen if start() is called correctly
            this.session = { experiment_config: { total_practice_trials: practiceTrials.length } };
        }

        this.totalTrialsDisplay.textContent = this.allTrials.filter(t => !t.isPractice).length;
        console.log("Trials generated:", this.allTrials);
    }

    async start() {
        this.UUID = generateUUID();
        const sessionGroup = getQueryParam('SG');
        this.session = {
            session_group: sessionGroup,
            experiment_version: "1.0",
            file_version: "1.0",
            browserData: getBrowserData(),
            experiment_config: { // Initialize with some defaults
                 total_trials: 0,
                 total_practice_trials: 0
            }
        };
        this.generateTrials(); // Now this can safely update total_practice_trials in session.experiment_config
        
        // Finalize session config after generateTrials
        this.session.experiment_config.total_trials = this.allTrials.filter(t => !t.isPractice).length;
        // total_practice_trials is already set within generateTrials if session.experiment_config was defined
        this.session.experiment_config.sessionType = this.sessionType;
        this.session.experiment_config.cue_mapping_orange = this.cueMapping.orange.response;
        this.session.experiment_config.cue_mapping_green = this.cueMapping.green.response;
        this.session.experiment_config.min_cue_onset_ms = this.MIN_CUE_ONSET_MS;
        this.session.experiment_config.max_cue_onset_ms = this.MAX_CUE_ONSET_MS;
        this.session.experiment_config.cue_duration_ms = this.CUE_DURATION_MS;
        this.session.experiment_config.response_window_ms = this.RESPONSE_WINDOW_MS;
        this.session.experiment_config.iti_ms = this.ITI_MS;
        this.session.experiment_config.max_video_load_attempts = this.MAX_VIDEO_LOAD_ATTEMPTS;
        this.session.experiment_config.video_retry_delay_ms = this.VIDEO_RETRY_DELAY_MS;
        
        this.session.mainTrialCounter = 0;
        this.experimentEnded = false;
        this.instructionsScreen.classList.add('hidden');
        this.experimentArea.classList.remove('hidden');
        this.trialInfo.classList.remove('hidden');
        this.feedbackArea.classList.remove('hidden');
        this.currentTrialIndex = 0;
        this.trials = [];
        this.startNextTrial();
    }

    startNextTrial() {
        clearTimeout(this.responseWindowTimeout);
        clearTimeout(this.cueOffTimeout);
        clearTimeout(this.nextTrialTimeout);
        this.responseWindowOpen = false;
        this.participantResponded = false;
        this.currentVideoLoadAttempts = 0;

        // Unconditionally reset video player at the start of every trial preparation
        console.log("[Debug] startNextTrial: Resetting video player. Old src:", this.videoPlayer.src);
        this.videoPlayer.pause();
        this.videoPlayer.src = ''; 
        this.videoPlayer.removeAttribute('src'); // Explicitly remove the attribute
        this.videoPlayer.load(); 
        this.videoPlayer.classList.add('hidden');
        console.log("[Debug] startNextTrial: Video player reset. Attribute src removed. Current effective src:", this.videoPlayer.src, "NetworkState:", this.videoPlayer.networkState);

        if (this.currentTrialIndex >= this.allTrials.length) {
            this.end();
            return;
        }
        const trial = this.allTrials[this.currentTrialIndex];
        console.log(`[Debug] startNextTrial: Preparing Trial ${this.currentTrialIndex}, ID: ${trial?.trialId}, Practice: ${trial?.isPractice}`);
        if (!trial) {
            console.error("[Critical] startNextTrial: Trial object is undefined for index", this.currentTrialIndex, "Cannot proceed.");
            this.end(); // Potentially end experiment if state is corrupt
            return;
        }
        console.log(`[Debug] startNextTrial: VideoFile for current trial (ID: ${trial.trialId}): '${trial.videoFile}', ActualVideoName: '${trial.actualVideoName}'`);

        this.feedbackText.textContent = '';
        this.cueDisplay.classList.add('hidden');
        this.cueShape.className = 'cue-element';
        if (trial.isPractice) {
            const practiceNum = this.allTrials.slice(0, this.currentTrialIndex + 1).filter(t => t.isPractice).length;
            this.trialCounterDisplay.textContent = `Practice ${practiceNum} / ${this.session.experiment_config.total_practice_trials}`;
        } else {
            const mainTrialNum = this.allTrials.slice(0, this.currentTrialIndex).filter(t => !t.isPractice).length + 1;
            this.trialCounterDisplay.textContent = `Trial ${mainTrialNum} / ${this.session.experiment_config.total_trials}`;
        }
        if (trial.videoFile) {
            this.attemptVideoLoad(trial);
        } else {
            this.videoPlayer.classList.add('hidden');
            this.scheduleCue(trial);
        }
    }
    
    attemptVideoLoad(trial) {
        console.log("[Debug] attemptVideoLoad: Entered function for trial ID:", trial?.trialId, "VideoFile:", trial?.videoFile);

        if (!trial || !trial.videoFile) {
            console.warn("[Debug] attemptVideoLoad: Called with invalid trial or no videoFile. Trial:", trial);
            this.scheduleCue(trial); // Proceed without video
            return;
        }

        this.currentVideoLoadAttempts++;
        // Ensure this log appears
        console.log(`[Debug] attemptVideoLoad: Attempt ${this.currentVideoLoadAttempts}/${this.MAX_VIDEO_LOAD_ATTEMPTS} to load video for trial ID ${trial.trialId}: '${trial.videoFile}' (Actual: '${trial.actualVideoName}')`);

        // Ensure VIDEO_PATH ends with a slash if it's a directory
        const basePath = this.VIDEO_PATH.endsWith('/') ? this.VIDEO_PATH : this.VIDEO_PATH + '/';
        const videoName = trial.actualVideoName; // Use the stored actual video name

        // Construct the path relative to the HTML file's location.
        // index.html is in /static/squeeze/, so VIDEO_PATH = './img/' is correct.
        // videoFile is already VIDEO_PATH + actualVideoName
        const relativeVideoPath = trial.videoFile;

        let resolvedVideoURL;
        try {
            // Create a URL object relative to the document's base URL
            // document.baseURI should be something like "http://localhost:xxxx/static/squeeze/"
            resolvedVideoURL = new URL(relativeVideoPath, document.baseURI).href;
            console.log("[Debug] attemptVideoLoad: Successfully created URL. Relative path:", relativeVideoPath, "Document Base URI:", document.baseURI, "Resolved full URL:", resolvedVideoURL);
        } catch (e) {
            console.error("[Critical] attemptVideoLoad: Error constructing URL object. Relative path was:", relativeVideoPath, "Base URI was:", document.baseURI, "Error:", e);
            this.handleVideoLoadError(trial, 'url_construction_error');
            return;
        }

        console.log("[Debug] attemptVideoLoad: Preparing to set videoPlayer.src. Current src:", this.videoPlayer.src, "networkState:", this.videoPlayer.networkState);
        // Force a reset of the media element before setting new src
        this.videoPlayer.src = '';
        this.videoPlayer.removeAttribute('src'); // Explicitly remove the attribute
        this.videoPlayer.load(); // Call load to process the empty src and reset state
        console.log("[Debug] attemptVideoLoad: src attribute removed and load() called. Current effective src:", this.videoPlayer.src, "networkState:", this.videoPlayer.networkState, "readyState:", this.videoPlayer.readyState);

        console.log("[Debug] attemptVideoLoad: Setting videoPlayer.src to:", resolvedVideoURL);
        this.videoPlayer.src = resolvedVideoURL; // Use the resolved URL
        // this.videoPlayer.classList.remove('hidden'); // Moved to onVideoLoaded

        console.log(`[Debug] attemptVideoLoad: src is now set to ${this.videoPlayer.src}. Current networkState: ${this.videoPlayer.networkState}, readyState: ${this.videoPlayer.readyState}`);

        this.videoPlayer.load(); // Explicitly call load
        console.log(`[Debug] attemptVideoLoad: videoPlayer.load() called. Current networkState: ${this.videoPlayer.networkState}, readyState: ${this.videoPlayer.readyState}`);

        // Removing the 50ms timeout log for now to simplify, focus on immediate error
    }

    onVideoLoaded() {
        const trial = this.allTrials[this.currentTrialIndex];
        if (!trial) return;
        this.currentVideoLoadAttempts = 0;
        console.log("Video loaded successfully:", trial.videoFile, "(resolved: ", this.videoPlayer.currentSrc, ")");
        this.videoPlayer.classList.remove('hidden'); // Ensure video is visible before playing
        this.videoPlayer.play().then(() => {
            console.log("Video playing for trial:", trial.trialId);
            // this.videoPlayer.classList.remove('hidden'); // Already called above
            this.scheduleCue(trial);
        }).catch(err => {
            console.error("Error during video.play() for", trial.videoFile, "(resolved: ", this.videoPlayer.currentSrc, "):", err);
            this.handleVideoLoadError(trial, 'play_error');
        });
    }

    handleVideoLoadError(trial, errorType) {
        // This function is called from the video 'error' event or from .play().catch().
        // 'trial' here is the trial that was *intended* to be loaded/played.
        // We should check if it's still the *current* trial to avoid acting on stale errors.
        const currentActiveTrial = this.allTrials[this.currentTrialIndex];
        if (!currentActiveTrial || currentActiveTrial.trialId !== trial.trialId) {
            console.warn(`handleVideoLoadError: Stale error. Error for trial ${trial?.trialId} (video: ${trial?.videoFile}), but active trial is now ${currentActiveTrial?.trialId}. Error type: ${errorType}. Ignoring.`);
            return;
        }

        // If we are here, the error pertains to the currently active trial.
        this.currentVideoLoadAttempts++;
        console.warn(`Video error type '${errorType}'. Attempt ${this.currentVideoLoadAttempts}/${this.MAX_VIDEO_LOAD_ATTEMPTS} for video: ${currentActiveTrial.videoFile} (Trial ID: ${currentActiveTrial.trialId})`);

        if (this.currentVideoLoadAttempts < this.MAX_VIDEO_LOAD_ATTEMPTS) {
            this.feedbackText.textContent = `Retrying video load (attempt ${this.currentVideoLoadAttempts + 1}/${this.MAX_VIDEO_LOAD_ATTEMPTS})...`;
            setTimeout(() => {
                const stillCurrentTrial = this.allTrials[this.currentTrialIndex];
                // Double check it's still the same trial before retrying
                if (stillCurrentTrial && stillCurrentTrial.trialId === currentActiveTrial.trialId) {
                     console.log(`Retrying video load for Trial ID ${currentActiveTrial.trialId}, attempt ${this.currentVideoLoadAttempts +1}`);
                    this.attemptVideoLoad(currentActiveTrial); // Pass the current trial context
                } else {
                    console.log("Trial changed before video retry could occur for Trial ID:", currentActiveTrial.trialId, "Aborting retry for:", currentActiveTrial.videoFile);
                }
            }, this.VIDEO_RETRY_DELAY_MS);
        } else { 
            console.error(`Failed to load video ${currentActiveTrial.videoFile} after ${this.MAX_VIDEO_LOAD_ATTEMPTS} attempts (Trial ID: ${currentActiveTrial.trialId}).`);
            this.feedbackText.textContent = `Error: Could not load video. Skipping trial.`;
            this.clearTimeoutsForTrialEnd(); // Clear any cue/response timeouts
            this.responseWindowOpen = false;
            
            // Aggressively reset video player on final failure before concluding trial
            this.videoPlayer.pause();
            this.videoPlayer.src = '';
            this.videoPlayer.removeAttribute('src'); // Explicitly remove the attribute
            this.videoPlayer.load(); // Ensure it processes the empty src
            this.videoPlayer.classList.add('hidden');
            console.warn(`[Debug] handleVideoLoadError: Aggressively reset video player for ${currentActiveTrial.videoFile} on final failure.`);

            this.concludeTrial(null, null, false, true, `video_failed_all_retries_(${errorType})`);
        }
    }

    scheduleCue(trial) {
        const cueOnsetDelay = Math.random() * (this.MAX_CUE_ONSET_MS - this.MIN_CUE_ONSET_MS) + this.MIN_CUE_ONSET_MS;
        setTimeout(() => {
            const currentActiveTrial = this.allTrials[this.currentTrialIndex];
            if (!currentActiveTrial || currentActiveTrial.trialId !== trial.trialId) {
                 console.log("Aborting cue for stale trialId:", trial.trialId, "Current trialId:", currentActiveTrial?.trialId);
                 return; 
            }
            this.showCue(trial.cueColor, trial.cueShape);
            this.trialStartTime = performance.now(); 
            this.participantResponded = false;
            if (trial.expectedResponse !== null) { 
                this.responseWindowOpen = true;
                this.responseWindowTimeout = setTimeout(() => {
                    this.responseWindowOpen = false;
                    if (!this.participantResponded) {
                        console.log("Response window timed out for trial:", trial.trialId);
                        this.handleResponse(null, trial); 
                    }
                }, this.RESPONSE_WINDOW_MS);
            }
            this.cueOffTimeout = setTimeout(() => {
                 this.cueDisplay.classList.add('hidden');
            }, this.CUE_DURATION_MS);
        }, cueOnsetDelay);
    }

    showCue(color, shape) {
        this.cueShape.className = 'cue-element';
        if (shape === 'dot') {
            this.cueShape.classList.add('cue-dot');
        }
        if (color === 'orange') this.cueShape.classList.add('cue-orange');
        else if (color === 'green') this.cueShape.classList.add('cue-green');
        else if (color === 'blue') this.cueShape.classList.add('cue-blue');
        this.cueDisplay.classList.remove('hidden');
        console.log(`Cue shown: ${color} ${shape}`);
    }

    onVideoEnd() {
        console.log("Video naturally ended.");
        this.videoPlayer.classList.add('hidden'); 
        const trial = this.allTrials[this.currentTrialIndex];
        // Use trial.actualVideoName for a more reliable check against currentSrc
        if (trial && trial.actualVideoName && this.videoPlayer.currentSrc && this.videoPlayer.currentSrc.endsWith(trial.actualVideoName) && !this.participantResponded) {
            if (trial.expectedResponse === null) {
                console.log(`Neutral trial ${trial.trialId} (video ${trial.actualVideoName}) ended. No response given during video.`);
                this.concludeTrial(null, null, true, true, 'neutral_video_end_correct');
            }
        }
    }

    handleKeyResponse(event) {
        if (this.currentTrialIndex >= this.allTrials.length || this.participantResponded) return;
        const trial = this.allTrials[this.currentTrialIndex];
        if (!trial) return; 
        const pressedKey = event.key.toLowerCase();
        const responseAction = this.RESPONSE_KEYS[pressedKey];
        if (trial.expectedResponse !== null) { 
            if (this.responseWindowOpen && responseAction) {
                clearTimeout(this.responseWindowTimeout);
                this.responseWindowTimeout = null; 
                this.responseWindowOpen = false;
                this.participantResponded = true;
                this.handleResponse(responseAction, trial);
            } else if (responseAction) {
                console.log("Key pressed for response trial, but window not open or key invalid. Trial:", trial.trialId, "Key:", pressedKey);
            }
        } else { 
            if (responseAction) { 
                console.log(`Key '${pressedKey}' pressed during NEUTRAL trial: ${trial.trialId}`);
                this.participantResponded = true; 
                this.clearTimeoutsForTrialEnd(); 
                this.feedbackText.textContent = "No response needed.";
                this.concludeTrial(pressedKey, performance.now() - (this.trialStartTime || performance.now()), false, true, 'neutral_key_pressed_incorrect');
            }
        }
    }
    
    handleResponse(response, trial) {
        const responseTime = (response && this.trialStartTime) ? performance.now() - this.trialStartTime : null;
        let correct = false;
        let feedbackMsg = "";
        console.log(`[Debug] handleResponse for Trial ID ${trial.trialId} (ActualVideo: ${trial.actualVideoName}): Received response='${response}', Expected='${trial.expectedResponse}', RT=${responseTime}`);
        if (trial.expectedResponse) { 
            if (response) { 
                correct = response === trial.expectedResponse;
                feedbackMsg = correct ? `Correct! (${responseTime.toFixed(0)}ms)` : "Incorrect.";
            } else { 
                this.responseWindowOpen = false; 
                feedbackMsg = "Too slow!";
                correct = false;
            }
        } else { 
            if (response) { 
                feedbackMsg = "No response needed."; 
                correct = false; 
            } else { 
                feedbackMsg = ""; 
                correct = true; 
            }
        }
        this.feedbackText.textContent = feedbackMsg;
        if (trial.isPractice) {
            if (feedbackMsg) { 
                this.feedbackText.textContent = `Practice: ${feedbackMsg}`;
            } else {
                 this.feedbackText.textContent = "Practice trial finished.";
            }
        }
        console.log(`Trial ${trial.trialId} (Cond: ${trial.conditionName}, Video: ${trial.actualVideoName}) concluded. Response: ${response}, Expected: ${trial.expectedResponse}, Correct: ${correct}, RT: ${responseTime?.toFixed(0)}ms`);
        this.concludeTrial(response, responseTime, correct, true, response ? 'responded' : (trial.expectedResponse !== null ? 'timeout' : 'neutral_natural_end'));
    }
    
    clearTimeoutsForTrialEnd() {
        clearTimeout(this.responseWindowTimeout);
        this.responseWindowTimeout = null;
        clearTimeout(this.cueOffTimeout);
        this.cueOffTimeout = null;
    }

    concludeTrial(response, rt, correct, completed, status) {
        const trial = this.allTrials[this.currentTrialIndex]; 
        if (!trial || (this.lastConcludedTrialId === trial.trialId && this.lastConcludedStatus === status && status !== 'video_failed_all_retries_load_event_error' && status !== 'video_failed_all_retries_play_error')) {
            console.warn("Attempted to conclude trial that might already be concluded or is invalid. Index:", this.currentTrialIndex, "Trial ID:", trial?.trialId, "Current Status:", status, "Last Status:", this.lastConcludedStatus);
            if(this.currentTrialIndex >= this.allTrials.length && !this.experimentEnded) this.end();
            return;
        }
        this.lastConcludedTrialId = trial.trialId;
        this.lastConcludedStatus = status;
        this.clearTimeoutsForTrialEnd();
        this.responseWindowOpen = false; 
        this.cueDisplay.classList.add('hidden');
        if (!trial.isPractice) {
            this.session.mainTrialCounter++;
            this.saveTrialData({
                trialNumberInBlock: this.session.mainTrialCounter,
                uniqueTrialId: trial.trialId,
                blockNumber: 1,
                condition: trial.conditionName,
                videoFileRelativePath: trial.videoFile, // The relative path used
                actualVideoName: trial.actualVideoName, // The base name
                cueColor: trial.cueColor,
                cueShape: trial.cueShape,
                expectedResponse: trial.expectedResponse,
                response: response,
                responseTimeMs: rt,
                correct: correct,
                isPractice: trial.isPractice,
                completed: completed,
                status: status
            });
        }
        this.currentTrialIndex++;
        this.nextTrialTimeout = setTimeout(() => {
            this.lastConcludedTrialId = null;
            this.lastConcludedStatus = null;
            this.startNextTrial();
        }, this.ITI_MS);
    }

    end() {
        if (this.experimentEnded) return;
        this.experimentEnded = true;
        super.end(); 
        console.log("Experiment ended. Final data:", { session: this.session, trials: this.trials });
        this.instructionsScreen.classList.add('hidden');
        this.experimentArea.classList.add('hidden');
        this.trialInfo.classList.add('hidden');
        this.feedbackArea.classList.add('hidden');
        this.endScreen.classList.remove('hidden');
        this.saveData();
        this.endScreen.querySelector('p:last-of-type').textContent = "Data saved. Thank you!";
        clearTimeout(this.responseWindowTimeout);
        clearTimeout(this.cueOffTimeout);
        clearTimeout(this.nextTrialTimeout);
        this.videoPlayer.pause();
        this.videoPlayer.src = '';
        this.videoPlayer.classList.add('hidden');
    }
}

window.addEventListener('load', () => {
    const experiment = new SqueezeExperiment();
}); 