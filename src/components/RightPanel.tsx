/**
 * @file RightPanel.tsx
 * Floating, Draggable Right Inspecteur Card for 3D RAWING.
 * Features:
 *  - Hidden by default; opens automatically after drawing a stroke or clicking a stroke.
 *  - Draggable via header grip (GripHorizontal) within viewport bounds.
 *  - Stroke Inspector:
 *     1. PINCEAUX: 8 distinct 3D brush presets with minimalist line-art SVG previews, blue active ring
 *     2. VOLUME & LISSAGE sliders (with "—" mixed-value indicator for multi-selection)
 *     3. MATÉRIAUX: MaterialEditor with minimalist line-art icons, custom presets & live sliders
 *     4. COULEURS: GradientEditor with Uni / Dégradé multi-stop bar
 *     5. Actions: Duplicate, Focus, Delete
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  Focus,
  GripHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import {
  BrushProfile,
  ColorSettings,
  MaterialParams,
  MaterialPreset,
  SelectedTarget,
  StrokeData,
  StrokeProperties,
  ThemeMode,
} from '../types';
import {
  areMaterialParamsEqual,
  getPresetDefaultParams,
} from '../engine/materials';
import { areColorSettingsEqual } from '../utils/color';
import { MaterialEditor } from './MaterialEditor';
import { GradientEditor } from './GradientEditor';

interface RightPanelProps {
  selectedTarget: SelectedTarget;
  selectedStrokes: StrokeData[];
  onUpdateStrokeProperties: (
    props: Partial<StrokeProperties>,
    commitHistory: boolean
  ) => void;
  onBeginStrokeEdit: () => void;
  onResetStrokeMaterial: () => void;
  onApplyMaterialToAll: (
    preset: MaterialPreset,
    params: MaterialParams,
    customId?: string
  ) => void;
  onDuplicateStrokes: () => void;
  onDeleteStrokes: () => void;
  onFocusSelected: () => void;
  onClose: () => void;
  theme: ThemeMode;
}

const BRUSH_META: { id: BrushProfile; label: string; title: string }[] = [
  { id: 'tapered', label: 'Pointu', title: 'Pinceau fuselé (pointu aux extrémités)' },
  { id: 'rounded', label: 'Rond', title: 'Pinceau rond constant avec bouts hémisphériques' },
  { id: 'flat', label: 'Plat', title: 'Pinceau plat / calligraphique à 45°' },
  { id: 'ribbon', label: 'Ruban', title: 'Ruban plat souple suivant la courbe 3D' },
  { id: 'square', label: 'Carré', title: 'Prisme carré extrudé le long du tracé' },
  { id: 'star', label: 'Étoile', title: 'Profil en étoile à 5 branches sculptées' },
  { id: 'twisted', label: 'Torsadé', title: 'Cordon torsadé hélicoïdal en 3D' },
  { id: 'beaded', label: 'Perlé', title: 'Chaîne de perles sculptées le long du trait' },
];

const BrushProfileIcon: React.FC<{ profile: BrushProfile }> = ({ profile }) => {
  const common = {
    width: 40,
    height: 16,
    viewBox: '0 0 44 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'overflow-visible',
  };

  switch (profile) {
    case 'tapered':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M2.5 8 Q22 2.2 41.5 8 Q22 13.8 2.5 8 Z" />
        </svg>
      );
    case 'rounded':
      return (
        <svg {...common} aria-hidden="true">
          <rect x="4" y="4.5" width="36" height="7" rx="3.5" />
        </svg>
      );
    case 'flat':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M5.5 11.5 L11 4.5 H38.5 L33 11.5 Z" />
        </svg>
      );
    case 'ribbon':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M3 9.5 C11 3 21 12.5 29.5 6 C34 2.5 38 4.5 41 6.5" />
          <path d="M3 12.5 C11 6 21 15.5 29.5 9 C34 5.5 38 7.5 41 9.5" />
          <path d="M3 9.5 V12.5 M41 6.5 V9.5" />
        </svg>
      );
    case 'square':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4.5 6 L9 3.5 H39.5 L35 6 Z" />
          <path d="M4.5 6 V12.5 H35 V6" />
          <path d="M35 12.5 L39.5 10 V3.5" />
        </svg>
      );
    case 'star':
      return (
        <svg {...common} aria-hidden="true">
          <polygon points="10,2.5 11.8,6.1 15.8,6.7 12.9,9.5 13.6,13.4 10,11.5 6.4,13.4 7.1,9.5 4.2,6.7 8.2,6.1" />
          <path d="M19.5 5.2 H40.5 M20.5 8 H40.5 M19.5 10.8 H40.5" />
        </svg>
      );
    case 'twisted':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M3.5 8 Q9.5 2.5 15.5 8 T27.5 8 T39.5 8" />
          <path d="M3.5 8 Q9.5 13.5 15.5 8 T27.5 8 T39.5 8" />
        </svg>
      );
    case 'beaded':
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="7.5" cy="8" r="3" />
          <circle cx="17" cy="8" r="3" />
          <circle cx="26.5" cy="8" r="3" />
          <circle cx="36" cy="8" r="3" />
          <path d="M10.5 8 H14 M20 8 H23.5 M29.5 8 H33" />
        </svg>
      );
  }
};

export const RightPanel: React.FC<RightPanelProps> = ({
  selectedTarget,
  selectedStrokes,
  onUpdateStrokeProperties,
  onBeginStrokeEdit,
  onResetStrokeMaterial,
  onApplyMaterialToAll,
  onDuplicateStrokes,
  onDeleteStrokes,
  onFocusSelected,
  onClose,
  theme,
}) => {
  const isStrokeEditMode =
    selectedTarget?.type === 'stroke' && selectedStrokes.length > 0;
  const isOpen = isStrokeEditMode;

  const isNight = theme === 'night';
  const panelBg = isNight
    ? 'bg-[#14151a] text-white border-neutral-700'
    : 'bg-white text-black border-black';
  const subBg = isNight
    ? 'bg-[#1b1d24] border-neutral-800'
    : 'bg-neutral-50 border-black';
  const borderLine = isNight ? 'border-neutral-800' : 'border-black';
  const borderMuted = isNight ? 'border-neutral-700' : 'border-neutral-300';

  // Draggable floating card offset
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const isDraggingCardRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ mx: number; my: number; ox: number; oy: number }>({
    mx: 0,
    my: 0,
    ox: 0,
    oy: 0,
  });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!isDraggingCardRef.current) return;
      const dx = e.clientX - dragStartRef.current.mx;
      const dy = e.clientY - dragStartRef.current.my;
      setDragOffset({
        x: Math.max(-window.innerWidth + 360, Math.min(12, dragStartRef.current.ox + dx)),
        y: Math.max(-44, Math.min(window.innerHeight - 220, dragStartRef.current.oy + dy)),
      });
    };

    const onUp = () => {
      isDraggingCardRef.current = false;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  // Compute unified or mixed stroke properties across selection
  const resolved = useMemo(() => {
    if (selectedStrokes.length === 0) {
      return null;
    }

    const first = selectedStrokes[0];
    let profile: BrushProfile | 'mixed' = first.profile;
    let volume: number | 'mixed' = first.volume;
    let smoothing: number | 'mixed' = first.smoothing;
    let materialPreset: MaterialPreset | 'mixed' = first.materialPreset;
    let materialParams: MaterialParams | 'mixed' = first.materialParams;
    let customPresetId: string | undefined = first.customPresetId;
    let colorSettings: ColorSettings | 'mixed' = first.colorSettings;

    for (let i = 1; i < selectedStrokes.length; i++) {
      const s = selectedStrokes[i];
      if (profile !== 'mixed' && s.profile !== profile) profile = 'mixed';
      if (volume !== 'mixed' && Math.abs(s.volume - volume) > 0.005) volume = 'mixed';
      if (smoothing !== 'mixed' && Math.abs(s.smoothing - smoothing) > 0.005)
        smoothing = 'mixed';
      if (materialPreset !== 'mixed' && s.materialPreset !== materialPreset)
        materialPreset = 'mixed';
      if (
        materialParams !== 'mixed' &&
        !areMaterialParamsEqual(s.materialParams, materialParams)
      ) {
        materialParams = 'mixed';
      }
      if (customPresetId !== s.customPresetId) customPresetId = undefined;
      if (
        colorSettings !== 'mixed' &&
        !areColorSettingsEqual(s.colorSettings, colorSettings)
      ) {
        colorSettings = 'mixed';
      }
    }

    return {
      profile,
      volume,
      smoothing,
      materialPreset,
      materialParams,
      customPresetId,
      colorSettings,
    };
  }, [selectedStrokes]);

  if (!isOpen) return null;

  const handleStrokePropChange = (
    props: Partial<StrokeProperties>,
    commitHistory: boolean
  ) => {
    onUpdateStrokeProperties(props, commitHistory);
  };

  return (
    <aside
      style={{
        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
      }}
      className={`fixed top-16 right-4 w-[305px] sm:w-[335px] max-h-[calc(100vh-110px)] rounded-[22px] border ${panelBg} flex flex-col z-40 shadow-2xl overflow-hidden select-none`}
    >
      {/* Draggable Floating Card Header */}
      <div
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          isDraggingCardRef.current = true;
          dragStartRef.current = {
            mx: e.clientX,
            my: e.clientY,
            ox: dragOffset.x,
            oy: dragOffset.y,
          };
        }}
        className={`flex items-center justify-between px-4 py-3 border-b ${subBg} shrink-0 cursor-grab active:cursor-grabbing`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripHorizontal size={14} className="opacity-45 shrink-0" />
          <span className="text-xs font-extrabold tracking-[0.06em] uppercase font-display truncate">
            INSPECTEUR
          </span>
          {isStrokeEditMode && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-current/30 font-mono-code shrink-0">
              {selectedStrokes.length > 1
                ? `${selectedStrokes.length} traits`
                : '1 trait'}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          title="Fermer (Échap ou clic dans le vide)"
          className="w-6 h-6 rounded-full flex items-center justify-center hover:opacity-70 transition-opacity cursor-pointer"
        >
          <X size={15} strokeWidth={2} />
        </button>
      </div>

      {/* STROKE INSPECTOR BODY */}
      {isStrokeEditMode && resolved && (
        <>
          <div className="flex-1 overflow-y-auto">
            {/* 1. PINCEAUX (8 distinct 3D stroke profile styles with minimalist SVG previews) */}
            <section className={`px-4 py-3.5 border-b ${borderLine}`}>
              <div className="flex items-center justify-between mb-2.5">
                <label className="text-xs font-extrabold tracking-[0.06em] uppercase font-display">
                  PINCEAUX
                </label>
                {resolved.profile === 'mixed' && (
                  <span className="text-[10px] font-mono-code px-1.5 py-0.5 rounded border border-current/30 opacity-75">
                    —
                  </span>
                )}
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {BRUSH_META.map((b) => {
                  const isActive = resolved.profile === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      title={b.title}
                      onClick={() => {
                        onBeginStrokeEdit();
                        handleStrokePropChange({ profile: b.id }, true);
                      }}
                      className={`py-1.5 px-1 rounded-[12px] border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                        isActive
                          ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : `${borderMuted} hover:border-current`
                      }`}
                    >
                      <BrushProfileIcon profile={b.id} />
                      <span className="text-[9px] font-semibold leading-tight">{b.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 2. VOLUME & LISSAGE */}
            <section className={`px-4 py-3.5 border-b ${borderLine} space-y-3`}>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-extrabold tracking-[0.06em] uppercase font-display">
                    VOLUME
                  </label>
                  <span className="text-[10px] opacity-75 font-mono-code">
                    {resolved.volume === 'mixed'
                      ? '—'
                      : resolved.volume.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.04"
                  max="0.80"
                  step="0.01"
                  value={resolved.volume === 'mixed' ? 0.22 : resolved.volume}
                  onPointerDown={() => {
                    onBeginStrokeEdit();
                  }}
                  onChange={(e) =>
                    handleStrokePropChange(
                      { volume: parseFloat(e.target.value) },
                      false
                    )
                  }
                  onPointerUp={() => handleStrokePropChange({}, true)}
                  className="minimal-slider"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-extrabold tracking-[0.06em] uppercase font-display">
                    LISSAGE
                  </label>
                  <span className="text-[10px] opacity-75 font-mono-code">
                    {resolved.smoothing === 'mixed'
                      ? '—'
                      : `${Math.round(resolved.smoothing * 100)}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.02"
                  value={resolved.smoothing === 'mixed' ? 0.45 : resolved.smoothing}
                  onPointerDown={() => {
                    onBeginStrokeEdit();
                  }}
                  onChange={(e) =>
                    handleStrokePropChange(
                      { smoothing: parseFloat(e.target.value) },
                      false
                    )
                  }
                  onPointerUp={() => handleStrokePropChange({}, true)}
                  className="minimal-slider"
                />
              </div>
            </section>

            {/* 3. MATÉRIAUX (Minimalist Line-Art Icons + Editable Parameters) */}
            <section className={`px-4 py-3.5 border-b ${borderLine}`}>
              <MaterialEditor
                preset={resolved.materialPreset}
                params={resolved.materialParams}
                customPresetId={resolved.customPresetId}
                theme={theme}
                showApplyToAll={selectedStrokes.length > 0}
                onBeginEdit={() => {
                  onBeginStrokeEdit();
                }}
                onSelectPreset={(preset, params, customId) => {
                  handleStrokePropChange(
                    {
                      materialPreset: preset,
                      materialParams: params,
                      transparency: params.opacity,
                      customPresetId: customId,
                    },
                    true
                  );
                }}
                onChangeParams={(partial, commit) => {
                  const baseParams =
                    resolved.materialParams === 'mixed'
                      ? getPresetDefaultParams(
                          resolved.materialPreset === 'mixed'
                            ? 'standard'
                            : resolved.materialPreset
                        )
                      : resolved.materialParams;

                  const merged: MaterialParams = { ...baseParams, ...partial };
                  handleStrokePropChange(
                    {
                      materialParams: merged,
                      transparency: merged.opacity,
                      customPresetId: undefined,
                    },
                    commit
                  );
                }}
                onResetPreset={onResetStrokeMaterial}
                onApplyToAll={() => {
                  const p =
                    resolved.materialPreset === 'mixed'
                      ? 'standard'
                      : resolved.materialPreset;
                  const mp =
                    resolved.materialParams === 'mixed'
                      ? getPresetDefaultParams(p)
                      : resolved.materialParams;
                  onApplyMaterialToAll(p, mp, resolved.customPresetId);
                }}
              />
            </section>

            {/* 4. COULEURS (Uni & Dégradé Multi-Stop) */}
            <section className="px-4 py-3.5">
              <GradientEditor
                value={resolved.colorSettings}
                theme={theme}
                onBeginEdit={() => {
                  onBeginStrokeEdit();
                }}
                onChange={(nextColorSettings, commit) => {
                  handleStrokePropChange({ colorSettings: nextColorSettings }, commit);
                }}
              />
            </section>
          </div>

          {/* Bottom Actions (for selected strokes) */}
          {isStrokeEditMode && (
            <div
              className={`p-3.5 border-t ${subBg} flex items-center justify-between gap-2 shrink-0`}
            >
              <button
                type="button"
                onClick={onDuplicateStrokes}
                title="Dupliquer la sélection"
                className={`flex-1 h-8 rounded-lg border ${borderMuted} hover:border-current flex items-center justify-center gap-1.5 text-[10px] font-bold tracking-wider uppercase hover:opacity-80 cursor-pointer transition-colors`}
              >
                <Copy size={12} />
                <span>Dupliquer</span>
              </button>

              <button
                type="button"
                onClick={onFocusSelected}
                title="Centrer la caméra sur la sélection"
                className={`w-8 h-8 rounded-lg border ${borderMuted} hover:border-current flex items-center justify-center hover:opacity-80 cursor-pointer transition-colors`}
              >
                <Focus size={13} />
              </button>

              <button
                type="button"
                onClick={onDeleteStrokes}
                title="Supprimer (Suppr)"
                className="w-8 h-8 rounded-lg border border-red-400 text-red-500 hover:bg-red-500/10 flex items-center justify-center cursor-pointer transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </>
      )}
    </aside>
  );
};
