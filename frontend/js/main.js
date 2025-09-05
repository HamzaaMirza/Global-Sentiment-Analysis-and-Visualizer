import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gsap } from 'gsap';

// --- CORE SETUP ---
let scene, camera, renderer, controls;
const labelContainer = document.getElementById('label-container');
const infoPanel = document.getElementById('info-panel');
const loader = document.getElementById('loader');
const GLOBE_RADIUS = 5;
const countryDataMap = new Map();
let globePoints, atmosphere, graticule, stars, selectionHalo;

// --- DATA & CONFIG ---
const countryCoordinates = {
    'USA': { lat: 38.96, lon: -95.71 }, 'CHN': { lat: 35.86, lon: 104.19 }, 'GBR': { lat: 55.37, lon: -3.43 },
    'DEU': { lat: 51.16, lon: 10.45 }, 'JPN': { lat: 36.20, lon: 138.25 }, 'AUS': { lat: -25.27, lon: 133.77 },
    'CAN': { lat: 56.13, lon: -106.34 }, 'FRA': { lat: 46.60, lon: 1.88 }, 'IND': { lat: 20.59, lon: 78.96 },
    'BRA': { lat: -14.23, lon: -51.92 }, 'RUS': { lat: 61.52, lon: 105.31 }, 'ZAF': { lat: -30.55, lon: 22.93 }
};
const countryCodeToName = {
    'USA': 'United States', 'CHN': 'China', 'GBR': 'United Kingdom', 'DEU': 'Germany', 'JPN': 'Japan',
    'AUS': 'Australia', 'CAN': 'Canada', 'FRA': 'France', 'IND': 'India', 'BRA': 'Brazil', 'RUS': 'Russia', 'ZAF': 'South Africa'
};

// --- SHADERS (GLSL CODE) ---
const pointsVertexShader = `
    attribute float aDisplacement;
    varying float vDisplacement;
    uniform float uDisplacementScale;
    uniform float uPointSize;

    void main() {
        vDisplacement = aDisplacement;
        vec3 displacedPosition = position + normal * aDisplacement * uDisplacementScale;
        vec4 modelViewPosition = modelViewMatrix * vec4(displacedPosition, 1.0);
        gl_Position = projectionMatrix * modelViewPosition;
        gl_PointSize = uPointSize * (1.0 - length(modelViewPosition.xyz) / 20.0);
    }
`;

const pointsFragmentShader = `
    varying float vDisplacement;
    uniform vec3 uPositiveColor;
    uniform vec3 uNegativeColor;
    uniform vec3 uNeutralColor;
    uniform float uMaxDisplacement;

    void main() {
        float distance = length(gl_PointCoord - vec2(0.5));
        float alpha = 1.0 - smoothstep(0.45, 0.5, distance);
        float intensity = pow(clamp(abs(vDisplacement) / uMaxDisplacement, 0.0, 1.0), 1.5);
        vec3 sentimentColor = vDisplacement > 0.0 ? uPositiveColor : uNegativeColor;
        vec3 finalColor = mix(uNeutralColor, sentimentColor, intensity);
        gl_FragColor = vec4(finalColor, alpha);
    }
`;

