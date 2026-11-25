/**
 * @file color.ts
 * Color utilities, gradient presets, and multi-stop interpolation for 3D RAWING.
 */

import * as THREE from 'three';
import { ColorSettings, GradientStop } from '../types';

interface RGB {
  r: number;
  g: number;
  b: number;
}

const DEFAULT_SPECTRUM_STOPS: { stop: number; color: RGB }[] = [
  { stop: 0.0, color: { r: 187, g: 247, b: 208 } }, // Light green (#bbf7d0)
  { stop: 0.25, color: { r: 74, g: 222, b: 128 } }, // Mint green
  { stop: 0.5, color: { r: 59, g: 130, b: 246 } },  // Blue (#3b82f6)
  { stop: 0.75, color: { r: 236, g: 72, b: 153 } }, // Pink/Magenta (#ec4899)
  { stop: 1.0, color: { r: 244, g: 63, b: 94 } },  // Rose pink (#f43f5e)
];

export const QUICK_SOLID_SWATCHES = [
  '#bbf7d0',
  '#38bdf8',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
  '#111111',
];

export interface GradientPreset {
  id: string;
  name: string;
  stops: { position: number; color: string }[];
}

export const GRADIENT_PRESETS: GradientPreset[] = [
  {
    id: 'mint-blue-pink',
    name: 'Vert → Bleu → Rose',
    stops: [
      { position: 0, color: '#bbf7d0' },
      { position: 0.5, color: '#3b82f6' },
      { position: 1, color: '#ec4899' },
    ],
  },
  {
    id: 'blue-violet',
    name: 'Bleu → Violet',
    stops: [
      { position: 0, color: '#38bdf8' },
      { position: 1, color: '#8b5cf6' },
    ],
  },
  {
    id: 'pink-orange',
    name: 'Rose → Orange',
    stops: [
      { position: 0, color: '#ec4899' },
      { position: 1, color: '#fb923c' },
    ],
  },
  {
    id: 'sunset',
    name: 'Soleil',
    stops: [
      { position: 0, color: '#f43f5e' },
      { position: 0.55, color: '#f59e0b' },
      { position: 1, color: '#fef08a' },
    ],
  },
];

export function createDefaultColorSettings(solidColor = '#3b82f6'): ColorSettings {
  return {
    mode: 'solid',
    solidColor,
    stops: [
      { id: 'stop_1', position: 0.0, color: '#bbf7d0' },
      { id: 'stop_2', position: 0.5, color: '#3b82f6' },
      { id: 'stop_3', position: 1.0, color: '#ec4899' },
    ],
    direction: 'length',
  };
}

export function cloneColorSettings(settings: ColorSettings): ColorSettings {
  return {
    mode: settings.mode,
    solidColor: settings.solidColor,
    direction: settings.direction,
    stops: settings.stops.map((s) => ({ ...s })),
  };
}

export function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16) || 0,
      g: parseInt(clean[1] + clean[1], 16) || 0,
      b: parseInt(clean[2] + clean[2], 16) || 0,
    };
  }
  const bigint = parseInt(clean.padEnd(6, '0').slice(0, 6), 16);
  if (Number.isNaN(bigint)) return { r: 59, g: 130, b: 246 };
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (c: number) => clamp(c).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function isValidHex(hex: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex.trim());
}

/**
 * Sample a hex color along the continuous default spectrum with position t in [0, 1].
 */
export function sampleGradient(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));

  for (let i = 0; i < DEFAULT_SPECTRUM_STOPS.length - 1; i++) {
    const s1 = DEFAULT_SPECTRUM_STOPS[i];
    const s2 = DEFAULT_SPECTRUM_STOPS[i + 1];

    if (clamped >= s1.stop && clamped <= s2.stop) {
      const factor = (clamped - s1.stop) / (s2.stop - s1.stop);
      const r = s1.color.r + factor * (s2.color.r - s1.color.r);
      const g = s1.color.g + factor * (s2.color.g - s1.color.g);
      const b = s1.color.b + factor * (s2.color.b - s1.color.b);
      return rgbToHex(r, g, b);
    }
  }

  const last = DEFAULT_SPECTRUM_STOPS[DEFAULT_SPECTRUM_STOPS.length - 1].color;
  return rgbToHex(last.r, last.g, last.b);
}

