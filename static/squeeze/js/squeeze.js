document.addEventListener('DOMContentLoaded', () => {
    const hardVideoURLs = [
        'https://youtu.be/EKlJn3o2YHM', 'https://youtu.be/LS_6wuTNTqM', 'https://youtu.be/LcLo5QlDby8',
        'https://youtu.be/r2FdMMp8ZIE'
    ];
    const softVideoURLs = [
        //'https://youtu.be/fEHf0pPdQSo',  Ignored because it's going to be updated; also it's too short (only 3 seconds)
        'https://youtu.be/OFXJm1_v0qs', 'https://youtu.be/VK0wbMWlq0s',
        'https://youtu.be/VTP2CuLw9F4', 'https://youtu.be/qX1dzS9c6Zs'
    ];
    const youtubeVideoURLs = hardVideoURLs.concat(softVideoURLs); // Combine for ID extraction

    const TOTAL_VIDEOS_TO_PLAY = 40;

    let player;
    let playlist = []; // Renamed from shuffledVideoIds for clarity, will store {id, type}
    let currentVideoIndex = 0;

    const instructionsScreen = document.getElementById('instructions-screen');
    const startButton = document.getElementById('start-button');
    const experimentArea = document.getElementById('experiment-area');
    const endScreen = document.getElementById('end-screen');
    const trialCounterElement = document.getElementById('trial-counter');
    const totalTrialsDisplayElement = document.getElementById('total-trials-display');
    const YOUTUBE_PLAYER_DIV_ID = 'youtube-player-container';

    const cueDisplayElement = document.getElementById('cue-display');
    const cueShapeElement = document.getElementById('cue-shape');
    const feedbackTextElement = document.getElementById('feedback-text');
    
    let dotTimer = null;
    let hasDotBeenScheduledForCurrentVideo = false;

    let dotAppearanceTime = null;
    let hasRespondedThisVideo = false;
    let feedbackTimeout = null;

    // Moved getVideoId here, before initializeVideoPlayback
    function getVideoId(url) {
        let videoId = '';
        const patterns = [
            /youtu\.be\/([^#\&\?]{11})/,
            /[?&]v=([^#\&\?]{11})/,
            /embed\/([^#\&\?]{11})/
        ];
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                videoId = match[1];
                break;
            }
        }
        if (!videoId) console.warn(`Could not extract video ID from URL: ${url}`);
        return videoId;
    }

    if (cueShapeElement) {
        cueShapeElement.classList.add('cue-dot'); // Make it a circle
    }
    if (cueDisplayElement) {
        cueDisplayElement.classList.add('hidden'); // Ensure it starts hidden
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
    
    window.onYouTubeIframeAPIReady = function() {
        console.log("YouTube Iframe API is ready.");
        if (window.youTubePlayerReadyCallback) {
            window.youTubePlayerReadyCallback();
            window.youTubePlayerReadyCallback = null; // Clear callback after use
        }
    };

    function createYouTubePlayer(videoId) {
        if (!experimentArea) {
            console.error("Experiment area not found for YouTube player.");
            return;
        }

        // Create a container for the YouTube player
        const playerContainerDiv = document.createElement('div');
        playerContainerDiv.id = YOUTUBE_PLAYER_DIV_ID;

        // Clear existing content from experimentArea
        experimentArea.innerHTML = ''; 

        // Add the player container
        experimentArea.appendChild(playerContainerDiv);

        // Re-append the cue display element if it exists
        // This makes it a sibling to the player container, allowing overlay
        if (cueDisplayElement) {
            experimentArea.appendChild(cueDisplayElement);
            // Ensure it's hidden initially when (re)added, manageDotDisplay will show it
            cueDisplayElement.classList.add('hidden'); 
        }
        
        const containerWidth = playerContainerDiv.clientWidth > 0 ? playerContainerDiv.clientWidth : (experimentArea.clientWidth > 0 ? experimentArea.clientWidth : 640);
        const playerHeight = (containerWidth / 16) * 9;

        player = new YT.Player(YOUTUBE_PLAYER_DIV_ID, {
            height: String(Math.round(playerHeight)),
            width: String(containerWidth),
            videoId: videoId,
            playerVars: {
                'playsinline': 1, 'autoplay': 1, 'controls': 0, 
                'rel': 0, 'modestbranding': 1, 'iv_load_policy': 3,
                'end': 3 // Changed from 5 to 3: Stop the first video after 3 seconds
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange
            }
        });
    }

    function onPlayerReady(event) {
        console.log("YouTube Player ready. Video ID:", event.target.getVideoData().video_id);
    }

    function onPlayerStateChange(event) {
        if (event.data === YT.PlayerState.PLAYING && !hasDotBeenScheduledForCurrentVideo) {
            hasRespondedThisVideo = false; // Should be redundant if playNextVideoInSequence did it, but safe.
            console.log("[onPlayerStateChange PLAYING] New video now playing. Confirming hasRespondedThisVideo = false.");
            dotAppearanceTime = null; 
            clearFeedback();
            manageDotDisplay();
            hasDotBeenScheduledForCurrentVideo = true;
        } else if (event.data === YT.PlayerState.ENDED) {
            console.log("[onPlayerStateChange ENDED] Video ended.");
            clearTimeout(dotTimer);
            if (cueDisplayElement) cueDisplayElement.classList.add('hidden');
            
            // Removed "Too Slow!" message logic
            // if (dotAppearanceTime !== null && !hasRespondedThisVideo) { ... }
            // Also, if dot never appeared and no response, just clear feedback.
            if (dotAppearanceTime === null && !hasRespondedThisVideo) {
                 clearFeedback(); 
            }

            dotAppearanceTime = null;
            if (!hasRespondedThisVideo) {
                 hasRespondedThisVideo = true;
                 console.log("[onPlayerStateChange ENDED] No prior response for this trial, setting hasRespondedThisVideo = true now.");
            } else {
                 console.log("[onPlayerStateChange ENDED] hasRespondedThisVideo was already true from earlier interaction.");
            }

            currentVideoIndex++;
            hasDotBeenScheduledForCurrentVideo = false;
            
            playNextVideoInSequence(); // Call directly, removing the 250ms delay

        } else if (event.data === YT.PlayerState.PAUSED) {
            console.log("[onPlayerStateChange PAUSED] Video paused.");
        }
    }

    function manageDotDisplay() {
        clearTimeout(dotTimer);
        if (cueDisplayElement) cueDisplayElement.classList.add('hidden');

        const minDotTime = 500;  
        const maxDotTime = 2500; 
        const randomDelay = Math.floor(Math.random() * (maxDotTime - minDotTime + 1)) + minDotTime;

        // console.log(`[manageDotDisplay] Dot will appear after ${randomDelay}ms.`); // Keep for debugging if needed

        dotTimer = setTimeout(() => {
            if (cueShapeElement && cueDisplayElement && player && player.getPlayerState && playlist[currentVideoIndex]) {
                if (player.getPlayerState() !== YT.PlayerState.PLAYING) {
                    // console.log("[manageDotDisplay] Video no longer playing when dot was scheduled. Not showing dot.");
                    dotAppearanceTime = null; 
                    return;
                }

                const currentTrial = playlist[currentVideoIndex];
                const requiredDotColor = currentTrial.dotColor; // Get color from playlist object

                cueShapeElement.classList.remove('cue-orange', 'cue-green'); // Clear previous colors
                if (requiredDotColor === 'orange') {
                    cueShapeElement.classList.add('cue-orange');
                } else if (requiredDotColor === 'green') {
                    cueShapeElement.classList.add('cue-green');
                } else {
                    console.warn(`[manageDotDisplay] Unknown dotColor '${requiredDotColor}' defined for trial. Defaulting to green.`);
                    cueShapeElement.classList.add('cue-green'); // Default fallback
                }
                
                cueDisplayElement.classList.remove('hidden');
                dotAppearanceTime = performance.now();
                console.log(`[manageDotDisplay] Dot displayed (Color: ${requiredDotColor} at ${randomDelay}ms). Response window open.`);
            } else {
                // console.log("[manageDotDisplay] Conditions not met to show dot (e.g. no player, or playlist item missing).");
            }
        }, randomDelay); 
    }

    function updateTrialDisplay() {
        if (trialCounterElement) {
            trialCounterElement.textContent = String(currentVideoIndex + 1 > TOTAL_VIDEOS_TO_PLAY ? TOTAL_VIDEOS_TO_PLAY : currentVideoIndex + 1);
        }
        if (totalTrialsDisplayElement) {
            totalTrialsDisplayElement.textContent = String(TOTAL_VIDEOS_TO_PLAY);
        }
    }

    function playNextVideoInSequence() {
        if (currentVideoIndex < playlist.length) { // Changed from shuffledVideoIds
            updateTrialDisplay();
            dotAppearanceTime = null;
            hasRespondedThisVideo = false; 

            const nextVideoObject = playlist[currentVideoIndex]; // Changed from shuffledVideoIds
            if (player && typeof player.loadVideoById === 'function') {
                console.log(`Loading video ${currentVideoIndex + 1} of ${playlist.length}: ${nextVideoObject.id} (Type: ${nextVideoObject.type}), to play for 3 seconds.`);
                player.loadVideoById({ 
                    'videoId': nextVideoObject.id, // Use id from object
                    'endSeconds': 4
                });
            } else {
                console.error("Player not available or not fully initialized to load next video.");
            }
        } else {
            console.log(`All ${TOTAL_VIDEOS_TO_PLAY} videos played.`);
            if(experimentArea) experimentArea.classList.add('hidden');
            if(player && typeof player.destroy === 'function') {
                try { player.destroy(); } catch(e) { console.error("Error destroying player", e); }
                player = null;
            }
            if(endScreen) endScreen.classList.remove('hidden');
            clearTimeout(dotTimer);
            if (cueDisplayElement) cueDisplayElement.classList.add('hidden');
            clearFeedback();
        }
    }

    function initializeVideoPlayback() {
        const hardVideoIds = hardVideoURLs.map(url => getVideoId(url)).filter(id => id);
        const softVideoIds = softVideoURLs.map(url => getVideoId(url)).filter(id => id);

        if (hardVideoIds.length === 0 || softVideoIds.length === 0) { // Ensure we have at least one of each type for the new logic
            console.error("Cannot proceed: Need at least one hard and one soft video defined.");
            if (instructionsScreen) instructionsScreen.textContent = "Error: Define at least one hard and one soft video.";
            if (startButton) startButton.disabled = true;
            return;
        }
        
        console.log("Available Hard video IDs:", hardVideoIds);
        console.log("Available Soft video IDs:", softVideoIds);

        playlist = []; // Clear previous playlist

        const numHardOrange = 10;
        const numHardGreen = 10;
        const numSoftOrange = 10;
        const numSoftGreen = 10;

        // Create hard trials
        for (let i = 0; i < numHardOrange; i++) {
            playlist.push({ 
                id: hardVideoIds[i % hardVideoIds.length], 
                type: 'hard', 
                dotColor: 'orange' 
            });
        }
        for (let i = 0; i < numHardGreen; i++) {
            playlist.push({ 
                id: hardVideoIds[(i + numHardOrange) % hardVideoIds.length], // Continue cycling through hardVideoIds
                type: 'hard', 
                dotColor: 'green' 
            });
        }

        // Create soft trials
        for (let i = 0; i < numSoftOrange; i++) {
            playlist.push({ 
                id: softVideoIds[i % softVideoIds.length], 
                type: 'soft', 
                dotColor: 'orange' 
            });
        }
        for (let i = 0; i < numSoftGreen; i++) {
            playlist.push({ 
                id: softVideoIds[(i + numSoftOrange) % softVideoIds.length], // Continue cycling through softVideoIds
                type: 'soft', 
                dotColor: 'green' 
            });
        }

        if (playlist.length !== TOTAL_VIDEOS_TO_PLAY) {
            console.warn(`Playlist length (${playlist.length}) does not match TOTAL_VIDEOS_TO_PLAY (${TOTAL_VIDEOS_TO_PLAY}). This might be due to rounding or logic error in trial generation.`);
            // This is a sanity check. Given the fixed numbers (10+10+10+10=40), it should match if TOTAL_VIDEOS_TO_PLAY is 40.
        }

        shuffleArray(playlist); 

        if (playlist.length === 0) {
            console.error("Playlist is empty after attempting to populate and shuffle.");
            if (instructionsScreen) instructionsScreen.textContent = "Error: Could not create video playlist.";
            if (startButton) startButton.disabled = true;
            return;
        }

        console.log(`Initialized playlist with ${playlist.length} videos.`);
        console.log("Current playlist (first 5 items):", playlist.slice(0,5));
        // Example log to check distribution (optional)
        // console.log("Full playlist for debugging:", JSON.stringify(playlist, null, 2));

        if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
            console.log("YouTube API not loaded. Loading now...");
            const tag = document.createElement('script');
            tag.src = "https://www.youtube.com/iframe_api";
            const firstScriptTag = document.getElementsByTagName('script')[0];
            if (firstScriptTag && firstScriptTag.parentNode) {
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            } else {
                document.head.appendChild(tag); 
            }
            window.youTubePlayerReadyCallback = () => {
                console.log("YouTube API ready via global callback. Creating player for first video:", playlist[0].id);
                createYouTubePlayer(playlist[0].id); 
            };
        } else {
            console.log("YouTube API already loaded. Creating player for first video:", playlist[0].id);
            createYouTubePlayer(playlist[0].id);
        }
        updateTrialDisplay(); 
    }

    function clearFeedback() {
        if (feedbackTextElement) feedbackTextElement.textContent = '';
        clearTimeout(feedbackTimeout);
    }

    function showFeedbackMessage(message, duration = null) { // Default duration null for persistence
        clearFeedback(); // Clear any existing message and its timeout
        if (feedbackTextElement) {
            feedbackTextElement.textContent = message;
            if (duration) { // Only set a timeout to clear if a duration is provided
                feedbackTimeout = setTimeout(() => {
                    if (feedbackTextElement.textContent === message) { 
                        feedbackTextElement.textContent = '';
                    }
                }, duration);
            }
        }
    }

    function handleUserResponse(event) {
        // console.log(`[handleUserResponse] Entry - Key: '${event.key}', Player State: ${player ? player.getPlayerState() : 'N/A'}, Responded: ${hasRespondedThisVideo}, Dot Time: ${dotAppearanceTime}`);

        if (hasRespondedThisVideo) {
            // console.log("[handleUserResponse] Already responded for this trial.");
            return;
        }

        if (!player || typeof player.getPlayerState !== 'function' || player.getPlayerState() !== YT.PlayerState.PLAYING) {
            // console.log("[handleUserResponse] Player not ready or not playing.");
            return;
        }

        const key = event.key.toLowerCase();

        if (dotAppearanceTime === null) { // Dot has NOT appeared yet
            if (key === 's' || key === 'h') {
                hasRespondedThisVideo = true;
                showFeedbackMessage("Too quick!");
                console.log(`[handleUserResponse] Key '${key}' pressed: Too quick!`);
            }
            // For any other key, or if no S/H, do nothing until dot appears
            return;
        }

        // Dot HAS appeared (dotAppearanceTime is not null)
        if (key === 's' || key === 'h') {
            hasRespondedThisVideo = true;
            const reactionTime = performance.now() - dotAppearanceTime;
            const currentTrial = playlist[currentVideoIndex];
            
            if (!currentTrial) {
                console.error("[handleUserResponse] Critical error: currentTrial is undefined. Index:", currentVideoIndex, "Playlist:", playlist);
                showFeedbackMessage("Error: Could not determine video type/color.");
                return;
            }
            const currentVideoType = currentTrial.type;
            const currentDotColor = currentTrial.dotColor;
            let isActuallyCorrect = false; 
            let message = '';

            // Determine base correctness (before considering inversion)
            let baseCorrect = false;
            if (key === 's' && currentVideoType === 'soft') {
                baseCorrect = true;
            } else if (key === 'h' && currentVideoType === 'hard') {
                baseCorrect = true;
            }

            // Apply inversion if the dot was orange
            if (currentDotColor === 'orange') {
                isActuallyCorrect = !baseCorrect; // Invert the correctness
            } else {
                isActuallyCorrect = baseCorrect; // No inversion for green dot
            }

            if (isActuallyCorrect) {
                message = `Correct! (Vid: ${currentVideoType}, Dot: ${currentDotColor}). RT: ${reactionTime.toFixed(0)} ms`;
            } else {
                message = `Incorrect. (Vid: ${currentVideoType}, Dot: ${currentDotColor}). RT: ${reactionTime.toFixed(0)} ms`;
            }
            showFeedbackMessage(message);
            console.log(`[handleUserResponse] Key '${key}', VidType: ${currentVideoType}, DotColor: ${currentDotColor}, BaseCorrect: ${baseCorrect}, IsActuallyCorrect: ${isActuallyCorrect}, RT: ${reactionTime.toFixed(0)}ms. Feedback: "${message}"`);
            
            if (cueDisplayElement) cueDisplayElement.classList.add('hidden');
            clearTimeout(dotTimer); // Stop dot timer as a response has been made
        } else {
            // Invalid key pressed AFTER dot has appeared
            hasRespondedThisVideo = true; 
            showFeedbackMessage("Invalid Key (Press S or H)");
            console.log(`[handleUserResponse] Invalid key '${key}' pressed after dot.`);
        }
    }

    document.addEventListener('keydown', handleUserResponse);

    startButton.addEventListener('click', () => {
        console.log("Start button clicked. Transitioning to video playback.");

        if(instructionsScreen) instructionsScreen.classList.add('hidden');
        if(experimentArea) experimentArea.classList.remove('hidden');
        if(endScreen) endScreen.classList.add('hidden');
        if (cueDisplayElement) cueDisplayElement.classList.add('hidden');
        clearFeedback();

        hasDotBeenScheduledForCurrentVideo = false;
        dotAppearanceTime = null;
        hasRespondedThisVideo = false;

        if (totalTrialsDisplayElement) {
            totalTrialsDisplayElement.textContent = String(TOTAL_VIDEOS_TO_PLAY);
        }
        if (trialCounterElement) {
            trialCounterElement.textContent = '0'; 
        }

        if (typeof YT !== "undefined" && typeof YT.Player !== "undefined") {
            initializeVideoPlayback();
        } else {
            console.log("YouTube API not fully ready yet. Setting callback for when it is.");
            window.youTubePlayerReadyCallback = initializeVideoPlayback;
            if (typeof YT === "undefined") {
                console.warn("YT object not found. YouTube API script might not have loaded. Ensure index.html includes it.");
            }
        }
    });

    // Ensure onYouTubeIframeAPIReady is globally accessible if not already
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