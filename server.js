const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

// 设置ffmpeg路径
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// 创建HTTP服务器
const server = http.createServer(app);
// 创建WebSocket服务器
const wss = new WebSocket.Server({ server });

// 您的API Keys，在实际的生产环境中应该从环境变量获取
// 请从环境变量中获取或者在启动服务时提供
const apiKey = process.env.DASHSCOPE_API_KEY || '';
const asrApiKey = process.env.DASHSCOPE_API_KEY || ''; // 使用同一个API Key或指定专用于语音识别的Key

// 将webm音频转换为wav格式
function convertWebmToWav(webmBuffer) {
    return new Promise((resolve, reject) => {
        // 创建临时文件名
        const tempInputFile = path.join(__dirname, `temp_input_${Date.now()}.webm`);
        const tempOutputFile = path.join(__dirname, `temp_output_${Date.now()}.wav`);
        
        // 写入webm数据到临时文件
        fs.writeFileSync(tempInputFile, webmBuffer);
        
        // 使用ffmpeg进行转换
        ffmpeg(tempInputFile)
            .outputOptions([
                '-acodec pcm_s16le',  // 输出编码
                '-ar 16000',          // 采样率16kHz
                '-ac 1',              // 单声道
                '-f wav'              // 输出格式
            ])
            .on('error', (err) => {
                // 清理临时文件
                try {
                    fs.unlinkSync(tempInputFile);
                    if (fs.existsSync(tempOutputFile)) {
                        fs.unlinkSync(tempOutputFile);
                    }
                } catch (e) {
                    console.error('清理临时文件失败:', e);
                }
                
                reject(err);
            })
            .on('end', () => {
                // 读取转换后的WAV文件
                const wavBuffer = fs.readFileSync(tempOutputFile);
                
                // 清理临时文件
                try {
                    fs.unlinkSync(tempInputFile);
                    fs.unlinkSync(tempOutputFile);
                } catch (e) {
                    console.error('清理临时文件失败:', e);
                }
                
                resolve(wavBuffer);
            })
            .save(tempOutputFile);
    });
}

// WebSocket连接到阿里云服务
function connectToCosyVoice(text, onData, onFinish, onError) {
    // 阿里云WebSocket URL
    const url = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';
    
    // 创建WebSocket客户端
    const ws = new WebSocket(url, {
        headers: {
            'Authorization': `bearer ${apiKey}`,
            'X-DashScope-DataInspection': 'enable'
        }
    });
    
    // 任务ID
    const taskId = uuidv4();
    let taskStarted = false;
    let audioData = Buffer.alloc(0);
    
    ws.on('open', function open() {
        console.log('已连接到CosyVoice服务');
        
        // 发送run-task指令
        const runTask = {
            header: {
                action: "run-task",
                task_id: taskId,
                streaming: "duplex"
            },
            payload: {
                task_group: "audio",
                task: "tts",
                function: "SpeechSynthesizer",
                model: "cosyvoice-v1",
                parameters: {
                    text_type: "PlainText",
                    voice: "longtong", // 使用龙彤音色
                    format: "mp3",
                    sample_rate: 22050,
                    volume: 50,
                    rate: 1,
                    pitch: 1
                },
                input: {}
            }
        };
        
        ws.send(JSON.stringify(runTask));
    });
    
    ws.on('message', function incoming(data) {
        // 如果是二进制数据（音频流）
        if (data instanceof Buffer) {
            audioData = Buffer.concat([audioData, data]);
            // 发送部分数据到客户端，以支持流式播放
            onData(data);
        } else {
            // 如果是文本消息（JSON格式的事件）
            const message = JSON.parse(data.toString());
            console.log('收到事件:', message.header.event);
            
            if (message.header.event === 'task-started') {
                taskStarted = true;
                
                // 发送continue-task指令
                const continueTask = {
                    header: {
                        action: "continue-task",
                        task_id: taskId,
                        streaming: "duplex"
                    },
                    payload: {
                        input: {
                            text: text
                        }
                    }
                };
                
                ws.send(JSON.stringify(continueTask));
                
                // 发送finish-task指令
                const finishTask = {
                    header: {
                        action: "finish-task",
                        task_id: taskId,
                        streaming: "duplex"
                    },
                    payload: {
                        input: {}
                    }
                };
                
                ws.send(JSON.stringify(finishTask));
            } else if (message.header.event === 'task-finished') {
                onFinish(audioData);
                ws.close();
            } else if (message.header.event === 'task-failed') {
                onError(message.header.error_message || '语音合成失败');
                ws.close();
            }
        }
    });
    
    ws.on('error', function error(err) {
        console.error('WebSocket错误:', err);
        onError('连接错误: ' + err.message);
    });
    
    ws.on('close', function close() {
        console.log('与CosyVoice服务的连接已关闭');
    });
}

