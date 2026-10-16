/**
 * DEEP SPACE OBSERVATORY · PLANET SHADERS
 * Procedural Arid Rocky Planet with Domain Warping FBM & Smooth Terminator
 */

export const planetVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const planetFragmentShader = /* glsl */ `
  uniform vec3 uLightDir;
  uniform vec3 uSunColor;
  uniform float uTime;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vPosition;

  // -------------------------------------------------------------
  // GLSL 3D Simplex / Periodic Noise Implementation
  // -------------------------------------------------------------
  vec4 permute(vec4 x) {
    return mod(((x * 34.0) + 1.0) * x, 289.0);
  }

  vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
  }

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

    i = mod(i, 289.0);
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

  // -------------------------------------------------------------
  // Fractional Brownian Motion (4 octaves)
  // -------------------------------------------------------------
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    vec3 shift = vec3(100.0);
    for (int i = 0; i < 4; ++i) {
      v += a * snoise(p);
      p = p * 2.05 + shift;
      a *= 0.48;
    }
    return v;
  }

  // Domain Warping for Tectonic Canyons & Continental Ridges
  float domainWarpTerrain(vec3 p) {
    vec3 q = vec3(
      fbm(p + vec3(0.0, 0.0, 0.0)),
      fbm(p + vec3(5.2, 1.3, 2.8)),
      fbm(p + vec3(1.8, 9.2, 4.1))
    );
    vec3 r = vec3(
      fbm(p + 1.8 * q + vec3(1.7, 9.2, 0.5)),
      fbm(p + 1.8 * q + vec3(8.3, 2.8, 1.1)),
      fbm(p + 1.8 * q + vec3(2.4, 4.3, 7.6))
    );
    return fbm(p + 2.2 * r);
  }

  void main() {
    // Spherical base coordinates
    vec3 spherePos = normalize(vPosition) * 3.2;

    // Height calculation with Domain Warping
    float h = domainWarpTerrain(spherePos);
    h = clamp((h + 0.6) * 0.8, 0.0, 1.0);

    // Analytical-style normal perturbation via derivatives
    vec3 normal = normalize(vNormal);
    float dHx = dFdx(h);
    float dHy = dFdy(h);
    vec3 perturbedNormal = normalize(normal - vec3(dHx, dHy, 0.0) * 1.6);

    // Color Palette: Cold Basalt -> Weathered Sandstone -> Oxidized Amber
    vec3 basalt = vec3(0.065, 0.072, 0.088);        // Deep dark basalt
    vec3 canyon = vec3(0.16, 0.12, 0.10);           // Deep rift shadows
    vec3 sandrock = vec3(0.42, 0.31, 0.22);         // Wind-eroded silicate sand
    vec3 oxidizedAmber = vec3(0.82, 0.48, 0.22);     // Oxidized iron ridge
    vec3 highlands = vec3(0.92, 0.62, 0.34);         // Sunlit mountain caps

    vec3 albedo = mix(basalt, canyon, smoothstep(0.0, 0.25, h));
    albedo = mix(albedo, sandrock, smoothstep(0.25, 0.55, h));
    albedo = mix(albedo, oxidizedAmber, smoothstep(0.55, 0.80, h));
    albedo = mix(albedo, highlands, smoothstep(0.80, 1.0, h));

    // Directional Lighting & Soft Terminator
    vec3 lightDir = normalize(uLightDir);
    float NdotL = dot(perturbedNormal, lightDir);

    // Smooth terminator transition across the planetary limb
    float dayLight = smoothstep(-0.06, 0.14, NdotL);

    // Extremely subtle deep-space cold ambient light for night hemisphere
    vec3 nightAmbient = vec3(0.006, 0.007, 0.010);

    // Specular glint on exposed mineral ridges on sunward side
    vec3 viewDir = normalize(-vWorldPosition);
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(dot(perturbedNormal, halfVec), 0.0), 18.0) * 0.18 * dayLight;

    vec3 litColor = albedo * (dayLight * uSunColor + nightAmbient) + spec * uSunColor;

    gl_FragColor = vec4(litColor, 1.0);
  }
`;
