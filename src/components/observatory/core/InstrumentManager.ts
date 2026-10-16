/**
 * DEEP SPACE OBSERVATORY · INSTRUMENT MANAGER
 * Controls 3 Procedural Orbital Instruments, Responsive Orbit Layouts, Raycasting, Screen-Space 2D Projection & Dolly Zoom
 */

import * as THREE from 'three';
import { createTelescopeGroup, createProbeGroup, createLogPodGroup } from '../utils/proceduralGeometries';

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

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'instruments_fleet';

    // 1. OBS-01: Deep Space Optical Telescope (深空光影 -> /gallery)
    // Desktop: Upper mid-void (843, 159), 85px above the planet atmosphere arc
    // Mobile: Upper right space (257, 187), clear of header text
    const telescope = createTelescopeGroup();
    const obsDesktop = new THREE.Vector3(2.2, 3.4, 2.8);
    const obsMobile = new THREE.Vector3(1.3, 2.3, 2.8);
    telescope.position.copy(obsDesktop);
    telescope.rotation.set(0.2, 0.4, -0.15);
    this.group.add(telescope);

    this.instruments.push({
      id: 'gallery',
      name: '深空光影 / Viewport',
      code: 'OBS-01',
      route: '/gallery',
      group: telescope,
      basePosition: obsDesktop.clone(),
      desktopBasePosition: obsDesktop,
      mobileBasePosition: obsMobile,
      targetOffset: new THREE.Vector3(0, 0, 2.6),
      visualAnchorOffset: new THREE.Vector3(0, 0, 0),
      floatingSeed: 12.5,
      hitRadius: 2.2
    });

    // 2. PRJ-02: Orbital Engineering Probe (轨道造物 -> /projects)
    // Desktop: Upper right space (1144, 89), well above atmospheric arc apex (Y=147)
    // Mobile: Mid-right space (288, 382), completely inside mobile viewport
    const probe = createProbeGroup();
    const prjDesktop = new THREE.Vector3(7.8, 4.8, 2.2);
    const prjMobile = new THREE.Vector3(1.4, 0.6, 2.4);
    probe.position.copy(prjDesktop);
    probe.rotation.set(-0.35, -0.5, 0.1);
    this.group.add(probe);

    this.instruments.push({
      id: 'projects',
      name: '轨道造物 / Probes',
      code: 'PRJ-02',
      route: '/projects',
      group: probe,
      basePosition: prjDesktop.clone(),
      desktopBasePosition: prjDesktop,
      mobileBasePosition: prjMobile,
      targetOffset: new THREE.Vector3(0, 0, 2.4),
      visualAnchorOffset: new THREE.Vector3(0, 0.1, 0),
      floatingSeed: 48.2,
      hitRadius: 2.2
    });

    // 3. LOG-03: Autonomous Flight Log Pod (航行日志 -> /posts)
    // Desktop: Mid-lower left cosmic void (484, 429), 80px+ clear of planet horizon & bottom border
    // Mobile: Lower-left space (107, 557), well above bottom border
    const logPod = createLogPodGroup();
    const logDesktop = new THREE.Vector3(-4.2, -1.4, 2.8);
    const logMobile = new THREE.Vector3(-1.3, -2.0, 2.8);
    logPod.position.copy(logDesktop);
    logPod.rotation.set(0.4, 0.2, -0.3);
    this.group.add(logPod);

    this.instruments.push({
      id: 'posts',
      name: '航行日志 / Logs',
      code: 'LOG-03',
      route: '/posts',
      group: logPod,
      basePosition: logDesktop.clone(),
      desktopBasePosition: logDesktop,
      mobileBasePosition: logMobile,
      targetOffset: new THREE.Vector3(0, 0, 2.5),
      visualAnchorOffset: new THREE.Vector3(0, 0.2, 0),
      floatingSeed: 91.7,
      hitRadius: 2.2
    });
  }

  public setLayout(isMobile: boolean): void {
    if (this.isMobileLayout === isMobile) return;
    this.isMobileLayout = isMobile;
    this.instruments.forEach(inst => {
      inst.basePosition.copy(isMobile ? inst.mobileBasePosition : inst.desktopBasePosition);
    });
  }

  public updatePointer(normalizedX: number, normalizedY: number): void {
    this.mouseVec.set(normalizedX, normalizedY);
  }

  public update(time: number, camera: THREE.Camera, prefersReducedMotion: boolean = false): void {
    if (!prefersReducedMotion) {
      // Gentle orbital float with bounded Z-variation (delta Z <= 0.05 keeps size change < 0.3%)
      this.instruments.forEach(inst => {
        const s = inst.floatingSeed;
        const floatX = Math.sin(time * 0.45 + s) * 0.08;
        const floatY = Math.cos(time * 0.55 + s * 1.3) * 0.08;
        const floatZ = Math.sin(time * 0.35 + s * 0.7) * 0.05;

        inst.group.position.set(
          inst.basePosition.x + floatX,
          inst.basePosition.y + floatY,
          inst.basePosition.z + floatZ
        );

        // Smooth angular rate ensures facet specular sweeps take >= 2.5s without rapid strobe
        inst.group.rotation.y += 0.0014;
        inst.group.rotation.x += 0.0007;
      });
    }

    // Ensure all world transforms are completely updated before raycasting
    this.group.updateMatrixWorld(true);

    // Raycast hover test
    this.raycaster.setFromCamera(this.mouseVec, camera);
    let hit: string | null = null;
    const worldPos = new THREE.Vector3();

    for (const inst of this.instruments) {
      inst.group.getWorldPosition(worldPos);
      const anchorOffset = inst.visualAnchorOffset.clone().applyQuaternion(inst.group.quaternion);
      worldPos.add(anchorOffset);
      const ray = this.raycaster.ray;
      const distToSphere = ray.distanceToPoint(worldPos);
      if (distToSphere < inst.hitRadius) {
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
      // True 3D world position + custom visual anchor offset
      inst.group.getWorldPosition(worldPos);
      const anchorOffset = inst.visualAnchorOffset.clone().applyQuaternion(inst.group.quaternion);
      worldPos.add(anchorOffset);

      // Project into camera normalized device coordinates
      const proj = worldPos.clone().project(camera);

      // Visible if within frustum depth bounds
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
