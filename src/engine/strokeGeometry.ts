/**
 * @file strokeGeometry.ts
 * Generates smooth 3D parametric tube and ribbon meshes along Catmull-Rom curves.
 * Features:
 *  - Arc-length resampling & Laplacian smoothing from RawStrokePoint[]
 *  - Rotation-minimizing parallel-transport (Bishop) frames to prevent twisting
 *  - 8 distinct 3D brush profiles:
 *      1. Tapered (pointu): thin pointed ends, thick body
 *      2. Rounded (rond): constant width with true hemispherical end caps
 *      3. Flat (plat / calligraphique): flat 45° angled calligraphy nib ellipse
 *      4. Ribbon (ruban): wide ultra-thin tape following the 3D curve frame
 *      5. Square (carré): 4-sided architectural superellipse prism
 *      6. Star (étoile): 5-pointed star cross-section extruded along the curve
 *      7. Twisted (torsadé): helical twisted cord along the stroke arc length
 *      8. Beaded (perlé): sculpted chain of 3D beads along the stroke
 *  - Per-vertex colors (solid or gradient along length / across width)
 *  - Incremental live geometry builder (ActiveStrokeBuilder) for smooth O(1) drawing
 */

import * as THREE from 'three';
import { BrushProfile, ColorSettings, RawStrokePoint } from '../types';
import { evaluateColorSettingsAt } from '../utils/color';

const _tmpColor = new THREE.Color();
const FIXED_NIB_AXIS = new THREE.Vector3(Math.SQRT1_2, Math.SQRT1_2, 0).normalize();

export function getProfileRadialSegments(
  profile: BrushProfile,
  isHitGeometry: boolean = false
): number {
  if (isHitGeometry) return 8;
  switch (profile) {
    case 'star':
      return 20; // Exact alignment on all 5 star tips and 5 valleys
    case 'square':
      return 16; // Exact 4 corners + 4 flat faces
    case 'twisted':
      return 18;
    case 'ribbon':
    case 'flat':
      return 16;
    default:
      return 16;
  }
}

/**
 * Shared profile evaluator used for overall { rx, ry } radius envelopes.
 * Returns normalized { rx, ry } multipliers in [0..~2.3].
 */
export function evaluateBrushProfile(
  profile: BrushProfile,
  u: number,
  pressure: number = 1.0,
  arcLength: number = 6.0
): { rx: number; ry: number } {
  const clampedU = Math.max(0, Math.min(1, u));
  const p = 0.45 + 0.65 * Math.max(0.1, Math.min(1.0, pressure));

  switch (profile) {
    case 'tapered': {
      const sine = Math.sin(clampedU * Math.PI);
      const factor = (0.05 + 0.95 * Math.pow(sine, 0.78)) * p;
      return { rx: factor, ry: factor };
    }
    case 'flat': {
      const edgeTaper = 0.25 + 0.75 * Math.min(1.0, Math.sin(clampedU * Math.PI) * 3.5);
      return {
        rx: 1.95 * edgeTaper * p,
        ry: 0.26 * edgeTaper * p,
      };
    }
    case 'ribbon': {
      const edgeTaper = 0.14 + 0.86 * Math.pow(Math.sin(clampedU * Math.PI), 0.32);
      return {
        rx: 2.25 * edgeTaper * p,
        ry: 0.14 * edgeTaper * p,
      };
    }
    case 'square': {
      const edgeTaper = 0.35 + 0.65 * Math.min(1.0, Math.sin(clampedU * Math.PI) * 4.5);
      const side = 0.92 * edgeTaper * p;
      return { rx: side, ry: side };
    }
    case 'star': {
      const edgeTaper = 0.22 + 0.78 * Math.min(1.0, Math.sin(clampedU * Math.PI) * 4.0);
      const r = 1.05 * edgeTaper * p;
      return { rx: r, ry: r };
    }
    case 'twisted': {
      const edgeTaper = 0.22 + 0.78 * Math.min(1.0, Math.sin(clampedU * Math.PI) * 3.6);
      return {
        rx: 1.42 * edgeTaper * p,
        ry: 0.34 * edgeTaper * p,
      };
    }
    case 'beaded': {
      const beadCount = Math.max(4, Math.min(18, Math.round(arcLength * 0.95)));
      const phase = clampedU * Math.PI * beadCount;
      const beadEnvelope = 0.26 + 0.92 * Math.pow(Math.abs(Math.sin(phase)), 0.62);
      const factor = beadEnvelope * p;
      return { rx: factor, ry: factor };
    }
    case 'rounded':
    default:
      return { rx: 1.0 * p, ry: 1.0 * p };
  }
}

