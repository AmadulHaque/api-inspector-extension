// Global store for options, loaded once.
let globalOptions = { mocks: [], redactions: [] };

// Load options from storage on startup
chrome.storage.sync.get('options', (data) => {
    if (data.options) {
        globalOptions = data.options;
    }
});

// Listen for changes in options and update global var + notify tabs
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.options) {
        globalOptions = changes.options.newValue;
        // Notify all active content scripts of the change
        chrome.tabs.query({}, (tabs) => {
            for (const tab of tabs) {
                if (tab.id) {
                    chrome.tabs.sendMessage(tab.id, {
                        type: 'OPTIONS_UPDATED',
                        payload: globalOptions
                    }).catch(e => console.warn(`Failed to send options to tab ${tab.id}: ${e.message}`));
                }
            }
        });
    }
});

// Main message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const tabId = sender.tab?.id;

    // Route messages based on type
    switch (request.type) {

        // --- From content-script.js ---
        case 'logApiCall':
            if (tabId) {
                handleLogApiCall(tabId, request.payload);
            }
            break;

        case 'getOptions':
            // Content script is asking for options on init
            sendResponse(globalOptions);
            return true; // Keep message port open for async response

        // --- From popup.js ---
        case 'getLogs':
            if (request.tabId) {
                getLogsForTab(request.tabId).then(sendResponse);
            }
            return true; // Async response

        case 'clearLogs':
            if (request.tabId) {
                clearLogsForTab(request.tabId).then(sendResponse);
            }
            return true; // Async response
    }

    return false; // No async response
});

/**
 * Stores a single API log entry for a specific tab.
 */
async function handleLogApiCall(tabId, logEntry) {
    try {
        const key = `tab_${tabId}`;
        const data = await chrome.storage.session.get(key);
        const logs = data[key] || [];
        logs.push(logEntry);
        await chrome.storage.session.set({ [key]: logs });

        // Update badge text to show call count
        chrome.action.setBadgeText({ text: logs.length.toString(), tabId: tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#333', tabId: tabId });

    } catch (e) {
        console.error("Error saving API log:", e);
    }
}

/**
 * Retrieves all logs for a specific tab.
 */
async function getLogsForTab(tabId) {
    try {
        const key = `tab_${tabId}`;
        const data = await chrome.storage.session.get(key);
        return data[key] || [];
    } catch (e) {
        console.error("Error retrieving logs:", e);
        return [];
    }
}

/**
 * Clears all logs for a specific tab.
 */
async function clearLogsForTab(tabId) {
    try {
        const key = `tab_${tabId}`;
        await chrome.storage.session.remove(key);
        // Clear badge
        chrome.action.setBadgeText({ text: '', tabId: tabId });
        return { success: true };
    } catch (e) {
        console.error("Error clearing logs:", e);
        return { success: false, error: e.message };
    }
}

// Clear session storage when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    clearLogsForTab(tabId);
});