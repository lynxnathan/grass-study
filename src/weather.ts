import * as THREE from 'three';
import { GrassField } from './field';
import { heightAt, TERRAIN_SIZE, TERRAIN_SEGMENTS } from './terrain';
import { WIND } from './wind-shader';

// Weather is an authored state, not a hydrology or atmospheric scattering solver.
// Finite time constants make both direction changes and interrupted transitions continuous.
export class WeatherState {
  active = false;
  rainfall = .65;
  evening = 0;
  roughness = .22;
  blend = 0;
  rain = 0;
  night = 0;
  wetness = 0;
  time = 0;
  advance(dt: number) {
    dt = THREE.MathUtils.clamp(dt, 0, .1);
    this.time += dt;
    this.blend = THREE.MathUtils.damp(this.blend, Number(this.active), 1.7, dt);
    this.rain = THREE.MathUtils.damp(this.rain, this.active ? this.rainfall : 0, 1.8, dt);
    this.night = THREE.MathUtils.damp(this.night, this.active ? this.evening : 0, 1.15, dt);
    const wetRate = this.rain * .23, dryRate = (1 - this.rain) * .045;
    const rate = wetRate + dryRate;
    this.wetness = THREE.MathUtils.damp(this.wetness, wetRate / rate, rate, dt);
    if (!this.active && this.blend < .0001) this.blend = 0;
    if (this.rain < .0001 && (!this.active || this.rainfall === 0)) this.rain = 0;
  }
}

const SKY_VERTEX = `varying vec3 direction;
void main() { direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`;
const SKY_FRAGMENT = `
varying vec3 direction;
uniform float rain, night, blend, time;
uniform vec3 baseColor, horizon, zenith, sunDirection;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y); }
void main() {
 vec3 d=normalize(direction);
 float elevation=max(d.y,0.0);
 vec3 sky=mix(horizon,zenith,pow(elevation,.65));
 vec2 clouds=d.xz / max(.12,d.y+.3)*2.6 + vec2(time*.008, time*.003);
 float layers=noise(clouds)*.65+noise(clouds*2.13)*.35;
 float cloudCover=smoothstep(.32,.72,layers)*smoothstep(0.,.18,elevation);
 sky=mix(sky,sky*.63+vec3(.035)*(1.-night),cloudCover*rain*.8);
 float disc=pow(max(0.,dot(d,sunDirection)),850.);
 sky+=vec3(1.,.76,.44)*disc*(1.-rain*.86)*(1.-smoothstep(.65,.88,night));
 vec2 starCell=floor(vec2(atan(d.z,d.x),asin(clamp(d.y,-1.,1.)))*450.);
 float star=step(.9987,hash(starCell));
 sky+=star*vec3(.22,.28,.4)*smoothstep(.72,1.,night)*(1.-rain*.94)*smoothstep(.04,.25,elevation);
 sky=mix(baseColor,sky,blend);
 gl_FragColor=vec4(sky,1.);
 #include <colorspace_fragment>
}`;

