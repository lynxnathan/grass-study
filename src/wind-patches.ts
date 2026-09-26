import * as THREE from 'three';
import { FIELD_PATCHES } from './patch-grid';
import { WindField } from './wind';
import { WIND } from './wind-shader';

// 16 intervals per 12 m patch, with duplicated boundary samples and one guard
// sample at either side. Bilinear reads never reach an unrelated modulo neighbor.
export const WIND_PATCH = { intervals: 16, texels: 19, near: 20, far: 44, seconds: .3 } as const;
const side = FIELD_PATCHES.side, size = FIELD_PATCHES.size, pixels = side * WIND_PATCH.texels;
const number = (n: number) => n.toFixed(1);
export const WIND_PATCH_LOOKUP = `
uniform sampler2D grassWindFrom;
uniform sampler2D grassWindTo;
uniform vec2 grassWindFromOrigin;
uniform vec2 grassWindToOrigin;
uniform float grassWindHandoff;
uniform float grassWindSampling;
uniform float grassWindReady;
float grassPatchCoverage(vec2 root, vec2 origin) {
  vec2 cell = root/${number(size)};
  vec2 margin = min(cell-origin, origin+${number(side)}-cell);
  return smoothstep(0.0, 1.0, min(margin.x, margin.y));
}
vec2 grassPatchUV(vec2 root) {
  vec2 cell = floor(root/${number(size)});
  vec2 slot = mod(cell, ${number(side)});
  vec2 local = root/${number(size)}-cell;
  return (slot*${number(WIND_PATCH.texels)}+vec2(1.5)+local*${number(WIND_PATCH.intervals)})/${number(pixels)};
}
vec2 grassPatchWind(vec2 root, float distance) {
  float detail = smoothstep(${number(WIND_PATCH.near)}, ${number(WIND_PATCH.far)}, distance)*grassWindSampling*grassWindReady;
  if (detail <= 0.0) return grassWind(root);
  float fromWeight = (1.0-grassWindHandoff)*grassPatchCoverage(root, grassWindFromOrigin)*detail;
  float toWeight = grassWindHandoff*grassPatchCoverage(root, grassWindToOrigin)*detail;
  float directWeight = max(0.0, 1.0-fromWeight-toWeight);
  vec2 result = vec2(0.0);
  if (directWeight > 0.0) result += grassWind(root)*directWeight;
  if (grassFineWindCount > 0) result += grassWindPart(root, 2.0)*(fromWeight+toWeight);
  vec2 uv = grassPatchUV(root);
  if (fromWeight > 0.0) result += texture2D(grassWindFrom, uv).rg*fromWeight;
  if (toWeight > 0.0) result += texture2D(grassWindTo, uv).rg*toWeight;
  return result;
}
`;

