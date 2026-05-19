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
        // Note: We don't auto-call initGoogleSignIn() anymore because OAuth popups must be triggered by a user click
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

    // Fetch Madam Nazar location for the Resources page
    fetchNazarLocation();
};

// ==========================================
// 4. GOOGLE AUTH & YOUTUBE API LOGIC
// ==========================================
let tokenClient;

// Initialize the client in the background as soon as Google's library loads
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
        // If Google's script hasn't finished downloading yet, check again in 100ms
        setTimeout(setupGoogleClient, 100);
    }
}

// Start the background setup immediately
setupGoogleClient();

function initGoogleSignIn() {
    if (!tokenClient) {
        alert("Google Sign-In is still loading. Please try again in a second.");
        return;
    }
    // Fire the popup! (Passing prompt: '' ensures a clean re-authentication)
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

            // Map the exact variables Streamer.bot needs
            userData = {
                id: channel.id, // The UC... ID!
                name: channel.snippet.title, // The Display Name
                // Natively strip the '@' symbol from the handle!
                userName: (channel.snippet.customUrl || channel.snippet.title).replace('@', ''),
                picture: channel.snippet.thumbnails.default.url
            };

            localStorage.setItem('smokinUser', JSON.stringify(userData));
            restoreUserUI();

            // Re-check stream status to unlock buttons
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
// 5. STREAMER.BOT WEBSOCKET LOGIC (VIA CLOUDFLARE)
// ==========================================
function connectBot() {
    ws = new WebSocket("wss://bot.2smokinbarrels.com/");

    ws.onopen = () => {
        // FIX: Streamer.bot strictly requires 'general' to be lowercase
        ws.send(JSON.stringify({ "request": "Subscribe", "events": { "general": ["Custom"] }, "id": "SubRequest" }));
        
        // Removed updateStreamState here so we don't accidentally override the scheduled stream logic before checking status
        checkCurrentStatus();
    };

    ws.onmessage = (event) => {
        console.log("RAW WS MESSAGE:", event.data);

        try {
            const msg = JSON.parse(event.data);

            // 1. Check if Streamer.bot sent its native Custom Event wrapper
            if (msg.event && msg.event.type === "Custom" && msg.data && msg.data.data) {

                // 2. Unpack the string we sent from our C# script
                const customData = JSON.parse(msg.data.data);

                // 3. Route the variables to your UI
                if (customData.name === "LiveStatusUpdate") {
                    // Update buttons based on live status
                    updateStreamState(customData.isLive);

                    const videoFrame = document.getElementById('yt-video-frame');
                    const placeholderImg = document.getElementById('offline-placeholder');
                    const chatFrame = document.getElementById('yt-chat-frame');
                    const msgEl = document.getElementById('status-msg');
                    const chatWrapper = document.getElementById('chat-wrapper');

                    // SCENARIO A & B: We have a Video ID (Either Scheduled OR Live)
                    if (customData.videoId && customData.videoId.trim() !== "") {
                        
                        // 1. Show the video player, hide the offline image
                        if (videoFrame) {
                            videoFrame.style.display = 'block';
                            
                            // Only update if it's a new video ID so we don't refresh the player
                            if (!videoFrame.src.includes(customData.videoId)) {
                                // Optional: auto-play if it's actually live
                                const autoPlay = customData.isLive ? "?autoplay=1" : "";
                                videoFrame.src = `https://www.youtube.com/embed/${customData.videoId}${autoPlay}`;
                            }
                        }
                        if (placeholderImg) placeholderImg.style.display = 'none';

                        // 2. Load the Chat (This works for both Waiting Rooms and Live Chat)
                        if (chatFrame && !chatFrame.src.includes(customData.videoId)) {
                            const currentDomain = window.location.hostname;
                            chatFrame.src = `https://www.youtube.com/live_chat?v=${customData.videoId}&embed_domain=${currentDomain}&dark_theme=1`;
                        }
                        
                        if (chatWrapper) chatWrapper.style.display = 'block';

                        // 3. Override the status text if it is specifically Scheduled (Not Live)
                        if (!customData.isLive && msgEl) {
                            msgEl.innerText = "Stream Scheduled! Waiting room is open.";
                            msgEl.style.color = "#ffaa00"; // Orange to indicate waiting mode
                        }
                        
                    } 
                    // SCENARIO C: No Video ID (Offline and nothing scheduled)
                    else {
                        if (videoFrame) {
                            videoFrame.style.display = 'none';
                            if (!videoFrame.src.includes("about:blank")) videoFrame.src = "about:blank"; // Clear the player cleanly
                        }
                        if (placeholderImg) placeholderImg.style.display = 'block';
                        if (chatFrame && !chatFrame.src.includes("about:blank")) chatFrame.src = "about:blank"; // Clear the chat cleanly
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
        // FIX: Changed ExecuteAction to DoAction so Streamer.bot actually replies!
        ws.send(JSON.stringify({ "request": "DoAction", "action": { "name": "Web_Request_Status" }, "id": "StatusCheck" }));
    }
}

function updateStreamState(live) {
    isStreamLive = live;
    const msgEl = document.getElementById('status-msg');
    
    // NOTE: Video Frame and Placeholder toggling has been moved to ws.onmessage
    // to properly handle the Scheduled Video ID logic!

    const isConnected = ws && ws.readyState === WebSocket.OPEN;
    const commandButtons = document.querySelectorAll('.stream-cmd');

    if (!msgEl) return;

    if (isConnected && userData) {
        // The bot is connected and the user is signed in. Now check if live:
        if (isStreamLive) {
            commandButtons.forEach(btn => btn.disabled = false); // UNLOCK buttons
            msgEl.innerText = "Bot Connected (Stream Online). System ready for testing.";
            msgEl.style.color = "#00ff00"; // Keep it green when live
        } else {
            commandButtons.forEach(btn => btn.disabled = true); // LOCK buttons
            // We only set this offline message if the Scheduled logic hasn't already overwritten it
            if (msgEl.innerText !== "Stream Scheduled! Waiting room is open.") {
                msgEl.innerText = "Bot Connected (Stream Offline). Testing not available till Live.";
                msgEl.style.color = "var(--white-med)";
            }
        }
    } else {
        // Not connected or not signed in
        commandButtons.forEach(btn => btn.disabled = true); // LOCK buttons
        if (!userData) {
            msgEl.innerText = "Sign in to trigger commands.";
            msgEl.style.color = "var(--white-med)"; 
        } else {
            msgEl.innerText = "Connecting to Streamer.bot...";
            msgEl.style.color = "var(--white-med)"; 
        }
    }
}

/* This Section Enables buttons while Not Live for testing.

function updateStreamState(live) {
    isStreamLive = live;
    const msgEl = document.getElementById('status-msg');
    if (!msgEl) return;

    const isConnected = ws && ws.readyState === WebSocket.OPEN;
    // CHANGED: Make sure this is updated here as well for testing!
    const commandButtons = document.querySelectorAll('.stream-cmd');

    if (isConnected && userData) {
        // --- OFFLINE TESTING OVERRIDE ---
        // We unlock buttons regardless of 'live' status, as long as we are connected to the bot
        commandButtons.forEach(btn => btn.disabled = false); 

        if (isStreamLive) {
            msgEl.innerText = "Bot Connected (Stream Online). System ready.";
            msgEl.style.color = "#00ff00"; 
        } else {
            // Updated message to reflect that testing is allowed while offline
            msgEl.innerText = "Bot Connected (Stream Offline). Testing Mode Active.";
            msgEl.style.color = "#ffaa00"; // Orange/Yellow to indicate "Testing/Offline"
        }
    } else {
        // Still lock buttons if the Bot isn't running or User isn't signed in
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
*/

function sendAction(actionName, extraCommand = null) {
    // 1. Connection Check
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert("Not connected to Command Center. Please wait.");
        return;
    }

    // 2. Authentication Check
    if (!userData) {
        alert("Please sign in to use commands.");
        return;
    }

    // 3. Construct the precise payload for Streamer.bot Target Variables
const payload = {
    request: "DoAction",
    action: { name: actionName },
    args: { 
        // The trigger flag for your If/Else sub-action
        isWebsocketRequest: "True", 
        
        // The unique ID the C# script will use
        userId: userData.id, 
        
        // Optional: Keep these for any generic log/chat messages
        userProfileUrl: userData.picture,
        userName: userData.name, 
        userType: "youtube"
    },
    id: "WebCommandCenter" 
};

    // 4. Inject the specific command name if the button provided one!
    if (extraCommand) {
        payload.args.commandName = extraCommand;

        // Passing 'command' as well just as a safety net, as some SB logic prefers it
        payload.args.command = extraCommand;
    }

    // 5. Fire!
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
    banner.style.display = 'flex'; // Unhide the banner

    // 1. Calculate the current "Nazar Cycle" Day (Resets at 06:01 UTC)
    const now = new Date();
    const currentHourUTC = now.getUTCHours();
    const currentMinuteUTC = now.getUTCMinutes();
    let cycleDate = new Date(now);

    if (currentHourUTC < 6 || (currentHourUTC === 6 && currentMinuteUTC < 1)) {
        cycleDate.setUTCDate(cycleDate.getUTCDate() - 1);
    }

    const cacheKey = `nazar_${cycleDate.getUTCFullYear()}-${cycleDate.getUTCMonth() + 1}-${cycleDate.getUTCDate()}`;
    const cachedData = localStorage.getItem(cacheKey);

    // 2. Check Cache
    if (cachedData) {
        try {
            const parsed = JSON.parse(cachedData);
            locationText.innerText = parsed.text;
            if (nazarImage) nazarImage.src = parsed.img;
            return; // Exit early, no API call needed
        } catch (e) {
            // If cache string is malformed for some reason, clear it and fetch fresh
            localStorage.removeItem(cacheKey);
        }
    }

    // 3. Helper to clean up RDO codenames (e.g., "p_4_emerald_ranch" -> "Emerald Ranch")
    const formatCodename = (name) => {
        if (!name) return "";
        let clean = name.replace(/^p_\d+_/, '').replace(/_/g, ' ');
        return clean.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    };

    // 4. Fetch from API
    try {
        const response = await fetch('https://api.rdo.gg/nazar');
        if (!response.ok) throw new Error("API Offline");
        
        const data = await response.json();
        
        if (data && data.location && data.id) {
            // Build the string and map the image
            const readableLocation = `${formatCodename(data.location)}, ${formatCodename(data.state)}`;
            
            // The API returns 'MPSW_LOCATION_XX', so we lower case it to match your files
            const imgPath = `/nazar/${data.id.toLowerCase()}.png`;

            // Apply to UI
            locationText.innerText = readableLocation;
            if (nazarImage) nazarImage.src = imgPath;

            // Clear old cache, save the new daily JSON
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
// 8. MODAL LOGIC
// ==========================================
function openNazarModal() {
    const modal = document.getElementById("imageModal");
    const modalImg = document.getElementById("modal-img");
    const srcImg = document.getElementById("nazar-image");
    
    // Only open if the image has successfully loaded from the cache/API
    if (modal && modalImg && srcImg.src && !srcImg.src.endsWith(window.location.host + "/")) {
        modal.style.display = "flex";
        modalImg.src = srcImg.src;
    }
}

function closeNazarModal(event) {
    const modal = document.getElementById("imageModal");
    const modalContent = document.getElementById("modal-img");
    
    // Close the modal if they click the 'X' or anywhere in the black background
    if (event.target !== modalContent) {
        modal.style.display = "none";
    }
}