// 处理文本到语音的转换请求
app.post('/api/synthesize', (req, res) => {
    const { text } = req.body;
    
    if (!text) {
        return res.status(400).json({ error: '缺少文本参数' });
    }
    
    if (!apiKey) {
        return res.status(500).json({ error: 'API密钥未设置' });
    }
    
    // 创建唯一的文件名
    const fileName = `audio_${Date.now()}.mp3`;
    const filePath = path.join(__dirname, 'audio', fileName);
    
    // 确保audio目录存在
    if (!fs.existsSync(path.join(__dirname, 'audio'))) {
        fs.mkdirSync(path.join(__dirname, 'audio'));
    }
    
    // 使用WebSocket与阿里云服务通信
    connectToCosyVoice(
        text,
        (chunk) => {
            // 这是流式数据，但我们在REST API中不使用
        },
        (audioData) => {
            // 保存完整的音频到文件
            fs.writeFile(filePath, audioData, (err) => {
                if (err) {
                    console.error('保存音频文件失败:', err);
                    return res.status(500).json({ error: '保存音频文件失败' });
                }
                
                // 返回音频文件的URL
                res.json({
                    success: true,
                    audioUrl: `/audio/${fileName}`
                });
            });
        },
        (error) => {
            res.status(500).json({ error });
        }
    );
});

// WebSocket服务器逻辑
wss.on('connection', (ws) => {
    console.log('客户端已连接');
    
    ws.on('message', (message) => {
        // 检查消息是否为Buffer类型（二进制数据）
        if (message instanceof Buffer) {
            console.log('接收到二进制音频数据，长度:', message.length);
            // 处理二进制音频数据，用于语音识别
            if (!asrApiKey) {
                ws.send(JSON.stringify({ 
                    type: 'error', 
                    message: 'API密钥未设置' 
                }));
                return;
            }
            
            // 使用阿里云Paraformer实时语音识别
            connectToSpeechRecognition(ws, message);
            return;
        }
        
        // 处理JSON消息
        try {
            const data = JSON.parse(message.toString());
            
            if (data.type === 'synthesize') {
                const text = data.text;
                
                if (!text) {
                    ws.send(JSON.stringify({ 
                        type: 'error', 
                        message: '缺少文本参数' 
                    }));
                    return;
                }
                
                if (!apiKey) {
                    ws.send(JSON.stringify({ 
                        type: 'error', 
                        message: 'API密钥未设置' 
                    }));
                    return;
                }
                
                // 使用WebSocket与阿里云服务通信
                connectToCosyVoice(
                    text,
                    (chunk) => {
                        // 直接将音频数据流转发给客户端
                        ws.send(JSON.stringify({ 
                            type: 'audio_chunk', 
                            chunk: chunk.toString('base64') 
                        }));
                    },
                    (audioData) => {
                        // 发送完成事件
                        ws.send(JSON.stringify({ 
                            type: 'audio_complete', 
                            fullAudio: audioData.toString('base64') 
                        }));
                    },
                    (error) => {
                        ws.send(JSON.stringify({ 
                            type: 'error', 
                            message: error 
                        }));
                    }
                );
            }
        } catch (e) {
            console.error('处理消息时出错:', e);
            ws.send(JSON.stringify({ 
                type: 'error', 
                message: '无效的消息格式' 
            }));
        }
    });
    
    ws.on('close', () => {
        console.log('客户端已断开连接');
    });
});

