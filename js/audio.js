// js/audio.js
import { recognizeSpeech } from './api.js';
import { addSendingMessage, finishRecognition, showErrorMessage } from './ui.js';
import { processPlayerInput } from '../scene/scene.js';

let audioContext;
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let recordingStartTime;
let currentPlayingAudio = null;

/**
 * Initializes the AudioContext.
 */
function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

/**
 * Starts audio recording.
 */
export async function startRecording() {
    if (isRecording) return;
    initAudioContext(); // Ensure AudioContext is initialized

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        document.getElementById('recordText').classList.add('active');
        document.getElementById('recordButton').style.backgroundColor = '#e53935';

        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus',
            audioBitsPerSecond: 16000
        });

        mediaRecorder.addEventListener('dataavailable', (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        });

        mediaRecorder.addEventListener('stop', handleRecordingStop);

        mediaRecorder.start(100);
        isRecording = true;
        recordingStartTime = Date.now();
        addSendingMessage(); // Show pending message in UI

    } catch (error) {
        console.error('Recording failed:', error);
        showErrorMessage('无法访问麦克风: ' + error.message);
        // Reset UI elements if recording setup fails
        document.getElementById('recordText').classList.remove('active');
        document.getElementById('recordButton').style.backgroundColor = '#4a6fa5';
    }
}

/**
 * Stops audio recording.
 */
export function stopRecording() {
    if (!isRecording || !mediaRecorder || mediaRecorder.state === 'inactive') return;

    document.getElementById('recordText').classList.remove('active');
    document.getElementById('recordButton').style.backgroundColor = '#4a6fa5';

    mediaRecorder.stop(); // This will trigger the 'stop' event
    isRecording = false;
}

/**
 * Handles the 'stop' event of the MediaRecorder.
 */
async function handleRecordingStop() {
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
    const recordDuration = (Date.now() - recordingStartTime) / 1000;

    // Stop the tracks
    if (mediaRecorder && mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    mediaRecorder = null; // Clean up recorder instance

    if (recordDuration < 0.5) {
        finishRecognition(null, '录音时间太短，请长按录制'); // Use finishRecognition to handle UI cleanup
        return;
    }

    try {
        const data = await recognizeSpeech(audioBlob);
        if (data.text) {
            finishRecognition(data.text); // Update UI with recognized text
            processPlayerInput(data.text); // Process the input in the game logic
        } else {
            throw new Error(data.error || '未能识别语音');
        }
    } catch (error) {
        console.error('Speech recognition processing error:', error);
        finishRecognition(null, '语音识别失败: ' + error.message); // Show error in UI
    }
}


/**
 * Plays audio from a URL or Base64 source.
 * @param {string} audioSource The URL or Base64 data URI of the audio.
 * @param {function} onEndedCallback Callback function when audio finishes playing.
 */
export function playAudio(audioSource, onEndedCallback) {
    if (currentPlayingAudio) {
        currentPlayingAudio.pause();
        currentPlayingAudio.onended = null; // Remove previous listener
    }

    const audioElement = new Audio(audioSource);
    currentPlayingAudio = audioElement;

    audioElement.onended = () => {
        currentPlayingAudio = null;
        if (onEndedCallback) {
            onEndedCallback();
        }
    };
    audioElement.onerror = (e) => {
        console.error('Audio playback error:', e);
        currentPlayingAudio = null;
        showErrorMessage('播放音频失败');
        if (onEndedCallback) { // Ensure callback is called even on error to proceed
            onEndedCallback();
        }
    };

    audioElement.play().catch(error => {
        console.error('Audio play initiation failed:', error);
        currentPlayingAudio = null;
        showErrorMessage('无法自动播放音频，请检查浏览器设置');
        if (onEndedCallback) { // Ensure callback is called even on error
            onEndedCallback();
        }
    });
}
