// AR 应用的主要代码
window.addEventListener('load', function() {
    // 检查浏览器是否支持 WebRTC
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        document.getElementById('error').textContent = 'Your browser does not support WebRTC camera access';
        document.getElementById('error').style.display = 'block';
        document.getElementById('loading').style.display = 'none';
        return;
    }

    // 初始化 Three.js 场景
    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    scene.add(camera);

    // 添加环境光和定向光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // 创建 AR 上下文
    const arToolkitSource = new ArToolkitSource({
        sourceType: 'webcam',
        sourceWidth: window.innerWidth,
        sourceHeight: window.innerHeight,
        displayWidth: window.innerWidth,
        displayHeight: window.innerHeight,
    });

    // 初始化 AR 源
    arToolkitSource.init(function onReady() {
        console.log('AR Source initialized');
        setTimeout(function() {
            onResize();
        }, 2000);
    }, function onError(error) {
        console.error('Error initializing AR source:', error);
        document.getElementById('error').textContent = 'Error accessing camera: ' + error;
        document.getElementById('error').style.display = 'block';
        document.getElementById('loading').style.display = 'none';
    });

    // 处理窗口大小变化
    window.addEventListener('resize', function() {
        onResize();
    });

    function onResize() {
        arToolkitSource.onResizeElement();
        arToolkitSource.copyElementSizeTo(renderer.domElement);
        if (arToolkitContext && arToolkitContext.arController !== null) {
            arToolkitSource.copyElementSizeTo(arToolkitContext.arController.canvas);
        }
    }

    // 创建 AR 上下文
    const arToolkitContext = new ArToolkitContext({
        cameraParametersUrl: 'https://raw.githack.com/AR-js-org/AR.js/master/data/data/camera_para.dat',
        detectionMode: 'mono',
        maxDetectionRate: 30,
        canvasWidth: window.innerWidth,
        canvasHeight: window.innerHeight,
    });

    // 初始化 AR 上下文
    arToolkitContext.init(function onCompleted() {
        console.log('AR Context initialized');
        camera.projectionMatrix.copy(arToolkitContext.getProjectionMatrix());
    });

    // 创建标记控制器
    const markerRoot = new THREE.Group();
    scene.add(markerRoot);
    
    const markerControls = new ArMarkerControls(arToolkitContext, markerRoot, {
        type: 'pattern',
        patternUrl: 'pattern-marker.patt',
        changeMatrixMode: 'modelViewMatrix'
    });

    // 加载 glTF 模型
    const loader = new THREE.GLTFLoader();
    
    // 添加加载进度处理
    const loadingManager = new THREE.LoadingManager();
    loadingManager.onProgress = function(url, itemsLoaded, itemsTotal) {
        console.log('Loading file: ' + url + '.\nLoaded ' + itemsLoaded + ' of ' + itemsTotal + ' files.');
    };

    loadingManager.onLoad = function() {
        console.log('All models loaded');
        document.getElementById('loading').style.display = 'none';
    };

    loadingManager.onError = function(url) {
        console.error('Error loading ' + url);
        document.getElementById('error').textContent = 'Error loading 3D model';
        document.getElementById('error').style.display = 'block';
        document.getElementById('loading').style.display = 'none';
    };

    loader.setManager(loadingManager);

    // 加载模型
    loader.load(
        'models/treasure-chest.gltf',
        function(gltf) {
            console.log('Model loaded successfully');
            const model = gltf.scene;
            
            // 调整模型大小和位置
            model.scale.set(0.5, 0.5, 0.5);
            model.position.set(0, 0.25, 0);
            
            // 添加到标记根节点
            markerRoot.add(model);
            
            // 添加简单的动画
            const rotationSpeed = 0.01;
            model.userData.animate = function(delta) {
                model.rotation.y += rotationSpeed;
            };
        },
        function(xhr) {
            console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        function(error) {
            console.error('Error loading model:', error);
            document.getElementById('error').textContent = 'Error loading 3D model: ' + error;
            document.getElementById('error').style.display = 'block';
            document.getElementById('loading').style.display = 'none';
        }
    );

    // 动画循环
    function animate() {
        requestAnimationFrame(animate);

        if (arToolkitSource.ready !== false) {
            arToolkitContext.update(arToolkitSource.domElement);
        }

        // 更新模型动画
        markerRoot.children.forEach((child) => {
            if (child.userData.animate) {
                child.userData.animate();
            }
        });

        renderer.render(scene, camera);
    }

    // 开始动画
    animate();
});