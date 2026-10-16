/**
 * DEEP SPACE OBSERVATORY · PROCEDURAL INSTRUMENT MESHES
 * 0KB external 3D file overhead - procedural low-poly hardware synthesis
 */

import * as THREE from 'three';

// Shared high-grade space hardware PBR material with balanced reflection
export function createHardwareMaterial(colorHex: number = 0x3d4452, roughness: number = 0.40, metalness: number = 0.62): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(colorHex),
    roughness,
    metalness,
    flatShading: true,
  });
}

// 1. OBS-01: Deep Space Optical Telescope (深空光影 / 观测望远镜)
export function createTelescopeGroup(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'instrument_obs';

  const bodyMat = createHardwareMaterial(0x424a5a, 0.35, 0.65);
  const darkMetal = createHardwareMaterial(0x262b36, 0.48, 0.58);
  const goldFoil = createHardwareMaterial(0xcc8432, 0.32, 0.75);

  // Main 8-sided optical cylinder
  const barrelGeo = new THREE.CylinderGeometry(0.55, 0.62, 2.6, 8);
  const barrel = new THREE.Mesh(barrelGeo, bodyMat);
  barrel.rotation.z = Math.PI / 2;
  group.add(barrel);

  // Angled solar baffle / sunshade
  const baffleGeo = new THREE.CylinderGeometry(0.68, 0.58, 0.9, 8, 1, true);
  const baffle = new THREE.Mesh(baffleGeo, darkMetal);
  baffle.position.x = 1.45;
  baffle.rotation.z = Math.PI / 2;
  group.add(baffle);

  // Primary mirror rear housing
  const rearGeo = new THREE.BoxGeometry(1.1, 1.1, 0.9);
  const rear = new THREE.Mesh(rearGeo, darkMetal);
  rear.position.x = -1.4;
  group.add(rear);

  // Deployable twin radiator panels
  const panelGeo = new THREE.BoxGeometry(0.9, 0.04, 2.8);
  const panels = new THREE.Mesh(panelGeo, goldFoil);
  panels.position.x = -0.5;
  panels.position.y = 0.2;
  panels.rotation.x = 0.25;
  group.add(panels);

  // Secondary mirror apex truss
  const trussGeo = new THREE.ConeGeometry(0.18, 0.8, 4);
  const truss = new THREE.Mesh(trussGeo, bodyMat);
  truss.position.x = 1.6;
  truss.rotation.z = -Math.PI / 2;
  group.add(truss);

  // Enlarged 1.8x for clear silhouette (was 0.75)
  group.scale.setScalar(1.35);
  return group;
}

// 2. PRJ-02: Deep Space Orbital Probe (轨道造物 / 探测器)
export function createProbeGroup(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'instrument_prj';

  const bodyMat = createHardwareMaterial(0x444d5c, 0.38, 0.65);
  const foilMat = createHardwareMaterial(0xc47a32, 0.30, 0.78);
  const dishMat = createHardwareMaterial(0xa0aab8, 0.35, 0.55);

  // Central octagonal core bus
  const coreGeo = new THREE.CylinderGeometry(0.7, 0.75, 1.2, 6);
  const core = new THREE.Mesh(coreGeo, bodyMat);
  group.add(core);

  // High-gain parabolic dish antenna
  const dishGeo = new THREE.SphereGeometry(0.85, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.45);
  const dish = new THREE.Mesh(dishGeo, dishMat);
  dish.rotation.x = Math.PI * 0.7;
  dish.position.set(0, 0.85, 0.2);
  group.add(dish);

  // Antenna sub-reflector feed horn
  const hornGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 4);
  const horn = new THREE.Mesh(hornGeo, bodyMat);
  horn.position.set(0, 1.15, 0.45);
  horn.rotation.x = 0.7;
  group.add(horn);

  // Folded / deployed photovoltaic wings (Left & Right)
  const wingGeo = new THREE.BoxGeometry(2.4, 0.03, 0.85);
  const leftWing = new THREE.Mesh(wingGeo, foilMat);
  leftWing.position.set(1.9, 0, 0);
  leftWing.rotation.z = -0.08;
  group.add(leftWing);

  const rightWing = new THREE.Mesh(wingGeo, foilMat);
  rightWing.position.set(-1.9, 0, 0);
  rightWing.rotation.z = 0.08;
  group.add(rightWing);

  // Magnetometer instrument boom
  const boomGeo = new THREE.CylinderGeometry(0.03, 0.03, 2.2, 4);
  const boom = new THREE.Mesh(boomGeo, bodyMat);
  boom.position.set(0, -1.2, -0.4);
  boom.rotation.x = -0.5;
  group.add(boom);

  // Enlarged 1.8x for clear silhouette (was 0.72)
  group.scale.setScalar(1.30);
  return group;
}

// 3. LOG-03: Autonomous Flight Log Pod (航行日志 / 日志舱)
export function createLogPodGroup(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'instrument_log';

  const hullMat = createHardwareMaterial(0x3e4656, 0.35, 0.65);
  const heatShieldMat = createHardwareMaterial(0x222730, 0.50, 0.55);
  const accentMat = createHardwareMaterial(0xd97e3a, 0.32, 0.72);

  // Re-entry blunt capsule head (cone + rounded base)
  const headGeo = new THREE.ConeGeometry(0.85, 1.6, 8);
  const head = new THREE.Mesh(headGeo, hullMat);
  head.rotation.x = Math.PI;
  head.position.y = 0.3;
  group.add(head);

  // Bottom blunt heat shield
  const shieldGeo = new THREE.CylinderGeometry(0.9, 0.75, 0.3, 8);
  const shield = new THREE.Mesh(shieldGeo, heatShieldMat);
  shield.position.y = 1.15;
  group.add(shield);

  // Service module propulsion ring
  const ringGeo = new THREE.TorusGeometry(0.65, 0.08, 6, 12);
  const ring = new THREE.Mesh(ringGeo, accentMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.5;
  group.add(ring);

  // Star tracker sensor pods (trilateral perimeter)
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const podGeo = new THREE.BoxGeometry(0.2, 0.35, 0.25);
    const pod = new THREE.Mesh(podGeo, heatShieldMat);
    pod.position.set(Math.cos(angle) * 0.72, 0.1, Math.sin(angle) * 0.72);
    pod.rotation.y = -angle;
    group.add(pod);
  }

  // Aft telemetry antenna mast
  const mastGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 4);
  const mast = new THREE.Mesh(mastGeo, hullMat);
  mast.position.y = -1.1;
  group.add(mast);

  // Enlarged 1.8x for clear silhouette (was 0.78)
  group.scale.setScalar(1.40);
  return group;
}
