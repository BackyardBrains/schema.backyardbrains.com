const config = {
    experiment_name: 'threat',
    experiment_version: '2.3',
    datafile_version: '1.5',
    earlyExit: {
        minTrialsForCheck: 10,
        maxZeroPct: 80,
        minAngleSd: 2,
        minMedianRtMs: 1200,
        maxFastRtPct: 80,
        maxWrongDirPct: 60,
        flagsNeeded: 2
    }
};

const translations = {
    en: {
        testVerification: "Test Verification",
        enterPassword: "Please enter the password to start the experiment:",
        // Add all other text content here in English
        gametitle: "The Tipping Point Game",
        welcome1: "Welcome to the Tube Tilt Experiment! Your task is to determine the 'tipping point' at which a virtual tube will fall over. Think carefully about the exact point where a tipped tube transitions from going straight back up again to falling down. We want to know the smallest angle in which it fall over. See video for more details.",
        welcome2: "The tube will be sitting on a table, and the direction of the tilt is indicated by an arrow. Use the left and right arrow keys to adjust the tilt, and press the space bar when you believe you've reached this critical angle.",
        welcome3: "Your precision in finding this delicate balance will be key to the experiment's success. Good luck! Important quality check: the first 10 rounds are checked for active play.",
        startExp: "Start Experiment",
        gameinstr1: "Find the Tipping Point (smallest angle to tip)! Use the left and right arrow keys to tilt the tube in the direction indicated. The faces are looking at the color of the tube, and can be ignored.",
        gameinstr2: "When you think you have found the tipping point, press  <span class='space-bar'>SPACE BAR</span>",
        surveyHeader: "Part 2: Survey",
        surveyText: "Thank you for playing. You will now click the link below to fill out a few questions about the game you just played.",
        continueToSurvey: "Continue to Survey",
        earlyExitMessage: "Your session ended early because your first responses suggested low engagement with the task."
    },
    rs: {
        testVerification: "Provera Testa",
        enterPassword: "Unesite lozinku da biste započeli eksperiment:",
        // Add all other text content here in Serbian
        gametitle: "Eksperiment tačke prevrtanja",
        welcome1: "Hvala što učestvujete u eksperimentu tačke prevrtanja tube! Vaš zadatak je da odredite tačan položaj (najmanji ugao) iz koga virtuelna tuba neċe moċi da se vrati u vertikalan položaj, već će pasti.",
        welcome2: "Tuba je postavljena na stolu, a smer nagiba označen je strelicom. Koristite tastere sa strelicama levo i desno kako biste promenili ugao tube. Kada odredite kritičnu tačku tj. položaj u kome mislite da će tuba pasti, pritisnite razmak  (space bar).",
        welcome3: "Vaša preciznost u pronalaženju ove delikatne ravnoteže biće ključna za uspeh eksperimenta. Pogledajte video za više detalja. Srećno! Važna provera kvaliteta: prvih 10 rundi se proverava zbog aktivnog učestvovanja.",
        startExp: "Počni eksperiment",
        gameinstr1: "Pronađite tačku pada tube! Koristite tastere sa strelicama levo i desno da promenite ugao tube u označenom pravcu.",
        gameinstr2: "Kada odredite tačku prevrtanja, pritisnite taster <span class='space-bar'>razmak</span>.",
        surveyHeader: "Deo 2: Anketa",
        surveyText: "Hvala što ste učestvovali u eksperimentu. Kliknite na link i  odgovorite na nekoliko pitanja o eksperimentu.",
        continueToSurvey: "Nastavite ka Anketi",
        earlyExitMessage: "Sesija je završena ranije jer prvi odgovori ukazuju na slabu angažovanost u zadatku."
    }
};


class TubeExperiment extends Experiment {

