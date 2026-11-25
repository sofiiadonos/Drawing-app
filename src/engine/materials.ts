/**
 * @file materials.ts
 * Material factory, editable parameter defaults, and localStorage custom presets for 3D RAWING.
 * Supports vertexColors across all presets (including Glass and Cloud) so solid & gradient
 * stroke colours render seamlessly with every physical material.
 */

import * as THREE from 'three';
import {
  CustomMaterialPreset,
  MaterialParams,
  MaterialPreset,
} from '../types';

const CUSTOM_PRESETS_STORAGE_KEY = '3d_rawing_custom_materials_v1';

export const MATERIAL_PRESET_META: {
  id: MaterialPreset;
  label: string;
  description: string;
}[] = [
  { id: 'matte', label: 'Mat', description: 'Finition mate sans reflet' },
  { id: 'glossy', label: 'Brillant', description: 'Laqué avec vernis brillant' },
  { id: 'metallic', label: 'Métal', description: 'Surface métallique réfléchissante' },
  { id: 'glass', label: 'Verre', description: 'Transparent et réfractif' },
  { id: 'cloud', label: 'Nuage', description: 'Texture douce et vaporeuse' },
  { id: 'standard', label: 'Standard', description: 'Surface lisse équilibrée' },
];

const DEFAULT_PARAMS_MAP: Record<MaterialPreset, MaterialParams> = {
  matte: {
    roughness: 0.94,
    metalness: 0.0,
    opacity: 1.0,
    transmission: 0.0,
    ior: 1.45,
    thickness: 0.5,
    emissive: '#000000',
    emissiveIntensity: 0.0,
    clearcoat: 0.0,
    sheen: 0.0,
  },
  glossy: {
    roughness: 0.14,
    metalness: 0.06,
    opacity: 1.0,
    transmission: 0.0,
    ior: 1.5,
    thickness: 0.5,
    emissive: '#000000',
    emissiveIntensity: 0.0,
    clearcoat: 0.95,
    sheen: 0.0,
  },
  metallic: {
    roughness: 0.18,
    metalness: 0.94,
    opacity: 1.0,
    transmission: 0.0,
    ior: 1.5,
    thickness: 0.5,
    emissive: '#000000',
    emissiveIntensity: 0.0,
    clearcoat: 0.25,
    sheen: 0.0,
  },
  glass: {
    roughness: 0.06,
    metalness: 0.02,
    opacity: 0.92,
    transmission: 0.9,
    ior: 1.52,
    thickness: 1.2,
    emissive: '#000000',
    emissiveIntensity: 0.0,
    clearcoat: 1.0,
    sheen: 0.0,
  },
  cloud: {
    roughness: 0.95,
    metalness: 0.0,
    opacity: 0.88,
    transmission: 0.15,
    ior: 1.33,
    thickness: 0.6,
    emissive: '#000000',
    emissiveIntensity: 0.0,
    clearcoat: 0.0,
    sheen: 1.0,
  },
  standard: {
    roughness: 0.42,
    metalness: 0.18,
    opacity: 1.0,
    transmission: 0.0,
    ior: 1.45,
    thickness: 0.5,
    emissive: '#000000',
    emissiveIntensity: 0.0,
    clearcoat: 0.1,
    sheen: 0.0,
  },
};

export function getPresetDefaultParams(preset: MaterialPreset): MaterialParams {
  const base = DEFAULT_PARAMS_MAP[preset] || DEFAULT_PARAMS_MAP.standard;
  return { ...base };
}

export function cloneMaterialParams(params: MaterialParams): MaterialParams {
  return { ...params };
}

export function areMaterialParamsEqual(a: MaterialParams, b: MaterialParams): boolean {
  return (
    Math.abs(a.roughness - b.roughness) < 0.005 &&
    Math.abs(a.metalness - b.metalness) < 0.005 &&
    Math.abs(a.opacity - b.opacity) < 0.005 &&
    Math.abs(a.transmission - b.transmission) < 0.005 &&
    Math.abs(a.ior - b.ior) < 0.005 &&
    Math.abs(a.thickness - b.thickness) < 0.005 &&
    a.emissive.toLowerCase() === b.emissive.toLowerCase() &&
    Math.abs(a.emissiveIntensity - b.emissiveIntensity) < 0.005 &&
    Math.abs(a.clearcoat - b.clearcoat) < 0.005 &&
    Math.abs(a.sheen - b.sheen) < 0.005
  );
}

/**
 * Procedural fluffy cloud texture for soft volumetric cloud material.
 */
