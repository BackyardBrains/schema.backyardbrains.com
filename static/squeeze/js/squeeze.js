document.addEventListener('DOMContentLoaded', () => {
    const hardVideoURLs = [
        "https://cdn.jsdelivr.net/gh/loftusmi3/byb-squeeze-videos@8717b6ab917974cddfb96d9311f4b83b68a36578/hard1.mp4",
        "https://cdn.jsdelivr.net/gh/loftusmi3/byb-squeeze-videos@8717b6ab917974cddfb96d9311f4b83b68a36578/hard2.mp4",
        "https://cdn.jsdelivr.net/gh/loftusmi3/byb-squeeze-videos@8717b6ab917974cddfb96d9311f4b83b68a36578/hard3.mp4",
        "https://cdn.jsdelivr.net/gh/loftusmi3/byb-squeeze-videos@8717b6ab917974cddfb96d9311f4b83b68a36578/hard4.mp4"
    ];
    const softVideoURLs = [
        "https://cdn.jsdelivr.net/gh/loftusmi3/byb-squeeze-videos@8717b6ab917974cddfb96d9311f4b83b68a36578/soft2.mp4",
        "https://cdn.jsdelivr.net/gh/loftusmi3/byb-squeeze-videos@8717b6ab917974cddfb96d9311f4b83b68a36578/soft3.mp4",
        "https://cdn.jsdelivr.net/gh/loftusmi3/byb-squeeze-videos@8717b6ab917974cddfb96d9311f4b83b68a36578/soft4.mp4",
        "https://cdn.jsdelivr.net/gh/loftusmi3/byb-squeeze-videos@8717b6ab917974cddfb96d9311f4b83b68a36578/soft5.mp4"
    ];

    const TOTAL_VIDEOS_TO_PLAY = 40;

    let player; // This will be the single, persistent Video.js player instance
    let playlist = [];
    let currentVideoIndex = 0;

    const instructionsScreen = document.getElementById('instructions-screen');
    const startButton = document.getElementById('start-button');
    const experimentArea = document.getElementById('experiment-area');
    const endScreen = document.getElementById('end-screen');
    const trialCounterElement = document.getElementById('trial-counter');
    const totalTrialsDisplayElement = document.getElementById('total-trials-display');
    const VIDEO_PLAYER_ID = 'my-video-player';

    const cueDisplayElement = document.getElementById('cue-display');
    const cueShapeElement = document.getElementById('cue-shape');
    const feedbackTextElement = document.getElementById('feedback-text');
    
    let dotTimer = null;
    let durationTimeout = null;
    let hasDotBeenScheduledForCurrentVideo = false;
    let dotAppearanceTime = null;
    let hasRespondedThisVideo = false;
    let feedbackTimeout = null;

    function getVideoSrc(url) {
        return url;
    }

    if (cueShapeElement) {
        cueShapeElement.classList.add('cue-dot');
    }
    if (cueDisplayElement) {
        cueDisplayElement.classList.add('hidden');
    }
    if (feedbackTextElement) {
        feedbackTextElement.textContent = '';
    }

    if (!startButton) {
        console.error("Start button (id: start-button) not found in HTML.");
        return;
    }
    if (!instructionsScreen || !experimentArea || !endScreen) {
        console.error("Required screen DIVs (instructions-screen, experiment-area, end-screen) not found.");
        return;
    }
    if (!feedbackTextElement) {
        console.warn("feedback-text element not found. Feedback messages will not be shown.");
    }

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
    
    function initializeGlobalPlayer() {
        const videoElement = document.getElementById(VIDEO_PLAYER_ID);

        if (!videoElement) {
            console.error(`FATAL: Video element with ID '${VIDEO_PLAYER_ID}' not found in HTML. Player cannot be initialized.`);
            if (instructionsScreen) {
                instructionsScreen.innerHTML = `Error: Video player element (ID: ${VIDEO_PLAYER_ID}) not found. Please ensure your HTML is set up correctly.`;
                instructionsScreen.classList.remove('hidden');
                if (startButton) startButton.style.display = 'none'; // Hide start button if essential element missing
            }
            if (startButton) startButton.disabled = true;
            return false; // Indicate failure
        }

        if (!experimentArea) {
            console.error("FATAL: Experiment area element not found. Player cannot be initialized.");
             if (instructionsScreen) {
                instructionsScreen.innerHTML = `Error: Experiment area DIV not found. Critical HTML structure missing.`;
                instructionsScreen.classList.remove('hidden');
                 if (startButton) startButton.style.display = 'none';
            }
            if (startButton) startButton.disabled = true;
            return false;
        }
        
        // Ensure cueDisplayElement is a child of experimentArea and positioned after the video player
        if (cueDisplayElement && experimentArea.contains(videoElement)) {
            if (experimentArea.contains(cueDisplayElement)) {
                 experimentArea.appendChild(cueDisplayElement); // Re-append to ensure it's after video if already child
            } else {
                console.warn("#cue-display element was not found within experimentArea. Appending it now.");
                experimentArea.appendChild(cueDisplayElement);
            }
        } else if (!cueDisplayElement) {
            console.warn("#cue-display global reference is null or videoElement is not in experimentArea. Cue display might be impaired.");
        }


        videoElement.style.visibility = 'hidden'; // Start hidden, make visible on 'play'

        const playerOptions = {
            autoplay: false,
            controls: false, // No native controls
            // Sources will be set by playNextVideoInSequence
        };

        player = videojs(videoElement, playerOptions); // Initialize the player on the existing element

        player.on('ready', () => {
            console.log("Video.js Player is ready.");
        });

        player.on('play', () => {
            console.log("[Video.js 'play'] Video is playing. Current src:", player.currentSrc());
            const videoEl = player.el(); // Get the player's underlying video element
            if (videoEl) {
                videoEl.style.visibility = 'visible';
            }
            
            hasDotBeenScheduledForCurrentVideo = false; // Reset for the new video
            if (!hasDotBeenScheduledForCurrentVideo) {
                hasRespondedThisVideo = false;
                console.log("[Video.js 'play'] New video event. hasRespondedThisVideo = false.");
                dotAppearanceTime = null;
                clearFeedback();
                manageDotDisplay();
                hasDotBeenScheduledForCurrentVideo = true;
            }
        });

        player.on('ended', () => {
            console.log("[Video.js 'ended'] Video naturally ended.");
            player.off('timeupdate', onTimeUpdateForFixedDuration);
            clearTimeout(durationTimeout);

            const videoEl = player.el();
            if (videoEl) videoEl.style.visibility = 'hidden';
            
            clearTimeout(dotTimer);
            if (cueDisplayElement) cueDisplayElement.classList.add('hidden');
            
            if (dotAppearanceTime === null && !hasRespondedThisVideo) {
                clearFeedback();
            }
            dotAppearanceTime = null;
            if (!hasRespondedThisVideo) {
                hasRespondedThisVideo = true;
                console.log("[Video.js 'ended'] No prior response, setting hasRespondedThisVideo = true.");
            }

            currentVideoIndex++;
            hasDotBeenScheduledForCurrentVideo = false; // Reset before playing next
            playNextVideoInSequence();
        });

        player.on('pause', () => {
            console.log("[Video.js 'pause'] Video paused.");
        });

        player.on('error', function() {
            const error = player.error();
            console.error("Video.js Player Error:", error ? error.message : "Unknown error", "Video source:", player.currentSrc());
            
            const videoEl = player.el(); // Hide video element on error
            if (videoEl) videoEl.style.visibility = 'hidden';

            if (instructionsScreen && !instructionsScreen.classList.contains('hidden') && error) {
                let errorMsg = "Video playback error.";
                if (error.code && error.message) errorMsg += ` (Code: ${error.code}, Message: ${error.message})`;
                else if (error.code) errorMsg += ` (Code: ${error.code})`;
                else if (error.message) errorMsg += ` (Message: ${error.message})`;
                
                if (!instructionsScreen.textContent.toLowerCase().includes("error")){
                    instructionsScreen.textContent = errorMsg;
                }
            }
            // Attempt to recover by playing the next video after a short delay
            // This can help skip over a problematic video URL
            console.log("Attempting to play next video after error...");
            clearTimeout(durationTimeout); // Clear any running duration timeout
            clearTimeout(dotTimer); // Clear any running dot timer
            if (cueDisplayElement) cueDisplayElement.classList.add('hidden');
            
            currentVideoIndex++; // Advance index
            hasDotBeenScheduledForCurrentVideo = false;
            setTimeout(() => { // Add a small delay before trying next video
                 playNextVideoInSequence();
            }, 1000);
        });
        return true; // Indicate success
    }

    function manageDotDisplay() {
        clearTimeout(dotTimer);
        if (cueDisplayElement) cueDisplayElement.classList.add('hidden');

        const minDotTime = 750;  
        const maxDotTime = 2500; 
        const randomDelay = Math.floor(Math.random() * (maxDotTime - minDotTime + 1)) + minDotTime;

        dotTimer = setTimeout(() => {
            if (player && !player.isDisposed() && 
                cueShapeElement && cueDisplayElement && 
                !player.paused() && player.readyState() >= 3 && 
                player.el().offsetWidth > 0 && player.el().offsetHeight > 0 && // Check visibility/layout
                playlist[currentVideoIndex]) { 

                const currentTrial = playlist[currentVideoIndex];
                const requiredDotColor = currentTrial.dotColor;

                cueShapeElement.classList.remove('cue-orange', 'cue-green');
                if (requiredDotColor === 'orange') {
                    cueShapeElement.classList.add('cue-orange');
                } else if (requiredDotColor === 'green') {
                    cueShapeElement.classList.add('cue-green');
                }
                cueDisplayElement.classList.remove('hidden');
                dotAppearanceTime = performance.now(); 
                console.log(`Dot displayed. Color: ${requiredDotColor}, Time: ${new Date().toLocaleTimeString()}`);
            } else {
                 console.warn("Dot not shown. Conditions not met:", 
                    {isPlayerDisposed: player ? player.isDisposed() : 'N/A', 
                     isPaused: player ? player.paused() : 'N/A',
                     readyState: player ? player.readyState() : 'N/A',
                     offsetWidth: player && player.el() ? player.el().offsetWidth : 'N/A',
                     offsetHeight: player && player.el() ? player.el().offsetHeight : 'N/A',
                     currentVideo: playlist[currentVideoIndex] ? playlist[currentVideoIndex].src : 'N/A'
                    });
            }
        }, randomDelay);
    }

    function updateTrialDisplay() {
        if (trialCounterElement) {
            trialCounterElement.textContent = currentVideoIndex + 1;
        }
        if (totalTrialsDisplayElement) {
            totalTrialsDisplayElement.textContent = TOTAL_VIDEOS_TO_PLAY;
        }
    }

    const FIXED_VIDEO_DURATION_MS = 3000; 

    function onTimeUpdateForFixedDuration() {
        // This function is primarily for logging or fine-grained control if needed.
        // The main duration control is handled by the setTimeout in playNextVideoInSequence.
        // console.log("Timeupdate:", player.currentTime());
    }

    function playNextVideoInSequence() {
        clearTimeout(durationTimeout); // Clear previous duration timeout
        player.off('timeupdate', onTimeUpdateForFixedDuration); // Clean up previous listener

        const videoEl = player.el();
        if (videoEl) videoEl.style.visibility = 'hidden'; // Hide before loading new source

        if (currentVideoIndex >= TOTAL_VIDEOS_TO_PLAY || currentVideoIndex >= playlist.length) {
            console.log("Experiment sequence finished or playlist exhausted.");
            if (experimentArea) experimentArea.classList.add('hidden');
            if (endScreen) endScreen.classList.remove('hidden');
            if (player) player.dispose(); // Dispose of the player at the very end
            return;
        }

        if (!player || player.isDisposed()) {
            console.error("Player is not available or disposed. Cannot play next video.");
            if (instructionsScreen) {
                instructionsScreen.innerHTML = `Error: Video player became unavailable. Please refresh.`;
                instructionsScreen.classList.remove('hidden');
                if (experimentArea) experimentArea.classList.add('hidden');
                 if (startButton) startButton.style.display = 'none';
            }
            return;
        }
        
        updateTrialDisplay();
        const videoInfo = playlist[currentVideoIndex];
        
        console.log(`Loading video ${currentVideoIndex + 1}/${TOTAL_VIDEOS_TO_PLAY}: ${videoInfo.src}`);

        try {
            player.src({ src: videoInfo.src, type: videoInfo.type });
            player.load(); // Ensure the new source is loaded
            
            // Attempt to play the video.
            const playPromise = player.play();

            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log(`Playback started for: ${videoInfo.src}`);
                    // Video is playing, 'play' event will handle visibility and dot scheduling.
                    
                    // Set timeout for fixed duration
                    clearTimeout(durationTimeout); // Clear any existing timeout
                    durationTimeout = setTimeout(() => {
                        console.log(`Fixed duration of ${FIXED_VIDEO_DURATION_MS}ms reached for ${videoInfo.src}.`);
                        if (player && !player.isDisposed()) {
                            player.pause(); // Pause the video
                            
                            const currentVidEl = player.el(); // Hide it after pausing
                            if (currentVidEl) currentVidEl.style.visibility = 'hidden';

                            clearTimeout(dotTimer); // Stop any pending dot
                            if (cueDisplayElement) cueDisplayElement.classList.add('hidden');

                            if (dotAppearanceTime === null && !hasRespondedThisVideo) {
                                 clearFeedback(); 
                            }
                             dotAppearanceTime = null;
                            if (!hasRespondedThisVideo) {
                                hasRespondedThisVideo = true; 
                                console.log("[Fixed Duration] No prior response, setting hasRespondedThisVideo = true.");
                            }
                            
                            currentVideoIndex++;
                            hasDotBeenScheduledForCurrentVideo = false; // Reset for the next video
                            playNextVideoInSequence(); // Proceed to next video
                        }
                    }, FIXED_VIDEO_DURATION_MS);

                    // Attach timeupdate listener if specific logic needed during playback (optional)
                    player.on('timeupdate', onTimeUpdateForFixedDuration);

                }).catch(error => {
                    console.error(`Error playing video ${videoInfo.src}:`, error);
                    // The global player 'error' handler should also catch this,
                    // but we can log specific details here.
                    // The global error handler will attempt to play the next video.
                });
            } else {
                // For browsers that don't return a promise from play()
                // The 'play' event will still fire if successful.
                console.log("player.play() did not return a promise. Relying on 'play' event.");
            }

        } catch (e) {
            console.error("Error setting source or playing video:", e, "Video source:", videoInfo.src);
            // Global error handler might also be triggered by Video.js if it's an internal player error
            // but this catches issues with player.src() or player.load() itself.
            // Try to advance to the next video.
             console.log("Attempting to play next video after load/src error...");
            clearTimeout(durationTimeout);
            clearTimeout(dotTimer);
            if (cueDisplayElement) cueDisplayElement.classList.add('hidden');
            currentVideoIndex++;
            hasDotBeenScheduledForCurrentVideo = false;
            setTimeout(() => {
                 playNextVideoInSequence();
            }, 500);
        }
    }

    function initializeVideoPlayback() {
        console.log("Initializing video playback sequence...");
        playlist = [];
        let hardCount = 0;
        let softCount = 0;
        const numEachType = TOTAL_VIDEOS_TO_PLAY / 2; // 20 hard, 20 soft

        // Create playlist items with dotColor
        for (let i = 0; i < numEachType; i++) {
            if (hardVideoURLs.length > 0) {
                playlist.push({ 
                    src: getVideoSrc(hardVideoURLs[hardCount % hardVideoURLs.length]), 
                    type: 'video/mp4', 
                    dotColor: 'orange' 
                });
                hardCount++;
            }
            if (softVideoURLs.length > 0) {
                playlist.push({ 
                    src: getVideoSrc(softVideoURLs[softCount % softVideoURLs.length]), 
                    type: 'video/mp4', 
                    dotColor: 'green' 
                });
                softCount++;
            }
        }
        
        // If TOTAL_VIDEOS_TO_PLAY is not an even number or URLs run out, this might not be perfectly balanced
        // This simple loop ensures we try to get close to TOTAL_VIDEOS_TO_PLAY
        while(playlist.length < TOTAL_VIDEOS_TO_PLAY) {
            if (hardCount < softCount && hardVideoURLs.length > 0) {
                 playlist.push({ 
                    src: getVideoSrc(hardVideoURLs[hardCount % hardVideoURLs.length]), 
                    type: 'video/mp4', 
                    dotColor: 'orange' 
                });
                hardCount++;
            } else if (softVideoURLs.length > 0) {
                 playlist.push({ 
                    src: getVideoSrc(softVideoURLs[softCount % softVideoURLs.length]), 
                    type: 'video/mp4', 
                    dotColor: 'green' 
                });
                softCount++;
            } else if (hardVideoURLs.length > 0) { // If only hard left
                 playlist.push({ 
                    src: getVideoSrc(hardVideoURLs[hardCount % hardVideoURLs.length]), 
                    type: 'video/mp4', 
                    dotColor: 'orange' 
                });
                hardCount++;
            } else {
                break; // No more videos to add
            }
        }


        shuffleArray(playlist);
        console.log("Playlist created and shuffled. Total videos:", playlist.length, playlist);

        currentVideoIndex = 0;
        if (trialCounterElement) trialCounterElement.textContent = "0";
        if (totalTrialsDisplayElement) totalTrialsDisplayElement.textContent = TOTAL_VIDEOS_TO_PLAY;
        
        // Player is already initialized by initializeGlobalPlayer. We just start the sequence.
        if (player && !player.isDisposed()) {
            playNextVideoInSequence();
        } else {
            console.error("Player not ready to start video playback sequence. Global player initialization might have failed.");
             if (instructionsScreen && !instructionsScreen.textContent.toLowerCase().includes("error")) {
                instructionsScreen.innerHTML = `Error: Video player could not be initialized. Cannot start experiment.`;
                instructionsScreen.classList.remove('hidden');
                if(startButton) startButton.style.display = 'none';
            }
        }
    }

    function clearFeedback() {
        if (feedbackTextElement) {
            feedbackTextElement.textContent = '';
            feedbackTextElement.className = 'feedback-message'; // Reset classes
        }
        clearTimeout(feedbackTimeout);
    }

    function showFeedbackMessage(message, isCorrect, duration = 1500) { 
        if (feedbackTextElement) {
            feedbackTextElement.textContent = message;
            feedbackTextElement.className = 'feedback-message'; // Reset
            if (isCorrect === true) {
                feedbackTextElement.classList.add('correct');
            } else if (isCorrect === false) {
                feedbackTextElement.classList.add('incorrect');
            }
            // If duration is null, message stays until clearFeedback is called
            if (duration !== null) {
                clearTimeout(feedbackTimeout);
                feedbackTimeout = setTimeout(clearFeedback, duration);
            }
        }
    }

    function handleUserResponse(event) {
        if (hasRespondedThisVideo || dotAppearanceTime === null || !player || player.paused()) {
            // If already responded, or dot hasn't appeared, or video isn't playing, ignore.
            // console.log("Ignoring response. Conditions: hasRespondedThisVideo:", hasRespondedThisVideo, "dotAppearanceTime:", dotAppearanceTime, "playerPaused:", player ? player.paused() : "N/A");
            return;
        }

        const reactionTime = performance.now() - dotAppearanceTime;
        hasRespondedThisVideo = true;
        console.log(`User responded. Reaction time: ${reactionTime.toFixed(0)}ms`);

        const currentTrial = playlist[currentVideoIndex];
        let correctResponseType; // 'orange' or 'green' based on key pressed
        let feedbackMsg = "";
        let wasCorrect = null;

        if (event.key === 'f' || event.key === 'F') {
            correctResponseType = 'orange';
        } else if (event.key === 'j' || event.key === 'J') {
            correctResponseType = 'green';
        } else {
            return; // Ignore other keys
        }

        if (correctResponseType === currentTrial.dotColor) {
            feedbackMsg = "Correct!";
            wasCorrect = true;
        } else {
            feedbackMsg = "Incorrect";
            wasCorrect = false;
        }
        
        showFeedbackMessage(feedbackMsg, wasCorrect);

        // Log data or send to server
        console.log({
            trial: currentVideoIndex + 1,
            videoSrc: currentTrial.src,
            expectedDotColor: currentTrial.dotColor,
            userResponseKey: event.key,
            respondedDotColor: correctResponseType,
            isCorrect: wasCorrect,
            reactionTimeMs: reactionTime,
            dotAppearedAt: dotAppearanceTime,
            respondedAt: performance.now()
        });

        // Hide the dot immediately after response
        clearTimeout(dotTimer);
        if (cueDisplayElement) cueDisplayElement.classList.add('hidden');
        dotAppearanceTime = null; // Reset for next potential dot
    }

    // Setup
    if (startButton && instructionsScreen && experimentArea) {
        startButton.addEventListener('click', () => {
            console.log("Start button clicked.");
            if (instructionsScreen) instructionsScreen.classList.add('hidden');
            if (experimentArea) experimentArea.classList.remove('hidden');
            // Initialize video playback sequence now that user has started
            initializeVideoPlayback(); 
        });
    } else {
        console.error("Could not attach start button listener due to missing elements.");
    }
    
    document.addEventListener('keydown', handleUserResponse);

    // Call initializeGlobalPlayer once the DOM is ready and all elements are available.
    // This sets up the player instance that will be used throughout.
    if (!initializeGlobalPlayer()) {
        console.error("Global player initialization failed. Experiment cannot proceed.");
        // Error message to user should have been handled by initializeGlobalPlayer
    } else {
        console.log("Global Video.js player initialized successfully.");
        // The experiment sequence (initializeVideoPlayback) will be triggered by the start button.
    }
});
