// scene/scene.js
import { queueMessage, showClueInput } from '../js/ui.js';

// Game State
export const gameState = {
    stage: 0, // 0: Intro, 1: Find clue 1, 2: Ask family, 3: Find number item, 4: Find secret place, 5: End
    items: [],
    clues: []
};

// Game Messages with rate and pitch
const gameMsgs = [
    /* 0 */ { text: "有人吗?有人在吗?好黑啊, 这里是哪里? 有人能来帮帮我吗? ", rate: 0.9, pitch: 1.0 },
    /* 1 */ { text: "真不错！你已经找到第一条线索。接下来，我们需要找到消失的宝物。你可以问问家人关于宝物的线索。", rate: 1.0, pitch: 1.0 },
    /* 2 */ { text: "太棒了！你的调查进展顺利。现在，我们需要解开谜题。你可以在家里寻找与数字相关的物品。", rate: 1.1, pitch: 1.1 },
    /* 3 */ { text: "哇！你真是个优秀的小侦探！我们已经很接近真相了。最后一步，请寻找一个隐藏的秘密地点。", rate: 1.2, pitch: 1.2 },
    /* 4 */ { text: "恭喜你！你成功解决了所有谜题，找到了宝藏！你是最棒的小侦探！", rate: 1.3, pitch: 1.3 }
];

// Generic hint messages with default rate/pitch
const hintMsgs = {
    0: { text: "试着在周围找找看有没有什么特别的纸条或标记？", rate: 1.0, pitch: 1.0 },
    1: { text: "和家人聊聊，看看他们知不知道关于丢失宝物的事情。", rate: 1.0, pitch: 1.0 },
    2: { text: "家里有没有带数字的东西？比如钟表、日历或者遥控器？", rate: 1.0, pitch: 1.0 },
    3: { text: "会不会有什么隐藏的角落或者平时不太注意的地方？", rate: 1.0, pitch: 1.0 },
    default: { text: "嗯...让我想想...", rate: 1.0, pitch: 1.0 }
};

const endMsg = { text: "冒险已经结束啦！", rate: 1.0, pitch: 1.0 };
const wrongClueMsg = { text: "嗯... 这个线索好像不太对，再找找看？", rate: 1.0, pitch: 1.0 };

/**
 * Starts the game by sending the first message.
 */
export function startGame() {
    gameState.stage = 0; // Ensure starting stage
    queueMessage(gameMsgs[0]); // Pass the message object
    // Potentially show clue input right away if stage 0 requires it,
    // or based on the first message's instruction.
    // showClueInput(true); // Example: if the first task is to enter a clue
}

/**
 * Processes player's voice input based on the current game stage.
 * @param {string} text The recognized text from the player.
 */
export function processPlayerInput(text) {
    console.log(`Processing input for stage ${gameState.stage}:`, text);

    // Simple keyword-based progression for demonstration
    // This needs to be much more sophisticated for a real game (NLP, intent recognition)

    let responseQueued = false;

    // Example Logic (very basic):
    if (gameState.stage === 0 && (text.includes('找到') || text.includes('线索'))) {
        advanceToStage(1);
        responseQueued = true;
    } else if (gameState.stage === 1 && (text.includes('家人') || text.includes('宝物'))) {
        advanceToStage(2);
        responseQueued = true;
    } else if (gameState.stage === 2 && (text.includes('数字') || text.includes('找到'))) {
        advanceToStage(3);
        responseQueued = true;
    } else if (gameState.stage === 3 && (text.includes('地点') || text.includes('秘密'))) {
        advanceToStage(4); // This leads to the final message
        responseQueued = true;
    }

    // Generic reply if no specific stage advancement occurred based on input
    if (!responseQueued && gameState.stage < 4) {
        // Provide a hint or generic acknowledgement based on the current stage
        queueMessage(getHintForStage(gameState.stage)); // Pass the hint object
    } else if (!responseQueued && gameState.stage >= 4) {
        // Game already finished or in final stage
        queueMessage(endMsg); // Pass the end message object
    }
}

/**
 * Processes submitted clue code based on the current game stage.
 * @param {string} clue The submitted clue text.
 */
export function submitClue(clue) {
    console.log(`Processing clue for stage ${gameState.stage}:`, clue);

    // Example: Check clue against expected value for the current stage
    // This should be more robust, checking against a list of valid clues per stage
    if (gameState.stage === 0 && clue.toLowerCase() === "密码1") { // Example clue
        advanceToStage(1);
        showClueInput(false); // Hide input after correct clue
    } else if (gameState.stage === 1 && clue.toLowerCase() === "宝物线索") {
         advanceToStage(2);
         showClueInput(false);
    } else if (gameState.stage === 2 && clue.toLowerCase() === "数字谜题") {
         advanceToStage(3);
         showClueInput(false);
    } else if (gameState.stage === 3 && clue.toLowerCase() === "秘密地点") {
         advanceToStage(4);
         showClueInput(false);
    } else {
        queueMessage(wrongClueMsg); // Pass the wrong clue message object
        // Keep clue input open
    }
}

/**
 * Advances the game to the next stage and queues the corresponding message.
 * @param {number} nextStage The stage number to advance to.
 */
function advanceToStage(nextStage) {
    if (nextStage > gameState.stage && nextStage < gameMsgs.length) {
        console.log(`Advancing from stage ${gameState.stage} to ${nextStage}`);
        gameState.stage = nextStage;
        queueMessage(gameMsgs[gameState.stage]); // Pass the message object

        // Decide if clue input should be shown for the new stage
        // Example: Show clue input for stages 0, 2?
        // showClueInput(gameState.stage === 0 || gameState.stage === 2);
        // Or maybe hide it by default unless explicitly needed
        showClueInput(false); // Example: Hide by default

    } else if (nextStage >= gameMsgs.length) {
        console.log("Trying to advance past the last defined stage.");
        // Handle game end state if necessary
        gameState.stage = gameMsgs.length -1; // Stay at last message stage
         queueMessage(gameMsgs[gameState.stage]); // Pass the message object
         showClueInput(false);
    }
}

/**
 * Provides a hint object based on the current stage.
 * @param {number} stage The current game stage.
 * @returns {object} A hint message object {text, rate, pitch}.
 */
function getHintForStage(stage) {
    return hintMsgs[stage] || hintMsgs.default;
}
