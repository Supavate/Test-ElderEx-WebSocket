let stompClient = null;
let isConnected = false;
let connectionStartTime = null;
let uptimeInterval = null;
let stats = { sent: 0, received: 0 };

/**
 * Update connection status badge and button states
 */
function updateStatus(status) {
  const badge = document.getElementById('statusBadge');
  const btnConnect = document.getElementById('btnConnect');
  const btnDisconnect = document.getElementById('btnDisconnect');
  const btnSendExercise = document.getElementById('btnSendExercise');
  const btnSessionEnd = document.getElementById('btnSessionEnd');

  badge.className = 'status-badge status-' + status;
  badge.textContent = status.toUpperCase();

  if (status === 'connected') {
    btnConnect.disabled = true;
    btnDisconnect.disabled = false;
    btnSendExercise.disabled = false;
    btnSessionEnd.disabled = false;
    startUptimeCounter();
  } else if (status === 'disconnected') {
    btnConnect.disabled = false;
    btnDisconnect.disabled = true;
    btnSendExercise.disabled = true;
    btnSessionEnd.disabled = true;
    stopUptimeCounter();
  } else if (status === 'connecting') {
    btnConnect.disabled = true;
    btnDisconnect.disabled = true;
    btnSendExercise.disabled = true;
    btnSessionEnd.disabled = true;
  }
}

/**
 * Log messages with color coding and timestamps
 */
function log(msg, type = 'info') {
  const logEl = document.getElementById('log');
  const timestamp = new Date().toLocaleTimeString();
  const showDebug = document.getElementById('showDebug').checked;
  
  if (type === 'debug' && !showDebug) return;

  const entry = `<span class="log-${type}">[${timestamp}] ${msg}</span>`;
  logEl.innerHTML += entry + '\n';
  
  if (document.getElementById('autoScroll').checked) {
    logEl.scrollTop = logEl.scrollHeight;
  }

  updateLastActivity();
}

/**
 * Update last activity timestamp
 */
function updateLastActivity() {
  document.getElementById('statLastActivity').textContent = new Date().toLocaleTimeString();
}

/**
 * Update statistics counters
 */
function updateStat(type, increment = 1) {
  stats[type] += increment;
  document.getElementById('stat' + type.charAt(0).toUpperCase() + type.slice(1)).textContent = stats[type];
}

/**
 * Start uptime counter
 */
