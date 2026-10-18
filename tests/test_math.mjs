import * as THREE from 'three';

console.log('Testing alpha blending math...');
// At h = 0:
// opacity alpha = smoothstep(1.0, 0.4, normAlt)
// At h = 0, normAlt = 0 -> alpha = 1.0.
// When alpha = 1.0, dest (planet polygon chords) is completely replaced by the smooth analytical atmosphere color!
// Above horizon: normAlt increases -> alpha fades to 0.0 -> stars and space show through!
