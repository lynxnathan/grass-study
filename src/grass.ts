import * as THREE from 'three';
import { heightAt } from './terrain';

// Study 01: one upright, camera-facing cutout per tuft. No wind or contact yet.
export function createGrass() {
  let seed = 91827;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const image = document.createElement('canvas');image.width = image.height = 256;
  const ctx = image.getContext('2d')!;
  for (let i = 0; i < 25; i++) {
    const base = 96 + random() * 64, tip = 18 + random() * 220;
    const top = 12 + random() * 139, width = 3 + random() * 8;
    const shade = ctx.createLinearGradient(0, 256, 0, top);
    shade.addColorStop(0, '#435d31');shade.addColorStop(.5, i % 3 ? '#82994d' : '#9aa956');
    shade.addColorStop(1, '#c4c981');ctx.fillStyle = shade;
    ctx.beginPath();ctx.moveTo(base - width, 256);
    ctx.quadraticCurveTo(base - width, top + 58, tip, top);
    ctx.quadraticCurveTo(base + width, top + 62, base + width, 256);ctx.fill();
  }
  const texture = new THREE.CanvasTexture(image);texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, alphaTest: .4, side: THREE.DoubleSide });
  // Alpha testing writes depth: overlapping cutouts need no transparency sorting.
  const right = { value: new THREE.Vector2(1, 0) };
  material.onBeforeCompile = shader => {
    shader.uniforms.grassRight = right;
    shader.vertexShader = 'uniform vec2 grassRight;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
      vec3 center = instanceMatrix[3].xyz;
      float width = length(instanceMatrix[0].xyz);
      float height = length(instanceMatrix[1].xyz);
      vec3 offset = vec3(grassRight.x * position.x * width,
                         position.y * height, grassRight.y * position.x * width);
      vec4 mvPosition = modelViewMatrix * vec4(center + offset, 1.0);
      gl_Position = projectionMatrix * mvPosition;
    `);
  };
  material.customProgramCacheKey = () => 'grass-study-01';
  const geometry = new THREE.PlaneGeometry(1, 1);geometry.translate(0, .5, 0);
  const transforms: THREE.Matrix4[] = [];
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < 34000; i++) {
    const x = (random() - .5) * 164, z = (random() - .5) * 164;
    if (Math.hypot(x, z) > 81) continue;
    const pathDistance = Math.abs(x - Math.sin(z * .07) * 5);
    if (pathDistance < 1.35 + random() * .8) continue;
    const height = .32 + random() * .48;
    matrix.makeScale(.55 + random() * .45, height, 1);
    matrix.setPosition(x, heightAt(x, z) - .055, z);transforms.push(matrix.clone());
  }
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  transforms.forEach((transform, i) => mesh.setMatrixAt(i, transform));
  mesh.instanceMatrix.needsUpdate = true;mesh.name = 'static-grass-billboards';
  // Bounds include the shader's rotated cards, not just the original XY planes.
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 5, 0), 85);
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    const e = camera.matrixWorld.elements;right.value.set(e[0], e[2]).normalize();
  };
  return mesh;
}
