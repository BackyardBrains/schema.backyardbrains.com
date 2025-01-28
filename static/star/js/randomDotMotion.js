// randomDotMotion.js
class RandomDotMotion {
    constructor(ctx, canvasWidth, canvasHeight, direction) {
        this.ctx = ctx;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.direction = direction; // 'left' or 'right'
        this.dots = [];
        this.numDots = 50 * 5 * 5; // 50 dots per square degree in a 5°x5° area
        this.dotDensity = 50; // dots per square degree
        this.dotRadius = 0.05; // degrees
        this.dotSpeed = 2; // degrees per second
        this.dotLifetime = 200; // ms
        this.animationFrameId = null;
        this.lastUpdateTime = null;
    }

    createDots() {
        const areaSize = 5; // degrees (5° x 5° area)
        const pixelsPerDegree = this.canvasWidth / 14.7; // pixels per degree based on grating size

        for (let i = 0; i < this.numDots; i++) {
            const x = (Math.random() - 0.5) * areaSize * pixelsPerDegree;
            const y = (Math.random() - 0.5) * areaSize * pixelsPerDegree;
            const direction = Math.random() < 0.6 ? 'random' : this.direction; // 60% random, 40% coherent
            this.dots.push({
                x: x,
                y: y,
                direction: direction,
                lifetime: Math.random() * this.dotLifetime // Randomize initial lifetime
            });
        }
    }

    resetDots(direction) {
        this.dots = []; // Clear existing dots
        this.direction = direction; // Update direction for the new trial
        this.createDots(); // Recreate dots with new settings
    }

    start() {
        this.lastUpdateTime = performance.now();
        this.animate();
    }

    animate() {
        this.animationFrameId = requestAnimationFrame(() => this.animate());
        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastUpdateTime;

        if (deltaTime >= 16) { // Approximately 60 FPS
            this.updateDots(deltaTime);
            this.drawDots();
            this.lastUpdateTime = currentTime;
        }
    }

    updateDots(deltaTime) {
        const pixelsPerDegree = this.canvasWidth / 14.7; // pixels per degree based on grating size
        const deltaDegrees = this.dotSpeed * (deltaTime / 1000); // degrees to move
        const deltaPixels = deltaDegrees * pixelsPerDegree;

        this.dots.forEach(dot => {
            let moveX = 0;
            let moveY = 0;

            if (dot.direction === 'random') {
                const angle = Math.random() * 2 * Math.PI;
                moveX = deltaPixels * Math.cos(angle);
                moveY = deltaPixels * Math.sin(angle);
            } else {
                const angle = dot.direction === 'left' ? Math.PI : 0;
                moveX = deltaPixels * Math.cos(angle);
                moveY = deltaPixels * Math.sin(angle);
            }

            dot.x += moveX;
            dot.y += moveY;

            const halfAreaPixels = (5 / 2) * pixelsPerDegree;
            if (dot.x < -halfAreaPixels) dot.x += 5 * pixelsPerDegree;
            if (dot.x > halfAreaPixels) dot.x -= 5 * pixelsPerDegree;
            if (dot.y < -halfAreaPixels) dot.y += 5 * pixelsPerDegree;
            if (dot.y > halfAreaPixels) dot.y -= 5 * pixelsPerDegree;

            dot.lifetime += deltaTime;
            if (dot.lifetime > this.dotLifetime) {
                dot.x = (Math.random() - 0.5) * 5 * pixelsPerDegree;
                dot.y = (Math.random() - 0.5) * 5 * pixelsPerDegree;
                dot.direction = Math.random() < 0.6 ? 'random' : this.direction;
                dot.lifetime = 0;
            }
        });
    }

    drawDots() {
        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        this.ctx.save();
        this.ctx.translate(this.canvasWidth / 2, this.canvasHeight / 2);

        this.dots.forEach(dot => {
            this.ctx.beginPath();
            this.ctx.arc(dot.x, dot.y, this.dotRadius * (this.canvasWidth / 14.7), 0, 2 * Math.PI);
            this.ctx.fillStyle = '#000';
            this.ctx.fill();
        });

        this.ctx.restore();
    }
}

// ORIGINAL

// // randomDotMotion.js
// console.log("randomDotMotion.js loaded successfully");

