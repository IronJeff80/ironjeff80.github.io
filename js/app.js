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
    tokenClient.requestAccessToken({prompt: ''});
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
    const userNameDisplay = document.getElementById('user-name');
    
    if (loginContainer) loginContainer.style.display = 'none';
    if (userProfile) userProfile.style.display = 'flex';
    if (userAvatar) userAvatar.src = userData.picture;
    if (userNameDisplay) userNameDisplay.innerText = userData.name; // Show their name next to avatar
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
        updateStreamState(isStreamLive);
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
                    updateStreamState(customData.isLive);
                    
                    // Inject the Video ID to trigger the live chat iframe!
                    if (customData.videoId) {
                        const chatFrame = document.getElementById('yt-chat-frame');
                        if (chatFrame) {
                            const currentDomain = window.location.hostname;
                            // Added dark_theme=1 so it matches your site's aesthetic!
                            chatFrame.src = `https://www.youtube.com/live_chat?v=${customData.videoId}&embed_domain=${currentDomain}&dark_theme=1`;
                            console.log("SUCCESS: Chat loaded for Video ID: " + customData.videoId);
                        }
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
    if (!msgEl) return;

    const isConnected = ws && ws.readyState === WebSocket.OPEN;
    const commandButtons = document.querySelectorAll('.btn-grid .cmd-btn');

    if (isConnected && userData) {
        // The bot is connected and the user is signed in. Now check if live:
        if (isStreamLive) {
            commandButtons.forEach(btn => btn.disabled = false); // UNLOCK buttons
            msgEl.innerText = "Bot Connected (Stream Online). System ready for testing.";
            msgEl.style.color = "#00ff00"; // Keep it green when live
        } else {
            commandButtons.forEach(btn => btn.disabled = true); // LOCK buttons
            msgEl.innerText = "Bot Connected (Stream Offline). Testing not available till Live.";
            msgEl.style.color = "var(--white-med)";
        }
    } else {
        // Not connected or not signed in
        commandButtons.forEach(btn => btn.disabled = true); // LOCK buttons
        if (!userData) {
            msgEl.innerText = "Sign in to trigger commands.";
            msgEl.style.color = "var(--white-med)"; // Ensure color resets
        } else {
            msgEl.innerText = "Connecting to Streamer.bot...";
            msgEl.style.color = "var(--white-med)"; // Ensure color resets
        }
    }
}

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
        action: { 
            name: actionName 
        },
        args: { 
            user: userData.userName,       
            userName: userData.userName,   
            displayName: userData.name,    
            userId: userData.id,           
            userProfileUrl: userData.picture, 
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