/**
 * @file scene.ts
 * Main Three.js Scene Manager for 3D RAWING.
 * Handles:
 *  - Renderer, Day/Night studio aesthetics, and Preview presentation mode
 *  - Draggable 3D light object with click-to-select & undoable repositioning
 *  - Live incremental stroke drawing (ActiveStrokeBuilder) with pointer pressure & velocity dynamics
 *  - Generous raycast picking for selection (multi-select via Shift+click) and Eraser (hover glow + click/drag batch undo)
 *  - Live per-vertex gradient/color updates and material parameter editing
 *  - PNG, Wavefront OBJ, and binary GLB (GLTF 2.0 with vertexColors) export
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import {
  StrokeData,
  StrokeProperties,
  BrushProfile,
  MaterialPreset,
  MaterialParams,
  ColorSettings,
  RawStrokePoint,
  ToolType,
  SelectedTarget,
  ThemeMode,
} from '../types';
import {
  ActiveStrokeBuilder,
  buildStrokeGeometryFromData,
  updateStrokeGeometryColors,
} from './strokeGeometry';
import {
  createStrokeMaterial,
  createHitMaterial,
  createHighlightMaterial,
  createEraserHighlightMaterial,
  getPresetDefaultParams,
  cloneMaterialParams,
} from './materials';
import { cloneColorSettings, createDefaultColorSettings } from '../utils/color';
import { HistoryManager } from './history';

export interface SceneCallbacks {
  onTargetChange: (target: SelectedTarget) => void;
  onStrokeCountChange: (count: number) => void;
  onToolChange?: (tool: ToolType) => void;
  onPreviewChange?: (isPreview: boolean) => void;
}

export class SceneEngine {
  public container: HTMLElement;
  public canvas: HTMLCanvasElement;
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public controls: OrbitControls;

  // Automated Studio & Theme Lighting
  private ambientLight: THREE.AmbientLight;
  private hemiLight: THREE.HemisphereLight;
  private keyLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  public currentTheme: ThemeMode = 'day';
  public isPreviewMode: boolean = false;

  // Drawing groups & Depth plane
  private strokesGroup: THREE.Group;
  private helpersGroup: THREE.Group;
  private depthPlaneHelper: THREE.GridHelper;
  private currentDrawingDepth: number = 0;

  // Active strokes & selection state
  private strokes: Map<string, StrokeData> = new Map();
  private selectedStrokeIds: Set<string> = new Set();
  private hoveredEraserStrokeId: string | null = null;

  // Active tool & Current drawing settings (for new strokes)
  public activeTool: ToolType = 'select';
  private prevToolBeforeNav: ToolType = 'select';
  public currentProfile: BrushProfile = 'tapered';
  public currentMaterialPreset: MaterialPreset = 'standard';
  public currentMaterialParams: MaterialParams = getPresetDefaultParams('standard');
  public currentCustomPresetId?: string;
  public currentColorSettings: ColorSettings = createDefaultColorSettings('#3b82f6');
  public currentVolume: number = 0.22;
  public currentTransparency: number = 1.0;
  public currentSmoothing: number = 0.45;

  // Drawing in progress
  private isDrawing: boolean = false;
  private rawPointsBuffer: RawStrokePoint[] = [];
  private activeBuilder: ActiveStrokeBuilder | null = null;
  private activeTempMesh: THREE.Mesh | null = null;
  private lastSmoothedPressure: number = 0.8;

  // Eraser drag batching
  private isErasing: boolean = false;
  private erasedBatch: StrokeData[] = [];

  // Raycasting & Interaction
  private raycaster: THREE.Raycaster;
  private pointerPos: THREE.Vector2 = new THREE.Vector2();
  private historyManager: HistoryManager;
  private callbacks: SceneCallbacks;

  // Bound event listeners for clean disposal
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private boundWheel: (e: WheelEvent) => void;
  private boundKeyDown: (e: KeyboardEvent) => void;

  private animationFrameId: number = 0;
  private isDisposed: boolean = false;

  constructor(
    container: HTMLElement,
    historyManager: HistoryManager,
    callbacks: SceneCallbacks
  ) {
    this.container = container;
    this.historyManager = historyManager;
    this.callbacks = callbacks;

    // Canvas & Renderer setup
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.container.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setClearColor(0xffffff, 1.0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Scene
    this.scene = new THREE.Scene();

    // Studio Environment map using RoomEnvironment for realistic metallic/glass reflections
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Camera
    const width = container.clientWidth || 920;
    const height = container.clientHeight || 1080;
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 16);

    // Orbit Controls (Right-click anytime, Left-click in Navigate/Preview mode)
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.target.set(0, 0, 0);
    this.controls.mouseButtons = {
      LEFT: -1 as any,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };

    // Ambient, Hemisphere, Key & Rim Fill Studio Lights
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.52);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0xdfe7f6, 0.48);
    this.hemiLight.position.set(0, 40, 0);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfffaf2, 1.35);
    this.keyLight.position.set(6.5, 7.0, 6.0);
    this.keyLight.target.position.set(0, 0, 0);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.keyLight.shadow.mapSize.width = 1024;
    this.keyLight.shadow.mapSize.height = 1024;
    this.keyLight.shadow.camera.left = -12;
    this.keyLight.shadow.camera.right = 12;
    this.keyLight.shadow.camera.top = 12;
    this.keyLight.shadow.camera.bottom = -12;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.fillLight = new THREE.DirectionalLight(0xe0efff, 0.45);
    this.fillLight.position.set(-6, -4, -5);
    this.scene.add(this.fillLight);

    // Groups
    this.strokesGroup = new THREE.Group();
    this.scene.add(this.strokesGroup);

    this.helpersGroup = new THREE.Group();
    this.scene.add(this.helpersGroup);

    // Subtle 3D Depth Plane Helper Grid
    this.depthPlaneHelper = new THREE.GridHelper(26, 26, 0xd4d4d4, 0xf0f0f0);
    this.depthPlaneHelper.rotation.x = Math.PI / 2;
    this.depthPlaneHelper.position.set(0, 0, this.currentDrawingDepth);
    this.helpersGroup.add(this.depthPlaneHelper);

    // Raycaster
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Line = { threshold: 0.25 };

    // Bind events
    this.boundPointerDown = this.onPointerDown.bind(this);
    this.boundPointerMove = this.onPointerMove.bind(this);
    this.boundPointerUp = this.onPointerUp.bind(this);
    this.boundWheel = this.onWheel.bind(this);
    this.boundKeyDown = this.onKeyDown.bind(this);
    this.bindEvents();

    this.updateToolInteraction();
    this.handleResize();
    this.seedDemoStrokes();
    this.animate();
  }

  // -------------------------------------------------------------
  // Theme (Day / Night Mode) & Preview Mode
  // -------------------------------------------------------------

  public setTheme(theme: ThemeMode) {
    this.currentTheme = theme;

    if (theme === 'night') {
      this.renderer.setClearColor(0x0e0f14, 1.0);
      this.ambientLight.color.set(0x28304a);
      this.ambientLight.intensity = 0.35;
      this.hemiLight.color.set(0x1a2035);
      this.hemiLight.groundColor.set(0x0a0c10);
      this.hemiLight.intensity = 0.3;
      this.keyLight.color.set(0xe2e8f0);
      this.keyLight.intensity = 1.25;
      this.fillLight.intensity = 0.55;
      this.fillLight.color.set(0x38bdf8);

      this.rebuildGridHelper(0x2e3240, 0x1b1d26);
    } else {
      this.renderer.setClearColor(0xffffff, 1.0);
      this.ambientLight.color.set(0xffffff);
      this.ambientLight.intensity = 0.52;
      this.hemiLight.color.set(0xffffff);
      this.hemiLight.groundColor.set(0xdfe7f6);
      this.hemiLight.intensity = 0.48;
      this.keyLight.color.set(0xfffaf2);
      this.keyLight.intensity = 1.35;
      this.fillLight.intensity = 0.45;
      this.fillLight.color.set(0xe0efff);

      this.rebuildGridHelper(0xd4d4d4, 0xf0f0f0);
    }

    // Refresh selection wireframe color
    this.strokes.forEach((s) => {
      if (s.highlightMesh) {
        (s.highlightMesh.material as THREE.MeshBasicMaterial).color.set(
          theme === 'night' ? 0xffffff : 0x2563eb
        );
      }
    });
  }

  private rebuildGridHelper(c1: number, c2: number) {
    this.helpersGroup.remove(this.depthPlaneHelper);
    this.depthPlaneHelper.geometry.dispose();
    (this.depthPlaneHelper.material as THREE.Material).dispose();
    this.depthPlaneHelper = new THREE.GridHelper(26, 26, c1, c2);
    this.depthPlaneHelper.rotation.x = Math.PI / 2;
    this.depthPlaneHelper.position.set(0, 0, this.currentDrawingDepth);
    this.helpersGroup.add(this.depthPlaneHelper);
  }

  public setPreviewMode(enabled: boolean) {
    this.isPreviewMode = enabled;
    this.helpersGroup.visible = !enabled;
    this.clearEraserHover();

    this.strokes.forEach((s) => {
      if (s.highlightMesh) {
        s.highlightMesh.visible = !enabled;
      }
    });

    this.updateToolInteraction();
  }

  // -------------------------------------------------------------
  // Tool & Pointer Event Handling
  // -------------------------------------------------------------

  public setTool(tool: ToolType) {
    this.activeTool = tool;
    if (tool !== 'eraser') {
      this.clearEraserHover();
    }
    this.updateToolInteraction();
  }

  private updateToolInteraction() {
    if (this.isPreviewMode) {
      this.controls.enabled = true;
      this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      this.canvas.style.cursor = 'grab';
      return;
    }

    if (this.activeTool === 'navigate') {
      this.controls.enabled = true;
      this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      this.canvas.style.cursor = 'grab';
    } else {
      this.controls.enabled = true;
      this.controls.mouseButtons.LEFT = -1 as any;
      this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;

      if (this.activeTool === 'select') {
        this.canvas.style.cursor = 'default';
      } else if (this.activeTool === 'eraser') {
        this.canvas.style.cursor = 'crosshair';
      } else {
        this.canvas.style.cursor = 'crosshair';
      }
    }
  }

  private bindEvents() {
    this.canvas.addEventListener('pointerdown', this.boundPointerDown);
    window.addEventListener('pointermove', this.boundPointerMove);
    window.addEventListener('pointerup', this.boundPointerUp);
    this.canvas.addEventListener('wheel', this.boundWheel, { passive: false });
    window.addEventListener('keydown', this.boundKeyDown);
  }

  private getNormalizedPointer(e: PointerEvent): THREE.Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    return new THREE.Vector2(x, y);
  }

  private get3DPointOnDrawPlane(ndc: THREE.Vector2): THREE.Vector3 | null {
    this.raycaster.setFromCamera(ndc, this.camera);
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);

    const planeNormal = camDir.clone().negate();
    const planePoint = new THREE.Vector3(0, 0, this.currentDrawingDepth);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planePoint);

    const hitPoint = new THREE.Vector3();
    const intersect = this.raycaster.ray.intersectPlane(plane, hitPoint);
    return intersect ? hitPoint : null;
  }

  /**
   * Raycast against generous invisible hitMeshes of all active strokes.
   */
  public hitTestStrokes(ndc: THREE.Vector2): StrokeData | null {
    this.raycaster.setFromCamera(ndc, this.camera);
    const hitMeshes: THREE.Object3D[] = [];
    const hitMap: Map<THREE.Object3D, StrokeData> = new Map();

    this.strokes.forEach((stroke) => {
      hitMeshes.push(stroke.hitMesh);
      hitMap.set(stroke.hitMesh, stroke);
    });

    const intersects = this.raycaster.intersectObjects(hitMeshes, false);
    if (intersects.length > 0) {
      return hitMap.get(intersects[0].object) || null;
    }
    return null;
  }

  // -------------------------------------------------------------
  // Eraser Hover Highlight & Single/Drag Erase
  // -------------------------------------------------------------

  private setEraserHover(stroke: StrokeData | null) {
    const nextId = stroke ? stroke.id : null;
    if (this.hoveredEraserStrokeId === nextId) return;

    // Clear previous hover highlight
    this.clearEraserHover();

    if (stroke) {
      this.hoveredEraserStrokeId = stroke.id;
      const hoverMat = createEraserHighlightMaterial();
      stroke.eraserHighlightMesh = new THREE.Mesh(stroke.mesh.geometry, hoverMat);
      stroke.eraserHighlightMesh.scale.multiplyScalar(1.045);
      this.strokesGroup.add(stroke.eraserHighlightMesh);
    }
  }

  private clearEraserHover() {
    if (!this.hoveredEraserStrokeId) return;
    const prev = this.strokes.get(this.hoveredEraserStrokeId);
    if (prev && prev.eraserHighlightMesh) {
      this.strokesGroup.remove(prev.eraserHighlightMesh);
      (prev.eraserHighlightMesh.material as THREE.Material).dispose();
      prev.eraserHighlightMesh = undefined;
    }
    this.hoveredEraserStrokeId = null;
  }

  private eraseStrokeInBatch(stroke: StrokeData) {
    this.clearEraserHover();
    this.deselectStroke(stroke.id, false);
    this.strokesGroup.remove(stroke.mesh);
    this.strokesGroup.remove(stroke.hitMesh);
    if (stroke.highlightMesh) {
      this.strokesGroup.remove(stroke.highlightMesh);
    }
    this.strokes.delete(stroke.id);
    this.erasedBatch.push(stroke);
    this.callbacks.onStrokeCountChange(this.strokes.size);

    if (this.selectedStrokeIds.size > 0) {
      this.callbacks.onTargetChange({
        type: 'stroke',
        ids: Array.from(this.selectedStrokeIds),
      });
    } else {
      this.callbacks.onTargetChange(null);
    }
  }

  private computePointerPressure(e: PointerEvent, prevPt?: RawStrokePoint, newPos?: THREE.Vector3): number {
    // True stylus/pen pressure when supported by hardware
    if (e.pointerType === 'pen' && e.pressure > 0) {
      const target = Math.max(0.15, Math.min(1.0, e.pressure));
      this.lastSmoothedPressure = this.lastSmoothedPressure * 0.55 + target * 0.45;
      return this.lastSmoothedPressure;
    }

    // Mouse / trackpad velocity dynamics (faster = thinner, slower = thicker)
    if (prevPt && newPos) {
      const dt = Math.max(4, performance.now() - prevPt.time) / 1000;
      const dist = prevPt.position.distanceTo(newPos);
      const speed = dist / dt; // world units per second
      const target = Math.max(0.28, Math.min(1.0, 1.0 - speed * 0.028));
      this.lastSmoothedPressure = this.lastSmoothedPressure * 0.78 + target * 0.22;
      return this.lastSmoothedPressure;
    }

    this.lastSmoothedPressure = 0.82;
    return 0.82;
  }

  private onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;

    const ndc = this.getNormalizedPointer(e);
    this.pointerPos.copy(ndc);

    if (this.isPreviewMode || this.activeTool === 'navigate') {
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    // 1. Eraser tool: start single click / drag-erase batch
    if (this.activeTool === 'eraser') {
      this.isErasing = true;
      this.erasedBatch = [];
      const hitStroke = this.hitTestStrokes(ndc);
      if (hitStroke) {
        this.eraseStrokeInBatch(hitStroke);
      }
      return;
    }

    // 2. Check if clicked an existing stroke (Select or Pen)
    const hitStroke = this.hitTestStrokes(ndc);
    if (hitStroke) {
      if (e.shiftKey) {
        if (this.selectedStrokeIds.has(hitStroke.id)) {
          this.deselectStroke(hitStroke.id);
        } else {
          this.selectStroke(hitStroke.id, true);
        }
      } else {
        this.selectStroke(hitStroke.id, false);
      }
      return;
    }

    // 3. Clicked empty scene: deselect active object(s)
    if (this.selectedStrokeIds.size > 0 && !e.shiftKey) {
      this.clearSelection(true);
    }

    if (this.activeTool === 'select') {
      return;
    }

    // 5. Begin drawing a new stroke using ActiveStrokeBuilder (incremental geometry)
    const pt3d = this.get3DPointOnDrawPlane(ndc);
    if (!pt3d) return;

    this.isDrawing = true;
    const initPressure = this.computePointerPressure(e);
    const firstRaw: RawStrokePoint = {
      position: pt3d.clone(),
      pressure: initPressure,
      time: performance.now(),
    };
    this.rawPointsBuffer = [firstRaw];

    this.activeBuilder = new ActiveStrokeBuilder(
      firstRaw,
      this.currentVolume,
      this.currentProfile,
      this.currentColorSettings
    );

    const previewMat = createStrokeMaterial(
      this.currentMaterialPreset,
      this.currentMaterialParams,
      'pen',
      true
    );

    this.activeTempMesh = new THREE.Mesh(this.activeBuilder.geometry, previewMat);
    this.activeTempMesh.frustumCulled = false;
    this.strokesGroup.add(this.activeTempMesh);
  }

  private onPointerMove(e: PointerEvent) {
    const ndc = this.getNormalizedPointer(e);
    this.pointerPos.copy(ndc);

    // 1. Eraser / object-deletion hover or drag-erasing
    if (this.activeTool === 'eraser' && !this.isPreviewMode) {
      const hitStroke = this.hitTestStrokes(ndc);
      if (this.isErasing) {
        if (hitStroke) {
          this.eraseStrokeInBatch(hitStroke);
        }
        this.canvas.style.cursor = 'crosshair';
      } else {
        this.setEraserHover(hitStroke);
        this.canvas.style.cursor = hitStroke ? 'pointer' : 'crosshair';
      }
      return;
    }

    // 2. Live incremental drawing
    if (this.isDrawing && this.activeBuilder) {
      const pt3d = this.get3DPointOnDrawPlane(ndc);
      if (!pt3d) return;

      const lastRaw = this.rawPointsBuffer[this.rawPointsBuffer.length - 1];
      if (lastRaw.position.distanceTo(pt3d) > 0.04) {
        const press = this.computePointerPressure(e, lastRaw, pt3d);
        const rawPt: RawStrokePoint = {
          position: pt3d.clone(),
          pressure: press,
          time: performance.now(),
        };
        this.rawPointsBuffer.push(rawPt);
        this.activeBuilder.appendPoint(rawPt);
      }
      return;
    }

    // 3. Hover cursor feedback
    if (
      !this.isPreviewMode &&
      (this.activeTool === 'select' || this.activeTool === 'pen')
    ) {
      if (this.hitTestStrokes(ndc)) {
        this.canvas.style.cursor = 'pointer';
      } else {
        this.canvas.style.cursor = this.activeTool === 'select' ? 'default' : 'crosshair';
      }
    }
  }

  private onPointerUp(_e: PointerEvent) {
    if (this.isPreviewMode || this.activeTool === 'navigate') {
      this.canvas.style.cursor = 'grab';
    }

    // Finish eraser click or drag -> 1 single undo step for the entire drag!
    if (this.isErasing) {
      this.isErasing = false;
      if (this.erasedBatch.length > 0) {
        this.historyManager.push({
          type: 'delete_strokes',
          strokes: [...this.erasedBatch],
        });
        this.erasedBatch = [];
      }
      return;
    }

    // Finish drawing stroke
    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (this.activeTempMesh) {
      this.strokesGroup.remove(this.activeTempMesh);
      this.activeTempMesh.geometry.dispose();
      (this.activeTempMesh.material as THREE.Material).dispose();
      this.activeTempMesh = null;
    }
    this.activeBuilder = null;

    if (this.rawPointsBuffer.length < 2) {
      this.rawPointsBuffer = [];
      return;
    }

    const stroke = this.createStrokeFromData(
      this.rawPointsBuffer,
      {
        colorSettings: cloneColorSettings(this.currentColorSettings),
        volume: this.currentVolume,
        transparency: this.currentTransparency,
        smoothing: this.currentSmoothing,
        profile: this.currentProfile,
        materialPreset: this.currentMaterialPreset,
        materialParams: cloneMaterialParams(this.currentMaterialParams),
        customPresetId: this.currentCustomPresetId,
      },
      'pen',
      true
    );

    this.rawPointsBuffer = [];

    // Automatically open the Inspecteur right after drawing
    this.selectStroke(stroke.id, false);
  }

  private onWheel(e: WheelEvent) {
    if (e.shiftKey) {
      e.preventDefault();
      const delta = Math.sign(e.deltaY) * -0.5;
      this.setDrawingDepth(this.currentDrawingDepth + delta);
    }
  }

  public setDrawingDepth(depth: number) {
    this.currentDrawingDepth = Math.max(-20, Math.min(10, depth));
    this.depthPlaneHelper.position.set(0, 0, this.currentDrawingDepth);
  }

  public getDrawingDepth(): number {
    return this.currentDrawingDepth;
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      let nextTool: ToolType;
      if (this.activeTool === 'navigate') {
        nextTool = this.prevToolBeforeNav;
      } else {
        this.prevToolBeforeNav = this.activeTool;
        nextTool = 'navigate';
      }
      this.setTool(nextTool);
      if (this.callbacks.onToolChange) {
        this.callbacks.onToolChange(nextTool);
      }
    }

    if (e.code === 'Delete' || e.code === 'Backspace') {
      if (this.selectedStrokeIds.size > 0) {
        e.preventDefault();
        this.deleteStrokes(Array.from(this.selectedStrokeIds), true);
      }
    }

    if (e.code === 'Escape') {
      if (this.isPreviewMode) {
        this.setPreviewMode(false);
        if (this.callbacks.onPreviewChange) {
          this.callbacks.onPreviewChange(false);
        }
      } else {
        this.clearSelection(true);
      }
    }
  }

  // -------------------------------------------------------------
  // Stroke Lifecycle, Selection & Property Editing
  // -------------------------------------------------------------

  public createStrokeFromData(
    rawPoints: RawStrokePoint[],
    props: StrokeProperties,
    tool: 'pen',
    pushHistory: boolean = true
  ): StrokeData {
    const id = 'stroke_' + Math.random().toString(36).substring(2, 9);
    const copiedRaw = rawPoints.map((p) => ({ ...p, position: p.position.clone() }));
    const colorSettings = cloneColorSettings(props.colorSettings);
    const materialParams = cloneMaterialParams(props.materialParams);
    materialParams.opacity = props.transparency;

    const { geometry: geo, sampledPoints } = buildStrokeGeometryFromData(
      copiedRaw,
      props.volume,
      props.profile,
      props.smoothing,
      colorSettings,
      false
    );
    const { geometry: hitGeo } = buildStrokeGeometryFromData(
      copiedRaw,
      props.volume,
      props.profile,
      props.smoothing,
      colorSettings,
      true
    );

    const mat = createStrokeMaterial(props.materialPreset, materialParams, tool, true);
    const hitMat = createHitMaterial();

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = id;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const hitMesh = new THREE.Mesh(hitGeo, hitMat);

    this.strokesGroup.add(mesh);
    this.strokesGroup.add(hitMesh);

    const boundingBox = new THREE.Box3().setFromObject(mesh);

    const strokeData: StrokeData = {
      id,
      rawPoints: copiedRaw,
      points: sampledPoints,
      colorSettings,
      volume: props.volume,
      transparency: props.transparency,
      smoothing: props.smoothing,
      profile: props.profile,
      materialPreset: props.materialPreset,
      materialParams,
      customPresetId: props.customPresetId,
      tool,
      mesh,
      hitMesh,
      boundingBox,
    };

    this.strokes.set(id, strokeData);

    if (pushHistory) {
      this.historyManager.push({
        type: 'add_stroke',
        stroke: strokeData,
      });
    }

    this.callbacks.onStrokeCountChange(this.strokes.size);
    return strokeData;
  }

  public selectStroke(id: string, append: boolean = false) {
    if (!append) {
      this.clearSelection(false);
    }

    const stroke = this.strokes.get(id);
    if (!stroke) return;

    this.selectedStrokeIds.add(id);

    if (!stroke.highlightMesh) {
      const highlightMat = createHighlightMaterial(this.currentTheme);
      stroke.highlightMesh = new THREE.Mesh(stroke.mesh.geometry, highlightMat);
      stroke.highlightMesh.scale.multiplyScalar(1.025);
      stroke.highlightMesh.visible = !this.isPreviewMode;
      this.strokesGroup.add(stroke.highlightMesh);
    }

    this.callbacks.onTargetChange({
      type: 'stroke',
      ids: Array.from(this.selectedStrokeIds),
    });
  }

  public deselectStroke(id: string, notify: boolean = true) {
    this.selectedStrokeIds.delete(id);
    const stroke = this.strokes.get(id);
    if (stroke && stroke.highlightMesh) {
      this.strokesGroup.remove(stroke.highlightMesh);
      (stroke.highlightMesh.material as THREE.Material).dispose();
      stroke.highlightMesh = undefined;
    }

    if (!notify) return;

    if (this.selectedStrokeIds.size > 0) {
      this.callbacks.onTargetChange({
        type: 'stroke',
        ids: Array.from(this.selectedStrokeIds),
      });
    } else {
      this.callbacks.onTargetChange(null);
    }
  }

  public clearSelection(notify: boolean = true) {
    this.selectedStrokeIds.forEach((id) => {
      const stroke = this.strokes.get(id);
      if (stroke && stroke.highlightMesh) {
        this.strokesGroup.remove(stroke.highlightMesh);
        (stroke.highlightMesh.material as THREE.Material).dispose();
        stroke.highlightMesh = undefined;
      }
    });
    this.selectedStrokeIds.clear();

    if (notify) {
      this.callbacks.onTargetChange(null);
    }
  }

  public getSelectedStrokes(): StrokeData[] {
    const list: StrokeData[] = [];
    this.selectedStrokeIds.forEach((id) => {
      const s = this.strokes.get(id);
      if (s) list.push(s);
    });
    return list;
  }

  public getAllStrokeIds(): string[] {
    return Array.from(this.strokes.keys());
  }

  public snapshotStrokeProperties(strokeIds: string[]): StrokeProperties[] {
    return strokeIds
      .map((id) => this.strokes.get(id))
      .filter((s): s is StrokeData => Boolean(s))
      .map((s) => ({
        colorSettings: cloneColorSettings(s.colorSettings),
        volume: s.volume,
        transparency: s.transparency,
        smoothing: s.smoothing,
        profile: s.profile,
        materialPreset: s.materialPreset,
        materialParams: cloneMaterialParams(s.materialParams),
        customPresetId: s.customPresetId,
      }));
  }

  public commitStrokeModification(
    strokeIds: string[],
    beforeSnapshots: StrokeProperties[]
  ) {
    const afterSnapshots = this.snapshotStrokeProperties(strokeIds);
    if (strokeIds.length === 0 || beforeSnapshots.length !== afterSnapshots.length) return;

    this.historyManager.push({
      type: 'modify_strokes',
      strokeIds: [...strokeIds],
      before: beforeSnapshots,
      after: afterSnapshots,
    });
  }

  public deleteStrokes(ids: string[], pushHistory: boolean = true) {
    const deletedStrokes: StrokeData[] = [];

    ids.forEach((id) => {
      const stroke = this.strokes.get(id);
      if (stroke) {
        deletedStrokes.push(stroke);
        this.deselectStroke(id, false);
        if (stroke.eraserHighlightMesh) {
          this.strokesGroup.remove(stroke.eraserHighlightMesh);
          (stroke.eraserHighlightMesh.material as THREE.Material).dispose();
          stroke.eraserHighlightMesh = undefined;
        }

        this.strokesGroup.remove(stroke.mesh);
        this.strokesGroup.remove(stroke.hitMesh);
        this.strokes.delete(id);
      }
    });

    if (pushHistory && deletedStrokes.length > 0) {
      this.historyManager.push({
        type: 'delete_strokes',
        strokes: deletedStrokes,
      });
    }

    this.callbacks.onStrokeCountChange(this.strokes.size);
    if (this.selectedStrokeIds.size > 0) {
      this.callbacks.onTargetChange({
        type: 'stroke',
        ids: Array.from(this.selectedStrokeIds),
      });
    } else {
      this.callbacks.onTargetChange(null);
    }
  }

  public restoreStrokes(strokes: StrokeData[]) {
    strokes.forEach((stroke) => {
      this.strokesGroup.add(stroke.mesh);
      this.strokesGroup.add(stroke.hitMesh);
      this.strokes.set(stroke.id, stroke);
    });
    this.callbacks.onStrokeCountChange(this.strokes.size);
  }

  public updateStrokeProperties(
    strokeIds: string[],
    newProps: Partial<StrokeProperties>,
    pushHistory: boolean = false,
    explicitBefore?: StrokeProperties[]
  ) {
    const beforeList = explicitBefore || this.snapshotStrokeProperties(strokeIds);

    strokeIds.forEach((id) => {
      const stroke = this.strokes.get(id);
      if (!stroke) return;

      const geoDirty =
        (newProps.volume !== undefined && newProps.volume !== stroke.volume) ||
        (newProps.profile !== undefined && newProps.profile !== stroke.profile) ||
        (newProps.smoothing !== undefined && newProps.smoothing !== stroke.smoothing);

      const colorDirty = newProps.colorSettings !== undefined;

      const matDirty =
        newProps.materialPreset !== undefined ||
        newProps.materialParams !== undefined ||
        newProps.transparency !== undefined;

      if (newProps.colorSettings !== undefined) {
        stroke.colorSettings = cloneColorSettings(newProps.colorSettings);
      }
      if (newProps.volume !== undefined) stroke.volume = newProps.volume;
      if (newProps.smoothing !== undefined) stroke.smoothing = newProps.smoothing;
      if (newProps.profile !== undefined) stroke.profile = newProps.profile;
      if (newProps.materialPreset !== undefined) stroke.materialPreset = newProps.materialPreset;
      if (newProps.customPresetId !== undefined) stroke.customPresetId = newProps.customPresetId;
      if ('customPresetId' in newProps && newProps.customPresetId === undefined) {
        stroke.customPresetId = undefined;
      }

      if (newProps.materialParams !== undefined) {
        stroke.materialParams = cloneMaterialParams(newProps.materialParams);
        stroke.transparency = stroke.materialParams.opacity;
      } else if (newProps.transparency !== undefined) {
        stroke.transparency = newProps.transparency;
        stroke.materialParams.opacity = newProps.transparency;
      }

      if (geoDirty) {
        const { geometry: newGeo, sampledPoints } = buildStrokeGeometryFromData(
          stroke.rawPoints,
          stroke.volume,
          stroke.profile,
          stroke.smoothing,
          stroke.colorSettings,
          false
        );
        const { geometry: newHitGeo } = buildStrokeGeometryFromData(
          stroke.rawPoints,
          stroke.volume,
          stroke.profile,
          stroke.smoothing,
          stroke.colorSettings,
          true
        );

        stroke.points = sampledPoints;
        stroke.mesh.geometry.dispose();
        stroke.mesh.geometry = newGeo;

        stroke.hitMesh.geometry.dispose();
        stroke.hitMesh.geometry = newHitGeo;

        if (stroke.highlightMesh) {
          stroke.highlightMesh.geometry = newGeo;
        }
        stroke.boundingBox.setFromObject(stroke.mesh);
      } else if (colorDirty) {
        // Fast in-place vertexColor refresh without topology rebuild!
        updateStrokeGeometryColors(stroke.mesh.geometry, stroke.colorSettings);
      }

      if (matDirty) {
        (stroke.mesh.material as THREE.Material).dispose();
        stroke.mesh.material = createStrokeMaterial(
          stroke.materialPreset,
          stroke.materialParams,
          stroke.tool,
          true
        );
      }
    });

    if (pushHistory && strokeIds.length > 0) {
      this.commitStrokeModification(strokeIds, beforeList);
    }
  }

  public applyMaterialToAllStrokes(
    preset: MaterialPreset,
    params: MaterialParams,
    customPresetId?: string
  ) {
    const allIds = this.getAllStrokeIds();
    if (allIds.length === 0) return;

    this.updateStrokeProperties(
      allIds,
      {
        materialPreset: preset,
        materialParams: cloneMaterialParams(params),
        transparency: params.opacity,
        customPresetId,
      },
      true
    );
  }

  public duplicateSelectedStrokes() {
    const selected = this.getSelectedStrokes();
    if (selected.length === 0) return;

    const newIds: string[] = [];
    const offset = new THREE.Vector3(0.5, 0.5, 0.2);

    selected.forEach((stroke) => {
      const duplicatedRaw = stroke.rawPoints.map((p) => ({
        ...p,
        position: p.position.clone().add(offset),
      }));
      const dup = this.createStrokeFromData(
        duplicatedRaw,
        {
          colorSettings: cloneColorSettings(stroke.colorSettings),
          volume: stroke.volume,
          transparency: stroke.transparency,
          smoothing: stroke.smoothing,
          profile: stroke.profile,
          materialPreset: stroke.materialPreset,
          materialParams: cloneMaterialParams(stroke.materialParams),
          customPresetId: stroke.customPresetId,
        },
        stroke.tool,
        true
      );
      newIds.push(dup.id);
    });

    this.clearSelection(false);
    newIds.forEach((id) => this.selectStroke(id, true));
  }

  public focusOnSelected() {
    const selected = this.getSelectedStrokes();
    if (selected.length === 0) return;

    const box = new THREE.Box3();
    selected.forEach((s) => box.union(s.boundingBox));

    const center = new THREE.Vector3();
    box.getCenter(center);
    this.controls.target.copy(center);
    this.camera.lookAt(center);
  }

  public handleResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  // -------------------------------------------------------------
  // Initial Demo Scene
  // -------------------------------------------------------------

  public seedDemoStrokes() {
    const now = performance.now();

    // 1. Tapered cyan->blue->pink gradient glass ribbon curl
    const raw1: RawStrokePoint[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = (i / 40) * Math.PI * 2.2;
      const x = Math.sin(t) * 3.4 - 1.0;
      const y = Math.cos(t) * 2.4 + (i / 40) * 1.5 - 1.0;
      const z = Math.sin(t * 1.5) * 2.0;
      raw1.push({
        position: new THREE.Vector3(x, y, z),
        pressure: 0.75 + 0.25 * Math.sin((i / 40) * Math.PI),
        time: now + i * 16,
      });
    }
    this.createStrokeFromData(
      raw1,
      {
        colorSettings: {
          mode: 'gradient',
          solidColor: '#38bdf8',
          direction: 'length',
          stops: [
            { id: 's1', position: 0, color: '#bbf7d0' },
            { id: 's2', position: 0.5, color: '#3b82f6' },
            { id: 's3', position: 1, color: '#ec4899' },
          ],
        },
        volume: 0.26,
        transparency: 0.92,
        smoothing: 0.5,
        profile: 'tapered',
        materialPreset: 'glass',
        materialParams: getPresetDefaultParams('glass'),
      },
      'pen',
      false
    );

    // 2. Calligraphic flat 45° metallic swoop
    const raw2: RawStrokePoint[] = [];
    for (let i = 0; i <= 34; i++) {
      const u = i / 34;
      const x = -3.6 + u * 7.2;
      const y = Math.sin(u * Math.PI * 1.6) * 2.1 - 0.5;
      const z = Math.cos(u * Math.PI * 1.6) * 2.4;
      raw2.push({
        position: new THREE.Vector3(x, y, z),
        pressure: 0.85,
        time: now + i * 16,
      });
    }
    this.createStrokeFromData(
      raw2,
      {
        colorSettings: createDefaultColorSettings('#ec4899'),
        volume: 0.22,
        transparency: 1.0,
        smoothing: 0.45,
        profile: 'flat',
        materialPreset: 'metallic',
        materialParams: getPresetDefaultParams('metallic'),
      },
      'pen',
      false
    );

    // 3. Rounded cloud coil with hemispherical caps
    const raw3: RawStrokePoint[] = [];
    for (let i = 0; i <= 28; i++) {
      const u = i / 28;
      const x = -2.0 + u * 4.0;
      const y = -2.3 + Math.sin(u * Math.PI * 2) * 0.7;
      const z = 1.0 + Math.cos(u * Math.PI * 2) * 1.1;
      raw3.push({
        position: new THREE.Vector3(x, y, z),
        pressure: 0.9,
        time: now + i * 16,
      });
    }
    this.createStrokeFromData(
      raw3,
      {
        colorSettings: createDefaultColorSettings('#f1f5f9'),
        volume: 0.32,
        transparency: 0.88,
        smoothing: 0.5,
        profile: 'rounded',
        materialPreset: 'cloud',
        materialParams: getPresetDefaultParams('cloud'),
      },
      'pen',
      false
    );
  }

  // -------------------------------------------------------------
  // Export (PNG, OBJ, GLB/GLTF with vertexColors)
  // -------------------------------------------------------------

  public exportPNG(transparent: boolean = false): string {
    const origClearColor = new THREE.Color();
    this.renderer.getClearColor(origClearColor);
    const origClearAlpha = this.renderer.getClearAlpha();

    this.helpersGroup.visible = false;
    this.clearEraserHover();

    const highlightState: Map<string, boolean> = new Map();
    this.strokes.forEach((s) => {
      if (s.highlightMesh) {
        highlightState.set(s.id, s.highlightMesh.visible);
        s.highlightMesh.visible = false;
      }
    });

    if (transparent) {
      this.renderer.setClearColor(0x000000, 0);
    } else {
      this.renderer.setClearColor(this.currentTheme === 'night' ? 0x0e0f14 : 0xffffff, 1.0);
    }

    this.renderer.render(this.scene, this.camera);
    const dataUrl = this.canvas.toDataURL('image/png');

    this.renderer.setClearColor(origClearColor, origClearAlpha);
    if (!this.isPreviewMode) {
      this.helpersGroup.visible = true;
    }
    highlightState.forEach((vis, id) => {
      const s = this.strokes.get(id);
      if (s && s.highlightMesh) s.highlightMesh.visible = vis;
    });

    return dataUrl;
  }

  public exportOBJ(): string {
    let output = '# 3D RAWING Wavefront OBJ Export\n\n';
    let vertexOffset = 1;

    this.strokes.forEach((stroke, idx) => {
      output += `o Stroke_${idx + 1}_${stroke.profile}\n`;
      const geo = stroke.mesh.geometry;
      const posAttr = geo.getAttribute('position');
      const normAttr = geo.getAttribute('normal');
      const indexAttr = geo.getIndex();

      if (!posAttr) return;

      for (let i = 0; i < posAttr.count; i++) {
        output += `v ${posAttr.getX(i).toFixed(4)} ${posAttr.getY(i).toFixed(4)} ${posAttr.getZ(i).toFixed(4)}\n`;
      }

      if (normAttr) {
        for (let i = 0; i < normAttr.count; i++) {
          output += `vn ${normAttr.getX(i).toFixed(4)} ${normAttr.getY(i).toFixed(4)} ${normAttr.getZ(i).toFixed(4)}\n`;
        }
      }

      if (indexAttr) {
        for (let i = 0; i < indexAttr.count; i += 3) {
          const a = indexAttr.getX(i) + vertexOffset;
          const b = indexAttr.getX(i + 1) + vertexOffset;
          const c = indexAttr.getX(i + 2) + vertexOffset;
          output += `f ${a}//${a} ${b}//${b} ${c}//${c}\n`;
        }
      }

      vertexOffset += posAttr.count;
      output += '\n';
    });

    return output;
  }

  /**
   * Exports all 3D strokes (preserving per-vertex colors & PBR materials) as binary .glb.
   */
  public exportGLTF(): Promise<ArrayBuffer> {
    const exporter = new GLTFExporter();
    const exportGroup = new THREE.Group();
    exportGroup.name = '3D_RAWING_Scene';

    this.strokes.forEach((stroke) => {
      const cloneMesh = new THREE.Mesh(stroke.mesh.geometry, stroke.mesh.material);
      cloneMesh.name = stroke.id;
      exportGroup.add(cloneMesh);
    });

    return new Promise((resolve, reject) => {
      exporter.parse(
        exportGroup,
        (result) => {
          if (result instanceof ArrayBuffer) {
            resolve(result);
          } else {
            const jsonStr = JSON.stringify(result);
            resolve(new TextEncoder().encode(jsonStr).buffer);
          }
        },
        (error) => reject(error),
        { binary: true }
      );
    });
  }

  private animate = () => {
    if (this.isDisposed) return;
    this.animationFrameId = requestAnimationFrame(this.animate);

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  public dispose() {
    this.isDisposed = true;
    cancelAnimationFrame(this.animationFrameId);

    this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
    window.removeEventListener('pointermove', this.boundPointerMove);
    window.removeEventListener('pointerup', this.boundPointerUp);
    this.canvas.removeEventListener('wheel', this.boundWheel);
    window.removeEventListener('keydown', this.boundKeyDown);

    this.controls.dispose();
    this.renderer.dispose();
    if (this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
  }
}
