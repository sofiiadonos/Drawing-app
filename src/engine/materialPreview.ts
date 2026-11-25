/**
 * @file materialPreview.ts
 * Renders authentic 3D Three.js sphere previews for material swatches
 * (both built-in presets and custom saved user presets).
 * Uses a single lazily-initialized offscreen WebGLRenderer + RoomEnvironment + cache.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MaterialParams, MaterialPreset } from '../types';
import { createStrokeMaterial } from './materials';

const previewCache = new Map<string, string>();

let offscreenRenderer: THREE.WebGLRenderer | null = null;
let previewScene: THREE.Scene | null = null;
let previewCamera: THREE.PerspectiveCamera | null = null;
let previewSphere: THREE.Mesh | null = null;
let previewBackdrop: THREE.Mesh | null = null;
let initFailed = false;

function ensurePreviewRenderer(): boolean {
  if (initFailed) return false;
  if (offscreenRenderer) return true;

  try {
    const size = 96;
    offscreenRenderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    offscreenRenderer.setSize(size, size, false);
    offscreenRenderer.setPixelRatio(1);
    offscreenRenderer.outputColorSpace = THREE.SRGBColorSpace;
    offscreenRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    offscreenRenderer.toneMappingExposure = 1.15;

    previewScene = new THREE.Scene();

    const pmrem = new THREE.PMREMGenerator(offscreenRenderer);
    previewScene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    previewCamera = new THREE.PerspectiveCamera(36, 1, 0.1, 20);
    previewCamera.position.set(0, 0, 3.1);

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    previewScene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(2.5, 3.0, 3.5);
    previewScene.add(key);

    const rim = new THREE.DirectionalLight(0x93c5fd, 0.7);
    rim.position.set(-2.5, -1.5, -2.0);
    previewScene.add(rim);

    // Subtle checker/stripe backdrop behind sphere so glass transmission shows refraction!
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = 64;
    bgCanvas.height = 64;
    const ctx = bgCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(0, 26, 64, 12);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(28, 0, 8, 64);
    }
    const bgTex = new THREE.CanvasTexture(bgCanvas);
    bgTex.colorSpace = THREE.SRGBColorSpace;
    previewBackdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 3.2),
      new THREE.MeshBasicMaterial({ map: bgTex })
    );
    previewBackdrop.position.set(0, 0, -1.2);
    previewScene.add(previewBackdrop);

    const sphereGeo = new THREE.SphereGeometry(0.84, 32, 24);
    previewSphere = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial());
    previewScene.add(previewSphere);

    return true;
  } catch {
    initFailed = true;
    return false;
  }
}

/**
 * Generates and caches a 3D sphere thumbnail dataURL for a material preset & params.
 */
export function renderMaterialPreviewUrl(
  preset: MaterialPreset,
  params: MaterialParams,
  tintColor: string = '#3b82f6'
): string | null {
  const key = JSON.stringify({ preset, params, tintColor });
  const existing = previewCache.get(key);
  if (existing) return existing;

  if (!ensurePreviewRenderer() || !offscreenRenderer || !previewScene || !previewCamera || !previewSphere || !previewBackdrop) {
    return null;
  }

  // Only show refracting backdrop when material is transmissive/transparent
  previewBackdrop.visible = preset === 'glass' || params.transmission > 0.05 || params.opacity < 0.95;

  const mat = createStrokeMaterial(preset, params, 'pen', false, tintColor);
  const oldMat = previewSphere.material as THREE.Material;
  previewSphere.material = mat;
  oldMat.dispose();

  offscreenRenderer.setClearColor(0x000000, 0);
  offscreenRenderer.render(previewScene, previewCamera);
  const dataUrl = offscreenRenderer.domElement.toDataURL('image/png');

  previewCache.set(key, dataUrl);
  // Keep cache bounded
  if (previewCache.size > 80) {
    const firstKey = previewCache.keys().next().value;
    if (firstKey) previewCache.delete(firstKey);
  }

  return dataUrl;
}