// /**
//  * RandomDotMotion Class to handle random dot motion stimulus
//  */
// class RandomDotMotion {
//     constructor(ctx, canvasWidth, canvasHeight, direction) {
//         this.ctx = ctx;
//         this.canvasWidth = canvasWidth;
//         this.canvasHeight = canvasHeight;
//         this.direction = direction; // 'left' or 'right'
//         this.dots = [];
//         this.numDots = 50 * 5 * 5; // 50 dots per square degree in a 5°x5° area
//         this.dotDensity = 50; // dots per square degree
//         this.dotRadius = 0.05; // degrees
//         this.dotSpeed = 2; // degrees per second
//         this.dotLifetime = 200; // ms
//         this.createDots();
//         this.animationFrameId = null;
//         this.lastUpdateTime = null;
//     }

//     /**
//      * Initializes the dots with random positions and directions.
//      */
//     createDots() {
//         const areaSize = 5; // degrees (5° x 5° area)
//         const pixelsPerDegree = this.canvasWidth / 14.7; // pixels per degree based on grating size

//         for (let i = 0; i < this.numDots; i++) {
//             const x = (Math.random() - 0.5) * areaSize * pixelsPerDegree;
//             const y = (Math.random() - 0.5) * areaSize * pixelsPerDegree;
//             const direction = Math.random() < 0.6 ? 'random' : this.direction; // 60% random, 40% coherent
//             this.dots.push({
//                 x: x,
//                 y: y,
//                 direction: direction,
//                 lifetime: Math.random() * this.dotLifetime // **Randomize initial lifetime**
//             });
//         }
//     }

//     /**
//      * Starts the random dot motion animation.
//      */
//     start() {
//         this.lastUpdateTime = performance.now();
//         this.animate();
//     }

//     /**
//      * Handles the animation loop for random dot motion.
//      */
//     animate() {
//         this.animationFrameId = requestAnimationFrame(() => this.animate());
//         const currentTime = performance.now();
//         const deltaTime = currentTime - this.lastUpdateTime;

//         if (deltaTime >= 16) { // Approximately 60 FPS
//             this.updateDots(deltaTime);
//             this.drawDots();
//             this.lastUpdateTime = currentTime;
//         }
//     }

//     /**
//      * Updates the positions and lifetimes of the dots.
//      * @param {number} deltaTime - Time since last update in ms.
//      */
//     updateDots(deltaTime) {
//         const pixelsPerDegree = this.canvasWidth / 14.7; // pixels per degree based on grating size
//         const deltaDegrees = this.dotSpeed * (deltaTime / 1000); // degrees to move
//         const deltaPixels = deltaDegrees * pixelsPerDegree;

//         this.dots.forEach(dot => {
//             // Determine movement direction
//             let moveX = 0;
//             let moveY = 0;

//             if (dot.direction === 'random') {
//                 // Random direction: 360 degrees
//                 const angle = Math.random() * 2 * Math.PI;
//                 moveX = deltaPixels * Math.cos(angle);
//                 moveY = deltaPixels * Math.sin(angle);
//             } else {
//                 // Coherent direction
//                 const angle = dot.direction === 'left' ? Math.PI : 0; // left: 180°, right: 0°
//                 moveX = deltaPixels * Math.cos(angle);
//                 moveY = deltaPixels * Math.sin(angle);
//             }

//             // Update position
//             dot.x += moveX;
//             dot.y += moveY;

//             // Smooth wrapping around the stimulus area
//             const halfAreaPixels = (5 / 2) * pixelsPerDegree;
//             if (dot.x < -halfAreaPixels) dot.x += 5 * pixelsPerDegree;
//             if (dot.x > halfAreaPixels) dot.x -= 5 * pixelsPerDegree;
//             if (dot.y < -halfAreaPixels) dot.y += 5 * pixelsPerDegree;
//             if (dot.y > halfAreaPixels) dot.y -= 5 * pixelsPerDegree;

//             // Update lifetime
//             dot.lifetime += deltaTime;
//             if (dot.lifetime > this.dotLifetime) {
//                 // Reset dot position and direction
//                 dot.x = (Math.random() - 0.5) * 5 * pixelsPerDegree;
//                 dot.y = (Math.random() - 0.5) * 5 * pixelsPerDegree;
//                 dot.direction = Math.random() < 0.6 ? 'random' : this.direction;
//                 dot.lifetime = 0;
//             }
//         });
//     }

//     /**
//      * Draws the dots on the canvas.
//      */
//     drawDots() {
//         this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
//         this.ctx.save();
//         this.ctx.translate(this.canvasWidth / 2, this.canvasHeight / 2);

//         this.dots.forEach(dot => {
//             this.ctx.beginPath();
//             this.ctx.arc(dot.x, dot.y, this.dotRadius * (this.canvasWidth / 14.7), 0, 2 * Math.PI);
//             this.ctx.fillStyle = '#000';
//             this.ctx.fill();
//         });

//         this.ctx.restore();
//     }
// }
