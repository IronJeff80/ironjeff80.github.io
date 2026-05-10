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
        initGoogleSignIn();
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
// 4. GOOGLE AUTH LOGIC
// ==========================================
function initGoogleSignIn() {
    const signinBtn = document.querySelector(".g_id_signin");
    if (!signinBtn) return; 

    google.accounts.id.initialize({
        client_id: "111000715471-1o7t0ulmnpdiq93agihl4t4q1s4b5mth.apps.googleusercontent.com",
        callback: handleCredentialResponse,
        auto_select: false 
    });
    
    google.accounts.id.renderButton(signinBtn, { type: "icon", shape: "circle" });
    google.accounts.id.prompt(); 
}

function handleCredentialResponse(response) {
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    userData = { id: payload.sub, name: payload.name, picture: payload.picture };
    localStorage.setItem('smokinUser', JSON.stringify(userData));
    restoreUserUI();
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
        ws.send(JSON.stringify({ "request": "Subscribe", "events": { "General": ["Custom"] } }));
        checkCurrentStatus();
    };
    
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.event && msg.event.type === "Custom" && msg.data.name === "LiveStatusUpdate") {
            updateStreamState(msg.data.isLive);
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
        ws.send(JSON.stringify({ "request": "ExecuteAction", "action": { "name": "Web_Request_Status" } }));
    }
}

function updateStreamState(live) {
    isStreamLive = live; 
    const msgEl = document.getElementById('status-msg');
    if (!msgEl) return;

    const isConnected = ws && ws.readyState === WebSocket.OPEN;

    if (isConnected && userData) {
        document.querySelectorAll('.cmd-btn').forEach(btn => btn.disabled = false);
        
        if (isStreamLive) {
            msgEl.innerText = "Live & Connected! Use your commands below.";
            msgEl.style.color = "#00ff00"; 
        } else {
            msgEl.innerText = "Bot Connected (Stream Offline). System ready for testing.";
            msgEl.style.color = "var(--white-med)";
        }
    } else {
        document.querySelectorAll('.cmd-btn').forEach(btn => btn.disabled = true);
        if (!userData) {
            msgEl.innerText = "Sign in to trigger commands.";
        } else {
            msgEl.innerText = "Connecting to Streamer.bot...";
        }
    }
}

function sendAction(actionName, cost) {
    // Removed isStreamLive check so you can test while offline
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    ws.send(JSON.stringify({
        request: "ExecuteAction",
        action: { name: actionName },
        args: { userName: userData.name, youtubeId: userData.id, pointCost: cost }
    }));
    alert(`Action '${actionName}' sent!`);
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