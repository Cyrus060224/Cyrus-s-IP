/**
 * DEEP SPACE OBSERVATORY · STAGE MASTER
 * Scene graph, Perspective Camera, Dolly Zoom, Parallax Inertia & Lifecycle Management
 */

import * as THREE from 'three';
import { StarField } from './StarField';
import { PlanetEngine } from './PlanetEngine';
import { InstrumentManager, type InstrumentScreenCoords } from './InstrumentManager';
import { PostPipeline } from './PostPipeline';
import { detectDeviceCapabilities, type DeviceProfile } from '../utils/deviceTier';

export interface StageOptions {
  container: HTMLElement;
  onScreenCoordsUpdate?: (coords: InstrumentScreenCoords[]) => void;
  onHoverChange?: (hoveredId: string | null) => void;
  onTransitionStart?: (route: string) => void;
}

export class Stage {
  private container: HTMLElement;
  private profile: DeviceProfile;

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  private starField: StarField;
  private planetEngine: PlanetEngine;
  private instrumentManager: InstrumentManager;
  private postPipeline: PostPipeline;

  private clock: THREE.Clock = new THREE.Clock();
  private animFrameId: number | null = null;
  private isPaused: boolean = false;
  private intersectionObserver: IntersectionObserver | null = null;

  // Camera & Parallax State
  private targetCameraPos: THREE.Vector3 = new THREE.Vector3(0, 0, 22.0);
  private currentCameraPos: THREE.Vector3 = new THREE.Vector3(0, 0, 22.0);
  private baseCameraPos: THREE.Vector3 = new THREE.Vector3(0, 0, 22.0);

  private mouseTarget: THREE.Vector2 = new THREE.Vector2(0, 0);
  private mouseCurrent: THREE.Vector2 = new THREE.Vector2(0, 0);

  // Dolly Zoom Transition State
  private isTransitioning: boolean = false;
  private transitionStartTime: number = 0;
  private transitionStartPos: THREE.Vector3 = new THREE.Vector3();
  private transitionEndPos: THREE.Vector3 = new THREE.Vector3();
  private transitionTargetRoute: string = '';

  private onScreenCoordsUpdate?: (coords: InstrumentScreenCoords[]) => void;
  private onHoverChange?: (hoveredId: string | null) => void;
  private onTransitionStart?: (route: string) => void;

  constructor(options: StageOptions) {
    this.container = options.container;
    this.onScreenCoordsUpdate = options.onScreenCoordsUpdate;
    this.onHoverChange = options.onHoverChange;
    this.onTransitionStart = options.onTransitionStart;

    this.profile = detectDeviceCapabilities();

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0d10);