// New shader for the atmospheric glow
const atmosphereVertexShader = `
    varying vec3 vNormal;
    void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const atmosphereFragmentShader = `
    varying vec3 vNormal;
    uniform vec3 uGlowColor;
    void main() {
        float intensity = pow(0.6 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
        gl_FragColor = vec4(uGlowColor, 1.0) * intensity;
    }
`;

// --- INITIALIZATION ---
function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 15);

    renderer = new THREE.WebGLRenderer({
        canvas: document.querySelector('#globe-canvas'),
        antialias: true,
        alpha: true
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.04;
    controls.minDistance = 8;
    controls.maxDistance = 30;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;
    controls.enablePan = false;
    
    // Create all scene objects
    createStars();
    createGlobe();
    createAtmosphere();
    createGraticule();
    createSelectionHalo();

    // Setup UI and fetch data
    fetchAndApplyData();
    setupUI();
    
    // Start intro animation
    playIntroAnimation();

    // Start the main loop
    animate();

    window.addEventListener('resize', onWindowResize);
    document.getElementById('info-close').addEventListener('click', hideInfoPanel);
}

// --- 3D OBJECT CREATION ---
function createGlobe() {
    const geometry = new THREE.IcosahedronGeometry(GLOBE_RADIUS, 30);
    const material = new THREE.ShaderMaterial({
        vertexShader: pointsVertexShader,
        fragmentShader: pointsFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uPositiveColor: { value: new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--positive-color')) },
            uNegativeColor: { value: new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--negative-color')) },
            uNeutralColor: { value: new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--neutral-color')) },
            uMaxDisplacement: { value: 1.0 },
            uDisplacementScale: { value: 1.0 },
            uPointSize: { value: renderer.getPixelRatio() * 2.0 }
        }
    });
    globePoints = new THREE.Points(geometry, material);
    globePoints.rotation.y = Math.PI; // Start with a different view
    scene.add(globePoints);
}

function createAtmosphere() {
    const geometry = new THREE.SphereGeometry(GLOBE_RADIUS, 50, 50);
    const material = new THREE.ShaderMaterial({
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        uniforms: {
            uGlowColor: { value: new THREE.Color('#4d90fe') } // A nice blue glow
        }
    });
    atmosphere = new THREE.Mesh(geometry, material);
    atmosphere.scale.set(1.15, 1.15, 1.15);
    scene.add(atmosphere);
}

function createStars() {
    const starGeometry = new THREE.BufferGeometry();
    const starVertices = [];
    for (let i = 0; i < 10000; i++) {
        const x = (Math.random() - 0.5) * 2000;
        const y = (Math.random() - 0.5) * 2000;
        const z = (Math.random() - 0.5) * 2000;
        const dist = x*x + y*y + z*z;
        if (dist < 100000) continue; // Avoid stars too close to the center
        starVertices.push(x, y, z);
    }
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    const starMaterial = new THREE.PointsMaterial({ color: 0xaaaaaa, size: 0.7, transparent: true });
    stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);
}

function createGraticule() {
    const graticuleGeometry = new THREE.SphereGeometry(GLOBE_RADIUS + 0.01, 32, 32);
    const graticuleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.1 });
    graticule = new THREE.Mesh(graticuleGeometry, graticuleMaterial);
    graticule.visible = false; // Initially hidden
    scene.add(graticule);
}

function createSelectionHalo() {
    const ringGeometry = new THREE.RingGeometry(0.7, 0.8, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    selectionHalo = new THREE.Mesh(ringGeometry, ringMaterial);
    selectionHalo.visible = false;
    scene.add(selectionHalo);
}

// --- DATA & UI ---
async function fetchAndApplyData() {
    // This function remains the same
    try {
        const response = await fetch('http://127.0.0.1:5000/api/sentiment');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const sentimentData = await response.json();
        processSentimentData(sentimentData);
    } catch (error) {
        console.error("Could not fetch sentiment data:", error);
        loader.querySelector('p').textContent = 'Error: Could not load data.';
    }
}

function processSentimentData(sentimentData) {
    // This function remains largely the same
    const countryVectors = Object.entries(sentimentData)
        .filter(([code]) => countryCoordinates[code])
        .map(([code, score]) => ({
            code,
            score,
            position: latLonToVector3(countryCoordinates[code].lat, countryCoordinates[code].lon, GLOBE_RADIUS)
        }));

    const geometry = globePoints.geometry;
    const positions = geometry.attributes.position;
    const displacements = new Float32Array(positions.count);
    let maxDisplacement = 0;

    for (let i = 0; i < positions.count; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(positions, i);
        let totalDisplacement = 0;
        for (const country of countryVectors) {
            const distance = vertex.distanceTo(country.position);
            totalDisplacement += country.score * Math.exp(-distance * 4.0);
        }
        displacements[i] = totalDisplacement;
        maxDisplacement = Math.max(maxDisplacement, Math.abs(totalDisplacement));
    }

    geometry.setAttribute('aDisplacement', new THREE.BufferAttribute(displacements, 1));
    globePoints.material.uniforms.uMaxDisplacement.value = maxDisplacement > 0 ? maxDisplacement : 1.0;

    createHTMLMarkers(countryVectors);
    // Don't hide loader here, intro animation will do it
}

function createHTMLMarkers(countryVectors) {
    // This function remains the same
    const markerSVG = `<svg viewBox="0 0 384 512" xmlns="http://www.w3.org/2000/svg"><path d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67a24 24 0 01-43.464 0zM192 256a64 64 0 100-128 64 64 0 000 128z" /></svg>`;
    countryVectors.forEach(country => {
        const { code, score, position } = country;
        const countryName = countryCodeToName[code];
        const sentimentType = score > 0 ? 'positive' : 'negative';
        const markerEl = document.createElement('div');
        markerEl.className = 'marker';
        const iconEl = document.createElement('div');
        iconEl.className = `marker-icon ${sentimentType}`;
        iconEl.innerHTML = markerSVG;
        const labelEl = document.createElement('div');
        labelEl.className = 'marker-label';
        labelEl.innerText = `${countryName}: ${score.toFixed(2)}`;
        markerEl.appendChild(iconEl);
        markerEl.appendChild(labelEl);
        labelContainer.appendChild(markerEl);
        iconEl.addEventListener('click', (e) => {
            e.stopPropagation();
            showInfoPanel(country, position.clone().multiplyScalar(1.04));
        });
        countryDataMap.set(code, { el: markerEl, position });
    });
}

