import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { Speedometer } from './speedometer.js';
import { AnalogSpeedometer } from './analog-speedometer.js';
import io from 'socket.io-client';

// Add leaderboard HTML
const leaderboardHTML = `
<div id="leaderboard" class="leaderboard">
    <div class="leaderboard-header">
        <h3>Players</h3>
    </div>
    <div class="leaderboard-content">
        <div class="player-list">
            <!-- Player entries will be added here dynamically -->
        </div>
    </div>
</div>
`;

// Add leaderboard CSS
const leaderboardStyles = `
.leaderboard {
    position: fixed;
    top: 20px;
    right: 20px;
    width: 200px;
    background: rgba(0, 0, 0, 0.7);
    border-radius: 12px;
    backdrop-filter: blur(10px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    font-family: 'Arial', sans-serif;
    z-index: 1000;
}

.leaderboard-header {
    background: rgba(255, 255, 255, 0.1);
    padding: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.leaderboard-header h3 {
    margin: 0;
    color: #fff;
    font-size: 16px;
    font-weight: 600;
    text-align: center;
}

.leaderboard-content {
    padding: 8px;
    max-height: 300px;
    overflow-y: auto;
}

.player-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.player-entry {
    display: flex;
    align-items: center;
    padding: 8px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    transition: background 0.2s ease;
}

.player-entry:hover {
    background: rgba(255, 255, 255, 0.1);
}

.player-username {
    color: #fff;
    font-size: 14px;
    font-weight: 500;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Custom scrollbar for leaderboard */
.leaderboard-content::-webkit-scrollbar {
    width: 6px;
}

.leaderboard-content::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
}

.leaderboard-content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
}

.leaderboard-content::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}

/* Add minimap styles */
#miniMap {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 200px;
    height: 200px;
    background: rgba(0, 0, 0, 0.5);
    border: 2px solid #000;
    border-radius: 8px;
    overflow: hidden;
    z-index: 1000;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
}

#miniMapCanvas {
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.3);
}

.player-marker {
    position: absolute;
    width: 8px;
    height: 8px;
    background: #ff0000;
    border: 2px solid #fff;
    border-radius: 50%;
    transform: translate(-50%, -50%);
}

.player-name {
    position: absolute;
    color: #fff;
    font-size: 12px;
    font-weight: bold;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
    transform: translate(-50%, -100%);
    margin-top: -8px;
    white-space: nowrap;
}

/* Add speedometer styles */
.speedometer {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
}

.speedometer.hidden {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
}

.speedometer.visible {
    display: flex !important; /* Only show when game starts */
}
`;

// Add styles to document
const styleSheet = document.createElement("style");
styleSheet.textContent = leaderboardStyles;
document.head.appendChild(styleSheet);

// Add leaderboard to document
document.body.insertAdjacentHTML('beforeend', leaderboardHTML);

// Game state
let scene, camera, renderer, controls;
let car, terrain;
let isPaused = false;
let isMenuOpen = false;
let weatherState = 'sunny';
let weatherTimer = 0;
let carModels = [];
let currentCarIndex = 0;
let currentCameraView = 0; // 0 = third-person, 1 = fixed
let orbitControls;
let carWheels = {
    frontLeft: null,
    frontRight: null,
    rearLeft: null,
    rearRight: null
};
let speedometer; // Add speedometer instance

// Car physics
const carMaxSpeed = 69.44; // 250 km/h in m/s (250 / 3.6)
const baseAcceleration = 10.0; // m/s² (increased to achieve 0-100 km/h in 3.7s)
const carDeceleration = 5.0; // m/s² (reduced from 6.0 for slightly less braking)
const speedDependentBraking = true; // Enable speed-dependent braking
const carRotationSpeed = 0.03;
const wheelRadius = 0.3; // Approximate wheel radius in meters

// Reverse driving parameters
const reverseMaxSpeed = 9.72; // 35 km/h in m/s (35 / 3.6) - Increased from 24 km/h
const reverseAcceleration = 5.0; // m/s² (significantly increased for sports car-like reverse acceleration)
let carVelocity = new THREE.Vector3();
let carDirection = new THREE.Vector3(0, 0, 1);
let currentSpeed = 0;

// Gear system
const GEARS = ['R', 'N', '1', '2', '3', '4', '5', '6'];
let currentGearIndex = 1; // Start in Neutral
let currentGear = GEARS[currentGearIndex];
let gearShiftCooldown = 0;
const GEAR_SHIFT_DELAY = 0.5; // seconds

// Gear-specific parameters
const gearSpeedRanges = {
    '1': { min: 0, max: 50 },    // 1st gear: 0-50 km/h
    '2': { min: 20, max: 90 },   // 2nd gear: 20-90 km/h
    '3': { min: 40, max: 130 },  // 3rd gear: 40-130 km/h
    '4': { min: 60, max: 170 },  // 4th gear: 60-170 km/h
    '5': { min: 80, max: 210 },  // 5th gear: 80-210 km/h
    '6': { min: 100, max: 250 }  // 6th gear: 100-250 km/h
};

// Engine braking parameters
const engineBrakingStrength = 0.3; // Further reduced for more gradual deceleration
const engineBrakingDelay = 0.1; // Delay before engine braking takes effect (seconds)
let engineBrakingActive = false;
let engineBrakingTargetSpeed = 0;
let engineBrakingStartTime = 0;
let engineBrakingInitialSpeed = 0;

// Speed conversion
const MS_TO_KMH = 3.6;

// Update camera-related constants
const CAMERA_SETTINGS = {
    minDistance: 15,
    maxDistance: 20,
    height: 7,
    smoothing: {
        position: 0.08,  // Increased from 0.05 for smoother movement
        rotation: 0.05,  // Increased from 0.03 for smoother rotation
        pitch: 0.03      // Increased from 0.02 for smoother pitch changes
    },
    collisionOffset: 2,
    lookAhead: 3,
    rearOffset: new THREE.Vector3(0, 0, 1),
    lookAtHeight: 0.8,
    pitchAngle: 0.25,
    freecam: {
        moveSpeed: 10,
        lookSpeed: 0.002,
        verticalSpeed: 5
    },
    shake: {
        maxPositionOffset: 0.2,    // Increased from 0.15 for more movement
        maxRotationOffset: 0.03,   // Increased from 0.02 for more rotation
        frequency: 0.1,            // Increased from 0.08 for smoother oscillation
        speedThreshold: 20,        // Lowered from 30 to start shake earlier
        maxSpeed: 250
    }
};

