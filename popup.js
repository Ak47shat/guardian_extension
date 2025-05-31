// Default settings
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
    sensitivity: {
        news: 3, // 1-5 scale, 3 is balanced
        social: 4  // 1-5 scale, 4 is more filtered
    },
    tips: {
        enabled: true,
        frequency: 'daily'
    }
};

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
    // Load settings
    const settings = await loadSettings();
    updateUI(settings);
    
    // Load usage stats
    const stats = await loadUsageStats();
    updateStats(stats);
    
    // Add event listeners
    addEventListeners();
});

// Load settings from storage
async function loadSettings() {
    return new Promise((resolve) => {
        chrome.storage.sync.get('settings', (result) => {
            let settings = result.settings || defaultSettings;
            // Add default sensitivity if missing
            if (!settings.sensitivity) {
                settings.sensitivity = { news: 3, social: 4 };
            }
            resolve(settings);
        });
    });
}

// Load usage stats from storage
async function loadUsageStats() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['usageStats'], (result) => {
            const stats = result.usageStats || {
                timeUsed: 0,
                contentFiltered: 0,
                dailyLimit: defaultSettings.timeLimit.hours * 3600 + defaultSettings.timeLimit.minutes * 60
            };
            resolve(stats);
        });
    });
}

// Update UI with settings
function updateUI(settings) {
    // Time limit
    document.getElementById('hours-limit').value = settings.timeLimit.hours;
    document.getElementById('minutes-limit').value = settings.timeLimit.minutes;
    
    // Filters (use default if missing)
    const filters = settings.filters || { negative: true, triggering: true, comparison: true, ads: true };
    document.getElementById('filter-negative').checked = filters.negative;
    document.getElementById('filter-triggering').checked = filters.triggering;
    document.getElementById('filter-comparison').checked = filters.comparison;
    document.getElementById('filter-ads').checked = filters.ads;
    
    // Sensitivity (add default if missing or incomplete)
    const sensitivity = Object.assign({ news: 3, social: 4 }, settings.sensitivity);
    document.getElementById('news-sensitivity').value = sensitivity.news;
    document.getElementById('social-sensitivity').value = sensitivity.social;
    
    // Tips
    document.getElementById('enable-tips').checked = settings.tips.enabled;
    document.getElementById('tips-frequency').value = settings.tips.frequency;
}

// Update stats display
function updateStats(stats) {
    // Format time used
    const hours = Math.floor(stats.timeUsed / 3600);
    const minutes = Math.floor((stats.timeUsed % 3600) / 60);
    document.getElementById('time-used').textContent = `${hours}h ${minutes}m`;
    
    // Update filtered content count
    document.getElementById('content-filtered').textContent = stats.contentFiltered;
    
    // Update progress bar
    const progress = (stats.timeUsed / stats.dailyLimit) * 100;
    document.getElementById('usage-progress').style.width = `${Math.min(progress, 100)}%`;
    
    // Update progress bar color based on usage
    const progressBar = document.getElementById('usage-progress');
    if (progress >= 100) {
        progressBar.style.backgroundColor = 'var(--danger-color)';
    } else if (progress >= 80) {
        progressBar.style.backgroundColor = 'var(--warning-color)';
    } else {
        progressBar.style.backgroundColor = 'var(--primary-color)';
    }
}

// Add event listeners
function addEventListeners() {
    // Save settings button
    document.getElementById('save-settings').addEventListener('click', saveSettings);
    
    // Show positive content button
    document.getElementById('show-positive').addEventListener('click', showPositiveContent);
    
    // Take a break button
    document.getElementById('take-break').addEventListener('click', takeBreak);
}

// Save settings
async function saveSettings() {
    const settings = {
        timeLimit: {
            hours: parseInt(document.getElementById('hours-limit').value) || 0,
            minutes: parseInt(document.getElementById('minutes-limit').value) || 0
        },
        filters: {
            negative: document.getElementById('filter-negative').checked,
            triggering: document.getElementById('filter-triggering').checked,
            comparison: document.getElementById('filter-comparison').checked,
            ads: document.getElementById('filter-ads').checked
        },
        sensitivity: {
            news: parseInt(document.getElementById('news-sensitivity').value),
            social: parseInt(document.getElementById('social-sensitivity').value)
        },
        tips: {
            enabled: document.getElementById('enable-tips').checked,
            frequency: document.getElementById('tips-frequency').value
        }
    };
    
    // Save to storage
    await chrome.storage.sync.set({ settings });
    
    // Update daily limit in usage stats
    const stats = await loadUsageStats();
    stats.dailyLimit = settings.timeLimit.hours * 3600 + settings.timeLimit.minutes * 60;
    await chrome.storage.local.set({ usageStats: stats });
    
    // Notify content script of settings change
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SETTINGS_UPDATED', settings });
    });
    
    // Show success message
    showNotification('Settings saved successfully!');
}

// Show positive content
function showPositiveContent() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SHOW_POSITIVE_CONTENT' });
    });
}

// Take a break
function takeBreak() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TAKE_BREAK' });
    });
}

// Show notification
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Add notification styles
const style = document.createElement('style');
style.textContent = `
    .notification {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background-color: var(--success-color);
        color: white;
        padding: 10px 20px;
        border-radius: 4px;
        animation: slideUp 0.3s ease, fadeOut 0.3s ease 2.7s;
    }
    
    @keyframes slideUp {
        from { transform: translate(-50%, 100%); opacity: 0; }
        to { transform: translate(-50%, 0); opacity: 1; }
    }
    
    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
`;
document.head.appendChild(style); 