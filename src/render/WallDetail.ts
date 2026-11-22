import { Color, type MeshStandardMaterial, type WebGLProgramParametersWithUniforms } from 'three';
import { PALETTE } from './palette';

/**
 * Procedural surface detail for level walls: plate seams, rivets, vents,
 * glowing seams in the segment colour and hazard stripes next to doors.
 * Everything is computed in the fragment shader from per-vertex attributes
 * written by the level mesh builder (see level/wallPanels.ts); no textures.
 *
 * Lengths are in metres. Shader values are copied into uniforms when the
 * material is created; for live tuning, edit `material.userData.wallDetail`
 * (the uniforms object) from the console.
 */
export const WALL_DETAIL_TUNING = {
  /** Off: plain flat panels, no extra attributes read by the shader. */
  enabled: true,
  /** Target plate size; each bevelled panel is split into whole plates near this size. */
  plateSize: 1.0,
  /** Half-width of the groove between plates. */
  seamWidth: 0.025,
  /** How much a groove darkens the plate (0 none, 1 black). */
  seamDepth: 0.85,
  /** Fraction of interior seams that glow in the segment colour. */
  glowChance: 0.35,
  /** Emissive strength of glowing seams (× segment colour). Bloom threshold is 0.92. */
  glowIntensity: 0.9,
  /** Half-width of a glowing line, as a fraction of the seam half-width. */
  glowWidth: 0.45,
  /** Multiplier on the wall albedo, to lift the very dark base colour. */
  albedoLift: 2.6,
  /** Per-plate brightness variation (±). */
  plateVariation: 0.25,
  /** Per-plate tint towards the segment colour (added albedo at most). */
  accentTint: 0.006,
  /** Per-plate roughness variation (± fraction). */
  roughnessVariation: 0.3,
  /** Fraction of plates with corner rivets. */
  rivetChance: 0.5,
  rivetRadius: 0.03,
  /** Distance of a rivet from the plate's corner seams. */
  rivetInset: 0.1,
  /** Fraction of plates with a slotted vent. */
  ventChance: 0.16,
  /** Distance between vent slots. */
  ventPeriod: 0.09,
  /** Width of the hazard band along wall edges next to a door. */
  hazardWidth: 0.35,
  /** Distance between hazard stripes. */
  hazardPeriod: 0.3,
  /** Mix of the hazard band over the plate (0 off). */
  hazardStrength: 0.85,
  /** Albedo of the yellow stripes (× hazard colour). */
  hazardAlbedo: 0.35,
  /** Faint emissive on yellow stripes so they read in the dark. */
  hazardGlow: 0.05,
  hazardColor: PALETTE.amber,
  /** Fine detail (rivets, vents) fades out between these metres-per-pixel values, to avoid shimmer. */
  fadeStart: 0.012,
  fadeEnd: 0.04,
};

/** `kind` values written into the wallPanel attribute. */
export const WALL_KIND = {
  /** No detail (bevels). */
  NONE: 0,
  PLATE: 1,
  /** Hazard band along the panel edge u=0, u=max, v=0, v=max: HAZARD + 0..3. */
  HAZARD: 2,
} as const;

const PRELUDE_VERTEX = /* glsl */ `
attribute vec4 wallUv;
attribute vec4 wallPanel;
attribute vec3 wallAccent;
varying vec4 vWallUv;
varying vec4 vWallPanel;
varying vec3 vWallAccent;
`;

const MAIN_VERTEX = /* glsl */ `
vWallUv = wallUv;
vWallPanel = wallPanel;
vWallAccent = wallAccent;
`;

const PRELUDE_FRAGMENT = /* glsl */ `
varying vec4 vWallUv;     // xy: position in plates, zw: plate count of the panel
varying vec4 vWallPanel;  // xy: plate size (m), z: kind (0 when the attribute is missing), w: panel seed
varying vec3 vWallAccent; // segment colour (linear)
uniform vec4 uWallSeam;   // half-width, depth, glow chance, glow intensity
uniform vec4 uWallPlate;  // albedo lift, brightness variation, accent tint, roughness variation
uniform vec4 uWallRivet;  // chance, radius, inset, glow line width fraction
uniform vec4 uWallVent;   // chance, period, fade start, fade end
uniform vec4 uWallHazard; // width, period, strength, glow
uniform vec4 uWallHazardColor; // rgb, albedo
float wallHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// Pixel coverage of a line of half-width hw at distance d, antialiased over aa metres.
float wallLine(float d, float hw, float aa) {
  return clamp(0.5 + (hw - d) / aa, 0.0, 1.0) * min(1.0, 2.0 * hw / aa);
}
`;

