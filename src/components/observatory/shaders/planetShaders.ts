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
  uniform float uThemeProgress;

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
    float vDotN = max(dot(viewDir, normal), 0.0);
    float limbFactor = clamp(1.0 - vDotN, 0.0, 1.0);

    // 2. Solar illumination along terminator (grazing sunrise vs daytime)
    vec3 toSun = normalize(uSunPosition - uPlanetCenter);
    float NdotL = dot(normal, toSun);
    float dawnFactor = smoothstep(-0.16, 0.28, NdotL);
    float dayFactor = smoothstep(-0.45, 0.35, NdotL);
    float effectiveDawn = mix(dawnFactor, dayFactor, uThemeProgress);

    // 3. Geological Terrain Simulation
    vec3 sphereCoord = normalize(vLocalPosition) * 4.2;
    float landNoise = snoise(sphereCoord * 0.75) * 0.6 + snoise(sphereCoord * 1.8) * 0.3 + snoise(sphereCoord * 4.5) * 0.1;
    float isLand = smoothstep(0.05, 0.28, landNoise);

    // Dark Mode Palette vs Light Mode Apollo/ISS Earth Palette
    vec3 cOceanDark = vec3(0.014, 0.024, 0.040);
    vec3 cLandDark  = vec3(0.030, 0.045, 0.068);
    
    // Light Mode: Vibrant deep sapphire ocean with cyan continental shelves & natural continental earth
    vec3 cOceanDeep = vec3(0.05, 0.18, 0.42);
    vec3 cOceanShelf = vec3(0.09, 0.34, 0.54);
    float shelfFactor = smoothstep(-0.04, 0.08, landNoise);
    vec3 cOceanLight = mix(cOceanDeep, cOceanShelf, shelfFactor);

    vec3 cLandMuted = vec3(0.24, 0.33, 0.30);
    vec3 cLandWarm  = vec3(0.36, 0.34, 0.26);
    vec3 cLandLight = mix(cLandMuted, cLandWarm, smoothstep(0.10, 0.32, landNoise));

    vec3 cOcean = mix(cOceanDark, cOceanLight, uThemeProgress);
    vec3 cLand  = mix(cLandDark, cLandLight, uThemeProgress);
    vec3 baseAlbedo = mix(cOcean, cLand, isLand);

    // 4. Latitude-Stretched Atmospheric Cloud Bands & 3D Cloud Shadows
    vec3 pCloud = sphereCoord * vec3(1.2, 3.8, 1.2);
    float cloudNoise = snoise(pCloud * 0.50) * 0.55 + snoise(pCloud * 1.2 + vec3(1.5, 0.0, 3.2)) * 0.32 + snoise(pCloud * 2.8) * 0.13;
    float cloudMask = smoothstep(0.18, 0.65, cloudNoise);
    vec3 cCloudDark = vec3(0.16, 0.22, 0.32);
    vec3 cCloudLight = vec3(0.92, 0.95, 0.98); // Brilliant crisp cloud white in daytime
    vec3 cCloud = mix(cCloudDark, cCloudLight, uThemeProgress);

    // 3D Cloud cast shadow onto surface beneath (offset along solar incidence)
    vec3 shadowOffset = normalize(toSun) * 0.065;
    vec3 pCloudShadow = (sphereCoord + shadowOffset) * vec3(1.2, 3.8, 1.2);
    float cloudShadowNoise = snoise(pCloudShadow * 0.50) * 0.55 + snoise(pCloudShadow * 1.2 + vec3(1.5, 0.0, 3.2)) * 0.32 + snoise(pCloudShadow * 2.8) * 0.13;
    float cloudShadowMask = smoothstep(0.22, 0.65, cloudShadowNoise);
    float shadowFactor = mix(1.0, 1.0 - cloudShadowMask * 0.40 * (1.0 - cloudMask), uThemeProgress);

    // 5. Illumination:
    vec3 cDawnSun = vec3(0.98, 0.94, 0.86);
    vec3 cDaySun  = vec3(1.00, 0.98, 0.94);
    vec3 lightCol = mix(cDawnSun, cDaySun, uThemeProgress);

    float directMul = mix(dawnFactor * 0.28, effectiveDawn * 0.52 + 0.20, uThemeProgress);
    vec3 directLit = baseAlbedo * directMul * shadowFactor * lightCol;

    float cloudMul = mix(dawnFactor * 0.48 * cDawnSun.r + 0.05, effectiveDawn * 0.48 + 0.26, uThemeProgress);
    vec3 cloudLit = cCloud * cloudMul * lightCol;

    // Composite surface with clouds
    vec3 surface = mix(directLit, cloudLit, cloudMask * (0.60 + 0.22 * uThemeProgress));

    // Specular Sun Glint on Ocean (Apollo / ISS space photography hallmark)
    vec3 halfVec = normalize(toSun + viewDir);
    float NdotH = max(dot(normal, halfVec), 0.0);
    float glintCore = pow(NdotH, 36.0) * 1.35;
    float glintSpread = pow(NdotH, 10.0) * 0.38;
    float oceanGlint = (glintCore + glintSpread) * (1.0 - isLand) * (1.0 - cloudMask * 0.85) * max(NdotL + 0.15, 0.0);
    vec3 cSunGlint = vec3(1.00, 0.98, 0.92) * oceanGlint * uThemeProgress;
    surface += cSunGlint;

    // 6. Curvature & Ambient Gradient:
    vec3 cNightAmbient = vec3(0.016, 0.025, 0.038); // #09121E
    vec3 cDayAmbient   = vec3(0.08, 0.18, 0.30);    // Daytime atmospheric backscatter
    vec3 cAmbientBase  = mix(cNightAmbient, cDayAmbient, uThemeProgress);
    vec3 ambient = cAmbientBase * (mix(0.70, 0.82, uThemeProgress) + mix(0.30, 0.18, uThemeProgress) * limbFactor);

    // 7. Atmospheric Surface Haze (Fresnel twilight hugging the curvature)
    vec3 cSurfaceHazeDark = mix(vec3(0.080, 0.260, 0.620), vec3(0.30, 0.54, 0.84), dawnFactor * 0.55);
    vec3 cSurfaceHazeLight = mix(vec3(0.20, 0.52, 0.86), vec3(0.48, 0.78, 1.00), limbFactor);
    vec3 cSurfaceHaze = mix(cSurfaceHazeDark, cSurfaceHazeLight, uThemeProgress);
    float hazeStrength = mix(pow(limbFactor, 2.6) * 0.40, pow(limbFactor, 2.4) * 0.48, uThemeProgress);

    // Edge anti-aliasing feather: smoothly fade planet mesh to zero right at the grazing silhouette
    float limbEdgeFade = smoothstep(0.00, 0.035, vDotN);

    // Combine all components
    vec3 finalColor = (surface + ambient + (cSurfaceHaze * hazeStrength)) * limbEdgeFade;

    gl_FragColor = vec4(finalColor, 1.0);
  }

`;
