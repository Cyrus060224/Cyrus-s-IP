/**
 * DEEP SPACE OBSERVATORY · ATMOSPHERE SHADERS
 * Concentric Shell with Asymmetric Forward Mie Scattering & Fresnel Limb
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

    // Fresnel Rim Glow in continuous world space
    float vDotN = max(dot(viewDir, normal), 0.0);
    float fresnel = pow(1.0 - vDotN, 3.8);

    // Henyey-Greenstein Mie Forward Scattering Phase Function
    // Brightest when looking toward back-light source
    float cosTheta = dot(viewDir, -lightDir);
    float g = 0.74; // High forward scattering ratio
    float g2 = g * g;
    float phase = (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5) / 12.566;

    // Normal-to-light term to smoothly extinguish atmosphere on night side
    float nDotL = dot(normal, lightDir);
    float dayFactor = smoothstep(-0.25, 0.45, nDotL);

    // Color gradient: Inner intense amber -> Outer deep crimson twilight
    vec3 innerAmber = vec3(0.92, 0.50, 0.20);
    vec3 outerCrimson = vec3(0.38, 0.12, 0.06);
    vec3 atmoColor = mix(innerAmber, outerCrimson, fresnel * 0.7);

    float intensity = fresnel * (phase * 12.0 + 0.18) * dayFactor;
    intensity = clamp(intensity, 0.0, 1.4);

    gl_FragColor = vec4(atmoColor * intensity * uSunColor, intensity);
  }
`;
