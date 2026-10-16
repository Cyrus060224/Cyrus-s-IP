/**
 * DEEP SPACE OBSERVATORY · UBER POST-PROCESSING SHADER
 * Single-Pass Film Pipeline: High-Threshold Bloom, 35mm Film Grain, Chromatic Aberration & Vignette
 */

export const uberPostVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const uberPostFragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uBloomIntensity;
  uniform float uGrainIntensity;
  uniform float uVignetteStrength;
  uniform float uAberrationStrength;

  varying vec2 vUv;

  // Pseudo-random noise for film grain
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    vec2 uv = vUv;
    vec2 center = uv - 0.5;
    float dist = length(center);

    // 1. Radial Chromatic Aberration (Lens fringe near borders)
    float aberration = dist * dist * uAberrationStrength * 0.0035;
    vec2 redCoord   = uv + center * aberration;
    vec2 greenCoord = uv;
    vec2 blueCoord  = uv - center * aberration;

    float r = texture2D(tDiffuse, redCoord).r;
    float g = texture2D(tDiffuse, greenCoord).g;
    float b = texture2D(tDiffuse, blueCoord).b;
    vec3 color = vec3(r, g, b);

    // 2. High-Threshold Bloom Approximation (Sample nearby highlights)
    vec3 bloomSample = vec3(0.0);
    float offset = 1.8 / max(uResolution.x, 1.0);
    vec2 offsets[4];
    offsets[0] = vec2(-offset, -offset);
    offsets[1] = vec2( offset, -offset);
    offsets[2] = vec2(-offset,  offset);
    offsets[3] = vec2( offset,  offset);

    for (int i = 0; i < 4; i++) {
      vec3 tap = texture2D(tDiffuse, uv + offsets[i] * 2.5).rgb;
      // High threshold knee >= 0.78
      float lum = dot(tap, vec3(0.2126, 0.7152, 0.0722));
      float knee = smoothstep(0.78, 1.1, lum);
      bloomSample += tap * knee;
    }
    bloomSample *= 0.25 * uBloomIntensity;
    color += bloomSample;

    // 3. 35mm Gaussian Film Grain (Dynamic per-frame noise)
    vec2 grainCoord = gl_FragCoord.xy + mod(uTime * 60.0, 1000.0);
    float grain = (hash12(grainCoord) - 0.5) * 2.0;
    color += grain * uGrainIntensity * (0.85 + dist * 0.3);

    // 4. Cinema Vignette (Edge falloff)
    float vignette = smoothstep(0.95, 0.35, dist * (1.0 + uVignetteStrength * 0.4));
    color *= vignette;

    gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
  }
`;