function sampleCrossSectionXY(
  profile: BrushProfile,
  u: number,
  angle: number,
  pressure: number,
  arcDist: number,
  totalLength: number
): { x: number; y: number } {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const clampedU = Math.max(0, Math.min(1, u));
  const p = 0.45 + 0.65 * Math.max(0.1, Math.min(1.0, pressure));

  switch (profile) {
    case 'square': {
      const edgeTaper = 0.35 + 0.65 * Math.min(1.0, Math.sin(clampedU * Math.PI) * 4.5);
      const power = 6;
      const superR = Math.pow(
        Math.pow(Math.abs(cosA), power) + Math.pow(Math.abs(sinA), power),
        -1 / power
      );
      const r = 0.88 * edgeTaper * p * superR;
      return { x: cosA * r, y: sinA * r };
    }
    case 'star': {
      const edgeTaper = 0.22 + 0.78 * Math.min(1.0, Math.sin(clampedU * Math.PI) * 4.0);
      // 5-pointed star radial modulation
      const starMod = 0.64 + 0.42 * Math.cos(5 * angle);
      const r = 1.08 * edgeTaper * p * starMod;
      return { x: cosA * r, y: sinA * r };
    }
    case 'twisted': {
      const edgeTaper = 0.22 + 0.78 * Math.min(1.0, Math.sin(clampedU * Math.PI) * 3.6);
      const rx = 1.42 * edgeTaper * p;
      const ry = 0.34 * edgeTaper * p;
      const lx0 = cosA * rx;
      const ly0 = sinA * ry;
      // Rotate cross-section steadily by arc distance (~0.35 full turns per world unit)
      const twist = arcDist * 2.2;
      const cosT = Math.cos(twist);
      const sinT = Math.sin(twist);
      return {
        x: lx0 * cosT - ly0 * sinT,
        y: lx0 * sinT + ly0 * cosT,
      };
    }
    case 'beaded': {
      // Use arcDist directly during live drawing or integer cycles for finished stroke
      const effectiveLen = Math.max(1.5, totalLength);
      const beadCount = Math.max(4, Math.min(18, Math.round(effectiveLen * 0.95)));
      const phase =
        totalLength > 0
          ? clampedU * Math.PI * beadCount
          : arcDist * 3.0;
      const beadEnvelope = 0.26 + 0.92 * Math.pow(Math.abs(Math.sin(phase)), 0.62);
      const r = beadEnvelope * p;
      return { x: cosA * r, y: sinA * r };
    }
    default: {
      const { rx, ry } = evaluateBrushProfile(profile, clampedU, pressure, totalLength);
      return { x: cosA * rx, y: sinA * ry };
    }
  }
}

/**
 * Evaluates local cross-section displacement (lx, ly) and outward normal (nx, ny)
 * in the curve's (N, B) frame for any BrushProfile.
 */
export function evaluateBrushCrossSection(
  profile: BrushProfile,
  u: number,
  angle: number,
  pressure: number,
  arcDist: number,
  totalLength: number
): { lx: number; ly: number; nx: number; ny: number } {
  const pt = sampleCrossSectionXY(profile, u, angle, pressure, arcDist, totalLength);

  // Analytical finite-difference tangent along cross-section curve gives smooth exact normals
  const eps = 0.0025;
  const pPlus = sampleCrossSectionXY(profile, u, angle + eps, pressure, arcDist, totalLength);
  const pMinus = sampleCrossSectionXY(profile, u, angle - eps, pressure, arcDist, totalLength);
  const tx = pPlus.x - pMinus.x;
  const ty = pPlus.y - pMinus.y;
  const len = Math.hypot(tx, ty) || 1;

  return {
    lx: pt.x,
    ly: pt.y,
    nx: ty / len,
    ny: -tx / len,
  };
}

