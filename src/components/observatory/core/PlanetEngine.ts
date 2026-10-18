/**
 * DEEP SPACE OBSERVATORY · PLANET & SUNRISE ENGINE
 * Flatter Asymmetric Horizon, Multi-Layer Atmosphere with Extended Outer Halo,
 * Calibrated Star Optics with Horizon Bleed, Controlled Lens Flares & Dawn Intro
 */

import * as THREE from 'three';
import { planetVertexShader, planetFragmentShader } from '../shaders/planetShaders';
import { atmosphereVertexShader, atmosphereFragmentShader } from '../shaders/atmosphereShaders';

export class PlanetEngine {
  public group: THREE.Group;
  public planetMesh: THREE.Mesh;
  public atmosphereMesh: THREE.Mesh;
  public sunFlareGroup: THREE.Group;

  private planetMat: THREE.ShaderMaterial;
  private atmosphereMat: THREE.ShaderMaterial;
  private coreMat: THREE.ShaderMaterial;
  private coronaMat: THREE.ShaderMaterial;
  private diffMat: THREE.ShaderMaterial;
  private lensGhost1Mat: THREE.ShaderMaterial;
  private lensGhost2Mat: THREE.ShaderMaterial;

  private sunCoreMesh: THREE.Mesh;
  private sunCoronaMesh: THREE.Mesh;
  private sunDiffractionMesh: THREE.Mesh;
  private lensGhost1Mesh: THREE.Mesh;
  private lensGhost2Mesh: THREE.Mesh;

  private planetGeo: THREE.SphereGeometry;
  private atmosphereGeo: THREE.SphereGeometry;
  private coreGeo: THREE.PlaneGeometry;
  private coronaGeo: THREE.PlaneGeometry;
  private diffGeo: THREE.PlaneGeometry;
  private ghost1Geo: THREE.PlaneGeometry;
  private ghost2Geo: THREE.PlaneGeometry;

  // Planetary Geometry Constants (Flatter, sweeping, subtly asymmetric arc)
  public readonly planetRadius: number = 64.0;
  public readonly mainAtmoRadius: number = 65.0; // Dense atmospheric envelope (1.0u / ~32px)
  public readonly haloRadius: number = 65.70;    // Restrained outer halo (~25px, 3-4x razor width)
  public readonly planetCenter: THREE.Vector3 = new THREE.Vector3(2.8, -65.2, -2.0);

  // Rising Star Position (grazing right-hand horizon limb, center tucked behind horizon)
  public readonly sunPosition: THREE.Vector3 = new THREE.Vector3(12.5, -2.10, -2.0);
  public readonly baseSunY: number = -2.10;
  public readonly hiddenSunY: number = -3.20;

  // Sunrise intro state
  private introElapsed: number = 0;
  private readonly introDuration: number = 3.6;
  public isIntroComplete: boolean = false;

  public lightDirection: THREE.Vector3;
  public sunColor: THREE.Vector3 = new THREE.Vector3(0.98, 0.95, 0.90); // Warm-white stellar illumination

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'planet_system';

    // Start with sun positioned below horizon for intro
    this.sunPosition.y = this.hiddenSunY;

    // Light direction from planet center to sun
    this.lightDirection = new THREE.Vector3()
      .subVectors(this.sunPosition, this.planetCenter)
      .normalize();

    // 1. Planet Mesh & Procedural Shader
    this.planetGeo = new THREE.SphereGeometry(this.planetRadius, 384, 192);
    this.planetMat = new THREE.ShaderMaterial({
      vertexShader: planetVertexShader,
      fragmentShader: planetFragmentShader,
      uniforms: {
        uSunPosition: { value: this.sunPosition },
        uSunColor: { value: this.sunColor },
        uPlanetCenter: { value: this.planetCenter },
        uTime: { value: 0 }
      }
    });
    this.planetMesh = new THREE.Mesh(this.planetGeo, this.planetMat);
    this.planetMesh.position.copy(this.planetCenter);
    this.planetMesh.renderOrder = 0;
    this.group.add(this.planetMesh);

