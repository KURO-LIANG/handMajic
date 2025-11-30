// --- 全局变量 ---
let scene, camera, renderer;
let particles;
let geometry;
const particleCount = 50000; // 粒子数量，可根据性能调整
const initialPositions = new Float32Array(particleCount * 3); // 存储每个粒子的初始位置
let handDistance = 0.5; // 0 (聚集) 到 1 (扩散)
let currentShapeGenerator = generateHeartShape; // 默认形状生成函数
const clock = new THREE.Clock();

// --- UI 控制对象 ---
const settings = {
    particleColor: '#d000ff', // 默认青色
    particleSize: 0.01,
    shapeScale: 2.0,
    particleShape: '爱心',
    // 全屏控制
    toggleFullscreen: () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }
};

// --- A. 粒子形状生成函数 (核心要求 2) ---

/**
 * 生成爱心形状的粒子位置 (参数方程)
 * @param {Float32Array} positions - 要填充的 positions 数组
 */
function generateHeartShape(positions) {
    const scale = settings.shapeScale;
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;

        // 使用随机参数 t 和 phi
        const t = Math.random() * 2 * Math.PI;
        const phi = Math.random() * 2 * Math.PI;

        // 爱心曲线 (2D)
        let x = 16 * Math.pow(Math.sin(t), 3);
        let y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        let z = Math.cos(phi) * 1; // 增加少量Z轴扰动，使其变成3D

        // 归一化和缩放
        positions[i3] = (x / 20) * scale + (Math.random() - 0.5) * 0.1;
        positions[i3 + 1] = (y / 20) * scale + (Math.random() - 0.5) * 0.1;
        positions[i3 + 2] = (z / 20) * scale + (Math.random() - 0.5) * 0.1;
    }
}

/**
 * 示例：生成土星环形状
 */
function generateSaturnShape(positions) {
    const scale = settings.shapeScale;
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;

        // 主要环
        if (Math.random() < 0.9) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 1 + Math.random() * 0.8; // 环的半径范围

            positions[i3]     = Math.cos(angle) * radius * scale;
            positions[i3 + 1] = (Math.random() - 0.5) * 0.1; // 环的薄度
            positions[i3 + 2] = Math.sin(angle) * radius * scale;
        }
        // 少量中心核心
        else {
            positions[i3]     = (Math.random() - 0.5) * 0.5 * scale;
            positions[i3 + 1] = (Math.random() - 0.5) * 0.5 * scale;
            positions[i3 + 2] = (Math.random() - 0.5) * 0.5 * scale;
        }
    }
}

/**
 * 统一的模型切换逻辑
 */
function updateShape(shapeName) {
    switch (shapeName) {
        case '爱心':
            currentShapeGenerator = generateHeartShape;
            break;
        case '土星':
            currentShapeGenerator = generateSaturnShape;
            break;
        // 可以在这里添加 '花朵', '烟花' 等其他形状
        default:
            currentShapeGenerator = generateHeartShape; // 默认
            break;
    }

    // 重新生成初始位置
    currentShapeGenerator(initialPositions);

    // 3. **后续逻辑：** 如果粒子对象已经存在，则更新其几何体的当前位置
    if (particles) {
        const currentPositions = particles.geometry.attributes.position.array;

        // 将新的初始位置复制到当前位置，立即改变形状
        for (let i = 0; i < currentPositions.length; i++) {
            currentPositions[i] = initialPositions[i];
        }
        particles.geometry.attributes.position.needsUpdate = true;
    }
}


// --- B. Three.js 初始化和粒子创建 ---

function initThree() {
    // 1. 场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    // 2. 相机
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 5;

    // 3. 渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // 4. 粒子系统
    geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    // 1. 在创建 BufferGeometry 之前，先调用一次 updateShape
    // 这样 initialPositions 数组会被填充，但 updateShape 中的 particles 更新逻辑会被跳过 (因为 particles 还没创建)。
    updateShape(settings.particleShape);

    // 2. 将 initialPositions 赋值给 geometry
    geometry.setAttribute('initialPosition', new THREE.BufferAttribute(initialPositions, 3));

    // 3. 将 initialPositions 的值复制到当前 positions (首次渲染时它们应该一致)
    for(let i=0; i < positions.length; i++) {
        positions[i] = initialPositions[i];
    }

    // 4. 设置位置和颜色属性
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // 5. 初始化颜色 (颜色不需要等待 particles，只需要 colors 数组)
    updateParticleColors(settings.particleColor);

    const material = new THREE.PointsMaterial({
        size: settings.particleSize,
        sizeAttenuation: true,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false, // <--- 关键修改：禁用深度写入！
        // 增加一个贴图可以使粒子看起来是圆形的，而不是默认的方形。
        // 如果没有自定义贴图，可以暂时省略
        // map: new THREE.TextureLoader().load('textures/spark.png')
    });

    // 6. 创建 particles 对象 (现在 particles 对象已存在)
    particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // 5. 窗口调整
    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * 实时更新粒子颜色 (要求 3)
 */
function updateParticleColors(hexColor) {
    const baseColor = new THREE.Color(hexColor);
    // 关键：首次运行时，particles 对象可能还未创建，但几何体的 attributes 已经存在
    // 确保我们引用的是 geometry 上的 color 属性
    const colors = particles
        ? particles.geometry.attributes.color.array
        : geometry.attributes.color.array; // <-- 当 particles 未定义时，直接使用 geometry 全局变量

    // 赋予每个粒子基于用户选择颜色的微小变化
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;

        // 生成一个随机亮度乘数，使部分粒子更亮
        // Math.random() * 0.4 + 0.6 将生成 0.6 到 1.0 之间的值
        const brightness = Math.random() * 0.4 + 0.6;

        // 颜色随机扰动和亮度叠加
        const r = baseColor.r * brightness + Math.random() * 0.05;
        const g = baseColor.g * brightness + Math.random() * 0.05;
        const b = baseColor.b * brightness + Math.random() * 0.05;

        // 使用 THREE.AdditiveBlending 时，颜色值可以超过 1.0 以获得更强的发光效果
        colors[i3] = r * 1.5; // 乘以 1.5 增加强度！
        colors[i3 + 1] = g * 1.5;
        colors[i3 + 2] = b * 1.5;
    }

    // **关键：只有当 particles 对象存在时，才设置 needsUpdate**
    if (particles) {
        particles.geometry.attributes.color.needsUpdate = true;
    }
}


