/**
 * @file App.tsx
 * Main application container for 3D RAWING.
 * Houses:
 *  - Header with geometric "3D RAWING" title
 *  - Left toolbar: Undo, Redo, Select (default), Pen, Object-Deletion (Trash), Move/Rotate, Day/Night, Preview, Download
 *  - Clean uncluttered 3D canvas with automated studio lighting and grid
 *  - Floating, draggable Right Inspecteur with editable materials, SVG profile previews,
 *    and multi-stop gradient colors
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ToolType,
  StrokeData,
  StrokeProperties,
  SelectedTarget,
  ThemeMode,
  MaterialPreset,
  MaterialParams,
} from './types';
import { SceneEngine } from './engine/scene';
import { HistoryManager } from './engine/history';
import { getPresetDefaultParams } from './engine/materials';
import { LeftToolbar } from './components/LeftToolbar';
import { RightPanel } from './components/RightPanel';
import { ExportModal } from './components/ExportModal';
import { EyeOff } from 'lucide-react';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneEngineRef = useRef<SceneEngine | null>(null);
  const historyManagerRef = useRef<HistoryManager>(new HistoryManager(60));

  // Tool state — Selection cursor arrow active by default on load
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [selectedTarget, setSelectedTarget] = useState<SelectedTarget>(null);
  const [selectedStrokes, setSelectedStrokes] = useState<StrokeData[]>([]);

  // Theme & Preview Presentation Mode
  const [theme, setTheme] = useState<ThemeMode>('day');
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(false);

  // Scene Stats
  const [strokeCount, setStrokeCount] = useState<number>(0);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);

  // Debounced / batched undo snapshots for continuous slider drags
  const strokeEditSnapshotRef = useRef<{
    ids: string[];
    before: StrokeProperties[];
  } | null>(null);
  const strokeCommitTimerRef = useRef<number | null>(null);

  // Initialize SceneEngine
  useEffect(() => {
    if (!containerRef.current) return;

    const history = historyManagerRef.current;

    const engine = new SceneEngine(containerRef.current, history, {
      onTargetChange: (target) => {
        setSelectedTarget(target);
        if (target && target.type === 'stroke') {
          setSelectedStrokes(engine.getSelectedStrokes());
        } else {
          setSelectedStrokes([]);
        }
      },
      onStrokeCountChange: (count) => {
        setStrokeCount(count);
      },
      onToolChange: (tool) => {
        setActiveTool(tool);
      },
      onPreviewChange: (preview) => {
        setIsPreviewMode(preview);
      },
    });

    sceneEngineRef.current = engine;

    const unsubscribeHistory = history.subscribe(() => {
      setCanUndo(history.canUndo());
      setCanRedo(history.canRedo());
    });

    const handleResize = () => {
      engine.handleResize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      unsubscribeHistory();
      window.removeEventListener('resize', handleResize);
      if (strokeCommitTimerRef.current) window.clearTimeout(strokeCommitTimerRef.current);
      engine.dispose();
      sceneEngineRef.current = null;
    };
  }, []);

  // Sync active tool
  useEffect(() => {
    if (!sceneEngineRef.current) return;
    sceneEngineRef.current.setTool(activeTool);
  }, [activeTool]);

  // Theme toggle
  const handleToggleTheme = () => {
    const nextTheme: ThemeMode = theme === 'day' ? 'night' : 'day';
    setTheme(nextTheme);
    if (sceneEngineRef.current) {
      sceneEngineRef.current.setTheme(nextTheme);
    }
  };

  // Preview / Final View presentation toggle
  const handleTogglePreview = () => {
    const nextPreview = !isPreviewMode;
    setIsPreviewMode(nextPreview);
    if (sceneEngineRef.current) {
      sceneEngineRef.current.setPreviewMode(nextPreview);
    }
  };

  // Undo / Redo operations
  const handleUndo = useCallback(() => {
    const engine = sceneEngineRef.current;
    const history = historyManagerRef.current;
    if (!engine || !history.canUndo()) return;

    const action = history.popUndo();
    if (!action) return;

    if (action.type === 'add_stroke') {
      engine.deleteStrokes([action.stroke.id], false);
    } else if (action.type === 'delete_strokes') {
      engine.restoreStrokes(action.strokes);
    } else if (action.type === 'modify_strokes') {
      action.strokeIds.forEach((id, index) => {
        const beforeProps = action.before[index];
        if (beforeProps) {
          engine.updateStrokeProperties([id], beforeProps, false);
        }
      });
      setSelectedStrokes(engine.getSelectedStrokes());
    }
  }, []);

  const handleRedo = useCallback(() => {
    const engine = sceneEngineRef.current;
    const history = historyManagerRef.current;
    if (!engine || !history.canRedo()) return;

    const action = history.popRedo();
    if (!action) return;

    if (action.type === 'add_stroke') {
      engine.restoreStrokes([action.stroke]);
    } else if (action.type === 'delete_strokes') {
      engine.deleteStrokes(
        action.strokes.map((s) => s.id),
        false
      );
    } else if (action.type === 'modify_strokes') {
      action.strokeIds.forEach((id, index) => {
        const afterProps = action.after[index];
        if (afterProps) {
          engine.updateStrokeProperties([id], afterProps, false);
        }
      });
      setSelectedStrokes(engine.getSelectedStrokes());
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Escape' && isPreviewMode) {
        e.preventDefault();
        handleTogglePreview();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (
        ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') ||
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y')
      ) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, isPreviewMode]);

  // Stroke Inspector Handlers (with batched/debounced history commits)
  const commitPendingStrokeEdit = useCallback(() => {
    const engine = sceneEngineRef.current;
    const snap = strokeEditSnapshotRef.current;
    if (strokeCommitTimerRef.current) {
      window.clearTimeout(strokeCommitTimerRef.current);
      strokeCommitTimerRef.current = null;
    }
    if (engine && snap) {
      engine.commitStrokeModification(snap.ids, snap.before);
      strokeEditSnapshotRef.current = null;
    }
  }, []);

  const handleBeginStrokeEdit = useCallback(() => {
    const engine = sceneEngineRef.current;
    if (!engine || selectedTarget?.type !== 'stroke') return;
    if (!strokeEditSnapshotRef.current) {
      strokeEditSnapshotRef.current = {
        ids: [...selectedTarget.ids],
        before: engine.snapshotStrokeProperties(selectedTarget.ids),
      };
    }
  }, [selectedTarget]);

  const handleUpdateStrokeProperties = useCallback(
    (props: Partial<StrokeProperties>, commitHistory: boolean) => {
      const engine = sceneEngineRef.current;
      if (!engine || selectedTarget?.type !== 'stroke') return;

      if (!strokeEditSnapshotRef.current) {
        strokeEditSnapshotRef.current = {
          ids: [...selectedTarget.ids],
          before: engine.snapshotStrokeProperties(selectedTarget.ids),
        };
      }

      const hasChanges = Object.keys(props).length > 0;
      if (hasChanges) {
        engine.updateStrokeProperties(selectedTarget.ids, props, false);
        setSelectedStrokes(engine.getSelectedStrokes());
      }

      if (commitHistory) {
        commitPendingStrokeEdit();
      } else {
        if (strokeCommitTimerRef.current) {
          window.clearTimeout(strokeCommitTimerRef.current);
        }
        strokeCommitTimerRef.current = window.setTimeout(() => {
          commitPendingStrokeEdit();
        }, 450);
      }
    },
    [selectedTarget, commitPendingStrokeEdit]
  );

  const handleResetStrokeMaterial = useCallback(() => {
    if (selectedTarget?.type !== 'stroke') return;
    const first = selectedStrokes[0];
    const preset = first?.materialPreset || 'standard';
    const defParams = getPresetDefaultParams(preset);
    handleUpdateStrokeProperties(
      {
        materialPreset: preset,
        materialParams: defParams,
        transparency: defParams.opacity,
        customPresetId: undefined,
      },
      true
    );
  }, [selectedTarget, selectedStrokes, handleUpdateStrokeProperties]);

  const handleApplyMaterialToAll = useCallback(
    (preset: MaterialPreset, params: MaterialParams, customId?: string) => {
      const engine = sceneEngineRef.current;
      if (!engine) return;
      engine.applyMaterialToAllStrokes(preset, params, customId);
      setSelectedStrokes(engine.getSelectedStrokes());
    },
    []
  );

  const handleDuplicateStrokes = () => {
    if (!sceneEngineRef.current) return;
    sceneEngineRef.current.duplicateSelectedStrokes();
  };

  const handleDeleteStrokes = () => {
    if (!sceneEngineRef.current || selectedTarget?.type !== 'stroke') return;
    sceneEngineRef.current.deleteStrokes(selectedTarget.ids, true);
  };

  const handleFocusSelected = () => {
    if (!sceneEngineRef.current) return;
    sceneEngineRef.current.focusOnSelected();
  };

  const handleCloseInspector = () => {
    if (sceneEngineRef.current) {
      sceneEngineRef.current.clearSelection(true);
    }
  };

  // Export handlers
  const handleExportPNG = (transparent: boolean) => {
    if (!sceneEngineRef.current) return;
    const dataUrl = sceneEngineRef.current.exportPNG(transparent);
    const link = document.createElement('a');
    link.download = `3d-rawing-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  };

  const handleExportOBJ = () => {
    if (!sceneEngineRef.current) return;
    const objData = sceneEngineRef.current.exportOBJ();
    const blob = new Blob([objData], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `3d-rawing-${Date.now()}.obj`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportGLTF = async () => {
    if (!sceneEngineRef.current) return;
    const buffer = await sceneEngineRef.current.exportGLTF();
    const blob = new Blob([buffer], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `3d-rawing-${Date.now()}.glb`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const isNight = theme === 'night';
  const outerBorder = isNight ? 'border-neutral-700' : 'border-black';
  const frameBg = isNight ? 'bg-[#0e0f14]' : 'bg-[#f4f4f4]';
  const innerBg = isNight ? 'bg-[#121318]' : 'bg-white';
  const headerBorder = isNight ? 'border-neutral-800' : 'border-black';

  return (
    <div
      className={`w-full h-full p-2 sm:p-3 md:p-5 flex items-center justify-center ${frameBg} ${
        isNight ? 'theme-night' : ''
      } overflow-hidden select-none transition-colors duration-300`}
    >
      {/* Outer Window Frame with Large Rounded Corners & Thin Outline */}
      <div
        className={`w-full h-full max-w-[1720px] max-h-[1020px] ${innerBg} border ${outerBorder} rounded-[22px] sm:rounded-[28px] md:rounded-[34px] shadow-sm flex flex-col overflow-hidden relative transition-all duration-300`}
      >
        {/* Header (Hidden in Preview Mode) */}
        {!isPreviewMode && (
          <header
            className={`h-12 border-b ${headerBorder} flex items-center justify-between px-6 shrink-0 z-20 ${
              isNight ? 'text-white' : 'text-black'
            }`}
          >
            <div className="flex items-center gap-3">
              <h1 className="text-base sm:text-lg font-extrabold tracking-[0.06em] uppercase font-display leading-none">
                3D RAWING
              </h1>
            </div>

            <div className="flex items-center gap-2.5 text-xs font-mono-code">
              {selectedTarget?.type === 'stroke' ? (
                <span className="text-[10px] tracking-wider uppercase px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-500 font-semibold">
                  {selectedStrokes.length > 1
                    ? `${selectedStrokes.length} traits sélectionnés`
                    : 'Trait 3D sélectionné'}
                </span>
              ) : (
                <span className="text-[10px] uppercase tracking-wider opacity-40">
                  {theme === 'night' ? 'Ambiance Nuit 3D' : 'Studio Blanc 3D'}
                </span>
              )}
            </div>
          </header>
        )}

        {/* Main Body */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Left Toolbar (Hidden in Preview Mode) */}
          {!isPreviewMode && (
            <LeftToolbar
              activeTool={activeTool}
              onSelectTool={setActiveTool}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={handleUndo}
              onRedo={handleRedo}
              theme={theme}
              onToggleTheme={handleToggleTheme}
              onTogglePreview={handleTogglePreview}
              onOpenExport={() => setIsExportOpen(true)}
            />
          )}

          {/* Center 3D Drawing Canvas */}
          <main className="flex-1 h-full relative overflow-hidden">
            <div ref={containerRef} className="w-full h-full relative" />

            {/* In Preview Mode: Floating Exit Presentation Button */}
            {isPreviewMode && (
              <button
                type="button"
                onClick={handleTogglePreview}
                title="Quitter la vue finale (Échap)"
                className="absolute top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-black/90 hover:bg-black text-white text-xs font-semibold tracking-wider uppercase border border-white/25 shadow-lg cursor-pointer transition-all hover:scale-105 active:scale-95"
              >
                <EyeOff size={14} />
                <span>Quitter l'Aperçu (Échap)</span>
              </button>
            )}

            {/* Floating Draggable Right Inspecteur (Hidden in Preview Mode, hidden by default) */}
            {!isPreviewMode && (
              <RightPanel
                selectedTarget={selectedTarget}
                selectedStrokes={selectedStrokes}
                onUpdateStrokeProperties={handleUpdateStrokeProperties}
                onBeginStrokeEdit={handleBeginStrokeEdit}
                onResetStrokeMaterial={handleResetStrokeMaterial}
                onApplyMaterialToAll={handleApplyMaterialToAll}
                onDuplicateStrokes={handleDuplicateStrokes}
                onDeleteStrokes={handleDeleteStrokes}
                onFocusSelected={handleFocusSelected}
                onClose={handleCloseInspector}
                theme={theme}
              />
            )}
          </main>
        </div>
      </div>

      {/* Export Dialog */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        onExportPNG={handleExportPNG}
        onExportOBJ={handleExportOBJ}
        onExportGLTF={handleExportGLTF}
        strokeCount={strokeCount}
      />
    </div>
  );
}
