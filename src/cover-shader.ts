// One occupancy rule for the new exhibits, evaluated at the final world root.
// Earlier studies keep their accepted placement and appearance.
export function coverMask(x: number, z: number) {
  const smooth = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v-a)/(b-a)));return t*t*(3-2*t); };
  return smooth(1.5, 2.25, Math.abs(x-Math.sin(z*.07)*5)) * (1-smooth(77,81,Math.hypot(x,z)));
}
export const COVER_MASK = `
float turfMask(vec2 p) {
  return smoothstep(1.5,2.25,abs(p.x-sin(p.y*.07)*5.0))*(1.0-smoothstep(77.0,81.0,length(p)));
}
`;
export const COVER_SURFACE = COVER_MASK + `
uniform sampler2D turfColorMap;
uniform sampler2D turfHeightMap;
uniform float turfActive, turfFoundation, turfCoverage, turfProjection, turfWet;
uniform float turfSteps, turfReveal, turfMaskView;
varying vec3 turfWorld, turfUp;
varying vec2 turfMotion;
varying float turfHeight;
float turfRange(vec3 p) { return 1.0-smoothstep(18.0,42.0,distance(cameraPosition,p)/turfProjection); }
vec3 turfColor(vec2 p) { return texture2D(turfColorMap,p/2.0).rgb; }
float turfVolume(vec2 p, float h, vec2 motion, float stretch) {
  // Root coordinates remain fixed; higher sections lean farther into the field.
  vec2 root=p-motion*.20*stretch*h*h;
  float top=texture2D(turfHeightMap,root/2.0).r;
  float edge=max(fwidth(top),.015);
  return smoothstep(h-edge,h+edge,top)*smoothstep(.0,.06,top);
}
vec3 turfBump(vec3 n, vec3 viewPosition, float height) {
  vec3 sx=dFdx(viewPosition), sy=dFdy(viewPosition);
  vec3 r1=cross(sy,n), r2=cross(n,sx);
  float det=dot(sx,r1);
  if(abs(det)<1e-9)return n;
  return normalize(abs(det)*n-sign(det)*(dFdx(height)*r1+dFdy(height)*r2));
}
void turfTransition() {
  float threshold=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
  if(threshold>=turfCoverage) discard;
}
`;