/**
 * Find approximately which position in [0, 1] gives the closest color on the default slider.
 */
export function colorToGradientPosition(hex: string): number {
  const target = hexToRgb(hex);
  let bestDist = Infinity;
  let bestT = 0.5;

  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const currentRgb = hexToRgb(sampleGradient(t));
    const dist =
      Math.pow(target.r - currentRgb.r, 2) +
      Math.pow(target.g - currentRgb.g, 2) +
      Math.pow(target.b - currentRgb.b, 2);
    if (dist < bestDist) {
      bestDist = dist;
      bestT = t;
    }
  }

  return bestT;
}

/**
 * Sort gradient stops in ascending order by position.
 */
export function sortStops(stops: GradientStop[]): GradientStop[] {
  return [...stops].sort((a, b) => a.position - b.position);
}

/**
 * Interpolate a hex color at t in [0, 1] across a user-defined multi-stop gradient.
 */
export function evaluateGradientHex(stops: GradientStop[], t: number): string {
  if (stops.length === 0) return '#3b82f6';
  const sorted = sortStops(stops);
  const clamped = Math.max(0, Math.min(1, t));

  if (clamped <= sorted[0].position) return sorted[0].color;
  if (clamped >= sorted[sorted.length - 1].position) return sorted[sorted.length - 1].color;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (clamped >= a.position && clamped <= b.position) {
      const span = b.position - a.position;
      const factor = span < 1e-5 ? 0 : (clamped - a.position) / span;
      const rgbA = hexToRgb(a.color);
      const rgbB = hexToRgb(b.color);
      return rgbToHex(
        rgbA.r + factor * (rgbB.r - rgbA.r),
        rgbA.g + factor * (rgbB.g - rgbA.g),
        rgbA.b + factor * (rgbB.b - rgbA.b)
      );
    }
  }

  return sorted[sorted.length - 1].color;
}

/**
 * Interpolate directly into a THREE.Color (linear working color space) for vertexColors.
 */
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

export function evaluateColorSettingsAt(
  settings: ColorSettings,
  t: number,
  out: THREE.Color
): THREE.Color {
  if (settings.mode === 'solid' || settings.stops.length === 0) {
    return out.set(settings.solidColor);
  }

  const sorted = sortStops(settings.stops);
  const clamped = Math.max(0, Math.min(1, t));

  if (clamped <= sorted[0].position) return out.set(sorted[0].color);
  if (clamped >= sorted[sorted.length - 1].position) {
    return out.set(sorted[sorted.length - 1].color);
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (clamped >= a.position && clamped <= b.position) {
      const span = b.position - a.position;
      const factor = span < 1e-5 ? 0 : (clamped - a.position) / span;
      _c1.set(a.color);
      _c2.set(b.color);
      return out.copy(_c1).lerp(_c2, factor);
    }
  }

  return out.set(sorted[sorted.length - 1].color);
}

/**
 * Generate CSS linear-gradient string from GradientStops.
 */
export function stopsToCssGradient(stops: GradientStop[]): string {
  if (stops.length === 0) return 'linear-gradient(90deg, #3b82f6, #ec4899)';
  const sorted = sortStops(stops);
  const parts = sorted.map((s) => `${s.color} ${(s.position * 100).toFixed(1)}%`);
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}

/**
 * Invert stop positions (1 - pos).
 */
export function invertGradientStops(stops: GradientStop[]): GradientStop[] {
  return sortStops(
    stops.map((s) => ({
      ...s,
      position: Math.max(0, Math.min(1, 1 - s.position)),
    }))
  );
}

export function areColorSettingsEqual(a: ColorSettings, b: ColorSettings): boolean {
  if (a.mode !== b.mode) return false;
  if (a.mode === 'solid') {
    return a.solidColor.toLowerCase() === b.solidColor.toLowerCase();
  }
  if (a.direction !== b.direction) return false;
  if (a.stops.length !== b.stops.length) return false;
  const sa = sortStops(a.stops);
  const sb = sortStops(b.stops);
  return sa.every(
    (s, i) =>
      Math.abs(s.position - sb[i].position) < 0.005 &&
      s.color.toLowerCase() === sb[i].color.toLowerCase()
  );
}
