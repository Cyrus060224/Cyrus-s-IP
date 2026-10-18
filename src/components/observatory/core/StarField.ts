/**
 * DEEP SPACE OBSERVATORY · STAR FIELD & SUBTLE MILKY WAY
 * Realistic Magnitude Distribution + Diagonal Cold-Slate Cosmic Dust Band
 */

import * as THREE from 'three';

export class StarField {
  public group: THREE.Group;
  public points: THREE.Points;
  public milkyWayMesh: THREE.Mesh;

  private pointsMaterial: THREE.ShaderMaterial;
  private pointsGeometry: THREE.BufferGeometry;
  private milkyWayMaterial: THREE.ShaderMaterial;
  private milkyWayGeometry: THREE.PlaneGeometry;
  private count: number;

  constructor(count: number = 2400) {
    this.count = count;
    this.group = new THREE.Group();
    this.group.name = 'deep_space_background';

    // 1. Procedural Subtle Milky Way Dust Lane (Cold-slate, low saturation, angled diagonally)
    this.milkyWayGeometry = new THREE.PlaneGeometry(160, 100);
    this.milkyWayMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uOpacity: { value: 1.0 }
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying vec2 vUv;

        // Simple hash / noise function
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }

        void main() {
          vec2 uv = vUv - 0.5;

          // Rotate coordinate by ~32 degrees for majestic diagonal tilt
          float angle = 0.56;
          mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
          vec2 rotUv = rot * uv;

          // Main galactic plane gaussian cross-section
          float band = exp(-rotUv.y * rotUv.y * 12.0);

          // Multi-frequency noise for cosmic clouds and dark absorption lanes
          float n = noise(rotUv * 5.5) * 0.55 + noise(rotUv * 12.0) * 0.32 + noise(rotUv * 26.0) * 0.13;
          float dust = band * (n * 0.75 + 0.25);

          // Dark dust rift running along galactic core
          float darkRift = 1.0 - exp(-abs(rotUv.y + 0.03 * noise(rotUv * 8.0)) * 32.0) * 0.65;
          dust *= darkRift;

          // Mask: keep top-left typography area clear and dark for high text readability
          float textZoneX = smoothstep(-0.35, 0.05, uv.x);
          float textZoneY = 1.0 - smoothstep(-0.10, 0.30, uv.y);
          float textZoneMask = clamp(textZoneX + textZoneY, 0.0, 1.0);

          // Subdued cold slate-blue cosmic tone (zero magenta / zero purple)
          vec3 milkyWayColor = vec3(0.065, 0.098, 0.155);
          float alpha = clamp(dust * 0.38 * textZoneMask, 0.0, 1.0) * uOpacity;

          gl_FragColor = vec4(milkyWayColor * alpha, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.milkyWayMesh = new THREE.Mesh(this.milkyWayGeometry, this.milkyWayMaterial);
    this.milkyWayMesh.position.set(6.0, 4.0, -85.0);
    this.group.add(this.milkyWayMesh);

    // 2. Realistic Point Cloud StarField (Layered Magnitude Distribution)
    this.pointsGeometry = new THREE.BufferGeometry();

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const seeds = new Float32Array(count);
    const twinkleRates = new Float32Array(count);

    const radius = 240;

    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = radius * (0.85 + Math.random() * 0.3);

      positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      // Apparent magnitude distribution
      const roll = Math.random();
      let size = 1.0;
      let rCol = 0.82;
      let gCol = 0.86;
      let bCol = 0.94;
      let twinkleRate = 0.0;

      if (roll > 0.96) {
        // 4% bright stars with subtle warm-white or pale ice-blue tint & gentle non-flicker breathing
        size = 2.6 + Math.random() * 1.0;
        twinkleRate = 0.22 + Math.random() * 0.28; // Very slow period (18-28s)
        if (Math.random() > 0.5) {
          rCol = 0.96; gCol = 0.93; bCol = 0.86; // Warm-white #F2E8D5
        } else {
          rCol = 0.65; gCol = 0.82; bCol = 1.00; // Ice blue #8FC4FF
        }
      } else if (roll > 0.78) {
        // 18% medium stars: steady
        size = 1.5 + Math.random() * 0.6;
        rCol = 0.75; gCol = 0.82; bCol = 0.92;
        twinkleRate = 0.0;
      } else {
        // 78% faint background stars: completely steady, no twinkle
        size = 0.8 + Math.random() * 0.45;
        rCol = 0.42; gCol = 0.48; bCol = 0.60;
        twinkleRate = 0.0;
      }

      colors[i * 3 + 0] = rCol;
      colors[i * 3 + 1] = gCol;
      colors[i * 3 + 2] = bCol;
      sizes[i] = size;
      seeds[i] = Math.random() * 100.0;
      twinkleRates[i] = twinkleRate;
    }

    this.pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.pointsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.pointsGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    this.pointsGeometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
    this.pointsGeometry.setAttribute('twinkleRate', new THREE.BufferAttribute(twinkleRates, 1));

    this.pointsMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 1.0 }
      },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute float seed;
        attribute float twinkleRate;
        attribute vec3 color;
        uniform float uTime;

        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vColor = color;
          // Very slow, calm breathing on select bright stars only, zero strobe/flicker
          float twinkle = (twinkleRate > 0.01) ? (0.80 + 0.20 * sin(uTime * twinkleRate + seed)) : 1.0;
          vAlpha = twinkle;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (260.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vec2 coord = gl_PointCoord - vec2(0.5);
          float dist = length(coord);
          if (dist > 0.5) discard;

          float intensity = smoothstep(0.5, 0.04, dist);
          gl_FragColor = vec4(vColor, intensity * vAlpha * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.points = new THREE.Points(this.pointsGeometry, this.pointsMaterial);
    this.group.add(this.points);
  }

  public setOpacity(opacity: number): void {
    const clamped = Math.max(0.0, Math.min(1.0, opacity));
    this.pointsMaterial.uniforms.uOpacity.value = clamped;
    this.milkyWayMaterial.uniforms.uOpacity.value = clamped;
    this.group.visible = clamped > 0.005;
  }

  public setReducedStars(reduced: boolean): void {
    if (reduced) {
      this.pointsGeometry.setDrawRange(0, Math.floor(this.count * 0.5));
    } else {
      this.pointsGeometry.setDrawRange(0, this.count);
    }
  }

  public update(elapsed: number): void {
    this.pointsMaterial.uniforms.uTime.value = elapsed;
  }

  public dispose(): void {
    this.pointsGeometry.dispose();
    this.pointsMaterial.dispose();
    this.milkyWayGeometry.dispose();
    this.milkyWayMaterial.dispose();
  }
}
