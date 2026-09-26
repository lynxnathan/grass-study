import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Input } from './input';
import { heightAt, WALKABLE_RADIUS } from './terrain';

// Walk_Loop's planted foot travels backward at ~0.98 m/s at the model's scale.
const WALK_STRIDE_SPEED = .98;
const WALK_SPEED = WALK_STRIDE_SPEED * 1.15;
const RUN_SPEED = 5.8;
const ACCELERATION = 8;
const TURN_RESPONSE = 13;
const CROSSFADE_SECONDS = .22;

export class Player {
  readonly root = new THREE.Group();
  readonly velocity = new THREE.Vector3();
  mixer!: THREE.AnimationMixer;
  state = 'idle';
  private actions!: Record<string, THREE.AnimationAction>;
  private direction = new THREE.Vector3();
  private rotation = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);

  async load() {
    const gltf = await new GLTFLoader().loadAsync('/assets/quaternius-ual.glb');
    const model = gltf.scene;
    model.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;object.receiveShadow = true;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (material instanceof THREE.MeshStandardMaterial) {
            material.color.set(material.name === 'M_Joints' ? '#454a43' : '#c5844a');
            material.roughness = .85;
          }
        }
      }
    });
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    const action = (name: string) => {
      const clip = THREE.AnimationClip.findByName(gltf.animations, name);
      if (!clip) throw new Error(`Missing animation: ${name}`);
      return this.mixer.clipAction(clip);
    };
    this.actions = { idle: action('Idle_Loop'), walk: action('Walk_Loop'), run: action('Sprint_Loop') };
    this.actions.idle.play();this.reset();
  }

  reset() {
    this.root.position.set(0, heightAt(0, 8), 8);
    this.root.rotation.set(0, Math.PI, 0);
    this.velocity.set(0, 0, 0);
    if (this.actions) { this.mixer.stopAllAction();this.actions.idle.reset().play();this.state = 'idle'; }
  }

  update(dt: number, input: Input, cameraYaw: number) {
    const axis = input.axis;
    this.direction.set(axis.x * Math.cos(cameraYaw) - axis.z * Math.sin(cameraYaw), 0,
      -axis.x * Math.sin(cameraYaw) - axis.z * Math.cos(cameraYaw));
    if (this.direction.lengthSq() > 0) this.direction.normalize();
    const speed = input.running ? RUN_SPEED : WALK_SPEED;
    const desired = this.direction.multiplyScalar(speed);
    this.velocity.lerp(desired, 1 - Math.exp(-ACCELERATION * dt));
    this.root.position.addScaledVector(this.velocity, dt);
    const radius = Math.hypot(this.root.position.x, this.root.position.z);
    if (radius > WALKABLE_RADIUS) {
      this.root.position.x *= WALKABLE_RADIUS / radius;this.root.position.z *= WALKABLE_RADIUS / radius;
      this.velocity.set(0, 0, 0);
    }
    this.root.position.y = heightAt(this.root.position.x, this.root.position.z);
    const actualSpeed = this.velocity.length();
    if (actualSpeed > .08) {
      this.rotation.setFromAxisAngle(this.up, Math.atan2(this.velocity.x, this.velocity.z));
      this.root.quaternion.slerp(this.rotation, 1 - Math.exp(-TURN_RESPONSE * dt));
    }
    const next = actualSpeed < .12 ? 'idle' : actualSpeed > 3.1 ? 'run' : 'walk';
    if (next !== this.state) {
      const previous = this.actions[this.state];
      const incoming = this.actions[next];
      incoming.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
      previous.crossFadeTo(incoming, CROSSFADE_SECONDS, false);this.state = next;
    }
    if (this.state !== 'idle') this.actions[this.state].timeScale = THREE.MathUtils.clamp(actualSpeed / (this.state === 'run' ? RUN_SPEED : WALK_STRIDE_SPEED), .3, 1.4);
    this.mixer.update(dt);
  }
}
