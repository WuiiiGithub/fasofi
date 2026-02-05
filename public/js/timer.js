// --- Firebase Logic (Using Compat/Namespaced SDK) ---
let analytics;
try {
    // Firebase Hosting automatically handles initialization via /__/firebase/init.js
    if (typeof firebase !== 'undefined') {
        analytics = firebase.analytics();
    }
} catch (e) {
    console.warn('Firebase Analytics failed to initialize', e);
}

function logAnalytics(name, params = {}) {
    try {
        if (analytics) {
            analytics.logEvent(name, params);
        }
    } catch (e) { 
        console.warn('Analytics log failed', e); 
    }
}

// --- App State ---
let mode = 'timer';
let isRunning = false;
let isAlarming = false;
let timerStartValue = 60;
let timeLeft = 60; 
let stopwatchTime = 0;
let interval = null;
let alarmInterval = null;
let sessionStartTime = null;

// --- UI Elements ---
const body = document.getElementById('body');
const touchSurface = document.getElementById('touchSurface');
const display = document.getElementById('display');
const modeLabel = document.getElementById('modeLabel');
const btnTimer = document.getElementById('btnTimer');
const btnStopwatch = document.getElementById('btnStopwatch');
const btnSettings = document.getElementById('btnSettings');
const settingsModal = document.getElementById('settingsModal');
const inputMinutes = document.getElementById('inputMinutes');
const inputSeconds = document.getElementById('inputSeconds');
const saveSettings = document.getElementById('saveSettings');
const swipeToast = document.getElementById('swipeToast');

// --- Touch State ---
let touchStartX = 0;
let touchStartTime = 0;
const SWIPE_THRESHOLD = 60;
const SWIPE_TIME_LIMIT = 400;

// --- Audio Logic ---
let audioCtx = null;
function beep(freq = 880, duration = 0.15) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
}

function showToast(text) {
    swipeToast.innerText = text;
    swipeToast.style.opacity = '1';
    setTimeout(() => { swipeToast.style.opacity = '0'; }, 1000);
}

// --- Core Logic ---
function startAlarm() {
    if (isAlarming) return;
    isAlarming = true;
    body.classList.add('alarm-active');
    display.classList.add('alarm-text');
    logAnalytics('alarm_started', { mode: mode, setting: timerStartValue });
    
    alarmInterval = setInterval(() => {
        beep(880, 0.2);
        setTimeout(() => beep(880, 0.2), 250);
    }, 1000);
}

function stopAlarm() {
    if (!isAlarming) return;
    isAlarming = false;
    clearInterval(alarmInterval);
    body.classList.remove('alarm-active');
    display.classList.remove('alarm-text');
    reset();
    showToast("Alarm Stopped");
    logAnalytics('alarm_stopped_manually');
}

function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateDisplay() {
    if (mode === 'timer') {
        display.innerText = formatTime(timeLeft);
        modeLabel.innerText = "Focus Session";
    } else {
        display.innerText = formatTime(stopwatchTime);
        modeLabel.innerText = "Elapsed Time";
    }
}

function toggleStart() {
    if (isAlarming) { stopAlarm(); return; }

    if (isRunning) {
        clearInterval(interval);
        isRunning = false;
        display.classList.remove('running');
        if (sessionStartTime) {
            const elapsed = Math.round((Date.now() - sessionStartTime) / 1000);
            logAnalytics('timing_session_stopped', {
                mode: mode,
                duration_seconds: elapsed
            });
            sessionStartTime = null;
        }
    } else {
        isRunning = true;
        display.classList.add('running');
        sessionStartTime = Date.now();
        logAnalytics('timing_session_started', { mode: mode });

        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        interval = setInterval(() => {
            if (mode === 'timer') {
                if (timeLeft > 0) {
                    timeLeft--;
                } else {
                    clearInterval(interval);
                    isRunning = false;
                    display.classList.remove('running');
                    startAlarm();
                    const elapsed = Math.round((Date.now() - sessionStartTime) / 1000);
                    logAnalytics('timer_completed', { duration_seconds: elapsed });
                    sessionStartTime = null;
                }
            } else {
                stopwatchTime++;
            }
            updateDisplay();
        }, 1000);
    }
}

