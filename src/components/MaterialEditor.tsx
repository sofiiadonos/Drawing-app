/**
 * @file MaterialEditor.tsx
 * Editable PBR Material Swatches & Live Parameter Editor for 3D RAWING.
 * Features:
 *  - Minimalist monochrome line-art SVG icons for all built-in & custom presets
 *  - Expandable "Modifier le matériau" live controls (Rugosité, Métallicité, Opacité,
 *    Transmission/Épaisseur/IOR for Glass, Émission, Vernis/Clearcoat, Velours/Sheen)
 *  - Save custom preset to localStorage, rename inline, delete custom preset
 *  - Reset to preset defaults & Apply material to all strokes
 */

import React, { useState } from 'react';
import {
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronRight,
  Layers,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  CustomMaterialPreset,
  MaterialParams,
  MaterialPreset,
  ThemeMode,
} from '../types';
import {
  cloneMaterialParams,
  getPresetDefaultParams,
  loadCustomPresets,
  MATERIAL_PRESET_META,
  saveCustomPresets,
} from '../engine/materials';

interface MaterialEditorProps {
  preset: MaterialPreset | 'mixed';
  params: MaterialParams | 'mixed';
  customPresetId?: string;
  theme: ThemeMode;
  showApplyToAll?: boolean;
  onSelectPreset: (
    preset: MaterialPreset,
    params: MaterialParams,
    customId?: string
  ) => void;
  onChangeParams: (partial: Partial<MaterialParams>, commitHistory: boolean) => void;
  onBeginEdit: () => void;
  onResetPreset: () => void;
  onApplyToAll?: () => void;
}

const MaterialLineIcon: React.FC<{
  preset: MaterialPreset;
  size?: number;
}> = ({ preset, size = 18 }) => {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'shrink-0',
  };

  switch (preset) {
    case 'matte':
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M6.5 14.5h11" />
          <path d="M8.5 17.5h7" />
        </svg>
      );
    case 'glossy':
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="11.5" cy="12.5" r="8" />
          <path d="M8 9.5a4.5 4.5 0 0 1 4.5-2" />
          <path d="M18.5 3.5v3M17 5h3" />
        </svg>
      );
    case 'metallic':
      return (
        <svg {...common} aria-hidden="true">
          <polygon points="12,3.5 19.5,7.8 19.5,16.2 12,20.5 4.5,16.2 4.5,7.8" />
          <path d="M8.5 15.5l7-7" />
          <path d="M11.5 16.5l5-5" />
        </svg>
      );
    case 'glass':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 3.5L20 10.5L12 20.5L4 10.5Z" />
          <path d="M4 10.5h16" />
          <path d="M12 3.5L9 10.5L12 20.5" />
        </svg>
      );
    case 'cloud':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M7.5 18h9.5a3.8 3.8 0 0 0 .5-7.55A5.2 5.2 0 0 0 7.3 9.2 4.2 4.2 0 0 0 7.5 18z" />
        </svg>
      );
    case 'standard':
    default:
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <ellipse cx="12" cy="12" rx="8.5" ry="3.2" />
        </svg>
      );
  }
};

