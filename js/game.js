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

const CHARACTER_PRESETS = [
    {
        name: '探险家',
        body: 0x667eea,
        bodyAccent: 0x764ba2,
        skin: 0xffd699,
        hat: 0x8b5a2b,
        hatType: 'fedora',
        backpack: 0x6b4423
    },
    {
        name: '忍者',
        body: 0x2d3436,
        bodyAccent: 0x636e72,
        skin: 0x2d3436,
        hat: 0x2d3436,
        hatType: 'hood',
        backpack: 0x1e272e,
        headband: 0xe74c3c
    },
    {
        name: '机器人',
        body: 0x00b894,
        bodyAccent: 0x00cec9,
        skin: 0xdfe6e9,
        hat: 0x636e72,
        hatType: 'antenna',
        backpack: 0x2d3436,
        visor: 0x00cec9
    },
    {
        name: '冒险家',
        body: 0xfdcb6e,
        bodyAccent: 0xe17055,
        skin: 0xffeaa7,
        hat: 0xe17055,
        hatType: 'cowboy',
        backpack: 0x8b5a2b
    }
];

const POWERUP_TYPES = {
    SPEED: {
        name: 'speed',
        duration: 5,
        multiplier: 1.6,
        color: 0xff9500,
        emissive: 0xff6b00,
        icon: '⚡'
    },
    MAGNET: {
        name: 'magnet',
        duration: 8,
        radius: 6,
        color: 0xff3cac,
        emissive: 0x784ba0,
        icon: '🧲'
    },
    SHIELD: {
        name: 'shield',
        duration: 6,
        color: 0x00c9ff,
        emissive: 0x0088aa,
        icon: '🛡️'
    }
};

class EndlessRunnerGame {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.state = GameState.START;
        this.selectedCharacter = parseInt(localStorage.getItem('selectedCharacter') || '0', 10);
        this.score = 0;
        this.coins = 0;
        this.highScore = parseInt(localStorage.getItem('endlessRunnerHighScore') || '0', 10);
        this.speed = 12;
        this.baseSpeed = 12;
        this.maxSpeed = 40;
        this.distance = 0;
        this.spawnTimer = 0;
        this.spawnInterval = 1.5;
        this.coinSpawnTimer = 0;
        this.coinSpawnInterval = 0.8;
        this.powerupSpawnTimer = 0;
        this.powerupSpawnInterval = 8;
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
        this.powerups3D = [];
        this.groundSegments = [];
        this.neonLines = [];
        this.fogColor = 0x0f0c29;

