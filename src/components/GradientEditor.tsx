/**
 * @file GradientEditor.tsx
 * Interactive Color & Multi-Stop Gradient Editor for 3D RAWING.
 * Supports:
 *  - Uni (solid) mode: 6 quick swatches, spectrum slider, native color picker & hex input
 *  - Dégradé (gradient) mode: interactive bar with 2-5 draggable stops (click to add,
 *    drag vertically out to remove), direction toggle (Longueur / Largeur), Invert button,
 *    and built-in gradient presets.
 *  - Mixed-value ("—") awareness for multi-selection.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Plus, Trash2 } from 'lucide-react';
import { ColorMode, ColorSettings, GradientStop, ThemeMode } from '../types';
import {
  colorToGradientPosition,
  createDefaultColorSettings,
  evaluateGradientHex,
  GRADIENT_PRESETS,
  invertGradientStops,
  isValidHex,
  QUICK_SOLID_SWATCHES,
  sampleGradient,
  sortStops,
  stopsToCssGradient,
} from '../utils/color';

interface GradientEditorProps {
  value: ColorSettings | 'mixed';
  onChange: (next: ColorSettings, commitHistory: boolean) => void;
  onBeginEdit: () => void;
  theme: ThemeMode;
}

export const GradientEditor: React.FC<GradientEditorProps> = ({
  value,
  onChange,
  onBeginEdit,
  theme,
}) => {
  const isMixed = value === 'mixed';
  const current: ColorSettings = isMixed ? createDefaultColorSettings('#3b82f6') : value;
  const isNight = theme === 'night';

  const [selectedStopId, setSelectedStopId] = useState<string>(
    current.stops[0]?.id || 'stop_1'
  );
  const [hexDraft, setHexDraft] = useState<string>(
    isMixed ? '' : current.solidColor.toUpperCase()
  );
  const [stopHexDraft, setStopHexDraft] = useState<string>('');
  const [draggingStopId, setDraggingStopId] = useState<string | null>(null);
  const [willRemoveOnDrop, setWillRemoveOnDrop] = useState<boolean>(false);

  const barRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<ColorSettings>(current);
  currentRef.current = current;

  const activeStop =
    current.stops.find((s) => s.id === selectedStopId) || current.stops[0];

  // Keep hex drafts synced with external changes
  useEffect(() => {
    setHexDraft(isMixed ? '' : current.solidColor.toUpperCase());
  }, [isMixed, current.solidColor]);

  useEffect(() => {
    if (activeStop) {
      setStopHexDraft(activeStop.color.toUpperCase());
    }
  }, [activeStop?.id, activeStop?.color]);

  // Drag stop horizontally or pull vertically to remove
  useEffect(() => {
    if (!draggingStopId) return;

    const handleMove = (e: PointerEvent) => {
      const bar = barRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));

      const distOutsideY =
        e.clientY < rect.top
          ? rect.top - e.clientY
          : e.clientY > rect.bottom
          ? e.clientY - rect.bottom
          : 0;

      const canRemove = currentRef.current.stops.length > 2;
      const removing = canRemove && distOutsideY > 26;
      setWillRemoveOnDrop(removing);

      const nextStops = sortStops(
        currentRef.current.stops.map((s) =>
          s.id === draggingStopId ? { ...s, position: pos } : s
        )
      );
      onChange({ ...currentRef.current, stops: nextStops }, false);
    };

    const handleUp = (e: PointerEvent) => {
      const bar = barRef.current;
      const rect = bar?.getBoundingClientRect();
      const distOutsideY = rect
        ? e.clientY < rect.top
          ? rect.top - e.clientY
          : e.clientY > rect.bottom
          ? e.clientY - rect.bottom
          : 0
        : 0;

      const canRemove = currentRef.current.stops.length > 2;
      if (canRemove && distOutsideY > 26) {
        const filtered = currentRef.current.stops.filter((s) => s.id !== draggingStopId);
        setSelectedStopId(filtered[0]?.id || '');
        onChange({ ...currentRef.current, stops: sortStops(filtered) }, true);
      } else {
        onChange(currentRef.current, true);
      }

      setDraggingStopId(null);
      setWillRemoveOnDrop(false);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [draggingStopId, onChange]);

  const handleModeSwitch = (mode: ColorMode) => {
    onBeginEdit();
    onChange({ ...current, mode }, true);
  };

  const handleBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (current.stops.length >= 5) return;
    if ((e.target as HTMLElement).dataset.stopHandle === 'true') return;

    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));

    // Avoid adding right on top of an existing stop
    const tooClose = current.stops.some((s) => Math.abs(s.position - pos) < 0.05);
    if (tooClose) return;

    onBeginEdit();
    const newStop: GradientStop = {
      id: 'stop_' + Math.random().toString(36).slice(2, 7),
      position: pos,
      color: evaluateGradientHex(current.stops, pos),
    };
    const nextStops = sortStops([...current.stops, newStop]);
    setSelectedStopId(newStop.id);
    onChange({ ...current, mode: 'gradient', stops: nextStops }, true);
  };

  const updateActiveStopColor = (hex: string, commit: boolean) => {
    if (!activeStop) return;
    const nextStops = current.stops.map((s) =>
      s.id === activeStop.id ? { ...s, color: hex } : s
    );
    onChange({ ...current, mode: 'gradient', stops: nextStops }, commit);
  };

  const handleDeleteActiveStop = () => {
    if (!activeStop || current.stops.length <= 2) return;
    onBeginEdit();
    const remaining = current.stops.filter((s) => s.id !== activeStop.id);
    setSelectedStopId(remaining[0]?.id || '');
    onChange({ ...current, stops: sortStops(remaining) }, true);
  };

  const borderMuted = isNight ? 'border-neutral-700' : 'border-neutral-300';
  const chipBg = isNight
    ? 'bg-neutral-800/80 border-neutral-700 text-neutral-200 hover:border-neutral-500'
    : 'bg-neutral-50 border-neutral-300 text-neutral-800 hover:border-black';
  const activeTabClass = isNight
    ? 'bg-white text-black border-white'
    : 'bg-black text-white border-black';

  return (
    <div className="space-y-3">
      {/* Header + Uni / Dégradé Toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-extrabold tracking-[0.06em] uppercase font-display">
            COULEURS
          </span>
          {isMixed && (
            <span className="text-[10px] font-mono-code px-1.5 py-0.5 rounded border border-current/30 opacity-75">
              —
            </span>
          )}
        </div>

        <div className={`inline-flex rounded-full border ${borderMuted} p-0.5 text-[10px] font-bold`}>
          <button
            type="button"
            onClick={() => handleModeSwitch('solid')}
            className={`px-2.5 py-0.5 rounded-full transition-colors cursor-pointer ${
              !isMixed && current.mode === 'solid'
                ? activeTabClass
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            Uni
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch('gradient')}
            className={`px-2.5 py-0.5 rounded-full transition-colors cursor-pointer ${
              !isMixed && current.mode === 'gradient'
                ? activeTabClass
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            Dégradé
          </button>
        </div>
      </div>

      {/* SOLID MODE */}
      {(isMixed || current.mode === 'solid') && (
        <div className="space-y-2.5">
          {/* Quick Swatches + Native Picker + Hex */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {QUICK_SOLID_SWATCHES.map((c) => {
                const isSelected =
                  !isMixed && current.solidColor.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      onBeginEdit();
                      onChange({ ...current, mode: 'solid', solidColor: c }, true);
                    }}
                    title={c}
                    className={`w-5 h-5 rounded-full border transition-transform cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 ring-2 ring-blue-500/40 scale-115'
                        : 'border-black/25 hover:scale-110'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                );
              })}
            </div>

            <div className="flex items-center gap-1.5">
              <label
                title="Choisir une couleur personnalisée"
                className={`w-6 h-6 rounded-full border ${borderMuted} overflow-hidden cursor-pointer shrink-0 relative`}
                style={{ backgroundColor: isMixed ? '#888888' : current.solidColor }}
              >
                <input
                  type="color"
                  value={current.solidColor}
                  onPointerDown={onBeginEdit}
                  onChange={(e) => {
                    onChange({ ...current, mode: 'solid', solidColor: e.target.value }, false);
                  }}
                  onBlur={() => onChange(current, true)}
                  className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                />
              </label>

              <input
                type="text"
                value={hexDraft}
                placeholder="—"
                maxLength={7}
                onFocus={onBeginEdit}
                onChange={(e) => {
                  const val = e.target.value;
                  setHexDraft(val);
                  if (isValidHex(val)) {
                    onChange({ ...current, mode: 'solid', solidColor: val }, false);
                  }
                }}
                onBlur={() => {
                  if (isValidHex(hexDraft)) {
                    onChange({ ...current, mode: 'solid', solidColor: hexDraft }, true);
                  } else {
                    setHexDraft(isMixed ? '' : current.solidColor.toUpperCase());
                  }
                }}
                className={`w-[68px] px-1.5 py-0.5 text-[10px] font-mono-code uppercase rounded border ${borderMuted} bg-transparent focus:outline-none focus:border-blue-500`}
              />
            </div>
          </div>

          {/* Continuous Spectrum Bar */}
          <input
            type="range"
            min="0"
            max="1"
            step="0.005"
            value={isMixed ? 0.5 : colorToGradientPosition(current.solidColor)}
            onPointerDown={onBeginEdit}
            onChange={(e) => {
              const hex = sampleGradient(parseFloat(e.target.value));
              onChange({ ...current, mode: 'solid', solidColor: hex }, false);
            }}
            onPointerUp={() => onChange(current, true)}
            style={
              {
                '--thumb-color': isMixed ? '#9ca3af' : current.solidColor,
              } as React.CSSProperties
            }
            className="gradient-thumb-slider"
          />
        </div>
      )}

      {/* GRADIENT MODE */}
      {!isMixed && current.mode === 'gradient' && (
        <div className="space-y-2.5">
          {/* Interactive Multi-Stop Bar */}
          <div className="pt-1 pb-2">
            <div
              ref={barRef}
              onClick={handleBarClick}
              title="Cliquer pour ajouter un point (max 5) • Glisser verticalement hors de la barre pour supprimer"
              className={`relative h-6 rounded-full border ${
                isNight ? 'border-neutral-600' : 'border-black'
              } cursor-crosshair select-none`}
              style={{ background: stopsToCssGradient(current.stops) }}
            >
              {current.stops.map((stop) => {
                const isActive = stop.id === activeStop?.id;
                const isBeingRemoved = draggingStopId === stop.id && willRemoveOnDrop;
                return (
                  <button
                    key={stop.id}
                    type="button"
                    data-stop-handle="true"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onBeginEdit();
                      setSelectedStopId(stop.id);
                      setDraggingStopId(stop.id);
                    }}
                    style={{
                      left: `${stop.position * 100}%`,
                      backgroundColor: stop.color,
                    }}
                    title={`Point ${(stop.position * 100).toFixed(0)}% (${stop.color})`}
                    className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-md transition-transform cursor-grab active:cursor-grabbing ${
                      isBeingRemoved
                        ? 'opacity-35 scale-75 ring-2 ring-red-500'
                        : isActive
                        ? 'scale-125 ring-2 ring-blue-500 z-10'
                        : 'hover:scale-110'
                    }`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between items-center mt-1 text-[9px] opacity-60">
              <span>
                {current.stops.length}/5 points • Clic = ajouter
              </span>
              {current.stops.length > 2 && (
                <span>Glisser bas = supprimer</span>
              )}
            </div>
          </div>

          {/* Active Stop Inspector */}
          {activeStop && (
            <div
              className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[10px] border ${borderMuted}`}
            >
              <div className="flex items-center gap-2">
                <label
                  className="w-5 h-5 rounded-full border border-black/30 overflow-hidden cursor-pointer relative shrink-0"
                  style={{ backgroundColor: activeStop.color }}
                >
                  <input
                    type="color"
                    value={activeStop.color}
                    onPointerDown={onBeginEdit}
                    onChange={(e) => updateActiveStopColor(e.target.value, false)}
                    onBlur={() => onChange(current, true)}
                    className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                  />
                </label>

                <input
                  type="text"
                  value={stopHexDraft}
                  maxLength={7}
                  onFocus={onBeginEdit}
                  onChange={(e) => {
                    const val = e.target.value;
                    setStopHexDraft(val);
                    if (isValidHex(val)) {
                      updateActiveStopColor(val, false);
                    }
                  }}
                  onBlur={() => {
                    if (isValidHex(stopHexDraft)) {
                      updateActiveStopColor(stopHexDraft, true);
                    } else {
                      setStopHexDraft(activeStop.color.toUpperCase());
                    }
                  }}
                  className={`w-[66px] px-1.5 py-0.5 text-[10px] font-mono-code uppercase rounded border ${borderMuted} bg-transparent focus:outline-none focus:border-blue-500`}
                />
                <span className="text-[10px] font-mono-code opacity-60">
                  {Math.round(activeStop.position * 100)}%
                </span>
              </div>

              <div className="flex items-center gap-1">
                {current.stops.length < 5 && (
                  <button
                    type="button"
                    onClick={() => {
                      onBeginEdit();
                      const pos = 0.5;
                      const newStop: GradientStop = {
                        id: 'stop_' + Math.random().toString(36).slice(2, 7),
                        position: pos,
                        color: evaluateGradientHex(current.stops, pos),
                      };
                      setSelectedStopId(newStop.id);
                      onChange(
                        { ...current, stops: sortStops([...current.stops, newStop]) },
                        true
                      );
                    }}
                    title="Ajouter un point intermédiaire"
                    className={`w-6 h-6 rounded border ${borderMuted} flex items-center justify-center hover:border-blue-500 cursor-pointer`}
                  >
                    <Plus size={12} />
                  </button>
                )}

                {current.stops.length > 2 && (
                  <button
                    type="button"
                    onClick={handleDeleteActiveStop}
                    title="Supprimer ce point"
                    className="w-6 h-6 rounded border border-red-400/60 text-red-500 flex items-center justify-center hover:bg-red-500/10 cursor-pointer"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Direction & Invert Controls */}
          <div className="flex items-center justify-between gap-2">
            <div className={`inline-flex rounded-lg border ${borderMuted} p-0.5 text-[9px] font-bold`}>
              <button
                type="button"
                onClick={() => {
                  onBeginEdit();
                  onChange({ ...current, direction: 'length' }, true);
                }}
                className={`px-2 py-1 rounded-md cursor-pointer transition-colors ${
                  current.direction === 'length'
                    ? activeTabClass
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                Longueur
              </button>
              <button
                type="button"
                onClick={() => {
                  onBeginEdit();
                  onChange({ ...current, direction: 'width' }, true);
                }}
                className={`px-2 py-1 rounded-md cursor-pointer transition-colors ${
                  current.direction === 'width'
                    ? activeTabClass
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                Largeur
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                onBeginEdit();
                onChange(
                  { ...current, stops: invertGradientStops(current.stops) },
                  true
                );
              }}
              title="Inverser le sens du dégradé"
              className={`px-2.5 py-1 rounded-lg border text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${chipBg}`}
            >
              <ArrowLeftRight size={11} />
              <span>Inverser</span>
            </button>
          </div>

          {/* Built-in Gradient Presets */}
          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            {GRADIENT_PRESETS.map((preset) => {
              const stops: GradientStop[] = preset.stops.map((s, idx) => ({
                id: `${preset.id}_${idx}`,
                position: s.position,
                color: s.color,
              }));
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    onBeginEdit();
                    setSelectedStopId(stops[0].id);
                    onChange({ ...current, mode: 'gradient', stops }, true);
                  }}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-left cursor-pointer transition-all ${chipBg}`}
                >
                  <span
                    className="w-5 h-3 rounded-full border border-black/20 shrink-0"
                    style={{ background: stopsToCssGradient(stops) }}
                  />
                  <span className="text-[9px] font-medium truncate">{preset.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
