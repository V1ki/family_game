// api/index.js - Vercel Serverless Function entry point
// 导入主服务器应用
const app = require('../server');

// 导出处理函数供 Vercel 使用
module.exports = app;
