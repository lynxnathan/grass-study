import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createGrass } from './grass';
import { heightAt } from './terrain';
import { GrassInteraction, type ContactSource } from './interaction';
import { ForceView } from './force-view';
import { FORCE_VIEW_VERTEX, FORCE_VIEW_FRAGMENT, FORCE_VIEW_VARYING } from './force-view-shader';
import { COVER_MASK } from './cover-shader';
import { WindField } from './wind';
import { WIND } from './wind-shader';
import { FIELD_PATCHES } from './patch-grid';
import { WindPatchAtlas, WIND_PATCH_LOOKUP } from './wind-patches';
import { GRASS_HIGHLIGHT_LOD, GRASS_LOD_GLSL, grassDrawCount, grassGeometryLevel, grassProjectionScale } from './grass-lod';

export { WIND } from './wind-shader';

function bladeGeometry(segments: number) {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let i = 0; i < segments; i++) {
    const t = i / segments, halfWidth = .5 * (1 - t);
    positions.push(-halfWidth, t, 0, halfWidth, t, 0);uv.push(0, t, 1, t);
    if (i) { const a = (i - 1) * 2;indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  positions.push(0, 1, 0);uv.push(.5, 1);
  indices.push((segments - 1) * 2, (segments - 1) * 2 + 1, segments * 2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

export class GrassField {
  readonly root = new THREE.Group();
  readonly billboards = createGrass();
  readonly interaction = new GrassInteraction();
  readonly winds = new WindField();
  readonly windPatches = new WindPatchAtlas(this.winds);
  private cards: THREE.InstancedMesh;
  private blades = new THREE.Group();
  private patches: { mesh: THREE.Mesh<THREE.InstancedBufferGeometry>;
    geometries: THREE.InstancedBufferGeometry[]; count: number; roots: THREE.Box3; restRadius: number; lod: number }[] = [];
  private geometries = [bladeGeometry(8), bladeGeometry(4), bladeGeometry(2), bladeGeometry(1)];
  private boundsRevision = -1;
  private edgeMaterial!: THREE.MeshStandardMaterial;
  private plainMaterial!: THREE.MeshStandardMaterial;
  private naturalMaterial!: THREE.MeshStandardMaterial;
  private rainMaterial!: THREE.MeshPhysicalMaterial;
  private rainPlainMaterial!: THREE.MeshPhysicalMaterial;
  private rainNaturalMaterial!: THREE.MeshPhysicalMaterial;
  private coverage = { value: 1 };
  readonly forceView = new ForceView();
  readonly uniforms = {
    ...this.winds.uniforms,
    ...this.windPatches.uniforms,
    ...this.forceView.uniforms,
    grassProjection: { value: 1 }, grassTime: { value: 0 }, grassMode: { value: 1 }, grassContact: { value: this.interaction.texture },
  };
  mode = 1;
  anchorVisible = true;
  readonly contactObjects = new Map<string, ContactSource>();
  private readonly characterContact: ContactSource = { id: 'character', kind: 'character', position: new THREE.Vector3(), radius: 1.3, strength: 42 };
  private readonly brushContact: ContactSource = { id: 'brush', kind: 'brush', position: new THREE.Vector3(), radius: 2.2, strength: 65 };

  constructor() {
    this.cards = this.createCards();
    this.createBlades();
    this.root.add(this.billboards, this.cards, this.blades);
    // Screen-door coverage preserves cutout depth without sorting transparent tufts.
    const materials = new Set<THREE.Material>();
    this.root.traverse(object => {
      if (object instanceof THREE.Mesh) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
    });
    for (const material of materials) {
      const compile = material.onBeforeCompile, key = material.customProgramCacheKey();
      material.onBeforeCompile = (shader, renderer) => {
        compile.call(material, shader, renderer);
        shader.uniforms.grassCoverage = this.coverage;
        shader.fragmentShader = 'uniform float grassCoverage;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `
          #include <clipping_planes_fragment>
          float coverageThreshold = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
          if (coverageThreshold >= grassCoverage) discard;
        `);
      };
      material.customProgramCacheKey = () => `${key}|grass-coverage`;
    }
    // Clone after the coverage wrapper so all detail variants share its uniforms.
    this.edgeMaterial = this.patches[0].mesh.material as THREE.MeshStandardMaterial;
    this.plainMaterial = this.edgeMaterial.clone();
    this.plainMaterial.onBeforeCompile = this.edgeMaterial.onBeforeCompile;
    this.plainMaterial.customProgramCacheKey = this.edgeMaterial.customProgramCacheKey;
    this.plainMaterial.defines = { GRASS_PLAIN_HIGHLIGHT: 1 };
    this.naturalMaterial = this.plainMaterial.clone();
    this.naturalMaterial.onBeforeCompile = this.edgeMaterial.onBeforeCompile;
    this.naturalMaterial.customProgramCacheKey = this.edgeMaterial.customProgramCacheKey;
    this.naturalMaterial.defines = { GRASS_PLAIN_HIGHLIGHT: 1, GRASS_NO_HIGHLIGHT: 1 };
    this.rainMaterial = new THREE.MeshPhysicalMaterial();
    // Copy the shared geometry/lighting setup, then restore Physical's defines.
    THREE.MeshStandardMaterial.prototype.copy.call(this.rainMaterial, this.naturalMaterial);
    this.rainMaterial.defines = { STANDARD: '', PHYSICAL: '' };
    this.rainMaterial.onBeforeCompile = this.edgeMaterial.onBeforeCompile;
    this.rainMaterial.customProgramCacheKey = this.edgeMaterial.customProgramCacheKey;
    this.rainMaterial.clearcoat = 1;
    this.rainMaterial.clearcoatRoughness = .18;
    this.rainPlainMaterial = this.rainMaterial.clone();
    this.rainPlainMaterial.onBeforeCompile = this.rainMaterial.onBeforeCompile;
    this.rainPlainMaterial.customProgramCacheKey = this.rainMaterial.customProgramCacheKey;
    this.rainPlainMaterial.defines = { STANDARD: '', PHYSICAL: '', GRASS_PLAIN_HIGHLIGHT: 1 };
    this.rainNaturalMaterial = this.rainPlainMaterial.clone();
    this.rainNaturalMaterial.onBeforeCompile = this.rainMaterial.onBeforeCompile;
    this.rainNaturalMaterial.customProgramCacheKey = this.rainMaterial.customProgramCacheKey;
    this.rainNaturalMaterial.defines = { STANDARD: '', PHYSICAL: '', GRASS_PLAIN_HIGHLIGHT: 1, GRASS_NO_HIGHLIGHT: 1 };
    this.setMode(1);
  }

  private createCards() {
    const a = new THREE.PlaneGeometry(1, 1);a.translate(0, .5, 0);
    const b = a.clone().rotateY(Math.PI / 2);
    const geometry = mergeGeometries([a, b]);a.dispose();b.dispose();
    const material = (this.billboards.material as THREE.MeshBasicMaterial).clone();
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = WIND + FORCE_VIEW_VERTEX + FORCE_VIEW_VARYING + 'uniform float grassProjection;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
        vec3 grassPosition = (instanceMatrix * vec4(transformed, 1.0)).xyz;
        vec2 wind = grassWind(instanceMatrix[3].xz);
        grassPosition.xz += wind*position.y*position.y;
        grassForces = grassForceResponse(wind, vec2(0.0), grassMode, distance(cameraPosition, instanceMatrix[3].xyz) / grassProjection);
        vec4 mvPosition = modelViewMatrix * vec4(grassPosition, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      `);
      shader.fragmentShader = FORCE_VIEW_FRAGMENT + FORCE_VIEW_VARYING + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec3 forceEmission = vec3(0.0);
        grassForceColor(diffuseColor.rgb, forceEmission, grassForces, 0.0);
        diffuseColor.rgb += forceEmission;
      `);
    };
    material.customProgramCacheKey = () => 'crossed-grass-force-view';
    const mesh = new THREE.InstancedMesh(geometry, material, this.billboards.count);
    const matrix = new THREE.Matrix4(), rotation = new THREE.Matrix4();
    for (let i = 0; i < mesh.count; i++) {
      this.billboards.getMatrixAt(i, matrix);
      // Rotate the card pair without moving its root or changing its density.
      rotation.makeRotationY(i * 2.399963);matrix.multiply(rotation);mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;mesh.boundingSphere = this.billboards.boundingSphere!.clone();
    mesh.name = 'crossed-cards';return mesh;
  }

  private createBlades() {
    const material = new THREE.MeshStandardMaterial({ color: '#b3c477', roughness: .88, side: THREE.DoubleSide, vertexColors: true });
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms);
      const reactionVaryings = 'varying vec2 grassProfile;\nvarying float grassReaction;\nvarying float grassTouch;\nvarying float grassEdgeDetail;\n';
      shader.vertexShader = WIND + WIND_PATCH_LOOKUP + GRASS_LOD_GLSL + COVER_MASK + FORCE_VIEW_VERTEX + `
        attribute vec4 bladeRootHeight;
        attribute vec4 bladeShape;
      ` + reactionVaryings + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
        float t = position.y;
        vec3 grassRoot = bladeRootHeight.xyz;
        float bladeHeight = bladeRootHeight.w;
        vec3 sideways = vec3(bladeShape.x, 0.0, bladeShape.y);
        vec2 curl = vec2(-sideways.z, sideways.x)*bladeHeight*.25;
        float rootDistance = distance(cameraPosition, grassRoot) / grassProjection;
        float widthWeight = grassMode >= 7.0 ? grassWidthWeight(bladeShape.w, grassDensityAt(rootDistance)) : 1.0;
        vec2 contact = grassContactOffset(grassRoot.xz);
        vec2 wind = grassMode >= 8.0 ? grassPatchWind(grassRoot.xz, rootDistance) : grassWind(grassRoot.xz);
        vec2 displacement = wind + contact;
        vec2 bend = displacement*bladeHeight + curl;
        vec2 forceResponse = grassForceResponse(wind, contact, grassMode, rootDistance);
        grassReaction = forceResponse.x;grassTouch = forceResponse.y;
        float droop = min(length(bend)*.24, bladeHeight*.5);
        vec3 tangent = vec3(bend.x*2.0*t, bladeHeight-droop*2.0*t, bend.y*2.0*t);
        vec3 objectNormal = cross(sideways, tangent);
        grassProfile = position.xy;
        grassEdgeDetail = grassForceEdgeDetail(rootDistance);
      `);
      shader.vertexShader = shader.vertexShader.replace('#include <defaultnormal_vertex>', `
        vec3 transformedNormal = normalMatrix * objectNormal;
      `);
      // Keep the analytical normal linear in t. Fragment normalization gives the
      // same lighting when redundant intermediate vertices are removed.
      shader.vertexShader = shader.vertexShader.replace('#include <normal_vertex>', 'vNormal = transformedNormal;');
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
        // Slender nearby leaves; gradual widening preserves the distant field's mass.
        float silhouetteWidth = grassMode >= 7.0 ? mix(.4, 1.0, smoothstep(8.0, 48.0, rootDistance)) : 1.0;
        vec3 grassPosition = grassRoot + sideways*position.x*bladeShape.z*widthWeight*silhouetteWidth*(grassMode >= 10.0 ? turfMask(grassRoot.xz) : 1.0);
        grassPosition.y += t*bladeHeight;
        float bendProfile = grassMode >= 7.0 ? grassBendProfile(t, rootDistance / bladeHeight) : t*t;
        grassPosition.xz += bend*bendProfile;
        grassPosition.y -= droop*bendProfile;
        vec4 mvPosition = modelViewMatrix * vec4(grassPosition, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      `);
      shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `
        vec4 worldPosition = modelMatrix * vec4(grassPosition, 1.0);
      `);
      shader.fragmentShader = FORCE_VIEW_FRAGMENT + reactionVaryings + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        diffuseColor.rgb *= mix(vec3(.62,.70,.43),vec3(1.10,1.06,.81),grassProfile.y);
        #ifndef GRASS_NO_HIGHLIGHT
        float responseEdge = 0.0;
        #ifndef GRASS_PLAIN_HIGHLIGHT
          vec2 sides = vec2(.5*(1.0-grassProfile.y)) + vec2(grassProfile.x, -grassProfile.x);
          responseEdge = grassForceEdge(sides, grassEdgeDetail);
        #endif
        grassForceColor(diffuseColor.rgb, totalEmissiveRadiance, vec2(grassReaction, grassTouch), responseEdge);
        #endif
      `);
    };
    material.customProgramCacheKey = () => 'compact-continuous-grass-blades';
    let seed = 67123;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const patches = new Map<string, THREE.Matrix4[]>();
    const base = new THREE.Matrix4(), matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion();
    const position = new THREE.Vector3(), scale = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < this.billboards.count; i++) {
      this.billboards.getMatrixAt(i, base);
      for (let j = 0; j < 12; j++) {
        const x = base.elements[12] + (random() - .5) * 1.2;
        const z = base.elements[14] + (random() - .5) * 1.2;
        position.set(x, heightAt(x, z) - .015, z);
        rotation.setFromAxisAngle(up, random() * Math.PI * 2);
        scale.set(.065 + random() * .075, .45 + random() * .55, 1);
        matrix.compose(position, rotation, scale);
        const key = FIELD_PATCHES.key(x, z);
        const list = patches.get(key) ?? [];list.push(matrix.clone());patches.set(key, list);
      }
    }
    const color = new THREE.Color();
    for (const list of patches.values()) {
      // Shuffle once: every prefix remains spatially distributed as density changes.
      for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1));[list[i], list[j]] = [list[j], list[i]]; }
      // Static float parameters: root/height, direction/width/rank,
      // and RGB. 44 bytes per blade instead of a 64-byte matrix plus 12-byte RGB.
      const rootHeight = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 4), 4);
      const shape = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 4), 4);
      const colors = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
      const roots = new THREE.Box3(), bounds = new THREE.Sphere().makeEmpty();
      const sphere = new THREE.Sphere();
      if (!this.geometries[0].boundingSphere) this.geometries[0].computeBoundingSphere();
      list.forEach((transform, i) => {
        const e = transform.elements, width = Math.hypot(e[0], e[2]);
        rootHeight.setXYZW(i, e[12], e[13], e[14], e[5]);
        shape.setXYZW(i, e[0] / width, e[2] / width, width, (i + .5) / list.length);
        color.setHSL(.20 + random() * .025, .3 + random() * .18, .52 + random() * .18);
        colors.setXYZ(i, color.r, color.g, color.b);
        roots.expandByPoint(position.set(e[12], e[13], e[14]));
        bounds.union(sphere.copy(this.geometries[0].boundingSphere!).applyMatrix4(transform));
      });
      const restRadius = bounds.radius;bounds.radius += 2;
      // LOD views share both the small base meshes and all instance buffers.
      const geometries = this.geometries.map(base => {
        const geometry = new THREE.InstancedBufferGeometry();
        geometry.index = base.index;
        for (const [name, attribute] of Object.entries(base.attributes)) geometry.setAttribute(name, attribute);
        geometry.setAttribute('bladeRootHeight', rootHeight);
        geometry.setAttribute('bladeShape', shape);
        geometry.setAttribute('color', colors);
        geometry.boundingSphere = bounds;geometry.instanceCount = list.length;
        return geometry;
      });
      const mesh = new THREE.Mesh(geometries[0], material);
      mesh.receiveShadow = true;mesh.name = 'blade-patch';
      this.patches.push({ mesh, geometries, count: list.length, roots, restRadius, lod: 0 });
      this.blades.add(mesh);
    }
  }

  setCoverage(value: number) { this.coverage.value = THREE.MathUtils.clamp(value, 0, 1); }

  get contactHighlight() { return this.forceView.contact; }
  setContactHighlight(value: boolean) { this.forceView.contact = value; }

  get windHighlight() { return this.forceView.wind; }
  setWindHighlight(value: boolean) { this.forceView.wind = value; }

  setMode(mode: number) {
    this.mode = mode;this.uniforms.grassMode.value = mode;
    this.billboards.visible = mode === 1;
    this.cards.visible = mode >= 2 && mode <= 4;
    this.blades.visible = mode >= 5;
  }

  update(dt: number, player: THREE.Vector3, brush: THREE.Vector3 | null) {
    this.uniforms.grassTime.value += dt;
    this.windPatches.advance(dt);
    this.forceView.update(dt);
    if (dt > 0) {
      if (this.mode >= 6) {
        // All contributors enter the same fixed-step contact field. A future
        // physics tick owns object transforms; rendering consumes only the field.
        this.characterContact.position=player;this.interaction.apply(this.characterContact,dt);
        if (brush) { this.brushContact.position=brush;this.interaction.apply(this.brushContact,dt); }
        for (const source of this.contactObjects.values()) this.interaction.apply(source, dt);
      }
      this.interaction.update(dt);
    }
  }

  get time() { return this.uniforms.grassTime.value; }

  setWetSurface(wetness: number, roughness: number, environment: THREE.Texture, light: number) {
    for (const material of [this.rainMaterial, this.rainPlainMaterial, this.rainNaturalMaterial]) {
      material.color.set('#b3c477').multiplyScalar(1 - wetness * .28);
      material.roughness = THREE.MathUtils.lerp(.88, roughness, wetness);
      // Keep the shader variant warm at zero wetness; no recompilation during drying.
      material.clearcoat = Math.max(.0001, wetness * .9);
      material.clearcoatRoughness = Math.max(.12, roughness * .6);
      material.envMap = environment;material.envMapIntensity = light;
    }
  }

  prepare(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    if (this.mode >= 8) this.windPatches.render(renderer, camera.position.x, camera.position.z, this.uniforms.grassTime.value);
    else this.windPatches.skip();
  }

  // Called once after the camera settles, independently of simulation substeps.
  updateDetail(camera: THREE.Camera, viewportHeight = 900) {
    this.blades.visible = this.mode >= 5 && this.anchorVisible;
    const projection = grassProjectionScale(camera.projectionMatrix.elements[5], viewportHeight);
    this.uniforms.grassProjection.value = projection;
    if (this.mode < 5) return;
    if (this.boundsRevision !== this.winds.revision) {
      // Blade heights are at most one meter. Include N winds, contact, curl,
      // droop and the widened silhouette in every shared LOD view's bounds.
      const padding = this.winds.maximumDisplacement + 2.5;
      for (const patch of this.patches) patch.mesh.geometry.boundingSphere!.radius = patch.restRadius + padding;
      this.boundsRevision = this.winds.revision;
    }
    for (const patch of this.patches) {
      const nearest = patch.roots.distanceToPoint(camera.position) / projection;
      // All roots have finished fading before the batch drops edge derivatives.
      const natural = nearest >= GRASS_HIGHLIGHT_LOD.colorEnd || this.forceView.uniforms.grassForceView.value === 0;
      const plain = nearest >= GRASS_HIGHLIGHT_LOD.edgeEnd;
      patch.mesh.material = this.mode >= 9
        ? natural ? this.rainNaturalMaterial : plain ? this.rainPlainMaterial : this.rainMaterial
        : natural ? this.naturalMaterial : plain ? this.plainMaterial : this.edgeMaterial;
      patch.lod = this.mode < 7 ? 1 : grassGeometryLevel(nearest);
      patch.mesh.geometry = patch.geometries[patch.lod];
      patch.mesh.geometry.instanceCount = this.mode < 7 ? Math.floor(patch.count * .5) : grassDrawCount(patch.count, nearest);
    }
  }

  snapshot() {
    const activeLayers = this.root.children.filter(child => child.visible);
    return { visible: this.root.visible && activeLayers.length > 0 && this.coverage.value > 0,
      forceView: this.forceView.snapshot(), coverage: this.coverage.value, contactObjects: this.contactObjects.size,
      layers: activeLayers.map(child => child === this.blades ? 'blades' : child.name),
      count: this.billboards.count, mode: this.mode,
      windPatches: this.windPatches.snapshot(),
      contactHighlight: this.contactHighlight, contactHighlightWeight: this.uniforms.grassContactHighlight.value,
      winds: this.winds.snapshot(), windHighlight: this.windHighlight, windHighlightWeight: this.uniforms.grassWindHighlight.value,
      outlinedPatches: this.patches.filter(p => p.mesh.material === this.edgeMaterial || p.mesh.material === this.rainMaterial).length,
      naturalPatches: this.patches.filter(p => p.mesh.material === this.naturalMaterial || p.mesh.material === this.rainNaturalMaterial).length,
      time: this.uniforms.grassTime.value, contactEnergy: this.interaction.energy,
      bladeInstances: this.mode >= 5 ? this.patches.reduce((sum, patch) => sum + patch.mesh.geometry.instanceCount, 0) : 0,
      instanceBytes: this.patches.reduce((sum, patch) => sum + patch.count * 44, 0),
      lodPatches: [0, 1, 2, 3].map(lod => this.patches.filter(patch => patch.lod === lod).length) };
  }
}
