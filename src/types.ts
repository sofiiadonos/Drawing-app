/**
 * @file types.ts
 * Type definitions for 3D RAWING application.
 */

import * as THREE from 'three';

export type ToolType = 'select' | 'pen' | 'eraser' | 'navigate';

export type BrushProfile =
  | 'tapered'
  | 'rounded'
  | 'flat'
  | 'ribbon'
  | 'square'
  | 'star'
  | 'twisted'
  | 'beaded';

export type MaterialPreset =
  | 'matte'
  | 'glossy'
  | 'metallic'
  | 'glass'
  | 'cloud'
  | 'standard';

export type ColorMode = 'solid' | 'gradient';
export type GradientDirection = 'length' | 'width';

export interface GradientStop {
  id: string;
  position: number; // 0..1
  color: string; // hex
}

export interface ColorSettings {
  mode: ColorMode;
  solidColor: string;
  stops: GradientStop[];
  direction: GradientDirection;
}

export interface MaterialParams {
  roughness: number; // 0..1
  metalness: number; // 0..1
  opacity: number; // 0.05..1
  transmission: number; // 0..1 (glass)
  ior: number; // 1.0..2.5 (glass)
  thickness: number; // 0..4 (glass)
  emissive: string; // hex
  emissiveIntensity: number; // 0..3
  clearcoat: number; // 0..1
  sheen: number; // 0..1
}

export interface CustomMaterialPreset {
  id: string;
  name: string;
  basePreset: MaterialPreset;
  params: MaterialParams;
  previewUrl?: string;
}

export interface RawStrokePoint {
  position: THREE.Vector3;
  pressure: number; // 0.1..1.0
  time: number;
}

export interface StrokeData {
  id: string;
  rawPoints: RawStrokePoint[];
  points: THREE.Vector3[];
  colorSettings: ColorSettings;
  volume: number; // base radius
  transparency: number; // 0.05..1.0
  smoothing: number; // 0..1
  profile: BrushProfile;
  materialPreset: MaterialPreset;
  materialParams: MaterialParams;
  customPresetId?: string;
  tool: 'pen';
  mesh: THREE.Mesh;
  hitMesh: THREE.Mesh; // Invisible collision mesh with larger radius for forgiving raycast picking
  highlightMesh?: THREE.Mesh; // Outer wireframe mesh when selected
  eraserHighlightMesh?: THREE.Mesh; // Highlight overlay when hovered in object-deletion mode
  boundingBox: THREE.Box3;
}

export interface StrokeProperties {
  colorSettings: ColorSettings;
  volume: number;
  transparency: number;
  smoothing: number;
  profile: BrushProfile;
  materialPreset: MaterialPreset;
  materialParams: MaterialParams;
  customPresetId?: string;
}

export type SelectedTarget =
  | { type: 'stroke'; ids: string[] }
  | null;

export type ThemeMode = 'day' | 'night';

export type HistoryAction =
  | {
      type: 'add_stroke';
      stroke: StrokeData;
    }
  | {
      type: 'delete_strokes';
      strokes: StrokeData[];
    }
  | {
      type: 'modify_strokes';
      strokeIds: string[];
      before: StrokeProperties[];
      after: StrokeProperties[];
    };