// WebSocket连接到阿里云语音识别服务
async function connectToSpeechRecognition(socket, audioBlob) {
    try {
        console.log('开始处理音频数据...');
        
        // 将webm格式转换为wav格式（阿里云支持）
        const wavBuffer = await convertWebmToWav(audioBlob);
        console.log('音频格式转换完成，wav大小:', wavBuffer.length, '字节');
        
        // 阿里云WebSocket URL
        const url = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';
        
        // 创建WebSocket客户端
        const ws = new WebSocket(url, {
            headers: {
                'Authorization': `bearer ${asrApiKey}`,
                'X-DashScope-DataInspection': 'enable'
            }
        });
        
        // 任务ID
        const taskId = uuidv4();
        let taskStarted = false;
        
        // 保存转换后的音频数据，用于发送
        const audioBuffer = wavBuffer;
    ws.on('open', function open() {
        console.log('已连接到语音识别服务');
        
        // 发送run-task指令开启语音识别任务
        const runTask = {
            header: {
                action: "run-task",
                task_id: taskId,
                streaming: "duplex"
            },
            payload: {
                task_group: "audio",
                task: "asr",
                function: "recognition",
                model: "paraformer-realtime-v2", // 使用多语种实时语音识别模型
                parameters: {
                    format: "wav", // 音频格式（已转换为WAV）
                    sample_rate: 16000, // 采样率
                    punctuation_prediction_enabled: true
                },
                input: {}
            }
        };
        
        ws.send(JSON.stringify(runTask));
    });
    
    ws.on('message', function incoming(data) {
        try {
            // 处理文本消息（JSON格式的事件）
            const message = JSON.parse(data.toString());
            console.log('收到识别事件:', message.header.event);
            
            if (message.header.event === 'task-started') {
                taskStarted = true;
                console.log('语音识别任务已开始，开始发送音频数据');
                
                // 开始发送音频数据
                // 发送 continue-task 指令后带上音频数据
                const continueTask = {
                    header: {
                        action: "continue-task",
                        task_id: taskId,
                        streaming: "duplex"
                    },
                    payload: {
                        input: {
                            binary: {
                                audio_format: "wav"
                            }
                        }
                    }
                };
                
                ws.send(JSON.stringify(continueTask));
                
                // 发送二进制音频数据
                ws.send(audioBuffer);
                
                // 任务开始后发送finish-task指令
                const finishTask = {
                    header: {
                        action: "finish-task",
                        task_id: taskId,
                        streaming: "duplex"
                    },
                    payload: {
                        input: {}
                    }
                };
                
                ws.send(JSON.stringify(finishTask));
            } 
            else if (message.header.event === 'result-generated') {
                // 处理识别结果
                if (message.payload && message.payload.output && message.payload.output.sentence) {
                    const recognitionResult = message.payload.output.sentence.text;
                    const isPartial = message.payload.output.sentence.end_time === null;
                    
                    console.log('识别结果:', recognitionResult, isPartial ? '(中间结果)' : '(最终结果)');
                    
                    // 发送识别结果给客户端
                    socket.send(JSON.stringify({
                        type: 'recognition_result',
                        text: recognitionResult,
                        isPartial: isPartial
                    }));
                }
            } 
            else if (message.header.event === 'task-finished') {
                console.log('语音识别任务完成');
                ws.close();
            } 
            else if (message.header.event === 'task-failed') {
                console.error('语音识别任务失败:', message.header.error_code, message.header.error_message);
                socket.send(JSON.stringify({
                    type: 'error',
                    message: `语音识别失败: ${message.header.error_message}`
                }));
                ws.close();
            }
        } catch (error) {
            console.error('处理语音识别消息时出错:', error);
        }
    });
    
    ws.on('error', function error(err) {
        console.error('语音识别WebSocket错误:', err);
        socket.send(JSON.stringify({
            type: 'error',
            message: '语音识别服务连接错误: ' + err.message
        }));
    });
    
    ws.on('close', function close() {
        console.log('语音识别WebSocket连接已关闭');
    });
    
    } catch (error) {
        console.error('处理音频数据时出错:', error);
        socket.send(JSON.stringify({
            type: 'error',
            message: '音频处理失败: ' + error.message
        }));
    }
}

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});
