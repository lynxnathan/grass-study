import { GRASS_HIGHLIGHT_LOD } from './grass-lod';

// Extracted from the blade renderer. The studies retain their response curves;
// other representations consume the same wind/contact vectors they already use.
export const FORCE_VIEW_VERTEX = `
uniform float grassForceView, grassWindHighlight, grassContactHighlight;
vec2 grassForceResponse(vec2 wind, vec2 contact, float mode, float rootDistance) {
  vec2 response = vec2(0.0);
  #ifndef GRASS_NO_HIGHLIGHT
  float windResponse = smoothstep(.15, .75, length(wind));
  windResponse *= windResponse * grassWindHighlight;
  float contactResponse = grassResponse(contact)*grassContactHighlight;
  // 06 isolates contact, 07 shows its combined response; 08 introduces the
  // separate wind response also used by the other wind-bearing representations.
  response.x = mode == 6.0 ? contactResponse
    : mode == 7.0 ? grassResponse(wind*grassWindHighlight + contact*grassContactHighlight)
    : max(windResponse, contactResponse);
  response.y = mode == 6.0 ? 0.0
    : mode == 7.0 ? contactResponse*grassWindHighlight : contactResponse*windResponse;
  float colorDetail = 1.0-smoothstep(${GRASS_HIGHLIGHT_LOD.edgeEnd.toFixed(1)}, ${GRASS_HIGHLIGHT_LOD.colorEnd.toFixed(1)}, rootDistance);
  response *= colorDetail;
  response *= grassForceView;
  #endif
  return response;
}
float grassForceEdgeDetail(float rootDistance) {
  return 1.0-smoothstep(${GRASS_HIGHLIGHT_LOD.edgeStart.toFixed(1)}, ${GRASS_HIGHLIGHT_LOD.edgeEnd.toFixed(1)}, rootDistance);
}
`;

export const FORCE_VIEW_FRAGMENT = `
float grassForceEdge(vec2 sides, float edgeDetail) {
  vec2 sidePixels = sides / max(fwidth(sides), vec2(.0001));
  float footprint = sidePixels.x + sidePixels.y;
  return (1.0-smoothstep(0.0, 1.0, min(sidePixels.x, sidePixels.y)))
    * smoothstep(2.0, 5.0, footprint) * edgeDetail;
}
void grassForceColor(inout vec3 color, inout vec3 emissive, vec2 response, float edge) {
  #ifndef GRASS_NO_HIGHLIGHT
  float reaction = response.x, touch = response.y;
  vec3 responseBlue = mix(vec3(.025,.48,.8), vec3(.025,.10,.72), reaction);
  color = mix(color, responseBlue, reaction*.92);
  color = mix(color, vec3(1.0,.20,.015), touch*.95);
  emissive += reaction*(responseBlue*.22 + edge*vec3(.08,.75,1.2));
  emissive = mix(emissive, vec3(.32,.045,.002)+edge*vec3(1.5,.5,.06), touch);
  #endif
}
`;

// Surface and cutout renderers share the fill. Ribbon renderers can additionally
// supply their actual silhouette; shell boundaries are slices, not blade edges.
export const FORCE_VIEW_VARYING = 'varying vec2 grassForces;\n';
