/**
 * DEEP SPACE OBSERVATORY · PHYSICAL ATMOSPHERE & HALO SHADER
 * Analytical Rayleigh + Mie Scattering with Exponential Arc Decay,
 * Continuous Deep-Sapphire to Ice-Blue Gradient, and Outer Cosmic Halo
 */

export const atmosphereVertexShader = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const atmosphereFragmentShader = /* glsl */ `
  uniform vec3 uSunPosition;
  uniform vec3 uSunColor;
  uniform vec3 uPlanetCenter;
  uniform float uPlanetRadius;
  uniform float uMainAtmoRadius; // Outer edge of main dense atmosphere
  uniform float uHaloRadius;     // Outer boundary of extended diffuse halo
  uniform float uTime;
  uniform float uIntroProgress;
  uniform float uThemeProgress;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 rayOrigin = cameraPosition;
    vec3 rayDir = normalize(vWorldPosition - rayOrigin);

    // Vector from planet center to ray origin
    vec3 rc = rayOrigin - uPlanetCenter;

    // Closest approach along the ray
    float tClosest = -dot(rc, rayDir);
    vec3 pClosest = rc + rayDir * tClosest;
    float b = length(pClosest); // Impact parameter (perpendicular distance to center)

    // Altitude above planet surface
    float h = b - uPlanetRadius;
    if (h < -0.06) discard; // Inside planet body

    float mainThickness = uMainAtmoRadius - uPlanetRadius;
    float haloThickness = uHaloRadius - uMainAtmoRadius;

    // Tangent point in world space
    vec3 tangentWorld = uPlanetCenter + pClosest;
    vec3 tangentNormal = normalize(pClosest);
    vec3 sunRadialDir = normalize(uSunPosition - uPlanetCenter);

    // 1. Angular decay along planetary arc (centered on rising star)
    float arcCos = clamp(dot(tangentNormal, sunRadialDir), -1.0, 1.0);
    float arcAngle = acos(arcCos); // 0 at star, ~0.20 in center, ~0.52 on far left
    float decayFactor = exp(-arcAngle * 2.8); // 1.00 at star, 0.57 in center, 0.23 on far left

    // Dynamic thickness: Atmosphere swells thicker near the star (~42px), tapers thinner on far left (~23px)
    // Restores rich atmospheric gradient band across the middle of the screen
    float thicknessScale = mix(0.55, 1.30, decayFactor);
    float effectiveThick = mainThickness * thicknessScale;
    float normAlt = clamp(h / effectiveThick, 0.0, 1.0);

    // 2. Multi-layer Colors (ISS Orbital Sunrise palette)
    vec3 cGroundSapphire = vec3(0.080, 0.260, 0.620); // Deep sapphire ground (#14429E)
    vec3 cMidIceBlue     = vec3(0.440, 0.740, 1.000); // Luminous Ice Blue (#8FC4FF)
    vec3 cDeepBlue       = vec3(0.100, 0.300, 0.700); // Deep sapphire blue on far left
    vec3 cRazorCold      = vec3(0.920, 0.960, 1.000); // Crisp near-white cold razor
    vec3 cWarmSun        = vec3(0.980, 0.940, 0.850); // Warm white / champagne (#F2E8D5)

    // Smooth continuous gradient across altitudes
    vec3 layerCol = mix(cGroundSapphire, cMidIceBlue, smoothstep(0.0, 0.60, normAlt));
    layerCol = mix(layerCol, cRazorCold, smoothstep(0.60, 0.88, normAlt));

    // Razor-edge color: Warm-white near the star -> Ice-blue in mid-arc -> Deep sapphire blue on far left
    vec3 razorColor = cMidIceBlue;
    if (decayFactor > 0.60) {
      razorColor = mix(cMidIceBlue, cWarmSun, smoothstep(0.60, 0.90, decayFactor));
    } else {
      razorColor = mix(cDeepBlue, cMidIceBlue, smoothstep(0.15, 0.60, decayFactor));
    }

    // Atmospheric body color: warm forward scatter only near star
    vec3 atmoColor = mix(layerCol, cWarmSun, decayFactor * 0.35);

    // 3. Dense Atmospheric Envelope Radiance (restored readable blue layers in middle)
    float bodyRadiance = (0.22 + 0.58 * decayFactor) * (0.80 + 0.20 * (1.0 - normAlt));
    vec3 mainBody = atmoColor * bodyRadiance;

    // 4. Subtle Atmospheric Light Flow / Breathing (slow micro-ripples along arc)
    float flow = sin(arcAngle * 9.0 - uTime * 0.25) * cos(arcAngle * 4.5 + uTime * 0.18);
    float flowMod = 1.0 + flow * 0.045 * decayFactor;

    // Razor-Sharp Outer Edge (Crisp line, smooth exponential decay along arc)
    float razorPeak = smoothstep(0.82, 0.89, normAlt) * (1.0 - smoothstep(0.89, 0.97, normAlt));
    float razorIntensity = pow(razorPeak, 1.5) * (0.20 + 1.10 * decayFactor) * flowMod;

    // Sunrise Intro Sequence modulation (soft dawn ignition)
    float introMul = mix(0.35, 1.0, uIntroProgress);
    razorIntensity *= introMul;
    mainBody *= mix(0.65, 1.0, uIntroProgress);
    vec3 razorLine = razorColor * razorIntensity;

    // Razor and dense atmosphere daytime calibration
    vec3 cDayAtmosphere = vec3(0.20, 0.55, 0.94);
    vec3 effectiveMainBody = mix(mainBody, cDayAtmosphere * (0.40 + 0.35 * (1.0 - normAlt)), uThemeProgress);
    float atmoThemeScale = mix(1.0, 0.75, uThemeProgress);
    float razorThemeScale = mix(1.0, 0.88, uThemeProgress);
    vec3 effectiveRazorLine = mix(razorLine, vec3(0.50, 0.82, 1.00) * razorIntensity, uThemeProgress);

    // Top fade: ensure the dense atmosphere fades out completely and smoothly at normAlt = 1.0
    // Prevents any step or hard boundary between dense atmosphere and outer space
    float topFade = smoothstep(1.00, 0.88, normAlt);
    vec3 denseAtmo = (effectiveMainBody * atmoThemeScale + effectiveRazorLine * razorThemeScale) * topFade;

    // 5. Extended Outer Cosmic Halo (外辉光)
    // Extends only on the sunrise side (driven by forward scattering).
    // In light mode: avoid washing out the daytime sky with oversized outer bloom
    float haloThemeScale = mix(1.0, 0.04, uThemeProgress);
    float hHalo = h - effectiveThick * 0.90;
    float haloAlt = clamp(hHalo / haloThickness, 0.0, 1.0);
    float fadeEdge = 1.0 - haloAlt;
    float haloFalloff = exp(-haloAlt * 6.0) * (fadeEdge * fadeEdge * fadeEdge);

    // Pure cosmic blues: Ice Blue near limb -> Deep space blue further out
    vec3 cHaloNear = mix(vec3(0.40, 0.72, 1.00), cWarmSun, smoothstep(0.70, 1.0, decayFactor) * 0.40);
    vec3 cHaloFar  = vec3(0.08, 0.24, 0.65);
    vec3 haloColor = mix(cHaloNear, cHaloFar, smoothstep(0.0, 0.70, haloAlt));

    // Exosphere scatter only exists near rising star, strictly zero on left arc
    float sunProximity = smoothstep(0.35, 0.88, decayFactor);
    float haloStrength = pow(sunProximity, 1.8) * 0.45 * haloFalloff * mix(0.15, 1.0, uIntroProgress) * haloThemeScale;
    vec3 outerHalo = haloColor * haloStrength;

    // 6. Final Radiance Composite
    vec3 totalRadiance = denseAtmo + outerHalo;

    // Continuous attachment to ground horizon (h = 0)
    float groundAttachment = smoothstep(-0.05, 0.02, h);
    totalRadiance *= groundAttachment;
    gl_FragColor = vec4(totalRadiance, 1.0);
  }
`;
