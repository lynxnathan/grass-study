export const WIND = `
uniform float grassTime;
uniform float grassMode;
uniform sampler2D grassContact;
uniform sampler2D grassWinds;
uniform int grassWindCount;
uniform int grassFineWindCount;
float grassNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);f = f*f*(3.0-2.0*f);
  float a = fract(sin(dot(i, vec2(127.1,311.7))) * 43758.5453);
  float b = fract(sin(dot(i+vec2(1,0), vec2(127.1,311.7))) * 43758.5453);
  float c = fract(sin(dot(i+vec2(0,1), vec2(127.1,311.7))) * 43758.5453);
  float d = fract(sin(dot(i+vec2(1,1), vec2(127.1,311.7))) * 43758.5453);
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
// part: 0 = complete field, 1 = cacheable broad flow, 2 = fine residual.
vec2 grassWindPart(vec2 root, float part) {
  if (grassMode < 3.0) return vec2(0);
  if (grassMode < 4.0) return vec2(sin(grassTime*1.8)*.22, 0.0);
  vec2 result = vec2(0);
  for (int i = 0; i < grassWindCount; i++) {
    vec4 region = texelFetch(grassWinds, ivec2(2, i), 0);
    float broadShare = abs(region.w) < .5 ? 1.0 : smoothstep(4.0, 8.0, region.z);
    float share = part > 1.5 ? 1.0-broadShare : part > .5 ? broadShare : 1.0;
    if (share <= 0.0) continue;
    vec4 source = texelFetch(grassWinds, ivec2(0, i), 0);
    vec4 shape = texelFetch(grassWinds, ivec2(1, i), 0);
    vec2 local = root-region.xy;
    vec2 direction = source.xy / max(length(source.xy), .0001);
    vec2 flow = source.xy;
    if (abs(region.w) > .5) {
      vec2 radial = local/region.z;
      float falloff = max(0.0, 1.0-dot(radial, radial));
      vec2 oriented = abs(region.w) > 1.5 ? vec2(-radial.y, radial.x) : radial;
      // Finite at the center, smooth at the edge; no normalized zero vector.
      flow = oriented*(sign(region.w)*3.5*length(source.xy)*falloff*falloff);
      direction = vec2(1.0, 0.0);
    }
    float gust = grassNoise(local*source.z-direction*grassTime*source.w+vec2(shape.z,shape.z*.73));
    result += flow*(shape.x+gust*shape.y)*share;
  }
  return result;
}
vec2 grassWind(vec2 root) { return grassWindPart(root, 0.0); }
vec2 grassContactOffset(vec2 root) {
  if (grassMode >= 6.0) {
    vec2 contact = (texture2D(grassContact, root/168.0+.5).rg*255.0-128.0)/127.0;
    return contact*1.15;
  }
  return vec2(0);
}
float grassResponse(vec2 displacement) {
  return smoothstep(.01, .45, length(displacement));
}
`;