type TileWindow = { target: THREE.WebGLRenderTarget; origin: THREE.Vector2 };
export class WindPatchAtlas {
  private from: TileWindow;
  private to: TileWindow;
  private elapsed = WIND_PATCH.seconds as number;
  private initialized = false;
  private supported: boolean | null = null;
  private requested = true;
  private frameTime = 0;
  private passes = 0;
  private handoffs = 0;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private material: THREE.ShaderMaterial;
  readonly uniforms = {
    grassWindFrom: { value: null as THREE.Texture | null },
    grassWindTo: { value: null as THREE.Texture | null },
    grassWindFromOrigin: { value: new THREE.Vector2() },
    grassWindToOrigin: { value: new THREE.Vector2() },
    grassWindHandoff: { value: 1 }, grassWindSampling: { value: 1 }, grassWindReady: { value: 0 },
  };
  constructor(winds: WindField) {
    const window = (): TileWindow => ({ origin: new THREE.Vector2(), target: new THREE.WebGLRenderTarget(pixels, pixels,
      { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false }) });
    this.from = window();this.to = window();
    this.uniforms.grassWindFrom.value = this.from.target.texture;this.uniforms.grassWindTo.value = this.to.target.texture;
    this.material = new THREE.ShaderMaterial({
      uniforms: { ...winds.uniforms, grassTime: { value: 0 }, grassMode: { value: 8 }, origin: { value: new THREE.Vector2() } },
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: WIND + `
        uniform vec2 origin;
        void main() {
          vec2 pixel = floor(gl_FragCoord.xy);
          vec2 slot = floor(pixel/${number(WIND_PATCH.texels)});
          vec2 cell = origin+mod(slot-origin, ${number(side)});
          vec2 local = (mod(pixel, ${number(WIND_PATCH.texels)})-1.0)/${number(WIND_PATCH.intervals)};
          gl_FragColor = vec4(grassWindPart((cell+local)*${number(size)}, 1.0), 0.0, 1.0);
        }
      `,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);mesh.frustumCulled = false;this.scene.add(mesh);
  }
  skip() { this.passes = 0;this.uniforms.grassWindReady.value = 0; }
  get enabled() { return this.requested; }
  setEnabled(value: boolean) { this.requested = value; }
  advance(dt: number) {
    const weight = this.uniforms.grassWindSampling, goal = Number(this.requested);
    weight.value += Math.sign(goal-weight.value)*Math.min(Math.abs(goal-weight.value), Math.max(0, dt)/WIND_PATCH.seconds);
    this.elapsed = Math.min(WIND_PATCH.seconds, this.elapsed+Math.max(0, dt));
    const t = this.elapsed/WIND_PATCH.seconds;
    this.uniforms.grassWindHandoff.value = t*t*(3-2*t);
  }
  render(renderer: THREE.WebGLRenderer, x: number, z: number, time: number) {
    this.passes = 0;
    if (this.supported === null) this.supported = renderer.extensions.has('EXT_color_buffer_float');
    if (!this.supported || this.uniforms.grassWindSampling.value === 0) { this.uniforms.grassWindReady.value = 0;return; }
    const origin = FIELD_PATCHES.origin(x, z);
    if (!this.initialized) {
      this.to.origin.fromArray(origin);this.from.origin.copy(this.to.origin);this.initialized = true;
    } else if (this.elapsed === WIND_PATCH.seconds && (this.to.origin.x !== origin[0] || this.to.origin.y !== origin[1])) {
      // Keep the outgoing window alive. Retarget only after the handoff ends;
      // fast movement coalesces to the latest requested window without a reset.
      [this.from, this.to] = [this.to, this.from];this.to.origin.fromArray(origin);
      this.elapsed = 0;this.uniforms.grassWindHandoff.value = 0;this.handoffs++;
    }
    const previous = renderer.getRenderTarget();
    this.material.uniforms.grassTime.value = time;
    try {
      for (const window of this.elapsed < WIND_PATCH.seconds ? [this.from, this.to] : [this.to]) {
        this.material.uniforms.origin.value.copy(window.origin);
        renderer.setRenderTarget(window.target);renderer.render(this.scene, this.camera);this.passes++;
      }
    } finally { renderer.setRenderTarget(previous); }
    this.frameTime = time;
    this.uniforms.grassWindFrom.value = this.from.target.texture;this.uniforms.grassWindTo.value = this.to.target.texture;
    this.uniforms.grassWindFromOrigin.value.copy(this.from.origin);this.uniforms.grassWindToOrigin.value.copy(this.to.origin);
    this.uniforms.grassWindReady.value = 1;
  }
  snapshot() {
    return { enabled: this.requested, supported: this.supported, ready: Boolean(this.uniforms.grassWindReady.value),
      weight: this.uniforms.grassWindSampling.value, handoff: this.uniforms.grassWindHandoff.value,
      from: this.from.origin.toArray(), to: this.to.origin.toArray(), time: this.frameTime,
      passes: this.passes, handoffs: this.handoffs, slots: side*side, samplesPerWindow: pixels*pixels };
  }
}
