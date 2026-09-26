import * as THREE from 'three';
import { GrassField } from './field';
import { heightAt } from './terrain';
import { FIELD_PATCHES } from './patch-grid';
import { WIND } from './wind-shader';
import { WIND_PATCH_LOOKUP } from './wind-patches';
import { grassProjectionScale } from './grass-lod';
import { FORCE_VIEW_VERTEX, FORCE_VIEW_FRAGMENT, FORCE_VIEW_VARYING } from './force-view-shader';
import { coverMask, COVER_SURFACE } from './cover-shader';

type Patch = { group: THREE.Group; bounds: THREE.Box3; restRadius: number };
type Kind = 'opaque' | 'cards' | 'shells' | 'fins' | 'implicit';

function textures() {
  let seed=712367;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#677c3c';ctx.fillRect(0,0,512,512);
  for(let i=0;i<16000;i++) {
    const x=random()*512,z=random()*512,angle=random()*Math.PI*2,length=2+random()*9;
    ctx.strokeStyle=['#84934c','#566e33','#748844','#a1a660'][i%5];ctx.lineWidth=.6+random()*1.2;
    // Wrap strokes at the tile boundary so bilinear filtering has no painted seam.
    for(const dx of [-512,0,512])for(const dz of [-512,0,512]){
      ctx.beginPath();ctx.moveTo(x+dx,z+dz);ctx.lineTo(x+dx+Math.cos(angle)*length,z+dz+Math.sin(angle)*length);ctx.stroke();
    }
  }
  const color=new THREE.CanvasTexture(canvas);color.colorSpace=THREE.SRGBColorSpace;
  color.wrapS=color.wrapT=THREE.RepeatWrapping;color.anisotropy=8;
  // Height cross-sections of tapered, elliptical strands. 40 x 40 roots per 2 m tile.
  const size=512, data=new Uint8Array(size*size*4), roots:number[][]=[];
  for(let z=0;z<40;z++)for(let x=0;x<40;x++)roots.push([(x+.25+random()*.5)/40,(z+.25+random()*.5)/40,.55+random()*.45,random()*Math.PI*2]);
  for(const [x,z,h,a] of roots) {
    const cx=x*size,cz=z*size;
    for(let iz=Math.floor(cz-8);iz<=cz+8;iz++)for(let ix=Math.floor(cx-8);ix<=cx+8;ix++){
      const dx=ix+.5-cx,dz=iz+.5-cz;
      const u=(dx*Math.cos(a)+dz*Math.sin(a))/6.7,v=(-dx*Math.sin(a)+dz*Math.cos(a))/2.6;
      const height=Math.max(0,1-u*u-v*v)*h;
      const i=(((iz+size)%size)*size+(ix+size)%size)*4;
      data[i]=Math.max(data[i],Math.round(height*255));data[i+3]=255;
    }
  }
  const height=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  height.wrapS=height.wrapT=THREE.RepeatWrapping;height.magFilter=THREE.LinearFilter;
  height.minFilter=THREE.LinearMipmapLinearFilter;height.generateMipmaps=true;height.needsUpdate=true;height.anisotropy=8;
  const card=document.createElement('canvas');card.width=card.height=256;
  const c=card.getContext('2d')!;
  for(let i=0;i<36;i++) {
    const x=random()*256,tip=x+(random()-.5)*85,top=5+random()*90,w=1.5+random()*3;
    c.fillStyle=['#80964d','#9aaa64','#627c3c'][i%3];
    c.beginPath();c.moveTo(x-w,256);c.quadraticCurveTo(x-w,80,tip,top);c.quadraticCurveTo(x+w,110,x+w,256);c.fill();
  }
  const cutout=new THREE.CanvasTexture(card);cutout.colorSpace=THREE.SRGBColorSpace;cutout.anisotropy=8;
  return { color,height,cutout };
}

