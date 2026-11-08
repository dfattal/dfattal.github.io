// The hero: a multi-directional backlight, drawn as glasses-free 3D with the DisplayXR web SDK.
//
// A light guide lies in the scene, tilted back from the glass. Each of its pixels sends light out
// in seven directions, one colour per direction: the idea behind the 2013 Nature paper and Leia's
// first displays. In the DisplayXR Browser on a 3D display the canvas is rendered once per eye and
// woven; in any other browser it renders one mono view.
//
// Comfort (displayxr-web docs/making-3d-look-right.md): the subject straddles the zero-disparity
// plane, the plate is laid back into depth, light rises UP and AWAY from the viewer rather than
// toward them, beams are soft ribbons several pixels wide, and the page background behind the
// canvas is a light/mid-tone grey.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createInline3D } from '@displayxr/inline3d';
import { EdgeFeather } from '@displayxr/inline3d/three';

const canvas = document.getElementById('light');
const replayBtn = document.getElementById('replay');
const stage = document.getElementById('stage');

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const darkQuery = matchMedia('(prefers-color-scheme: dark)');

// ---- renderer --------------------------------------------------------------------------------
// pixelRatio must stay 1: the session's viewports are in backing-store pixels (see hello-cube).
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);
renderer.autoClear = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

// Authored in metres for a 12 cm-tall virtual display (addScene's virtualDisplayHeight below).
const VDH = 0.12;

// ---- the light guide ---------------------------------------------------------------------------
const rig = new THREE.Group();          // everything that tilts together
rig.position.set(0, -0.042, 0.004);
// Lay the plate nearly flat: its top face looks up, just enough toward the viewer to be seen.
// The plate's local +y (across its depth) then points AWAY from the viewer.
rig.rotation.x = THREE.MathUtils.degToRad(-78);
scene.add(rig);

const PLATE = { w: 0.076, d: 0.03, h: 0.003 };
const plateMat = new THREE.MeshPhysicalMaterial({ color: 0xc9d4de, roughness: 0.22, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.2 });
const plate = new THREE.Mesh(new RoundedBoxGeometry(PLATE.w, PLATE.h, PLATE.d, 4, 0.0016), plateMat);
plate.rotation.x = Math.PI / 2;        // so the plate's thin axis is the rig's z (its normal)
rig.add(plate);

// The plate's top face is at rig z = +h/2; the light leaves along rig +z.
const TOP = PLATE.h / 2;

// Emitters: a row of pixels along the plate, each a small disc lifted off the face (no coplanar
// surfaces). They brighten one by one during the reveal.
const N_EMIT = 7;
const emitterGeo = new THREE.CircleGeometry(0.0015, 24);
const emitters = [];
for (let i = 0; i < N_EMIT; i++) {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
  const e = new THREE.Mesh(emitterGeo, m);
  e.position.set(emitterX(i), 0, TOP + 0.0004);
  rig.add(e);
  emitters.push(e);
}
function emitterX(i) { return (i / (N_EMIT - 1) - 0.5) * (PLATE.w - 0.014); }

scene.add(new THREE.HemisphereLight(0xeef3ff, 0x5a6470, 1.25));
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(0.2, 0.5, 0.6);
scene.add(key);

// ---- the light: soft beams, seven directions per pixel, with pulses travelling along them -----
// Beams are ribbons a few millimetres wide (never thin lines: they would alias as the head moves),
// lying in the fan's plane so they face the viewer. Each is drawn with a soft core, a taper toward
// its far end, and bright pulses that travel outward: light leaving the pixel.
const SPECTRUM = ['#ff4d5e', '#ff9a3c', '#f2c524', '#3fc463', '#1fa8e8', '#5866ff', '#a64dff'];
const N_DIR = SPECTRUM.length;
const RAY_LEN = 0.1;               // metres
const BEAM_W = 0.0016;             // metres
const FAN_DEG = 10.5;              // between neighbouring directions

