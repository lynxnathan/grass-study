import './style.css';
import './presentation.css';
import * as THREE from 'three';
import { createLandmarks, createTerrain, heightAt } from './terrain';
import { GrassField } from './field';
import { Input } from './input';
import { Player } from './player';
import { FollowCamera } from './camera';
import { PerformanceHud } from './performance';
import { containSceneEvents } from './scene-events';
import { StudyPresentation } from './studies';
import { WindControls } from './wind';
import { Weather } from './weather';
import { GroundCover } from './ground-cover';
import { CoverControls } from './cover-controls';
import { ForceViewControls } from './force-view';

const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
containSceneEvents(canvas);
const loading = document.querySelector<HTMLElement>('#loading')!;
const loadTitle = document.querySelector<HTMLElement>('#load-title')!;
const loadDetail = document.querySelector<HTMLElement>('#load-detail')!;
const retry = document.querySelector<HTMLButtonElement>('#retry')!;
const home = document.querySelector<HTMLButtonElement>('#home')!;
const announcement = document.querySelector<HTMLElement>('#announcement')!;
let ready = false;
home.disabled = true;

async function main() {
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
  catch { loadTitle.textContent = 'This field needs WebGL 2.';loadDetail.textContent = 'Enable browser graphics acceleration and try again.';retry.hidden = false;retry.onclick = () => location.reload();return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;renderer.toneMappingExposure = 1;
  renderer.info.autoReset = false;
  const performanceHud = new PerformanceHud(renderer);
  const scene = new THREE.Scene();scene.background = new THREE.Color('#e6ebdf');
  scene.fog = new THREE.Fog('#e6ebdf', 45, 105);
  const camera = new THREE.PerspectiveCamera(48, 1, .1, 180);
  const input = new Input(canvas), player = new Player(), follow = new FollowCamera(camera, canvas);
  const terrain = createTerrain();
  const grass = new GrassField();
  const cover = new GroundCover(grass, terrain);
  const coverControls = new CoverControls(cover, scene);
  scene.add(cover.root);
  const windControls = new WindControls(grass.winds);
  new ForceViewControls(grass.forceView);
  const windSampling = document.querySelector<HTMLButtonElement>('#wind-sampling')!;
  if (!renderer.extensions.has('EXT_color_buffer_float')) {
    grass.windPatches.setEnabled(false);windSampling.disabled = true;
    windSampling.setAttribute('aria-pressed', 'false');windSampling.textContent = 'Direct wind only';
    windSampling.title = 'This browser cannot render the shared wind field; wind is evaluated directly.';
  }
  windSampling.onclick = () => {
    grass.windPatches.setEnabled(!grass.windPatches.enabled);
    windSampling.setAttribute('aria-pressed', String(grass.windPatches.enabled));
    announcement.textContent = grass.windPatches.enabled ? 'Wind detail blends with distance.' : 'Wind evaluated directly at every blade.';
  };
  const landmarks = createLandmarks();
  scene.add(terrain, landmarks, player.root, grass.root);
  const ambient = new THREE.HemisphereLight('#f7f5dd', '#67795a', 1.8);scene.add(ambient);
  const sun = new THREE.DirectionalLight('#fff0ce', 2.4);sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);sun.shadow.camera.left = sun.shadow.camera.bottom = -24;
  sun.shadow.camera.right = sun.shadow.camera.top = 24;sun.shadow.camera.near = 1;sun.shadow.camera.far = 95;
  sun.shadow.normalBias = .035;sun.shadow.bias = -.00012;scene.add(sun, sun.target);
  const weather = new Weather(renderer, scene, grass, terrain, landmarks, sun, ambient);
  const presentation = new StudyPresentation(study => {
    grass.setMode(study.mode);
    cover.setMode(study.mode);coverControls.setMode(study.mode);
    weather.setMode(study.mode);
    windControls.setMode(study.mode);
    windSampling.hidden = study.mode < 8;
    performanceHud.reset();
  }, coverage => { grass.setCoverage(coverage);cover.setCoverage(coverage); });
  const brushRay = new THREE.Raycaster(), brushPointer = new THREE.Vector2();
  brushRay.firstHitOnly = true;
  const brushHits: THREE.Intersection[] = [];
  let brushing = false, placementPress = false;
  const trackBrush = (event: PointerEvent) => {
    const leftHeld = event.pointerType === 'mouse' && (event.buttons & 1) !== 0;
    if (!leftHeld) placementPress = false;
    const rect = canvas.getBoundingClientRect();
    brushPointer.set((event.clientX - rect.left) / rect.width * 2 - 1,
      -(event.clientY - rect.top) / rect.height * 2 + 1);
    if (event.type === 'pointerdown' && event.button === 0 && coverControls.placing) {
      placementPress = true;
      brushRay.setFromCamera(brushPointer,camera);brushHits.length=0;brushRay.intersectObject(terrain,false,brushHits);
      if(brushHits[0])coverControls.placeAt(brushHits[0].point);
    }
    if (event.type === 'pointerdown' && event.button === 0 && windControls.placing !== null) {
      placementPress = true;
      brushRay.setFromCamera(brushPointer, camera);brushHits.length = 0;
      brushRay.intersectObject(terrain, false, brushHits);
      if (brushHits[0]) windControls.placeAt(brushHits[0].point);
    }
    brushing = leftHeld && !placementPress && windControls.placing === null;
  };
  canvas.addEventListener('pointerdown', trackBrush);
  canvas.addEventListener('pointermove', trackBrush);
  canvas.addEventListener('pointerup', trackBrush);
  const clearBrush = () => { brushing = false;placementPress = false; };
  canvas.addEventListener('pointercancel', clearBrush);
  canvas.addEventListener('inputinterrupted', clearBrush);
  window.addEventListener('blur', clearBrush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearBrush(); });
  player.root.position.set(0, heightAt(0, 8), 8);follow.reset(player.root.position);
  function resize() {
    const rect = canvas.getBoundingClientRect();renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);resize();
  home.onclick = () => { windControls.cancelPlacement();coverControls.cancelPlacement();input.clear();player.reset();follow.reset(player.root.position);announcement.textContent = 'Back at the starting point.';input.focus(); };
  canvas.addEventListener('inputinterrupted', () => {
    player.velocity.set(0, 0, 0);
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();input.clear();clearBrush();player.velocity.set(0, 0, 0);
    ready = false;home.disabled = true;
    presentation.setEnabled(false);
    loading.hidden = false;loadTitle.textContent = 'The graphics connection was interrupted.';
    loadDetail.textContent = 'Reload the field to continue.';retry.hidden = false;retry.onclick = () => location.reload();
  });
  async function load() {
    retry.hidden = true;loadTitle.textContent = 'Loading the character…';
    loadDetail.textContent = 'Loading the character and its animations.';
    try {
      await player.load();follow.reset(player.root.position);
      loadDetail.textContent = 'Preparing the field studies.';
      await renderer.compileAsync(scene, camera);
      if (renderer.getContext().isContextLost()) return;
      ready = true;loading.hidden = true;
      home.disabled = false;announcement.textContent = 'Field ready. Use WASD to walk.';
      presentation.setEnabled(true);
    } catch (error) {
      console.error(error);loadTitle.textContent = 'The character could not load.';
      loadDetail.textContent = 'The character could not be loaded. Please try again.';
      retry.hidden = false;
    }
  }
  retry.onclick = () => { void load(); };
  let previous = performance.now();
  const sunOffset = new THREE.Vector3(-16, 30, 13);
  const MAX_FRAME_SECONDS = .1;
  const MAX_SIMULATION_STEP = 1 / 60;
  renderer.setAnimationLoop(now => {
    presentation.update(now);
    const dt = Math.min((now - previous) / 1000, MAX_FRAME_SECONDS);previous = now;
    const frameStart = performanceHud.begin(now);
    renderer.info.reset();
    if (ready) {
      let brush: THREE.Vector3 | null = null;
      if (brushing && grass.mode >= 6) {
        brushRay.setFromCamera(brushPointer, camera);
        brushHits.length = 0;
        brushRay.intersectObject(terrain, false, brushHits);
        brush = brushHits[0]?.point ?? null;
      }
      let remaining = dt;
      while (remaining > 0) {
        const step = Math.min(remaining, MAX_SIMULATION_STEP);
        player.update(step, input, follow.viewYaw);
        grass.update(step, player.root.position, brush);remaining -= step;
      }
    }
    follow.update(dt, player.root.position);
    grass.updateDetail(camera, canvas.height);
    weather.update(dt, camera, sunOffset);
    camera.updateMatrixWorld();
    cover.update(camera,canvas.height,weather.state.wetness*weather.state.blend,weather.state.roughness,weather.environmentTexture,weather.environmentLight);
    sun.position.copy(player.root.position).add(sunOffset);
    sun.target.position.copy(player.root.position);sun.target.updateMatrixWorld();
    performanceHud.beginRender();
    grass.prepare(renderer, camera);
    renderer.render(scene, camera);
    performanceHud.end(now, frameStart);
  });
  if (import.meta.env.DEV) {
    Object.defineProperty(window, '__study', { value: {
      terrain,
      snapshot: () => ({ cover: cover.snapshot(), contacts: coverControls.snapshot(), weather: weather.snapshot(), ready, study: presentation.current.id, grass: grass.snapshot(), state: player.state, position: player.root.position.toArray(),
        ground: heightAt(player.root.position.x, player.root.position.z), camera: camera.position.toArray(),
        surface: new THREE.Raycaster(new THREE.Vector3(player.root.position.x, 100, player.root.position.z), new THREE.Vector3(0, -1, 0)).intersectObject(terrain)[0]?.point.y,
        cameraGround: heightAt(camera.position.x, camera.position.z), yaw: follow.yaw, distance: follow.distance,
        animationTime: player.mixer?.time ?? 0,
        bones: (() => { const result: number[] = [];player.root.traverse(o => { if (o instanceof THREE.Bone && /thigh|calf|foot/i.test(o.name)) result.push(...o.quaternion.toArray()); });return result; })() }),
    } });
  }
  await load();
}
void main();
