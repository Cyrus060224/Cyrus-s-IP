/**
 * DEEP SPACE OBSERVATORY · POST PIPELINE
 * Single-Pass Screen Quad Post-Processing Pipeline
 */

import * as THREE from 'three';
import { uberPostVertexShader, uberPostFragmentShader } from '../shaders/uberPostShaders';
import type { DeviceTier } from '../utils/deviceTier';

export class PostPipeline {
  private renderer: THREE.WebGLRenderer;
  private renderTarget: THREE.WebGLRenderTarget | null = null;
  private postScene: THREE.Scene;
  private postCamera: THREE.OrthographicCamera;
  private postMaterial: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private enabled: boolean = true;

  constructor(renderer: THREE.WebGLRenderer, width: number, height: number, tier: DeviceTier) {
    this.renderer = renderer;

    // Disable post-processing on Tier 2 / 3 to maximize FPS on mobile and low-end hardware
    this.enabled = tier === 'tier-1';

    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);

    if (this.enabled) {
      this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType // Preserves high dynamic range for atmospheric bloom
      });
    }

    this.postMaterial = new THREE.ShaderMaterial({
      vertexShader: uberPostVertexShader,
      fragmentShader: uberPostFragmentShader,
      uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: new THREE.Vector2(width, height) },
        uTime: { value: 0 },
        uBloomIntensity: { value: 0.65 },
        uGrainIntensity: { value: 0.016 },
        uVignetteStrength: { value: 0.85 },
        uAberrationStrength: { value: 0.75 }
      },
      depthWrite: false,
      depthTest: false
    });

    const quadGeo = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(quadGeo, this.postMaterial);
    this.postScene.add(this.quad);
  }

  public setSize(width: number, height: number): void {
    if (this.renderTarget) {
      this.renderTarget.setSize(width, height);
    }
    this.postMaterial.uniforms.uResolution.value.set(width, height);
  }

  public render(scene: THREE.Scene, camera: THREE.Camera, time: number): void {
    if (!this.enabled || !this.renderTarget) {
      // Direct rasterization for maximum performance
      this.renderer.render(scene, camera);
      return;
    }

    // Step 1: Render main scene into HDR render target
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(scene, camera);

    // Step 2: Render single-pass Uber post shader directly to screen
    this.renderer.setRenderTarget(null);
    this.postMaterial.uniforms.tDiffuse.value = this.renderTarget.texture;
    this.postMaterial.uniforms.uTime.value = time;
    this.renderer.render(this.postScene, this.postCamera);
  }

  public dispose(): void {
    if (this.renderTarget) {
      this.renderTarget.dispose();
    }
    this.quad.geometry.dispose();
    this.postMaterial.dispose();
  }
}
