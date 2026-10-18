/**
 * DEEP SPACE OBSERVATORY · STAGE MASTER
 * Dynamic Orbital Sunrise, Drift & Parallax, Lifecycle, Visibility & Performance Guards
 */

import * as THREE from 'three';
import { StarField } from './StarField';
import { PlanetEngine } from './PlanetEngine';
import { PostPipeline } from './PostPipeline';
import { detectDeviceCapabilities, type DeviceProfile } from '../utils/deviceTier';

export interface StageOptions {
  container: HTMLElement;
}

export class Stage {
  private container: HTMLElement;
  private heroElement: HTMLElement;
  private profile: DeviceProfile;

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private sunLight: THREE.DirectionalLight;

  private starField: StarField;
  private planetEngine: PlanetEngine;
  private postPipeline: PostPipeline;

  private clock: THREE.Clock = new THREE.Clock();
  private animFrameId: number | null = null;
  private isPaused: boolean = false;
  private isIntersecting: boolean = true;
  private intersectionObserver: IntersectionObserver | null = null;
  private reducedMotionMediaQuery: MediaQueryList | null = null;

  // Camera & Parallax State
  private baseCameraPos: THREE.Vector3 = new THREE.Vector3(0, 0, 32.0);
  private mouseTarget: THREE.Vector2 = new THREE.Vector2(0, 0);
  private mouseCurrent: THREE.Vector2 = new THREE.Vector2(0, 0);

  // Performance auto-downgrade state
  private lowFpsDuration: number = 0;
  private hasDowngraded: boolean = false;

  constructor(options: StageOptions) {
    this.container = options.container;
    this.heroElement = (this.container.closest('.observatory-hero-wrapper') as HTMLElement) || this.container.parentElement || this.container;

    this.profile = detectDeviceCapabilities();

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070B);

