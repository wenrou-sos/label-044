import * as THREE from 'three';

const GameState = {
    START: 'start',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAMEOVER: 'gameover'
};

const LANES = [-2, 0, 2];
const LANE_WIDTH = 2;
const TRACK_LENGTH = 200;
const GROUND_Y = 0;
const PLAYER_HEIGHT = 1.6;

class EndlessRunnerGame {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.state = GameState.START;
        this.score = 0;
        this.coins = 0;
        this.highScore = parseInt(localStorage.getItem('endlessRunnerHighScore') || '0', 10);
        this.speed = 12;
        this.baseSpeed = 12;
        this.maxSpeed = 30;
        this.distance = 0;
        this.spawnTimer = 0;
        this.spawnInterval = 1.5;
        this.coinSpawnTimer = 0;
        this.coinSpawnInterval = 0.8;
        this.lastTime = 0;
        this.playerLane = 1;
        this.targetLaneX = 0;
        this.isJumping = false;
        this.jumpVelocity = 0;
        this.gravity = -30;
        this.jumpForce = 12;
        this.playerY = PLAYER_HEIGHT;
        this.obstacles = [];
        this.coins3D = [];
        this.groundSegments = [];
        this.fogColor = 0x1a1a2e;

        this.initAudio();
        this.initThree();
        this.initLights();
        this.initGround();
        this.initPlayer();
        this.initEnvironment();
        this.initControls();
        this.initUI();
        this.updateHighScoreDisplay();
        this.animate(0);
    }

    initAudio() {
        this.audioContext = null;
        this.sounds = {};
    }

    ensureAudio() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    playSound(type) {
        this.ensureAudio();
        if (!this.audioContext) return;

        const now = this.audioContext.currentTime;

        if (type === 'jump') {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.connect(gain);
            gain.connect(this.audioContext.destination);
            osc.start(now);
            osc.stop(now + 0.15);
        } else if (type === 'coin') {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.setValueAtTime(1320, now + 0.05);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.connect(gain);
            gain.connect(this.audioContext.destination);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === 'hit') {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 0.3);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.connect(gain);
            gain.connect(this.audioContext.destination);
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'gameover') {
            const freqs = [440, 330, 220];
            freqs.forEach((freq, i) => {
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + i * 0.15);
                gain.gain.setValueAtTime(0.15, now + i * 0.15);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.2);
                osc.connect(gain);
                gain.connect(this.audioContext.destination);
                osc.start(now + i * 0.15);
                osc.stop(now + i * 0.15 + 0.2);
            });
        }
    }

    initThree() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.fogColor);
        this.scene.fog = new THREE.Fog(this.fogColor, 30, 100);

        this.camera = new THREE.PerspectiveCamera(
            70,
            window.innerWidth / window.innerHeight,
            0.1,
            500
        );
        this.camera.position.set(0, 5, 8);
        this.camera.lookAt(0, 2, -10);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        window.addEventListener('resize', () => this.onResize());
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    initLights() {
        const ambient = new THREE.AmbientLight(0x404060, 0.6);
        this.scene.add(ambient);

        const directional = new THREE.DirectionalLight(0xffffff, 1.2);
        directional.position.set(10, 20, 10);
        directional.castShadow = true;
        directional.shadow.mapSize.width = 1024;
        directional.shadow.mapSize.height = 1024;
        directional.shadow.camera.near = 0.5;
        directional.shadow.camera.far = 100;
        directional.shadow.camera.left = -20;
        directional.shadow.camera.right = 20;
        directional.shadow.camera.top = 20;
        directional.shadow.camera.bottom = -20;
        this.scene.add(directional);

        const pointLight = new THREE.PointLight(0x667eea, 0.8, 30);
        pointLight.position.set(0, 5, 0);
        this.scene.add(pointLight);
    }

    initGround() {
        for (let i = 0; i < 3; i++) {
            const geometry = new THREE.PlaneGeometry(8, TRACK_LENGTH / 2);
            const material = new THREE.MeshStandardMaterial({
                color: i % 2 === 0 ? 0x2a2a4a : 0x252545,
                roughness: 0.8,
                metalness: 0.2
            });
            const ground = new THREE.Mesh(geometry, material);
            ground.rotation.x = -Math.PI / 2;
            ground.position.z = -i * (TRACK_LENGTH / 2) + (TRACK_LENGTH / 4);
            ground.receiveShadow = true;
            this.scene.add(ground);
            this.groundSegments.push(ground);
        }

        for (let side of [-1, 1]) {
            for (let i = 0; i < 20; i++) {
                const geometry = new THREE.BoxGeometry(0.5, 0.8, 3);
                const material = new THREE.MeshStandardMaterial({
                    color: i % 2 === 0 ? 0x4a5568 : 0x2d3748,
                    roughness: 0.7,
                    metalness: 0.3
                });
                const barrier = new THREE.Mesh(geometry, material);
                barrier.position.set(side * 4.25, 0.4, -i * 10);
                barrier.castShadow = true;
                barrier.receiveShadow = true;
                this.scene.add(barrier);
                this.groundSegments.push(barrier);
            }
        }
    }

    initPlayer() {
        this.player = new THREE.Group();

        const bodyGeometry = new THREE.BoxGeometry(0.8, 1.0, 0.5);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0x667eea,
            roughness: 0.4,
            metalness: 0.3
        });
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.position.y = 0.9;
        this.body.castShadow = true;
        this.player.add(this.body);

        const headGeometry = new THREE.SphereGeometry(0.35, 16, 16);
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0xffd699,
            roughness: 0.6,
            metalness: 0.1
        });
        this.head = new THREE.Mesh(headGeometry, headMaterial);
        this.head.position.y = 1.75;
        this.head.castShadow = true;
        this.player.add(this.head);

        const eyeGeometry = new THREE.SphereGeometry(0.06, 8, 8);
        const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
        this.leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        this.leftEye.position.set(-0.12, 1.8, 0.3);
        this.player.add(this.leftEye);
        this.rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        this.rightEye.position.set(0.12, 1.8, 0.3);
        this.player.add(this.rightEye);

        const limbMaterial = new THREE.MeshStandardMaterial({
            color: 0x764ba2,
            roughness: 0.5,
            metalness: 0.2
        });

        this.leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), limbMaterial);
        this.leftArm.position.set(-0.55, 1.0, 0);
        this.leftArm.castShadow = true;
        this.player.add(this.leftArm);

        this.rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), limbMaterial);
        this.rightArm.position.set(0.55, 1.0, 0);
        this.rightArm.castShadow = true;
        this.player.add(this.rightArm);

        this.leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 0.25), limbMaterial);
        this.leftLeg.position.set(-0.22, 0.35, 0);
        this.leftLeg.castShadow = true;
        this.player.add(this.leftLeg);

        this.rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 0.25), limbMaterial);
        this.rightLeg.position.set(0.22, 0.35, 0);
        this.rightLeg.castShadow = true;
        this.player.add(this.rightLeg);

        this.player.position.set(0, GROUND_Y, 0);
        this.scene.add(this.player);

        this.runTime = 0;
    }

    initEnvironment() {
        this.buildings = [];
        for (let i = 0; i < 40; i++) {
            const height = 3 + Math.random() * 10;
            const width = 2 + Math.random() * 3;
            const depth = 2 + Math.random() * 4;
            const geometry = new THREE.BoxGeometry(width, height, depth);
            const hue = 0.6 + Math.random() * 0.2;
            const material = new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(hue, 0.3, 0.2 + Math.random() * 0.15),
                roughness: 0.9,
                metalness: 0.1
            });
            const building = new THREE.Mesh(geometry, material);
            const side = Math.random() > 0.5 ? 1 : -1;
            building.position.set(
                side * (8 + Math.random() * 8),
                height / 2,
                -i * 8 - Math.random() * 4
            );
            building.castShadow = true;
            building.receiveShadow = true;
            this.scene.add(building);
            this.buildings.push(building);
        }

        const starsGeometry = new THREE.BufferGeometry();
        const starCount = 500;
        const positions = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 200;
            positions[i * 3 + 1] = 10 + Math.random() * 50;
            positions[i * 3 + 2] = -10 - Math.random() * 200;
        }
        starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const starsMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.3,
            sizeAttenuation: true
        });
        this.stars = new THREE.Points(starsGeometry, starsMaterial);
        this.scene.add(this.stars);
    }

    spawnObstacle() {
        const lane = Math.floor(Math.random() * 3);
        const types = ['box', 'tall', 'low'];
        const type = types[Math.floor(Math.random() * types.length)];

        let geometry, material, height, yPos;

        if (type === 'box') {
            height = 1.2 + Math.random() * 0.5;
            geometry = new THREE.BoxGeometry(1.5, height, 1.5);
            material = new THREE.MeshStandardMaterial({
                color: 0xff4757,
                roughness: 0.4,
                metalness: 0.5
            });
            yPos = height / 2;
        } else if (type === 'tall') {
            height = 2.5;
            geometry = new THREE.CylinderGeometry(0.5, 0.5, height, 8);
            material = new THREE.MeshStandardMaterial({
                color: 0xff6348,
                roughness: 0.5,
                metalness: 0.4
            });
            yPos = height / 2;
        } else {
            height = 0.6;
            geometry = new THREE.BoxGeometry(1.8, height, 1.8);
            material = new THREE.MeshStandardMaterial({
                color: 0xff7979,
                roughness: 0.6,
                metalness: 0.3
            });
            yPos = height / 2;
        }

        const obstacle = new THREE.Mesh(geometry, material);
        obstacle.position.set(LANES[lane], yPos, -80);
        obstacle.castShadow = true;
        obstacle.receiveShadow = true;
        obstacle.userData = {
            type: 'obstacle',
            lane: lane,
            height: height,
            width: type === 'low' ? 1.8 : 1.5
        };

        const glowGeometry = geometry.clone();
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.15
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.scale.setScalar(1.1);
        obstacle.add(glow);

        this.scene.add(obstacle);
        this.obstacles.push(obstacle);
    }

    spawnCoin() {
        const lane = Math.floor(Math.random() * 3);
        const geometry = new THREE.TorusGeometry(0.3, 0.08, 8, 16);
        const material = new THREE.MeshStandardMaterial({
            color: 0xfeca57,
            roughness: 0.2,
            metalness: 0.9,
            emissive: 0xfeca57,
            emissiveIntensity: 0.3
        });
        const coin = new THREE.Mesh(geometry, material);
        coin.position.set(LANES[lane], 1.2, -80);
        coin.rotation.y = Math.PI / 2;
        coin.castShadow = true;
        coin.userData = {
            type: 'coin',
            lane: lane,
            collected: false
        };

        const light = new THREE.PointLight(0xfeca57, 0.5, 3);
        coin.add(light);

        this.scene.add(coin);
        this.coins3D.push(coin);
    }

    initControls() {
        this.keys = {};

        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;

            if (this.state === GameState.PLAYING) {
                if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
                    this.moveLeft();
                } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
                    this.moveRight();
                } else if (e.code === 'ArrowUp' || e.code === 'Space' || e.code === 'KeyW') {
                    this.jump();
                } else if (e.code === 'KeyP') {
                    this.pauseGame();
                }
            } else if (this.state === GameState.PAUSED) {
                if (e.code === 'KeyP' || e.code === 'Escape') {
                    this.resumeGame();
                }
            } else if (this.state === GameState.START) {
                if (e.code === 'Space' || e.code === 'Enter') {
                    this.startGame();
                }
            } else if (this.state === GameState.GAMEOVER) {
                if (e.code === 'Space' || e.code === 'Enter') {
                    this.restartGame();
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        let touchStartX = 0;
        let touchStartY = 0;

        this.canvas.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        });

        this.canvas.addEventListener('touchend', (e) => {
            if (this.state !== GameState.PLAYING) return;
            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;
            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;

            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                if (Math.abs(deltaX) > 30) {
                    if (deltaX > 0) {
                        this.moveRight();
                    } else {
                        this.moveLeft();
                    }
                }
            } else {
                if (deltaY < -30) {
                    this.jump();
                }
            }
        });

        this.canvas.addEventListener('click', () => {
            if (this.state === GameState.PLAYING) {
                this.ensureAudio();
            }
        });
    }

    initUI() {
        document.getElementById('start-btn').addEventListener('click', () => this.startGame());
        document.getElementById('pause-btn').addEventListener('click', () => this.pauseGame());
        document.getElementById('resume-btn').addEventListener('click', () => this.resumeGame());
        document.getElementById('restart-btn').addEventListener('click', () => this.restartGame());
        document.getElementById('pause-restart-btn').addEventListener('click', () => this.restartGame());
    }

    startGame() {
        this.ensureAudio();
        this.state = GameState.PLAYING;
        this.score = 0;
        this.coins = 0;
        this.speed = this.baseSpeed;
        this.distance = 0;
        this.playerLane = 1;
        this.targetLaneX = 0;
        this.isJumping = false;
        this.playerY = PLAYER_HEIGHT;
        this.jumpVelocity = 0;
        this.spawnTimer = 0;
        this.coinSpawnTimer = 0;
        this.spawnInterval = 1.5;

        this.clearObstacles();
        this.clearCoins();
        this.updateScoreDisplay();
        this.updateCoinDisplay();

        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('gameover-screen').classList.add('hidden');
        document.getElementById('pause-screen').classList.add('hidden');
    }

    pauseGame() {
        if (this.state !== GameState.PLAYING) return;
        this.state = GameState.PAUSED;
        document.getElementById('pause-score').textContent = Math.floor(this.score);
        document.getElementById('pause-coins').textContent = this.coins;
        document.getElementById('pause-screen').classList.remove('hidden');
    }

    resumeGame() {
        if (this.state !== GameState.PAUSED) return;
        this.state = GameState.PLAYING;
        document.getElementById('pause-screen').classList.add('hidden');
    }

    gameOver() {
        this.state = GameState.GAMEOVER;
        this.playSound('hit');
        this.playSound('gameover');

        const finalScore = Math.floor(this.score + this.coins * 10);
        const isNewHighScore = finalScore > this.highScore;

        if (isNewHighScore) {
            this.highScore = finalScore;
            localStorage.setItem('endlessRunnerHighScore', this.highScore.toString());
        }

        document.getElementById('final-score').textContent = finalScore;
        document.getElementById('final-coins').textContent = this.coins;
        document.getElementById('final-highscore').textContent = this.highScore;
        document.getElementById('newhighscore-container').style.display = isNewHighScore ? 'flex' : 'none';

        this.updateHighScoreDisplay();
        document.getElementById('gameover-screen').classList.remove('hidden');
    }

    restartGame() {
        document.getElementById('gameover-screen').classList.add('hidden');
        document.getElementById('pause-screen').classList.add('hidden');
        this.startGame();
    }

    moveLeft() {
        if (this.playerLane > 0) {
            this.playerLane--;
            this.targetLaneX = LANES[this.playerLane];
        }
    }

    moveRight() {
        if (this.playerLane < 2) {
            this.playerLane++;
            this.targetLaneX = LANES[this.playerLane];
        }
    }

    jump() {
        if (!this.isJumping) {
            this.isJumping = true;
            this.jumpVelocity = this.jumpForce;
            this.playSound('jump');
        }
    }

    clearObstacles() {
        for (const obs of this.obstacles) {
            this.scene.remove(obs);
            if (obs.geometry) obs.geometry.dispose();
            if (obs.material) obs.material.dispose();
        }
        this.obstacles = [];
    }

    clearCoins() {
        for (const coin of this.coins3D) {
            this.scene.remove(coin);
            if (coin.geometry) coin.geometry.dispose();
            if (coin.material) coin.material.dispose();
        }
        this.coins3D = [];
    }

    updateHighScoreDisplay() {
        document.getElementById('highscore').textContent = this.highScore;
        document.getElementById('start-highscore').textContent = this.highScore;
    }

    updateScoreDisplay() {
        document.getElementById('score').textContent = Math.floor(this.score);
    }

    updateCoinDisplay() {
        document.getElementById('coins').textContent = this.coins;
    }

    updatePlayerAnimation(dt) {
        this.runTime += dt * this.speed * 0.15;
        const swing = Math.sin(this.runTime) * 0.5;
        const legSwing = Math.sin(this.runTime) * 0.8;

        this.leftArm.rotation.x = -swing;
        this.rightArm.rotation.x = swing;
        this.leftLeg.rotation.x = legSwing;
        this.rightLeg.rotation.x = -legSwing;

        this.body.position.y = 0.9 + Math.abs(Math.sin(this.runTime * 2)) * 0.05;

        if (this.isJumping) {
            this.leftArm.rotation.x = -1.5;
            this.rightArm.rotation.x = -1.5;
            this.leftLeg.rotation.x = -0.3;
            this.rightLeg.rotation.x = 0.3;
        }
    }

    checkCollisions() {
        const playerX = this.player.position.x;
        const playerY = this.playerY;
        const playerZ = this.player.position.z;
        const playerRadius = 0.5;

        for (const obs of this.obstacles) {
            if (obs.position.z > 2 || obs.position.z < -2) continue;

            const dx = Math.abs(playerX - obs.position.x);
            const dz = Math.abs(playerZ - obs.position.z);

            const obsWidth = obs.userData.width / 2;
            const obsDepth = 0.75;

            if (dx < playerRadius + obsWidth && dz < playerRadius + obsDepth) {
                const playerBottom = playerY - PLAYER_HEIGHT / 2;
                const playerTop = playerY + PLAYER_HEIGHT / 2;
                const obsHeight = obs.userData.height;

                if (playerBottom < obsHeight - 0.2) {
                    this.gameOver();
                    return;
                }
            }
        }

        for (const coin of this.coins3D) {
            if (coin.userData.collected) continue;
            if (coin.position.z > 3 || coin.position.z < -3) continue;

            const dx = Math.abs(playerX - coin.position.x);
            const dz = Math.abs(playerZ - coin.position.z);
            const dy = Math.abs(playerY - coin.position.y);

            if (dx < 1.0 && dz < 1.0 && dy < 1.5) {
                coin.userData.collected = true;
                this.coins++;
                this.score += 10;
                this.playSound('coin');
                this.updateScoreDisplay();
                this.updateCoinDisplay();
                this.animateCoinCollection(coin);
            }
        }
    }

    animateCoinCollection(coin) {
        const startScale = 1;
        const endScale = 0;
        const duration = 300;
        const startTime = performance.now();

        const animate = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const scale = startScale + (endScale - startScale) * progress;
            coin.scale.setScalar(scale);
            coin.position.y += 0.1;

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.scene.remove(coin);
            }
        };
        animate();
    }

    update(dt) {
        if (this.state !== GameState.PLAYING) return;

        this.speed = Math.min(this.maxSpeed, this.baseSpeed + this.distance * 0.003);
        this.spawnInterval = Math.max(0.6, 1.5 - this.distance * 0.0003);
        this.coinSpawnInterval = Math.max(0.4, 0.8 - this.distance * 0.0001);

        this.distance += this.speed * dt;
        this.score = this.distance * 0.5 + this.coins * 10;
        this.updateScoreDisplay();

        const laneLerp = 1 - Math.pow(0.001, dt);
        this.player.position.x += (this.targetLaneX - this.player.position.x) * laneLerp;

        if (this.isJumping) {
            this.jumpVelocity += this.gravity * dt;
            this.playerY += this.jumpVelocity * dt;
            if (this.playerY <= PLAYER_HEIGHT) {
                this.playerY = PLAYER_HEIGHT;
                this.isJumping = false;
                this.jumpVelocity = 0;
            }
        }
        this.player.position.y = this.playerY - PLAYER_HEIGHT / 2;

        this.updatePlayerAnimation(dt);

        this.spawnTimer += dt;
        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnTimer = 0;
            this.spawnObstacle();
        }

        this.coinSpawnTimer += dt;
        if (this.coinSpawnTimer >= this.coinSpawnInterval) {
            this.coinSpawnTimer = 0;
            this.spawnCoin();
        }

        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obs = this.obstacles[i];
            obs.position.z += this.speed * dt;
            if (obs.position.z > 15) {
                this.scene.remove(obs);
                if (obs.geometry) obs.geometry.dispose();
                if (obs.material) obs.material.dispose();
                this.obstacles.splice(i, 1);
            }
        }

        for (let i = this.coins3D.length - 1; i >= 0; i--) {
            const coin = this.coins3D[i];
            if (!coin.userData.collected) {
                coin.position.z += this.speed * dt;
                coin.rotation.x += dt * 3;
            }
            if (coin.position.z > 15) {
                this.scene.remove(coin);
                if (coin.geometry) coin.geometry.dispose();
                if (coin.material) coin.material.dispose();
                this.coins3D.splice(i, 1);
            }
        }

        const groundSpeed = this.speed * dt;
        for (let i = 0; i < 3; i++) {
            if (i < this.groundSegments.length) {
                this.groundSegments[i].position.z += groundSpeed;
                if (this.groundSegments[i].position.z > TRACK_LENGTH / 4 + 10) {
                    this.groundSegments[i].position.z -= (TRACK_LENGTH / 2) * 3;
                }
            }
        }

        for (const building of this.buildings) {
            building.position.z += this.speed * dt * 0.5;
            if (building.position.z > 20) {
                building.position.z -= 320;
                const height = 3 + Math.random() * 10;
                building.position.y = height / 2;
                building.scale.y = height / (building.geometry.parameters.height || height);
            }
        }

        const cameraTargetX = this.player.position.x * 0.5;
        const cameraTargetY = this.isJumping ? 5.5 : 5;
        const cameraLerp = 1 - Math.pow(0.01, dt);
        this.camera.position.x += (cameraTargetX - this.camera.position.x) * cameraLerp;
        this.camera.position.y += (cameraTargetY - this.camera.position.y) * cameraLerp;
        this.camera.lookAt(this.player.position.x * 0.3, 2, -10);

        this.checkCollisions();
    }

    animate(time) {
        requestAnimationFrame((t) => this.animate(t));

        const dt = Math.min((time - this.lastTime) / 1000, 0.1);
        this.lastTime = time;

        this.update(dt);
        this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new EndlessRunnerGame();
});
