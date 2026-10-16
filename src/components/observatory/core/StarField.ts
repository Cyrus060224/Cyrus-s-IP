/**
 * DEEP SPACE OBSERVATORY · STAR FIELD
 * Point Cloud with Logarithmic Apparent Magnitude Distribution & Subtle Twinkle
 */

import * as THREE from 'three';

export class StarField {
  public points: THREE.Points;
  private material: THREE.ShaderMaterial;
  private geometry: THREE.BufferGeometry;

  constructor(count: number = 1400) {
    this.geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const seeds = new Float32Array(count);

    const radius = 280;

    for (let i = 0; i < count; i++) {
      // Uniform spherical surface distribution
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = radius * (0.8 + Math.random() * 0.4);

      positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      // Magnitude distribution (few bright, mostly dim)
      const roll = Math.random();
      let size = 1.0;
      let rCol = 0.88;
      let gCol = 0.90;
      let bCol = 0.96;

      if (roll > 0.96) {
        // 4% bright stars with subtle warm-white or pale ice-blue tint
        size = 2.4 + Math.random() * 1.2;
        if (Math.random() > 0.5) {
          // Warm-white stellar point (#F2E8D5)
          rCol = 0.95;
          gCol = 0.91;
          bCol = 0.84;
        } else {
          // Pale ice-blue stellar point (#8FC4FF)
          rCol = 0.65;
          gCol = 0.82;
          bCol = 1.00;
        }
      } else if (roll > 0.82) {
        // 14% medium stars (crisp pale ice-white)
        size = 1.4 + Math.random() * 0.6;
        rCol = 0.82;
        gCol = 0.88;
        bCol = 0.96;
      } else {
        // 82% faint deep-space background stars
        size = 0.7 + Math.random() * 0.5;
        rCol = 0.42;
        gCol = 0.48;
        bCol = 0.58;
      }

      colors[i * 3 + 0] = rCol;
      colors[i * 3 + 1] = gCol;
      colors[i * 3 + 2] = bCol;
      sizes[i] = size;
      seeds[i] = Math.random() * 100.0;
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }
      },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute float seed;
        attribute vec3 color;
        uniform float uTime;

        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vColor = color;
          // Subtle twinkle with individual phase and very low frequency (0.15Hz)
          float twinkle = sin(uTime * 1.2 + seed) * 0.5 + 0.5;
          vAlpha = mix(0.45, 1.0, twinkle);

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (200.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          // Circular point with smooth Gaussian falloff
          vec2 coord = gl_PointCoord - vec2(0.5);
          float dist = length(coord);
          if (dist > 0.5) discard;

          float intensity = smoothstep(0.5, 0.05, dist);
          gl_FragColor = vec4(vColor, intensity * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.points = new THREE.Points(this.geometry, this.material);
  }

  public update(time: number): void {
    this.material.uniforms.uTime.value = time;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