// Add these variables at the top with other game state variables
let currentCameraMode = 'thirdPerson'; // 'thirdPerson', 'fixed', or 'freecam'
let freecamSpeed = 30;
let freecamBoostSpeed = 60;
let cameraSmoothing = 0.15;  // Increased from 0.1 for smoother transitions
let targetCameraOffset = new THREE.Vector3(0, 8, 18);
let currentCameraOffset = new THREE.Vector3(0, 8, 18);
let cameraLookAhead = 3;
let fixedCameraDistance = 18; // Fixed distance from car
let currentSideOffset = 0;
let sideOffsetSmoothing = 0.08;  // Increased from 0.05 for smoother side movement
const SPEED_THRESHOLD = 50; // Speed threshold in km/h for fixed camera distance

// Update the cameraViews object
const cameraViews = {
    thirdPerson: {
        offset: new THREE.Vector3(0, 8, 18), // Increased base distance
        lookAtOffset: new THREE.Vector3(0, 4, 0) // Keep downward angle
    },
    fixed: {
        basePosition: new THREE.Vector3(0, 20, 50),
        minDistance: 30,
        maxDistance: 100,
        target: new THREE.Vector3(0, 0, 0)
    }
};

// DOM elements
const menu = document.getElementById('menu');
const resumeBtn = document.getElementById('resume');
const controlsBtn = document.getElementById('controlsBtn');
const settingsBtn = document.getElementById('settingsBtn');
const exitBtn = document.getElementById('exit');
const controlsDiv = document.getElementById('controls');
const settingsDiv = document.getElementById('settings');
const resolutionSlider = document.getElementById('resolution');
const volumeSlider = document.getElementById('volume');
const fullscreenCheckbox = document.getElementById('fullscreen');

// Add these new variables at the top with other game state variables
let cameraTargetRotation = new THREE.Quaternion();
let cameraCurrentRotation = new THREE.Quaternion();
let mouseLookEnabled = false;
let autoReturnTimer = 0;

// Add to game state variables
let isFreecam = false;
let freecamControls = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false
};
let shakeTime = 0;
let lastCameraPosition = new THREE.Vector3();
let lastCameraRotation = new THREE.Euler();

// Add these variables at the top with other game state variables
let isGameStarted = false;
let startMenu = document.getElementById('startMenu');
let playButton = document.getElementById('playButton');
let exitButton = document.getElementById('exitButton');
let loadingScreen = document.getElementById('loadingScreen');

// Add these variables at the top with other game state variables
let playerUsername = 'Player';
let miniMap;
let miniMapCanvas;
let miniMapCtx;
let playerMarker;
let playerNameLabel;

// Add these variables at the top with other game state variables
let sunAngle = 0; // Current sun angle (in radians)
let sunHeight = 50; // Height of the sun
let shadowUpdateTime = 0;
const SHADOW_UPDATE_INTERVAL = 0.1; // Update shadows every 0.1 seconds

// Add these variables at the top with other game state variables
let isMouseLooking = false;
let lastMouseX = 0;
let lastMouseY = 0;
const mouseSensitivity = 0.002;

// Add these variables at the top with other game state variables
let players = new Map(); // Store all players in the game
let leaderboardElement = document.querySelector('.player-list');

// Add these variables at the top with other game state variables
let speedometerInitialized = false;

// Add these variables at the top with other game state variables
let mouseLookAngle = 0;
let targetMouseLookAngle = 0;
const MAX_MOUSE_LOOK_ANGLE = Math.PI / 3; // 60 degrees maximum look angle
const MOUSE_LOOK_SENSITIVITY = 0.002;
const AUTO_RETURN_SPEED = 0.05; // Speed at which camera returns to center
let lastMouseMoveTime = 0;
const AUTO_RETURN_DELAY = 2000; // 2 seconds before auto-return starts

// Add these variables at the top with other game state variables
let isMouseLocked = false;

// Add these variables at the top with other game state variables
let initialPosition = null; // Store initial position
let initialRotation = null; // Store initial rotation

// Add this variable at the top with other game state variables
let isGameStarting = false;

// Add these variables at the top with other game state variables
let chatInput = document.getElementById('chatInput');
let chatMessages = document.getElementById('chatMessages');
let chatContainer = document.getElementById('chatContainer');

// Initialize chat as hidden
chatContainer.style.display = 'none';

// Add this function to update the leaderboard display
function updateLeaderboard() {
    if (!leaderboardElement) return;
    
    // Clear current player list
    leaderboardElement.innerHTML = '';
    
    // Add each player to the leaderboard
    players.forEach((player, username) => {
        const playerEntry = document.createElement('div');
        playerEntry.className = 'player-entry';
        
        const usernameElement = document.createElement('p');
        usernameElement.className = 'player-username';
        usernameElement.textContent = username;
        
        playerEntry.appendChild(usernameElement);
        leaderboardElement.appendChild(playerEntry);
    });
}

// Add this function to generate a unique player number
function generatePlayerNumber() {
    let number = 1;
    let username = `Player${number.toString().padStart(3, '0')}`;
    
    // Keep incrementing until we find an unused number
    while (players.has(username)) {
        number++;
        username = `Player${number.toString().padStart(3, '0')}`;
    }
    
    return username;
}

