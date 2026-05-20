// ==========================================
// 1. GLOBALS & WEBSOCKET SETUP
// ==========================================
let ws;
let userData = null;
let isStreamLive = false;

// ==========================================
// 2. UI & LAYOUT LOGIC
// ==========================================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const menuOverlay = document.getElementById('menuOverlay');

    if (sidebar) sidebar.classList.toggle('active');
    if (menuOverlay) menuOverlay.classList.toggle('active');
}

// ==========================================
// 3. INITIALIZATION ON PAGE LOAD
// ==========================================
window.onload = function () {
    // START BOT CONNECTION IMMEDIATELY FOR TESTING
    if (document.getElementById('status-msg')) {
        connectBot();
    }

    // Handle User Auth UI Restoration
    const savedUser = localStorage.getItem('smokinUser');
    const statusMsg = document.getElementById('status-msg');

    if (savedUser) {
        userData = JSON.parse(savedUser);
        restoreUserUI();
    } else {
        if (statusMsg) statusMsg.innerText = "Sign in to interact with the stream.";
    }

    // Commands Page Auto-scroll Logic
    const details = document.querySelectorAll('details[name="commands"]');
    details.forEach((targetDetail) => {
        targetDetail.addEventListener("toggle", (e) => {
            if (targetDetail.open) {
                setTimeout(() => {
                    const nav = document.querySelector('nav');
                    const navHeight = nav ? nav.offsetHeight : 0;
                    const elementPosition = targetDetail.getBoundingClientRect().top + window.pageYOffset;

                    window.scrollTo({
                        top: elementPosition - navHeight - 10,
                        behavior: "smooth"
                    });
                }, 50);
            }
        });
    });

    // Fetch dynamic resource locations for the Resource pages
    fetchNazarLocation();
    fetchGunVanLocation();
};

// ==========================================
// 4. GOOGLE AUTH & YOUTUBE API LOGIC
// ==========================================
let tokenClient;

function setupGoogleClient() {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: "111000715471-1o7t0ulmnpdiq93agihl4t4q1s4b5mth.apps.googleusercontent.com",
            scope: "https://www.googleapis.com/auth/youtube.readonly",
            callback: (tokenResponse) => {
                if (tokenResponse && tokenResponse.access_token) {
                    fetchYouTubeData(tokenResponse.access_token);
                }
            }
        });
    } else {
        setTimeout(setupGoogleClient, 100);
    }
}

setupGoogleClient();

function initGoogleSignIn() {
    if (!tokenClient) {
        alert("Google Sign-In is still loading. Please try again in a second.");
        return;
    }
    tokenClient.requestAccessToken({ prompt: '' });
}

async function fetchYouTubeData(accessToken) {
    try {
        const response = await fetch('https://youtube.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        const data = await response.json();

        if (data.items && data.items.length > 0) {
            const channel = data.items[0];

            userData = {
                id: channel.id,
                name: channel.snippet.title,
                userName: (channel.snippet.customUrl || channel.snippet.title).replace('@', ''),
                picture: channel.snippet.thumbnails.default.url
            };

            localStorage.setItem('smokinUser', JSON.stringify(userData));
            restoreUserUI();
            updateStreamState(isStreamLive);
        } else {
            alert("No YouTube channel found for this Google account.");
        }
    } catch (error) {
        console.error("Error fetching YouTube data:", error);
        alert("Failed to securely connect to YouTube.");
    }
}

function restoreUserUI() {
    if (!userData) return;
    const loginContainer = document.getElementById('login-button-container');
    const userProfile = document.getElementById('user-profile');
    const userAvatar = document.getElementById('user-avatar');

    if (loginContainer) loginContainer.style.display = 'none';
    if (userProfile) userProfile.style.display = 'flex';
    if (userAvatar) userAvatar.src = userData.picture;
}

function signOut() {
    if (!confirm("Do you want to sign out?")) return;
    localStorage.removeItem('smokinUser');
    userData = null;
    location.reload();
}

// ==========================================
// 5. STREAMER.BOT WEBSOCKET LOGIC
// ==========================================
function connectBot() {
    ws = new WebSocket("wss://bot.2smokinbarrels.com/");

    ws.onopen = () => {
        ws.send(JSON.stringify({ "request": "Subscribe", "events": { "general": ["Custom"] }, "id": "SubRequest" }));
        checkCurrentStatus();
    };

    ws.onmessage = (event) => {
        console.log("RAW WS MESSAGE:", event.data);

        try {
            const msg = JSON.parse(event.data);

            if (msg.event && msg.event.type === "Custom" && msg.data && msg.data.data) {
                const customData = JSON.parse(msg.data.data);

                if (customData.name === "LiveStatusUpdate") {
                    updateStreamState(customData.isLive);

                    const videoFrame = document.getElementById('yt-video-frame');
                    const placeholderImg = document.getElementById('offline-placeholder');
                    const chatFrame = document.getElementById('yt-chat-frame');
                    const msgEl = document.getElementById('status-msg');
                    const chatWrapper = document.getElementById('chat-wrapper');

                    if (customData.videoId && customData.videoId.trim() !== "") {
                        if (videoFrame) {
                            videoFrame.style.display = 'block';
                            if (!videoFrame.src.includes(customData.videoId)) {
                                const autoPlay = customData.isLive ? "?autoplay=1" : "";
                                videoFrame.src = `https://www.youtube.com/embed/${customData.videoId}${autoPlay}`;
                            }
                        }
                        if (placeholderImg) placeholderImg.style.display = 'none';

                        if (chatFrame && !chatFrame.src.includes(customData.videoId)) {
                            const currentDomain = window.location.hostname;
                            chatFrame.src = `https://www.youtube.com/live_chat?v=${customData.videoId}&embed_domain=${currentDomain}&dark_theme=1`;
                        }
                        
                        if (chatWrapper) chatWrapper.style.display = 'block';

                        if (!customData.isLive && msgEl) {
                            msgEl.innerText = "Stream Scheduled! Waiting room is open.";
                            msgEl.style.color = "#ffaa00"; 
                        }
                    } else {
                        if (videoFrame) {
                            videoFrame.style.display = 'none';
                            if (!videoFrame.src.includes("about:blank")) videoFrame.src = "about:blank"; 
                        }
                        if (placeholderImg) placeholderImg.style.display = 'block';
                        if (chatFrame && !chatFrame.src.includes("about:blank")) chatFrame.src = "about:blank"; 
                        if (chatWrapper) chatWrapper.style.display = 'none';
                    }
                }
            }
        } catch (error) {
            console.error("Failed to parse incoming WebSocket message:", error);
        }
    };

    ws.onclose = () => {
        const statusMsg = document.getElementById('status-msg');
        if (statusMsg) statusMsg.innerText = "Offline: Streamer's PC not reachable.";
        setTimeout(connectBot, 5000);
    };
}

function checkCurrentStatus() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ "request": "DoAction", "action": { "name": "Web_Request_Status" }, "id": "StatusCheck" }));
    }
}

