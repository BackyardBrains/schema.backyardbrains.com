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
    // const youtubeVideoURLs = hardVideoURLs.concat(softVideoURLs); // No longer directly used for ID extraction for playlist

    const TOTAL_VIDEOS_TO_PLAY = 40;

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
    const YOUTUBE_PLAYER_DIV_ID = 'youtube-player-container';

    const cueDisplayElement = document.getElementById('cue-display');
    const cueShapeElement = document.getElementById('cue-shape');
    let cornerSquareElement = null;

    let dotTimer = null;
    let hasDotBeenScheduledForCurrentVideo = false;
    let dotAppearanceTime = null;

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
        cueShapeElement.classList.add('cue-dot');
    }
    if (cueDisplayElement) {
        cueDisplayElement.classList.add('hidden');
    }

    if (!startButton) {
        console.error("Start button (id: start-button) not found in HTML.");
        return;
    }
    if (!instructionsScreen || !experimentArea || !endScreen) {
        console.error("Required screen DIVs (instructions-screen, experiment-area, end-screen) not found.");
        return;
    }

    function shuffleArray(array) { // shuffle is also in utils.js, but keep local for now if it was already here
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
    
    window.onYouTubeIframeAPIReady = function() {
        console.log("YouTube Iframe API is ready.");
        if (window.youTubePlayerReadyCallback) {
            window.youTubePlayerReadyCallback();
            window.youTubePlayerReadyCallback = null;
        }
    };

    function createYouTubePlayer() {
        if (!experimentArea) {
            console.error("Experiment area not found for YouTube player.");
            return;
        }

        const playerContainerDiv = document.createElement('div');
        playerContainerDiv.id = YOUTUBE_PLAYER_DIV_ID;
        playerContainerDiv.style.visibility = 'hidden'; 

        experimentArea.innerHTML = ''; 
        experimentArea.appendChild(playerContainerDiv);

        if (cueDisplayElement) {
            experimentArea.appendChild(cueDisplayElement);
            cueDisplayElement.classList.add('hidden'); 
        }
        
        const containerWidth = playerContainerDiv.clientWidth > 0 ? playerContainerDiv.clientWidth : (experimentArea.clientWidth > 0 ? experimentArea.clientWidth : 640);
        const playerHeight = (containerWidth / 16) * 9;

        player = new YT.Player(YOUTUBE_PLAYER_DIV_ID, {
            height: String(Math.round(playerHeight)),
            width: String(containerWidth),
            playerVars: {
                'playsinline': 1, 
                'controls': 0, 
                'rel': 0, 'modestbranding': 1, 'iv_load_policy': 3
            },
            events: {
                'onReady': onPlayerInstanceReady,
                'onStateChange': onPlayerStateChange
            }
        });
    }

    function onPlayerInstanceReady(event) {
        console.log("YouTube Player instance ready. Loading initial video.");
        if (player && playlist && playlist.length > 0 && currentVideoIndex < playlist.length) {
            const firstVideoObject = playlist[currentVideoIndex];
            console.log(`Player ready. Loading initial video via loadVideoById: ${firstVideoObject.id}`);
            player.loadVideoById({
                'videoId': firstVideoObject.id,
                'endSeconds': 5
            });
        } else {
            console.error("Player, playlist, or currentVideoIndex not properly set for loading initial video.", playlist, currentVideoIndex);
        }
    }

    function onPlayerStateChange(event) {
        if (event.data === YT.PlayerState.PLAYING) {
            const playerContainer = document.getElementById(YOUTUBE_PLAYER_DIV_ID);
            if (playerContainer) {
                playerContainer.style.visibility = 'visible';
            }

            if (!hasDotBeenScheduledForCurrentVideo) {
                console.log("[onPlayerStateChange PLAYING] New video now playing. Resetting transition lock.");
                isTransitioning = false; // Transition to new video is complete
                dotAppearanceTime = null; 
                manageDotDisplay();
                hasDotBeenScheduledForCurrentVideo = true;
            }
        } else if (event.data === YT.PlayerState.ENDED) {
            if (isTransitioning) {
                console.warn("[onPlayerStateChange ENDED] Transition already in progress. Ignoring this ENDED event.");
                return;
            }
            console.log("[onPlayerStateChange ENDED] Video ended. Attempting to start transition.");
            isTransitioning = true; // Lock to prevent re-entry while transitioning

            clearTimeout(dotTimer);
            if (cueDisplayElement) cueDisplayElement.classList.add('hidden');
            if (cornerSquareElement) cornerSquareElement.style.visibility = 'hidden';

            dotAppearanceTime = null;
            currentVideoIndex++;
            hasDotBeenScheduledForCurrentVideo = false;
            playNextVideoInSequence();
        } else if (event.data === YT.PlayerState.PAUSED) {
            console.log("[onPlayerStateChange PAUSED] Video paused.");
        }
    }

    function manageDotDisplay() {
        clearTimeout(dotTimer);
        if (cueDisplayElement) cueDisplayElement.classList.add('hidden');
        if (cornerSquareElement) cornerSquareElement.style.visibility = 'hidden';

        const minDotTime = 1000;  
        const maxDotTime = 3000; 
        const randomDelay = Math.floor(Math.random() * (maxDotTime - minDotTime + 1)) + minDotTime;

        dotTimer = setTimeout(() => {
            if (cueShapeElement && cueDisplayElement && player && player.getPlayerState && playlist[currentVideoIndex]) {
                if (player.getPlayerState() !== YT.PlayerState.PLAYING) {
                    dotAppearanceTime = null; 
                    return;
                }

                const currentTrial = playlist[currentVideoIndex];
                const requiredDotColor = currentTrial.dotColor;

                cueShapeElement.classList.remove('cue-orange', 'cue-green');
                if (requiredDotColor === 'orange') {
                    cueShapeElement.classList.add('cue-orange');
                } else if (requiredDotColor === 'green') {
                    cueShapeElement.classList.add('cue-green');
                } else {
                    console.warn(`[manageDotDisplay] Unknown dotColor '${requiredDotColor}' defined for trial. Defaulting to green.`);
                    cueShapeElement.classList.add('cue-green');
                }
                
                cueDisplayElement.classList.remove('hidden');
                setTimeout(() => {
                    cueDisplayElement.classList.add('hidden');
                }, 300);
                dotAppearanceTime = performance.now();
                console.log(`[manageDotDisplay] Dot displayed (Color: ${requiredDotColor} at ${randomDelay}ms).`);

                if (cornerSquareElement) {
                    cornerSquareElement.style.visibility = 'visible';
                    if (currentTrial.type === 'hard') {
                        cornerSquareElement.style.backgroundColor = 'gray';
                    } else if (currentTrial.type === 'soft') {
                        cornerSquareElement.style.backgroundColor = 'black';
                    } else {
                        cornerSquareElement.style.backgroundColor = 'transparent';
                    }
                    console.log(`[manageDotDisplay] Corner square shown (Type: ${currentTrial.type}, Color: ${cornerSquareElement.style.backgroundColor}).`);
                }


                // Record trial data
                const trialData = {
                    trial_number: currentVideoIndex,
                    video_id: currentTrial.id,
                    video_type: currentTrial.type,
                    dot_color_on_video: currentTrial.dotColor,
                    dot_scheduled_delay_ms: randomDelay,
                    dot_appearance_timestamp: dotAppearanceTime,
                    corner_square_color_shown: (currentTrial.type === 'hard' ? 'gray' : 'black')
                };
                allTrialsData.push(trialData);
                console.log("Trial data recorded:", trialData);

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
        if (currentVideoIndex < playlist.length) {
            updateTrialDisplay();
            dotAppearanceTime = null;

            const nextVideoObject = playlist[currentVideoIndex];
            if (player && typeof player.loadVideoById === 'function') {
                const playerContainer = document.getElementById(YOUTUBE_PLAYER_DIV_ID);
                if (playerContainer) {
                    playerContainer.style.visibility = 'hidden';
                }
                console.log(`Loading video ${currentVideoIndex + 1} of ${playlist.length}: ${nextVideoObject.id} (Type: ${nextVideoObject.type}), to play for 5 seconds.`);
                player.loadVideoById({ 
                    'videoId': nextVideoObject.id,
                    'endSeconds': 5 // Changed to 5
                });
            } else {
                console.error("Player not available or not fully initialized to load next video.");
            }
        } else {
            console.log(`All ${TOTAL_VIDEOS_TO_PLAY} videos played. Preparing to send data.`);
            if(experimentArea) experimentArea.classList.add('hidden');
            if(player && typeof player.destroy === 'function') {
                try { player.destroy(); } catch(e) { console.error("Error destroying player", e); }
                player = null;
            }
            if(endScreen) endScreen.classList.remove('hidden');
            clearTimeout(dotTimer);
            if (cueDisplayElement) cueDisplayElement.classList.add('hidden');
            if (cornerSquareElement) cornerSquareElement.style.visibility = 'hidden';
            
            // Send data to server
            const finalDataPayload = {
                session_info: sessionData,
                trial_data: allTrialsData
            };
            sendDataToServer(finalDataPayload, experimentUUID, 'squeeze'); // from utils.js
            console.log("Final data payload for debugging:", finalDataPayload);
            console.log("Data sending process initiated.");
        }
    }

    function initializeVideoPlayback() {
        const hardVideoIds = hardVideoURLs.map(url => getVideoId(url)).filter(id => id);
        const softVideoIds = softVideoURLs.map(url => getVideoId(url)).filter(id => id);

        if (hardVideoIds.length === 0 || softVideoIds.length === 0) {
            console.error("Cannot proceed: Need at least one hard and one soft video defined.");
            if (instructionsScreen) instructionsScreen.textContent = "Error: Define at least one hard and one soft video.";
            if (startButton) startButton.disabled = true;
            return;
        }
        
        console.log("Available Hard video IDs:", hardVideoIds);
        console.log("Available Soft video IDs:", softVideoIds);

        playlist = [];

        const numHardOrange = 10;
        const numHardGreen = 10;
        const numSoftOrange = 10;
        const numSoftGreen = 10;

        for (let i = 0; i < numHardOrange; i++) {
            playlist.push({ id: hardVideoIds[i % hardVideoIds.length], type: 'hard', dotColor: 'orange' });
        }
        for (let i = 0; i < numHardGreen; i++) {
            playlist.push({ id: hardVideoIds[(i + numHardOrange) % hardVideoIds.length], type: 'hard', dotColor: 'green' });
        }
        for (let i = 0; i < numSoftOrange; i++) {
            playlist.push({ id: softVideoIds[i % softVideoIds.length], type: 'soft', dotColor: 'orange' });
        }
        for (let i = 0; i < numSoftGreen; i++) {
            playlist.push({ id: softVideoIds[(i + numSoftOrange) % softVideoIds.length], type: 'soft', dotColor: 'green' });
        }

        if (playlist.length !== TOTAL_VIDEOS_TO_PLAY) {
            console.warn(`Playlist length (${playlist.length}) does not match TOTAL_VIDEOS_TO_PLAY (${TOTAL_VIDEOS_TO_PLAY}).`);
        }

        shuffleArray(playlist); // Uses local shuffle or utils.js if that's preferred

        if (playlist.length === 0) {
            console.error("Playlist is empty.");
            if (instructionsScreen) instructionsScreen.textContent = "Error: Could not create video playlist.";
            if (startButton) startButton.disabled = true;
            return;
        }

        console.log(`Initialized playlist with ${playlist.length} videos.`);
        console.log("Current playlist (first 5 items):", playlist.slice(0,5));

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
                createYouTubePlayer();
            };
        } else {
            console.log("YouTube API already loaded. Creating player for first video:", playlist[0].id);
            createYouTubePlayer();
        }
        updateTrialDisplay(); 
    }

    function initializeCornerSquare() {
        cornerSquareElement = document.createElement('div');
        cornerSquareElement.style.position = 'fixed';
        cornerSquareElement.style.bottom = '30px';
        cornerSquareElement.style.right = '30px';
        cornerSquareElement.style.width = '100px';
        cornerSquareElement.style.height = '100px';
        cornerSquareElement.style.backgroundColor = 'transparent';
        cornerSquareElement.style.visibility = 'hidden';
        cornerSquareElement.style.zIndex = '2000';
        document.body.appendChild(cornerSquareElement);
        console.log("Corner square initialized.");
    }
    
    initializeCornerSquare();

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

    startButton.addEventListener('click', () => {
        console.log("Start button clicked. Transitioning to video playback.");
        
        initializeExperimentSession(); // Initialize session and data collection arrays

        if(instructionsScreen) instructionsScreen.classList.add('hidden');
        if(experimentArea) experimentArea.classList.remove('hidden');
        if(endScreen) endScreen.classList.add('hidden');
        if (cueDisplayElement) cueDisplayElement.classList.add('hidden');
        if (cornerSquareElement) cornerSquareElement.style.visibility = 'hidden';

        hasDotBeenScheduledForCurrentVideo = false;
        dotAppearanceTime = null;

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
                console.warn("YT object not found. YouTube API script might not have loaded.");
            }
        }
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