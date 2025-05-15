document.addEventListener('DOMContentLoaded', () => {
    const youtubeVideoURLs = [
        'https://youtu.be/EKlJn3o2YHM', 'https://youtu.be/OFXJm1_v0qs', 'https://youtu.be/LcLo5QlDby8',
        'https://youtu.be/r2FdMMp8ZIE', 'https://youtu.be/fEHf0pPdQSo', 'https://youtu.be/OFXJm1_v0qs', // Duplicate as per user list
        'https://youtu.be/VK0wbMWlq0s', 'https://youtu.be/VTP2CuLw9F4', 'https://youtu.be/qX1dzS9c6Zs'
    ];
    const TOTAL_VIDEOS_TO_PLAY = 120;

    let player;
    let shuffledVideoIds = [];
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
    let isNextDotOrange = false;
    let hasDotBeenScheduledForCurrentVideo = false;

    let dotAppearanceTime = null;
    let hasRespondedThisVideo = false;
    let feedbackTimeout = null;

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

        player = new YT.Player(YOUTUBE_PLAYER_DIV_ID, { // Target the new container ID
            height: String(Math.round(playerHeight)),
            width: String(containerWidth),
            videoId: videoId,
            playerVars: {
                'playsinline': 1, 'autoplay': 1, 'controls': 1, 
                'rel': 0, 'modestbranding': 1, 'iv_load_policy': 3
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
            hasRespondedThisVideo = false;
            console.log("[onPlayerStateChange PLAYING] New video playing. Setting hasRespondedThisVideo = false.");
            dotAppearanceTime = null; 
            clearFeedback();
            manageDotDisplay();
            hasDotBeenScheduledForCurrentVideo = true;
        } else if (event.data === YT.PlayerState.ENDED) {
            console.log("[onPlayerStateChange ENDED] Video ended.");
            clearTimeout(dotTimer);
            if (cueDisplayElement) cueDisplayElement.classList.add('hidden');
            
            if (dotAppearanceTime !== null && !hasRespondedThisVideo) {
                showFeedbackMessage("Too Slow!");
                console.log("[onPlayerStateChange ENDED] Response: Too Slow! (hasRespondedThisVideo was false)");
            } else if (dotAppearanceTime === null && !hasRespondedThisVideo) {
                 clearFeedback(); 
            }

            dotAppearanceTime = null;
            if (!hasRespondedThisVideo) {
                 // If no response was logged during the video (e.g. Too Quick, RT, Invalid Key, Too Slow)
                 // we mark it as responded here to finalize the trial before the next one.
                 hasRespondedThisVideo = true;
                 console.log("[onPlayerStateChange ENDED] No prior response, setting hasRespondedThisVideo = true.");
            } else {
                 console.log("[onPlayerStateChange ENDED] hasRespondedThisVideo was already true.");
            }

            currentVideoIndex++;
            hasDotBeenScheduledForCurrentVideo = false;
            
            setTimeout(() => {
                playNextVideoInSequence();
            }, 250);
        }
    }

    function manageDotDisplay() {
        clearTimeout(dotTimer);
        if (cueDisplayElement) cueDisplayElement.classList.add('hidden');
        // dotAppearanceTime is reset when video starts PLAYING, before manageDotDisplay is called
        // hasRespondedThisVideo is also reset at that point

        dotTimer = setTimeout(() => {
            if (cueShapeElement && cueDisplayElement) {
                cueShapeElement.classList.remove('cue-orange', 'cue-green');
                if (isNextDotOrange) {
                    cueShapeElement.classList.add('cue-orange');
                } else {
                    cueShapeElement.classList.add('cue-green');
                }
                cueDisplayElement.classList.remove('hidden');
                isNextDotOrange = !isNextDotOrange;
                dotAppearanceTime = performance.now(); // Dot is now visible
                // hasRespondedThisVideo is already false, allowing a response now.
                console.log(`Dot displayed. Next color: ${isNextDotOrange ? 'orange' : 'green'}. Response window open.`);
            }
        }, 4000);
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
        if (currentVideoIndex < shuffledVideoIds.length) {
            updateTrialDisplay();
            // Reset for the upcoming video
            dotAppearanceTime = null;
            hasRespondedThisVideo = false;
            clearFeedback(); // Clear feedback before new video loads

            const nextVideoId = shuffledVideoIds[currentVideoIndex];
            if (player && typeof player.loadVideoById === 'function') {
                console.log(`Loading video ${currentVideoIndex + 1} of ${shuffledVideoIds.length}: ${nextVideoId}`);
                player.loadVideoById(nextVideoId);
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
        const uniqueVideoIds = youtubeVideoURLs.map(url => getVideoId(url)).filter(id => id);
        if (uniqueVideoIds.length === 0) {
            console.error("No valid unique video IDs were extracted to play.");
            if(experimentArea) experimentArea.innerHTML = "<p>Error: No videos found or could not load video IDs.</p>";
            if (trialCounterElement) trialCounterElement.textContent = '0';
            if (totalTrialsDisplayElement) totalTrialsDisplayElement.textContent = String(TOTAL_VIDEOS_TO_PLAY);
            return;
        }

        let playbackSequence = [];
        for (let i = 0; i < TOTAL_VIDEOS_TO_PLAY; i++) {
            playbackSequence.push(uniqueVideoIds[i % uniqueVideoIds.length]);
        }

        shuffledVideoIds = [...playbackSequence];
        shuffleArray(shuffledVideoIds);
        currentVideoIndex = 0;

        console.log(`Prepared ${shuffledVideoIds.length} videos for playback (should be ${TOTAL_VIDEOS_TO_PLAY}). First video to play: ${shuffledVideoIds[0]}`);
        
        updateTrialDisplay();

        if (shuffledVideoIds.length > 0) {
            createYouTubePlayer(shuffledVideoIds[currentVideoIndex]);
        } else {
            console.error("Video sequence for playback is empty after preparation.");
            if(experimentArea) experimentArea.innerHTML = "<p>Error: Could not prepare video sequence.</p>";
            if (trialCounterElement) trialCounterElement.textContent = '0'; 
        }
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
                    // Only clear if it's still the same message (sanity check)
                    if (feedbackTextElement.textContent === message) { 
                        feedbackTextElement.textContent = '';
                    }
                }, duration);
            }
        }
    }

    function handleUserResponse(event) {
        const playerState = player ? player.getPlayerState() : -1;
        console.log(`[handleUserResponse] Entry - Key: '${event.key}', Player State: ${playerState}, Current hasRespondedThisVideo: ${hasRespondedThisVideo}, Dot Time: ${dotAppearanceTime}`);

        if (!player || typeof player.getPlayerState !== 'function') {
            return;
        }
        
        const currentFetchedPlayerState = player.getPlayerState();
        if (currentFetchedPlayerState !== YT.PlayerState.PLAYING) {
            return;
        }

        const key = event.key.toLowerCase();

        if (hasRespondedThisVideo) {
            console.log(`[handleUserResponse] Bailing: hasRespondedThisVideo is already true.`);
            return;
        }

        if (key === 's' || key === 'h') {
            hasRespondedThisVideo = true;
            console.log(`[handleUserResponse] Valid key. Setting hasRespondedThisVideo = true.`);
            if (dotAppearanceTime === null) {
                showFeedbackMessage("Too Quick!");
            } else {
                const reactionTime = performance.now() - dotAppearanceTime;
                showFeedbackMessage(`Reaction Time: ${reactionTime.toFixed(0)} ms`);
            }
        } else { 
            hasRespondedThisVideo = true; 
            console.log(`[handleUserResponse] Invalid key. Setting hasRespondedThisVideo = true.`);
            showFeedbackMessage("Invalid Key (Press S or H)"); 
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

        isNextDotOrange = false;
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