    constructor() {
        super();
        this.UUID = '';
        this.experimentName = config.experiment_name;
        this.session = '';
        this.trialStartTime = 0;
        this.trials = [];
        this.trialtypes = [];
        //this.FORM_URL_en = 'https://docs.google.com/forms/d/e/1FAIpQLSfiziJ_yQ7LLJEejvsMwjNVu7zyCmSQX8qUwC8sB7QDB6LmfQ/viewform?usp=pp_url&entry.766586855='
        //this.FORM_URL_en = 'https://docs.google.com/forms/d/e/1FAIpQLScp8OpnIVFY5GnInuG8QnMheuPEPs6B_l2VNBjyhx2sLAgewQ/viewform?usp=pp_url&entry.766586855=';
        this.FORM_URL_en = 'https://docs.google.com/forms/d/e/1FAIpQLSdVnyscX7YdUES8dmo_rGz_gHUzL8hfcY0gLi5zf7c9VZsvKA/viewform?usp=pp_url&entry.766586855=';
        this.FORM_URL_rs = 'https://docs.google.com/forms/d/e/1FAIpQLSc0P46iTLHyFHEJDGxZaqMF7k76JOuXgk1ZMRhqHNBxXyfKtA/viewform?usp=pp_url&entry.766586855=';
        this.image_name = 'threatlevel';
        this.faceTypes = ['ID015', 'ID017'];
        this.mturk = {
            assignmentId: getQueryParam('assignmentId'),
            workerId: getQueryParam('workerId'),
            hitId: getQueryParam('hitId'),
            hitTypeId: getQueryParam('hitTypeId'),
            turkSubmitTo: getQueryParam('turkSubmitTo'),
            clientId: getQueryParam('clientId') || getQueryParam('client_id') || getQueryParam('hitClientId')
        };
        this.tube = document.getElementById('tube');
        this.line = document.querySelector('line');
        this.arrow = document.getElementById('arrow');
        this.leftface = document.getElementById('leftface');
        this.rightface = document.getElementById('rightface');
        this.game = document.getElementById('gamesection');
        this.formsection = document.getElementById('formsection');
        this.formbutton = document.getElementById('formbutton');
        this.earlyExitTriggered = false;
        this.earlyExitDecision = null;


        this.tubeTypes = [
            { width: '24', height: '130', faceAngle: '-9' }, // normal
            { width: '48', height: '130', faceAngle: '-8' }, // fat
            { width: '24', height: '65', faceAngle: '0' }, // short
            { width: '48', height: '65', faceAngle: '1' }, // short and fat
        ];

        this.button = document.getElementById('button');
        this.buttontext = document.getElementById('buttontext');


        //removed from HTML
        //    <rect id="button" x="900" y="192" width="100" height="40" fill="green" />
        //    <text id="buttontext" class="no-select" x="915" y="215" fill="white" font-size="15px" >Next</text>

        // Event listener for click event on the button
        //this.button.addEventListener('click', () => tubeExp.endTrial());
        //this.buttontext.addEventListener('click', () => tubeExp.endTrial());


        this.trialIndex = 0;
        this.tubeTypeIndex, this.arrowDirection, this.faceSide;
        this.currentAngle = 0; // Initialize current angle of line
        this.currentDirection = 'right'; // Initialize current angle of line

        // Event listeners for keydown event to rotate the line
        window.addEventListener('keydown', (event) => {
            if (this.earlyExitTriggered) {
                return;
            }

            switch (event.key) {
                case 'ArrowLeft':
                case 'f':
                    this.tube.style.display = 'none';
                    this.currentAngle = (this.currentAngle <= -180) ? -180 : this.currentAngle - 1;
                    break;
                case 'ArrowRight':
                case 'j':
                    this.tube.style.display = 'none';
                    this.currentAngle = (this.currentAngle >= 180) ? 180 : this.currentAngle + 1;
                    break;
                case ' ':
                    this.endTrial();
                    break;
            }
            this.line.setAttribute('transform', `rotate(${this.currentAngle}, 514, 163)`);
        });

        this.currentLanguage = getLanguage(); // Determine the current language
        this.setFormUrl(); // Set the appropriate form URL based on the language

    }

