// Content filtering and monitoring script
let settings = null;
let usageStats = null;
let observer = null;
let startTime = Date.now();
let lastTipTime = 0;

// Initialize content script
async function initialize() {
    // Load settings and stats
    settings = await loadSettings();
    usageStats = await loadUsageStats();
    
    // Start monitoring
    startMonitoring();
    
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener(handleMessage);
    
    // Show initial tip if enabled
    if (settings.tips.enabled) {
        showMentalHealthTip();
    }
}

// Load settings from storage
async function loadSettings() {
    return new Promise((resolve) => {
        chrome.storage.sync.get('settings', (result) => {
            resolve(result.settings || {
                timeLimit: { hours: 2, minutes: 0 },
                filters: {
                    negative: true,
                    triggering: true,
                    comparison: true,
                    ads: true
                },
                tips: {
                    enabled: true,
                    frequency: 'daily'
                },
                sensitivity: {
                    news: 3,
                    social: 3
                }
            });
        });
    });
}

// Load usage stats from storage
async function loadUsageStats() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['usageStats'], (result) => {
            resolve(result.usageStats || {
                timeUsed: 0,
                contentFiltered: 0,
                dailyLimit: 7200 // 2 hours in seconds
            });
        });
    });
}

// Start monitoring page content
function startMonitoring() {
    // Create observer for dynamic content
    observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        filterContent(node);
                    }
                });
            }
        });
    });
    
    // Start observing
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // Initial content filtering
    filterContent(document.body);
    
    // Start usage tracking
    setInterval(updateUsageStats, 1000);
}

// Filter content based on settings
function filterContent(element) {
    if (!element || !settings) return;
    
    // Get all text content
    const textNodes = getTextNodes(element);
    textNodes.forEach((node) => {
        const text = node.textContent.toLowerCase();
        const isNews = isNewsContent(node.parentElement);
        const sensitivityObj = Object.assign({ news: 3, social: 4 }, settings.sensitivity);
        const sensitivity = isNews ? sensitivityObj.news : sensitivityObj.social;
        
        // Check for negative content
        if (settings.filters.negative && isNegativeContent(text, sensitivity)) {
            hideContent(node.parentElement);
            incrementFilteredCount();
        }
        
        // Check for triggering content
        if (settings.filters.triggering && isTriggeringContent(text, sensitivity)) {
            hideContent(node.parentElement);
            incrementFilteredCount();
        }
        
        // Check for comparison content
        if (settings.filters.comparison && isComparisonContent(text, sensitivity)) {
            hideContent(node.parentElement);
            incrementFilteredCount();
        }
    });
    
    // Filter ads if enabled
    if (settings.filters.ads) {
        const ads = findAds(element);
        ads.forEach((ad) => {
            hideContent(ad);
            incrementFilteredCount();
        });
    }
}

// Get all text nodes in an element
function getTextNodes(element) {
    const textNodes = [];
    const walk = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
    let node;
    while (node = walk.nextNode()) {
        textNodes.push(node);
    }
    
    return textNodes;
}

// Check for negative content with sensitivity
function isNegativeContent(text, sensitivity) {
    const patterns = {
        extreme: [
            /hate|hated|hating/i,
            /terrible|horrible|awful/i,
            /worst|bad|negative/i
        ],
        moderate: [
            /depressing|depressed/i,
            /anxiety|anxious/i,
            /stress|stressed/i,
            /worried|worrying/i,
            /upset|upsetting/i
        ],
        mild: [
            /not great/i,
            /could be better/i,
            /not ideal/i,
            /disappointing/i,
            /frustrated/i
        ]
    };

    // Apply sensitivity levels
    if (sensitivity >= 4) {
        // High sensitivity: check all patterns
        return [...patterns.extreme, ...patterns.moderate, ...patterns.mild].some(pattern => pattern.test(text));
    } else if (sensitivity >= 2) {
        // Medium sensitivity: check extreme and moderate patterns
        return [...patterns.extreme, ...patterns.moderate].some(pattern => pattern.test(text));
    } else {
        // Low sensitivity: only check extreme patterns
        return patterns.extreme.some(pattern => pattern.test(text));
    }
}

