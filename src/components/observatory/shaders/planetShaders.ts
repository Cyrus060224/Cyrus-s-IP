/**
 * DEEP SPACE OBSERVATORY · PLANET SURFACE SHADER
 * Volumetric Curvature Shading with Latitude Atmospheric Bands, Continents & Non-Black Depth
 */

export const planetVertexShader = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying vec3 vLocalPosition;

  void main() {
    vLocalPosition = position;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const planetFragmentShader = /* glsl */ `
  uniform vec3 uSunPosition;
  uniform vec3 uSunColor;
  uniform vec3 uPlanetCenter;
  uniform float uTime;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying vec3 vLocalPosition;

  // Seamless 3D Simplex Noise for Geological Relief & Planetary Bands
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    // 1. Viewing angle / Curvature factors
    // vDotN: 0 at the horizon (grazing), increases towards 0.75 at bottom of viewport
    float vDotN = max(dot(viewDir, normal), 0.0);
    float limbFactor = clamp(1.0 - vDotN, 0.0, 1.0);

    // 2. Solar illumination along terminator (grazing sunrise)
    // Parallel astronomical sunlight across the planetary globe
    vec3 toSun = normalize(uSunPosition - uPlanetCenter);
    float NdotL = dot(normal, toSun);
    // Soft grazing dawn terminator
    float dawnFactor = smoothstep(-0.16, 0.28, NdotL);

    // 3. Geological Terrain Simulation
    vec3 sphereCoord = normalize(vLocalPosition) * 4.2;
    float landNoise = snoise(sphereCoord * 0.75) * 0.6 + snoise(sphereCoord * 1.8) * 0.3 + snoise(sphereCoord * 4.5) * 0.1;
    float isLand = smoothstep(0.05, 0.28, landNoise);

    // Palette: Deep Oceanic Basin vs Continental Slate Rock
    vec3 cOcean = vec3(0.014, 0.024, 0.040);
    vec3 cLand  = vec3(0.030, 0.045, 0.068);
    vec3 baseAlbedo = mix(cOcean, cLand, isLand);

    // 4. Latitude-Stretched Atmospheric Cloud Bands
    // Stretching along Y-axis creates natural planetary weather bands
    vec3 pCloud = sphereCoord * vec3(1.2, 3.8, 1.2);
    float cloudNoise = snoise(pCloud * 0.50) * 0.55 + snoise(pCloud * 1.2 + vec3(1.5, 0.0, 3.2)) * 0.32 + snoise(pCloud * 2.8) * 0.13;
    float cloudMask = smoothstep(0.18, 0.65, cloudNoise);
    vec3 cCloud = vec3(0.16, 0.22, 0.32);

    // 5. Illumination:
    // Soft dawn skimming light on the right
    vec3 cDawnSun = vec3(0.98, 0.94, 0.86);
    vec3 directLit = baseAlbedo * (dawnFactor * 0.28) * cDawnSun;

    // Cloud illumination: morning grazing light on cloud crests
    vec3 cloudLit = cCloud * (dawnFactor * 0.48 * cDawnSun + 0.05);

    // Composite surface with clouds
    vec3 surface = mix(directLit, cloudLit, cloudMask * 0.60);

    // 6. Curvature & Night-side Ambient Gradient:
    // Toward the bottom of the screen (away from horizon), gently fade into deep cosmic blue-black
    // Preserves non-black depth: noticeably brighter than the space void (#04060A)
    vec3 cNightAmbient = vec3(0.016, 0.025, 0.038); // #09121E
    vec3 ambient = cNightAmbient * (0.70 + 0.30 * limbFactor);

    // 7. Atmospheric Surface Haze (Fresnel twilight hugging the curvature)
    vec3 cSurfaceHaze = mix(vec3(0.080, 0.260, 0.620), vec3(0.30, 0.54, 0.84), dawnFactor * 0.55);
    float hazeStrength = pow(limbFactor, 2.6) * 0.40;

    // Edge anti-aliasing feather: smoothly fade planet mesh to zero right at the grazing silhouette
    // Eliminates polygon chord silhouette cliff between planet mesh and space
    float limbEdgeFade = smoothstep(0.00, 0.035, vDotN);

    // Combine all components
    vec3 finalColor = (surface + ambient + (cSurfaceHaze * hazeStrength)) * limbEdgeFade;

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;