    median(values) {
        if (!values.length) {
            return NaN;
        }
        const sorted = [...values].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        if (sorted.length % 2) {
            return sorted[middle];
        }
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }

    getEngagementDecision() {
        const cfg = config.earlyExit;
        const firstTrials = this.trials.slice(0, cfg.minTrialsForCheck);

        if (firstTrials.length < cfg.minTrialsForCheck) {
            return { shouldEnd: false, flags: [], metrics: {} };
        }

        const angles = firstTrials.map(trial => Number(trial.endAngle ?? 0));
        const rts = firstTrials
            .map(trial => Number(trial.latency ?? NaN))
            .filter(Number.isFinite);

        const zeroPct = (angles.filter(angle => angle === 0).length / angles.length) * 100;
        const meanAngle = angles.reduce((total, angle) => total + angle, 0) / angles.length;
        const sd = Math.sqrt(angles.reduce((acc, angle) => acc + (angle - meanAngle) ** 2, 0) / angles.length);
        const medianRt = this.median(rts);
        const fastRtPct = rts.length ? (rts.filter(rt => rt < 1500).length / rts.length) * 100 : 0;

        const directionalTrials = firstTrials.filter(trial => trial.endAngle !== 0 && ['left', 'right'].includes(trial.arrowDirection));
        const wrongDirection = directionalTrials.filter(trial => (trial.arrowDirection === 'left' && trial.endAngle > 0) || (trial.arrowDirection === 'right' && trial.endAngle < 0));
        const wrongDirPct = directionalTrials.length ? (wrongDirection.length / directionalTrials.length) * 100 : 0;

        const flags = [];
        if (zeroPct >= cfg.maxZeroPct) flags.push('mostly_zero_angles');
        if (sd < cfg.minAngleSd && zeroPct < 90) flags.push('low_angle_variability');
        if (Number.isFinite(medianRt) && medianRt < cfg.minMedianRtMs) flags.push('very_fast_median_rt');
        if (fastRtPct >= cfg.maxFastRtPct) flags.push('mostly_fast_rts');
        if (wrongDirPct > cfg.maxWrongDirPct) flags.push('mostly_wrong_direction');

        return {
            shouldEnd: flags.length >= cfg.flagsNeeded,
            flags,
            metrics: { zeroPct, sd, medianRt, fastRtPct, wrongDirPct }
        };
    }

    triggerEarlyExit(decision) {
        this.earlyExitTriggered = true;
        this.earlyExitDecision = {
            trialIndex: this.trialIndex,
            ...decision
        };

        try {
            // Set a flag in localStorage to prevent the user from simply refreshing the page to retry
            localStorage.setItem('tubeExperiment_failedEngagement', 'true');
        } catch (e) {
            console.warn("Could not write to localStorage", e);
        }

        this.saveTrialData();
        alert(translations[this.currentLanguage].earlyExitMessage);
        this.game.style.display = 'none';
        this.formsection.style.display = 'none';
    }

    setFormUrl() {
        this.FORM_URL = (this.currentLanguage === 'rs') ? this.FORM_URL_rs : this.FORM_URL_en;
    }
    generateTrials() {
        for (let i = 0; i < this.tubeTypes.length; i++) {
            for (let arrowdirection of ['left', 'right']) {
                for (let faceSide of ['left', 'right']) {
                    for (let faceType of this.faceTypes) {
                        this.trialtypes.push({ tubeTypeIndex: i, arrowDirection: arrowdirection, faceSide: faceSide, faceType: faceType });
                    }
                }
            }
        }

        // Shuffle trials array
        this.trialtypes.sort(() => Math.random() - 0.5);
    }

