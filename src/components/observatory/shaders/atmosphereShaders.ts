/**
 * DEEP SPACE OBSERVATORY · ATMOSPHERE SHADERS
 * Concentric Shell with Asymmetric Forward Mie Scattering & Ice-Blue Fresnel Limb
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
  uniform vec3 uLightDir;
  uniform vec3 uSunColor;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec3 lightDir = normalize(uLightDir);

    // Fresnel Rim Glow in continuous world space (narrow and crisp)
    float vDotN = max(dot(viewDir, normal), 0.0);
    float fresnel = pow(1.0 - vDotN, 4.2);

    // Henyey-Greenstein Forward Mie Scattering Phase Function
    // Brightest toward back-light source
    float cosTheta = dot(viewDir, -lightDir);
    float g = 0.76;
    float g2 = g * g;
    float phase = (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5) / 12.566;

    // Normal-to-light term to smoothly extinguish atmosphere on night side
    float nDotL = dot(normal, lightDir);
    float dayFactor = smoothstep(-0.20, 0.40, nDotL);

    // Color gradient: Thin crisp luminous ice blue (#8FC4FF) -> Deep midnight blue -> Fade to black
    vec3 coreIceBlue   = vec3(0.56, 0.77, 1.00); // Luminous ice blue
    vec3 outerMidnight = vec3(0.08, 0.16, 0.35); // Deep cosmic midnight navy
    vec3 atmoColor = mix(coreIceBlue, outerMidnight, fresnel * 0.6);

    // Warm-white grazing glint where direct stellar rays skim the terminator apex
    vec3 warmStellar = vec3(0.95, 0.91, 0.84); // #F2E8D5
    float apexWarmth = pow(clamp(nDotL * 1.6, 0.0, 1.0), 3.0) * pow(phase * 4.5, 1.5);
    atmoColor = mix(atmoColor, warmStellar, clamp(apexWarmth * 0.35, 0.0, 0.45));

    float intensity = fresnel * (phase * 11.5 + 0.16) * dayFactor;
    intensity = clamp(intensity, 0.0, 1.35);

    gl_FragColor = vec4(atmoColor * intensity, intensity);
  }
`;
