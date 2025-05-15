// grating.js
console.log("Grating.js loaded successfully");
/**
 * Grating Class to handle sinusoidal grating stimulus
 */
class Grating {
    constructor(ctx, canvasWidth, canvasHeight, direction) {
        this.ctx = ctx;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.direction = direction; // 'left' or 'right'
        this.phase = 0; // Current phase of the sine wave
        this.frequency = 1 / 0.8; // Cycles per degree (1 / grating period)
        this.speed = 0.8; // Degrees per second
        this.startTime = null; // Time when the stimulus starts
        this.duration = 0; // Duration of the stimulus in ms
        this.animationFrameId = null; // ID for the animation frame
    }

    /**
     * Starts the grating animation.
     * @param {number} duration - Duration in seconds.
     * @param {function} callback - Function to call after animation ends.
     */
    start(duration, callback) {
        this.duration = duration * 1000; // Convert seconds to milliseconds
        this.startTime = performance.now();
        this.lastFrameTime = this.startTime;
        this.animate(callback);
    }

    /**
     * Handles the animation loop.
     * @param {function} callback - Function to call after animation ends.
     */
    animate(callback) {
        const animateFrame = (currentTime) => {
            const elapsed = currentTime - this.startTime;
            if (elapsed > this.duration) {
                cancelAnimationFrame(this.animationFrameId);
                callback();
                return;
            }

            const deltaTime = currentTime - this.lastFrameTime; // Time since last frame in ms
            this.lastFrameTime = currentTime;

            // Update phase based on direction, speed, frequency, and deltaTime
            // Phase shift (radians) = speed (deg/s) * deltaTime (s) * frequency (cycles/deg) * 2π
            const deltaPhase = (this.speed * (deltaTime / 1000) * this.frequency * 2 * Math.PI) * (this.direction === 'left' ? -1 : 1);
            this.phase += deltaPhase;

            // Draw the updated grating
            this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
            this.drawGrating();

            this.animationFrameId = requestAnimationFrame(animateFrame);
        };

        this.animationFrameId = requestAnimationFrame(animateFrame);
    }

    /**
     * Draws the full-field sinusoidal grating.
     */
    drawGrating() {
        const frequency = this.frequency; // cycles per degree
        const pixelsPerDegree = this.canvasWidth / 14.7; // pixels per degree based on grating size (14.7° wide)

        for (let x = 0; x < this.canvasWidth; x++) {
            // Convert pixel x to degrees relative to center
            const xDeg = (x - this.canvasWidth / 2) / pixelsPerDegree;
            // Compute sine value for this x position and current phase
            const sineValue = Math.sin(2 * Math.PI * frequency * xDeg + this.phase);
            // Map sine value (-1 to 1) to grayscale (0 to 255)
            const gray = Math.round(((sineValue + 1) / 2) * 255);
            // Set fill style to the computed gray level
            this.ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
            // Fill a 1px wide vertical rectangle for this column
            this.ctx.fillRect(x, 0, 1, this.canvasHeight);
        }
    }
}