const beamVerts = [];
const beamAttr = { s: [], u: [], color: [], start: [], seed: [] };
const c = new THREE.Color();
const up = new THREE.Vector3(0, 0, 1);
for (let i = 0; i < N_EMIT; i++) {
  const x = emitterX(i);
  const start = Math.abs(i - (N_EMIT - 1) / 2) / ((N_EMIT - 1) / 2);
  for (let j = 0; j < N_DIR; j++) {
    const a = THREE.MathUtils.degToRad((j - (N_DIR - 1) / 2) * FAN_DEG);
    const dir = new THREE.Vector3(Math.sin(a), 0.42, Math.cos(a)).normalize();
    // Width vector: in the fan's plane, perpendicular to the beam.
    const side = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)).normalize();
    const o = new THREE.Vector3(x, 0, TOP + 0.0006);
    const e = o.clone().addScaledVector(dir, RAY_LEN);
    const corners = [
      [o, -1, 0], [o, 1, 0], [e, 1, 1],
      [o, -1, 0], [e, 1, 1], [e, -1, 1],
    ];
    c.set(SPECTRUM[j]).convertSRGBToLinear();
    const seed = Math.random();
    for (const [pt, uu, ss] of corners) {
      const v = pt.clone().addScaledVector(side, uu * BEAM_W * (ss ? 1.6 : 0.6));
      beamVerts.push(v.x, v.y, v.z);
      beamAttr.s.push(ss); beamAttr.u.push(uu);
      beamAttr.color.push(c.r, c.g, c.b);
      beamAttr.start.push(start); beamAttr.seed.push(seed);
    }
  }
}
const beamGeo = new THREE.BufferGeometry();
beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(beamVerts, 3));
beamGeo.setAttribute('aS', new THREE.Float32BufferAttribute(beamAttr.s, 1));
beamGeo.setAttribute('aU', new THREE.Float32BufferAttribute(beamAttr.u, 1));
beamGeo.setAttribute('aColor', new THREE.Float32BufferAttribute(beamAttr.color, 3));
beamGeo.setAttribute('aStart', new THREE.Float32BufferAttribute(beamAttr.start, 1));
beamGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(beamAttr.seed, 1));

const beamMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  uniforms: {
    uTime: { value: 0 },
    uReveal: { value: 0 },
    uGain: { value: 1.0 },
    uBase: { value: 0.32 },
  },
  vertexShader: /* glsl */ `
    attribute float aS; attribute float aU; attribute vec3 aColor; attribute float aStart; attribute float aSeed;
    varying float vS; varying float vU; varying vec3 vColor; varying float vStart; varying float vSeed;
    void main() {
      vS = aS; vU = aU; vColor = aColor; vStart = aStart; vSeed = aSeed;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime, uReveal, uGain, uBase;
    varying float vS; varying float vU; varying vec3 vColor; varying float vStart; varying float vSeed;
    void main() {
      // The beam grows out of its pixel during the reveal, centre pixels first.
      float grow = clamp((uReveal - vStart * 0.6) / 0.4, 0.0, 1.0);
      float reach = grow * grow * (3.0 - 2.0 * grow);
      if (vS > reach) discard;
      float core = exp(-vU * vU * 5.0);
      float taper = 1.0 - smoothstep(0.35, 1.0, vS);
      // Pulses travelling outward, a little out of phase from beam to beam.
      float ph = fract(vS * 2.2 - uTime * 0.32 + vSeed);
      float pulse = smoothstep(0.0, 0.05, ph) * (1.0 - smoothstep(0.05, 0.22, ph));
      float head = smoothstep(reach - 0.06, reach, vS) * (1.0 - step(0.999, reach));
      float a = core * taper * (uBase + 0.55 * pulse + 0.6 * head);
      a *= smoothstep(0.0, 0.03, vS);
      if (a < 0.004) discard;
      gl_FragColor = vec4(vColor * uGain, clamp(a, 0.0, 0.9));
      #include <colorspace_fragment>
    }`,
});
const beams = new THREE.Mesh(beamGeo, beamMat);
beams.frustumCulled = false;
beams.renderOrder = 2;
rig.add(beams);

// ---- theme ------------------------------------------------------------------------------------
function applyTheme() {
  const dark = darkQuery.matches;
  plateMat.color.set(dark ? 0x7d8a97 : 0xc9d4de);
  beamMat.uniforms.uGain.value = dark ? 1.2 : 0.95;
  beamMat.uniforms.uBase.value = dark ? 0.38 : 0.32;
}
darkQuery.addEventListener('change', applyTheme);
applyTheme();

// ---- motion: the reveal, a slow sway, and drag to tilt ---------------------------------------
const REVEAL_S = 2.4;
// ?at=<seconds> freezes the clock (for screenshots and tests).
const AT = new URLSearchParams(location.search).has('at') ? Number(new URLSearchParams(location.search).get('at')) : null;
let clock = 0;          // seconds since the reveal began
let revealing = true;

function replay() { clock = 0; revealing = true; }
replayBtn.addEventListener('click', replay);

let dragX = 0, dragY = 0, targetX = 0, targetY = 0, dragging = false, pressX = 0, pressY = 0;
canvas.addEventListener('pointerdown', (e) => {
  dragging = true; pressX = e.clientX; pressY = e.clientY; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const r = canvas.getBoundingClientRect();
  targetY = THREE.MathUtils.clamp((e.clientX - pressX) / (r.width / 2), -1, 1) * 0.35;
  targetX = THREE.MathUtils.clamp((e.clientY - pressY) / (r.height / 2), -1, 1) * 0.2;
});
const release = () => { dragging = false; targetX = 0; targetY = 0; };
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