export class GroundCover {
  readonly root=new THREE.Group();
  readonly maps=textures();
  readonly uniforms={
    turfColorMap:{value:this.maps.color},turfHeightMap:{value:this.maps.height},
    turfActive:{value:0},turfFoundation:{value:1},turfCoverage:{value:1},turfProjection:{value:1},
    turfMaskView:{value:0},turfWet:{value:0},turfSteps:{value:12},turfReveal:{value:0},
    turfView:{value:new THREE.Matrix4()},turfProjectionMatrix:{value:new THREE.Matrix4()},
  };
  private groups=new Map<Kind,THREE.Group>();
  private patches=new Map<Kind,Patch[]>();
  private materials=new Map<Kind,THREE.MeshPhysicalMaterial>();
  private created=false;
  private boundsRevision=-1;
  mode=0;
  foundation=true;
  anchor=true;
  lower=true;
  fins=true;
  tuftKind:'opaque'|'cards'='opaque';
  shellCount=12;
  sampleCount=24;
  reveal=0;
  sampleView=false;

  constructor(readonly field:GrassField,readonly terrain:THREE.Mesh) {
    this.root.name='ground-cover';
    this.attachFoundation(terrain.material as THREE.MeshStandardMaterial);
  }

  private attachFoundation(material:THREE.MeshStandardMaterial) {
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,this.field.uniforms,this.uniforms);
      shader.vertexShader=WIND+WIND_PATCH_LOOKUP+FORCE_VIEW_VERTEX+FORCE_VIEW_VARYING+`uniform float turfActive,turfProjection;
        varying vec3 turfWorld,turfUp;varying vec2 turfMotion;varying float turfHeight;
`+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        turfWorld=position;turfUp=normal;turfHeight=0.0;turfMotion=vec2(0);
        grassForces=vec2(0.0);
        if(turfActive>.0) {
          float rootDistance=distance(cameraPosition,position)/turfProjection;
          vec2 wind=grassPatchWind(position.xz,rootDistance), contact=grassContactOffset(position.xz);
          turfMotion=wind+contact;
          grassForces=grassForceResponse(wind,contact,grassMode,rootDistance);
        }
      `);
      shader.fragmentShader=FORCE_VIEW_FRAGMENT+FORCE_VIEW_VARYING+COVER_SURFACE+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float turfWeight=turfActive*turfFoundation*turfCoverage*turfMask(turfWorld.xz);
        vec3 foundationColor=turfColor(turfWorld.xz)*(1.0-turfWet*.32);
        diffuseColor.rgb=mix(diffuseColor.rgb,foundationColor,turfWeight);
        grassForceColor(diffuseColor.rgb,totalEmissiveRadiance,grassForces*turfWeight,0.0);
      `);
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        if(turfWeight>.0) {
          float h=texture2D(turfHeightMap,(turfWorld.xz-turfMotion*.018)/2.0).r;
          normal=normalize(mix(normal,turfBump(normal,-vViewPosition,h*.009),turfWeight));
        }
      `);
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>', 'if(turfMaskView>.5)outgoingLight=vec3(0.0);\n#include <opaque_fragment>');
    };
    material.customProgramCacheKey=()=> 'turf-foundation-v1';
    material.needsUpdate=true;
  }

  private material(kind:Kind) {
    const material=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.91,side:THREE.DoubleSide,clearcoat:.0001});
    if(kind==='cards'){material.map=this.maps.cutout;material.alphaTest=.03;material.alphaToCoverage=true;}
    if(kind==='shells'||kind==='fins'||kind==='implicit'){material.alphaTest=.03;material.alphaToCoverage=true;}
    if(material.alphaToCoverage){
      // Covered samples replace RGB while preserving the opaque destination's
      // alpha. Otherwise a canvas with an alpha channel exposes the page through
      // fractional-alpha samples and produces bright fringes after compositing.
      material.blending=THREE.CustomBlending;material.blendSrc=THREE.OneFactor;material.blendDst=THREE.ZeroFactor;
      material.blendSrcAlpha=THREE.ZeroFactor;material.blendDstAlpha=THREE.OneFactor;
    }
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,this.field.uniforms,this.uniforms);
      const instanced=kind==='opaque'||kind==='cards';
      const declarations=`uniform float turfProjection,turfSteps,turfReveal;
        varying vec3 turfWorld,turfUp;varying vec2 turfMotion;varying float turfHeight;
        ${instanced?'attribute vec4 turfRoot;attribute vec4 turfShape;':''}
        ${kind==='shells'?'attribute float turfLayer;':''}
      `;
      shader.vertexShader=WIND+WIND_PATCH_LOOKUP+FORCE_VIEW_VERTEX+FORCE_VIEW_VARYING+declarations+shader.vertexShader;
      let setup='';
      if(instanced) setup=`
        vec3 up=normalize(vec3(turfShape.x,1.0,turfShape.y));
        vec3 sx=normalize(vec3(cos(turfShape.z),-dot(up.xz,vec2(cos(turfShape.z),sin(turfShape.z)))/up.y,sin(turfShape.z)));
        vec3 sz=normalize(cross(sx,up));
        float distanceToRoot=distance(cameraPosition,turfRoot.xyz)/turfProjection;
        float detail=1.0-smoothstep(18.0,42.0,distanceToRoot);
        vec2 wind=grassPatchWind(turfRoot.xz,distanceToRoot), contact=grassContactOffset(turfRoot.xz);
        vec2 motion=wind+contact;
        grassForces=grassForceResponse(wind,contact,grassMode,distanceToRoot);
        vec3 local=sx*position.x+up*position.y+sz*position.z;
        turfHeight=uv.y;turfUp=up;turfMotion=motion;
        vec3 offset=local*turfRoot.w*detail;
        offset.xz+=motion*.20*turfHeight*turfHeight*detail;
        turfWorld=turfRoot.xyz+offset;
        vec3 objectNormal=normalize(up*.8+(sx*normal.x+up*normal.y+sz*normal.z)*.2);
      `;
      else setup=`
        vec3 up=normalize(normal);
        float distanceToRoot=distance(cameraPosition,position)/turfProjection;
        float detail=1.0-smoothstep(18.0,42.0,distanceToRoot);
        vec2 wind=grassPatchWind(position.xz,distanceToRoot), contact=grassContactOffset(position.xz);
        vec2 motion=wind+contact;
        grassForces=grassForceResponse(wind,contact,grassMode,distanceToRoot);
        turfHeight=${kind==='shells'?'(turfLayer+1.0)/turfSteps':kind==='fins'?'uv.y':'1.0'};
        turfUp=up;turfMotion=motion;
        float lift=.20*turfHeight*detail;
        ${kind==='shells'?'lift*=1.0+turfReveal*5.0;':''}
        turfWorld=position+up*lift;
        ${kind==='implicit'?'':'turfWorld.xz+=motion*.20*turfHeight*turfHeight*detail;'}
        vec3 objectNormal=up;
      `;
      shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',setup);
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
        vec4 mvPosition=viewMatrix*vec4(turfWorld,1.0);gl_Position=projectionMatrix*mvPosition;
      `);
      shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','vec4 worldPosition=vec4(turfWorld,1.0);');
      shader.fragmentShader=FORCE_VIEW_FRAGMENT+FORCE_VIEW_VARYING+COVER_SURFACE+`uniform mat4 turfView,turfProjectionMatrix;
`+shader.fragmentShader;
      let surface='';
      if(instanced)surface=`
        float mask=turfMask(turfWorld.xz);
        if(mask<.02) discard;
        vec3 base=turfColor(turfWorld.xz);
        ${kind==='cards'?'diffuseColor.rgb=mix(base,diffuseColor.rgb,.35);':'diffuseColor.rgb=base*mix(.76,1.3,turfHeight);'}
        diffuseColor.rgb*=1.0-turfWet*.32;
        diffuseColor.a*=mask;
      `;
      else if(kind==='shells'||kind==='fins') surface=`
        float detail=turfRange(turfWorld);
        // Undo the normal extrusion before looking up a strand's fixed root.
        // This also keeps the same strands on the separated explanatory slices.
        vec2 section=turfWorld.xz-normalize(turfUp).xz*.20*turfHeight*detail${kind==='shells'?'*(1.0+turfReveal*5.0)':''};
        float alpha=turfVolume(section,turfHeight,turfMotion,detail)*turfMask(section);
        ${kind==='fins'?`alpha*=1.0-smoothstep(.2,.65,abs(dot(normalize(cameraPosition-turfWorld),normalize(turfUp))));`:''}
        diffuseColor.a*=alpha;
        if(diffuseColor.a<.03)discard;
        diffuseColor.rgb=turfColor(turfWorld.xz)*mix(.7,1.3,turfHeight)*(1.0-turfWet*.32);
        ${kind==='shells'?'diffuseColor.rgb=mix(diffuseColor.rgb,mix(vec3(.12,.32,.6),vec3(.8,.65,.2),turfHeight),turfReveal*.8);':''}
      `;
      else surface=`
        float detail=turfRange(turfWorld),mask=turfMask(turfWorld.xz);
        if(detail<.001||mask<.02)discard;
        vec3 up=normalize(turfUp),ray=normalize(turfWorld-cameraPosition);
        float downward=max(.08,-dot(ray,up));
        float volumeHeight=.20*detail;
        // Local tangent-plane volume: a bounded horizontal-slice traversal.
        // This is not Habel's crossed-grid DDA; the shared volume matches study 12.
        float steps=max(4.0,floor(mix(4.0,turfSteps,detail)+.5));
        // Explicit LOD keeps filtering defined after neighboring rays take
        // different early exits. Implicit derivatives inside that loop do not.
        float footprint=max(length(dFdx(turfWorld.xz)),length(dFdy(turfWorld.xz)))*256.0;
        float mip=max(0.0,log2(max(1.0,footprint)));
        vec3 accumulated=vec3(0),hit=turfWorld+ray*(volumeHeight/downward);
        float opacity=0.0,visited=0.0;bool found=false;
        for(int i=0;i<48;i++) {
          if(float(i)>=steps||opacity>.98)break;
          float h=1.0-(float(i)+.5)/steps;
          vec3 p=turfWorld+ray*(volumeHeight*(1.0-h)/downward);
          vec2 root=p.xz-up.xz*.20*detail*h-turfMotion*.20*detail*h*h;
          float top=textureLod(turfHeightMap,root/2.0,mip).r;
          float a=smoothstep(h-.04,h+.04,top)*smoothstep(.0,.06,top)*turfMask(p.xz);
          a=1.0-pow(max(0.0,1.0-a),24.0/steps);
          vec3 c=textureLod(turfColorMap,p.xz/2.0,mip).rgb*mix(.7,1.3,h);
          accumulated+=(1.0-opacity)*a*c;
          if(!found&&a>.5){hit=p;found=true;}
          opacity+=(1.0-opacity)*a;visited+=1.0;
        }
        vec3 bottom=turfWorld+ray*(volumeHeight/downward);
        accumulated+=(1.0-opacity)*turfColor(bottom.xz);
        float angle=smoothstep(.08,.22,-dot(ray,up));
        diffuseColor.rgb=mix(turfColor(bottom.xz),accumulated,angle*mask)*(1.0-turfWet*.32);
        diffuseColor.a*=mask;
        if(turfReveal>.5)diffuseColor.rgb=mix(vec3(.12,.35,.65),vec3(.95,.4,.08),visited/48.0);
        hit=mix(bottom,hit,angle*mask);
        vec4 clip=turfProjectionMatrix*turfView*vec4(hit,1.0);
        gl_FragDepth=clamp(clip.z/clip.w*.5+.5,0.0,1.0);
      `;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 turfTransition();