export class Weather {
  readonly state = new WeatherState();
  private sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private rain: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private environment?: THREE.WebGLRenderTarget;
  private wetMaterials = new Map<THREE.MeshStandardMaterial, THREE.MeshPhysicalMaterial>();
  private surfaces: { mesh: THREE.Mesh; dry: THREE.MeshStandardMaterial; wet: THREE.MeshPhysicalMaterial }[] = [];
  private background = new THREE.Color('#e6ebdf');
  private horizon = new THREE.Color();
  private zenith = new THREE.Color();
  private dryHorizon = new THREE.Color('#d7e2dc');
  private stormHorizon = new THREE.Color('#687e87');
  private dayZenith = new THREE.Color('#819fae');
  private stormZenith = new THREE.Color('#354c5b');
  private duskHorizon = new THREE.Color('#a57a73');
  private nightHorizon = new THREE.Color('#26384b');
  private nightZenith = new THREE.Color('#0c172a');
  private direction = new THREE.Vector3();
  private duskLight = new THREE.Color('#ffc39a');
  private nightLight = new THREE.Color('#a9c6f0');
  private baseSun = new THREE.Vector3(-16, 30, 13);
  private panel = document.querySelector<HTMLElement>('#weather-panel')!;
  private toggle = document.querySelector<HTMLButtonElement>('#weather-toggle')!;
  private wetOutput = document.querySelector<HTMLOutputElement>('#wetness-value')!;
  private meter = document.querySelector<HTMLMeterElement>('#wetness-meter')!;
  private lastWet = -1;
  private entered = false;
  private syncControls = () => {};
  get environmentTexture() { return this.environment?.texture ?? null; }
  get environmentLight() {
    return (1-this.state.rain*.3)*(1-THREE.MathUtils.smoothstep(this.state.night,.55,1)*.82);
  }

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene,
    private grass: GrassField, terrain: THREE.Mesh, landmarks: THREE.Group,
    private sun: THREE.DirectionalLight, private ambient: THREE.HemisphereLight) {
    const skyMaterial = new THREE.ShaderMaterial({ vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false,
      uniforms: { rain: { value: 0 }, night: { value: 0 }, blend: { value: 0 }, time: { value: 0 },
        baseColor: { value: this.background }, horizon: { value: this.horizon }, zenith: { value: this.zenith }, sunDirection: { value: this.direction } } });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(120, 32, 16), skyMaterial);
    this.sky.frustumCulled = false;this.sky.renderOrder = -10;this.sky.visible = false;scene.add(this.sky);
    for (const object of [terrain, ...landmarks.children]) {
      if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) continue;
      const dry = object.material;
      let wet = this.wetMaterials.get(dry);
      if (!wet) {
        wet = new THREE.MeshPhysicalMaterial();
        THREE.MeshStandardMaterial.prototype.copy.call(wet, dry);
        wet.onBeforeCompile = dry.onBeforeCompile;wet.customProgramCacheKey = dry.customProgramCacheKey;
        wet.defines = { STANDARD: '', PHYSICAL: '' };wet.clearcoat = 1;
        this.wetMaterials.set(dry, wet);
      }
      this.surfaces.push({ mesh: object, dry, wet });
    }
    this.rain = this.createRain();scene.add(this.rain);
    this.bindControls();
  }

  private prepareEnvironment() {
    if (this.environment) return;
    // One neutral outdoor environment, prefiltered once; intensity follows daylight.
    // It represents broad sky reflections, not screen-space or ray-traced scenery.
    const environmentScene = new THREE.Scene();
    const envMaterial = new THREE.ShaderMaterial({ side: THREE.BackSide,
      vertexShader: SKY_VERTEX, fragmentShader: `varying vec3 direction;
      void main(){ vec3 d=normalize(direction);
        vec3 color=mix(vec3(.12,.15,.1),vec3(.65,.8,.95),smoothstep(-.18,.65,d.y));
        color+=vec3(2.)*pow(max(0.,dot(d,normalize(vec3(-.4,.6,-.7)))),12.);
        gl_FragColor=vec4(color,1.); }` });
    const envSphere = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), envMaterial);environmentScene.add(envSphere);
    const generator = new THREE.PMREMGenerator(this.renderer);
    this.environment = generator.fromScene(environmentScene, .04);
    generator.dispose();envSphere.geometry.dispose();envMaterial.dispose();
    for (const wet of this.wetMaterials.values()) wet.envMap = this.environment.texture;
  }

  private createRain() {
    const count = 16000, roots = new Float32Array(count * 4);
    let seed = 93279;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < count; i++) roots.set([(random()-.5)*48, (random()-.5)*48, random(), random()], i*4);
    const geometry = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1,1);
    geometry.setIndex(quad.index);geometry.setAttribute('position',quad.getAttribute('position'));geometry.setAttribute('uv',quad.getAttribute('uv'));
    geometry.setAttribute('drop', new THREE.InstancedBufferAttribute(roots,4));geometry.instanceCount=count;
    const width = TERRAIN_SEGMENTS+1, heights = new Float32Array(width*width);
    for(let z=0;z<width;z++) for(let x=0;x<width;x++) heights[z*width+x]=heightAt(x-TERRAIN_SIZE/2,z-TERRAIN_SIZE/2);
    const terrain = new THREE.DataTexture(heights,width,width,THREE.RedFormat,THREE.FloatType);
    terrain.needsUpdate=true;terrain.magFilter=terrain.minFilter=THREE.NearestFilter;
    const material = new THREE.ShaderMaterial({ transparent:true,depthWrite:false,
      uniforms: { ...this.grass.winds.uniforms, grassTime:{value:0},grassMode:{value:9},grassContact:{value:this.grass.interaction.texture},
        rainAmount:{value:0},lightAmount:{value:1},heightMap:{value:terrain},pixelWidth:{value:1280},pixelRatio:{value:1} },
      vertexShader: WIND+`
      attribute vec4 drop;
      uniform float rainAmount,pixelWidth,pixelRatio;
      uniform sampler2D heightMap;
      varying vec2 dropUv;varying float visibility;
      float ground(vec2 p){vec2 grid=clamp(p+100.,vec2(0),vec2(199.999));ivec2 i=ivec2(floor(grid));vec2 f=fract(grid);
        float a=texelFetch(heightMap,i,0).r,b=texelFetch(heightMap,i+ivec2(1,0),0).r;
        float c=texelFetch(heightMap,i+ivec2(0,1),0).r,d=texelFetch(heightMap,i+ivec2(1,1),0).r;
        return f.x+f.y<=1.?a+(b-a)*f.x+(c-a)*f.y:d+(c-d)*(1.-f.x)+(b-d)*(1.-f.y);}
      void main(){
        dropUv=uv;
        float phase=fract(drop.z+grassTime*(.52+drop.w*.2));
        // Reuse a uniform world-space rain volume around the view. A seed
        // stays at the same world position until it wraps outside the fade.
        vec2 root=cameraPosition.xz+mod(drop.xy-cameraPosition.xz+24.,48.)-24.;
        vec2 wind=grassWind(root);
        vec2 xz=root+wind*phase*3.;
        float h=24.*(1.-phase);
        float streak=.35+drop.w*.5;
        vec3 p=vec3(xz.x,ground(xz)+h,xz.y);
        vec4 mv=modelViewMatrix*vec4(p,1.);
        vec4 top=modelViewMatrix*vec4(p+vec3(-wind.x*.11,streak,-wind.y*.11),1.);
        mv=mix(mv,top,uv.y);
        vec4 clip=projectionMatrix*mv;
        // A CSS-pixel footprint survives high-DPI downsampling. Nearby streaks
        // have a little body; distance reduces their width and opacity together.
        float distanceToCamera=distance(cameraPosition,p);
        float strokeWidth=mix(2.8,1.4,smoothstep(5.,65.,distanceToCamera));
        clip.x+=(uv.x-.5)*2.*strokeWidth*pixelRatio/pixelWidth*clip.w;
        gl_Position=clip;
        visibility=smoothstep(drop.w-.07,drop.w+.07,rainAmount)*smoothstep(0.,.15,rainAmount);
        visibility*=smoothstep(.6,2.,distanceToCamera)*(1.-smoothstep(18.,23.,distanceToCamera));
        visibility*=1.-smoothstep(18.,23.,distance(cameraPosition.xz,root));
        visibility*=smoothstep(0.,.8,h)*(1.-smoothstep(22.,24.,h));
      }`,
      fragmentShader:`varying vec2 dropUv;varying float visibility;uniform float lightAmount;
      void main(){float edge=1.-abs(dropUv.x*2.-1.);float tail=sin(dropUv.y*3.14159265);
        float alpha=smoothstep(0.,.6,edge)*tail*visibility*.72;
        if(alpha<.003)discard;
        gl_FragColor=vec4(vec3(2.2,2.5,2.8)*lightAmount,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
    const rain = new THREE.Mesh(geometry,material);rain.frustumCulled=false;rain.renderOrder=2;rain.visible=false;rain.name='rain-streaks';return rain;
  }

  setMode(mode: number) {
    this.state.active = mode >= 9;
    if(this.state.active && !this.entered) {
      this.entered=true;if(mode>=10)this.state.rainfall=0;this.syncControls();
    }
    this.toggle.hidden = !this.state.active;this.open(false);
    if (this.state.active) this.prepareEnvironment();
  }

  private open(value: boolean) {
    const heldFocus = this.panel.contains(document.activeElement);
    this.panel.hidden = !value;this.toggle.setAttribute('aria-expanded',String(value));
    if(value)document.dispatchEvent(new Event('weatheropened'));
    else if(heldFocus)document.querySelector<HTMLCanvasElement>('#world')!.focus({preventScroll:true});
  }

  private bindControls() {
    const rain = document.querySelector<HTMLInputElement>('#rain-amount')!;
    const night = document.querySelector<HTMLInputElement>('#evening')!;
    const rough = document.querySelector<HTMLInputElement>('#wet-roughness')!;
    const stop = document.querySelector<HTMLButtonElement>('#rain-stop')!;
    const sync = () => {
      rain.value=String(this.state.rainfall);night.value=String(this.state.evening);rough.value=String(this.state.roughness);
      document.querySelector('#rain-value')!.textContent=`${Math.round(this.state.rainfall*100)}%`;
      document.querySelector('#evening-value')!.textContent=this.state.evening<.2?'Daylight':this.state.evening<.7?'Evening':'Night';
      document.querySelector('#roughness-value')!.textContent=this.state.roughness.toFixed(2);
      stop.textContent=this.state.rainfall>0?'Stop rain':'Bring back rain';
    };
    rain.oninput=()=>{this.state.rainfall=rain.valueAsNumber;sync();};
    night.oninput=()=>{this.state.evening=night.valueAsNumber;sync();};
    rough.oninput=()=>{this.state.roughness=rough.valueAsNumber;sync();};
    stop.onclick=()=>{this.state.rainfall=this.state.rainfall>0?0:.65;sync();};
    document.querySelector<HTMLButtonElement>('#weather-reset')!.onclick=()=>{
      this.state.rainfall=.65;this.state.evening=0;this.state.roughness=.22;sync();
    };
    this.toggle.onclick=()=>this.open(Boolean(this.panel.hidden));
    document.querySelector<HTMLButtonElement>('#weather-close')!.onclick=()=>{this.open(false);this.toggle.focus();};
    for(const event of ['readingopened','controlsopened','coveropened']) document.addEventListener(event,()=>this.open(false));
    document.querySelector('#wind-toggle')!.addEventListener('click',()=>this.open(false));
    window.addEventListener('keydown',e=>{if(e.key==='Escape')this.open(false);});
    this.syncControls=sync;sync();
  }

  update(dt: number,camera: THREE.Camera,sunOffset: THREE.Vector3) {
    this.state.advance(dt);
    const s=this.state;
    if (!s.active && !s.blend && !s.rain && !this.sky.visible) return;
    const dusk=Math.sin(Math.PI*s.night), night=THREE.MathUtils.smoothstep(s.night,.55,1);
    this.horizon.copy(this.dryHorizon).lerp(this.stormHorizon,s.rain).lerp(this.duskHorizon,dusk*.45).lerp(this.nightHorizon,night);
    this.zenith.copy(this.dayZenith).lerp(this.stormZenith,s.rain).lerp(this.nightZenith,night);
    sunOffset.set(-16,30*(1-s.night)+5*s.night, -30).lerp(this.baseSun,1-s.blend);
    this.direction.copy(sunOffset).normalize();
    const u=this.sky.material.uniforms;u.rain.value=s.rain;u.night.value=s.night;u.blend.value=s.blend;u.time.value=s.time;
    this.sky.position.copy(camera.position);this.sky.visible=s.blend>0;
    const fog=this.scene.fog as THREE.Fog;
    fog.color.copy(this.background).lerp(this.horizon,s.blend);
    fog.near=THREE.MathUtils.lerp(45,28,s.rain);fog.far=THREE.MathUtils.lerp(105,80,s.rain);
    this.sun.color.set('#fff0ce').lerp(this.duskLight,dusk*.55*s.blend).lerp(this.nightLight,night*s.blend);
    this.sun.intensity=THREE.MathUtils.lerp(2.4,2.4*(1-s.rain*.64)*(1-night*.92),s.blend);
    this.ambient.intensity=THREE.MathUtils.lerp(1.8,1.35*(1-s.rain*.32)*(1-night*.75),s.blend);
    const environmentLight=(1-s.rain*.3)*(1-night*.82);
    this.grass.setWetSurface(s.wetness,s.roughness,this.environment!.texture,environmentLight);
    const surfaceWetness = s.wetness*s.blend;
    for (const item of this.surfaces) item.mesh.material = s.blend > 0 ? item.wet : item.dry;
    for(const [dry, wet] of this.wetMaterials){
      wet.color.copy(dry.color).multiplyScalar(1-surfaceWetness*.42);
      wet.roughness=THREE.MathUtils.lerp(dry.roughness,Math.min(.85,s.roughness+.12),surfaceWetness);
      wet.clearcoat=Math.max(.0001,surfaceWetness*.95);wet.clearcoatRoughness=s.roughness;
      wet.envMapIntensity=environmentLight*s.blend;
    }
    const r=this.rain.material.uniforms;r.grassTime.value=this.grass.time;r.rainAmount.value=s.rain;r.lightAmount.value=1-night*.55;
    r.pixelWidth.value=this.renderer.domElement.width;r.pixelRatio.value=this.renderer.getPixelRatio();this.rain.visible=s.rain>0;
    const wet=Math.round(s.wetness*100);
    if(wet!==this.lastWet){this.lastWet=wet;this.wetOutput.textContent=wet?`${wet}%`:'Dry';this.meter.value=s.wetness;}
  }

  snapshot(){return {...this.state,rainVisible:this.rain.visible,rainInstances:this.rain.visible?this.rain.geometry.instanceCount:0,
    skyVisible:this.sky.visible,skyColor:this.horizon.toArray(),fogColor:(this.scene.fog as THREE.Fog).color.toArray(),
    sunIntensity:this.sun.intensity,groundMaterial:(this.surfaces[0].mesh.material as THREE.Material).type,
    groundRoughness:this.surfaces[0].wet.roughness,groundClearcoat:this.surfaces[0].wet.clearcoat};}
}
