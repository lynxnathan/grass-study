// Distances are normalized to a 900-pixel, 48-degree view. Larger projections
// retain detail farther away; each blade still transitions independently.
export const GRASS_LOD = {
  densityStart: 36, densityEnd: 120, farDensity: .5, feather: .04,
  fineStart: 8, fineEnd: 18,
  curveStart: 32, curveEnd: 56, straightStart: 64, straightEnd: 96,
} as const;

// Highlight detail follows the same projection scale, but retires separately
// from geometry. A batch changes shader only after its nearest root has faded.
export const GRASS_HIGHLIGHT_LOD = { edgeStart: 12, edgeEnd: 42, colorEnd: 85 } as const;

export function grassProjectionScale(verticalProjection: number, viewportHeight: number) {
  return verticalProjection * viewportHeight / (900 / Math.tan(24 * Math.PI / 180));
}

export function smoothStep(start: number, end: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

export function grassDensity(distance: number) {
  const near = 1 + GRASS_LOD.feather;
  return near + (GRASS_LOD.farDensity - near) * smoothStep(GRASS_LOD.densityStart, GRASS_LOD.densityEnd, distance);
}

// Only remove vertices once every root in the batch has completed the morph.
export function grassGeometryLevel(nearestRootDistance: number) {
  return nearestRootDistance >= GRASS_LOD.straightEnd ? 3 : nearestRootDistance >= GRASS_LOD.curveEnd ? 2
    : nearestRootDistance >= GRASS_LOD.fineEnd ? 1 : 0;
}

export function grassDrawCount(count: number, nearestRootDistance: number) {
  return Math.min(count, Math.ceil(count * (grassDensity(nearestRootDistance) + GRASS_LOD.feather)));
}

const f = (value: number) => value.toFixed(8);
export const GRASS_LOD_GLSL = `
uniform float grassProjection;
float grassDensityAt(float d) {
  return mix(${f(1 + GRASS_LOD.feather)}, ${f(GRASS_LOD.farDensity)},
    smoothstep(${f(GRASS_LOD.densityStart)}, ${f(GRASS_LOD.densityEnd)}, d));
}
float grassWidthWeight(float rank, float density) {
  return smoothstep(rank-${f(GRASS_LOD.feather)}, rank+${f(GRASS_LOD.feather)}, density) / min(density, 1.0);
}
float grassBendProfile(float t, float d) {
  float lo = floor(t*2.0)*.5;
  float hi = min(lo+.5, 1.0);
  float twoSegments = mix(lo*lo, hi*hi, fract(t*2.0));
  float lo4 = floor(t*4.0)*.25;
  float hi4 = min(lo4+.25, 1.0);
  float fourSegments = mix(lo4*lo4, hi4*hi4, fract(t*4.0));
  float fine = mix(t*t, fourSegments, smoothstep(${f(GRASS_LOD.fineStart)}, ${f(GRASS_LOD.fineEnd)}, d));
  float curved = mix(fine, twoSegments, smoothstep(${f(GRASS_LOD.curveStart)}, ${f(GRASS_LOD.curveEnd)}, d));
  return mix(curved, t, smoothstep(${f(GRASS_LOD.straightStart)}, ${f(GRASS_LOD.straightEnd)}, d));
}
`;
