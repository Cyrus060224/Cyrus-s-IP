/**
 * DEEP SPACE OBSERVATORY · DEVICE TIER & CAPABILITY PROFILER
 */

export type DeviceTier = 'tier-1' | 'tier-2' | 'tier-3';

export interface DeviceProfile {
  tier: DeviceTier;
  hasWebGL: boolean;
  prefersReducedMotion: boolean;
  isMobile: boolean;
  dpr: number;
}

export function detectDeviceCapabilities(): DeviceProfile {
  if (typeof window === 'undefined') {
    return {
      tier: 'tier-3',
      hasWebGL: false,
      prefersReducedMotion: false,
      isMobile: false,
      dpr: 1
    };
  }

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
                   || (window.innerWidth <= 768);

  // Check WebGL availability
  let hasWebGL = false;
  try {
    const canvas = document.createElement('canvas');
    hasWebGL = Boolean(
      window.WebGLRenderingContext && 
      (canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch (e) {
    hasWebGL = false;
  }

  if (!hasWebGL || prefersReducedMotion) {
    return {
      tier: 'tier-3',
      hasWebGL,
      prefersReducedMotion,
      isMobile,
      dpr: 1
    };
  }

  // Tier profiling
  const rawDpr = window.devicePixelRatio || 1;
  if (isMobile) {
    return {
      tier: 'tier-2',
      hasWebGL: true,
      prefersReducedMotion: false,
      isMobile: true,
      dpr: Math.min(rawDpr, 1.25)
    };
  }

  return {
    tier: 'tier-1',
    hasWebGL: true,
    prefersReducedMotion: false,
    isMobile: false,
    dpr: Math.min(rawDpr, 1.5)
  };
}
