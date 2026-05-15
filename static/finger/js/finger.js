document.addEventListener('DOMContentLoaded', () => {
    const VIDEO_FILES = [
        'h-index-bend.mp4',
        'h-index-ctrl.mp4',
        'h-middle-bend.mp4',
        'h-middle-ctrl.mp4',
        'h-pinky-bend.mp4',
        'h-pinky-ctrl.mp4',
        'h-ring-bend.mp4',
        'h-ring-ctrl.mp4',
        'v-index-bend.mp4',
        'v-index-ctrl.mp4',
        'v-index2-bend.mp4',
        'v-index2-ctrl.mp4'
    ];

    const DATAFILE_VERSION = '1.0';
    const MIN_INTERTRIAL_INTERVAL_MS = 1000;
    const MAX_INTERTRIAL_INTERVAL_MS = 3000;
    const SQUARE_FLASH_DURATION_MS = 300;
    const SQUARE_FLASH_DELAY_MS = 0;
    const GROUP_SQUARE_COLORS = {
        ctrl: 'light_gray',
        bend: 'dark_gray'
    };
    const SQUARE_COLOR_VALUES = {
        light_gray: '#C0C0C0',
        dark_gray: '#000000'
    };
    const BASELINE_SQUARE_COLOR = '#FFFFFF';

    let playlist = [];
    let currentVideoIndex = 0;
    let isTransitioning = false;
    let squareTimer = null;
    let squareResetTimer = null;
    let intertrialTimer = null;
    let hasSquareBeenShownForCurrentVideo = false;
    let hasPlayBeenRequestedForCurrentVideo = false;
    let pendingIntertrialIntervalMs = 0;

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
    const feedbackTextElement = document.getElementById('feedback-text');
    const stimulusVideo = document.getElementById('stimulus-video');
    const cornerSquareElement = document.getElementById('corner-square-element');

    function parseVideoFile(fileName) {
        const match = fileName.match(/^([^-]+)-(.+)-(bend|ctrl)\.mp4$/);

        if (!match) {
            throw new Error(`Unexpected finger video filename: ${fileName}`);
        }

        return {
            fileName,
            videoPath: `video/${fileName}`,
            position: match[1],
            orientation: match[1],
            fingerId: match[2],
            group: match[3],
            controlOrBend: match[3],
            squareColorName: GROUP_SQUARE_COLORS[match[3]],
            squareColorValue: SQUARE_COLOR_VALUES[GROUP_SQUARE_COLORS[match[3]]]
        };
    }

    function initializeExperimentSession() {
        experimentUUID = generateUUID();
        const sessionGroup = getQueryParam('SG');
        sessionStartMs = Date.now();
        sessionData = {
            session_uuid: experimentUUID,
            session_group: sessionGroup || 'N/A',
            experiment_name: 'finger',
            experiment_version: '1.0',
            file_version: DATAFILE_VERSION,
            group_square_colors: GROUP_SQUARE_COLORS,
            session_start_iso: new Date(sessionStartMs).toISOString(),
            browser_data: getBrowserData(),
            experiment_config: {
                total_videos_configured: VIDEO_FILES.length,
                video_files: VIDEO_FILES,
                min_intertrial_interval_ms: MIN_INTERTRIAL_INTERVAL_MS,
                max_intertrial_interval_ms: MAX_INTERTRIAL_INTERVAL_MS,
                square_flash_delay_ms: SQUARE_FLASH_DELAY_MS,
                square_flash_duration_ms: SQUARE_FLASH_DURATION_MS,
                baseline_square_color: BASELINE_SQUARE_COLOR,
                square_color_values: SQUARE_COLOR_VALUES
            }
        };
        allTrialsData = [];
        console.log('Finger experiment session initialized:', sessionData);
    }

    async function initializeVideoPlayback() {
        playlist = VIDEO_FILES.map(parseVideoFile);
        shuffleArray(playlist);
        currentVideoIndex = 0;
        pendingIntertrialIntervalMs = 0;
        await preloadAllVideos();
        playCurrentVideo();
    }

    function playCurrentVideo() {
        if (currentVideoIndex >= playlist.length) {
            finishExperiment();
            return;
        }

        const currentTrial = playlist[currentVideoIndex];
        isTransitioning = false;
        hasSquareBeenShownForCurrentVideo = false;
        hasPlayBeenRequestedForCurrentVideo = false;
        videoPlayStart = null;
        clearSquareTimers();
        clearIntertrialTimer();
        currentTrial.intertrialIntervalBeforeMs = pendingIntertrialIntervalMs;
        pendingIntertrialIntervalMs = 0;
        cornerSquareElement.style.backgroundColor = BASELINE_SQUARE_COLOR;
        showBlackVideoScreen();

        stimulusVideo.src = currentTrial.videoPath;
        stimulusVideo.load();
    }

    function handleVideoCanPlay() {
        if (hasPlayBeenRequestedForCurrentVideo || currentVideoIndex >= playlist.length) {
            return;
        }

        hasPlayBeenRequestedForCurrentVideo = true;
        const playPromise = stimulusVideo.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch((error) => {
                console.error('Unable to start finger video playback:', error);
                feedbackTextElement.textContent = 'Video playback could not start. Please try again.';
            });
        }
    }

    function handleVideoPlaying() {
        if (hasSquareBeenShownForCurrentVideo || currentVideoIndex >= playlist.length) {
            return;
        }

        stimulusVideo.classList.remove('video-loading');
        updateTrialDisplay();
        const currentTrial = playlist[currentVideoIndex];
        currentTrial.startTimestampMs = Date.now();
        videoPlayStart = currentTrial.startTimestampMs;
        hasSquareBeenShownForCurrentVideo = true;
        flashSquareForCurrentTrial();
    }

    function flashSquareForCurrentTrial() {
        clearSquareTimers();

        const currentTrial = playlist[currentVideoIndex];
        squareTimer = setTimeout(() => {
            if (stimulusVideo.paused || stimulusVideo.ended) {
                return;
            }

            currentTrial.squareAppearanceTimestampMs = Date.now();
            currentTrial.squarePlannedDelayMs = SQUARE_FLASH_DELAY_MS;
            currentTrial.squareOffsetMs = currentTrial.squareAppearanceTimestampMs - videoPlayStart;
            currentTrial.trialLabel = `${currentTrial.position}-${currentTrial.fingerId}-${currentTrial.controlOrBend}`;
            cornerSquareElement.style.backgroundColor = currentTrial.squareColorValue;

            squareResetTimer = setTimeout(() => {
                cornerSquareElement.style.backgroundColor = BASELINE_SQUARE_COLOR;
            }, SQUARE_FLASH_DURATION_MS);
        }, SQUARE_FLASH_DELAY_MS);
    }

    function handleVideoEnded() {
        if (isTransitioning) {
            return;
        }

        isTransitioning = true;
        recordCurrentTrial();
        currentVideoIndex++;
        scheduleNextVideo();
    }

    function handleVideoError() {
        const currentTrial = playlist[currentVideoIndex];
        console.error('Error loading finger video:', currentTrial);
        currentTrial.videoError = true;
        currentTrial.startTimestampMs = currentTrial.startTimestampMs || Date.now();
        videoPlayStart = videoPlayStart || currentTrial.startTimestampMs;
        feedbackTextElement.textContent = `Could not load ${currentTrial.fileName}. Skipping to the next video.`;
        handleVideoEnded();
    }

    function recordCurrentTrial() {
        clearSquareTimers();
        cornerSquareElement.style.backgroundColor = BASELINE_SQUARE_COLOR;

        const finishedTrial = playlist[currentVideoIndex];
        const trialData = {
            trial_number: currentVideoIndex + 1,
            video_file: finishedTrial.fileName,
            video_path: finishedTrial.videoPath,
            position: finishedTrial.position,
            orientation: finishedTrial.orientation,
            finger_id: finishedTrial.fingerId,
            control_or_bend: finishedTrial.controlOrBend,
            group: finishedTrial.group,
            trial_label: finishedTrial.trialLabel || `${finishedTrial.position}-${finishedTrial.fingerId}-${finishedTrial.controlOrBend}`,
            square_color_name: finishedTrial.squareColorName,
            square_color_value: finishedTrial.squareColorValue,
            square_group: finishedTrial.controlOrBend,
            square_planned_delay_ms: finishedTrial.squarePlannedDelayMs,
            square_offset_from_video_start_ms: finishedTrial.squareOffsetMs,
            intertrial_interval_before_ms: finishedTrial.intertrialIntervalBeforeMs,
            trial_start_ts: ((finishedTrial.startTimestampMs || 0) - sessionStartMs) / 1000,
            trial_end_ts: (Date.now() - sessionStartMs) / 1000,
            square_ts: ((finishedTrial.squareAppearanceTimestampMs || 0) - sessionStartMs) / 1000,
            video_error: Boolean(finishedTrial.videoError)
        };

        allTrialsData.push(trialData);
    }

    function finishExperiment() {
        experimentArea.classList.add('hidden');
        endScreen.classList.remove('hidden');
        clearSquareTimers();
        clearIntertrialTimer();
        showBlackVideoScreen();
        stimulusVideo.removeAttribute('src');
        stimulusVideo.load();

        const finalData = {
            session: sessionData,
            trials: allTrialsData
        };
        sendDataToServer(finalData, experimentUUID, 'finger');
        console.log('Final finger data payload for debugging:', finalData);
    }

    function updateTrialDisplay() {
        const displayTrialNumber = Math.min(currentVideoIndex + 1, playlist.length || VIDEO_FILES.length);
        trialCounterElement.textContent = String(displayTrialNumber);
        totalTrialsDisplayElement.textContent = String(playlist.length || VIDEO_FILES.length);
    }

    function scheduleNextVideo() {
        showBlackVideoScreen();

        if (currentVideoIndex >= playlist.length) {
            finishExperiment();
            return;
        }

        pendingIntertrialIntervalMs = randomInteger(MIN_INTERTRIAL_INTERVAL_MS, MAX_INTERTRIAL_INTERVAL_MS);
        playlist[currentVideoIndex].intertrialIntervalBeforeMs = pendingIntertrialIntervalMs;
        intertrialTimer = setTimeout(playCurrentVideo, pendingIntertrialIntervalMs);
    }

    function showBlackVideoScreen() {
        stimulusVideo.classList.add('video-loading');
    }

    async function preloadAllVideos() {
        const total = playlist.length;
        let loaded = 0;
        feedbackTextElement.textContent = `Loading videos: 0 / ${total}`;

        const promises = playlist.map((trial) => {
            return fetch(trial.videoPath)
                .then((response) => response.blob())
                .then(() => {
                    loaded++;
                    feedbackTextElement.textContent = `Loading videos: ${loaded} / ${total}`;
                })
                .catch((err) => {
                    loaded++;
                    console.warn(`Failed to preload ${trial.videoPath}:`, err);
                    feedbackTextElement.textContent = `Loading videos: ${loaded} / ${total}`;
                });
        });

        await Promise.all(promises);
        feedbackTextElement.textContent = '';
    }

    function clearSquareTimers() {
        clearTimeout(squareTimer);
        clearTimeout(squareResetTimer);
        squareTimer = null;
        squareResetTimer = null;
    }

    function clearIntertrialTimer() {
        clearTimeout(intertrialTimer);
        intertrialTimer = null;
    }

    startButton.addEventListener('click', () => {
        initializeExperimentSession();

        instructionsScreen.classList.add('hidden');
        experimentArea.classList.remove('hidden');
        endScreen.classList.add('hidden');
        feedbackTextElement.textContent = '';

        initializeVideoPlayback();
    });

    stimulusVideo.addEventListener('canplay', handleVideoCanPlay);
    stimulusVideo.addEventListener('playing', handleVideoPlaying);
    stimulusVideo.addEventListener('ended', handleVideoEnded);
    stimulusVideo.addEventListener('error', handleVideoError);
});

function randomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}
