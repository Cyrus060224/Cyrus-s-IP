/**
 * DEEP SPACE OBSERVATORY · INSTRUMENT MANAGER
 * Controls 3 Procedural Orbital Instruments, Horizon Silhouette Positioning,
 * Specular Glint Sweeps, Screen-Space 2D Projections, Raycasting & Lifecycle Cleanup
 */

import * as THREE from 'three';
import {
  createTelescopeGroup,
  createProbeGroup,
  createLogPodGroup,
  type ProceduralInstrumentResult
} from '../utils/proceduralGeometries';

export interface InstrumentItem {
  id: string;
  name: string;
  code: string;
  route: string;
  group: THREE.Group;
  basePosition: THREE.Vector3;
  desktopBasePosition: THREE.Vector3;
  mobileBasePosition: THREE.Vector3;
  targetOffset: THREE.Vector3;
  visualAnchorOffset: THREE.Vector3;
  floatingSeed: number;
  hitRadius: number;
  glintPhase: number;
  glintMaterials: THREE.MeshStandardMaterial[];
}

export interface InstrumentScreenCoords {
  id: string;
  x: number;
  y: number;
  visible: boolean;
  code: string;
  name: string;
  route: string;
}

export class InstrumentManager {
  public group: THREE.Group;
  public instruments: InstrumentItem[] = [];
  public hoveredId: string | null = null;
  public activeDollyTarget: InstrumentItem | null = null;
  public isMobileLayout: boolean = false;

  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private mouseVec: THREE.Vector2 = new THREE.Vector2(-999, -999);
  private isPointerInside: boolean = false;
  private pointerPixelX: number | null = null;
  private pointerPixelY: number | null = null;
  private canvasWidth: number = 1440;
  private canvasHeight: number = 720;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'instruments_fleet';
    this.group.renderOrder = 5; // Render after atmosphere (renderOrder 1)

    // 1. PRJ-02: Orbital Engineering Probe (轨道造物 -> /projects)
    // Near Foreground: Center-right, commanding silhouette against the glowing ice-blue atmosphere arc.
    const probeRes: ProceduralInstrumentResult = createProbeGroup();
    const prjDesktop = new THREE.Vector3(2.4, -0.15, 8.5);
    const prjMobile = new THREE.Vector3(0.0, -0.32, 7.5); // Centered on mobile
    probeRes.group.position.copy(prjDesktop);
    probeRes.group.rotation.set(-0.15, -0.35, 0.08);
    this.group.add(probeRes.group);

    this.instruments.push({
      id: 'projects',
      name: '轨道造物 / Probes',
      code: 'PRJ-02',
      route: '/projects',
      group: probeRes.group,
      basePosition: prjDesktop.clone(),
      desktopBasePosition: prjDesktop,
      mobileBasePosition: prjMobile,
      targetOffset: new THREE.Vector3(0, 0, 3.2),
      visualAnchorOffset: new THREE.Vector3(0, 0.25, 0),
      floatingSeed: 48.2,
      hitRadius: 0.95,
      glintPhase: 0.0,
      glintMaterials: probeRes.glintMaterials
    });

    // 2. OBS-01: Deep Space Optical Telescope (深空光影 -> /gallery)
    // Background Right: Placed in the warm-to-cold transitional atmospheric glow,
    // safely left of the rising star core (X=12.5) to avoid overexposure.
    const telescopeRes: ProceduralInstrumentResult = createTelescopeGroup();
    const obsDesktop = new THREE.Vector3(7.2, -0.65, 1.8);
    const obsMobile = new THREE.Vector3(2.6, -0.75, 1.8); // Right side on mobile
    telescopeRes.group.position.copy(obsDesktop);
    telescopeRes.group.rotation.set(0.15, 0.45, -0.12);
    this.group.add(telescopeRes.group);

    this.instruments.push({
      id: 'gallery',
      name: '深空光影 / Viewport',
      code: 'OBS-01',
      route: '/gallery',
      group: telescopeRes.group,
      basePosition: obsDesktop.clone(),
      desktopBasePosition: obsDesktop,
      mobileBasePosition: obsMobile,
      targetOffset: new THREE.Vector3(0, 0, 3.0),
      visualAnchorOffset: new THREE.Vector3(0, 0.22, 0),
      floatingSeed: 12.5,
      hitRadius: 0.75,
      glintPhase: 7.5,
      glintMaterials: telescopeRes.glintMaterials
    });