/**
 * Resample raw pointer events by uniform arc-length distance so strokes
 * remain clean and uniform regardless of mouse/stylus polling rate or speed.
 */
export function resampleRawPoints(
  rawPoints: RawStrokePoint[],
  spacing: number
): RawStrokePoint[] {
  if (rawPoints.length <= 2) return rawPoints.map((pt) => ({ ...pt, position: pt.position.clone() }));

  const step = Math.max(0.04, spacing);
  const cumLengths: number[] = [0];
  let totalLength = 0;

  for (let i = 1; i < rawPoints.length; i++) {
    totalLength += rawPoints[i].position.distanceTo(rawPoints[i - 1].position);
    cumLengths.push(totalLength);
  }

  if (totalLength < 1e-4) {
    return [rawPoints[0], rawPoints[rawPoints.length - 1]].map((pt) => ({
      ...pt,
      position: pt.position.clone(),
    }));
  }

  const count = Math.max(2, Math.min(400, Math.ceil(totalLength / step) + 1));
  const resampled: RawStrokePoint[] = [];

  let segIdx = 0;
  for (let k = 0; k < count; k++) {
    const targetDist = (k / (count - 1)) * totalLength;
    while (segIdx < cumLengths.length - 2 && cumLengths[segIdx + 1] < targetDist) {
      segIdx++;
    }
    const segStart = cumLengths[segIdx];
    const segEnd = cumLengths[segIdx + 1];
    const segLen = segEnd - segStart;
    const t = segLen < 1e-6 ? 0 : (targetDist - segStart) / segLen;

    const a = rawPoints[segIdx];
    const b = rawPoints[segIdx + 1];
    resampled.push({
      position: new THREE.Vector3().lerpVectors(a.position, b.position, t),
      pressure: a.pressure + (b.pressure - a.pressure) * t,
      time: a.time + (b.time - a.time) * t,
    });
  }

  return resampled;
}

/**
 * Apply iterative weighted smoothing to positions and pressures while keeping endpoints anchored.
 */
export function smoothRawPoints(
  points: RawStrokePoint[],
  smoothing: number
): RawStrokePoint[] {
  if (points.length <= 2 || smoothing <= 0.01) return points;

  const passes = Math.max(1, Math.round(smoothing * 5));
  const weight = 0.25 + smoothing * 0.25; // up to 0.5 blend with neighbors
  let curr = points.map((p) => ({ ...p, position: p.position.clone() }));

  for (let pass = 0; pass < passes; pass++) {
    const next: RawStrokePoint[] = [curr[0]];
    for (let i = 1; i < curr.length - 1; i++) {
      const prev = curr[i - 1];
      const pt = curr[i];
      const nxt = curr[i + 1];

      const avgPos = new THREE.Vector3()
        .addVectors(prev.position, nxt.position)
        .multiplyScalar(0.5);
      const smoothedPos = new THREE.Vector3().lerpVectors(pt.position, avgPos, weight);

      const avgPressure = (prev.pressure + nxt.pressure) * 0.5;
      const smoothedPressure = pt.pressure + (avgPressure - pt.pressure) * weight;

      next.push({
        position: smoothedPos,
        pressure: smoothedPressure,
        time: pt.time,
      });
    }
    next.push(curr[curr.length - 1]);
    curr = next;
  }

  return curr;
}

/**
 * Computes rotation-minimizing (Bishop / parallel transport) frames along a curve.
 * Orthonormalizes each step to prevent floating-point drift or twisting.
 */