function setupUI() {
    const controlsPanel = document.createElement('div');
    controlsPanel.className = 'controls-panel';
    controlsPanel.innerHTML = `
        <div class="legend">
            <div class="legend-item"><span class="color-box positive"></span> Positive</div>
            <div class="legend-item"><span class="color-box negative"></span> Negative</div>
        </div>
        <div class="control-item">
            <label for="autoRotate">Auto-Rotate</label>
            <label class="switch"><input type="checkbox" id="autoRotate" checked><span class="slider"></span></label>
        </div>
        <div class="control-item">
            <label for="toggleMarkers">Show Markers</label>
            <label class="switch"><input type="checkbox" id="toggleMarkers" checked><span class="slider"></span></label>
        </div>
        <div class="control-item">
            <label for="toggleGraticule">Show Grid</label>
            <label class="switch"><input type="checkbox" id="toggleGraticule"><span class="slider"></span></label>
        </div>
        <div class="control-item">
            <label for="displacementScale">Displacement</label>
            <input type="range" id="displacementScale" min="0" max="3" step="0.1" value="1">
        </div>
    `;
    document.body.appendChild(controlsPanel);

    document.getElementById('autoRotate').addEventListener('change', (e) => { controls.autoRotate = e.target.checked; });
    document.getElementById('displacementScale').addEventListener('input', (e) => { globePoints.material.uniforms.uDisplacementScale.value = parseFloat(e.target.value); });
    document.getElementById('toggleMarkers').addEventListener('change', (e) => { labelContainer.style.display = e.target.checked ? 'block' : 'none'; });
    document.getElementById('toggleGraticule').addEventListener('change', (e) => { graticule.visible = e.target.checked; });
}

// --- ANIMATION & INTERACTION ---
function playIntroAnimation() {
    // Animate the camera from far to near
    gsap.from(camera.position, { z: 100, duration: 3, ease: 'power3.inOut' });
    // Animate the globe's scale and opacity
    gsap.from(globePoints.scale, { x: 0.5, y: 0.5, z: 0.5, duration: 2, ease: 'power3.out' });
    gsap.from(globePoints.material, { opacity: 0, duration: 2.5 });
    gsap.from(atmosphere.scale, { x: 0.5, y: 0.5, z: 0.5, duration: 2, ease: 'power3.out', delay: 0.2 });

    // Hide loader after animation starts
    gsap.to('#loader', { opacity: 0, duration: 1, delay: 1, onComplete: () => loader.classList.add('hidden') });
}

function showInfoPanel(data, position) {
    document.getElementById('info-country').innerText = countryCodeToName[data.code];
    document.getElementById('info-sentiment').innerText = data.score.toFixed(2);
    infoPanel.classList.add('visible');

    // Position and show the selection halo
    selectionHalo.position.copy(position);
    selectionHalo.lookAt(new THREE.Vector3(0,0,0)); // Orient the ring to face outwards
    selectionHalo.visible = true;

    const focusPos = position.clone().multiplyScalar(2.2);
    gsap.to(camera.position, {
        x: focusPos.x, y: focusPos.y, z: focusPos.z,
        duration: 1.2, ease: 'power3.inOut',
        onUpdate: () => controls.update()
    });
    controls.autoRotate = false;
    document.getElementById('autoRotate').checked = false;
}

function hideInfoPanel() {
    infoPanel.classList.remove('visible');
    selectionHalo.visible = false;
    gsap.to(camera.position, {
        x: 0, y: 0, z: 15,
        duration: 1.2, ease: 'power3.inOut',
        onUpdate: () => controls.update()
    });
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // Subtle parallax effect for the stars
    if (stars) stars.rotation.y += 0.00005;

    // Pulse the selection halo if it's visible
    if (selectionHalo && selectionHalo.visible) {
        const time = Date.now() * 0.005;
        const scale = 1 + Math.sin(time) * 0.05;
        selectionHalo.scale.set(scale, scale, scale);
    }
    
    // Rotate all globe elements together
    if (controls.autoRotate) {
        const rotationSpeed = 0.0005;
        globePoints.rotation.y += rotationSpeed;
        atmosphere.rotation.y += rotationSpeed;
        graticule.rotation.y += rotationSpeed;
    }
    
    updateMarkerPositions();
    renderer.render(scene, camera);
}

function updateMarkerPositions() {
    const tempV = new THREE.Vector3();
    for (const data of countryDataMap.values()) {
        tempV.copy(data.position).applyMatrix4(globePoints.matrixWorld);
        const dot = tempV.clone().normalize().dot(camera.position.clone().normalize());
        const isVisible = dot > -0.2;
        data.el.classList.toggle('visible', isVisible);
        if (isVisible) {
            tempV.project(camera);
            const x = (tempV.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-tempV.y * 0.5 + 0.5) * window.innerHeight;
            data.el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
        }
    }
}

// --- HELPERS ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function latLonToVector3(lat, lon, radius) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    return new THREE.Vector3(
        -(radius * Math.sin(phi) * Math.cos(theta)),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
    );
}

// --- START ---
init();