    startTrial() {
        this.tubeTypeIndex = this.trialtypes[this.trialIndex].tubeTypeIndex;
        this.arrowDirection = this.trialtypes[this.trialIndex].arrowDirection;
        this.faceSide = this.trialtypes[this.trialIndex].faceSide;
        this.faceType = this.trialtypes[this.trialIndex].faceType;

        this.tube.setAttribute('width', this.tubeTypes[this.tubeTypeIndex].width);
        this.tube.setAttribute('height', this.tubeTypes[this.tubeTypeIndex].height);

        //hide the faces
        this.rightface.style.display = 'none';
        this.leftface.style.display = 'none';

        if (this.faceSide == 'left') {
            this.leftface.setAttribute("xlink:href", "img/" + this.faceSide + "_" + this.image_name + "_" + this.faceType + ".png");
            this.leftface.setAttribute('transform', 'rotate(' + this.tubeTypes[this.tubeTypeIndex].faceAngle + ', 100, 200)');
            this.leftface.style.display = '';
        } else {
            this.rightface.setAttribute("xlink:href", "img/" + this.faceSide + "_" + this.image_name + "_" + this.faceType + ".png");
            //rightface.setAttribute('transform', 'translate(1023, 0) scale(-1, 1) translate(-1023, 0)');
            this.rightface.setAttribute('transform', 'rotate(' + (-1 * this.tubeTypes[this.tubeTypeIndex].faceAngle).toString() + ', 923, 200)');
            this.rightface.style.display = '';
        }

        // update tube's x and y position to keep it centered on the platform
        let originalWidth = 24;
        let newWidth = parseInt(this.tube.getAttribute('width'));
        let originalX = 502; // original center of tube
        let newX = originalX - (newWidth - originalWidth) / 2;
        this.tube.setAttribute('x', newX);

        let platformY = 160;
        let newHeight = parseInt(this.tube.getAttribute('height'));
        let newY = platformY - newHeight;
        this.tube.setAttribute('y', newY);

        this.tube.style.display = '';

        this.currentAngle = 0; // reset line's angle at the start of each trial
        this.line.setAttribute('transform', `rotate(${this.currentAngle}, 514, 163)`);
        this.arrow.setAttribute('transform', (this.currentDirection != this.arrowDirection) ? 'rotate(180, 523, 210)' : '');
        this.trialStartTime = Date.now();

    }

    endTrial() {

        let trialLatency = Date.now() - this.trialStartTime;

        let trialResult = {
            trialIndex: this.trialIndex,
            tubeTypeIndex: this.tubeTypeIndex,
            arrowDirection: this.arrowDirection,
            faceType: this.faceType,
            faceSide: this.faceSide,
            endAngle: this.currentAngle,
            latency: trialLatency
        };

        this.trials.push(trialResult);

        const decision = this.getEngagementDecision();
        if (decision.shouldEnd) {
            this.triggerEarlyExit(decision);
            return;
        }

        if (this.faceSide == 'left') {
            this.leftface.style.display = 'none';
            this.leftface.setAttribute('transform', 'rotate(' + (-1 * this.tubeTypes[this.tubeTypeIndex].faceAngle).toString() + ', 200, 200)');
        } else {
            this.rightface.style.display = 'none';
            this.rightface.setAttribute('transform', 'rotate(' + this.tubeTypes[this.tubeTypeIndex].faceAngle + ', 200, 200)');
        }

        this.trialIndex++;
        if (this.trialIndex < this.trialtypes.length) {
            this.startTrial();
        } else {

            this.game.style.display = 'none';
            this.formsection.style.display = '';

            this.saveTrialData();

            // Convert trial data to JSON string
            //let trialDataJSON = JSON.stringify(trialData);
            //console.log(trialDataJSON);


            this.formbutton.onclick = () => {
                location.href = this.FORM_URL + this.UUID;
            };

        }
    }

    saveTrialData() {
        // save trial data
        let data = {
            session: this.session,
            trials: this.trials,
            earlyExit: this.earlyExitDecision
        };
        sendDataToServer(data, this.UUID, this.experimentName);

    }

}


