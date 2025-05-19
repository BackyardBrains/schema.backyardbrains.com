document.addEventListener('DOMContentLoaded', () => {
    

    let player;
    let playlist = [];
    let currentVideoIndex = 0;
    let isTransitioning = false; // Flag to manage video transitions

    // Data saving variables
    let sessionData = {};
    let allTrialsData = [];
    let experimentUUID = '';

    const instructionsScreen = document.getElementById('instructions-screen');
    const startButton = document.getElementById('start-button');
    const experimentArea = document.getElementById('experiment-area');
    const endScreen = document.getElementById('end-screen');
    const trialCounterElement = document.getElementById('trial-counter');
    const totalTrialsDisplayElement = document.getElementById('total-trials-display');

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

    // const orangeDotElement = document.createElement('div');
    //     blueDotElement.className = 'cue-element orange-dot';
    //     blueDotElement.style.width = '10px';
    //     blueDotElement.style.height = '10px';
    //     blueDotElement.style.backgroundColor = 'orange';
    //     blueDotElement.style.borderRadius = '50%';
    //     blueDotElement.style.position = 'absolute';
    //     blueDotElement.style.left = 'calc(50% + 20px)'; // Position to the right of center
    //     blueDotElement.style.top = '50%';
    //     blueDotElement.style.transform = 'translateY(-50%)';
    //     blueDotElement.style.display = 'none'; // Hidden initially
    //     cueDisplayElement.appendChild(orangeDotElement);

    function updateTrialDisplay() {
        if (trialCounterElement) {
            trialCounterElement.textContent = String(currentVideoIndex + 1 > TOTAL_VIDEOS_TO_PLAY ? TOTAL_VIDEOS_TO_PLAY : currentVideoIndex + 1);
        }
        if (totalTrialsDisplayElement) {
            totalTrialsDisplayElement.textContent = String(TOTAL_VIDEOS_TO_PLAY);
        }
    }


    function initializeExperimentSession() {
        experimentUUID = generateUUID(); // From utils.js
        const sessionGroup = getQueryParam('SG'); // From utils.js
        sessionData = {
            session_uuid: experimentUUID,
            session_group: sessionGroup || 'N/A',
            experiment_name: "squeeze",
            experiment_version: "1.0",
            browser_data: getBrowserData(), // From utils.js
            experiment_config: {
                total_videos_configured: TOTAL_VIDEOS_TO_PLAY,
                hard_video_urls: hardVideoURLs, 
                soft_video_urls: softVideoURLs  
            }
        };
        allTrialsData = []; // Initialize/reset trials data array
        console.log("Experiment session initialized:", sessionData);
    }

    function runFixationCrossSequence() {
        
        // Make sure experiment area is visible and cue display is ready
        if (experimentArea && cueDisplayElement && cueShapeElement) {
            experimentArea.classList.remove('hidden');
            cueDisplayElement.classList.add('hidden'); // Ensure it's hidden initially
                
            // Set up the fixation cross
            cueShapeElement.className = 'cue-element fixation-cross'; // Set to be a cross
            for (let i = 0; i < 25; i++) {

                // Show the fixation cross after 500ms ITI
                setTimeout(() => {
                    cueDisplayElement.classList.remove('hidden'); // Show the cross
                    console.log("Fixation cross displayed");
                    
                    // Random delay between 0.5-1 second before showing the blue dot
                    const dotDelay = Math.floor(Math.random() * 501) + 500; // 500-1000ms
                    
                    // Show the blue dot after the random delay
                    setTimeout(() => {
                        blueDotElement.style.display = 'block'; // Show the blue dot
                        console.log("Blue dot displayed");
                        
                        // Hide the blue dot after 0.25 seconds
                        setTimeout(() => {
                            blueDotElement.style.display = 'none'; // Hide the blue dot
                            console.log("Blue dot hidden");
                            
                            // Hide the cross after another 0.25 seconds
                            setTimeout(() => {
                                cueDisplayElement.classList.add('hidden'); // Hide the cross
                                console.log("Fixation cross hidden, sequence complete");
                            }, 250); // 0.25 seconds
                            
                        }, 250); // 0.25 seconds
                        
                    }, dotDelay);
                }, 500);
            }
        } else {
            console.error("Required elements for fixation cross not found.");
        }
    }

    startButton.addEventListener('click', () => {
        if (instructionsScreen) {
            instructionsScreen.classList.add('hidden');
        }
        // For now, we directly run the fixation cross sequence.
        // The original video setup is bypassed.
        runFixationCrossSequence();

        // Commenting out or removing the original YouTube player initialization
        // if (window.YT && window.YT.Player) {
        //     console.log("YouTube API already loaded, creating player.");
        //     createYouTubePlayer();
        // } else {
        //     console.log("YouTube API not loaded, setting callback.");
        //     window.youTubePlayerReadyCallback = createYouTubePlayer;
        //     if (!window.YT) { // If YT namespace isn't even there, API script might be missing/failed
        //         console.warn("YT object not found, API script might not have loaded.");
        //     }
        // }
        // initializeExperimentSession(); // This might also be related to data saving for videos
        // updateTrialDisplay(); // UI update for trials, might not be relevant yet
    });

    if (typeof window.onYouTubeIframeAPIReady === 'undefined') {
        window.onYouTubeIframeAPIReady = function() {
            console.log("YouTube Iframe API is ready (fallback registration).");
            if (window.youTubePlayerReadyCallback) {
                window.youTubePlayerReadyCallback();
                window.youTubePlayerReadyCallback = null;
            }
        };
    }
});