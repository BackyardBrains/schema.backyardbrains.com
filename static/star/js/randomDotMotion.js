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
        this.dotLifetime = 200; // ms - exactly 200ms lifetime
        this.coherenceRatio = 0.4; // 40% coherent dots
        this.createDots();
        this.animationFrameId = null;
        this.lastUpdateTime = null;
    }

    createDots() {
        const areaSize = 5; // degrees (5° x 5° area)
        const pixelsPerDegree = this.canvasWidth / 14.7; // pixels per degree based on grating size

        for (let i = 0; i < this.numDots; i++) {
            // Assign initial positions randomly
            const x = (Math.random() - 0.5) * areaSize * pixelsPerDegree;
            const y = (Math.random() - 0.5) * areaSize * pixelsPerDegree;
            
            // Determine if initially coherent (40% chance)
            const isCoherent = Math.random() < this.coherenceRatio;
            const direction = isCoherent ? this.direction : 'random';
            
            // Stagger dot lifetimes so they don't all reset at once
            this.dots.push({
                x: x,
                y: y,
                direction: direction,
                lifetime: Math.random() * this.dotLifetime,
                isCoherent: isCoherent
            });
        }
    }

    resetDots(direction) {
        this.direction = direction; // Update direction for the new trial
        
        // Reset all dots for a new trial
        this.dots.forEach(dot => {
            // Re-determine coherence for all dots (40% chance)
            dot.isCoherent = Math.random() < this.coherenceRatio;
            dot.direction = dot.isCoherent ? this.direction : 'random';
            
            // Reset position
            const areaSize = 5;
            const pixelsPerDegree = this.canvasWidth / 14.7;
            dot.x = (Math.random() - 0.5) * areaSize * pixelsPerDegree;
            dot.y = (Math.random() - 0.5) * areaSize * pixelsPerDegree;
            
            // Stagger lifetimes again
            dot.lifetime = Math.random() * this.dotLifetime;
        });
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

            // Wrap around edges
            const halfAreaPixels = (5 / 2) * pixelsPerDegree;
            if (dot.x < -halfAreaPixels) dot.x += 5 * pixelsPerDegree;
            if (dot.x > halfAreaPixels) dot.x -= 5 * pixelsPerDegree;
            if (dot.y < -halfAreaPixels) dot.y += 5 * pixelsPerDegree;
            if (dot.y > halfAreaPixels) dot.y -= 5 * pixelsPerDegree;

            // Update lifetime and reset when needed
            dot.lifetime += deltaTime;
            if (dot.lifetime > this.dotLifetime) {
                // Reset dot position
                dot.x = (Math.random() - 0.5) * 5 * pixelsPerDegree;
                dot.y = (Math.random() - 0.5) * 5 * pixelsPerDegree;
                
                // IMPORTANT: Re-randomize coherence status on every rebirth
                // Each dot has a fresh 40% chance of moving coherently
                dot.isCoherent = Math.random() < this.coherenceRatio;
                dot.direction = dot.isCoherent ? this.direction : 'random';
                
                // Reset lifetime
                dot.lifetime = 0;
            }
        });
    }

    drawDots() {
        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        this.ctx.save();
        this.ctx.translate(this.canvasWidth / 2, this.canvasHeight / 2);

        // Count dots by type for debugging
        let coherentCount = 0;
        
        this.dots.forEach(dot => {
            this.ctx.beginPath();
            this.ctx.arc(dot.x, dot.y, this.dotRadius * (this.canvasWidth / 14.7), 0, 2 * Math.PI);
            
            // Uncomment for debugging - shows coherent dots in red, random in black
            // this.ctx.fillStyle = dot.isCoherent ? '#f00' : '#000';
            this.ctx.fillStyle = '#000';
            
            this.ctx.fill();
            
            // Optional: Visualize lifetime (dots get more transparent as they age)
            // const alpha = 1 - (dot.lifetime / this.dotLifetime);
            // this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
            
            if (dot.isCoherent) coherentCount++;
        });
        
        // Log coherence ratio periodically (uncomment for debugging)
        // if (Math.random() < 0.01) {  // Log only occasionally
        //     console.log(`Coherent dots: ${coherentCount}/${this.dots.length} (${(coherentCount/this.dots.length*100).toFixed(1)}%)`);
        // }

        this.ctx.restore();
    }
}