// Runs after <color_fragment>: diffuseColor holds the vertex colour.
const MAIN_FRAGMENT = /* glsl */ `
float wallRough = 1.0;
vec3 wallEmissive = vec3(0.0);
vec2 wallUvWidth = fwidth(vWallUv.xy); // outside the branch: derivatives need uniform control flow
if (vWallPanel.z > 0.5) {
  vec2 uv = vWallUv.xy;
  vec2 plates = vWallUv.zw;
  vec2 sz = vWallPanel.xy;
  float seed = vWallPanel.w;
  vec2 cell = floor(uv);
  vec2 pm = (uv - cell) * sz;           // metres inside the plate
  vec2 mpp = wallUvWidth * sz;           // metres per pixel
  float aa = max(max(mpp.x, mpp.y), 1e-4);
  float fine = 1.0 - smoothstep(uWallVent.z, uWallVent.w, aa);
  vec2 edge = min(pm, sz - pm);         // distance to the plate's seams along each axis

  // Seams between plates; the panel border is left to the bevel.
  vec2 seamIdx = floor(uv + 0.5);
  vec2 interior = step(0.5, seamIdx) * step(seamIdx, plates - 0.5);
  vec2 seamD = mix(vec2(1e3), edge, interior);
  float seam = max(wallLine(seamD.x, uWallSeam.x, aa), wallLine(seamD.y, uWallSeam.x, aa));

  float h = wallHash(cell + seed * 97.13);
  float h2 = wallHash(cell.yx + seed * 41.71 + 3.1);
  vec3 col = diffuseColor.rgb * uWallPlate.x * (1.0 + uWallPlate.y * (2.0 * h2 - 1.0));
  col += vWallAccent * uWallPlate.z * h;
  wallRough = 1.0 + uWallPlate.w * (2.0 * h2 - 1.0);

  if (h < uWallRivet.x) {
    float rivet = wallLine(length(edge - uWallRivet.z), uWallRivet.y, aa) * fine;
    col = mix(col, col * 2.4 + 0.012, rivet);
    wallRough = mix(wallRough, 0.6, rivet);
  } else if (h > 1.0 - uWallVent.x) {
    float margin = 0.22 * min(sz.x, sz.y);
    vec2 inBox = smoothstep(margin - aa, margin + aa, edge);
    float box = inBox.x * inBox.y;
    float t = (sz.x >= sz.y ? pm.y : pm.x) / uWallVent.y;
    float slot = smoothstep(0.3, 0.45, abs(fract(t) - 0.5));
    slot = mix(0.5, slot, 1.0 - smoothstep(uWallVent.y * 0.15, uWallVent.y * 0.4, aa));
    col *= 1.0 - box * (0.35 + 0.55 * slot);
    wallRough = mix(wallRough, 1.3, box);
  }

  if (vWallPanel.z > 1.5) {
    vec4 sel = step(abs(vec4(vWallPanel.z - 2.0) - vec4(0.0, 1.0, 2.0, 3.0)), vec4(0.5));
    vec4 border = vec4(uv.x, plates.x - uv.x, uv.y, plates.y - uv.y) * sz.xxyy;
    float band = 1.0 - smoothstep(uWallHazard.x - aa, uWallHazard.x + aa, dot(border, sel));
    float s = fract(dot(uv * sz, vec2(1.0)) / uWallHazard.y);
    float stripe = mix(0.5, step(0.5, s), 1.0 - smoothstep(uWallHazard.y * 0.15, uWallHazard.y * 0.4, aa));
    vec3 hazard = mix(vec3(0.006), uWallHazardColor.rgb * uWallHazardColor.a, stripe);
    col = mix(col, hazard, band * uWallHazard.z);
    wallEmissive += uWallHazardColor.rgb * (uWallHazard.w * stripe * band);
  }

  col *= 1.0 - seam * uWallSeam.y;

  // Some interior seams carry a thin line in the segment colour.
  vec2 glowOn = step(vec2(wallHash(vec2(seamIdx.x, seed * 13.7)), wallHash(vec2(seed * 7.3, seamIdx.y))), vec2(uWallSeam.z)) * interior;
  float hw = uWallSeam.x * uWallRivet.w;
  float glow = max(glowOn.x * wallLine(seamD.x, hw, aa), glowOn.y * wallLine(seamD.y, hw, aa));
  wallEmissive += vWallAccent * (uWallSeam.w * glow);

  diffuseColor.rgb = col;
}
`;

function uniformsFromTuning(t = WALL_DETAIL_TUNING) {
  const hazard = new Color(t.hazardColor);
  return {
    uWallSeam: { value: [t.seamWidth, t.seamDepth, t.glowChance, t.glowIntensity] },
    uWallPlate: { value: [t.albedoLift, t.plateVariation, t.accentTint, t.roughnessVariation] },
    uWallRivet: { value: [t.rivetChance, t.rivetRadius, t.rivetInset, t.glowWidth] },
    uWallVent: { value: [t.ventChance, t.ventPeriod, t.fadeStart, t.fadeEnd] },
    uWallHazard: { value: [t.hazardWidth, t.hazardPeriod, t.hazardStrength, t.hazardGlow] },
    uWallHazardColor: { value: [hazard.r, hazard.g, hazard.b, t.hazardAlbedo] },
  };
}

function inject(source: string, chunk: string, code: string, before = false): string {
  const include = `#include <${chunk}>`;
  if (!source.includes(include)) throw new Error(`wall detail: missing ${include}`);
  return source.replace(include, before ? `${code}\n${include}` : `${include}\n${code}`);
}

/** Patches the vertex and fragment shaders of a MeshStandardMaterial (exported for tests). */
export function patchWallShader(shader: { vertexShader: string; fragmentShader: string }): void {
  shader.vertexShader = inject(shader.vertexShader, 'common', PRELUDE_VERTEX);
  shader.vertexShader = inject(shader.vertexShader, 'begin_vertex', MAIN_VERTEX);
  shader.fragmentShader = inject(shader.fragmentShader, 'common', PRELUDE_FRAGMENT);
  shader.fragmentShader = inject(shader.fragmentShader, 'color_fragment', MAIN_FRAGMENT);
  shader.fragmentShader = inject(shader.fragmentShader, 'roughnessmap_fragment', 'roughnessFactor *= wallRough;');
  shader.fragmentShader = inject(shader.fragmentShader, 'emissivemap_fragment', 'totalEmissiveRadiance += wallEmissive;');
}

/** Adds the wall detail layer to `material` (no-op when disabled). */
export function applyWallDetail(material: MeshStandardMaterial): MeshStandardMaterial {
  if (!WALL_DETAIL_TUNING.enabled) return material;
  const uniforms = uniformsFromTuning();
  material.userData.wallDetail = uniforms;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    patchWallShader(shader);
  };
  material.customProgramCacheKey = () => 'wall-detail-1';
  return material;
}
