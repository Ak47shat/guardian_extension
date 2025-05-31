// Background script for Mental Health Guardian

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
    // Set default settings
    const defaultSettings = {
        timeLimit: {
            hours: 2,
            minutes: 0
        },
        filters: {
            negative: true,
            triggering: true,
            comparison: true,
            ads: true
        },
        tips: {
            enabled: true,
            frequency: 'daily'
        }
    };
    
    await chrome.storage.sync.set({ settings: defaultSettings });
    
    // Initialize usage stats
    const defaultStats = {
        timeUsed: 0,
        contentFiltered: 0,
        dailyLimit: defaultSettings.timeLimit.hours * 3600 + defaultSettings.timeLimit.minutes * 60,
        lastReset: Date.now()
    };
    
    await chrome.storage.local.set({ usageStats: defaultStats });
    
    // Create alarm for daily reset
    chrome.alarms.create('dailyReset', {
        periodInMinutes: 1440 // 24 hours
    });
});

// Handle daily reset
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'dailyReset') {
        // Get current settings to maintain the daily limit
        const { settings } = await chrome.storage.sync.get('settings');
        
        // Reset usage stats while maintaining the daily limit
        const resetStats = {
            timeUsed: 0,
            contentFiltered: 0,
            dailyLimit: settings.timeLimit.hours * 3600 + settings.timeLimit.minutes * 60,
            lastReset: Date.now()
        };
        
        await chrome.storage.local.set({ usageStats: resetStats });
        
        // Notify all tabs about the reset
        const tabs = await chrome.tabs.query({});
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { type: 'STATS_RESET' }).catch(() => {
                // Ignore errors for tabs that don't have the content script
            });
        });
    }
});

// Handle tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && isSocialMediaSite(tab.url)) {
        // Inject content script
        chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
        }).catch(() => {
            // Ignore errors for tabs where we can't inject
        });
    }
});

// Check if URL is a supported social media site
function isSocialMediaSite(url) {
    if (!url) return false;
    
    const socialMediaPatterns = [
        /facebook\.com/i,
        /instagram\.com/i,
        /twitter\.com/i,
        /tiktok\.com/i
    ];
    
    return socialMediaPatterns.some(pattern => pattern.test(url));
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'UPDATE_BADGE') {
        // Update extension badge with filtered content count
        chrome.action.setBadgeText({
            text: message.count.toString(),
            tabId: sender.tab.id
        });
        
        chrome.action.setBadgeBackgroundColor({
            color: '#4a90e2',
            tabId: sender.tab.id
        });
    }
}); 