function startUptimeCounter() {
  connectionStartTime = Date.now();
  uptimeInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - connectionStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    document.getElementById('statUptime').textContent = 
      `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, 1000);
}

/**
 * Stop uptime counter
 */
function stopUptimeCounter() {
  if (uptimeInterval) {
    clearInterval(uptimeInterval);
    uptimeInterval = null;
  }
  document.getElementById('statUptime').textContent = '00:00';
}

/**
 * Connect to WebSocket server
 */
function connect() {
  const token = document.getElementById('token').value.trim();
  if (!token) {
    log('❌ Error: JWT token is required', 'error');
    return alert('Enter JWT token first');
  }

  const baseUrl = document.getElementById('baseUrl').value;
  const reconnectDelay = parseInt(document.getElementById('reconnectDelay').value) || 5000;

  updateStatus('connecting');
  log('🔄 Connecting to WebSocket...', 'info');

  try {
    const socket = new SockJS(`${baseUrl}/websocket`);
    stompClient = Stomp.over(socket);
    
    // Debug mode
    stompClient.debug = (str) => {
      if (str.includes('CONNECTED') || str.includes('>>>') || str.includes('<<<')) {
        log('📡 ' + str, 'debug');
      }
    };

    // Connect with headers
    stompClient.connect(
      { token },
      (frame) => {
        isConnected = true;
        updateStatus('connected');
        log('✅ Connected to WebSocket successfully', 'success');
        
        stompClient.subscribe('/user/topic/exercises', (msg) => {
          updateStat('received');
          log('📩 Received: ' + msg.body, 'info');
          try {
            const parsed = JSON.parse(msg.body);
            log('📦 Parsed: ' + JSON.stringify(parsed, null, 2), 'info');
          } catch (e) {
            log('⚠️ Could not parse message as JSON', 'warning');
          }
        });
        log('📬 Subscribed to /user/topic/exercises', 'success');
      },
      (error) => {
        isConnected = false;
        updateStatus('disconnected');
        log('❌ STOMP Error: ' + error, 'error');
      }
    );
  } catch (error) {
    log('❌ Connection failed: ' + error.message, 'error');
    updateStatus('disconnected');
  }
}

/**
 * Disconnect from WebSocket server
 */
function disconnect() {
  if (stompClient && isConnected) {
    stompClient.disconnect(() => {
      isConnected = false;
      updateStatus('disconnected');
      log('🛑 Disconnected manually', 'info');
    });
  } else {
    isConnected = false;
    updateStatus('disconnected');
    log('🛑 Disconnected', 'info');
  }
}

/**
 * Send exercise data with features
 */
function sendExercise() {
  if (!stompClient || !isConnected) {
    log('❌ Error: Not connected to WebSocket', 'error');
    return alert('Not connected!');
  }

  try {
    const featuresText = document.getElementById('features').value;
    const featuresArray = featuresText.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
    
    if (featuresArray.length !== 15) {
      log(`⚠️ Warning: Expected 15 features, got ${featuresArray.length}`, 'warning');
    }

    const payload = {
      type: 'exercise_data',
      features: featuresArray
    };

    stompClient.send(
      '/app/websocket',
      {},
      JSON.stringify(payload)
    );

    updateStat('sent');
    log('📤 Sent exercise data with ' + featuresArray.length + ' features', 'success');
    log('📊 Data: ' + JSON.stringify(payload, null, 2), 'debug');
  } catch (error) {
    log('❌ Failed to send exercise: ' + error.message, 'error');
  }
}

/**
 * Send session end signal
 */
function sendSessionEnd() {
  if (!stompClient || !isConnected) {
    log('❌ Error: Not connected to WebSocket', 'error');
    return alert('Not connected!');
  }

  try {
    const payload = { type: 'session_end' };
    stompClient.send(
      '/app/websocket',
      {},
      JSON.stringify(payload)
    );

    updateStat('sent');
    log('📤 Sent session end signal', 'success');
  } catch (error) {
    log('❌ Failed to send session end: ' + error.message, 'error');
  }
}

/**
 * Send custom JSON payload
 */
function sendCustom() {
  if (!stompClient || !isConnected) {
    log('❌ Error: Not connected to WebSocket', 'error');
    return alert('Not connected!');
  }

  try {
    const customText = document.getElementById('customPayload').value.trim();
    if (!customText) {
      log('⚠️ Warning: Custom payload is empty', 'warning');
      return alert('Enter a custom payload first');
    }

    // Validate JSON
    const payload = JSON.parse(customText);
    
    stompClient.send(
      '/app/websocket',
      {},
      JSON.stringify(payload)
    );

    updateStat('sent');
    log('📤 Sent custom message', 'success');
    log('📊 Payload: ' + JSON.stringify(payload, null, 2), 'debug');
  } catch (error) {
    log('❌ Failed to send custom message: ' + error.message, 'error');
    alert('Invalid JSON: ' + error.message);
  }
}

/**
 * Validate JWT token
 */
function validateToken() {
  const baseUrl = document.getElementById('baseUrl').value;
  const token = document.getElementById('token').value.trim();

  if (!token) {
    log('⚠️ Warning: No JWT token provided', 'warning');
    return alert('Please provide a JWT token!');
  }

  log('🔐 Validating token...', 'info');

  fetch(`${baseUrl}/auth/validate`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  })
    .then((res) => {
      if (res.ok) {
        return res.text();
      } else {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
    })
    .then((text) => {
      log('✅ Token validated successfully: ' + text, 'success');
    })
    .catch((err) => {
      log('❌ Token validation failed: ' + err.message, 'error');
    });
}

/**
 * Clear log output
 */
function clearLog() {
  document.getElementById('log').innerHTML = '';
  log('🧹 Log cleared', 'info');
}

// Initialize on page load
updateStatus('disconnected');
log('👋 ElderEx WebSocket Tester initialized', 'info');
log('ℹ️ Enter your configuration and click Connect to start', 'info');