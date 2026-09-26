import * as THREE from 'three';
import { GroundCover } from './ground-cover';

// Each control names the visible construction, with one panel at a time.
export class CoverControls {
  private panel=document.querySelector<HTMLElement>('#cover-panel')!;
  private toggle=document.querySelector<HTMLButtonElement>('#cover-toggle')!;
  private stones=new THREE.Group();
  private nextId=0;
  placing=false;
  constructor(private cover:GroundCover,scene:THREE.Scene){
    this.stones.name='contact-stones';scene.add(this.stones);
    this.toggle.onclick=()=>this.open(Boolean(this.panel.hidden));
    document.querySelector<HTMLButtonElement>('#cover-close')!.onclick=()=>{this.open(false);this.toggle.focus();};
    for(const event of ['readingopened','controlsopened','weatheropened'])document.addEventListener(event,()=>this.open(false));
    document.querySelector('#wind-toggle')!.addEventListener('click',()=>this.open(false));
    window.addEventListener('keydown',e=>{if(e.key==='Escape'){this.cancelPlacement();this.open(false);}});
    const checkbox=(id:string,set:(value:boolean)=>void)=>{
      const input=document.querySelector<HTMLInputElement>(id)!;input.onchange=()=>{set(input.checked);cover.sync();};
    };
    checkbox('#cover-foundation',v=>cover.foundation=v);checkbox('#cover-anchor',v=>cover.anchor=v);
    checkbox('#cover-lower',v=>cover.lower=v);checkbox('#cover-fins',v=>cover.fins=v);checkbox('#cover-sample-view',v=>cover.sampleView=v);
    const tuft=document.querySelector<HTMLSelectElement>('#cover-tuft')!;
    tuft.onchange=()=>{cover.tuftKind=tuft.value as 'opaque'|'cards';cover.sync();};
    const range=(id:string,set:(v:number)=>void)=>{
      const input=document.querySelector<HTMLInputElement>(id)!;input.oninput=()=>{
        set(input.valueAsNumber);const output=document.querySelector(`${id}-value`);if(output)output.textContent=input.value;cover.sync();
      };
    };
    range('#cover-shells',v=>cover.shellCount=v);range('#cover-separate',v=>cover.reveal=v);range('#cover-samples',v=>cover.sampleCount=v);
    document.querySelector<HTMLButtonElement>('#cover-place')!.onclick=()=>{
      this.placing=!this.placing;this.syncPlacement();
      if(this.placing)document.querySelector<HTMLCanvasElement>('#world')!.focus();
    };
    document.querySelector<HTMLButtonElement>('#cover-clear')!.onclick=()=>this.clear();
  }
  setMode(mode:number){
    this.open(false);this.cancelPlacement();this.toggle.hidden=mode<10;
    for(const [id,show] of [['cover-lower-row',mode>=11],['cover-tuft-controls',mode===11],['cover-shell-controls',mode===12],['cover-sample-controls',mode===13]] as const)
      document.getElementById(id)!.hidden=!show;
    document.querySelector('#cover-explanation')!.textContent= mode===10
      ?'Color and changing normals suggest fine growth on a flat surface. Hide the tall blades, then look along the hills.'
      :mode===11?'Solid blades spend triangles on shape. Painted clusters put many strands into each cutout; overlapping pixels still need work.'
      :mode===12?'Each shell is a cross-section through the turf. Separate the slices to see them. Fins support the volume when those layers turn edge-on.'
      :'The shader samples a shallow volume from front to back. Fine strands share a field; samples stop once the view is almost opaque. Low angles expose the limits of this local surface approximation.';
  }
  private open(value:boolean){
    const held=this.panel.contains(document.activeElement);this.panel.hidden=!value;this.toggle.setAttribute('aria-expanded',String(value));
    if(value)document.dispatchEvent(new Event('coveropened'));
    else {this.cancelPlacement();if(held)document.querySelector<HTMLCanvasElement>('#world')!.focus({preventScroll:true});}
  }
  cancelPlacement(){this.placing=false;this.syncPlacement();}
  private syncPlacement(){
    document.querySelector<HTMLElement>('#cover-placement')!.hidden=!this.placing;
    document.querySelector('#cover-place')!.textContent=this.placing?'Cancel placement':'Place a stone';
    document.querySelector<HTMLButtonElement>('#cover-clear')!.disabled=this.stones.children.length===0;
  }
  placeAt(point:THREE.Vector3){
    if(!this.placing)return;
    const id=`stone-${++this.nextId}`;
    const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(.55,1),new THREE.MeshStandardMaterial({color:'#87917a',roughness:.91,flatShading:true}));
    mesh.name=id;mesh.scale.set(1,.7,.9);mesh.position.copy(point);mesh.position.y+=.34;mesh.rotation.y=this.nextId*2.39996;
    mesh.castShadow=true;mesh.receiveShadow=true;this.stones.add(mesh);
    this.cover.field.contactObjects.set(id,{id,kind:'object',position:point.clone(),radius:1.05,strength:48});
    this.cancelPlacement();document.querySelector('#announcement')!.textContent='Stone placed. Its contact joins the same field as footsteps and brushing.';
  }
  clear(){
    for(const child of [...this.stones.children]){
      const mesh=child as THREE.Mesh<THREE.BufferGeometry,THREE.Material>;
      this.cover.field.contactObjects.delete(mesh.name);mesh.geometry.dispose();mesh.material.dispose();this.stones.remove(mesh);
    }
    this.cancelPlacement();document.querySelector('#announcement')!.textContent='Stones removed. The grass is recovering.';
  }
  snapshot(){return {placing:this.placing,objects:this.stones.children.map(o=>({id:o.name,position:o.position.toArray()}))};}
}