// Modify the init function to handle the loading screen
function init() {
    // Create scene
    scene = new THREE.Scene();

    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);

    // Create renderer with performance optimizations
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        powerPreference: "high-performance",
        precision: "mediump"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(window.devicePixelRatio * 0.75);
    document.body.appendChild(renderer.domElement);

    // Create orbit controls
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.enabled = false;

    // Create terrain
    createTerrain();

    // Create skybox
    createSkybox();

    // Load car model
    loadCarModel();

    // Setup lighting
    setupLighting();

    // Setup post-processing
    setupPostProcessing();

    // Setup event listeners
    setupEventListeners();

    // Initialize speedometer but keep it hidden
    if (!speedometerInitialized) {
        speedometer = new AnalogSpeedometer();
        speedometerInitialized = true;
    }

    // Initialize mini map
    miniMap = document.getElementById('miniMap');
    miniMapCanvas = document.getElementById('miniMapCanvas');
    miniMapCtx = miniMapCanvas.getContext('2d');
    playerMarker = document.querySelector('.player-marker');
    playerNameLabel = document.querySelector('.player-name');

    // Set canvas size
    miniMapCanvas.width = 200;
    miniMapCanvas.height = 200;

    // Show loading screen for 6 seconds
    setTimeout(() => {
        loadingScreen.style.display = 'none';
        startMenu.style.display = 'flex';
    }, 6000);

    // Setup start menu event listeners
    playButton.addEventListener('click', () => {
        // Prevent multiple clicks
        if (isGameStarting) return;
        isGameStarting = true;
        
        // Disable the play button
        playButton.disabled = true;
        playButton.style.opacity = '0.5';
        playButton.style.cursor = 'not-allowed';
        
        // Get the username input
        const usernameInput = document.getElementById('username');
        
        // Set player username
        if (usernameInput && usernameInput.value.trim()) {
            playerUsername = usernameInput.value.trim().substring(0, 16);
        } else {
            // Generate a unique player number if no username provided
            playerUsername = generatePlayerNumber();
        }
        
        // Update player name label
        playerNameLabel.textContent = playerUsername;
        
        // Add player to the players map
        players.set(playerUsername, {
            position: new THREE.Vector3(),
            rotation: new THREE.Quaternion()
        });
        
        // Update leaderboard
        updateLeaderboard();

        // Show transition overlay
        const transitionOverlay = document.getElementById('transitionOverlay');
        transitionOverlay.classList.add('visible');
        
        // First step: Fade to solid black
        startMenu.classList.add('fade-to-black');
        
        // Second step: Fade out after the first transition completes
        setTimeout(() => {
            startMenu.classList.add('fade-out');
            
            // Final step: Hide menu and start game after fade completes
            setTimeout(() => {
                startMenu.style.display = 'none';
                isGameStarted = true;
                isPaused = false;
                
                // Show chat, speedometer and mini map after all fades complete
                chatContainer.style.display = 'block';
                if (speedometer) {
                    speedometer.show();
                }
                miniMap.style.display = 'block';
                
                // Lock the mouse pointer
                document.body.requestPointerLock();
                
                // Hide transition overlay after game starts
                setTimeout(() => {
                    transitionOverlay.classList.remove('visible');
                }, 500);
                
                animate();
            }, 1000);
        }, 1000);
    });

    exitButton.addEventListener('click', () => {
        // Add fade-out class to start menu
        startMenu.classList.add('fade-out');
        
        // Wait for fade animation to complete before closing
        setTimeout(() => {
            window.close();
        }, 1000); // Match this with the CSS transition duration
    });

    // Add event listener for Enter key in username input
    document.getElementById('username').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('playButton').click();
        }
    });

    // Store initial position and rotation
    initialPosition = new THREE.Vector3();
    initialRotation = new THREE.Quaternion();
    car.getWorldPosition(initialPosition);
    car.getWorldQuaternion(initialRotation);

    // Add R key event listener
    document.addEventListener('keydown', (event) => {
        if (event.key.toLowerCase() === 'r') {
            resetPlayerPosition();
        }
    });

    // Don't start the animation loop yet
}

function createTerrain() {
    console.log('Creating terrain...');
    
    // Create a much larger flat plane for the terrain
    const geometry = new THREE.PlaneGeometry(5000, 5000, 100, 100);
    
    // Create texture loader with loading manager for debugging
    const loadingManager = new THREE.LoadingManager();
    loadingManager.onLoad = () => console.log('All textures loaded successfully');
    loadingManager.onError = (url) => console.error('Error loading texture:', url);
    
    const textureLoader = new THREE.TextureLoader(loadingManager);
    
    // Create material first
    const material = new THREE.MeshStandardMaterial({
        roughness: 0.8,
        metalness: 0.2,
        side: THREE.DoubleSide
    });
    
    // Load diffuse map
    textureLoader.load(
        '/textures/rocky_terrain_diff_4k.png',
        (texture) => {
            console.log('Diffuse texture loaded:', texture);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(100, 100);
            material.map = texture;
            material.needsUpdate = true;
        },
        (xhr) => {
            console.log('Diffuse loading progress:', (xhr.loaded / xhr.total * 100) + '%');
        },
        (error) => {
            console.error('Error loading diffuse map:', error);
        }
    );

    // Load normal map
    textureLoader.load(
        '/textures/rocky_terrain_nor_dx_4k.png',
        (texture) => {
            console.log('Normal texture loaded:', texture);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(100, 100);
            material.normalMap = texture;
            material.needsUpdate = true;
        },
        (xhr) => {
            console.log('Normal loading progress:', (xhr.loaded / xhr.total * 100) + '%');
        },
        (error) => {
            console.error('Error loading normal map:', error);
        }
    );

    // Load roughness map
    textureLoader.load(
        '/textures/rocky_terrain_rough_4k.png',
        (texture) => {
            console.log('Roughness texture loaded:', texture);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(100, 100);
            material.roughnessMap = texture;
            material.needsUpdate = true;
        },
        (xhr) => {
            console.log('Roughness loading progress:', (xhr.loaded / xhr.total * 100) + '%');
        },
        (error) => {
            console.error('Error loading roughness map:', error);
        }
    );

    // Load AO map
    textureLoader.load(
        '/textures/rocky_terrain_ao_4k.png',
        (texture) => {
            console.log('AO texture loaded:', texture);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(100, 100);
            material.aoMap = texture;
            material.needsUpdate = true;
        },
        (xhr) => {
            console.log('AO loading progress:', (xhr.loaded / xhr.total * 100) + '%');
        },
        (error) => {
            console.error('Error loading AO map:', error);
        }
    );
    
    // Add UV2 for ambient occlusion
    geometry.setAttribute('uv2', new THREE.Float32BufferAttribute(geometry.attributes.uv.array, 2));
    
    terrain = new THREE.Mesh(geometry, material);
    terrain.rotation.x = -Math.PI / 2;
    terrain.receiveShadow = true;
    terrain.castShadow = true;
    scene.add(terrain);
    
    console.log('Terrain created with shadow receiving enabled');
}

function createSkybox() {
    // Load the 8K HDR environment map with optimized settings
    const rgbeLoader = new RGBELoader();
    rgbeLoader.setPath('/textures/');
    
    // Create a lower resolution version for initial loading
    const tempTexture = new THREE.DataTexture(
        new Uint8Array([255, 255, 255, 255]),
        1,
        1,
        THREE.RGBAFormat
    );
    scene.background = tempTexture;
    
    // Load the full resolution texture in the background
    rgbeLoader.load('bambanani_sunset_8k.hdr', (texture) => {
        // Optimize the texture
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = texture;
        scene.environment = texture;
    });
    
    // Set up optimized lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
}