${surface}
 grassForceColor(diffuseColor.rgb,totalEmissiveRadiance,grassForces,0.0);`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>', 'if(turfMaskView>.5)outgoingLight=vec3(1.0);\n#include <opaque_fragment>');
      // Explanatory colors encode work/height, independent of the scene's light.
      if(kind==='implicit')shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>', `#include <tonemapping_fragment>
        if(turfReveal>.5&&turfMaskView<.5)gl_FragColor.rgb=mix(vec3(.015,.12,.6),vec3(.85,.12,.006),visited/48.0);
      `);
      if(kind==='shells')shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>', `#include <tonemapping_fragment>
        if(turfMaskView<.5)gl_FragColor.rgb=mix(gl_FragColor.rgb,mix(vec3(.025,.16,.5),vec3(.8,.4,.03),turfHeight),turfReveal);
      `);
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        vec3 viewUp=normalize(mat3(viewMatrix)*normalize(turfUp));
        if(dot(normal,viewUp)<0.0)normal=-normal;
      `);
    };
    material.customProgramCacheKey=()=>`ground-cover-${kind}-v1`;
    this.materials.set(kind,material);return material;
  }

  private build() {
    if(this.created)return;this.created=true;
    for(const kind of ['opaque','cards','shells','fins','implicit'] as Kind[]){
      const group=new THREE.Group();group.name=`turf-${kind}`;this.groups.set(kind,group);this.patches.set(kind,[]);this.root.add(group);this.material(kind);
    }
    // Resident, deterministic roots. Patches only choose visibility; the camera never replants grass.
    const roots=new Map<string,number[]>();
    const rand=(x:number,z:number,s:number)=>{const v=Math.sin(x*127.1+z*311.7+s*73.9)*43758.5453;return v-Math.floor(v);};
    for(let z=-80;z<80;z+=.42)for(let x=-80;x<80;x+=.42){
      const px=x+rand(x,z,1)*.35,pz=z+rand(x,z,2)*.35;
      if(rand(x,z,3)>coverMask(px,pz))continue;
      const key=FIELD_PATCHES.key(px,pz),list=roots.get(key)??[];
      const nx=-(heightAt(px+.1,pz)-heightAt(px-.1,pz))/.2,nz=-(heightAt(px,pz+.1)-heightAt(px,pz-.1))/.2;
      list.push(px,heightAt(px,pz)-.008,pz,.8+rand(x,z,4)*.4,nx,nz,rand(x,z,5)*Math.PI*2,rand(x,z,6));roots.set(key,list);
    }
    const opaque=this.tuftGeometry(false),cards=this.tuftGeometry(true);
    for(const [key,values] of roots){
      const [cx,cz]=key.split(',').map(Number),x=cx*12,z=cz*12;
      const bounds=new THREE.Box3(new THREE.Vector3(x,-20,z),new THREE.Vector3(x+12,25,z+12));
      const r=new Float32Array(values.length/2),s=new Float32Array(values.length/2);
      for(let i=0;i<values.length/8;i++){r.set(values.slice(i*8,i*8+4),i*4);s.set(values.slice(i*8+4,i*8+8),i*4);}
      const rootAttribute=new THREE.InstancedBufferAttribute(r,4),shapeAttribute=new THREE.InstancedBufferAttribute(s,4);
      for(const kind of ['opaque','cards'] as const){
        const base=kind==='opaque'?opaque:cards,geometry=new THREE.InstancedBufferGeometry();
        geometry.index=base.index;geometry.attributes={...base.attributes};
        geometry.setAttribute('turfRoot',rootAttribute);geometry.setAttribute('turfShape',shapeAttribute);geometry.instanceCount=values.length/8;
        this.addPatch(kind,geometry,bounds);
      }
      const surface=this.surfaceGeometry(x,z,false);
      const shell=new THREE.InstancedBufferGeometry();shell.index=surface.index;shell.attributes={...surface.attributes};
      shell.setAttribute('turfLayer',new THREE.InstancedBufferAttribute(Float32Array.from({length:24},(_,i)=>i),1));shell.instanceCount=this.shellCount;
      this.addPatch('shells',shell,bounds);
      this.addPatch('fins',this.surfaceGeometry(x,z,true),bounds);
      this.addPatch('implicit',surface,bounds);
    }
  }

  private addPatch(kind:Kind,geometry:THREE.BufferGeometry,bounds:THREE.Box3){
    const mesh=new THREE.Mesh(geometry,this.materials.get(kind)!);mesh.receiveShadow=true;
    geometry.boundingSphere=bounds.getBoundingSphere(new THREE.Sphere());
    const group=new THREE.Group();group.add(mesh);this.groups.get(kind)!.add(group);
    this.patches.get(kind)!.push({group,bounds,restRadius:geometry.boundingSphere.radius});
  }

  private tuftGeometry(cards:boolean){
    const p:number[]=[],uv:number[]=[],indices:number[]=[];
    const count=cards?2:9;
    for(let i=0;i<count;i++){
      const angle=i*2.39996,side=new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));
      const root=new THREE.Vector3(Math.sin(i*1.7)*.12,0,Math.cos(i*1.3)*.12);
      const width=cards?.54:.036,height=cards?.20:.11+(i%4)*.025,segments=cards?1:2;
      const start=p.length/3;
      for(let j=0;j<=segments;j++)for(let edge=0;edge<2;edge++){
        const h=j/segments,w=cards?width:width*(1-h*.94);
        const v=root.clone().addScaledVector(side,(edge-.5)*w).add(new THREE.Vector3(Math.cos(angle)*h*h*.055,h*height,Math.sin(angle)*h*h*.055));
        p.push(v.x,v.y,v.z);uv.push(edge,h);
      }
      for(let j=0;j<segments;j++){const a=start+j*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
  }

  private surfaceGeometry(x:number,z:number,fins:boolean){
    const p:number[]=[],n:number[]=[],uv:number[]=[],indices:number[]=[];
    const vertex=(px:number,pz:number,h:number)=>{
      p.push(px,heightAt(px,pz)+.002,pz);
      const up=new THREE.Vector3(-(heightAt(px+.05,pz)-heightAt(px-.05,pz))/.1,1,-(heightAt(px,pz+.05)-heightAt(px,pz-.05))/.1).normalize();
      n.push(...up.toArray());uv.push(0,h);
    };
    if(!fins){
      for(let iz=0;iz<=12;iz++)for(let ix=0;ix<=12;ix++)vertex(x+ix,z+iz,0);
      for(let iz=0;iz<12;iz++)for(let ix=0;ix<12;ix++){const a=iz*13+ix;indices.push(a,a+13,a+1,a+1,a+13,a+14);}
    }else{
      for(let dir=0;dir<2;dir++)for(let line=.35;line<12;line+=.7){
        const start=p.length/3;
        for(let j=0;j<=24;j++)for(let h=0;h<=1;h++)vertex(x+(dir?line:j*.5),z+(dir?j*.5:line),h);
        for(let j=0;j<24;j++){const a=start+j*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
      }
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);return g;
  }

  setMode(mode:number){this.mode=mode;if(mode>=10)this.build();this.root.visible=mode>=11;this.uniforms.turfActive.value=Number(mode>=10);this.sync();}
  sync(){
    this.uniforms.turfFoundation.value=Number(this.foundation);
    this.uniforms.turfSteps.value=this.mode===12?this.shellCount:this.sampleCount;
    this.uniforms.turfReveal.value=this.mode===12?this.reveal:Number(this.sampleView);
    this.field.anchorVisible=this.mode<10||this.anchor;
    for(const [kind,group] of this.groups)group.visible=this.lower&&(
      this.mode===11&&kind===this.tuftKind||this.mode===12&&(kind==='shells'||kind==='fins'&&this.fins)||this.mode===13&&kind==='implicit');
    for(const patch of this.patches.get('shells')??[])(patch.group.children[0] as THREE.Mesh<THREE.InstancedBufferGeometry>).geometry.instanceCount=this.shellCount;
  }
  setCoverage(value:number){this.uniforms.turfCoverage.value=value;}
  update(camera:THREE.Camera,viewportHeight:number,wetness:number,roughness:number,environment:THREE.Texture|null,environmentLight=1){
    if(this.mode<10)return;
    if(this.boundsRevision!==this.field.winds.revision){
      const padding=1.5+this.field.winds.maximumDisplacement*.20;
      for(const patches of this.patches.values())for(const patch of patches){
        (patch.group.children[0] as THREE.Mesh).geometry.boundingSphere!.radius=patch.restRadius+padding;
      }
      this.boundsRevision=this.field.winds.revision;
    }
    const projection=grassProjectionScale(camera.projectionMatrix.elements[5],viewportHeight);this.uniforms.turfProjection.value=projection;
    this.uniforms.turfView.value.copy(camera.matrixWorldInverse);this.uniforms.turfProjectionMatrix.value.copy(camera.projectionMatrix);this.uniforms.turfWet.value=wetness;
    for(const material of this.materials.values()){
      material.roughness=THREE.MathUtils.lerp(.91,roughness,wetness);material.clearcoat=Math.max(.0001,wetness*.85);
      material.clearcoatRoughness=Math.max(.12,roughness*.7);material.envMapIntensity=environmentLight;
      if(material.envMap!==environment){material.envMap=environment;material.needsUpdate=true;}
    }
    for(const [kind,patches] of this.patches){
      if(!this.groups.get(kind)!.visible)continue;
      for(const patch of patches)patch.group.visible=patch.bounds.distanceToPoint(camera.position)/projection<43;
    }
  }
  snapshot(){return {mode:this.mode,foundation:this.foundation,anchor:this.anchor,lower:this.lower,tuftKind:this.tuftKind,
    shellCount:this.shellCount,sampleCount:this.sampleCount,reveal:this.reveal,sampleView:this.sampleView,fins:this.fins,
    coverage:this.uniforms.turfCoverage.value,active:this.uniforms.turfActive.value,
    layers:[...this.groups].filter(([,g])=>this.root.visible&&g.visible).map(([k])=>k),
    patches:[...this.patches].map(([kind,p])=>({kind,visible:p.filter(x=>x.group.visible).length,total:p.length}))};}
}
