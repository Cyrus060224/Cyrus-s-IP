/**
 * DEEP SPACE OBSERVATORY · PLANET SHADERS
 * Smooth Procedural Rocky/Icy Planet with Seamless World-Space Lighting & Volumetric Spherical Relief
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
  // Seamless 3D Simplex Noise for Continuous Smooth Geological Relief
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

  // Smooth, continuous macro topography (no point clouds, no grain)
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
    vec3 baseNormal = normalize(vWorldNormal);
    vec3 lightDir = normalize(uLightDir);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);

    // Restrained surface normal perturbation for subtle tactile relief
    float eps = 0.02;
    float hX = macroTerrain(spherePos + vec3(eps, 0.0, 0.0));
    float hY = macroTerrain(spherePos + vec3(0.0, eps, 0.0));
    float hZ = macroTerrain(spherePos + vec3(0.0, 0.0, eps));
    vec3 grad = vec3(hX - h, hY - h, hZ - h) / eps;
    vec3 normal = normalize(baseNormal - grad * 0.12);

    // Cold Planetary Palette: Deep Cold Basalt -> Dark Basin -> Slate Ice-Rock Plain -> Restrained Frost Ridge
    vec3 deepBasalt      = vec3(0.042, 0.052, 0.072); // Deep dark cold basalt
    vec3 coldBasin       = vec3(0.078, 0.098, 0.132); // Cold rock shelf / depression
    vec3 weatheredPlain  = vec3(0.145, 0.185, 0.245); // Subdued cold gray-blue mineral plain
    vec3 frostRidge      = vec3(0.240, 0.310, 0.395); // Restrained ice/frost plateau ridge

    vec3 albedo = mix(deepBasalt, coldBasin, smoothstep(0.10, 0.38, h));
    albedo = mix(albedo, weatheredPlain, smoothstep(0.38, 0.68, h));
    albedo = mix(albedo, frostRidge, smoothstep(0.68, 0.95, h));

    // Volumetric Spherical Shading from terminator inward
    float NdotL = dot(normal, lightDir);
    float dayFactor = clamp((NdotL + 0.06) / 1.06, 0.0, 1.0);
    float terminatorSoft = smoothstep(-0.08, 0.22, NdotL);
    float diffuse = pow(dayFactor, 1.25) * terminatorSoft;

    // Subtle warm-white to cold-ice intersection along the grazing terminator
    vec3 stellarWarm = vec3(0.95, 0.91, 0.84); // #F2E8D5 warm star light
    float terminatorBand = smoothstep(-0.05, 0.14, NdotL) * (1.0 - smoothstep(0.14, 0.40, NdotL));
    vec3 lightColor = mix(uSunColor, stellarWarm, terminatorBand * 0.42);

    // Night hemisphere cold ambient light (readable dark blue-black cosmic void tone, not pure black)
    vec3 nightAmbient = vec3(0.012, 0.016, 0.024);

    // Restrained specular sheen on crystalline ice/rock crust (grazing sunward limb only)
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfVec), 0.0), 28.0) * 0.09 * terminatorSoft;

    vec3 litColor = albedo * (diffuse * lightColor + nightAmbient) + spec * stellarWarm;

    gl_FragColor = vec4(litColor, 1.0);
  }
`;