export const MaterialEditor: React.FC<MaterialEditorProps> = ({
  preset,
  params,
  customPresetId,
  theme,
  showApplyToAll = true,
  onSelectPreset,
  onChangeParams,
  onBeginEdit,
  onResetPreset,
  onApplyToAll,
}) => {
  const isNight = theme === 'night';
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [customPresets, setCustomPresets] = useState<CustomMaterialPreset[]>(() =>
    loadCustomPresets()
  );

  // Inline save-as-preset state (no window.prompt)
  const [isSavingNew, setIsSavingNew] = useState<boolean>(false);
  const [newPresetName, setNewPresetName] = useState<string>('');

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<string>('');

  const isMixedPreset = preset === 'mixed';
  const isMixedParams = params === 'mixed';
  const effectivePreset: MaterialPreset = isMixedPreset ? 'standard' : preset;
  const effectiveParams: MaterialParams = isMixedParams
    ? getPresetDefaultParams(effectivePreset)
    : params;

  const handleSaveCustomPreset = () => {
    const trimmed = newPresetName.trim();
    if (!trimmed) return;

    const newItem: CustomMaterialPreset = {
      id: 'mat_' + Math.random().toString(36).slice(2, 8),
      name: trimmed,
      basePreset: effectivePreset,
      params: cloneMaterialParams(effectiveParams),
    };

    const next = [...customPresets, newItem];
    setCustomPresets(next);
    saveCustomPresets(next);
    setNewPresetName('');
    setIsSavingNew(false);
    onSelectPreset(newItem.basePreset, newItem.params, newItem.id);
  };

  const handleDeleteCustomPreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = customPresets.filter((p) => p.id !== id);
    setCustomPresets(next);
    saveCustomPresets(next);
  };

  const handleCommitRename = (id: string) => {
    const trimmed = renameDraft.trim();
    if (trimmed) {
      const next = customPresets.map((p) =>
        p.id === id ? { ...p, name: trimmed } : p
      );
      setCustomPresets(next);
      saveCustomPresets(next);
    }
    setRenamingId(null);
  };

  const borderMuted = isNight ? 'border-neutral-700' : 'border-neutral-300';
  const cardBg = isNight ? 'bg-neutral-800/60' : 'bg-neutral-50';
  const showGlassParams =
    effectivePreset === 'glass' || effectiveParams.transmission > 0.01;

  const renderSliderRow = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    format: (v: number) => string,
    keyName: keyof MaterialParams
  ) => (
    <div className="space-y-0.5">
      <div className="flex justify-between items-center text-[10px]">
        <span className="font-medium opacity-80">{label}</span>
        <span className="font-mono-code font-semibold opacity-80">
          {isMixedParams ? '—' : format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onBeginEdit}
        onChange={(e) =>
          onChangeParams({ [keyName]: parseFloat(e.target.value) }, false)
        }
        onPointerUp={() => onChangeParams({}, true)}
        className="minimal-slider"
      />
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-extrabold tracking-[0.06em] uppercase font-display">
            MATÉRIAUX
          </span>
          {(isMixedPreset || isMixedParams) && (
            <span className="text-[10px] font-mono-code px-1.5 py-0.5 rounded border border-current/30 opacity-75">
              —
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${borderMuted} hover:border-blue-500 transition-colors cursor-pointer`}
        >
          {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          <span>Modifier le matériau</span>
        </button>
      </div>

      {/* Built-in Presets Grid (Minimalist Monochrome Line-Art Icons) */}
      <div className="grid grid-cols-3 gap-1.5">
        {MATERIAL_PRESET_META.map((meta) => {
          const isSelected = !isMixedPreset && preset === meta.id && !customPresetId;
          return (
            <button
              key={meta.id}
              type="button"
              title={meta.description}
              onClick={() => {
                onBeginEdit();
                onSelectPreset(meta.id, getPresetDefaultParams(meta.id), undefined);
              }}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-[12px] border text-left transition-all cursor-pointer ${
                isSelected
                  ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : `${borderMuted} hover:border-current`
              }`}
            >
              <MaterialLineIcon preset={meta.id} size={16} />
              <span className="text-[10px] font-semibold truncate">{meta.label}</span>
            </button>
          );
        })}
      </div>

      {/* Custom Saved Presets */}
      {customPresets.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[9px] font-bold tracking-wider uppercase opacity-60 block">
            Mes présets enregistrés
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {customPresets.map((cp) => {
              const isSelected = !isMixedPreset && customPresetId === cp.id;

              if (renamingId === cp.id) {
                return (
                  <div
                    key={cp.id}
                    className={`flex items-center gap-1 p-1 rounded-[10px] border border-blue-500 ${cardBg}`}
                  >
                    <input
                      type="text"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCommitRename(cp.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      autoFocus
                      className="flex-1 min-w-0 text-[10px] px-1 py-0.5 bg-transparent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleCommitRename(cp.id)}
                      className="text-blue-500 hover:opacity-80 cursor-pointer"
                    >
                      <Check size={11} />
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={cp.id}
                  onClick={() => {
                    onBeginEdit();
                    onSelectPreset(
                      cp.basePreset,
                      cloneMaterialParams(cp.params),
                      cp.id
                    );
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onBeginEdit();
                      onSelectPreset(
                        cp.basePreset,
                        cloneMaterialParams(cp.params),
                        cp.id
                      );
                    }
                  }}
                  className={`group flex items-center justify-between gap-1 p-1.5 rounded-[10px] border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-500/10'
                      : `${borderMuted} hover:border-current`
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <MaterialLineIcon preset={cp.basePreset} size={15} />
                    <span className="text-[10px] font-semibold truncate">{cp.name}</span>
                  </div>

                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      type="button"
                      title="Renommer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(cp.id);
                        setRenameDraft(cp.name);
                      }}
                      className="p-0.5 hover:text-blue-500 cursor-pointer"
                    >
                      <Pencil size={10} />
                    </button>
                    <button
                      type="button"
                      title="Supprimer ce préset"
                      onClick={(e) => handleDeleteCustomPreset(cp.id, e)}
                      className="p-0.5 hover:text-red-500 cursor-pointer"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Expandable Material Parameter Editor */}
      {isExpanded && (
        <div className={`p-3 rounded-[14px] border ${borderMuted} ${cardBg} space-y-2.5`}>
          {renderSliderRow(
            'Rugosité',
            effectiveParams.roughness,
            0.02,
            1.0,
            0.01,
            (v) => `${Math.round(v * 100)}%`,
            'roughness'
          )}

          {renderSliderRow(
            'Métallicité',
            effectiveParams.metalness,
            0.0,
            1.0,
            0.01,
            (v) => `${Math.round(v * 100)}%`,
            'metalness'
          )}

          {renderSliderRow(
            'Transparence / Opacité',
            effectiveParams.opacity,
            0.05,
            1.0,
            0.01,
            (v) => `${Math.round(v * 100)}%`,
            'opacity'
          )}

          {/* Glass-specific parameters */}
          {showGlassParams && (
            <div className={`pt-2 border-t ${borderMuted} space-y-2.5`}>
              <span className="text-[9px] font-bold uppercase tracking-wider text-sky-500 block">
                Optique & Réfraction (Verre)
              </span>
              {renderSliderRow(
                'Transmission',
                effectiveParams.transmission,
                0.0,
                1.0,
                0.01,
                (v) => `${Math.round(v * 100)}%`,
                'transmission'
              )}
              {renderSliderRow(
                'Épaisseur',
                effectiveParams.thickness,
                0.0,
                4.0,
                0.05,
                (v) => `${v.toFixed(2)}`,
                'thickness'
              )}
              {renderSliderRow(
                'Indice IOR',
                effectiveParams.ior,
                1.0,
                2.4,
                0.02,
                (v) => `${v.toFixed(2)}`,
                'ior'
              )}
            </div>
          )}

          {/* Emission (Color + Intensity) */}
          <div className={`pt-2 border-t ${borderMuted} space-y-2`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium opacity-80">Émission lumineuse</span>
              <div className="flex items-center gap-1.5">
                <label
                  className={`w-5 h-5 rounded-full border ${borderMuted} overflow-hidden cursor-pointer relative`}
                  style={{ backgroundColor: effectiveParams.emissive }}
                  title="Couleur d'émission"
                >
                  <input
                    type="color"
                    value={effectiveParams.emissive}
                    onPointerDown={onBeginEdit}
                    onChange={(e) => onChangeParams({ emissive: e.target.value }, false)}
                    onBlur={() => onChangeParams({}, true)}
                    className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                  />
                </label>
                <span className="text-[10px] font-mono-code opacity-80">
                  {isMixedParams ? '—' : effectiveParams.emissiveIntensity.toFixed(2)}
                </span>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={3}
              step={0.05}
              value={effectiveParams.emissiveIntensity}
              onPointerDown={onBeginEdit}
              onChange={(e) =>
                onChangeParams(
                  { emissiveIntensity: parseFloat(e.target.value) },
                  false
                )
              }
              onPointerUp={() => onChangeParams({}, true)}
              className="minimal-slider"
            />
          </div>

          {/* Clearcoat & Sheen */}
          <div className={`pt-2 border-t ${borderMuted} space-y-2`}>
            {renderSliderRow(
              'Vernis (Clearcoat)',
              effectiveParams.clearcoat,
              0.0,
              1.0,
              0.02,
              (v) => `${Math.round(v * 100)}%`,
              'clearcoat'
            )}
            {renderSliderRow(
              'Velours (Sheen)',
              effectiveParams.sheen,
              0.0,
              1.0,
              0.02,
              (v) => `${Math.round(v * 100)}%`,
              'sheen'
            )}
          </div>

          {/* Save Custom Preset Inline Form or Action Buttons */}
          <div className={`pt-2 border-t ${borderMuted} space-y-2`}>
            {isSavingNew ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveCustomPreset();
                    if (e.key === 'Escape') setIsSavingNew(false);
                  }}
                  placeholder="Nom du préset..."
                  autoFocus
                  className={`flex-1 min-w-0 text-[10px] px-2 py-1 rounded border ${borderMuted} bg-transparent focus:outline-none focus:border-blue-500`}
                />
                <button
                  type="button"
                  onClick={handleSaveCustomPreset}
                  className="px-2 py-1 rounded bg-blue-500 text-white text-[10px] font-bold cursor-pointer hover:bg-blue-600"
                >
                  OK
                </button>
                <button
                  type="button"
                  onClick={() => setIsSavingNew(false)}
                  className="p-1 opacity-60 hover:opacity-100 cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsSavingNew(true)}
                  className={`flex-1 py-1.5 px-2 rounded-lg border ${borderMuted} hover:border-current text-[10px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors`}
                >
                  <BookmarkPlus size={11} />
                  <span>Enregistrer préset</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onBeginEdit();
                    onResetPreset();
                  }}
                  title="Réinitialiser les paramètres du préset"
                  className={`py-1.5 px-2 rounded-lg border ${borderMuted} hover:border-current text-[10px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors`}
                >
                  <RotateCcw size={11} />
                  <span>Réinitialiser</span>
                </button>
              </div>
            )}

            {showApplyToAll && onApplyToAll && (
              <button
                type="button"
                onClick={onApplyToAll}
                className={`w-full py-1.5 px-2 rounded-lg border ${borderMuted} hover:border-blue-500 hover:text-blue-500 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-colors`}
              >
                <Layers size={11} />
                <span>Appliquer à tous les traits</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