function computeParallelTransportFrames(
  tangents: THREE.Vector3[]
): { normals: THREE.Vector3[]; binormals: THREE.Vector3[] } {
  const count = tangents.length;
  const normals: THREE.Vector3[] = new Array(count);
  const binormals: THREE.Vector3[] = new Array(count);

  const t0 = tangents[0].clone().normalize();
  let n0 = new THREE.Vector3(0, 1, 0);
  if (Math.abs(t0.dot(n0)) > 0.9) {
    n0 = new THREE.Vector3(1, 0, 0);
  }
  const b0 = new THREE.Vector3().crossVectors(t0, n0).normalize();
  n0.crossVectors(b0, t0).normalize();

  normals[0] = n0;
  binormals[0] = b0;

  for (let i = 1; i < count; i++) {
    const prevT = tangents[i - 1];
    const currT = tangents[i];
    const prevN = normals[i - 1];

    const v = new THREE.Vector3().crossVectors(prevT, currT);
    const c = Math.max(-1, Math.min(1, prevT.dot(currT)));

    let nextN: THREE.Vector3;
    if (v.lengthSq() < 1e-8) {
      nextN = prevN.clone();
    } else {
      const axis = v.clone().normalize();
      const angle = Math.atan2(v.length(), c);
      nextN = prevN.clone().applyAxisAngle(axis, angle);
    }

    // Gram-Schmidt orthonormalization against currT
    nextN.addScaledVector(currT, -nextN.dot(currT)).normalize();
    const nextB = new THREE.Vector3().crossVectors(currT, nextN).normalize();
    normals[i] = nextN;
    binormals[i] = nextB;
  }

  return { normals, binormals };
}

/**
 * Compute calligraphic nib frame oriented at a fixed 45° angle in XY space,
 * smoothly blending to fallback parallel-transport frame if tangent aligns with nib axis.
 */
function computeCalligraphicFrame(
  T: THREE.Vector3,
  ptN: THREE.Vector3,
  ptB: THREE.Vector3
): { N: THREE.Vector3; B: THREE.Vector3 } {
  const proj = FIXED_NIB_AXIS.clone().addScaledVector(T, -FIXED_NIB_AXIS.dot(T));
  const lenSq = proj.lengthSq();

  if (lenSq < 0.02) {
    return { N: ptN, B: ptB };
  }

  const N = proj.normalize();
  // Keep consistent hemisphere orientation relative to ptN/ptB? No, fixed nib stays aligned!
  const B = new THREE.Vector3().crossVectors(T, N).normalize();
  return { N, B };
}

/**
 * Builds a complete 3D stroke BufferGeometry from RawStrokePoint[] data.
 */
