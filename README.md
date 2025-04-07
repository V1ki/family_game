# AR Treasure Hunt

一个使用 AR.js 和 Three.js 开发的增强现实网页应用。

## 功能特点

- 使用手机摄像头扫描特定图片标记
- 在标记位置显示 3D 模型
- 支持模型旋转动画
- 响应式设计，适配各种屏幕尺寸

## 使用说明

1. 下载项目文件
2. 下载并打印 AR 标记图片（pattern-marker.png）
3. 使用本地服务器运行项目（由于安全限制，必须使用 HTTPS 或本地服务器）
4. 用手机浏览器访问网页
5. 允许使用摄像头
6. 将摄像头对准打印好的标记图片

## 本地运行

可以使用 Python 的简单 HTTP 服务器运行项目：

```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```

然后在浏览器中访问：`http://localhost:8000`

## 技术栈

- Three.js - 3D 渲染
- AR.js - AR 功能
- HTML5 / JavaScript

## 注意事项

- 需要使用支持 WebRTC 的现代浏览器
- 需要允许网页使用摄像头
- 为获得最佳效果，请确保环境光线充足
- 标记图片需要打印，不能直接在屏幕上显示 