// Check for triggering content with sensitivity
function isTriggeringContent(text, sensitivity) {
    const patterns = {
        extreme: [
            /suicide|self-harm/i,
            /abuse|abused/i,
            /trauma|traumatic/i
        ],
        moderate: [
            /violence|violent/i,
            /death|died|dying/i,
            /attack|attacked/i
        ],
        mild: [
            /scary|frightening/i,
            /disturbing/i,
            /upsetting/i
        ]
    };

    // Apply sensitivity levels
    if (sensitivity >= 4) {
        return [...patterns.extreme, ...patterns.moderate, ...patterns.mild].some(pattern => pattern.test(text));
    } else if (sensitivity >= 2) {
        return [...patterns.extreme, ...patterns.moderate].some(pattern => pattern.test(text));
    } else {
        return patterns.extreme.some(pattern => pattern.test(text));
    }
}

// Check for comparison content with sensitivity
function isComparisonContent(text, sensitivity) {
    const patterns = {
        extreme: [
            /better than|worse than/i,
            /perfect|perfection/i,
            /never good enough/i
        ],
        moderate: [
            /should be|must be/i,
            /compare|comparison/i,
            /not as good as/i
        ],
        mild: [
            /could be better/i,
            /wish I was/i,
            /if only/i
        ]
    };

    // Apply sensitivity levels
    if (sensitivity >= 4) {
        return [...patterns.extreme, ...patterns.moderate, ...patterns.mild].some(pattern => pattern.test(text));
    } else if (sensitivity >= 2) {
        return [...patterns.extreme, ...patterns.moderate].some(pattern => pattern.test(text));
    } else {
        return patterns.extreme.some(pattern => pattern.test(text));
    }
}

// Determine if content is news or social
function isNewsContent(element) {
    // Common news-related selectors and patterns
    const newsSelectors = [
        '[class*="news"]',
        '[class*="article"]',
        '[class*="headline"]',
        '[class*="report"]',
        '[class*="update"]'
    ];
    
    const newsPatterns = [
        /breaking news/i,
        /latest update/i,
        /reported that/i,
        /according to/i,
        /official statement/i
    ];
    
    // Check element and its parents for news indicators
    let currentElement = element;
    while (currentElement && currentElement !== document.body) {
        // Check class names
        if (newsSelectors.some(selector => currentElement.matches(selector))) {
            return true;
        }
        
        // Check text content
        const text = currentElement.textContent;
        if (newsPatterns.some(pattern => pattern.test(text))) {
            return true;
        }
        
        currentElement = currentElement.parentElement;
    }
    
    return false;
}

// Find ads in the content
function findAds(element) {
    const adSelectors = [
        '[class*="ad"]',
        '[class*="sponsored"]',
        '[class*="promoted"]',
        '[id*="ad"]',
        '[id*="sponsored"]',
        '[id*="promoted"]'
    ];
    
    return element.querySelectorAll(adSelectors.join(','));
}

// Hide content
function hideContent(element) {
    if (!element || element.classList.contains('mhg-hidden')) return;
    
    element.classList.add('mhg-hidden');
    element.style.display = 'none';
}

// Increment filtered content count
async function incrementFilteredCount() {
    usageStats.contentFiltered++;
    await chrome.storage.local.set({ usageStats });
}

