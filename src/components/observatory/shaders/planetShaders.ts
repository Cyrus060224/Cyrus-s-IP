/**
 * DEEP SPACE OBSERVATORY · PLANET SHADERS
 * Smooth Procedural Rocky Planet with Seamless World-Space Lighting & Restrained Relief
 */

export const planetVertexShader = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying vec3 vLocalPosition;

  void main() {
    vLocalPosition = position;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    // Compute true World Space Normal to prevent UV seam discontinuities
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const planetFragmentShader = /* glsl */ `
  uniform vec3 uLightDir;
  uniform vec3 uSunColor;
  uniform float uTime;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying vec3 vLocalPosition;

  // -------------------------------------------------------------
  // Seamless 3D Simplex Noise for Continuous Smooth Relief
  // -------------------------------------------------------------
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

  // Smooth, low-frequency planetary swells (no harsh high-frequency noise)
  float macroTerrain(vec3 p) {
    float n = 0.0;
    n += 0.58 * snoise(p * 0.45);
    n += 0.28 * snoise(p * 0.95 + vec3(1.2, 3.4, 5.6));
    n += 0.14 * snoise(p * 2.10 + vec3(4.5, 1.8, 2.3));
    return n;
  }

  void main() {
    // Continuous 3D position on sphere
    vec3 spherePos = normalize(vLocalPosition) * 4.2;

    // Macro geological elevation (smooth range [0, 1])
    float h = macroTerrain(spherePos);
    h = clamp(h * 0.5 + 0.5, 0.0, 1.0);

    // World Space Normal (Strictly uniform and seamless)
    vec3 normal = normalize(vWorldNormal);
    vec3 lightDir = normalize(uLightDir);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);

    // Color Palette: Cold Basalt -> Wind-swept Sandstone -> Subtle Oxidized Ridge
    vec3 basalt = vec3(0.065, 0.072, 0.088);        // Deep dark basalt
    vec3 canyon = vec3(0.135, 0.115, 0.100);        // Deep rift shade
    vec3 weatheredSand = vec3(0.32, 0.24, 0.17);     // Wind-eroded rock plain
    vec3 amberRidge = vec3(0.68, 0.39, 0.19);        // Soft oxidized iron ridges

    vec3 albedo = mix(basalt, canyon, smoothstep(0.15, 0.40, h));
    albedo = mix(albedo, weatheredSand, smoothstep(0.40, 0.70, h));
    albedo = mix(albedo, amberRidge, smoothstep(0.70, 0.95, h));

    // Directional Lighting & Soft Cinematic Terminator
    float NdotL = dot(normal, lightDir);
    float dayLight = smoothstep(-0.08, 0.16, NdotL);

    // Deep-space cold ambient light for night hemisphere (almost pure void)
    vec3 nightAmbient = vec3(0.005, 0.006, 0.009);

    // Very subtle specular sheen on dry mineral crust (sunward limb only)
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfVec), 0.0), 24.0) * 0.12 * dayLight;

    vec3 litColor = albedo * (dayLight * uSunColor + nightAmbient) + spec * uSunColor;

    gl_FragColor = vec4(litColor, 1.0);
  }
`;