// --- C. 动画和手势响应 (核心要求 1 & 4) ---

function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();

    // 1. 粒子的扩散/聚集逻辑
    const positions = particles.geometry.attributes.position.array;
    const initialPositions = particles.geometry.attributes.initialPosition.array;

    // 距离缩放因子: handDistance 从 0 (聚集) 到 1 (扩散)
    // handDistance = 0 -> scaleFactor = 0.5
    // handDistance = 1 -> scaleFactor = 1.5
    const scaleFactor = 0.5 + handDistance * 1.0;

    // 简单扰动：使粒子轻微漂浮
    const time = Date.now() * 0.001;

    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;

        // 原始位置 * 缩放因子
        positions[i3] = initialPositions[i3] * scaleFactor + Math.sin(time * 0.5 + i) * 0.01;
        positions[i3 + 1] = initialPositions[i3 + 1] * scaleFactor + Math.cos(time * 0.5 + i) * 0.01;
        positions[i3 + 2] = initialPositions[i3 + 2] * scaleFactor;
    }

    particles.geometry.attributes.position.needsUpdate = true;

    // 2. 旋转 (增加动感)
    particles.rotation.y += 0.05 * deltaTime;

    renderer.render(scene, camera);
}


// --- D. MediaPipe 手部追踪 ---

const videoElement = document.getElementById('videoElement');

function initMediaPipe() {

    // 1. 初始化 Hands
    const hands = new Hands({
        locateFile: (file) => {
            // MediaPipe 库文件路径
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`;
        }
    });

    hands.setOptions({
        maxNumHands: 2, // 允许检测双手
        modelComplexity: 1, // 高精度
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7
    });

    // 2. 处理检测结果
    hands.onResults((results) => {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length === 2) {
            // 检测到双手
            const hand1 = results.multiHandLandmarks[0];
            const hand2 = results.multiHandLandmarks[1];

            // 使用两只手的掌心 (关键点 0) 进行距离计算
            const p1 = hand1[0]; // 关键点 0: 手腕/掌心
            const p2 = hand2[0];

            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;

            // 归一化的屏幕距离 (0-1)
            let dist = Math.sqrt(dx * dx + dy * dy);

            // 归一化到 0 (聚集) 到 1 (扩散)
            const MIN_DIST = 0.05; // 最小手部距离
            const MAX_DIST = 0.6;  // 最大手部距离

            let normalizedDistance = (dist - MIN_DIST) / (MAX_DIST - MIN_DIST);

            // 限制范围，平滑处理
            handDistance = Math.max(0, Math.min(1, normalizedDistance));

        } else {
            // 如果只检测到一只手或没有手，让粒子系统缓慢回到默认状态 (中等扩散)
            handDistance += (0.5 - handDistance) * 0.05;
        }
    });

    // 3. 启动摄像头
    const camera = new Camera(videoElement, {
        onFrame: async () => {
            // 每一帧都发送给 MediaPipe 处理
            await hands.send({ image: videoElement });
        },
        width: 1280, // 视频分辨率，影响性能和精度
        height: 720
    });

    camera.start();

    console.log("MediaPipe Hands 初始化成功，等待摄像头权限...");
}

// --- E. UI 初始化 (要求 2, 3, 5) ---

function initGUI() {
    const gui = new dat.GUI();

    // 模型选择器 (要求 2)
    gui.add(settings, 'particleShape', ['爱心', '土星']).name('粒子模型').onChange(updateShape);

    // 颜色选择器 (要求 3)
    gui.addColor(settings, 'particleColor').name('粒子颜色').onChange(updateParticleColors);

    // 粒子大小
    gui.add(settings, 'particleSize', 0.01, 0.1).step(0.01).name('粒子大小').onChange((size) => {
        particles.material.size = size;
    });

    // 形状缩放
    gui.add(settings, 'shapeScale', 0.5, 5.0).step(0.1).name('形状缩放').onChange(() => {
        // 重新生成形状
        updateShape(settings.particleShape);
    });

    // 全屏按钮 (要求 5)
    gui.add(settings, 'toggleFullscreen').name('✨ 全屏模式');

    gui.open();
}


// --- 启动程序 ---

initThree();
initGUI();
initMediaPipe();
animate();