document.addEventListener('DOMContentLoaded', () => {
    const videoPlayerId = 'my-test-video';
    const videoUrl = 'https://cdn.jsdelivr.net/gh/loftusmi3/byb-squeeze-videos@8717b6ab917974cddfb96d9311f4b83b68a36578/hard1.mp4';

    const videoElement = document.getElementById(videoPlayerId);

    if (!videoElement) {
        console.error(`Video element with ID '${videoPlayerId}' not found.`);
        alert(`Error: Video element with ID '${videoPlayerId}' not found. Cannot initialize player.`);
        return;
    }

    // Initialize Video.js player
    const player = videojs(videoPlayerId, {
        // Player options (can be left empty for defaults if data-setup='{}' is used and working)
        //autoplay: false, // Set to true if you want it to play immediately after loading
        //controls: true, // Already set in HTML, but can be reinforced here
    });

    player.ready(() => {
        console.log('Video.js player is ready.');
        
        // Set the source
        player.src({
            src: videoUrl,
            type: 'video/mp4' // Explicitly set the type
        });

        // Optional: Attempt to play the video once the source is set
        // player.play().catch(error => {
        //     console.error('Error attempting to play video:', error);
        //     alert('Could not automatically play the video. Please check console for errors or try pressing play.');
        // });

        console.log(`Attempting to load video: ${videoUrl}`);
    });

    player.on('error', () => {
        const error = player.error();
        console.error('Video.js Player Error:', error);
        alert(`A video error occurred: ${error ? error.message : 'Unknown error'}`);
    });

    player.on('loadeddata', () => {
        console.log('Video data has been loaded.');
    });

    player.on('play', () => {
        console.log('Video playback started.');
    });

    player.on('pause', () => {
        console.log('Video playback paused.');
    });

    player.on('ended', () => {
        console.log('Video playback ended.');
    });

});