function updatePageContent(lang) {

    console.log("Language set to: ", lang); // Debugging line
    console.log("Translations for language: ", translations[lang]); // Debugging line

    document.getElementById('gametitle').innerText = translations[lang].gametitle;
    document.getElementById('enterPassword').placeholder = translations[lang].enterPassword;
    document.getElementById('welcome1').innerText = translations[lang].welcome1;
    document.getElementById('welcome2').innerText = translations[lang].welcome2;
    document.getElementById('welcome3').innerText = translations[lang].welcome3;
    document.getElementById('closeButton').innerText = translations[lang].startExp;
    document.getElementById('gameinstr1').innerHTML = translations[lang].gameinstr1;
    document.getElementById('gameinstr2').innerHTML = translations[lang].gameinstr2;
    document.getElementById('surveyHeader').innerText = translations[lang].surveyHeader;
    document.getElementById('surveyText').innerText = translations[lang].surveyText; // Ensure you add an id="surveyText" to the paragraph <p> tag
    document.getElementById('formbutton').innerText = translations[lang].continueToSurvey;
}



function getLanguage() {
    const urlSearchParams = new URLSearchParams(window.location.search);
    return urlSearchParams.get('lang') || 'en'; // Default to English if no parameter found
}

function preloadImages(imageUrls) {
    let loadPromises = imageUrls.map(url => {
        return new Promise((resolve, reject) => {
            let img = new Image();
            img.onload = resolve;
            img.onerror = reject;
            img.src = url;
        });
    });
    return Promise.all(loadPromises);
}

window.onload = function () {
    const lang = getLanguage();
    try {
        if (localStorage.getItem('tubeExperiment_failedEngagement') === 'true') {
            updatePageContent(lang);
            alert(translations[lang].earlyExitMessage);

            // Hide all potential sections so the game doesn't show
            ['gamesection', 'formsection', 'initialInstructionSection', 'passwordSection'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
            return;
        }
    } catch (e) { }

    const tubeExp = new TubeExperiment();

    const faceImageUrls = [];
    ['left', 'right'].forEach(side => {
        tubeExp.faceTypes.forEach(faceId => {
            faceImageUrls.push(`img/${side}_${tubeExp.image_name}_${faceId}.png`);
        });
    });

    preloadImages(faceImageUrls).then(() => {
        const sessionGroup = getQueryParam('SG'); // Get session_group from URL

        tubeExp.session = {
            session_group: sessionGroup || config.cohort,
            experiment_version: config.experiment_version,
            file_version: config.datafile_version,
            browserData: getBrowserData(),
            tubeTypes: tubeExp.tubeTypes,
            faceTypes: tubeExp.faceTypes,
            mturk: tubeExp.mturk
        };
        tubeExp.UUID = generateUUID();

        // Generate trials and start the first one
        tubeExp.generateTrials();
        tubeExp.startTrial();
    }).catch(error => {
        console.error("Error loading images: ", error);
        // Handle image loading errors here
    });

    lang = getLanguage(); // You need to define getLanguage() to read the 'lang' URL parameter
    updatePageContent(lang); // And define updatePageContent() to update the page's content

}

function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}
document.addEventListener('DOMContentLoaded', function () {
    const access_control = getQueryParam('AC');
    const passwordSection = document.getElementById('passwordSection');
    const passwordInput = document.getElementById('passwordInput');
    const submitPassword = document.getElementById('submitPassword');
    const passwordError = document.getElementById('passwordError');

    if (access_control) {
        passwordSection.style.display = 'block';
    }

    submitPassword.addEventListener('click', function () {
        if (passwordInput.value === access_control) {
            // Password is correct, hide the initial instruction section and show the game section
            document.getElementById('passwordSection').style.display = 'none';
            document.getElementById('initialInstructionSection').style.display = 'block';
            //document.getElementById('gamesection').style.display = 'flex';
        } else {
            // Password is incorrect, show an error message
            passwordError.style.display = 'block';
        }
    });
});