// Update usage stats
async function updateUsageStats() {
    const currentTime = Date.now();
    const timeDiff = (currentTime - startTime) / 1000; // Convert to seconds
    startTime = currentTime;
    
    usageStats.timeUsed += timeDiff;
    
    // Check if daily limit is reached
    if (usageStats.timeUsed >= usageStats.dailyLimit) {
        showLimitReachedMessage();
    }
    
    // Show mental health tip based on frequency
    if (settings.tips.enabled) {
        const tipInterval = getTipInterval();
        if (currentTime - lastTipTime >= tipInterval) {
            showMentalHealthTip();
            lastTipTime = currentTime;
        }
    }
    
    // Save updated stats
    await chrome.storage.local.set({ usageStats });
}

// Get tip interval based on frequency setting
function getTipInterval() {
    switch (settings.tips.frequency) {
        case 'hourly':
            return 3600000; // 1 hour in milliseconds
        case 'daily':
            return 86400000; // 24 hours in milliseconds
        case 'weekly':
            return 604800000; // 7 days in milliseconds
        default:
            return 86400000;
    }
}

// Show mental health tip
function showMentalHealthTip() {
    const tips = [
        "Take a deep breath and remember to stay present in the moment.",
        "Remember that social media often shows curated highlights, not real life.",
        "Consider taking a short break to stretch or walk around.",
        "Focus on meaningful connections rather than likes and follows.",
        "Practice gratitude for the positive things in your life.",
        "Remember that your worth isn't determined by social media engagement.",
        "Take time to engage in activities that bring you joy offline.",
        "Stay hydrated and take care of your physical well-being.",
        "Connect with friends and family in person when possible.",
        "Remember that it's okay to take breaks from social media."
    ];
    
    const tip = tips[Math.floor(Math.random() * tips.length)];
    showNotification(tip, 'tip');
}

// Show limit reached message
function showLimitReachedMessage() {
    const message = "You've reached your daily social media time limit. Consider taking a break!";
    showNotification(message, 'warning');
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `mhg-notification mhg-${type}`;
    notification.textContent = message;
    
    // Add close button
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.className = 'mhg-close';
    closeButton.onclick = () => notification.remove();
    notification.appendChild(closeButton);
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Handle messages from popup
function handleMessage(message, sender, sendResponse) {
    switch (message.type) {
        case 'SETTINGS_UPDATED':
            settings = message.settings;
            break;
            
        case 'SHOW_POSITIVE_CONTENT':
            showPositiveContent();
            break;
            
        case 'TAKE_BREAK':
            showTakeBreakMessage();
            break;
    }
}

// Show positive content
function showPositiveContent() {
    const positiveContent = [
        "Take a moment to appreciate something beautiful around you.",
        "Write down three things you're grateful for today.",
        "Share a kind message with someone you care about.",
        "Take a short walk and notice the positive things around you.",
        "Practice a random act of kindness today."
    ];
    
    const content = positiveContent[Math.floor(Math.random() * positiveContent.length)];
    showNotification(content, 'positive');
}

// Show take break message
function showTakeBreakMessage() {
    const breakMessage = "Time for a break! Consider:\n" +
        "• Taking a short walk\n" +
        "• Doing some stretches\n" +
        "• Having a healthy snack\n" +
        "• Drinking some water\n" +
        "• Taking deep breaths";
    
    showNotification(breakMessage, 'break');
}

// Add styles
const style = document.createElement('style');
style.textContent = `
    .mhg-hidden {
        display: none !important;
    }
    
    .mhg-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        background-color: white;
        color: #222;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        z-index: 999999;
        max-width: 300px;
        animation: slideIn 0.3s ease;
    }
    
    .mhg-notification.mhg-tip {
        border-left: 4px solid #4a90e2;
    }
    
    .mhg-notification.mhg-warning {
        border-left: 4px solid #e74c3c;
    }
    
    .mhg-notification.mhg-positive {
        border-left: 4px solid #2ecc71;
    }
    
    .mhg-notification.mhg-break {
        border-left: 4px solid #f1c40f;
    }
    
    .mhg-close {
        position: absolute;
        top: 5px;
        right: 5px;
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #666;
    }
    
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(style);

// Initialize the content script
initialize(); 