function loadCarModel() {
    console.log('Starting to load car model...');
    const loader = new GLTFLoader();
    
    // Add loading manager for better error handling
    const loadingManager = new THREE.LoadingManager();
    loadingManager.onError = (url) => {
        console.error('Error loading:', url);
    };
    
    loader.setPath('/models/');
    
    loader.load(
        'car.glb',
        (gltf) => {
            console.log('Car model loaded successfully');
            car = gltf.scene;
            
            // Enable shadows for the entire car model
            car.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // Set initial rotation
            car.rotation.set(0, 0, 0);
            car.scale.set(2, 2, 2);
            car.position.set(0, 0, 0);
            car.castShadow = true;
            car.receiveShadow = true;
            
            scene.add(car);

            // Set up car physics
            car.userData.velocity = new THREE.Vector3();
            car.userData.direction = new THREE.Vector3(0, 0, 1);
            
            // Add R key event listener after car is loaded
            document.addEventListener('keydown', (event) => {
                if (event.key.toLowerCase() === 'r') {
                    resetPlayerPosition();
                }
            });
            
            console.log('Car model setup complete with shadow casting enabled');
        },
        // Progress callback
        (xhr) => {
            console.log('Loading progress:', (xhr.loaded / xhr.total * 100) + '%');
        },
        // Error callback
        (error) => {
            console.error('Error loading car model:', error);
            createBasicCar();
        }
    );
}

function createBasicCar() {
    const geometry = new THREE.BoxGeometry(2, 1, 4);
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    car = new THREE.Mesh(geometry, material);
    car.position.set(0, 0, 0); // Position basic car higher as well
    car.scale.set(2, 2, 2); // Scale up basic car
    car.castShadow = true;
    scene.add(car);
}

function updateWheelRotation() {
    if (!car) return;

    // Calculate wheel rotation based on speed
    const wheelRotationSpeed = currentSpeed / wheelRadius; // radians per second
    const rotationAngle = wheelRotationSpeed * 0.016; // Multiply by delta time (assuming 60 FPS)

    // Debug wheel rotation
    console.log('=== WHEEL ROTATION UPDATE ===', {
        speed: currentSpeed,
        rotationAngle: rotationAngle
    });

    // Try rotating wheels around their local X axis
    Object.entries(carWheels).forEach(([position, wheel]) => {
        if (wheel) {
            // Store original rotation
            const originalRotation = wheel.rotation.clone();
            
            // Reset rotation
            wheel.rotation.set(0, 0, 0);
            
            // Apply new rotation
            wheel.rotation.x = originalRotation.x + rotationAngle;
            wheel.rotation.y = originalRotation.y;
            wheel.rotation.z = originalRotation.z;
            
            console.log(`=== ${position} WHEEL ROTATION ===`, {
                original: originalRotation,
                new: wheel.rotation
            });
        }
    });

    // Add steering rotation to front wheels
    if (carWheels.frontLeft && carWheels.frontRight) {
        const keys = window.keys || {};
        const left = keys['a'] || keys['A'];
        const right = keys['d'] || keys['D'];
        
        const maxSteeringAngle = Math.PI / 6; // 30 degrees
        const steeringSpeed = 0.1;
        
        if (left) {
            carWheels.frontLeft.rotation.y = Math.min(carWheels.frontLeft.rotation.y + steeringSpeed, maxSteeringAngle);
            carWheels.frontRight.rotation.y = Math.min(carWheels.frontRight.rotation.y + steeringSpeed, maxSteeringAngle);
        } else if (right) {
            carWheels.frontLeft.rotation.y = Math.max(carWheels.frontLeft.rotation.y - steeringSpeed, -maxSteeringAngle);
            carWheels.frontRight.rotation.y = Math.max(carWheels.frontRight.rotation.y - steeringSpeed, -maxSteeringAngle);
        } else {
            // Return wheels to center position
            carWheels.frontLeft.rotation.y *= 0.9;
            carWheels.frontRight.rotation.y *= 0.9;
        }
    }
}