function updateStreamState(live) {
    isStreamLive = live;
    const msgEl = document.getElementById('status-msg');
    const isConnected = ws && ws.readyState === WebSocket.OPEN;
    const commandButtons = document.querySelectorAll('.stream-cmd');

    if (!msgEl) return;

    if (isConnected && userData) {
        if (isStreamLive) {
            commandButtons.forEach(btn => btn.disabled = false); 
            msgEl.innerText = "Bot Connected (Stream Online). System ready for testing.";
            msgEl.style.color = "#00ff00"; 
        } else {
            commandButtons.forEach(btn => btn.disabled = true); 
            if (msgEl.innerText !== "Stream Scheduled! Waiting room is open.") {
                msgEl.innerText = "Bot Connected (Stream Offline). Testing not available till Live.";
                msgEl.style.color = "var(--white-med)";
            }
        }
    } else {
        commandButtons.forEach(btn => btn.disabled = true); 
        if (!userData) {
            msgEl.innerText = "Sign in to trigger commands.";
            msgEl.style.color = "var(--white-med)"; 
        } else {
            msgEl.innerText = "Connecting to Streamer.bot...";
            msgEl.style.color = "var(--white-med)"; 
        }
    }
}

function sendAction(actionName, extraCommand = null) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert("Not connected to Command Center. Please wait.");
        return;
    }

    if (!userData) {
        alert("Please sign in to use commands.");
        return;
    }

    const payload = {
        request: "DoAction",
        action: { name: actionName },
        args: { 
            isWebsocketRequest: "True", 
            userId: userData.id, 
            userProfileUrl: userData.picture,
            userName: userData.name, 
            userType: "youtube"
        },
        id: "WebCommandCenter" 
    };

    if (extraCommand) {
        payload.args.commandName = extraCommand;
        payload.args.command = extraCommand;
    }

    ws.send(JSON.stringify(payload));
    console.log(`Successfully fired DoAction for: ${actionName} | Command: ${extraCommand || 'None'}`);
}

// ==========================================
// 6. UTILITIES
// ==========================================
function copyLink(id) {
    const copyText = document.getElementById(id);
    if (!copyText) return;

    copyText.select();
    copyText.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(copyText.value).then(() => {
        alert("Link copied: " + copyText.value);
    });
}

function toggleSection(headerElement) {
    headerElement.classList.toggle('collapsed');
    const contentElement = headerElement.nextElementSibling;
    if (contentElement) {
        contentElement.classList.toggle('collapsed');
    }
}

