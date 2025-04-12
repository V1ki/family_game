// js/ui.js
import { synthesizeSpeech } from './api.js';
import { playAudio } from './audio.js';
import { submitClue as submitClueLogic } from '../scene/scene.js'; // Renamed import

// DOM Elements Cache
const uiElements = {
    introOverlay: null,
    startButton: null,
    connectionStatus: null,
    chatContainer: null,
    recordButton: null,
    recordText: null,
    clueInputContainer: null,
    clueCodeInput: null,
    clueSubmitButton: null,
};

// Message Queue and Animation State
let messageQueue = [];
let messageAnimationInProgress = false;

/**
 * Initializes UI elements and event listeners.
 * @param {function} onStartGame Callback function when the game starts.
 */
export function initializeUI(onStartGame) {
    // Cache DOM elements
    uiElements.introOverlay = document.getElementById('intro-overlay');
    uiElements.startButton = document.getElementById('startButton');
    uiElements.connectionStatus = document.getElementById('connectionStatus');
    uiElements.chatContainer = document.getElementById('chatContainer');
    uiElements.recordButton = document.getElementById('recordButton');
    uiElements.recordText = document.getElementById('recordText');
    uiElements.clueInputContainer = document.getElementById('clueInput');
    uiElements.clueCodeInput = document.getElementById('clueCode');
    // Find the submit button inside the clue input container
    uiElements.clueSubmitButton = uiElements.clueInputContainer ? uiElements.clueInputContainer.querySelector('button') : null;


    // Event Listeners
    if (uiElements.startButton) {
        uiElements.startButton.addEventListener('click', () => {
            if (uiElements.introOverlay) {
                uiElements.introOverlay.style.display = 'none';
            }
            onStartGame(); // Call the callback provided by main.js
        });
    } else {
        console.error("Start button not found");
    }

    // Remove inline onclick and add event listener
    if (uiElements.clueSubmitButton) {
         uiElements.clueSubmitButton.addEventListener('click', submitClue);
    } else {
         console.error("Clue submit button not found");
    }

    updateStatus('已准备就绪');
}


/**
 * Updates the connection status text.
 * @param {string} text The status text.
 */
export function updateStatus(text) {
    if (uiElements.connectionStatus) {
        uiElements.connectionStatus.textContent = text;
    }
}

/**
 * Adds a message to the chat container.
 * @param {string} text The message text.
 * @param {'sent' | 'received'} type The type of message ('sent' or 'received').
 */
export function addMessage(text, type) {
    if (!uiElements.chatContainer) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;

    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'message-bubble';
    bubbleDiv.textContent = text;

    messageDiv.appendChild(bubbleDiv);
    uiElements.chatContainer.appendChild(messageDiv);
    scrollToBottom();
}

/**
 * Adds a temporary "sending/recognizing" message bubble.
 */
export function addSendingMessage() {
    if (!uiElements.chatContainer) return;

    // Remove any existing pending message first
    const existingPending = document.getElementById('pending-recognition');
    if (existingPending) {
        existingPending.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message sent recognition-pending';
    messageDiv.id = 'pending-recognition'; // ID to find and update/remove later

    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'message-bubble';

    const recognitionText = document.createElement('div');
    recognitionText.className = 'recognition-text';
    recognitionText.textContent = '正在识别...'; // Initial text

    bubbleDiv.appendChild(recognitionText);
    messageDiv.appendChild(bubbleDiv);
    uiElements.chatContainer.appendChild(messageDiv);
    scrollToBottom();
}

/**
 * Updates or finalizes the recognition message bubble.
 * @param {string | null} text The recognized text, or null if failed/cancelled.
 * @param {string} [errorMessage] Optional error message to display.
 */
export function finishRecognition(text, errorMessage) {
    const pendingMessage = document.getElementById('pending-recognition');
    if (pendingMessage) {
        pendingMessage.remove(); // Remove the temporary bubble
    }

    if (errorMessage) {
        showErrorMessage(errorMessage); // Show error popup
    } else if (text && text.trim() !== '') {
        addMessage(text, 'sent'); // Add the final recognized text as a sent message
    }
    // If text is null/empty and no error, it means recording was too short or cancelled, do nothing extra.
}


/**
 * Adds a received message object to the queue for processing.
 * @param {object} messageObj The message object containing text, rate, and pitch.
 */
export function queueMessage(messageObj) {
    messageQueue.push(messageObj);
    processNextMessage(); // Attempt to process immediately
}

/**
 * Processes the next message in the queue if animation is not in progress.
 */
function processNextMessage() {
    if (messageQueue.length === 0 || messageAnimationInProgress) {
        return;
    }

    messageAnimationInProgress = true;
    const messageObj = messageQueue.shift();
    const { text, rate, pitch } = messageObj; // Destructure the object

    addMessage(text, 'received'); // Add text message to UI first

    // Pass text, rate, and pitch to synthesizeSpeech
    synthesizeSpeech(text, rate, pitch)
        .then(data => {
            if (data.success) {
                const audioSource = data.isBase64 ? data.audioBase64 : data.audioUrl;
                playAudio(audioSource, () => {
                    // On audio end, allow next message processing
                    messageAnimationInProgress = false;
                    processNextMessage(); // Process next message in queue
                });
            } else {
                throw new Error(data.error || '语音合成响应格式错误');
            }
        })
        .catch(error => {
            console.error('Error during synthesis or playback:', error);
            showErrorMessage(error.message || '处理接收消息时出错');
            // Ensure animation lock is released even on error
            messageAnimationInProgress = false;
            processNextMessage(); // Attempt to process next message
        });
}


/**
 * Shows an error message to the user.
 * @param {string} message The error message text.
 */
export function showErrorMessage(message) {
    console.error("Error:", message);
    alert('错误: ' + message); // Simple alert for now
}

/**
 * Scrolls the chat container to the bottom.
 */
function scrollToBottom() {
    if (uiElements.chatContainer) {
        uiElements.chatContainer.scrollTop = uiElements.chatContainer.scrollHeight;
    }
}

/**
 * Shows or hides the clue input section.
 * @param {boolean} show True to show, false to hide.
 */
export function showClueInput(show) {
    if (uiElements.clueInputContainer) {
        uiElements.clueInputContainer.style.display = show ? 'block' : 'none';
        if (show && uiElements.clueCodeInput) {
            uiElements.clueCodeInput.focus();
        }
    }
}

/**
 * Handles the submission of a clue from the UI.
 */
function submitClue() {
    if (uiElements.clueCodeInput) {
        const clue = uiElements.clueCodeInput.value.trim();
        if (clue) {
            submitClueLogic(clue); // Call the imported game logic function
            uiElements.clueCodeInput.value = ''; // Clear input after submission
        }
    }
}
