document.addEventListener('DOMContentLoaded', () => {
    const VIDEO_FILES = [
        'h-index-bend.mov',
        'h-index-ctrl.mov',
        'h-middle-bend.mov',
        'h-middle-ctrl.mov',
        'h-pinky-bend.mov',
        'h-pinky-ctrl.mov',
        'h-ring-bend.mov',
        'h-ring-ctrl.mov',
        'h-thumb-bend.mov',
        'v-index-bend.mov',
        'v-index-ctrl.mov',
        'v-index2-bend.mov',
        'v-index2-ctrl.mov'
    ];

    const DATAFILE_VERSION = '1.0';
    const CUE_DURATION_MS = 300;
    const CUE_DELAY_MS = 0;
    const GROUP_CUE_COLORS = {
        ctrl: 'orange',
        bend: 'green'
    };
    const COLOR_GROUP_MAP = {
        orange: 'ctrl',
        green: 'bend'
    };
    const BASELINE_SQUARE_COLOR = '#CBCBCB';
    const CUE_SQUARE_COLOR = '#9F9F9F';

    let playlist = [];
    let currentVideoIndex = 0;
    let isTransitioning = false;
    let cueTimer = null;
    let cueHideTimer = null;
    let hasCueBeenShownForCurrentVideo = false;

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
    const cueDisplayElement = document.getElementById('cue-display');
    const cueShapeElement = document.getElementById('cue-shape');

    cueShapeElement.classList.add('cue-dot');
    cueDisplayElement.classList.add('hidden');

    function parseVideoFile(fileName) {
        const match = fileName.match(/^([^-]+)-(.+)-(bend|ctrl)\.mov$/);

        if (!match) {
            throw new Error(`Unexpected finger video filename: ${fileName}`);
        }

        return {
            fileName,
            videoPath: `video/${fileName}`,
            orientation: match[1],
            fingerId: match[2],
            group: match[3],
            cueColor: GROUP_CUE_COLORS[match[3]]
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
            color_group_map: COLOR_GROUP_MAP,
            group_cue_colors: GROUP_CUE_COLORS,
            session_start_iso: new Date(sessionStartMs).toISOString(),
            browser_data: getBrowserData(),
            experiment_config: {
                total_videos_configured: VIDEO_FILES.length,
                video_files: VIDEO_FILES,
                cue_delay_ms: CUE_DELAY_MS,
                cue_duration_ms: CUE_DURATION_MS,
                baseline_square_color: BASELINE_SQUARE_COLOR,
                cue_square_color: CUE_SQUARE_COLOR
            }
        };
        allTrialsData = [];
        console.log('Finger experiment session initialized:', sessionData);
    }

    function initializeVideoPlayback() {
        playlist = VIDEO_FILES.map(parseVideoFile);
        shuffleArray(playlist);
        currentVideoIndex = 0;
        updateTrialDisplay();
        playCurrentVideo();
    }

    function playCurrentVideo() {
        if (currentVideoIndex >= playlist.length) {
            finishExperiment();
            return;
        }

        const currentTrial = playlist[currentVideoIndex];
        isTransitioning = false;
        hasCueBeenShownForCurrentVideo = false;
        videoPlayStart = null;
        clearCueTimers();
        cueDisplayElement.classList.add('hidden');
        cornerSquareElement.style.backgroundColor = BASELINE_SQUARE_COLOR;
        updateTrialDisplay();

        stimulusVideo.src = currentTrial.videoPath;
        stimulusVideo.load();

        const playPromise = stimulusVideo.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch((error) => {
                console.error('Unable to start finger video playback:', error);
                feedbackTextElement.textContent = 'Video playback could not start. Please try again.';
            });
        }
    }

    function handleVideoPlaying() {
        if (hasCueBeenShownForCurrentVideo || currentVideoIndex >= playlist.length) {
            return;
        }

        const currentTrial = playlist[currentVideoIndex];
        currentTrial.startTimestampMs = Date.now();
        videoPlayStart = currentTrial.startTimestampMs;
        hasCueBeenShownForCurrentVideo = true;
        showCueForCurrentTrial();
    }

    function showCueForCurrentTrial() {
        clearCueTimers();

        const currentTrial = playlist[currentVideoIndex];
        cueTimer = setTimeout(() => {
            if (stimulusVideo.paused || stimulusVideo.ended) {
                return;
            }

            const requiredCueColor = currentTrial.cueColor;
            cueShapeElement.classList.remove('cue-orange', 'cue-green');
            cueShapeElement.classList.add(`cue-${requiredCueColor}`);

            currentTrial.cueAppearanceTimestampMs = Date.now();
            currentTrial.cuePlannedDelayMs = CUE_DELAY_MS;
            currentTrial.cueOffsetMs = currentTrial.cueAppearanceTimestampMs - videoPlayStart;
            currentTrial.trialLabel = `${currentTrial.orientation}-${currentTrial.fingerId}-${currentTrial.group}`;
            currentTrial.cornerSquareColor = CUE_SQUARE_COLOR;
            cornerSquareElement.style.backgroundColor = CUE_SQUARE_COLOR;

            cueDisplayElement.classList.remove('hidden');
            cueHideTimer = setTimeout(() => {
                cueDisplayElement.classList.add('hidden');
            }, CUE_DURATION_MS);
        }, CUE_DELAY_MS);
    }

    function handleVideoEnded() {
        if (isTransitioning) {
            return;
        }

        isTransitioning = true;
        recordCurrentTrial();
        currentVideoIndex++;
        playCurrentVideo();
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
        clearCueTimers();
        cueDisplayElement.classList.add('hidden');
        cornerSquareElement.style.backgroundColor = BASELINE_SQUARE_COLOR;

        const finishedTrial = playlist[currentVideoIndex];
        const trialData = {
            trial_number: currentVideoIndex + 1,
            video_file: finishedTrial.fileName,
            video_path: finishedTrial.videoPath,
            orientation: finishedTrial.orientation,
            finger_id: finishedTrial.fingerId,
            group: finishedTrial.group,
            trial_label: finishedTrial.trialLabel || `${finishedTrial.orientation}-${finishedTrial.fingerId}-${finishedTrial.group}`,
            cue_color: finishedTrial.cueColor,
            cue_group: finishedTrial.group,
            cue_planned_delay_ms: finishedTrial.cuePlannedDelayMs,
            cue_offset_from_video_start_ms: finishedTrial.cueOffsetMs,
            trial_start_ts: ((finishedTrial.startTimestampMs || 0) - sessionStartMs) / 1000,
            trial_end_ts: (Date.now() - sessionStartMs) / 1000,
            cue_ts: ((finishedTrial.cueAppearanceTimestampMs || 0) - sessionStartMs) / 1000,
            corner_square_color: finishedTrial.cornerSquareColor || null,
            video_error: Boolean(finishedTrial.videoError)
        };

        allTrialsData.push(trialData);
    }

    function finishExperiment() {
        experimentArea.classList.add('hidden');
        endScreen.classList.remove('hidden');
        clearCueTimers();
        cueDisplayElement.classList.add('hidden');
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

    function clearCueTimers() {
        clearTimeout(cueTimer);
        clearTimeout(cueHideTimer);
        cueTimer = null;
        cueHideTimer = null;
    }

    startButton.addEventListener('click', () => {
        initializeExperimentSession();

        instructionsScreen.classList.add('hidden');
        experimentArea.classList.remove('hidden');
        endScreen.classList.add('hidden');
        feedbackTextElement.textContent = '';

        initializeVideoPlayback();
    });

    stimulusVideo.addEventListener('playing', handleVideoPlaying);
    stimulusVideo.addEventListener('ended', handleVideoEnded);
    stimulusVideo.addEventListener('error', handleVideoError);
});

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}