function updateCarMovement() {
    if (!car) return;

    const keys = window.keys || {};
    const forward = keys['w'] || keys['W'];
    const backward = keys['s'] || keys['S'];
    const left = keys['a'] || keys['A'];
    const right = keys['d'] || keys['D'];
    const shiftUp = keys['e'] || keys['E'];
    const shiftDown = keys['q'] || keys['Q'];

    // Handle gear shifting
    if (gearShiftCooldown <= 0) {
        if (shiftUp && currentGearIndex < GEARS.length - 1) {
            // Allow shifting up from any gear when stopped
            if (Math.abs(currentSpeed) < 0.1 || currentGearIndex < 2) {
            currentGearIndex++;
            currentGear = GEARS[currentGearIndex];
            gearShiftCooldown = GEAR_SHIFT_DELAY;
            } else {
                const newGearIndex = currentGearIndex + 1;
                const newGear = GEARS[newGearIndex];
                const currentSpeedKmh = Math.abs(currentSpeed) * 3.6;
                
                // Check if new gear's maximum speed is lower than current speed
                if (currentSpeedKmh > gearSpeedRanges[newGear].max) {
                    // Activate engine braking
                    engineBrakingActive = true;
                    engineBrakingTargetSpeed = gearSpeedRanges[newGear].max / 3.6; // Convert to m/s
                    engineBrakingInitialSpeed = Math.abs(currentSpeed);
                    engineBrakingStartTime = Date.now();
                }
                
                currentGearIndex = newGearIndex;
                currentGear = newGear;
                gearShiftCooldown = GEAR_SHIFT_DELAY;
            }
        } else if (shiftDown && currentGearIndex > 0) {
            // Allow shifting down to neutral or reverse when stopped
            if (Math.abs(currentSpeed) < 0.1 || currentGearIndex <= 2) {
            currentGearIndex--;
            currentGear = GEARS[currentGearIndex];
            gearShiftCooldown = GEAR_SHIFT_DELAY;
            } else {
                const newGearIndex = currentGearIndex - 1;
                const newGear = GEARS[newGearIndex];
                const currentSpeedKmh = Math.abs(currentSpeed) * 3.6;
                
                // Check if new gear's maximum speed is lower than current speed
                if (currentSpeedKmh > gearSpeedRanges[newGear].max) {
                    // Activate engine braking
                    engineBrakingActive = true;
                    engineBrakingTargetSpeed = gearSpeedRanges[newGear].max / 3.6; // Convert to m/s
                    engineBrakingInitialSpeed = Math.abs(currentSpeed);
                    engineBrakingStartTime = Date.now();
                }
                
                currentGearIndex = newGearIndex;
                currentGear = newGear;
                gearShiftCooldown = GEAR_SHIFT_DELAY;
            }
        }
    } else {
        gearShiftCooldown -= 0.016; // Assuming 60 FPS
    }

    // Apply engine braking if active
    if (engineBrakingActive) {
        const timeSinceBrakingStart = (Date.now() - engineBrakingStartTime) / 1000;
        
        if (timeSinceBrakingStart >= engineBrakingDelay) {
            const speedDifference = Math.abs(currentSpeed) - engineBrakingTargetSpeed;
            
            if (speedDifference > 0) {
                // Calculate a smooth deceleration curve
                const totalDecelerationTime = 3.0; // Total time to reach target speed (in seconds)
                const progress = Math.min(timeSinceBrakingStart / totalDecelerationTime, 1);
                
                // Use a smooth easing function for more natural deceleration
                const easeOutCubic = 1 - Math.pow(1 - progress, 3);
                
                // Calculate target speed for this frame
                const currentTargetSpeed = engineBrakingInitialSpeed - 
                    (engineBrakingInitialSpeed - engineBrakingTargetSpeed) * easeOutCubic;
                
                // Apply gradual speed reduction
                const deceleration = engineBrakingStrength * (1 + progress); // Increase deceleration over time
                
                if (currentSpeed > 0) {
                    currentSpeed = Math.max(currentTargetSpeed, currentSpeed - deceleration * 0.016);
                } else {
                    currentSpeed = Math.min(-currentTargetSpeed, currentSpeed + deceleration * 0.016);
                }
            } else {
                // Deactivate engine braking when target speed is reached
                engineBrakingActive = false;
            }
        }
    }

    // Update car direction
    if (Math.abs(currentSpeed) > 0.1) { // Only allow turning when moving
        // Calculate speed-dependent turning sensitivity
        const speedKmh = Math.abs(currentSpeed) * 3.6; // Convert to km/h
        const maxTurnSpeed = 0.03; // Maximum turning speed at low speeds
        const minTurnSpeed = 0.005; // Minimum turning speed at high speeds
        
        // Reduce turning sensitivity as speed increases
        let turnSpeed = THREE.MathUtils.lerp(
            maxTurnSpeed,
            minTurnSpeed,
            Math.min(speedKmh / 100, 1) // Gradually reduce turning up to 100 km/h
        );
        
        if (left) car.rotation.y += turnSpeed;
        if (right) car.rotation.y -= turnSpeed;
    }

    // Calculate acceleration/deceleration based on gear
    let maxSpeedForGear = carMaxSpeed;
    if (currentGear === 'R') {
        maxSpeedForGear = -reverseMaxSpeed; // Use dedicated reverse speed limit
    } else if (currentGear === 'N') {
        maxSpeedForGear = 0; // Can't accelerate in neutral
    } else {
        // Scale max speed based on gear with non-linear progression
        const gearNumber = parseInt(currentGear);
        const gearRatios = {
            1: 0.2,  // 50 km/h
            2: 0.35, // 87.5 km/h
            3: 0.5,  // 125 km/h
            4: 0.7,  // 175 km/h
            5: 0.85, // 212.5 km/h
            6: 1.0   // 250 km/h
        };
        maxSpeedForGear = carMaxSpeed * gearRatios[gearNumber];
    }

    // Handle movement based on gear
    if (currentGear === 'R') {
        // Reverse gear behavior with realistic acceleration
        if (forward) {
            // Calculate speed-dependent acceleration in reverse
            const reverseSpeedRatio = Math.abs(currentSpeed) / reverseMaxSpeed;
            // Use a less aggressive reduction curve for better acceleration
            const reverseAccelerationCurve = Math.pow(1 - reverseSpeedRatio, 1.1);
            
            // Accelerate in reverse with more responsive acceleration
            currentSpeed = Math.max(currentSpeed - (reverseAcceleration * reverseAccelerationCurve * 0.016), -reverseMaxSpeed);
        } else if (backward) {
            // Brake in reverse
            const effectiveDeceleration = speedDependentBraking 
                ? carDeceleration * (1 + Math.abs(currentSpeed) / reverseMaxSpeed)
                : carDeceleration;
            currentSpeed = Math.min(currentSpeed + effectiveDeceleration * 0.016, 0);
        } else {
            // Coast in reverse
            if (currentSpeed < 0) {
                currentSpeed = Math.min(currentSpeed + carDeceleration * 0.1 * 0.016, 0);
            }
        }
    } else if (currentGear === 'N') {
        // Neutral gear behavior
        if (currentSpeed > 0) {
            currentSpeed = Math.max(0, currentSpeed - carDeceleration * 0.1);
        } else if (currentSpeed < 0) {
            currentSpeed = Math.min(0, currentSpeed + carDeceleration * 0.1);
        }
    } else {
        // Forward gears behavior
        if (forward) {
            const speedKmh = Math.abs(currentSpeed) * 3.6; // Convert to km/h
            const gearNumber = parseInt(currentGear);
            
            // Calculate gear efficiency based on current speed
            let gearEfficiency = 1.0;
            if (gearNumber >= 1 && gearNumber <= 6) {
                const range = gearSpeedRanges[currentGear];
                if (speedKmh < range.min) {
                    // Severely reduced acceleration when below gear's minimum speed
                    gearEfficiency = 0.1;
                } else if (speedKmh > range.max) {
                    // Reduced acceleration when above gear's maximum speed
                    gearEfficiency = 0.3;
                } else {
                    // Normal acceleration within gear's optimal range
                    const speedRatio = (speedKmh - range.min) / (range.max - range.min);
                    gearEfficiency = 0.7 + (0.3 * speedRatio); // Ranges from 0.7 to 1.0
                }
            }
            
            // Calculate speed-dependent acceleration with a custom curve
            const speedRatio = Math.abs(currentSpeed) / maxSpeedForGear;
            
            // Custom acceleration curve that provides realistic high-speed behavior
            let accelerationCurve;
            if (speedRatio < 0.1) { // Below 25 km/h
                accelerationCurve = 0.8; // Slightly reduced initial acceleration
            } else if (speedRatio < 0.4) { // 25-100 km/h range
                accelerationCurve = 1.0; // Full acceleration
            } else if (speedRatio < 0.7) { // 100-175 km/h range
                accelerationCurve = 0.7; // Reduced but still strong
            } else if (speedRatio < 0.88) { // 175-220 km/h range
                accelerationCurve = 0.4; // Significantly reduced
            } else if (speedRatio < 0.98) { // 220-245 km/h range
                accelerationCurve = 0.2; // Very reduced
            } else { // Above 245 km/h
                accelerationCurve = 0.1; // Minimal acceleration
            }
            
            // Apply gear efficiency to acceleration
            const effectiveAcceleration = baseAcceleration * accelerationCurve * gearEfficiency;
            currentSpeed = Math.min(currentSpeed + (effectiveAcceleration * 0.016), maxSpeedForGear);
        } else if (backward) {
            // Brake in forward gears with realistic deceleration curve
            const speedKmh = Math.abs(currentSpeed) * 3.6; // Convert to km/h
            
            // Create a natural braking curve based on speed
            let brakingMultiplier;
            if (speedKmh < 30) {
                // Strong initial braking at low speeds
                brakingMultiplier = 1.8; // Reduced from 2.0
            } else if (speedKmh < 60) {
                // Very strong braking at medium speeds
                brakingMultiplier = 2.2; // Reduced from 2.5
            } else if (speedKmh < 100) {
                // Maximum braking at high speeds
                brakingMultiplier = 2.7; // Reduced from 3.0
            } else if (speedKmh < 150) {
                // Maximum braking at very high speeds
                brakingMultiplier = 3.2; // Reduced from 3.5
            } else {
                // Maximum braking at extreme speeds
                brakingMultiplier = 3.7; // Reduced from 4.0
            }
            
            // Add a small delay to the braking response
            const effectiveDeceleration = carDeceleration * brakingMultiplier;
            currentSpeed = Math.max(0, currentSpeed - (effectiveDeceleration * 0.016));
        } else {
            // Coast in forward gears with natural deceleration
            if (currentSpeed > 0) {
                const speedKmh = currentSpeed * 3.6; // Convert to km/h
                
                // Create a natural coasting curve based on speed
                let coastingMultiplier;
                if (speedKmh < 30) {
                    // Faster deceleration at low speeds
                    coastingMultiplier = 0.25; // Increased from 0.15
                } else if (speedKmh < 60) {
                    // Moderate deceleration at medium speeds
                    coastingMultiplier = 0.20; // Increased from 0.12
                } else if (speedKmh < 100) {
                    // Slower deceleration at high speeds
                    coastingMultiplier = 0.15; // Increased from 0.08
                } else if (speedKmh < 150) {
                    // Very slow deceleration at very high speeds
                    coastingMultiplier = 0.10; // Increased from 0.05
                } else {
                    // Minimal deceleration at extreme speeds
                    coastingMultiplier = 0.08; // Increased from 0.03
                }
                
                const coastingDeceleration = carDeceleration * coastingMultiplier;
                currentSpeed = Math.max(0, currentSpeed - (coastingDeceleration * 0.016));
            }
        }
    }

    // Update speedometer
    speedometer.update(currentSpeed * 3.6, currentGear); // Convert m/s to km/h

    // Calculate movement direction and apply position change
    const moveDirection = new THREE.Vector3(0, 0, 0);
    if (Math.abs(currentSpeed) > 0.1) {
        moveDirection.z = -1;
        moveDirection.normalize();
        moveDirection.applyQuaternion(car.quaternion);
        // Scale the movement to make it feel more natural
        const movementScale = 3.8; // Increased from 3.5 to 3.8 for slightly faster, more natural movement
        car.position.add(moveDirection.multiplyScalar(currentSpeed * 0.016 * movementScale));
    }

    // Update wheel rotation
    updateWheelRotation();

    // Update camera based on current view
    if (currentCameraMode === 0) {
        const cameraOffset = cameraViews.thirdPerson.offset.clone();
        cameraOffset.applyQuaternion(car.quaternion);
        camera.position.copy(car.position).add(cameraOffset);
        camera.lookAt(car.position.clone().add(cameraViews.thirdPerson.lookAtOffset));
    } else {
        camera.lookAt(car.position);
    }
}

function setupLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);

    // Directional light (sun) with enhanced shadow settings
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(5, sunHeight, 5);
    
    // Enhanced shadow settings for more visible shadows
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 4096;
    directionalLight.shadow.mapSize.height = 4096;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    
    // Make shadows much more visible
    directionalLight.shadow.radius = 1; // Reduced for sharper shadows
    directionalLight.shadow.bias = -0.0001;
    directionalLight.shadow.normalBias = 0.1; // Increased for better shadow contact
    directionalLight.shadow.darkness = 0.8; // Increased shadow darkness
    
    scene.add(directionalLight);
    
    // Store the directional light reference
    window.sunLight = directionalLight;
    
    // Add a second directional light from the opposite side for better visibility
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3); // Reduced fill light intensity
    fillLight.position.set(-5, 5, -5);
    scene.add(fillLight);
}

function setupPostProcessing() {
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.5,
        0.4,
        0.85
    );
    composer.addPass(bloomPass);
}

function setupEventListeners() {
    // Keyboard controls
    window.keys = {};
    window.addEventListener('keydown', (e) => {
        window.keys[e.key] = true;
        if (e.key === 'Escape') {
            toggleMenu();
        }
        if (e.key === 'v' || e.key === 'V') {
            switchCameraView();
        }
    });
    window.addEventListener('keyup', (e) => {
        window.keys[e.key] = false;
    });

    // Menu buttons
    resumeBtn.addEventListener('click', () => toggleMenu());
    controlsBtn.addEventListener('click', () => {
        controlsDiv.style.display = controlsDiv.style.display === 'none' ? 'block' : 'none';
    });
    settingsBtn.addEventListener('click', () => {
        settingsDiv.style.display = settingsDiv.style.display === 'none' ? 'block' : 'none';
    });
    exitBtn.addEventListener('click', () => {
        if (window.confirm('Are you sure you want to exit?')) {
        window.close();
        }
    });

    // Settings
    resolutionSlider.addEventListener('input', (e) => {
        const scale = e.target.value / 100;
        renderer.setSize(window.innerWidth * scale, window.innerHeight * scale);
    });

    volumeSlider.addEventListener('input', (e) => {
        // Implement volume control
    });

    fullscreenCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    });

    // Window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Add freecam controls
    window.addEventListener('keydown', (e) => {
        switch (e.key.toLowerCase()) {
            case 'w':
                if (currentCameraMode === 'freecam') freecamControls.forward = true;
                break;
            case 's':
                if (currentCameraMode === 'freecam') freecamControls.backward = true;
                break;
            case 'a':
                if (currentCameraMode === 'freecam') freecamControls.left = true;
                break;
            case 'd':
                if (currentCameraMode === 'freecam') freecamControls.right = true;
                break;
            case 'v':
                switchCameraView();
                break;
        }
    });

    window.addEventListener('keyup', (e) => {
        switch (e.key.toLowerCase()) {
            case 'w':
                freecamControls.forward = false;
                break;
            case 's':
                freecamControls.backward = false;
                break;
            case 'a':
                freecamControls.left = false;
                break;
            case 'd':
                freecamControls.right = false;
                break;
        }
    });

    // Add new mouse look controls
    window.addEventListener('mousemove', (e) => {
        if (currentCameraMode === 'thirdPerson' && isMouseLocked) {
            const deltaX = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
            // Invert the deltaX to fix the inverted look
            targetMouseLookAngle = Math.max(-Math.PI / 3, 
                Math.min(Math.PI / 3, 
                    targetMouseLookAngle - deltaX * 0.002));
            lastMouseMoveTime = Date.now();
        }
    });

    // Prevent context menu on right-click
    window.addEventListener('contextmenu', (e) => {
        if (currentCameraMode === 'freecam') {
            e.preventDefault();
        }
    });

    // Add pointer lock event listeners
    document.addEventListener('pointerlockchange', () => {
        isMouseLocked = document.pointerLockElement === document.body;
        document.body.style.cursor = isMouseLocked ? 'none' : 'default';
        
        // Only show menu if pointer lock is lost unexpectedly (not from menu toggle)
        if (!isMouseLocked && isGameStarted && !isMenuOpen) {
            toggleMenu();
        }
    });

    // Add escape key handler to exit pointer lock
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (isMouseLocked) {
                document.exitPointerLock();
            } else if (!isMenuOpen) {
                toggleMenu();
            }
        }
    });

    // Add chat input event listener
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && chatInput.value.trim()) {
            const message = {
                username: playerUsername,
                text: chatInput.value.trim()
            };
            
            // Add message to local chat
            handleChatMessage(message);
            
            // Here you would typically send the message to other players
            // For now, we'll just simulate it by adding it to all players' chat
            players.forEach((player, username) => {
                if (username !== playerUsername) {
                    handleChatMessage(message);
                }
            });
            
            // Clear input
            chatInput.value = '';
        }
    });

    // Add "/" key event listener to focus chat input
    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && isGameStarted && !isMenuOpen) {
            e.preventDefault(); // Prevent typing "/" in the input
            chatInput.focus();
        }
    });

    // Add blur event listener to clear input when focus is lost
    chatInput.addEventListener('blur', () => {
        chatInput.value = '';
    });
}

