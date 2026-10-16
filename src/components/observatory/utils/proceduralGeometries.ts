/**
 * DEEP SPACE OBSERVATORY · PROCEDURAL INSTRUMENT MESHES
 * 0KB external 3D file overhead - procedural low-poly hardware synthesis
 * Cinematic scale, beveled edges, satin PBR materials & anti-glare specular tuning
 */

import * as THREE from 'three';

/**
 * Procedural beveled box geometry (chamfered edges catch razor-sharp rim lights)
 */
export function createBeveledBoxGeometry(
  width: number,
  height: number,
  depth: number,
  bevel: number = 0.02
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const hw = Math.max(0.01, width * 0.5 - bevel);
  const hh = Math.max(0.01, height * 0.5 - bevel);

  shape.moveTo(-hw, -hh - bevel);
  shape.lineTo(hw, -hh - bevel);
  shape.quadraticCurveTo(hw + bevel, -hh - bevel, hw + bevel, -hh);
  shape.lineTo(hw + bevel, hh);
  shape.quadraticCurveTo(hw + bevel, hh + bevel, hw, hh + bevel);
  shape.lineTo(-hw, hh + bevel);
  shape.quadraticCurveTo(-hw - bevel, hh + bevel, -hw - bevel, hh);
  shape.lineTo(-hw - bevel, -hh);
  shape.quadraticCurveTo(-hw - bevel, -hh - bevel, -hw, -hh - bevel);

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: Math.max(0.01, depth - bevel * 2),
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 3,
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.center();
  return geo;
}

// Shared high-grade space hardware PBR material with readable 1-tier contrast above void
export function createHardwareMaterial(
  colorHex: number = 0x647288,
  roughness: number = 0.42,
  metalness: number = 0.38
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(colorHex),
    roughness,
    metalness,
    flatShading: false,
  });
}

// Low-saturation metallic/glass photovoltaic panel material with fine wafer grid lines
export function createSolarMaterial(): THREE.MeshStandardMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Deep desaturated slate navy silicon base
    ctx.fillStyle = '#1e2838';
    ctx.fillRect(0, 0, 128, 128);

    // Segmented wafer cells
    ctx.fillStyle = '#263346';
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        ctx.fillRect(c * 32 + 2, r * 32 + 2, 28, 28);
      }
    }

    // Grid fingers (fine silver divisional rules)
    ctx.strokeStyle = '#3e4e64';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 128; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0); ctx.lineTo(i, 128);
      ctx.moveTo(0, i); ctx.lineTo(128, i);
      ctx.stroke();
    }

    // Silver busbar conductors
    ctx.strokeStyle = '#5a6e88';
    ctx.beginPath();
    ctx.moveTo(16, 0); ctx.lineTo(16, 128);
    ctx.moveTo(48, 0); ctx.lineTo(48, 128);
    ctx.moveTo(80, 0); ctx.lineTo(80, 128);
    ctx.moveTo(112, 0); ctx.lineTo(112, 128);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1);

  return new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xd0dceb,
    roughness: 0.34, // Satin glass reflection, avoids bloom overexposure
    metalness: 0.42, // Controlled wafer sheen
    flatShading: false,
  });
}

// 1. OBS-01: Deep Space Optical Telescope (深空光影 / 观测望远镜)
export function createTelescopeGroup(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'instrument_obs';

  const bodyMat = createHardwareMaterial(0x647288, 0.40, 0.40);
  const darkMetal = createHardwareMaterial(0x3e4a5a, 0.46, 0.35);
  const mirrorMat = createHardwareMaterial(0x8a99ac, 0.36, 0.45);
  const solarMat = createSolarMaterial();

  // Main 12-sided optical barrel
  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.48, 2.2, 12);
  const barrel = new THREE.Mesh(barrelGeo, bodyMat);
  barrel.rotation.z = Math.PI / 2;
  group.add(barrel);

  // Angled solar baffle / sunshade
  const baffleGeo = new THREE.CylinderGeometry(0.54, 0.45, 0.75, 12, 1, true);
  const baffle = new THREE.Mesh(baffleGeo, darkMetal);
  baffle.position.x = 1.25;
  baffle.rotation.z = Math.PI / 2;
  group.add(baffle);

  // Secondary mirror apex spider truss
  const trussGeo = new THREE.ConeGeometry(0.14, 0.65, 4);
  const truss = new THREE.Mesh(trussGeo, mirrorMat);
  truss.position.x = 1.4;
  truss.rotation.z = -Math.PI / 2;
  group.add(truss);

  // Primary mirror rear housing (Beveled box with smooth edges)
  const rearGeo = createBeveledBoxGeometry(0.9, 0.9, 0.75, 0.03);
  const rear = new THREE.Mesh(rearGeo, darkMetal);
  rear.position.x = -1.2;
  group.add(rear);

  // Deployable twin radiator / solar panels (Beveled thin slabs)
  const panelGeo = createBeveledBoxGeometry(0.7, 0.03, 2.2, 0.01);
  const panels = new THREE.Mesh(panelGeo, solarMat);
  panels.position.set(-0.4, 0.15, 0);
  panels.rotation.x = 0.22;
  group.add(panels);

  // Restrained visual scale (~43% of previous size, allowing planet to dominate)
  group.scale.setScalar(0.58);
  return group;
}

