const express = require('express');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const WebSocket = require('ws');

// 设置ffmpeg路径
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// 文件上传中间件配置
const fileUpload = require('express-fileupload');
const e = require('express');
app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 }, // 限制文件大小为50MB
}));

// 创建HTTP服务器
// const server = http.createServer(app);

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
    console.log('Received text for synthesis:', text);
    
    if (!text) {
        return res.status(400).json({ error: '缺少文本参数' });
    }
    
    if (!apiKey) {
        console.error('API密钥未设置');
        return res.status(500).json({ error: 'API密钥未设置' });
    }
    
    // 创建唯一的文件名
    const fileName = `audio_${Date.now()}.mp3`;
    
    // 在 Vercel 环境中使用 /tmp 目录，在本地使用 audio 目录
    const audioDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'audio');
    const filePath = path.join(audioDir, fileName);
    
    // 确保目录存在
    if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
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
                
                // Vercel 环境中不能直接返回文件路径，需要将数据作为 base64 返回
                if (process.env.VERCEL) {
                    // 在 Vercel 环境中，直接返回音频数据的 base64 编码
                    res.json({
                        success: true,
                        audioBase64: `data:audio/mp3;base64,${audioData.toString('base64')}`,
                        isBase64: true
                    });
                } else {
                    // 本地环境返回文件 URL
                    res.json({
                        success: true,
                        audioUrl: `/audio/${fileName}`,
                        isBase64: false
                    });
                }
            });
        },
        (error) => {
            res.status(500).json({ error });
        }
    );
});

// 处理语音识别的HTTP请求
app.post('/api/recognize', async (req, res) => {
    try {
        // 检查是否收到了音频数据
        if (!req.body || !req.files || !req.files.audio) {
            return res.status(400).json({ error: '缺少音频数据' });
        }
        
        if (!asrApiKey) {
            return res.status(500).json({ error: 'API密钥未设置' });
        }
        
        const audioBlob = req.files.audio.data;
        
        // 将webm格式转换为wav格式
        const wavBuffer = await convertWebmToWav(audioBlob);
        
        // 使用阿里云语音识别服务进行识别
        const recognitionResult = await recognizeSpeech(wavBuffer);
        
        // 返回识别结果
        res.json({
            success: true,
            text: recognitionResult
        });
    } catch (error) {
        console.error('语音识别处理错误:', error);
        res.status(500).json({ error: '语音识别失败: ' + error.message });
    }
});

// 使用阿里云语音识别服务进行语音识别
async function recognizeSpeech(audioBuffer) {
    return new Promise((resolve, reject) => {
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
        let finalResult = '';
        
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
                        format: "wav", // 音频格式
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
                        
                        // 如果不是中间结果，则更新最终结果
                        if (!isPartial) {
                            finalResult = recognitionResult;
                        }
                    }
                } 
                else if (message.header.event === 'task-finished') {
                    console.log('语音识别任务完成');
                    ws.close();
                    resolve(finalResult); // 解决Promise，返回最终结果
                } 
                else if (message.header.event === 'task-failed') {
                    console.error('语音识别任务失败:', message.header.error_code, message.header.error_message);
                    ws.close();
                    reject(new Error(`语音识别失败: ${message.header.error_message}`));
                }
            } catch (error) {
                console.error('处理语音识别消息时出错:', error);
                reject(error);
            }
        });
        
        ws.on('error', function error(err) {
            console.error('语音识别WebSocket错误:', err);
            reject(new Error('语音识别服务连接错误: ' + err.message));
        });
        
        ws.on('close', function close() {
            console.log('语音识别WebSocket连接已关闭');
            // 如果没有结果但连接已关闭，返回空结果
            if (!finalResult) {
                resolve('');
            }
        });
    });
}

// 记录访问日志中间件
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} [${req.method}] ${req.url}`);
    next();
});

// // 根据环境变量判断是否在 Vercel 环境中运行
if (process.env.VERCEL) {
    // 在 Vercel 环境中, 导出 app 对象供 Vercel 使用
    console.log('在 Vercel 环境中运行');
    module.exports = app;
} else {
    // 本地开发环境下启动服务器
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`服务器运行在 http://localhost:${PORT}`);
    });
}