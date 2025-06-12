

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

    const TOTAL_VIDEOS_TO_PLAY = 120;
    const DATAFILE_VERSION = '1.2';
    const COLOR_ACTIONS = {
        orange: 'opposite',
        green: 'same'
    };

    let player;
    let playlist = [];
    let currentVideoIndex = 0;
    let isTransitioning = false; // Flag to manage video transitions

    // Data saving variables
    let sessionData = {};
    let allTrialsData = [];
    let experimentUUID = '';
    let sessionStartMs = null;
    let videoPlayStart = null;

    const instructionsScreen = document.getElementById('instructions-screen');
    const startButton = document.getElementById('start-button');
    const experimentArea = document.getElementById('experiment-area');
    const endScreen = document.getElementById('end-screen');
    const trialCounterElement = document.getElementById('trial-counter');
    const totalTrialsDisplayElement = document.getElementById('total-trials-display');
    const YOUTUBE_PLAYER_DIV_ID = 'youtube-player-container';
    const cornerSquareElement = document.getElementById('corner-square-element')

    const cueDisplayElement = document.getElementById('cue-display');
    const cueShapeElement = document.getElementById('cue-shape');

    let dotTimer = null;
    let hasDotBeenScheduledForCurrentVideo = false;
    let dotAppearanceTime = null;

    cueShapeElement.classList.add('cue-dot');
    cueDisplayElement.classList.add('hidden');
    
    window.onYouTubeIframeAPIReady = function() {
        console.log("YouTube Iframe API is ready.");
        if (window.youTubePlayerReadyCallback) {
            window.youTubePlayerReadyCallback();
            window.youTubePlayerReadyCallback = null;
        }
    };


    // Function definitions
    function createYouTubePlayer() {

        const playerContainerDiv = document.createElement('div');
        playerContainerDiv.id = YOUTUBE_PLAYER_DIV_ID;
        playerContainerDiv.style.visibility = 'hidden'; 

        experimentArea.innerHTML = ''; 
        experimentArea.appendChild(playerContainerDiv);

        experimentArea.appendChild(cueDisplayElement);
        cueDisplayElement.classList.add('hidden'); 
        
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
            console.log(`Player ready. Loading initial video via loadVideoById: ${firstVideoObject.videoId}`);
            player.loadVideoById({
                'videoId': firstVideoObject.videoId,
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
                let playingTrial = playlist[currentVideoIndex];
                playingTrial.startTimestampMs = Date.now();
                videoPlayStart = playingTrial.startTimestampMs;
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
            cueDisplayElement.classList.add('hidden');

            dotAppearanceTime = null;
            hasDotBeenScheduledForCurrentVideo = false;

            playNextVideoInSequence();
        } else if (event.data === YT.PlayerState.PAUSED) {
            console.log("[onPlayerStateChange PAUSED] Video paused.");
        }
    }

    function manageDotDisplay() {
        clearTimeout(dotTimer);
        cueDisplayElement.classList.add('hidden');

        const minDotTime = 1000;  
        const maxDotTime = 3000; 
        const randomDelay = Math.floor(Math.random() * (maxDotTime - minDotTime + 1)) + minDotTime;

        const currentTrial = playlist[currentVideoIndex]

        dotTimer = setTimeout(() => {
            
            if (player.getPlayerState() !== YT.PlayerState.PLAYING) {
                dotAppearanceTime = null; 
                return;
            }
            const requiredDotColor = currentTrial.dotColor;

            cueShapeElement.classList.remove('cue-orange', 'cue-green');

            (requiredDotColor === 'orange') ?
                cueShapeElement.classList.add('cue-orange') :
                cueShapeElement.classList.add('cue-green');

            playlist[currentVideoIndex].dotAppearanceTimestampMs = Date.now();
            cornerSquareElement.style.backgroundColor = "#9F9F9F"

            cueDisplayElement.classList.remove('hidden');

            console.log(`[manageDotDisplay] Corner square shown (Type: ${currentTrial.type}, Color: ${cornerSquareElement.style.backgroundColor}).`);
            
            setTimeout(() => {
                cueDisplayElement.classList.add('hidden');
                // (Square can remain visible until hidden at video end or next trial)
            }, 300);
            dotAppearanceTime = performance.now();

            dotAppearanceTime = Date.now();
            playlist[currentVideoIndex].trialLabel = `${currentTrial.type}${requiredDotColor === 'green' ? '+' : '-'}`;
            playlist[currentVideoIndex].dotPlannedDelayMs = randomDelay;
            playlist[currentVideoIndex].dotOffsetMs = currentTrial.dotAppearanceTimestampMs - videoPlayStart;
            playlist[currentVideoIndex].cornerSquareColor = cornerSquareElement ? cornerSquareElement.style.backgroundColor : null;
            playlist[currentVideoIndex].dotType = COLOR_ACTIONS[requiredDotColor];
            console.log("Dot displayed. Data captured for trial:", currentTrial);

        }, randomDelay); 
    }

    function updateTrialDisplay() {
        trialCounterElement.textContent = String(currentVideoIndex + 1 > TOTAL_VIDEOS_TO_PLAY ? TOTAL_VIDEOS_TO_PLAY : currentVideoIndex + 1);
        totalTrialsDisplayElement.textContent = String(TOTAL_VIDEOS_TO_PLAY);
    }

    function playNextVideoInSequence() {
        if (currentVideoIndex + 1 < playlist.length) {
            
            let finishedTrial = playlist[currentVideoIndex];

            const trialData = {
                trial_number: currentVideoIndex + 1,
                video_id: finishedTrial.videoId,
                video_type: finishedTrial.type,
                trial_label: finishedTrial.trialLabel || `${finishedTrial.type}${finishedTrial.dotColor === 'green' ? '+' : '-'}`,
                dot_type: finishedTrial.dotType || COLOR_ACTIONS[finishedTrial.dotColor],
                dot_planned_delay_ms: finishedTrial.dotPlannedDelayMs,
                dot_offset_from_video_start_ms: finishedTrial.dotOffsetMs,
                trial_start_ts: ((finishedTrial.startTimestampMs || 0) - sessionStartMs) / 1000,
                trial_end_ts: (Date.now() - sessionStartMs) / 1000,
                dot_ts: ((finishedTrial.dotAppearanceTimestampMs || 0) - sessionStartMs) / 1000,
            };
    
            allTrialsData.push(trialData);

            currentVideoIndex++;
            cornerSquareElement.style.backgroundColor = "#CBCBCB"
            updateTrialDisplay();
            dotAppearanceTime = null;

            const nextVideoObject = playlist[currentVideoIndex];
            if (player && typeof player.loadVideoById === 'function') {
                const playerContainer = document.getElementById(YOUTUBE_PLAYER_DIV_ID);
                if (playerContainer) {
                    playerContainer.style.visibility = 'hidden';
                }
                console.log(`Loading video ${currentVideoIndex + 1} of ${playlist.length}: ${nextVideoObject.videoId} (Type: ${nextVideoObject.type}), to play for 5 seconds.`);
                player.loadVideoById({ 
                    'videoId': nextVideoObject.videoId,
                    'endSeconds': 5 // Changed to 5
                });
            } else {
                console.error("Player not available or not fully initialized to load next video.");
            }
        } else {

            let finishedTrial = playlist[currentVideoIndex];

            const trialData = {
                trial_number: currentVideoIndex + 1,
                video_id: finishedTrial.videoId,
                video_type: finishedTrial.type,
                trial_label: finishedTrial.trialLabel || `${finishedTrial.type}${finishedTrial.dotColor === 'green' ? '+' : '-'}`,
                dot_type: finishedTrial.dotType || COLOR_ACTIONS[finishedTrial.dotColor],
                dot_planned_delay_ms: finishedTrial.dotPlannedDelayMs,
                dot_offset_from_video_start_ms: finishedTrial.dotOffsetMs,
                trial_start_ts: ((finishedTrial.startTimestampMs || 0) - sessionStartMs) / 1000,
                trial_end_ts: (Date.now() - sessionStartMs) / 1000,
                dot_ts: ((finishedTrial.dotAppearanceTimestampMs || 0) - sessionStartMs) / 1000,
            };
    
            allTrialsData.push(trialData);
            currentVideoIndex++;

            cornerSquareElement.style.backgroundColor = "#CBCBCB"
            console.log(`All ${TOTAL_VIDEOS_TO_PLAY} videos played. Preparing to send data.`);
            experimentArea.classList.add('hidden');
            if(player && typeof player.destroy === 'function') {
                try { player.destroy(); } catch(e) { console.error("Error destroying player", e); }
                player = null;
            }
            endScreen.classList.remove('hidden');
            clearTimeout(dotTimer);
            cueDisplayElement.classList.add('hidden');
            
            // Send data to server
            const finalData = {
                session: sessionData,
                trials: allTrialsData
            };
            sendDataToServer(finalData, experimentUUID, 'squeeze'); // from utils.js
            console.log("Final data payload for debugging:", finalData);
            console.log("Data sending process initiated.");
        }
    }

    function initializeVideoPlayback() {
        const hardVideoIds = hardVideoURLs.map(url => getVideoId(url)).filter(id => id);
        const softVideoIds = softVideoURLs.map(url => getVideoId(url)).filter(id => id);
        
        console.log("Available Hard video IDs:", hardVideoIds);
        console.log("Available Soft video IDs:", softVideoIds);

        playlist = [];

        const numHardOrange = TOTAL_VIDEOS_TO_PLAY / 4;
        const numHardGreen = TOTAL_VIDEOS_TO_PLAY / 4;
        const numSoftOrange = TOTAL_VIDEOS_TO_PLAY / 4;
        const numSoftGreen = TOTAL_VIDEOS_TO_PLAY / 4;

        for (let i = 0; i < numHardOrange; i++) {
            playlist.push({ videoId: hardVideoIds[i % hardVideoIds.length], type: 'hard', dotColor: 'orange' });
        }
        for (let i = 0; i < numHardGreen; i++) {
            playlist.push({ videoId: hardVideoIds[(i + numHardOrange) % hardVideoIds.length], type: 'hard', dotColor: 'green' });
        }
        for (let i = 0; i < numSoftOrange; i++) {
            playlist.push({ videoId: softVideoIds[i % softVideoIds.length], type: 'soft', dotColor: 'orange' });
        }
        for (let i = 0; i < numSoftGreen; i++) {
            playlist.push({ videoId: softVideoIds[(i + numSoftOrange) % softVideoIds.length], type: 'soft', dotColor: 'green' });
        }

        if (playlist.length !== TOTAL_VIDEOS_TO_PLAY) {
            console.warn(`Playlist length (${playlist.length}) does not match TOTAL_VIDEOS_TO_PLAY (${TOTAL_VIDEOS_TO_PLAY}).`);
        }

        shuffleArray(playlist); // Uses local shuffle or utils.js if that's preferred

        console.log(`Initialized playlist with ${playlist.length} videos.`);
        console.log("Current playlist (first 5 items):", playlist.slice(0,5));

        if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
            console.log("YouTube API not loaded. Loading now...");
            const tag = document.createElement('script');
            tag.src = "https://youtube.com/iframe_api";
            const firstScriptTag = document.getElementsByTagName('script')[0];
            if (firstScriptTag && firstScriptTag.parentNode) {
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            } else {
                document.head.appendChild(tag); 
            }
            window.youTubePlayerReadyCallback = () => {
                console.log("YouTube API ready via global callback. Creating player for first video:", playlist[0].videoId);
                createYouTubePlayer();
            };
        } else {
            console.log("YouTube API already loaded. Creating player for first video:", playlist[0].videoId);
            createYouTubePlayer();
        }
        updateTrialDisplay(); 
    }

    function initializeExperimentSession() {
        experimentUUID = generateUUID(); // From utils.js
        const sessionGroup = getQueryParam('SG'); // From utils.js
        sessionStartMs = Date.now();
        sessionData = {
            session_uuid: experimentUUID,
            session_group: sessionGroup || 'N/A',
            experiment_name: "squeeze",
            experiment_version: "1.0",
            file_version: DATAFILE_VERSION,
            color_action_map: COLOR_ACTIONS,
            session_start_iso: new Date(sessionStartMs).toISOString(),
            browser_data: getBrowserData(), // From utils.js
            experiment_config: {
                total_videos_configured: TOTAL_VIDEOS_TO_PLAY,
                hard_video_urls: hardVideoURLs, 
                soft_video_urls: softVideoURLs,
                baseline_square_color: "#9F9F9F",
                baseline_event_number: 3,
                cue_square_color: "#CBCBCB",
                cue_event_number: 4
            }
        };
        allTrialsData = []; // Initialize/reset trials data array
        console.log("Experiment session initialized:", sessionData);
    }

    // Flow

    startButton.addEventListener('click', () => {
        console.log("Start button clicked. Transitioning to video playback.");
        
        initializeExperimentSession(); // Initialize session and data collection arrays

        instructionsScreen.classList.add('hidden');
        experimentArea.classList.remove('hidden');
        endScreen.classList.add('hidden');
        cueDisplayElement.classList.add('hidden');  

        hasDotBeenScheduledForCurrentVideo = false;
        dotAppearanceTime = null;

        totalTrialsDisplayElement.textContent = String(TOTAL_VIDEOS_TO_PLAY);

        trialCounterElement.textContent = '0'; 

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

function shuffleArray(array) { // shuffle is also in utils.js, but keep local for now if it was already here
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}