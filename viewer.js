// Real-time 3D word preview: loads the per-character GLB models exported from
// Blender (tools/render_letters.py --glb) and lets visitors spin the word around.
// The rendered WebP letters in #marquee stay as the fallback until this is ready.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const IN = 0.0254;
const GAP_IN = 3;
const SPACE_IN = 14;
const stage = document.querySelector('.stage');
const fallback = document.getElementById('marquee');
if (!stage || !fallback) throw new Error('no stage');

const canvas = document.createElement('canvas');
canvas.className = 'stage-3d';
canvas.setAttribute('aria-hidden', 'true');
stage.prepend(canvas);
const hint = document.createElement('p');
hint.className = 'stage-hint';
hint.textContent = 'Drag to walk around them';
stage.append(hint);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);

const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enableZoom = false;
controls.enablePan = false;
controls.minPolarAngle = Math.PI * 0.3;
controls.maxPolarAngle = Math.PI * 0.52;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.9;
controls.addEventListener('start', () => { controls.autoRotate = false; });
canvas.style.touchAction = 'pan-y';   // one-finger horizontal drag rotates, vertical still scrolls the page

// Night: almost no ambient, so the bulbs do the work, like the real photos.
const hemi = new THREE.HemisphereLight(0x8a867e, 0x000000, 0.6);
// faint, cool fill from behind so the plywood backs and wiring can be seen when the word is turned around
const backFill = new THREE.DirectionalLight(0xd9d6cf, 1.1);     // the backs are painted white too, so let them read as white
backFill.position.set(-1, 2.5, -3);
scene.add(backFill);
if (!(new URLSearchParams(location.search).get('dbg') || '').includes('nohemi')) scene.add(hemi);
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(9, 64),
  new THREE.MeshStandardMaterial({ color: 0x0d0b07, roughness: 0.9, metalness: 0 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const word = new THREE.Group();
scene.add(word);
const cordMaterial = new THREE.MeshStandardMaterial({ color: 0xe6e6e2, roughness: 0.6 });

// Blender's (x, y, z) in inches -> scene metres, after the model is stood up (rotation.x = +90deg): (x, z, -y)... 
// the model space maps X->X, Y(height)->Y, Z(depth)->Z once rotated, so just scale.
function cordBetween(fromX, a, toX, b) {
  const p0 = new THREE.Vector3(fromX + a[0] * IN, a[1] * IN, a[2] * IN);
  const p1 = new THREE.Vector3(toX + b[0] * IN, b[1] * IN, b[2] * IN);
  const mid = p0.clone().add(p1).multiplyScalar(0.5);
  mid.y = 0.012;                // sags to the floor
  mid.z -= 0.05;                // and drifts a little behind
  const curve = new THREE.QuadraticBezierCurve3(p0, mid, p1);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.0026, 8, false), cordMaterial);
}

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.3, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const draco = new DRACOLoader();
draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/');
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);
const cache = new Map();
let metrics = {};

function fileFor(ch) {
  const m = metrics[ch];
  return m && m.glb ? m.glb : (ch >= '0' && ch <= '9' ? 'digit' + ch : ch) + '.glb';
}

function load(ch) {
  if (!cache.has(ch)) {
    cache.set(ch, new Promise((resolve, reject) => {
      loader.load(`images/3d/${fileFor(ch)}`, (gltf) => {
        const model = gltf.scene;
        model.traverse((o) => {
          if (!o.isMesh) return;
          const m = o.material;
          if (m) m.side = THREE.DoubleSide;        // plywood has two faces; keep the backs closed from every angle
          if (m && m.emissive && m.emissive.getHex() !== 0) {   // only the bulbs carry an emissive colour from Blender
            m.emissive = new THREE.Color(0xffc98a);
            m.emissiveIntensity = 1.1;
            m.toneMapped = true;
          }
        });
        resolve(model);
      }, undefined, reject);
    }));
  }
  return cache.get(ch);
}

let token = 0;
let widthM = 1;
let ready = false;

async function setWord(text) {
  const my = ++token;
  const chars = [...text.toUpperCase()].filter((c) => c === ' ' || metrics[c] || /[A-Z0-9]/.test(c));
  const models = await Promise.all(chars.map((c) => (c === ' ' ? null : load(c).catch(() => null))));
  if (my !== token) return;

  word.clear();
  let x = 0;
  const placed = [];
  let prev = null;             // { x, plug } of the previous character, for the cord between them
  chars.forEach((c, i) => {
    if (c === ' ') { x += SPACE_IN * IN; return; }
    const src = models[i];
    if (!src) return;
    const w = ((metrics[c] && metrics[c].width_in) || 27) * IN;
    const m = src.clone(true);
    // Blender exports Y-up with the letter lying in the XZ plane; stand it up facing +Z.
    m.rotation.x = Math.PI / 2;
    m.position.x = x;
    word.add(m);
    // one warm point light per letter, sitting just in front of the backing
    const bulbs = (metrics[c] && metrics[c].bulbs) || 12;
    const dbg = new URLSearchParams(location.search).get('dbg') || '';
    const light = new THREE.PointLight(0xffe4bd, dbg.includes('nolight') ? 0 : 0.1 * bulbs, 2.4, 2);   // candela; ~2 cd for a 13-bulb letter
    light.position.set(x + w / 2, 0.5, 0.09);
    word.add(light);
    const conn = metrics[c] && metrics[c].connectors;
    if (conn && prev) word.add(cordBetween(prev.x, prev.plug, x, conn.socket));
    if (conn) prev = { x, plug: conn.plug };
    placed.push(w);
    x += w + GAP_IN * IN;
  });
  widthM = Math.max(0.6, x - GAP_IN * IN);
  word.position.x = -widthM / 2;
  frame();
  if (placed.length && !ready) {
    ready = true;
    fallback.classList.add('is-3d');
    canvas.classList.add('is-ready');
    hint.classList.add('is-ready');
    resize();
  }
}

function frame() {
  const h = 47 * IN;
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const fitH = (h * 1.35) / (2 * Math.tan(fov / 2));
  const fitW = (widthM * 1.15) / (2 * Math.tan(fov / 2) * aspect);
  const dist = Math.max(fitH, fitW, 1.2);
  controls.target.set(0, h * 0.48, 0.05);
  const keepAngle = camera.position.lengthSq() > 0;
  if (!keepAngle) {
    // ?spin=180 starts the view from behind (handy for checking the wiring)
    const spin = THREE.MathUtils.degToRad(Number(new URLSearchParams(location.search).get('spin')) || 0);
    camera.position.set(Math.sin(spin + 0.18) * dist, h * 0.62, Math.cos(spin + 0.18) * dist);
  }
  else {
    const dir = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target).addScaledVector(dir, dist);
  }
  controls.update();
}

function resize() {
  const w = stage.clientWidth;
  const h = Math.round(Math.min(Math.max(w * 0.42, 220), window.innerHeight * 0.55));
  renderer.setSize(w, h, false);
  canvas.style.height = ready ? `${h}px` : '0px';   // no blank space while the images are still the fallback
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  frame();
}
window.addEventListener('resize', resize);
resize();

let visible = true;
new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }, { threshold: 0.05 }).observe(stage);
renderer.setAnimationLoop(() => {
  if (!visible || !ready) return;
  controls.update();
  composer.render();
});

fetch('images/3d/metrics.json').then((r) => r.json()).then((m) => { metrics = m; }).catch(() => {}).finally(() => {
  window.marqueeViewer = { setWord };
  const input = document.getElementById('preview-input');
  setWord(input ? input.value : 'LOVE');
});