function reset() {
    if (isRunning && sessionStartTime) {
        const elapsed = Math.round((Date.now() - sessionStartTime) / 1000);
        logAnalytics('timing_session_reset', { mode: mode, active_seconds: elapsed });
    }

    clearInterval(interval);
    isRunning = false;
    display.classList.remove('running');
    sessionStartTime = null;
    
    if (mode === 'timer') {
        timeLeft = timerStartValue;
    } else {
        stopwatchTime = 0;
    }
    updateDisplay();
}

// --- Interaction Handlers ---
touchSurface.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartTime = Date.now();
}, { passive: true });

touchSurface.addEventListener('touchend', (e) => {
    if (settingsModal.classList.contains('open')) return;
    
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndTime = Date.now();
    const diffX = touchEndX - touchStartX;
    const timeDiff = touchEndTime - touchStartTime;

    if (Math.abs(diffX) > SWIPE_THRESHOLD && timeDiff < SWIPE_TIME_LIMIT) {
        if (diffX > 0) {
            reset();
            if (isAlarming) stopAlarm();
            showToast("Reset");
            logAnalytics('gesture_reset');
        } else {
            if (isAlarming) stopAlarm();
            else showToast("Stop Active");
            logAnalytics('gesture_stop_alarm');
        }
    } else if (timeDiff < 200 && Math.abs(diffX) < 10) {
        toggleStart();
    }
});

touchSurface.addEventListener('click', (e) => {
    if (settingsModal.classList.contains('open')) return;
    if (e.pointerType === 'touch') return; 
    toggleStart();
});

btnTimer.addEventListener('click', (e) => {
    e.stopPropagation();
    if (mode === 'timer' || isAlarming) return;
    mode = 'timer';
    btnTimer.classList.add('active');
    btnStopwatch.classList.remove('active');
    logAnalytics('mode_switched', { target: 'timer' });
    reset();
});

btnStopwatch.addEventListener('click', (e) => {
    e.stopPropagation();
    if (mode === 'stopwatch' || isAlarming) return;
    mode = 'stopwatch';
    btnStopwatch.classList.add('active');
    btnTimer.classList.remove('active');
    logAnalytics('mode_switched', { target: 'stopwatch' });
    reset();
});

btnSettings.addEventListener('click', (e) => {
    e.stopPropagation();
    inputMinutes.value = Math.floor(timerStartValue / 60);
    inputSeconds.value = timerStartValue % 60;
    settingsModal.classList.add('open');
});

saveSettings.addEventListener('click', (e) => {
    e.stopPropagation();
    const mins = parseInt(inputMinutes.value) || 0;
    const secs = parseInt(inputSeconds.value) || 0;
    const total = (mins * 60) + secs;
    if (total >= 0) {
        timerStartValue = total;
        logAnalytics('timer_setting_changed', { value: total });
        if (mode === 'timer') reset();
    }
    settingsModal.classList.remove('open');
});

settingsModal.addEventListener('click', () => settingsModal.classList.remove('open'));

window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') {
        if (e.code === 'Enter') saveSettings.click();
        if (e.code === 'Escape') settingsModal.classList.remove('open');
        return;
    }
    if (e.code === 'Space') { e.preventDefault(); toggleStart(); }
    if (e.code === 'Delete' || e.code === 'Backspace') { if (isAlarming) stopAlarm(); reset(); }
    if (e.code === 'Escape') { if (isAlarming) stopAlarm(); settingsModal.classList.remove('open'); }
});

document.addEventListener('DOMContentLoaded', () => {
    updateDisplay();
});