function toggleMenu() {
    isMenuOpen = !isMenuOpen;
    menu.style.display = isMenuOpen ? 'block' : 'none';
    
    // Only toggle chat visibility if the game has started
    if (isGameStarted) {
        chatContainer.style.display = isMenuOpen ? 'none' : 'block';
    }
    
    if (isMenuOpen) {
        // When opening menu, exit pointer lock and show cursor
        document.exitPointerLock();
        document.body.style.cursor = 'default';
    } else {
        // When closing menu, request pointer lock
        document.body.requestPointerLock();
    }
    
    // Hide speedometer when menu is open
    if (speedometer) {
        if (isMenuOpen) {
            speedometer.hide();
        } else {
            speedometer.show();
        }
    }
}

function updateWeather() {
    weatherTimer += 0.016; // Assuming 60 FPS
    if (weatherState === 'sunny' && weatherTimer >= 600) { // 10 minutes
        weatherState = 'rainy';
        weatherTimer = 0;
        // Implement weather change to rainy
    } else if (weatherState === 'rainy' && weatherTimer >= 300) { // 5 minutes
        weatherState = 'sunny';
        weatherTimer = 0;
        // Implement weather change to sunny
    }
}

function switchCameraView() {
    if (currentCameraMode === 'thirdPerson') {
        currentCameraMode = 'fixed';
    } else if (currentCameraMode === 'fixed') {
        currentCameraMode = 'freecam';
        // Initialize freecam position at current camera position
        camera.position.copy(camera.position);
        camera.rotation.copy(camera.rotation);
    } else {
        currentCameraMode = 'thirdPerson';
    }
}

// Modify the updateCamera function to include auto-return
function updateCamera() {
    if (!car) return;

    if (currentCameraMode === 'freecam') {
        return;
    }

    if (currentCameraMode === 'thirdPerson') {
        const carDirection = new THREE.Vector3(0, 0, 1);
        carDirection.applyQuaternion(car.quaternion);
        
        // Calculate target side offset based on car's turning
        const turnAmount = car.rotation.y;
        const targetSideOffset = Math.sin(turnAmount) * 2;
        
        // Smoothly interpolate the current side offset to the target
        const smoothingFactor = Math.abs(targetSideOffset) < 0.1 ? 0.15 : 0.08;
        currentSideOffset += (targetSideOffset - currentSideOffset) * smoothingFactor;
        
        // Use fixed distance for all speeds
        targetCameraOffset.set(
            currentSideOffset,
            8,
            18
        );
        
        currentCameraOffset.lerp(targetCameraOffset, cameraSmoothing);
        
        // Calculate base camera position
        const baseCameraPosition = car.position.clone().add(
            currentCameraOffset.clone().applyQuaternion(car.quaternion)
        );
        
        // Handle auto-return to center
        const timeSinceLastMove = Date.now() - lastMouseMoveTime;
        if (timeSinceLastMove > 2000) {
            targetMouseLookAngle = 0;
        }
        
        // Smoothly interpolate current angle to target angle
        mouseLookAngle += (targetMouseLookAngle - mouseLookAngle) * 0.05;
        
        // Apply mouse look rotation
        const lookRotation = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            mouseLookAngle
        );
        
        // Calculate final camera position with mouse look
        const cameraPosition = baseCameraPosition.clone();
        cameraPosition.sub(car.position).applyQuaternion(lookRotation).add(car.position);
        
        // Calculate look-at position based on car's direction
        const lookAtPosition = car.position.clone().add(
            carDirection.multiplyScalar(5).add(new THREE.Vector3(0, 4, 0))
        );
        
        camera.position.copy(cameraPosition);
        camera.lookAt(lookAtPosition);
    } else if (currentCameraMode === 'fixed') {
        camera.position.copy(cameraViews.fixed.basePosition);
        camera.lookAt(car.position);
    }
}