    // 3. LOG-03: Autonomous Flight Log Pod (航行日志 -> /posts)
    // Background Left: Placed against the deep sapphire/ice-blue atmosphere band on the left,
    // positioned under the trailing subtitle, well clear of title block.
    const logPodRes: ProceduralInstrumentResult = createLogPodGroup();
    const logDesktop = new THREE.Vector3(-6.2, -0.95, 0.8);
    const logMobile = new THREE.Vector3(-2.2, -0.95, 1.0); // Left side on mobile
    logPodRes.group.position.copy(logDesktop);
    logPodRes.group.rotation.set(0.28, 0.20, -0.25);
    this.group.add(logPodRes.group);

    this.instruments.push({
      id: 'posts',
      name: '航行日志 / Logs',
      code: 'LOG-03',
      route: '/posts',
      group: logPodRes.group,
      basePosition: logDesktop.clone(),
      desktopBasePosition: logDesktop,
      mobileBasePosition: logMobile,
      targetOffset: new THREE.Vector3(0, 0, 2.8),
      visualAnchorOffset: new THREE.Vector3(0, 0.28, 0),
      floatingSeed: 91.7,
      hitRadius: 0.80,
      glintPhase: 15.0,
      glintMaterials: logPodRes.glintMaterials
    });
  }

  public setLayout(isMobile: boolean): void {
    if (this.isMobileLayout === isMobile) return;
    this.isMobileLayout = isMobile;
    this.instruments.forEach(inst => {
      inst.basePosition.copy(isMobile ? inst.mobileBasePosition : inst.desktopBasePosition);
    });
  }

  public updatePointer(
    normalizedX: number,
    normalizedY: number,
    isInside: boolean = true,
    pixelX: number | null = null,
    pixelY: number | null = null,
    canvasWidth: number = 1440,
    canvasHeight: number = 720
  ): void {
    this.isPointerInside = isInside;
    this.mouseVec.set(normalizedX, normalizedY);
    this.pointerPixelX = pixelX;
    this.pointerPixelY = pixelY;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    if (!isInside) {
      this.hoveredId = null;
    }
  }

  public clearHover(): void {
    this.isPointerInside = false;
    this.hoveredId = null;
    this.pointerPixelX = null;
    this.pointerPixelY = null;
  }

  public hitTest(
    pixelX: number,
    pixelY: number,
    ndcX: number,
    ndcY: number,
    camera: THREE.Camera,
    width: number,
    height: number
  ): InstrumentItem | null {
    this.group.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const worldPos = new THREE.Vector3();

    for (const inst of this.instruments) {
      inst.group.getWorldPosition(worldPos);
      const anchorOffset = inst.visualAnchorOffset.clone().applyQuaternion(inst.group.quaternion);
      worldPos.add(anchorOffset);

      // 1. Screen-space distance to visual anchor (strict <= 44px hitbox radius)
      const proj = worldPos.clone().project(camera);
      if (proj.z <= -1.0 || proj.z >= 1.0) continue;
      const screenX = (proj.x * 0.5 + 0.5) * width;
      const screenY = (-(proj.y * 0.5) + 0.5) * height;

      const distPx = Math.hypot(pixelX - screenX, pixelY - screenY);
      const distToRay = this.raycaster.ray.distanceToPoint(worldPos);

      // Hit if pointer is on the reticle dot (<= 44px) or on 3D geometry (< hitRadius)
      if (distPx <= 44 || distToRay < inst.hitRadius) {
        return inst;
      }
    }

    return null;
  }

  public update(
    time: number,
    camera: THREE.Camera,
    prefersReducedMotion: boolean = false,
    canvasWidth: number = 1440,
    canvasHeight: number = 720
  ): void {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;

    const glintColor = new THREE.Color(0xf2e8d5); // Warm-white / champagne stellar glint

    this.instruments.forEach(inst => {
      if (!prefersReducedMotion) {
        // 1. Gentle orbital micro-float
        const s = inst.floatingSeed;
        const floatX = Math.sin(time * 0.35 + s) * 0.05;
        const floatY = Math.cos(time * 0.42 + s * 1.3) * 0.04;
        const floatZ = Math.sin(time * 0.28 + s * 0.7) * 0.03;

        inst.group.position.set(
          inst.basePosition.x + floatX,
          inst.basePosition.y + floatY,
          inst.basePosition.z + floatZ
        );

        // Slow orbital axial precession
        inst.group.rotation.y += 0.0010;
        inst.group.rotation.x += 0.0005;

        // 2. Specular Glint Sweep (Duration 2.6s >= 2s, period 22.0s, smooth Hann window)
        const cycleTime = (time + inst.glintPhase) % 22.0;
        if (cycleTime < 2.6) {
          const normTime = cycleTime / 2.6;
          // Smooth bell curve: sin^2(pi * t)
          const glintVal = Math.pow(Math.sin(normTime * Math.PI), 2.0) * 0.38;
          inst.glintMaterials.forEach(m => {
            m.emissive.copy(glintColor).multiplyScalar(glintVal);
          });
        } else {
          inst.glintMaterials.forEach(m => {
            m.emissive.set(0x000000);
          });
        }
      } else {
        // Reduced motion: static positions and zero specular sweep
        inst.group.position.copy(inst.basePosition);
        inst.glintMaterials.forEach(m => {
          m.emissive.set(0x000000);
        });
      }
    });

    // Update world transforms before projection and raycasting
    this.group.updateMatrixWorld(true);

    // If pointer is outside the canvas, hover state is strictly null
    if (!this.isPointerInside || this.pointerPixelX === null || this.pointerPixelY === null) {
      this.hoveredId = null;
      return;
    }

    // Raycast & screen-space hover test
    this.raycaster.setFromCamera(this.mouseVec, camera);
    let hit: string | null = null;
    const worldPos = new THREE.Vector3();

    for (const inst of this.instruments) {
      inst.group.getWorldPosition(worldPos);
      const anchorOffset = inst.visualAnchorOffset.clone().applyQuaternion(inst.group.quaternion);
      worldPos.add(anchorOffset);

      // Calculate screen coordinates of the instrument's reticle anchor
      const proj = worldPos.clone().project(camera);
      if (proj.z <= -1.0 || proj.z >= 1.0) continue;
      const screenX = (proj.x * 0.5 + 0.5) * canvasWidth;
      const screenY = (-(proj.y * 0.5) + 0.5) * canvasHeight;

      const distPx = Math.hypot(this.pointerPixelX - screenX, this.pointerPixelY - screenY);
      const distToRay = this.raycaster.ray.distanceToPoint(worldPos);

      // Hit if cursor is within 44px of reticle dot or over 3D model geometry
      if (distPx <= 44 || distToRay < inst.hitRadius) {
        hit = inst.id;
        break;
      }
    }

    this.hoveredId = hit;
  }

  public getScreenPositions(camera: THREE.Camera, width: number, height: number): InstrumentScreenCoords[] {
    const list: InstrumentScreenCoords[] = [];
    const worldPos = new THREE.Vector3();

    this.instruments.forEach(inst => {
      inst.group.getWorldPosition(worldPos);
      const anchorOffset = inst.visualAnchorOffset.clone().applyQuaternion(inst.group.quaternion);
      worldPos.add(anchorOffset);

      const proj = worldPos.clone().project(camera);
      const visible = proj.z > -1.0 && proj.z < 1.0;
      const screenX = (proj.x * 0.5 + 0.5) * width;
      const screenY = (-(proj.y * 0.5) + 0.5) * height;

      list.push({
        id: inst.id,
        x: screenX,
        y: screenY,
        visible,
        code: inst.code,
        name: inst.name,
        route: inst.route
      });
    });

    return list;
  }

  public findInstrumentByRoute(route: string): InstrumentItem | undefined {
    return this.instruments.find(inst => inst.route === route);
  }

  public findInstrumentById(id: string): InstrumentItem | undefined {
    return this.instruments.find(inst => inst.id === id);
  }

  public dispose(): void {
    this.instruments.forEach(inst => {
      inst.group.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });
    });
  }
}