        this.activePowerups = {
            speed: 0,
            magnet: 0,
            shield: 0
        };

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
            osc.connect(gain); gain.connect(this.audioContext.destination);
            osc.start(now); osc.stop(now + 0.15);
        } else if (type === 'coin') {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.setValueAtTime(1320, now + 0.05);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.connect(gain); gain.connect(this.audioContext.destination);
            osc.start(now); osc.stop(now + 0.2);
        } else if (type === 'hit') {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 0.3);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.connect(gain); gain.connect(this.audioContext.destination);
            osc.start(now); osc.stop(now + 0.3);
        } else if (type === 'gameover') {
            [440, 330, 220].forEach((freq, i) => {
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + i * 0.15);
                gain.gain.setValueAtTime(0.15, now + i * 0.15);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.2);
                osc.connect(gain); gain.connect(this.audioContext.destination);
                osc.start(now + i * 0.15); osc.stop(now + i * 0.15 + 0.2);
            });
        } else if (type === 'powerup') {
            [523, 659, 784, 1047].forEach((freq, i) => {
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + i * 0.07);
                gain.gain.setValueAtTime(0.12, now + i * 0.07);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.15);
                osc.connect(gain); gain.connect(this.audioContext.destination);
                osc.start(now + i * 0.07); osc.stop(now + i * 0.07 + 0.15);
            });
        } else if (type === 'shieldBreak') {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.25);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.connect(gain); gain.connect(this.audioContext.destination);
            osc.start(now); osc.stop(now + 0.25);
        }
    }

    initThree() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.fogColor);
        this.scene.fog = new THREE.Fog(this.fogColor, 35, 110);

        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
        this.camera.position.set(0, 5.5, 8.5);
        this.camera.lookAt(0, 2, -12);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;

        window.addEventListener('resize', () => this.onResize());
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    initLights() {
        const ambient = new THREE.AmbientLight(0x505080, 0.55);
        this.scene.add(ambient);

        const directional = new THREE.DirectionalLight(0xffffff, 1.1);
        directional.position.set(8, 22, 12);
        directional.castShadow = true;
        directional.shadow.mapSize.width = 2048;
        directional.shadow.mapSize.height = 2048;
        directional.shadow.camera.near = 0.5;
        directional.shadow.camera.far = 120;
        directional.shadow.camera.left = -25;
        directional.shadow.camera.right = 25;
        directional.shadow.camera.top = 25;
        directional.shadow.camera.bottom = -25;
        directional.shadow.bias = -0.0005;
        this.scene.add(directional);

        const purpleLight = new THREE.PointLight(0x667eea, 0.6, 40);
        purpleLight.position.set(-5, 6, 0);
        this.scene.add(purpleLight);

        const cyanLight = new THREE.PointLight(0x00c9ff, 0.5, 40);
        cyanLight.position.set(5, 6, 0);
        this.scene.add(cyanLight);

        this.playerLight = new THREE.PointLight(0xffffff, 0.7, 15);
        this.playerLight.position.set(0, 4, 0);
        this.scene.add(this.playerLight);
    }

    initGround() {
        for (let i = 0; i < 4; i++) {
            const geometry = new THREE.PlaneGeometry(10, TRACK_LENGTH / 2);
            const material = new THREE.MeshStandardMaterial({
                color: i % 2 === 0 ? 0x1a1a35 : 0x151530,
                roughness: 0.85,
                metalness: 0.25
            });
            const ground = new THREE.Mesh(geometry, material);
            ground.rotation.x = -Math.PI / 2;
            ground.position.z = -i * (TRACK_LENGTH / 2) + (TRACK_LENGTH / 4);
            ground.receiveShadow = true;
            this.scene.add(ground);
            this.groundSegments.push(ground);

            for (let l = 0; l < 2; l++) {
                const lineGeo = new THREE.PlaneGeometry(0.08, TRACK_LENGTH / 2);
                const lineMat = new THREE.MeshBasicMaterial({
                    color: l === 0 ? 0x667eea : 0xff3cac,
                    transparent: true,
                    opacity: 0.6
                });
                const line = new THREE.Mesh(lineGeo, lineMat);
                line.rotation.x = -Math.PI / 2;
                line.position.set(l === 0 ? -1 : 1, 0.01, -i * (TRACK_LENGTH / 2) + (TRACK_LENGTH / 4));
                this.scene.add(line);
                this.neonLines.push(line);
            }
        }

        for (let side of [-1, 1]) {
            for (let i = 0; i < 25; i++) {
                const postGeo = new THREE.BoxGeometry(0.3, 1.2, 0.3);
                const postMat = new THREE.MeshStandardMaterial({
                    color: 0x2d3748, roughness: 0.6, metalness: 0.6
                });
                const post = new THREE.Mesh(postGeo, postMat);
                post.position.set(side * 4.7, 0.6, -i * 8);
                post.castShadow = true; post.receiveShadow = true;
                this.scene.add(post); this.groundSegments.push(post);

                const glowGeo = new THREE.BoxGeometry(0.15, 0.8, 0.15);
                const glowMat = new THREE.MeshBasicMaterial({
                    color: side === -1 ? 0x667eea : 0xff3cac,
                    transparent: true, opacity: 0.9
                });
                const glow = new THREE.Mesh(glowGeo, glowMat);
                glow.position.set(side * 4.7, 0.6, -i * 8);
                this.scene.add(glow); this.neonLines.push(glow);
            }
        }

        const edgeGeo = new THREE.BoxGeometry(0.4, 0.15, TRACK_LENGTH * 2);
        const edgeMat = new THREE.MeshStandardMaterial({
            color: 0x2a2a4a, roughness: 0.5, metalness: 0.5
        });
        for (let side of [-1, 1]) {
            const edge = new THREE.Mesh(edgeGeo, edgeMat);
            edge.position.set(side * 4.8, 0.08, -50);
            edge.receiveShadow = true;
            this.scene.add(edge); this.groundSegments.push(edge);
        }
    }

    initPlayer() {
        if (this.player) this.scene.remove(this.player);
        this.player = new THREE.Group();
        const preset = CHARACTER_PRESETS[this.selectedCharacter];

        const bodyGeo = new THREE.BoxGeometry(0.75, 0.95, 0.5);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: preset.body, roughness: 0.45, metalness: 0.25
        });
        this.body = new THREE.Mesh(bodyGeo, bodyMat);
        this.body.position.y = 0.95;
        this.body.castShadow = true;
        this.player.add(this.body);

        const beltGeo = new THREE.BoxGeometry(0.78, 0.12, 0.53);
        const beltMat = new THREE.MeshStandardMaterial({
            color: preset.bodyAccent, roughness: 0.5, metalness: 0.4
        });
        const belt = new THREE.Mesh(beltGeo, beltMat);
        belt.position.y = 0.6;
        this.player.add(belt);

        if (preset.backpack) {
            const backpackGeo = new THREE.BoxGeometry(0.6, 0.7, 0.25);
            const backpackMat = new THREE.MeshStandardMaterial({
                color: preset.backpack, roughness: 0.7, metalness: 0.2
            });
            const backpack = new THREE.Mesh(backpackGeo, backpackMat);
            backpack.position.set(0, 1.0, -0.38);
            backpack.castShadow = true;
            this.player.add(backpack);
        }

        const headGeo = new THREE.SphereGeometry(0.33, 20, 20);
        const headMat = new THREE.MeshStandardMaterial({
            color: preset.skin, roughness: 0.65, metalness: 0.1
        });
        this.head = new THREE.Mesh(headGeo, headMat);
        this.head.position.y = 1.78;
        this.head.castShadow = true;
        this.player.add(this.head);

        if (preset.hatType === 'fedora') {
            const hatBrimGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.05, 20);
            const hatMat = new THREE.MeshStandardMaterial({
                color: preset.hat, roughness: 0.6, metalness: 0.2
            });
            const hatBrim = new THREE.Mesh(hatBrimGeo, hatMat);
            hatBrim.position.y = 2.0;
            hatBrim.castShadow = true;
            this.player.add(hatBrim);
            const hatTopGeo = new THREE.CylinderGeometry(0.25, 0.28, 0.3, 20);
            const hatTop = new THREE.Mesh(hatTopGeo, hatMat);
            hatTop.position.y = 2.17;
            hatTop.castShadow = true;
            this.player.add(hatTop);
        } else if (preset.hatType === 'hood') {
            const hoodGeo = new THREE.SphereGeometry(0.38, 20, 16, 0, Math.PI * 2, 0, Math.PI / 1.8);
            const hoodMat = new THREE.MeshStandardMaterial({
                color: preset.hat, roughness: 0.7, metalness: 0.1
            });
            const hood = new THREE.Mesh(hoodGeo, hoodMat);
            hood.position.y = 1.78;
            hood.rotation.x = 0.1;
            hood.castShadow = true;
            this.player.add(hood);
            if (preset.headband) {
                const bandGeo = new THREE.BoxGeometry(0.68, 0.06, 0.04);
                const bandMat = new THREE.MeshStandardMaterial({
                    color: preset.headband, roughness: 0.4, metalness: 0.2,
                    emissive: preset.headband, emissiveIntensity: 0.2
                });
                const band = new THREE.Mesh(bandGeo, bandMat);
                band.position.set(0, 1.82, -0.32);
                this.player.add(band);
                const tailGeo = new THREE.BoxGeometry(0.25, 0.4, 0.03);
                const tail = new THREE.Mesh(tailGeo, bandMat);
                tail.position.set(0.1, 1.62, -0.34);
                tail.rotation.z = 0.3;
                this.player.add(tail);
            }
        } else if (preset.hatType === 'antenna') {
            const visorGeo = new THREE.BoxGeometry(0.55, 0.15, 0.05);
            const visorMat = new THREE.MeshStandardMaterial({
                color: preset.visor, roughness: 0.2, metalness: 0.8,
                emissive: preset.visor, emissiveIntensity: 0.4
            });
            const visor = new THREE.Mesh(visorGeo, visorMat);
            visor.position.set(0, 1.82, -0.3);
            this.player.add(visor);
            const antGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.35, 8);
            const antMat = new THREE.MeshStandardMaterial({
                color: 0x636e72, metalness: 0.8, roughness: 0.3
            });
            const antenna = new THREE.Mesh(antGeo, antMat);
            antenna.position.set(0, 2.25, 0);
            this.player.add(antenna);
            const ballGeo = new THREE.SphereGeometry(0.05, 12, 12);
            const ballMat = new THREE.MeshStandardMaterial({
                color: 0xff4757, emissive: 0xff4757, emissiveIntensity: 0.8
            });
            const ball = new THREE.Mesh(ballGeo, ballMat);
            ball.position.set(0, 2.43, 0);
            this.player.add(ball);
        } else if (preset.hatType === 'cowboy') {
            const hatBrimGeo = new THREE.CylinderGeometry(0.5, 0.45, 0.04, 20);
            const hatMat = new THREE.MeshStandardMaterial({
                color: preset.hat, roughness: 0.7, metalness: 0.1
            });
            const hatBrim = new THREE.Mesh(hatBrimGeo, hatMat);
            hatBrim.position.y = 2.02;
            hatBrim.castShadow = true;
            this.player.add(hatBrim);
            const hatTopGeo = new THREE.CylinderGeometry(0.22, 0.3, 0.35, 20);
            const hatTop = new THREE.Mesh(hatTopGeo, hatMat);
            hatTop.position.y = 2.22;
            hatTop.castShadow = true;
            this.player.add(hatTop);
        }

        const limbMaterial = new THREE.MeshStandardMaterial({
            color: preset.bodyAccent, roughness: 0.5, metalness: 0.25
        });

        const shoulderGeo = new THREE.SphereGeometry(0.13, 10, 10);
        this.leftShoulder = new THREE.Mesh(shoulderGeo, limbMaterial);
        this.leftShoulder.position.set(-0.42, 1.38, 0);
        this.player.add(this.leftShoulder);
        this.rightShoulder = new THREE.Mesh(shoulderGeo, limbMaterial);
        this.rightShoulder.position.set(0.42, 1.38, 0);
        this.player.add(this.rightShoulder);

        this.leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), limbMaterial);
        this.leftArm.position.set(-0.42, 0.95, 0);
        this.leftArm.castShadow = true;
        this.player.add(this.leftArm);
        this.rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), limbMaterial);
        this.rightArm.position.set(0.42, 0.95, 0);
        this.rightArm.castShadow = true;
        this.player.add(this.rightArm);

        const handGeo = new THREE.SphereGeometry(0.1, 10, 10);
        const handMat = new THREE.MeshStandardMaterial({
            color: preset.skin, roughness: 0.6
        });
        this.leftHand = new THREE.Mesh(handGeo, handMat);
        this.leftHand.position.set(-0.42, 0.52, 0);
        this.player.add(this.leftHand);
        this.rightHand = new THREE.Mesh(handGeo, handMat);
        this.rightHand.position.set(0.42, 0.52, 0);
        this.player.add(this.rightHand);

        const hipGeo = new THREE.SphereGeometry(0.13, 10, 10);
        this.leftHip = new THREE.Mesh(hipGeo, limbMaterial);
        this.leftHip.position.set(-0.2, 0.55, 0);
        this.player.add(this.leftHip);
        this.rightHip = new THREE.Mesh(hipGeo, limbMaterial);
        this.rightHip.position.set(0.2, 0.55, 0);
        this.player.add(this.rightHip);

        this.leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.2), limbMaterial);
        this.leftLeg.position.set(-0.2, 0.1, 0);
        this.leftLeg.castShadow = true;
        this.player.add(this.leftLeg);
        this.rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.2), limbMaterial);
        this.rightLeg.position.set(0.2, 0.1, 0);
        this.rightLeg.castShadow = true;
        this.player.add(this.rightLeg);

        const shoeGeo = new THREE.BoxGeometry(0.24, 0.12, 0.34);
        const shoeMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a2e, roughness: 0.4, metalness: 0.5
        });
        this.leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
        this.leftShoe.position.set(-0.2, -0.33, 0.07);
        this.leftShoe.castShadow = true;
        this.player.add(this.leftShoe);
        this.rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
        this.rightShoe.position.set(0.2, -0.33, 0.07);
        this.rightShoe.castShadow = true;
        this.player.add(this.rightShoe);

        this.player.position.set(0, GROUND_Y, 0);
        this.player.rotation.y = Math.PI;
        this.scene.add(this.player);

        this.shieldMesh = null;
        this.speedTrail = [];
        this.magnetField = null;
        this.runTime = 0;
    }

    initEnvironment() {
        this.buildings = [];
        for (let i = 0; i < 50; i++) {
            const height = 4 + Math.random() * 14;
            const width = 2.5 + Math.random() * 4;
            const depth = 3 + Math.random() * 5;
            const geometry = new THREE.BoxGeometry(width, height, depth);
            const hue = 0.6 + Math.random() * 0.25;
            const material = new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(hue, 0.25, 0.15 + Math.random() * 0.12),
                roughness: 0.92,
                metalness: 0.08
            });
            const building = new THREE.Mesh(geometry, material);
            const side = Math.random() > 0.5 ? 1 : -1;
            building.position.set(
                side * (9 + Math.random() * 10),
                height / 2,
                -i * 7 - Math.random() * 5
            );
            building.castShadow = true;
            building.receiveShadow = true;

            const windowCount = Math.floor(height / 2);
            for (let w = 0; w < windowCount; w++) {
                const winGeo = new THREE.PlaneGeometry(width * 0.7, 0.3);
                const winColor = Math.random() > 0.4 ? 0xfeca57 : 0x1a1a2e;
                const winMat = new THREE.MeshBasicMaterial({
                    color: winColor,
                    transparent: true,
                    opacity: winColor === 0xfeca57 ? 0.85 : 0.3
                });
                const win = new THREE.Mesh(winGeo, winMat);
                win.position.set(0, -height / 2 + 1 + w * 2, depth / 2 + 0.01);
                building.add(win);
                const win2 = win.clone();
                win2.position.z = -depth / 2 - 0.01;
                win2.rotation.y = Math.PI;
                building.add(win2);
            }
            this.scene.add(building);
            this.buildings.push(building);
        }

        const starsGeometry = new THREE.BufferGeometry();
        const starCount = 800;
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 300;
            positions[i * 3 + 1] = 8 + Math.random() * 80;
            positions[i * 3 + 2] = -15 - Math.random() * 300;
            const c = new THREE.Color().setHSL(0.55 + Math.random() * 0.2, 0.5, 0.6 + Math.random() * 0.4);
            colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
        }
        starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const starsMaterial = new THREE.PointsMaterial({
            size: 0.4, sizeAttenuation: true, vertexColors: true,
            transparent: true, opacity: 0.9
        });
        this.stars = new THREE.Points(starsGeometry, starsMaterial);
        this.scene.add(this.stars);

        const moonGeo = new THREE.SphereGeometry(3, 32, 32);
        const moonMat = new THREE.MeshBasicMaterial({ color: 0xfef9c3 });
        const moon = new THREE.Mesh(moonGeo, moonMat);
        moon.position.set(-30, 40, -150);
        this.scene.add(moon);
        const moonGlowGeo = new THREE.SphereGeometry(4.5, 32, 32);
        const moonGlowMat = new THREE.MeshBasicMaterial({
            color: 0xfef9c3, transparent: true, opacity: 0.15
        });
        const moonGlow = new THREE.Mesh(moonGlowGeo, moonGlowMat);
        moonGlow.position.copy(moon.position);
        this.scene.add(moonGlow);
    }

    spawnObstacle() {
        const lane = Math.floor(Math.random() * 3);
        const types = ['box', 'tall', 'low', 'double'];
        const type = types[Math.floor(Math.random() * types.length)];
        let geometry, material, height, yPos, widthVal;

        if (type === 'box') {
            height = 1.3 + Math.random() * 0.4;
            widthVal = 1.5;
            geometry = new THREE.BoxGeometry(widthVal, height, 1.5);
            material = new THREE.MeshStandardMaterial({
                color: 0xff4757, roughness: 0.35, metalness: 0.55
            });
            yPos = height / 2;
        } else if (type === 'tall') {
            height = 2.6; widthVal = 1.0;
            geometry = new THREE.CylinderGeometry(0.5, 0.5, height, 10);
            material = new THREE.MeshStandardMaterial({
                color: 0xff6348, roughness: 0.4, metalness: 0.5
            });
            yPos = height / 2;
        } else if (type === 'low') {
            height = 0.7; widthVal = 1.9;
            geometry = new THREE.BoxGeometry(widthVal, height, 1.9);
            material = new THREE.MeshStandardMaterial({
                color: 0xff7979, roughness: 0.5, metalness: 0.4
            });
            yPos = height / 2;
        } else {
            height = 1.5; widthVal = 1.3;
            geometry = new THREE.BoxGeometry(widthVal, height, 1.3);
            material = new THREE.MeshStandardMaterial({
                color: 0xe8411d, roughness: 0.3, metalness: 0.6
            });
            yPos = height / 2;
        }

        const obstacle = new THREE.Mesh(geometry, material);
        obstacle.position.set(LANES[lane], yPos, -90);
        obstacle.castShadow = true; obstacle.receiveShadow = true;
        obstacle.userData = {
            type: 'obstacle', lane: lane, height: height, width: widthVal
        };

        const glowGeometry = geometry.clone();
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000, transparent: true, opacity: 0.12
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.scale.setScalar(1.12);
        obstacle.add(glow);

        const stripeGeo = new THREE.BoxGeometry(widthVal * 1.01, 0.08, 1.51);
        const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
        const stripe = new THREE.Mesh(stripeGeo, stripeMat);
        stripe.position.y = height / 2 - 0.2;
        obstacle.add(stripe);

        this.scene.add(obstacle);
        this.obstacles.push(obstacle);
    }

    spawnCoin() {
        const lane = Math.floor(Math.random() * 3);
        const yVariants = [1.0, 1.5, 2.0];
        const y = yVariants[Math.floor(Math.random() * yVariants.length)];
        const geometry = new THREE.TorusGeometry(0.32, 0.09, 10, 20);
        const material = new THREE.MeshStandardMaterial({
            color: 0xfeca57, roughness: 0.15, metalness: 0.95,
            emissive: 0xfeca57, emissiveIntensity: 0.35
        });
        const coin = new THREE.Mesh(geometry, material);
        coin.position.set(LANES[lane], y, -90);
        coin.rotation.y = Math.PI / 2;
        coin.castShadow = true;
        coin.userData = {
            type: 'coin', lane: lane, collected: false,
            baseY: y, bobPhase: Math.random() * Math.PI * 2
        };
        const light = new THREE.PointLight(0xfeca57, 0.6, 4);
        coin.add(light);
        this.scene.add(coin);
        this.coins3D.push(coin);
    }

    spawnPowerup() {
        const types = Object.values(POWERUP_TYPES);
        const pType = types[Math.floor(Math.random() * types.length)];
        const lane = Math.floor(Math.random() * 3);
        const group = new THREE.Group();

        const outerGeo = new THREE.OctahedronGeometry(0.5, 0);
        const outerMat = new THREE.MeshStandardMaterial({
            color: pType.color, roughness: 0.2, metalness: 0.8,
            emissive: pType.emissive, emissiveIntensity: 0.5,
            transparent: true, opacity: 0.9
        });
        const outer = new THREE.Mesh(outerGeo, outerMat);
        group.add(outer);

        const innerGeo = new THREE.OctahedronGeometry(0.3, 0);
        const innerMat = new THREE.MeshBasicMaterial({
            color: pType.color, transparent: true, opacity: 0.7
        });
        const inner = new THREE.Mesh(innerGeo, innerMat);
        group.add(inner);

        const ringGeo = new THREE.TorusGeometry(0.7, 0.03, 8, 24);
        const ringMat = new THREE.MeshBasicMaterial({
            color: pType.color, transparent: true, opacity: 0.5
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);

        const light = new THREE.PointLight(pType.color, 1.0, 5);
        group.add(light);

        group.position.set(LANES[lane], 1.5, -90);
        group.userData = {
            type: 'powerup', powerupType: pType.name,
            powerupData: pType, collected: false
        };
        this.scene.add(group);
        this.powerups3D.push(group);
    }

    initControls() {
        this.keys = {};
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (this.state === GameState.PLAYING) {
                if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.moveLeft();
                else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.moveRight();
                else if (e.code === 'ArrowUp' || e.code === 'Space' || e.code === 'KeyW') this.jump();
                else if (e.code === 'KeyP') this.pauseGame();
            } else if (this.state === GameState.PAUSED) {
                if (e.code === 'KeyP' || e.code === 'Escape') this.resumeGame();
            } else if (this.state === GameState.START) {
                if (e.code === 'Space' || e.code === 'Enter') this.startGame();
            } else if (this.state === GameState.GAMEOVER) {
                if (e.code === 'Space' || e.code === 'Enter') this.restartGame();
            }
        });
        window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

        let touchStartX = 0, touchStartY = 0;
        this.canvas.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        });
        this.canvas.addEventListener('touchend', (e) => {
            if (this.state !== GameState.PLAYING) return;
            const deltaX = e.changedTouches[0].clientX - touchStartX;
            const deltaY = e.changedTouches[0].clientY - touchStartY;
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                if (Math.abs(deltaX) > 30) deltaX > 0 ? this.moveRight() : this.moveLeft();
            } else if (deltaY < -30) {
                this.jump();
            }
        });
        this.canvas.addEventListener('click', () => {
            if (this.state === GameState.PLAYING || this.state === GameState.START) {
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

        document.querySelectorAll('.character-card').forEach((card) => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.character-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                this.selectedCharacter = parseInt(card.dataset.char, 10);
                localStorage.setItem('selectedCharacter', this.selectedCharacter.toString());
                this.initPlayer();
            });
        });
        const saved = document.querySelector(`.character-card[data-char="${this.selectedCharacter}"]`);
        if (saved) {
            document.querySelectorAll('.character-card').forEach(c => c.classList.remove('selected'));
            saved.classList.add('selected');
        }
    }

    startGame() {
        this.ensureAudio();
        this.state = GameState.PLAYING;
        this.score = 0; this.coins = 0;
        this.speed = this.baseSpeed; this.distance = 0;
        this.playerLane = 1; this.targetLaneX = 0;
        this.isJumping = false; this.playerY = PLAYER_HEIGHT; this.jumpVelocity = 0;
        this.spawnTimer = 0; this.coinSpawnTimer = 0; this.powerupSpawnTimer = 0;
        this.spawnInterval = 1.5;
        this.activePowerups = { speed: 0, magnet: 0, shield: 0 };

        this.initPlayer();
        this.clearObstacles(); this.clearCoins(); this.clearPowerups();
        this.updateScoreDisplay(); this.updateCoinDisplay(); this.updatePowerupHUD();

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
        this.playSound('hit'); this.playSound('gameover');
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

    moveLeft() { if (this.playerLane > 0) { this.playerLane--; this.targetLaneX = LANES[this.playerLane]; } }
    moveRight() { if (this.playerLane < 2) { this.playerLane++; this.targetLaneX = LANES[this.playerLane]; } }
    jump() {
        if (!this.isJumping) {
            this.isJumping = true;
            this.jumpVelocity = this.jumpForce;
            this.playSound('jump');
        }
    }

    clearObstacles() {
        this.obstacles.forEach(obs => {
            this.scene.remove(obs);
            obs.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
        });
        this.obstacles = [];
    }

    clearCoins() {
        this.coins3D.forEach(coin => {
            this.scene.remove(coin);
            coin.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
        });
        this.coins3D = [];
    }

    clearPowerups() {
        this.powerups3D.forEach(p => {
            this.scene.remove(p);
            p.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
        });
        this.powerups3D = [];
    }

    updateHighScoreDisplay() {
        document.getElementById('highscore').textContent = this.highScore;
        document.getElementById('start-highscore').textContent = this.highScore;
    }
    updateScoreDisplay() { document.getElementById('score').textContent = Math.floor(this.score); }
    updateCoinDisplay() { document.getElementById('coins').textContent = this.coins; }

    updatePowerupHUD() {
        const container = document.getElementById('powerup-status');
        let anyActive = false;
        ['speed', 'magnet', 'shield'].forEach(key => {
            const el = document.getElementById(`powerup-${key}`);
            const fill = document.getElementById(`${key}-fill`);
            const remaining = this.activePowerups[key];
            if (remaining > 0) {
                anyActive = true;
                el.style.display = 'flex';
                const pType = POWERUP_TYPES[key.toUpperCase()];
                const pct = Math.max(0, Math.min(100, (remaining / pType.duration) * 100));
                fill.style.width = pct + '%';
            } else {
                el.style.display = 'none';
            }
        });
        container.classList.toggle('hidden', !anyActive);
    }

    activatePowerup(type) {
        type = type.toLowerCase();
        const pType = POWERUP_TYPES[type.toUpperCase()];
        this.activePowerups[type] = pType.duration;
        this.playSound('powerup');
        this.updatePowerupHUD();

        if (type === 'shield') {
            if (this.shieldMesh) this.player.remove(this.shieldMesh);
            const shieldGeo = new THREE.SphereGeometry(1.2, 24, 24);
            const shieldMat = new THREE.MeshBasicMaterial({
                color: 0x00c9ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide
            });
            this.shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
            this.player.add(this.shieldMesh);
            this.shieldMesh.position.y = 1.0;
            const shieldEdge = new THREE.Mesh(
                new THREE.SphereGeometry(1.22, 24, 24),
                new THREE.MeshBasicMaterial({
                    color: 0x00c9ff, transparent: true, opacity: 0.6, wireframe: true
                })
            );
            shieldEdge.position.y = 1.0;
            this.shieldMesh.add(shieldEdge);
        }
        if (type === 'magnet') {
            if (this.magnetField) this.player.remove(this.magnetField);
            const fieldGeo = new THREE.TorusGeometry(pType.radius, 0.05, 8, 48);
            const fieldMat = new THREE.MeshBasicMaterial({
                color: 0xff3cac, transparent: true, opacity: 0.4
            });
            this.magnetField = new THREE.Mesh(fieldGeo, fieldMat);
            this.magnetField.rotation.x = Math.PI / 2;
            this.player.add(this.magnetField);
            this.magnetField.position.y = 1.0;
        }
    }

    updatePlayerAnimation(dt) {
        const speedMult = this.activePowerups.speed > 0 ? POWERUP_TYPES.SPEED.multiplier : 1;
        this.runTime += dt * this.speed * 0.15 * speedMult;
        const swing = Math.sin(this.runTime) * 0.55;
        const legSwing = Math.sin(this.runTime) * 0.85;

        this.leftArm.rotation.x = -swing;
        this.rightArm.rotation.x = swing;
        this.leftLeg.rotation.x = legSwing;
        this.rightLeg.rotation.x = -legSwing;
        this.body.position.y = 0.95 + Math.abs(Math.sin(this.runTime * 2)) * 0.06;
        if (this.leftShoulder) {
            this.leftShoulder.rotation.x = -swing * 0.3;
            this.rightShoulder.rotation.x = swing * 0.3;
        }
        if (this.isJumping) {
            this.leftArm.rotation.x = -1.6; this.rightArm.rotation.x = -1.6;
            this.leftLeg.rotation.x = -0.35; this.rightLeg.rotation.x = 0.35;
        }

        if (this.shieldMesh && this.activePowerups.shield > 0) this.shieldMesh.rotation.y += dt * 1.5;
        if (this.magnetField && this.activePowerups.magnet > 0) {
            this.magnetField.rotation.z += dt * 2;
            this.magnetField.scale.setScalar(1 + Math.sin(this.runTime * 3) * 0.08);
        }

        if (this.activePowerups.speed > 0) {
            if (this.speedTrail.length < 5) {
                const trailGeo = new THREE.BoxGeometry(0.8, 1.6, 0.5);
                const trailMat = new THREE.MeshBasicMaterial({
                    color: 0xff9500, transparent: true, opacity: 0.3
                });
                const trail = new THREE.Mesh(trailGeo, trailMat);
                this.player.add(trail);
                trail.position.z = 0.4;
                this.speedTrail.push(trail);
            }
            this.speedTrail.forEach((t, i) => {
                t.material.opacity = 0.25 - i * 0.04;
                t.position.z = 0.4 + i * 0.25;
                t.scale.setScalar(1 - i * 0.15);
            });
        } else if (this.speedTrail.length > 0) {
            this.speedTrail.forEach(t => this.player.remove(t));
            this.speedTrail = [];
        }
    }

    checkCollisions() {
        const playerX = this.player.position.x;
        const playerY = this.playerY;
        const playerZ = this.player.position.z;
        const playerRadius = 0.55;

        for (const obs of this.obstacles) {
            if (obs.position.z > 2.5 || obs.position.z < -2.5) continue;
            const dx = Math.abs(playerX - obs.position.x);
            const dz = Math.abs(playerZ - obs.position.z);
            const obsWidth = obs.userData.width / 2;
            const obsDepth = 0.8;
            if (dx < playerRadius + obsWidth && dz < playerRadius + obsDepth) {
                const playerBottom = playerY - PLAYER_HEIGHT / 2;
                const obsHeight = obs.userData.height;
                if (playerBottom < obsHeight - 0.2) {
                    if (this.activePowerups.shield > 0) {
                        this.activePowerups.shield = 0;
                        this.playSound('shieldBreak');
                        if (this.shieldMesh) { this.player.remove(this.shieldMesh); this.shieldMesh = null; }
                        obs.position.z = 100;
                        this.updatePowerupHUD();
                    } else {
                        this.gameOver();
                        return;
                    }
                }
            }
        }

        if (this.activePowerups.magnet > 0) {
            const magnetRadius = POWERUP_TYPES.MAGNET.radius;
            for (const coin of this.coins3D) {
                if (coin.userData.collected) continue;
                const dx = playerX - coin.position.x;
                const dz = playerZ - coin.position.z;
                const dy = playerY - coin.position.y;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist < magnetRadius) {
                    const pull = 1 - (dist / magnetRadius);
                    coin.position.x += dx * pull * 0.25;
                    coin.position.y += dy * pull * 0.2;
                    coin.position.z += dz * pull * 0.25;
                }
            }
        }

        for (const coin of this.coins3D) {
            if (coin.userData.collected) continue;
            if (coin.position.z > 4 || coin.position.z < -4) continue;
            const dx = Math.abs(playerX - coin.position.x);
            const dz = Math.abs(playerZ - coin.position.z);
            const dy = Math.abs(playerY - coin.position.y);
            const collectRadius = this.activePowerups.magnet > 0 ? 1.5 : 1.0;
            if (dx < collectRadius && dz < collectRadius && dy < collectRadius + 0.5) {
                coin.userData.collected = true;
                this.coins++; this.score += 10;
                this.playSound('coin');
                this.updateScoreDisplay(); this.updateCoinDisplay();
                this.animateCoinCollection(coin);
            }
        }

        for (const p of this.powerups3D) {
            if (p.userData.collected) continue;
            if (p.position.z > 4 || p.position.z < -4) continue;
            const dx = Math.abs(playerX - p.position.x);
            const dz = Math.abs(playerZ - p.position.z);
            const dy = Math.abs(playerY - p.position.y);
            if (dx < 1.2 && dz < 1.2 && dy < 1.8) {
                p.userData.collected = true;
                this.activatePowerup(p.userData.powerupType);
                this.animatePowerupCollection(p);
            }
        }
    }

    animateCoinCollection(coin) {
        const duration = 280;
        const startTime = performance.now();
        const startY = coin.position.y;
        const animate = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const scale = 1 - progress;
            coin.scale.setScalar(scale);
            coin.position.y = startY + progress * 1.5;
            coin.rotation.x += 0.3;
            if (progress < 1) requestAnimationFrame(animate);
            else this.scene.remove(coin);
        };
        animate();
    }

    animatePowerupCollection(p) {
        const duration = 400;
        const startTime = performance.now();
        const animate = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            p.scale.setScalar(1 + progress * 2);
            p.rotation.y += 0.4; p.rotation.x += 0.3;
            p.traverse(c => {
                if (c.material && c.material.opacity !== undefined) {
                    c.material.opacity = Math.max(0, 1 - progress);
                }
            });
            if (progress < 1) requestAnimationFrame(animate);
            else this.scene.remove(p);
        };
        animate();
    }

    update(dt) {
        if (this.state !== GameState.PLAYING) return;

        const baseProgressionSpeed = this.baseSpeed + this.distance * 0.0035;
        let currentSpeed = Math.min(this.maxSpeed, baseProgressionSpeed);
        if (this.activePowerups.speed > 0) currentSpeed *= POWERUP_TYPES.SPEED.multiplier;
        this.speed = currentSpeed;

        this.spawnInterval = Math.max(0.55, 1.5 - this.distance * 0.00035);
        this.coinSpawnInterval = Math.max(0.35, 0.8 - this.distance * 0.00012);
        this.powerupSpawnInterval = Math.max(6, 10 - this.distance * 0.0002);

        this.distance += this.speed * dt;
        this.score = this.distance * 0.5 + this.coins * 10;
        this.updateScoreDisplay();

        Object.keys(this.activePowerups).forEach(key => {
            if (this.activePowerups[key] > 0) {
                this.activePowerups[key] = Math.max(0, this.activePowerups[key] - dt);
                if (this.activePowerups[key] === 0) {
                    if (key === 'shield' && this.shieldMesh) {
                        this.player.remove(this.shieldMesh); this.shieldMesh = null;
                    }
                    if (key === 'magnet' && this.magnetField) {
                        this.player.remove(this.magnetField); this.magnetField = null;
                    }
                }
            }
        });
        this.updatePowerupHUD();

        const laneLerp = 1 - Math.pow(0.001, dt);
        this.player.position.x += (this.targetLaneX - this.player.position.x) * laneLerp;
        this.player.rotation.y = Math.PI + (this.targetLaneX - this.player.position.x) * -0.08;

        if (this.isJumping) {
            this.jumpVelocity += this.gravity * dt;
            this.playerY += this.jumpVelocity * dt;
            if (this.playerY <= PLAYER_HEIGHT) {
                this.playerY = PLAYER_HEIGHT;
                this.isJumping = false; this.jumpVelocity = 0;
            }
        }
        this.player.position.y = this.playerY - PLAYER_HEIGHT / 2;

        this.updatePlayerAnimation(dt);
        if (this.playerLight) this.playerLight.position.set(this.player.position.x, 4, this.player.position.z);

        this.spawnTimer += dt;
        if (this.spawnTimer >= this.spawnInterval) { this.spawnTimer = 0; this.spawnObstacle(); }

        this.coinSpawnTimer += dt;
        if (this.coinSpawnTimer >= this.coinSpawnInterval) {
            this.coinSpawnTimer = 0;
            const count = 1 + Math.floor(Math.random() * 3);
            for (let i = 0; i < count; i++) {
                setTimeout(() => { if (this.state === GameState.PLAYING) this.spawnCoin(); }, i * 150);
            }
        }

        this.powerupSpawnTimer += dt;
        if (this.powerupSpawnTimer >= this.powerupSpawnInterval) {
            this.powerupSpawnTimer = 0; this.spawnPowerup();
        }

        const moveSpeed = this.speed * dt;

        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obs = this.obstacles[i];
            obs.position.z += moveSpeed; obs.rotation.y += dt * 0.5;
            if (obs.position.z > 18) {
                this.scene.remove(obs);
                obs.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
                this.obstacles.splice(i, 1);
            }
        }

        const coinTime = performance.now() / 1000;
        for (let i = this.coins3D.length - 1; i >= 0; i--) {
            const coin = this.coins3D[i];
            if (!coin.userData.collected) {
                coin.position.z += moveSpeed; coin.rotation.x += dt * 4;
                coin.position.y = coin.userData.baseY + Math.sin(coinTime * 2 + coin.userData.bobPhase) * 0.15;
            }
            if (coin.position.z > 18) {
                this.scene.remove(coin);
                coin.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
                this.coins3D.splice(i, 1);
            }
        }

        for (let i = this.powerups3D.length - 1; i >= 0; i--) {
            const p = this.powerups3D[i];
            if (!p.userData.collected) {
                p.position.z += moveSpeed; p.rotation.y += dt * 2;
                p.position.y = 1.5 + Math.sin(coinTime * 2.5) * 0.2;
            }
            if (p.position.z > 18) {
                this.scene.remove(p);
                p.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
                this.powerups3D.splice(i, 1);
            }
        }

        this.groundSegments.forEach(seg => {
            seg.position.z += moveSpeed;
            if (seg.position.z > TRACK_LENGTH / 4 + 20) seg.position.z -= (TRACK_LENGTH / 2) * 4;
        });
        this.neonLines.forEach(line => {
            line.position.z += moveSpeed;
            if (line.position.z > TRACK_LENGTH / 4 + 20) line.position.z -= (TRACK_LENGTH / 2) * 4;
        });
        this.buildings.forEach(building => {
            building.position.z += moveSpeed * 0.5;
            if (building.position.z > 25) {
                building.position.z -= 350;
                const height = 4 + Math.random() * 14;
                building.position.y = height / 2;
            }
        });
        if (this.stars) this.stars.rotation.y += dt * 0.005;

        const cameraTargetX = this.player.position.x * 0.45;
        const cameraTargetY = this.isJumping ? 6 : 5.5;
        const cameraLerp = 1 - Math.pow(0.01, dt);
        this.camera.position.x += (cameraTargetX - this.camera.position.x) * cameraLerp;
        this.camera.position.y += (cameraTargetY - this.camera.position.y) * cameraLerp;
        this.camera.lookAt(this.player.position.x * 0.25, 2.2, -14);

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
    window.game = new EndlessRunnerGame();
});
