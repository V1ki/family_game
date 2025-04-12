// js/main.js
import { initializeUI } from './ui.js';
import { startRecording, stopRecording } from './audio.js';
import { startGame } from '../scene/scene.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed");

    // Initialize UI elements and pass the startGame function as a callback
    initializeUI(startGame); // startGame will be called when the intro button is clicked

    // Setup Record Button Listeners
    const recordButton = document.getElementById('recordButton');
    if (recordButton) {
        // Use mousedown/mouseup for desktop compatibility
        recordButton.addEventListener('mousedown', (e) => {
            // Prevent default text selection behavior on hold
            e.preventDefault();
            startRecording();
        });
        recordButton.addEventListener('mouseup', stopRecording);
        // Add touch events for mobile
        recordButton.addEventListener('touchstart', (e) => {
             // Prevent triggering mousedown and potential double recording start
            e.preventDefault();
            startRecording();
        });
        recordButton.addEventListener('touchend', stopRecording);
        // Handle cases where the touch/mouse leaves the button before release
        recordButton.addEventListener('mouseleave', stopRecording);
        recordButton.addEventListener('touchcancel', stopRecording);

    } else {
        console.error("Record button not found!");
    }

    console.log("Event listeners attached.");
});