const BASE_TILT = rig.rotation.x;
function step(dt) {
  dt = Math.min(dt, 0.1);
  if (reduceMotion || AT !== null) {
    clock = AT ?? 30; // a steady state: every pixel on, streams full
  } else {
    clock += dt;
  }
  const reveal = Math.min(clock / REVEAL_S, 1.2);
  if (reveal >= 1.2) revealing = false;
  beamMat.uniforms.uTime.value = clock;
  beamMat.uniforms.uReveal.value = reveal;
  emitters.forEach((e, i) => {
    const s = Math.abs(i - (N_EMIT - 1) / 2) / ((N_EMIT - 1) / 2);
    const on = THREE.MathUtils.clamp((reveal - s * 0.6) / 0.15, 0, 1);
    e.material.opacity = on;
  });

  const ease = 1 - Math.exp(-dt / (dragging ? 0.12 : 0.5));
  dragX += (targetX - dragX) * ease;
  dragY += (targetY - dragY) * ease;
  const sway = reduceMotion ? 0 : Math.sin(clock * 0.25) * 0.08;
  rig.rotation.set(BASE_TILT + dragX, sway + dragY, 0, 'YXZ');
}

// ---- rendering: one mono view, or one view per eye --------------------------------------------
const monoCam = new THREE.PerspectiveCamera(35, 1, 0.01, 10);
const MONO_D = (VDH / 2) / Math.tan(THREE.MathUtils.degToRad(35 / 2));
monoCam.position.set(0, 0, MONO_D);
monoCam.lookAt(0, 0, 0);

const eyeCam = new THREE.PerspectiveCamera();
eyeCam.matrixAutoUpdate = false;
const feather = new EdgeFeather(THREE, { px: 28 });
const size = new THREE.Vector2();

let sbs = false;
function sizeToCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round((canvas.clientWidth || 480) * dpr);
  const h = Math.round((canvas.clientHeight || 600) * dpr);
  renderer.setSize(sbs ? w * 2 : w, h, false);
  monoCam.aspect = w / h;
  monoCam.updateProjectionMatrix();
}
addEventListener('resize', sizeToCanvas);


let last = 0;
let mono = true;
function monoFrame(now) {
  if (!mono) return;
  requestAnimationFrame(monoFrame);
  const dt = last ? (now - last) / 1000 : 0; last = now;
  step(dt);
  renderer.getSize(size);
  renderer.clear();
  renderer.setViewport(0, 0, size.x, size.y);
  renderer.render(scene, monoCam);
  feather.render(renderer, { x: 0, y: 0, width: size.x, height: size.y });
}

function eyeFrame(views, layer) {
  const now = performance.now();
  const dt = last ? (now - last) / 1000 : 0; last = now;
  step(dt);
  renderer.getSize(size);
  renderer.clear();
  renderer.setScissorTest(true);
  views.forEach((view, i) => {
    const vp = layer.getViewport(view) ||
      { x: i === 0 ? 0 : size.x / 2, y: 0, width: size.x / 2, height: size.y };
    renderer.setViewport(vp.x, vp.y, vp.width, vp.height);
    renderer.setScissor(vp.x, vp.y, vp.width, vp.height);
    eyeCam.projectionMatrix.fromArray(view.projectionMatrix);
    eyeCam.projectionMatrixInverse.copy(eyeCam.projectionMatrix).invert();
    eyeCam.matrix.fromArray(view.transform.matrix);
    eyeCam.matrixWorld.copy(eyeCam.matrix);
    eyeCam.matrixWorldInverse.copy(eyeCam.matrixWorld).invert();
    renderer.render(scene, eyeCam);
    feather.render(renderer, vp);
  });
  renderer.setScissorTest(false);
}

function startMono() {
  sbs = false; mono = true; last = 0;
  sizeToCanvas();
  requestAnimationFrame(monoFrame);
}

// ---- boot -------------------------------------------------------------------------------------
sizeToCanvas();
try {
  const wall = await createInline3D({ lazy: false });
  if (wall.supported) {
    wall.addScene(canvas, eyeFrame, {
      virtualDisplayHeight: VDH,
      onLayerLost: startMono,                     // only a lost layer means flat
      onResize: () => sizeToCanvas(),
    });
    mono = false; sbs = true;
    sizeToCanvas();
    document.documentElement.classList.add('inline3d');
  } else {
    startMono();
  }
} catch (err) {
  console.warn('inline-3D unavailable, drawing flat:', err);
  startMono();
}
window.__home = { replay, renderer, scene };
if (!renderer.getContext()) stage.classList.add('failed');