// Add new function for camera shake
function applyCameraShake() {
    if (!car || isFreecam) return;

    const speedKmh = Math.abs(currentSpeed) * 3.6;
    if (speedKmh < CAMERA_SETTINGS.shake.speedThreshold) {
        return;
    }

    // Calculate shake intensity based on speed with a gentler curve
    const speedRatio = Math.min(speedKmh / CAMERA_SETTINGS.shake.maxSpeed, 1);
    const intensity = Math.pow(speedRatio, 1.2);

    // Update shake time with smoother oscillation
    shakeTime += CAMERA_SETTINGS.shake.frequency * 0.8;

    // Calculate rotation offsets with smoother patterns
    const rotX = Math.sin(shakeTime * 0.6) * Math.cos(shakeTime * 1.0);
    const rotY = Math.sin(shakeTime * 1.2) * Math.cos(shakeTime * 0.4);
    const rotZ = Math.sin(shakeTime * 0.8) * Math.cos(shakeTime * 0.6);

    // Apply rotation shake with smoother transitions
    const rotationOffset = new THREE.Euler(
        rotX * CAMERA_SETTINGS.shake.maxRotationOffset * intensity * 0.8,
        rotY * CAMERA_SETTINGS.shake.maxRotationOffset * intensity * 0.8,
        rotZ * CAMERA_SETTINGS.shake.maxRotationOffset * intensity * 0.8
    );

    // Apply rotation shake with smoothing
    camera.rotation.x += rotationOffset.x;
    camera.rotation.y += rotationOffset.y;
    camera.rotation.z += rotationOffset.z;
}

// Modify the updateFreecam function to include mouse look
function updateFreecam() {
    if (currentCameraMode !== 'freecam') return;

    const moveSpeed = window.keys['Shift'] ? freecamBoostSpeed : freecamSpeed;
    const deltaTime = 0.016; // Assuming 60 FPS

    // Calculate movement direction based on camera orientation
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);

    // Create right vector (fixed the cross product order)
    const right = new THREE.Vector3();
    right.crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();

    // Apply movement
    if (freecamControls.forward) {
        camera.position.add(direction.multiplyScalar(moveSpeed * deltaTime));
    }
    if (freecamControls.backward) {
        camera.position.add(direction.multiplyScalar(-moveSpeed * deltaTime));
    }
    if (freecamControls.left) {
        camera.position.add(right.multiplyScalar(-moveSpeed * deltaTime));
    }
    if (freecamControls.right) {
        camera.position.add(right.multiplyScalar(moveSpeed * deltaTime));
    }
}

function updateMiniMap() {
    if (!miniMap || !car) return;

    // Clear the canvas
    miniMapCtx.clearRect(0, 0, miniMapCanvas.width, miniMapCanvas.height);

    // Draw a subtle grid pattern for better orientation
    miniMapCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    miniMapCtx.lineWidth = 1;
    
    // Draw vertical grid lines
    for (let x = 0; x < miniMapCanvas.width; x += 20) {
        miniMapCtx.beginPath();
        miniMapCtx.moveTo(x, 0);
        miniMapCtx.lineTo(x, miniMapCanvas.height);
        miniMapCtx.stroke();
    }
    
    // Draw horizontal grid lines
    for (let y = 0; y < miniMapCanvas.height; y += 20) {
        miniMapCtx.beginPath();
        miniMapCtx.moveTo(0, y);
        miniMapCtx.lineTo(miniMapCanvas.width, y);
        miniMapCtx.stroke();
    }

    // Calculate player position on mini map
    const mapWidth = 5000; // Match your terrain size
    const mapHeight = 5000;
    const scaleX = miniMapCanvas.width / mapWidth;
    const scaleY = miniMapCanvas.height / mapHeight;

    const playerX = (car.position.x + mapWidth/2) * scaleX;
    const playerZ = (car.position.z + mapHeight/2) * scaleY;

    // Update player marker position
    playerMarker.style.left = `${playerX}px`;
    playerMarker.style.top = `${playerZ}px`;

    // Update player name position and content
    playerNameLabel.style.left = `${playerX}px`;
    playerNameLabel.style.top = `${playerZ}px`;
    playerNameLabel.textContent = playerUsername;
}

function updateSunPosition(deltaTime) {
    if (!window.sunLight) return;

    shadowUpdateTime += deltaTime;
    if (shadowUpdateTime >= SHADOW_UPDATE_INTERVAL) {
        // Update sun angle (simulating day cycle)
        sunAngle += 0.0001; // Adjust this value to change the speed of the day cycle
        
        // Calculate new sun position
        const sunX = Math.cos(sunAngle) * 100;
        const sunZ = Math.sin(sunAngle) * 100;
        
        // Update sun light position
        window.sunLight.position.set(sunX, sunHeight, sunZ);
        
        // Update shadow camera to follow the sun
        window.sunLight.shadow.camera.updateProjectionMatrix();
        
        shadowUpdateTime = 0;
    }
}

function updatePlayerPositions() {
    if (!car) return;
    
    // Update current player's position
    if (players.has(playerUsername)) {
        players.get(playerUsername).position.copy(car.position);
        players.get(playerUsername).rotation.copy(car.quaternion);
    }
}

function animate() {
    if (!isGameStarted) return;

    requestAnimationFrame(animate);
    const deltaTime = 0.016; // Assuming 60 FPS

    // Update game state
    updateWeather();
    if (currentCameraMode !== 'freecam') {
        updateCarMovement();
    }
    updateCamera();
    updateFreecam();
    applyCameraShake();
    updateSunPosition(deltaTime);
    updatePlayerPositions();
    if (orbitControls.enabled) {
        orbitControls.update();
    }

    // Update mini map
    updateMiniMap();

    renderer.render(scene, camera);
}

function resetPlayerPosition() {
    if (!car) return;

    // Reset car position to center
    car.position.set(0, 0, 0);
    car.rotation.set(0, 0, 0);
    
    // Reset car physics
    car.userData.velocity = new THREE.Vector3();
    car.userData.direction = new THREE.Vector3(0, 0, 1);
    
    // Reset current speed and gear
    currentSpeed = 0;
    currentGearIndex = 1; // Set to neutral
    currentGear = GEARS[currentGearIndex];
    
    // Reset camera
    updateCamera();
}

// Add this function to handle chat messages
function handleChatMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    
    const usernameSpan = document.createElement('span');
    usernameSpan.className = 'chat-username';
    usernameSpan.textContent = message.username + ':';
    
    const messageText = document.createElement('span');
    messageText.textContent = ' ' + message.text;
    
    messageElement.appendChild(usernameSpan);
    messageElement.appendChild(messageText);
    chatMessages.appendChild(messageElement);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Start the game
init();

const socket = io();

// Example: Send player movement data
function sendPlayerMovement(position) {
    socket.emit('playerMove', { position });
}

// Example: Receive other players' movements
socket.on('playerMoved', (data) => {
    // Update other players' positions in your game
    console.log('Player moved:', data);
}); 