    // 2. Multi-layer Rayleigh + Mie Scattering Atmosphere & Outer Halo
    this.atmosphereGeo = new THREE.SphereGeometry(this.haloRadius, 384, 192);
    this.atmosphereMat = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      uniforms: {
        uSunPosition: { value: this.sunPosition },
        uSunColor: { value: this.sunColor },
        uPlanetCenter: { value: this.planetCenter },
        uPlanetRadius: { value: this.planetRadius },
        uMainAtmoRadius: { value: this.mainAtmoRadius },
        uHaloRadius: { value: this.haloRadius },
        uTime: { value: 0 },
        uIntroProgress: { value: 0.0 }
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.BackSide
    });
    this.atmosphereMesh = new THREE.Mesh(this.atmosphereGeo, this.atmosphereMat);
    this.atmosphereMesh.position.copy(this.planetCenter);
    this.atmosphereMesh.renderOrder = 1;
    this.group.add(this.atmosphereMesh);

    // 3. Rising Star Optical System (Anamorphic sunrise glow, point-source core, diffuse ghosts)
    this.sunFlareGroup = new THREE.Group();
    this.sunFlareGroup.position.copy(this.sunPosition);
    this.sunFlareGroup.rotation.z = -0.1526; // Aligned with local horizon tangent
    this.sunFlareGroup.renderOrder = 10;

    const flareUniforms = {
      uPlanetCenter: { value: this.planetCenter },
      uPlanetRadius: { value: this.planetRadius },
      uIntroProgress: { value: 0.0 }
    };

    // 3a. Smooth Point-Source Core (Partially tucked behind horizon, smooth Gaussian + Cauchy tail)
    this.coreMat = new THREE.ShaderMaterial({
      uniforms: flareUniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uPlanetCenter;
        uniform float uPlanetRadius;
        uniform float uIntroProgress;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          float u = (vUv.x - 0.5) * 2.0;
          float v = (vUv.y - 0.5) * 2.0;
          float rCore = length(vec2(u * 0.75, v * 1.35));
          if (rCore > 1.0) discard;

          // Horizon occlusion: bottom half occluded behind opaque planet
          float alt = length(vWorldPos - uPlanetCenter) - uPlanetRadius;
          float horizonClip = smoothstep(-0.25, 0.05, alt);
          if (horizonClip <= 0.0) discard;

          // Continuous Gaussian + Cauchy long tail (no sharp circular edge or plateau)
          float fade = pow(1.0 - rCore, 2.5);
          float coreVal = (exp(-rCore * rCore * 16.0) * 0.65 + 1.0 / (1.0 + rCore * rCore * 28.0) * 0.35) * fade * 1.55;
          vec3 coreCol = vec3(1.0, 0.98, 0.93);
          gl_FragColor = vec4(coreCol * coreVal * horizonClip * mix(0.10, 1.0, uIntroProgress), 1.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    });
    this.coreGeo = new THREE.PlaneGeometry(3.2, 1.8);
    this.sunCoreMesh = new THREE.Mesh(this.coreGeo, this.coreMat);
    this.sunFlareGroup.add(this.sunCoreMesh);

    // 3b. Anamorphic Sunrise Corona & Bleed (Stretched along horizon tangent, merges with atmosphere)
    this.coronaMat = new THREE.ShaderMaterial({
      uniforms: flareUniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uPlanetCenter;
        uniform float uPlanetRadius;
        uniform float uIntroProgress;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          float u = (vUv.x - 0.5) * 2.0;
          float v = (vUv.y - 0.5) * 2.0;
          float rEllip = length(vec2(u * 0.55, v * 1.35));
          if (rEllip > 1.0) discard;

          float alt = length(vWorldPos - uPlanetCenter) - uPlanetRadius;
          float horizonClip = smoothstep(-0.35, 0.08, alt);
          if (horizonClip <= 0.0) discard;

          float fade = pow(1.0 - rEllip, 3.0);
          float falloff = (exp(-rEllip * rEllip * 5.0) * 0.40 + 1.0 / (1.0 + rEllip * rEllip * 10.0) * 0.60) * fade * 0.85;
          vec3 coronaCol = mix(vec3(0.99, 0.95, 0.88), vec3(0.50, 0.78, 1.00), smoothstep(0.10, 0.70, rEllip));
          gl_FragColor = vec4(coronaCol * falloff * horizonClip * mix(0.15, 1.0, uIntroProgress), 1.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    });
    this.coronaGeo = new THREE.PlaneGeometry(16.0, 5.0);
    this.sunCoronaMesh = new THREE.Mesh(this.coronaGeo, this.coronaMat);
    this.sunFlareGroup.add(this.sunCoronaMesh);

    // 3c. Subtle 4-Point Micro-Diffraction Ray
    this.diffMat = new THREE.ShaderMaterial({
      uniforms: flareUniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uPlanetCenter;
        uniform float uPlanetRadius;
        uniform float uIntroProgress;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          if (r > 1.0) discard;
          float alt = length(vWorldPos - uPlanetCenter) - uPlanetRadius;
          float horizonClip = smoothstep(-0.20, 0.10, alt);
          if (horizonClip <= 0.0) discard;

          float fade = (1.0 - r) * (1.0 - r);
          float a = 0.44;
          vec2 rotP = vec2(cos(a) * p.x - sin(a) * p.y, sin(a) * p.x + cos(a) * p.y);
          float spike = (exp(-abs(rotP.x) * 60.0) * exp(-abs(rotP.y) * 6.0) +
                         exp(-abs(rotP.y) * 60.0) * exp(-abs(rotP.x) * 6.0)) * 0.08 * fade;
          vec3 spikeCol = mix(vec3(1.0, 0.98, 0.94), vec3(0.65, 0.85, 1.0), r);
          gl_FragColor = vec4(spikeCol * spike * horizonClip * uIntroProgress, 1.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    });
    this.diffGeo = new THREE.PlaneGeometry(3.6, 3.6);
    this.sunDiffractionMesh = new THREE.Mesh(this.diffGeo, this.diffMat);
    this.sunFlareGroup.add(this.sunDiffractionMesh);

    this.group.add(this.sunFlareGroup);

    // 3d. Diffuse Optical Lens Ghost Spots (Pure soft Gaussian bokeh, NO rings or sharp borders)
    const ghostShader = {
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          float r = length(vUv - 0.5) * 2.0;
          if (r > 1.0) discard;
          float fade = (1.0 - r) * (1.0 - r);
          float spot = exp(-r * r * 4.5) * fade * uOpacity;
          gl_FragColor = vec4(uColor * spot, 1.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    };

    this.lensGhost1Mat = new THREE.ShaderMaterial({
      ...ghostShader,
      uniforms: {
        uColor: { value: new THREE.Vector3(0.35, 0.65, 0.95) },
        uOpacity: { value: 0.0 }
      }
    });
    this.ghost1Geo = new THREE.PlaneGeometry(2.5, 2.5);
    this.lensGhost1Mesh = new THREE.Mesh(this.ghost1Geo, this.lensGhost1Mat);
    this.lensGhost1Mesh.position.set(7.5, -2.01, -1.9);
    this.lensGhost1Mesh.renderOrder = 10;
    this.group.add(this.lensGhost1Mesh);

    this.lensGhost2Mat = new THREE.ShaderMaterial({
      ...ghostShader,
      uniforms: {
        uColor: { value: new THREE.Vector3(0.28, 0.55, 0.90) },
        uOpacity: { value: 0.0 }
      }
    });
    this.ghost2Geo = new THREE.PlaneGeometry(1.6, 1.6);
    this.lensGhost2Mesh = new THREE.Mesh(this.ghost2Geo, this.lensGhost2Mat);
    this.lensGhost2Mesh.position.set(3.2, -1.89, -1.9);
    this.lensGhost2Mesh.renderOrder = 10;
    this.group.add(this.lensGhost2Mesh);
  }

  public skipIntro(): void {
    this.introElapsed = this.introDuration;
    this.isIntroComplete = true;
  }

  public update(delta: number, elapsed: number, prefersReducedMotion: boolean = false): void {
    if (prefersReducedMotion) {
      this.introElapsed = this.introDuration;
      this.isIntroComplete = true;
    } else if (!this.isIntroComplete) {
      this.introElapsed += delta;
      if (this.introElapsed >= this.introDuration) {
        this.introElapsed = this.introDuration;
        this.isIntroComplete = true;
      }
    }

    const p = Math.min(this.introElapsed / this.introDuration, 1.0);
    // Cubic ease-out
    const eased = 1.0 - Math.pow(1.0 - p, 3.0);

    this.sunPosition.y = THREE.MathUtils.lerp(this.hiddenSunY, this.baseSunY, eased);
    this.sunFlareGroup.position.copy(this.sunPosition);

    this.planetMat.uniforms.uTime.value = elapsed;
    this.atmosphereMat.uniforms.uTime.value = elapsed;
    this.atmosphereMat.uniforms.uIntroProgress.value = eased;
    this.coreMat.uniforms.uIntroProgress.value = eased;
    this.coronaMat.uniforms.uIntroProgress.value = eased;
    this.diffMat.uniforms.uIntroProgress.value = eased;

    const ghost1Opacity = 0.022 * Math.min(1.0, Math.max(0.0, (eased - 0.35) / 0.65));
    const ghost2Opacity = 0.016 * Math.min(1.0, Math.max(0.0, (eased - 0.50) / 0.50));
    this.lensGhost1Mat.uniforms.uOpacity.value = ghost1Opacity;
    this.lensGhost2Mat.uniforms.uOpacity.value = ghost2Opacity;
  }

  public dispose(): void {
    this.planetGeo.dispose();
    this.planetMat.dispose();
    this.atmosphereGeo.dispose();
    this.atmosphereMat.dispose();

    this.coreGeo.dispose();
    this.coreMat.dispose();
    this.coronaGeo.dispose();
    this.coronaMat.dispose();
    this.diffGeo.dispose();
    this.diffMat.dispose();

    this.ghost1Geo.dispose();
    this.lensGhost1Mat.dispose();
    this.ghost2Geo.dispose();
    this.lensGhost2Mat.dispose();
  }
}
