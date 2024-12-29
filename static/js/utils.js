const CONFIG = {
    serverUrl: "https://schema.backyardbrains.com/data",
    timeout: 5000
  };

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
}

function getBrowserData() {
    const userAgent = navigator.userAgent;
    const screenResolution = `${window.screen.width}x${window.screen.height}`;
    const viewportSize = `${window.innerWidth}x${window.innerHeight}`;

    let os, browser;

    // Get OS
    if (userAgent.indexOf("Win") != -1) os = "Windows";
    else if (userAgent.indexOf("Mac") != -1) os = "Macintosh";
    else if (userAgent.indexOf("Linux") != -1) os = "Linux";
    else if (userAgent.indexOf("Android") != -1) os = "Android";
    else if (userAgent.indexOf("like Mac") != -1) os = "iOS";
    else os = "Not detected";

    // Get browser
    if (userAgent.indexOf("Chrome") != -1) browser = "Chrome";
    else if (userAgent.indexOf("Safari") != -1) browser = "Safari";
    else if (userAgent.indexOf("Firefox") != -1) browser = "Firefox";
    else if (userAgent.indexOf("MSIE ") != -1 || userAgent.indexOf("Trident/") != -1) browser = "Internet Explorer";
    else browser = "Not detected";

    return {
        os: os,
        browser: browser,
        screenResolution: screenResolution,
        browserViewport: viewportSize
    };
}


async function sendDataToServer(data, UUID, experimentName) {

    const dataToSend = {
      experiment: experimentName,
      UUID : UUID,
      data  
    };
  
    try {
      await fetch(CONFIG.serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dataToSend)
      });
      console.log("Data sent successfully");
    } catch(err) {
      console.error("Error sending data", err);
    }
  
  }

// Shuffle function
function shuffle(array) {
  let currentIndex = array.length, randomIndex;

  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }

  return array;
}
