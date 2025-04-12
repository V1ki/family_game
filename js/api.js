// js/api.js

/**
 * Sends text to the server for speech synthesis.
 * @param {string} text The text to synthesize.
 * @param {number} [rate=1.0] The speech rate.
 * @param {number} [pitch=1.0] The speech pitch.
 * @returns {Promise<object>} A promise that resolves with the synthesis result.
 */
export async function synthesizeSpeech(text, rate = 1.0, pitch = 1.0) { // Add rate and pitch parameters
    try {
        const response = await fetch('/api/synthesize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            // Include rate and pitch in the request body
            body: JSON.stringify({ text: text, rate: rate, pitch: pitch })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Speech synthesis error:', error);
        throw new Error('语音合成失败: ' + error.message);
    }
}

/**
 * Sends an audio blob to the server for speech recognition.
 * @param {Blob} audioBlob The audio data to recognize.
 * @returns {Promise<object>} A promise that resolves with the recognition result.
 */
export async function recognizeSpeech(audioBlob) {
    console.log('Sending audio data for recognition, size:', audioBlob.size, 'bytes');
    const formData = new FormData();
    formData.append('audio', audioBlob);

    try {
        const response = await fetch('/api/recognize', {
            method: 'POST',
            body: formData
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Speech recognition error:', error);
        throw new Error('语音识别失败: ' + error.message);
    }
}
