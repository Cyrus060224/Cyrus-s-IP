/**
 * DEEP SPACE OBSERVATORY · PLANET ENGINE
 * Manages Procedural Planet Mesh, Ice-Blue Atmosphere Shell, Dust Layer & Scale Moonlet
 */

import * as THREE from 'three';
import { planetVertexShader, planetFragmentShader } from '../shaders/planetShaders';
import { atmosphereVertexShader, atmosphereFragmentShader } from '../shaders/atmosphereShaders';

export class PlanetEngine {
  public group: THREE.Group;
  public planetMesh: THREE.Mesh;
  public atmosphereMesh: THREE.Mesh;
  public dustMesh: THREE.Mesh;
  public moonletMesh: THREE.Mesh;

  private planetMat: THREE.ShaderMaterial;
  private atmosphereMat: THREE.ShaderMaterial;
  private dustMat: THREE.ShaderMaterial;
  private moonletMat: THREE.MeshStandardMaterial;

  private planetGeo: THREE.SphereGeometry;
  private atmosphereGeo: THREE.SphereGeometry;
  private dustGeo: THREE.SphereGeometry;
  private moonletGeo: THREE.IcosahedronGeometry;

  // Key directional light vector (Behind/Right)
  public lightDirection: THREE.Vector3 = new THREE.Vector3(1.6, 0.75, -1.9).normalize();
  public sunColor: THREE.Vector3 = new THREE.Vector3(0.95, 0.91, 0.84); // #F2E8D5 warm-white stellar light

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'planet_system';

    const planetRadius = 22.0;

    // 1. Planet Mesh & Procedural Shader
    this.planetGeo = new THREE.SphereGeometry(planetRadius, 64, 48);
    this.planetMat = new THREE.ShaderMaterial({
      vertexShader: planetVertexShader,
      fragmentShader: planetFragmentShader,
      uniforms: {
        uLightDir: { value: this.lightDirection },
        uSunColor: { value: this.sunColor },
        uTime: { value: 0 }
      }
    });
    this.planetMesh = new THREE.Mesh(this.planetGeo, this.planetMat);
    this.planetMesh.renderOrder = 0;
    this.group.add(this.planetMesh);

    // 2. High-Altitude Dust & Storm Layer (Thin semi-transparent wrapper)
    this.dustGeo = new THREE.SphereGeometry(planetRadius * 1.012, 48, 36);
    this.dustMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec3 vWorldNormal;
        varying vec3 vPosition;
        void main() {
          vPosition = position;
          vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uLightDir;
        varying vec3 vWorldNormal;
        varying vec3 vPosition;

        void main() {
          vec3 n = normalize(vWorldNormal);
          float dayLight = smoothstep(-0.1, 0.25, dot(n, normalize(uLightDir)));
          
          float band = sin(vPosition.y * 0.8 + uTime * 0.05) * 0.5 + 0.5;
          float patch = sin(vPosition.x * 0.6 + vPosition.z * 0.4 + uTime * 0.08) * 0.5 + 0.5;
          float dustMask = smoothstep(0.45, 0.85, band * patch);

          vec3 hazeColor = vec3(0.42, 0.58, 0.78);
          gl_FragColor = vec4(hazeColor, dustMask * 0.16 * dayLight);
        }
      `,
      uniforms: {
        uTime: { value: 0 },
        uLightDir: { value: this.lightDirection }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    this.dustMesh = new THREE.Mesh(this.dustGeo, this.dustMat);
    this.dustMesh.renderOrder = 1;
    this.group.add(this.dustMesh);

    // 3. Ice-Blue Atmosphere Scattering Shell
    this.atmosphereGeo = new THREE.SphereGeometry(planetRadius * 1.042, 64, 48);
    this.atmosphereMat = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      uniforms: {
        uLightDir: { value: this.lightDirection },
        uSunColor: { value: this.sunColor }
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.FrontSide
    });
    this.atmosphereMesh = new THREE.Mesh(this.atmosphereGeo, this.atmosphereMat);
    this.atmosphereMesh.renderOrder = 2;
    this.group.add(this.atmosphereMesh);

    // 4. Distant Low-Poly Scale Moonlet
    this.moonletGeo = new THREE.IcosahedronGeometry(0.55, 1);
    this.moonletMat = new THREE.MeshStandardMaterial({
      color: 0x484d56,
      roughness: 0.85,
      metalness: 0.1,
      flatShading: true
    });
    this.moonletMesh = new THREE.Mesh(this.moonletGeo, this.moonletMat);
    // Positioned deep in upper left of the void to anchor the scale
    this.moonletMesh.position.set(-36.0, 14.0, -55.0);
    this.group.add(this.moonletMesh);

    // Positioning Planet in Bottom-Right to cut sweeping horizon across frame
    this.group.position.set(13.5, -16.5, -12.0);
    this.group.rotation.z = -0.22; // Natural orbital axial tilt
  }

  public update(delta: number, elapsed: number): void {
    // Planetary rotation
    this.planetMesh.rotation.y += delta * 0.008;
    this.planetMat.uniforms.uTime.value = elapsed;

    // Dust storm differential rotation
    this.dustMesh.rotation.y += delta * 0.011;
    this.dustMat.uniforms.uTime.value = elapsed;

    // Atmosphere keeps alignment
    this.atmosphereMesh.rotation.y = this.planetMesh.rotation.y;

    // Tiny moonlet slow orbital float
    this.moonletMesh.rotation.y += delta * 0.004;
    this.moonletMesh.rotation.x += delta * 0.002;
  }

  public dispose(): void {
    this.planetGeo.dispose();
    this.planetMat.dispose();

    this.atmosphereGeo.dispose();
    this.atmosphereMat.dispose();

    this.dustGeo.dispose();
    this.dustMat.dispose();

    this.moonletGeo.dispose();
    this.moonletMat.dispose();
  }
}