let cloudTextureCache: THREE.CanvasTexture | null = null;

function getCloudNoiseTexture(): THREE.CanvasTexture {
  if (cloudTextureCache) return cloudTextureCache;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 400; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 8 + Math.random() * 24;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      const val = 128 + Math.floor((Math.random() - 0.5) * 80);
      grad.addColorStop(0, `rgba(${val}, ${val}, ${val}, 0.25)`);
      grad.addColorStop(1, 'rgba(128, 128, 128, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  cloudTextureCache = new THREE.CanvasTexture(canvas);
  cloudTextureCache.wrapS = THREE.RepeatWrapping;
  cloudTextureCache.wrapT = THREE.RepeatWrapping;
  cloudTextureCache.repeat.set(4, 4);
  return cloudTextureCache;
}

/**
 * Creates a Three.js MeshPhysicalMaterial configured from a preset + editable MaterialParams.
 * Uses vertexColors: true by default so per-vertex solid & gradient colours work uniformly
 * across all materials including Glass, Metal, Cloud, Glossy, Standard, and Matte.
 */
export function createStrokeMaterial(
  preset: MaterialPreset,
  params: MaterialParams,
  _tool: 'pen' = 'pen',
  useVertexColors: boolean = true,
  fallbackSolidColor: string = '#ffffff'
): THREE.MeshPhysicalMaterial {
  const opacity = Math.max(0.05, Math.min(1.0, params.opacity));
  const transmission =
    preset === 'glass' || params.transmission > 0.01 ? params.transmission : 0;
  const isTransparent =
    opacity < 0.99 || transmission > 0.01 || preset === 'glass' || preset === 'cloud';

  const matConfig: THREE.MeshPhysicalMaterialParameters = {
    color: useVertexColors ? new THREE.Color(0xffffff) : new THREE.Color(fallbackSolidColor),
    vertexColors: useVertexColors,
    roughness: Math.max(0.02, Math.min(1.0, params.roughness)),
    metalness: Math.max(0.0, Math.min(1.0, params.metalness)),
    transparent: isTransparent,
    opacity,
    transmission,
    ior: Math.max(1.0, Math.min(2.5, params.ior)),
    thickness: Math.max(0.0, Math.min(5.0, params.thickness)),
    emissive: new THREE.Color(params.emissive || '#000000'),
    emissiveIntensity: Math.max(0.0, Math.min(3.0, params.emissiveIntensity)),
    clearcoat: Math.max(0.0, Math.min(1.0, params.clearcoat)),
    clearcoatRoughness: 0.1,
    sheen: Math.max(0.0, Math.min(1.0, params.sheen)),
    sheenRoughness: 0.65,
    sheenColor: new THREE.Color(0xffffff),
    depthWrite: !(transmission > 0.35),
    flatShading: false,
    side: THREE.DoubleSide,
  };

  if (preset === 'cloud') {
    matConfig.bumpMap = getCloudNoiseTexture();
    matConfig.bumpScale = 0.08;
  }

  return new THREE.MeshPhysicalMaterial(matConfig);
}

/**
 * Material for the invisible hit test mesh (used for generous raycasting clicks).
 */
export function createHitMaterial(): THREE.Material {
  return new THREE.MeshBasicMaterial({
    visible: false,
    wireframe: false,
  });
}

/**
 * Outline overlay material for selected strokes.
 */
export function createHighlightMaterial(theme: 'day' | 'night' = 'day'): THREE.Material {
  return new THREE.MeshBasicMaterial({
    color: theme === 'night' ? 0xffffff : 0x2563eb,
    wireframe: true,
    transparent: true,
    opacity: theme === 'night' ? 0.55 : 0.4,
    side: THREE.DoubleSide,
  });
}

/**
 * Glowing highlight overlay material when hovering a stroke with the Eraser tool.
 */
export function createEraserHighlightMaterial(): THREE.Material {
  return new THREE.MeshBasicMaterial({
    color: 0xef4444,
    wireframe: true,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
  });
}

// -------------------------------------------------------------
// Custom Material Presets Persistence (localStorage)
// -------------------------------------------------------------

export function loadCustomPresets(): CustomMaterialPreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveCustomPresets(presets: CustomMaterialPreset[]): void {
  try {
    // Strip large previewUrls or keep them? 64x64 PNGs are ~2KB each, safe to cache or regenerate
    const serializable = presets.map(({ previewUrl: _omit, ...rest }) => rest);
    localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // Ignore storage quota errors
  }
}