// ==========================================
// 7. MADAM NAZAR TRACKER (Cached)
// ==========================================
async function fetchNazarLocation() {
    const banner = document.getElementById('nazar-banner');
    const locationText = document.getElementById('nazar-location-text');
    const nazarImage = document.getElementById('nazar-image');
    
    if (!banner || !locationText) return;
    banner.style.display = 'flex'; 

    const now = new Date();
    const currentHourUTC = now.getUTCHours();
    const currentMinuteUTC = now.getUTCMinutes();
    let cycleDate = new Date(now);

    if (currentHourUTC < 6 || (currentHourUTC === 6 && currentMinuteUTC < 1)) {
        cycleDate.setUTCDate(cycleDate.getUTCDate() - 1);
    }

    const cacheKey = `nazar_${cycleDate.getUTCFullYear()}-${cycleDate.getUTCMonth() + 1}-${cycleDate.getUTCDate()}`;
    const cachedData = localStorage.getItem(cacheKey);

    if (cachedData) {
        try {
            const parsed = JSON.parse(cachedData);
            locationText.innerText = parsed.text;
            if (nazarImage) nazarImage.src = parsed.img;
            return; 
        } catch (e) {
            localStorage.removeItem(cacheKey);
        }
    }

    const formatCodename = (name) => {
        if (!name) return "";
        let clean = name.replace(/^p_\d+_/, '').replace(/_/g, ' ');
        return clean.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    };

    try {
        const response = await fetch('https://api.rdo.gg/nazar');
        if (!response.ok) throw new Error("API Offline");
        
        const data = await response.json();
        
        if (data && data.location && data.id) {
            const readableLocation = `${formatCodename(data.location)}, ${formatCodename(data.state)}`;
            const imgPath = `/nazar/${data.id.toLowerCase()}.png`;

            locationText.innerText = readableLocation;
            if (nazarImage) nazarImage.src = imgPath;

            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('nazar_')) localStorage.removeItem(key);
            });
            
            localStorage.setItem(cacheKey, JSON.stringify({
                text: readableLocation,
                img: imgPath
            }));
            
        } else {
            locationText.innerText = "Location currently unknown.";
        }
    } catch (error) {
        console.error("Failed to track Madam Nazar:", error);
        locationText.innerText = "The spirits are quiet today (API Error).";
    }
}

// ==========================================
// 8. GUN VAN TRACKER (Cached & Inventory)
// ==========================================
async function fetchGunVanLocation() {
    const banner = document.getElementById('gun-van-banner');
    const locationText = document.getElementById('gun-van-location-text');
    
    if (!banner || !locationText) return;
    banner.style.display = 'flex'; 
    
    const now = new Date();
    const currentHourUTC = now.getUTCHours();
    const currentMinuteUTC = now.getUTCMinutes();
    let cycleDate = new Date(now);

    if (currentHourUTC < 6 || (currentHourUTC === 6 && currentMinuteUTC < 1)) {
        cycleDate.setUTCDate(cycleDate.getUTCDate() - 1);
    }

    const cacheKey = `gunvan_${cycleDate.getUTCFullYear()}-${cycleDate.getUTCMonth() + 1}-${cycleDate.getUTCDate()}`;
    const cachedData = localStorage.getItem(cacheKey);

    if (cachedData) {
        try {
            const parsed = JSON.parse(cachedData);
            if (parsed.htmlContent) {
                locationText.innerHTML = parsed.htmlContent;
                return;
            } else {
                localStorage.removeItem(cacheKey);
            }
        } catch (e) {
            localStorage.removeItem(cacheKey);
        }
    }

    try {
        const response = await fetch('/api/gunvan.json'); 
        if (!response.ok) throw new Error("Local API missing");
        
        const data = await response.json();
        
        if (data && data.locationName) {
            // Build the HTML string starting with the clean name
            let displayHtml = `<strong style="font-size: 1.1rem;">${data.locationName}</strong>`;
            
            // Only display the Map Image, set to full width of the container
            if (data.mapPath) {
                displayHtml += `
                <div style="margin-top: 10px; margin-bottom: 15px;">
                    <img src="${data.mapPath}" alt="Gun Van Map Location" style="width: 100%; border-radius: 5px; border: 1px solid var(--grey-dark); object-fit: cover; aspect-ratio: 16/9;">
                </div>`;
            }
            
            // Add the cleaned-up inventory list
            if (data.inventory && data.inventory.length > 0) {
                displayHtml += `<span style="font-size: 0.85rem; color: var(--grey-med);">Today's Stock:</span>`;
                displayHtml += `<ul style="font-size: 0.8rem; color: var(--white-med); padding-left: 15px; margin-top: 5px; list-style-type: square;">`;
                data.inventory.forEach(item => {
                    displayHtml += `<li>${item}</li>`;
                });
                displayHtml += `</ul>`;
            }
            
            locationText.innerHTML = displayHtml;

            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('gunvan_')) localStorage.removeItem(key);
            });
            
            localStorage.setItem(cacheKey, JSON.stringify({
                htmlContent: displayHtml
            }));
            
        } else {
            locationText.innerText = "Location currently unknown.";
        }
    } catch (error) {
        console.error("Failed to track Gun Van:", error);
        locationText.innerText = "Los Santos is quiet today (API Data missing).";
    }
}