    // 2. Perspective Camera (Narrow FOV 36deg for cinematic scale)
    this.camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 700);
    this.camera.position.copy(this.currentCameraPos);
    this.scene.add(this.camera);

    // 3. WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: this.profile.tier === 'tier-1',
      stencil: false,
      depth: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.profile.dpr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.container.appendChild(this.renderer.domElement);

    // 4. Lighting Rig (Side-rear sun key + planetary bounce + cosmic rim + ambient)
    const ambientLight = new THREE.AmbientLight(0x1c2230, 0.65);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff5e6, 2.4);
    sunLight.position.set(24, 12, -28);
    this.scene.add(sunLight);

    // Planetary reflection (bounce from huge planet in bottom right up towards instruments)
    const planetaryBounceLight = new THREE.DirectionalLight(0xd97736, 1.2);
    planetaryBounceLight.position.set(12, -15, 2);
    this.scene.add(planetaryBounceLight);

    // Subtle cosmic rim light to catch instrument facets against deep void
    const cosmicRimLight = new THREE.DirectionalLight(0xa5c4e8, 0.95);
    cosmicRimLight.position.set(-14, 10, 16);
    this.scene.add(cosmicRimLight);

    // 5. Star Field
    this.starField = new StarField(this.profile.tier === 'tier-1' ? 1500 : 800);
    this.scene.add(this.starField.points);

    // 6. Planet Engine
    this.planetEngine = new PlanetEngine();
    this.scene.add(this.planetEngine.group);

    // 7. Instrument Fleet
    this.instrumentManager = new InstrumentManager();
    this.scene.add(this.instrumentManager.group);

    // 8. Single-pass Post Pipeline
    this.postPipeline = new PostPipeline(this.renderer, width, height, this.profile.tier);

    // 9. Event Listeners & Observers
    this.bindEvents();
    this.setupIntersectionObserver();

    // 10. Start Render Loop
    this.startLoop();
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('click', this.onClick);

    if (this.profile.isMobile) {
      window.addEventListener('touchmove', this.onTouchMove, { passive: true });
    }
  }

  private unbindEvents(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('click', this.onClick);
    window.removeEventListener('touchmove', this.onTouchMove);
  }

  private onResize = (): void => {
    if (!this.container) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.postPipeline.setSize(width, height);
  };

  private onMouseMove = (e: MouseEvent): void => {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -(e.clientY / window.innerHeight) * 2 + 1;

    this.mouseTarget.set(x, y);
    this.instrumentManager.updatePointer(x, y);
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      const x = (touch.clientX / window.innerWidth) * 2 - 1;
      const y = -(touch.clientY / window.innerHeight) * 2 + 1;
      this.mouseTarget.set(x * 0.6, y * 0.6);
      this.instrumentManager.updatePointer(x, y);
    }
  };

  public triggerDollyTransition(route: string): void {
    const inst = this.instrumentManager.findInstrumentByRoute(route);
    if (!inst || this.isTransitioning) return;

    this.isTransitioning = true;
    this.transitionStartTime = this.clock.getElapsedTime();
    this.transitionStartPos.copy(this.camera.position);
    this.transitionEndPos.copy(inst.group.position).add(inst.targetOffset);
    this.transitionTargetRoute = route;

    if (this.onTransitionStart) {
      this.onTransitionStart(route);
    }

    // Schedule navigation after smooth camera dolly
    setTimeout(() => {
      window.location.href = route;
    }, 720);
  }

  private onClick = (): void => {
    if (this.instrumentManager.hoveredId && !this.isTransitioning) {
      const inst = this.instrumentManager.findInstrumentById(this.instrumentManager.hoveredId);
      if (inst) {
        this.triggerDollyTransition(inst.route);
      }
    }
  };

  private setupIntersectionObserver(): void {
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.isPaused = !entry.isIntersecting;
      if (!this.isPaused && !this.animFrameId) {
        this.startLoop();
      }
    }, { threshold: 0.05 });

    this.intersectionObserver.observe(this.container);
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

    // 1. Camera Parallax Inertia (Heavy damping spring lerp)
    this.mouseCurrent.lerp(this.mouseTarget, 0.038);

    if (this.isTransitioning) {
      // Execute cinematic Dolly-in curve
      const progress = Math.min((elapsed - this.transitionStartTime) / 0.72, 1.0);
      // Heavy ease-out cubic
      const eased = 1.0 - Math.pow(1.0 - progress, 3.0);
      this.camera.position.lerpVectors(this.transitionStartPos, this.transitionEndPos, eased);
      this.camera.fov = THREE.MathUtils.lerp(36, 26, eased);
      this.camera.updateProjectionMatrix();
    } else {
      // Normal subtle parallax drift
      const parallaxX = this.mouseCurrent.x * 0.9;
      const parallaxY = this.mouseCurrent.y * 0.65;
      this.camera.position.x = this.baseCameraPos.x + parallaxX;
      this.camera.position.y = this.baseCameraPos.y + parallaxY;
      this.camera.lookAt(new THREE.Vector3(0, 0, 0));
    }

    // Force camera world matrix update immediately so projection is frame-perfect
    this.camera.updateMatrixWorld(true);

    // 2. Update Subsystems
    this.starField.update(elapsed);
    this.planetEngine.update(delta, elapsed);
    this.instrumentManager.update(elapsed, this.camera);

    // 3. Project 2D Screen Coordinates for Telemetry HUD EVERY FRAME
    if (this.onScreenCoordsUpdate) {
      const rect = this.container.getBoundingClientRect();
      const width = rect.width || this.container.clientWidth || window.innerWidth;
      const height = rect.height || this.container.clientHeight || window.innerHeight;
      const coords = this.instrumentManager.getScreenPositions(this.camera, width, height);
      this.onScreenCoordsUpdate(coords);
    }

    // 4. Hover State Change Dispatch
    if (this.onHoverChange) {
      this.onHoverChange(this.instrumentManager.hoveredId);
    }

    // 5. Post-Processing / Final Render
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
    }

    this.starField.dispose();
    this.planetEngine.dispose();
    this.instrumentManager.dispose();
    this.postPipeline.dispose();

    this.renderer.dispose();
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