// 2. PRJ-02: Deep Space Orbital Probe (轨道造物 / 探测器)
export function createProbeGroup(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'instrument_prj';

  const bodyMat = createHardwareMaterial(0x606e82, 0.42, 0.38);
  const dishMat = createHardwareMaterial(0xa0adbe, 0.38, 0.40);
  const darkMat = createHardwareMaterial(0x384454, 0.48, 0.32);
  const solarMat = createSolarMaterial();

  // Central octagonal core bus
  const coreGeo = new THREE.CylinderGeometry(0.55, 0.60, 0.95, 8);
  const core = new THREE.Mesh(coreGeo, bodyMat);
  group.add(core);

  // Equipment deck collar (Beveled ring)
  const collarGeo = createBeveledBoxGeometry(0.85, 0.25, 0.85, 0.02);
  const collar = new THREE.Mesh(collarGeo, darkMat);
  collar.position.y = -0.1;
  group.add(collar);

  // High-gain parabolic dish antenna
  const dishGeo = new THREE.SphereGeometry(0.72, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42);
  const dish = new THREE.Mesh(dishGeo, dishMat);
  dish.rotation.x = Math.PI * 0.68;
  dish.position.set(0, 0.72, 0.18);
  group.add(dish);

  // Antenna sub-reflector feed horn
  const hornGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6);
  const horn = new THREE.Mesh(hornGeo, bodyMat);
  horn.position.set(0, 0.98, 0.38);
  horn.rotation.x = 0.68;
  group.add(horn);

  // Photovoltaic wings (Left & Right) with compact proportions
  const wingGeo = createBeveledBoxGeometry(1.4, 0.02, 0.65, 0.01);
  const leftWing = new THREE.Mesh(wingGeo, solarMat);
  leftWing.position.set(1.25, 0, 0);
  leftWing.rotation.z = -0.06;
  group.add(leftWing);

  const rightWing = new THREE.Mesh(wingGeo, solarMat);
  rightWing.position.set(-1.25, 0, 0);
  rightWing.rotation.z = 0.06;
  group.add(rightWing);

  // Slender magnetometer instrument boom (compact 0.95 length)
  const boomGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.95, 6);
  const boom = new THREE.Mesh(boomGeo, bodyMat);
  boom.position.set(0, -0.65, -0.25);
  boom.rotation.x = -0.35;
  group.add(boom);

  // Restrained visual scale
  group.scale.setScalar(0.55);
  return group;
}

// 3. LOG-03: Autonomous Flight Log Pod (航行日志 / 日志舱)
export function createLogPodGroup(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'instrument_log';

  const hullMat = createHardwareMaterial(0x627084, 0.42, 0.38);
  const heatShieldMat = createHardwareMaterial(0x28323e, 0.55, 0.25);
  const accentMat = createHardwareMaterial(0x768598, 0.40, 0.38);

  // Command module capsule head (frustum cone + rounded tip)
  const headGeo = new THREE.CylinderGeometry(0.35, 0.72, 1.1, 12);
  const head = new THREE.Mesh(headGeo, hullMat);
  head.rotation.x = Math.PI;
  head.position.y = 0.25;
  group.add(head);

  // Service module cylindrical body
  const serviceGeo = new THREE.CylinderGeometry(0.72, 0.70, 0.55, 12);
  const service = new THREE.Mesh(serviceGeo, accentMat);
  service.position.y = -0.45;
  group.add(service);

  // Bottom blunt heat shield (Ablative dark disc, no blinding specular)
  const shieldGeo = new THREE.CylinderGeometry(0.75, 0.65, 0.2, 12);
  const shield = new THREE.Mesh(shieldGeo, heatShieldMat);
  shield.position.y = 0.85;
  group.add(shield);

  // Star tracker sensor pods (trilateral perimeter with beveled boxes)
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const podGeo = createBeveledBoxGeometry(0.16, 0.26, 0.2, 0.015);
    const pod = new THREE.Mesh(podGeo, heatShieldMat);
    pod.position.set(Math.cos(angle) * 0.62, 0.05, Math.sin(angle) * 0.62);
    pod.rotation.y = -angle;
    group.add(pod);
  }

  // Integrated aft propulsion nozzle (cone nozzle, eliminates standalone torus blowout)
  const nozzleGeo = new THREE.CylinderGeometry(0.32, 0.48, 0.3, 10, 1, true);
  const nozzle = new THREE.Mesh(nozzleGeo, heatShieldMat);
  nozzle.position.y = -0.85;
  group.add(nozzle);

  // Slender aft telemetry antenna mast (compact length 0.55, never clipped by bottom)
  const mastGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6);
  const mast = new THREE.Mesh(mastGeo, hullMat);
  mast.position.y = -1.15;
  group.add(mast);

  // Restrained visual scale
  group.scale.setScalar(0.60);
  return group;
}