export function buildStrokeGeometryFromData(
  rawPoints: RawStrokePoint[],
  radius: number,
  profile: BrushProfile,
  smoothing: number,
  colorSettings: ColorSettings,
  isHitGeometry: boolean = false
): { geometry: THREE.BufferGeometry; sampledPoints: THREE.Vector3[] } {
  // Resample & smooth raw input points
  const spacing = isHitGeometry ? Math.max(0.18, radius * 0.6) : Math.max(0.06, radius * 0.35);
  const resampled = resampleRawPoints(rawPoints, spacing);
  const smoothed = smoothRawPoints(resampled, smoothing);

  const positionsVec = smoothed.map((p) => p.position);
  if (positionsVec.length < 2) {
    positionsVec.push(positionsVec[0].clone().add(new THREE.Vector3(0.01, 0, 0)));
  }

  const curve = new THREE.CatmullRomCurve3(positionsVec, false, 'catmullrom', 0.5);
  const curveLength = curve.getLength();

  const tubularSegments = isHitGeometry
    ? Math.max(10, Math.min(80, Math.floor(curveLength * 10)))
    : Math.max(24, Math.min(280, Math.floor(curveLength * 36)));
  const radialSegments = getProfileRadialSegments(profile, isHitGeometry);

  const samplePoints: THREE.Vector3[] = [];
  const tangents: THREE.Vector3[] = [];
  const samplePressures: number[] = [];

  for (let i = 0; i <= tubularSegments; i++) {
    const u = i / tubularSegments;
    samplePoints.push(curve.getPointAt(u));
    tangents.push(curve.getTangentAt(u).normalize());

    // Interpolate pressure along smoothed points
    const fIdx = u * (smoothed.length - 1);
    const idx0 = Math.floor(fIdx);
    const idx1 = Math.min(smoothed.length - 1, idx0 + 1);
    const frac = fIdx - idx0;
    const pVal = smoothed[idx0].pressure * (1 - frac) + smoothed[idx1].pressure * frac;
    samplePressures.push(pVal);
  }

  const { normals, binormals } = computeParallelTransportFrames(tangents);

  const vertexPositions: number[] = [];
  const vertexNormals: number[] = [];
  const vertexColors: number[] = [];
  const vertexUvs: number[] = [];
  const indices: number[] = [];

  const baseR = isHitGeometry ? Math.max(radius * 2.5, 0.45) : radius;

  const pushVertex = (
    pos: THREE.Vector3,
    norm: THREE.Vector3,
    u: number,
    v: number
  ) => {
    vertexPositions.push(pos.x, pos.y, pos.z);
    vertexNormals.push(norm.x, norm.y, norm.z);
    vertexUvs.push(u, v);

    if (!isHitGeometry) {
      const angle = v * Math.PI * 2;
      const tColor =
        colorSettings.direction === 'width' ? 0.5 + 0.5 * Math.cos(angle) : u;
      evaluateColorSettingsAt(colorSettings, tColor, _tmpColor);
      vertexColors.push(_tmpColor.r, _tmpColor.g, _tmpColor.b);
    } else {
      vertexColors.push(1, 1, 1);
    }
  };

  // Optional hemispherical start cap rings for 'rounded' brush
  const capRings = !isHitGeometry && profile === 'rounded' ? 4 : 0;
  let totalRings = 0;

  // Start hemisphere cap (from pole out to ring 0)
  if (capRings > 0) {
    const startCenter = samplePoints[0];
    const startT = tangents[0];
    const N0 = normals[0];
    const B0 = binormals[0];
    const { rx } = evaluateBrushProfile('rounded', 0, samplePressures[0]);
    const rCap = baseR * rx;

    for (let c = capRings; c >= 1; c--) {
      const phi = (c / capRings) * (Math.PI * 0.5); // pi/2 at tip -> 0 at ring 0
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      const ringRadius = rCap * cosPhi;
      const axialOffset = -rCap * sinPhi;

      for (let j = 0; j <= radialSegments; j++) {
        const v = j / radialSegments;
        const angle = v * Math.PI * 2;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        const radialDir = new THREE.Vector3()
          .addScaledVector(N0, cosA)
          .addScaledVector(B0, sinA);

        const pos = startCenter
          .clone()
          .addScaledVector(startT, axialOffset)
          .addScaledVector(radialDir, ringRadius);

        const norm = radialDir
          .clone()
          .multiplyScalar(cosPhi)
          .addScaledVector(startT, -sinPhi)
          .normalize();

        pushVertex(pos, norm, 0, v);
      }
      totalRings++;
    }
  }

  // Main tube body rings
  for (let i = 0; i <= tubularSegments; i++) {
    const u = i / tubularSegments;
    const arcDist = u * curveLength;
    const center = samplePoints[i];
    const T = tangents[i];
    let N = normals[i];
    let B = binormals[i];

    if (!isHitGeometry && profile === 'flat') {
      const calli = computeCalligraphicFrame(T, N, B);
      N = calli.N;
      B = calli.B;
    }

    for (let j = 0; j <= radialSegments; j++) {
      const v = j / radialSegments;
      const angle = v * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      let lx = cosA * baseR;
      let ly = sinA * baseR;
      let nx = cosA;
      let ny = sinA;

      if (!isHitGeometry) {
        const sec = evaluateBrushCrossSection(
          profile,
          u,
          angle,
          samplePressures[i],
          arcDist,
          curveLength
        );
        lx = sec.lx * baseR;
        ly = sec.ly * baseR;
        nx = sec.nx;
        ny = sec.ny;
      }

      const disp = new THREE.Vector3()
        .addScaledVector(N, lx)
        .addScaledVector(B, ly);

      const pos = center.clone().add(disp);

      const norm = new THREE.Vector3()
        .addScaledVector(N, nx)
        .addScaledVector(B, ny)
        .normalize();

      pushVertex(pos, norm, u, v);
    }
    totalRings++;
  }

  // End hemisphere cap for 'rounded' brush
  if (capRings > 0) {
    const endCenter = samplePoints[tubularSegments];
    const endT = tangents[tubularSegments];
    const NEnd = normals[tubularSegments];
    const BEnd = binormals[tubularSegments];
    const { rx } = evaluateBrushProfile('rounded', 1, samplePressures[tubularSegments]);
    const rCap = baseR * rx;

    for (let c = 1; c <= capRings; c++) {
      const phi = (c / capRings) * (Math.PI * 0.5);
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      const ringRadius = rCap * cosPhi;
      const axialOffset = rCap * sinPhi;

      for (let j = 0; j <= radialSegments; j++) {
        const v = j / radialSegments;
        const angle = v * Math.PI * 2;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        const radialDir = new THREE.Vector3()
          .addScaledVector(NEnd, cosA)
          .addScaledVector(BEnd, sinA);

        const pos = endCenter
          .clone()
          .addScaledVector(endT, axialOffset)
          .addScaledVector(radialDir, ringRadius);

        const norm = radialDir
          .clone()
          .multiplyScalar(cosPhi)
          .addScaledVector(endT, sinPhi)
          .normalize();

        pushVertex(pos, norm, 1, v);
      }
      totalRings++;
    }
  }

  // Stitch quad faces across rings
  const ringStride = radialSegments + 1;
  for (let i = 0; i < totalRings - 1; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * ringStride + j;
      const b = (i + 1) * ringStride + j;
      const c = (i + 1) * ringStride + (j + 1);
      const d = i * ringStride + (j + 1);

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  // Flat end caps for non-rounded profiles (and hit geometry)
  if (capRings === 0) {
    const startCenter = samplePoints[0];
    const startNormal = tangents[0].clone().negate();
    const startCenterIndex = vertexPositions.length / 3;
    pushVertex(startCenter, startNormal, 0, 0.5);

    for (let j = 0; j < radialSegments; j++) {
      indices.push(startCenterIndex, j + 1, j);
    }

    const endCenter = samplePoints[tubularSegments];
    const endNormal = tangents[tubularSegments].clone();
    const endCenterIndex = vertexPositions.length / 3;
    pushVertex(endCenter, endNormal, 1, 0.5);

    const lastRingStart = (totalRings - 1) * ringStride;
    for (let j = 0; j < radialSegments; j++) {
      indices.push(endCenterIndex, lastRingStart + j, lastRingStart + j + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertexPositions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(vertexNormals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(vertexUvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return { geometry, sampledPoints: samplePoints };
}

/**
 * Updates per-vertex colors IN-PLACE on an existing stroke BufferGeometry
 * using its stored UV coordinates (uv.x = u along length, uv.y = v around circumference).
 * Allows instant 60fps gradient/color scrubbing in the Inspecteur without rebuilding topology!
 */
export function updateStrokeGeometryColors(
  geometry: THREE.BufferGeometry,
  colorSettings: ColorSettings
): void {
  const uvAttr = geometry.getAttribute('uv');
  let colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute | undefined;

  if (!uvAttr) return;

  if (!colorAttr) {
    const arr = new Float32Array(uvAttr.count * 3);
    colorAttr = new THREE.BufferAttribute(arr, 3);
    geometry.setAttribute('color', colorAttr);
  }

  for (let i = 0; i < uvAttr.count; i++) {
    const u = uvAttr.getX(i);
    const v = uvAttr.getY(i);
    const angle = v * Math.PI * 2;
    const tColor =
      colorSettings.direction === 'width' ? 0.5 + 0.5 * Math.cos(angle) : u;
    evaluateColorSettingsAt(colorSettings, tColor, _tmpColor);
    colorAttr.setXYZ(i, _tmpColor.r, _tmpColor.g, _tmpColor.b);
  }

  colorAttr.needsUpdate = true;
}

/**
 * Incremental live geometry builder used while the user is dragging the pointer.
 * Pre-allocates typed arrays and appends only new rings + updates tail taper,
 * avoiding full mesh allocations on every pointermove frame.
 */
export class ActiveStrokeBuilder {
  public readonly geometry: THREE.BufferGeometry;
  private readonly maxRings: number;
  private readonly radialSegments: number;
  private readonly ringStride: number;

  private positions: Float32Array;
  private normals: Float32Array;
  private colors: Float32Array;
  private uvs: Float32Array;
  private indices: Uint32Array;

  private ringCenters: THREE.Vector3[] = [];
  private ringTangents: THREE.Vector3[] = [];
  private ringNormals: THREE.Vector3[] = [];
  private ringBinormals: THREE.Vector3[] = [];
  private ringPressures: number[] = [];
  private ringArcLengths: number[] = [];
  private totalArcLength: number = 0;

  private baseRadius: number;
  private profile: BrushProfile;
  private colorSettings: ColorSettings;

  constructor(
    firstPoint: RawStrokePoint,
    baseRadius: number,
    profile: BrushProfile,
    colorSettings: ColorSettings,
    maxRings: number = 1200
  ) {
    this.maxRings = maxRings;
    this.radialSegments = getProfileRadialSegments(profile, false);
    this.ringStride = this.radialSegments + 1;
    this.baseRadius = baseRadius;
    this.profile = profile;
    this.colorSettings = colorSettings;

    const maxVerts = this.maxRings * this.ringStride;
    const maxIndices = (this.maxRings - 1) * this.radialSegments * 6;

    this.positions = new Float32Array(maxVerts * 3);
    this.normals = new Float32Array(maxVerts * 3);
    this.colors = new Float32Array(maxVerts * 3);
    this.uvs = new Float32Array(maxVerts * 2);
    this.indices = new Uint32Array(maxIndices);

    // Pre-populate index topology once
    let idxPtr = 0;
    for (let i = 0; i < this.maxRings - 1; i++) {
      for (let j = 0; j < this.radialSegments; j++) {
        const a = i * this.ringStride + j;
        const b = (i + 1) * this.ringStride + j;
        const c = (i + 1) * this.ringStride + (j + 1);
        const d = i * this.ringStride + (j + 1);

        this.indices[idxPtr++] = a;
        this.indices[idxPtr++] = b;
        this.indices[idxPtr++] = d;
        this.indices[idxPtr++] = b;
        this.indices[idxPtr++] = c;
        this.indices[idxPtr++] = d;
      }
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
    this.geometry.setIndex(new THREE.BufferAttribute(this.indices, 1));
    this.geometry.setDrawRange(0, 0);
    // Prevent premature frustum culling during live incremental growth
    this.geometry.boundingSphere = new THREE.Sphere(firstPoint.position.clone(), 100);

    // Seed first ring
    this.ringCenters.push(firstPoint.position.clone());
    this.ringPressures.push(firstPoint.pressure);
    this.ringArcLengths.push(0);
    const defaultT = new THREE.Vector3(1, 0, 0);
    const defaultN = new THREE.Vector3(0, 1, 0);
    const defaultB = new THREE.Vector3(0, 0, 1);
    this.ringTangents.push(defaultT);
    this.ringNormals.push(defaultN);
    this.ringBinormals.push(defaultB);
    this.writeRingVertices(0, 0);
  }

  public appendPoint(pt: RawStrokePoint): boolean {
    const count = this.ringCenters.length;
    if (count >= this.maxRings - 1) return false;

    const prevCenter = this.ringCenters[count - 1];
    const dist = prevCenter.distanceTo(pt.position);
    const step = Math.max(0.06, this.baseRadius * 0.34);
    if (dist < step) return false;

    // Subdivide long jumps smoothly
    const subSteps = Math.min(8, Math.max(1, Math.floor(dist / step)));
    const prevPressure = this.ringPressures[count - 1];

    for (let s = 1; s <= subSteps; s++) {
      if (this.ringCenters.length >= this.maxRings - 1) break;
      const frac = s / subSteps;
      const pos = new THREE.Vector3().lerpVectors(prevCenter, pt.position, frac);
      const press = prevPressure + (pt.pressure - prevPressure) * frac;

      const idx = this.ringCenters.length;
      const prevIdx = idx - 1;
      const currT = new THREE.Vector3().subVectors(pos, this.ringCenters[prevIdx]).normalize();

      let currN: THREE.Vector3;
      let currB: THREE.Vector3;

      if (idx === 1) {
        // Initialize ring 0 orientation cleanly along first true tangent
        currN = new THREE.Vector3(0, 1, 0);
        if (Math.abs(currT.dot(currN)) > 0.9) currN.set(1, 0, 0);
        currB = new THREE.Vector3().crossVectors(currT, currN).normalize();
        currN.crossVectors(currB, currT).normalize();
        this.ringTangents[0].copy(currT);
        this.ringNormals[0].copy(currN);
        this.ringBinormals[0].copy(currB);
        this.writeRingVertices(0, 0);
      } else {
        const prevT = this.ringTangents[prevIdx];
        const prevN = this.ringNormals[prevIdx];
        const v = new THREE.Vector3().crossVectors(prevT, currT);
        const c = Math.max(-1, Math.min(1, prevT.dot(currT)));
        if (v.lengthSq() < 1e-8) {
          currN = prevN.clone();
        } else {
          currN = prevN.clone().applyAxisAngle(v.normalize(), Math.atan2(v.length(), c));
        }
        currN.addScaledVector(currT, -currN.dot(currT)).normalize();
        currB = new THREE.Vector3().crossVectors(currT, currN).normalize();
      }

      this.totalArcLength += pos.distanceTo(this.ringCenters[prevIdx]);
      this.ringCenters.push(pos);
      this.ringTangents.push(currT);
      this.ringNormals.push(currN);
      this.ringBinormals.push(currB);
      this.ringPressures.push(press);
      this.ringArcLengths.push(this.totalArcLength);
    }

    // Re-evaluate u & colors/taper on tail rings (or all rings for normalized length u)
    // Updating vertices on existing rings is pure typed-array math (zero allocations)
    const total = this.ringCenters.length;
    const startRefresh = this.colorSettings.mode === 'gradient' && this.colorSettings.direction === 'length'
      ? 0
      : Math.max(0, total - 16);

    for (let i = startRefresh; i < total; i++) {
      const u = total > 1 ? i / (total - 1) : 0;
      this.writeRingVertices(i, u);
    }

    this.geometry.setDrawRange(0, (total - 1) * this.radialSegments * 6);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.uv.needsUpdate = true;
    return true;
  }

  private writeRingVertices(ringIdx: number, u: number) {
    const center = this.ringCenters[ringIdx];
    const T = this.ringTangents[ringIdx];
    let N = this.ringNormals[ringIdx];
    let B = this.ringBinormals[ringIdx];
    const arcDist = this.ringArcLengths[ringIdx] ?? 0;

    if (this.profile === 'flat') {
      const calli = computeCalligraphicFrame(T, N, B);
      N = calli.N;
      B = calli.B;
    }

    const pressure = this.ringPressures[ringIdx];
    const baseVIdx = ringIdx * this.ringStride;

    for (let j = 0; j <= this.radialSegments; j++) {
      const v = j / this.radialSegments;
      const angle = v * Math.PI * 2;
      const cosA = Math.cos(angle);

      // Pass totalLength = 0 during live drawing so beaded/twisted use stable arcDist pitch
      const sec = evaluateBrushCrossSection(
        this.profile,
        u,
        angle,
        pressure,
        arcDist,
        0
      );

      const lx = sec.lx * this.baseRadius;
      const ly = sec.ly * this.baseRadius;

      const dx = N.x * lx + B.x * ly;
      const dy = N.y * lx + B.y * ly;
      const dz = N.z * lx + B.z * ly;

      const vIdx = baseVIdx + j;
      const p3 = vIdx * 3;
      const p2 = vIdx * 2;

      this.positions[p3] = center.x + dx;
      this.positions[p3 + 1] = center.y + dy;
      this.positions[p3 + 2] = center.z + dz;

      const nx = N.x * sec.nx + B.x * sec.ny;
      const ny = N.y * sec.nx + B.y * sec.ny;
      const nz = N.z * sec.nx + B.z * sec.ny;
      const nLen = Math.hypot(nx, ny, nz) || 1;

      this.normals[p3] = nx / nLen;
      this.normals[p3 + 1] = ny / nLen;
      this.normals[p3 + 2] = nz / nLen;

      this.uvs[p2] = u;
      this.uvs[p2 + 1] = v;

      const tColor =
        this.colorSettings.direction === 'width' ? 0.5 + 0.5 * cosA : u;
      evaluateColorSettingsAt(this.colorSettings, tColor, _tmpColor);
      this.colors[p3] = _tmpColor.r;
      this.colors[p3 + 1] = _tmpColor.g;
      this.colors[p3 + 2] = _tmpColor.b;
    }
  }
}