    // 2. Perspective Camera (36 deg FOV for authentic orbital perspective)
    this.camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 700);
    this.camera.position.copy(this.baseCameraPos);
    this.camera.lookAt(new THREE.Vector3(0, -1.8, 0));
    this.scene.add(this.camera);

    // 3. WebGL Renderer (Clamped DPR, high-performance)
    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: this.profile.tier === 'tier-1',
      stencil: false,
      depth: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(this.profile.dpr, 2.0));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.container.appendChild(this.renderer.domElement);

    // 4. Planet Engine (Created first to anchor light direction)
    this.planetEngine = new PlanetEngine();
    this.scene.add(this.planetEngine.group);

    // 5. Lighting Rig (Grazing stellar key + cool fill + ambient)
    const ambientLight = new THREE.AmbientLight(0x0c131c, 0.45);
    this.scene.add(ambientLight);

    // Main rising star directional key light (warm-white #F2E8D5)
    this.sunLight = new THREE.DirectionalLight(0xf2e8d5, 2.6);
    this.sunLight.position.copy(this.planetEngine.sunPosition);
    this.scene.add(this.sunLight);

    // Primary warm-white grazing rim light along terminator
    const warmWhiteRimLight = new THREE.DirectionalLight(0xf2e8d5, 1.8);
    warmWhiteRimLight.position.set(13.5, 1.5, -12.0);
    this.scene.add(warmWhiteRimLight);

    // Faint cool-blue fill light from void side to keep dark sides in readable blue-black depth
    const coolBlueFillLight = new THREE.DirectionalLight(0x284260, 0.40);
    coolBlueFillLight.position.set(-14, 4, 16);
    this.scene.add(coolBlueFillLight);

    // Procedural low-intensity cosmic environment map (0KB external file)
    try {
      const pmremGen = new THREE.PMREMGenerator(this.renderer);
      pmremGen.compileEquirectangularShader();

      const envCanvas = document.createElement('canvas');
      envCanvas.width = 64;
      envCanvas.height = 32;
      const ctx = envCanvas.getContext('2d');
      if (ctx) {
        const grad = ctx.createLinearGradient(0, 0, 0, 32);
        grad.addColorStop(0.0, '#04060a');
        grad.addColorStop(0.4, '#0d1522');
        grad.addColorStop(0.7, '#152030');
        grad.addColorStop(1.0, '#1c283c');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 32);
      }

      const envTexture = new THREE.CanvasTexture(envCanvas);
      envTexture.mapping = THREE.EquirectangularReflectionMapping;
      const envMap = pmremGen.fromEquirectangular(envTexture).texture;
      this.scene.environment = envMap;
      envTexture.dispose();
      pmremGen.dispose();
    } catch (e) {
      console.warn('Procedural PMREM environment fallback:', e);
    }

    // 6. Star Field & Subtle Cold-Slate Milky Way
    this.starField = new StarField(this.profile.tier === 'tier-1' ? 2400 : 1200);
    this.scene.add(this.starField.group);

    // 7. Instrument Fleet (Active in Step 3)
    // 7. Single-pass Post Pipeline
    this.postPipeline = new PostPipeline(this.renderer, width, height, this.profile.tier);

    // 8. Event Listeners & Observers
    this.bindEvents();
    this.setupIntersectionObserver();
    this.setupReducedMotion();

    // If reduced motion is requested from start, immediately complete intro
    if (this.profile.prefersReducedMotion) {
      this.planetEngine.skipIntro();
    }

    // 9. Start Render Loop
    this.startLoop();

    if (typeof window !== 'undefined') {
      (window as any).__stage = this;
    }
  }

  private setupReducedMotion(): void {
    if (typeof window !== 'undefined' && window.matchMedia) {
      this.reducedMotionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.profile.prefersReducedMotion = this.reducedMotionMediaQuery.matches;
      this.reducedMotionMediaQuery.addEventListener('change', this.onReducedMotionChange);
    }
  }

  private onReducedMotionChange = (e: MediaQueryListEvent): void => {
    this.profile.prefersReducedMotion = e.matches;
    if (e.matches) {
      this.planetEngine.skipIntro();
      this.mouseTarget.set(0, 0);
      this.mouseCurrent.set(0, 0);
    }
  };

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    this.heroElement.addEventListener('pointermove', this.onPointerMove);
    this.heroElement.addEventListener('pointerleave', this.onPointerLeave);
    this.heroElement.addEventListener('pointercancel', this.onPointerLeave);

    // Interactive intro skip listeners (click, scroll wheel, touch, key press)
    window.addEventListener('wheel', this.onUserSkipAction, { passive: true });
    window.addEventListener('keydown', this.onUserSkipAction, { passive: true });
    this.heroElement.addEventListener('pointerdown', this.onUserSkipAction);

    if (this.profile.isMobile) {
      this.heroElement.addEventListener('touchmove', this.onTouchMove, { passive: true });
      this.heroElement.addEventListener('touchend', this.onPointerLeave);
    }
  }

  private unbindEvents(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);

    window.removeEventListener('wheel', this.onUserSkipAction);
    window.removeEventListener('keydown', this.onUserSkipAction);
    this.heroElement.removeEventListener('pointerdown', this.onUserSkipAction);

    this.heroElement.removeEventListener('pointermove', this.onPointerMove);
    this.heroElement.removeEventListener('pointerleave', this.onPointerLeave);
    this.heroElement.removeEventListener('pointercancel', this.onPointerLeave);

    if (this.reducedMotionMediaQuery) {
      this.reducedMotionMediaQuery.removeEventListener('change', this.onReducedMotionChange);
    }

    this.heroElement.removeEventListener('touchmove', this.onTouchMove);
    this.heroElement.removeEventListener('touchend', this.onPointerLeave);
  }

  private onUserSkipAction = (): void => {
    if (!this.planetEngine.isIntroComplete) {
      this.planetEngine.skipIntro();
    }
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.isPaused = true;
      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }
    } else {
      if (this.isIntersecting) {
        this.isPaused = false;
        this.clock.getDelta(); // flush accumulated delta
        this.startLoop();
      }
    }
  };

  private onResize = (): void => {
    if (!this.container) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.postPipeline.setSize(width, height);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.heroElement || this.profile.prefersReducedMotion) return;
    const rect = this.renderer.domElement.getBoundingClientRect();

    // Bounds check: if pointer is outside canvas, smoothly return parallax to neutral
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom ||
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      this.onPointerLeave();
      return;
    }

    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;
    const ndcX = (pixelX / rect.width) * 2 - 1;
    const ndcY = -(pixelY / rect.height) * 2 + 1;

    this.mouseTarget.set(ndcX, ndcY);
  };

  private onPointerLeave = (): void => {
    this.mouseTarget.set(0, 0);
  };

  private onWindowBlur = (): void => {
    this.mouseTarget.set(0, 0);
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (e.touches.length > 0 && this.heroElement && !this.profile.prefersReducedMotion) {
      const touch = e.touches[0];
      const rect = this.renderer.domElement.getBoundingClientRect();
      if (
        touch.clientX < rect.left ||
        touch.clientX > rect.right ||
        touch.clientY < rect.top ||
        touch.clientY > rect.bottom ||
        rect.width <= 0 ||
        rect.height <= 0
      ) {
        this.onPointerLeave();
        return;
      }
      const pixelX = touch.clientX - rect.left;
      const pixelY = touch.clientY - rect.top;
      const ndcX = (pixelX / rect.width) * 2 - 1;
      const ndcY = -(pixelY / rect.height) * 2 + 1;

      this.mouseTarget.set(ndcX * 0.5, ndcY * 0.5);
    }
  };

  private setupIntersectionObserver(): void {
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.isIntersecting = entry.isIntersecting;
      this.isPaused = !entry.isIntersecting || document.hidden;
      if (!this.isPaused && !this.animFrameId) {
        this.clock.getDelta();
        this.startLoop();
      }
    }, { threshold: 0.05 });

    this.intersectionObserver.observe(this.container);
  }

  private triggerQualityDowngrade(): void {
    if (this.hasDowngraded) return;
    this.hasDowngraded = true;
    this.renderer.setPixelRatio(1.0);
    this.postPipeline.disable();
    this.starField.setReducedStars(true);
    console.info('Orbital Sunrise: Adaptive quality downgrade applied (DPR=1.0, post-fx disabled, star count halved).');
  }

  private startLoop(): void {
    const loop = () => {
      if (this.isPaused) {
        this.animFrameId = null;
        return;
      }

      this.renderFrame();
      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  private renderFrame(): void {
    const delta = Math.min(this.clock.getDelta(), 0.1);
    const elapsed = this.clock.getElapsedTime();

    // 1. Adaptive Frame Rate Monitor (Sustained < 40fps for 2s triggers downgrade)
    if (!this.hasDowngraded && delta > 0) {
      const instantFps = 1.0 / delta;
      if (instantFps < 40.0) {
        this.lowFpsDuration += delta;
        if (this.lowFpsDuration >= 2.0) {
          this.triggerQualityDowngrade();
        }
      } else {
        this.lowFpsDuration = Math.max(0, this.lowFpsDuration - delta * 0.5);
      }
    }

    // 2. Camera Breathing Drift & Pointer Parallax
    let driftX = 0;
    let driftY = 0;
    let parallaxX = 0;
    let parallaxY = 0;

    if (!this.profile.prefersReducedMotion) {
      // Periodic breathing drift (Periods 48s and 42s, amplitude < 1.5% viewport width)
      driftX = Math.sin((elapsed * 2 * Math.PI) / 48.0) * 0.22 + Math.sin((elapsed * 2 * Math.PI) / 84.0) * 0.08;
      driftY = Math.cos((elapsed * 2 * Math.PI) / 42.0) * 0.14 + Math.sin((elapsed * 2 * Math.PI) / 68.0) * 0.05;

      // Heavy damping spring lerp for pointer parallax
      this.mouseCurrent.lerp(this.mouseTarget, 0.038);
      parallaxX = this.mouseCurrent.x * 0.32;
      parallaxY = this.mouseCurrent.y * 0.20;
    } else {
      this.mouseCurrent.set(0, 0);
    }

    this.camera.position.set(
      this.baseCameraPos.x + driftX + parallaxX,
      this.baseCameraPos.y + driftY + parallaxY,
      32.0
    );
    this.camera.lookAt(new THREE.Vector3(driftX * 0.35, -1.8 + driftY * 0.35, 0));
    this.camera.updateMatrixWorld(true);

    // 3. Update Celestial Entities
    this.starField.update(elapsed);
    this.planetEngine.update(delta, elapsed, this.profile.prefersReducedMotion);
    this.sunLight.position.copy(this.planetEngine.sunPosition);

    // 4. Final Post-Processing
    this.postPipeline.render(this.scene, this.camera, elapsed);
  }

  public dispose(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    this.unbindEvents();

    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }

    if (this.scene.environment) {
      this.scene.environment.dispose();
      this.scene.environment = null;
    }

    this.starField.dispose();
    this.planetEngine.dispose();
    this.postPipeline.dispose();

    this.renderer.dispose();
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
