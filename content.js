// 1. Inject the main interceptor script into the page's "main" world
const s = document.createElement('script');
s.src = chrome.runtime.getURL('interceptor.js');
(document.head || document.documentElement).appendChild(s);
s.onload = () => s.remove(); // Clean up the script tag

// 2. Listen for messages FROM the interceptor (running in the page)
window.addEventListener('message', (event) => {
    // We only accept messages from ourselves
    if (event.source === window && event.data.type === 'API_CALL_LOG') {
        // Forward the log to the background script
        chrome.runtime.sendMessage({
            type: 'logApiCall',
            payload: event.data.payload
        });
    }
});

// 3. Get options from background and send TO the interceptor
chrome.runtime.sendMessage({ type: 'getOptions' }, (options) => {
    if (options) {
        window.postMessage({ type: 'SET_OPTIONS', payload: options }, '*');
    }
});

// 4. Listen for option updates FROM the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'OPTIONS_UPDATED') {
        // Forward the updated options TO the interceptor
        window.postMessage({ type: 'SET_OPTIONS', payload: request.payload }, '*');
    }
});