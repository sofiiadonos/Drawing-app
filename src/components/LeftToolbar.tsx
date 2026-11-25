/**
 * @file LeftToolbar.tsx
 * Left vertical toolbar with circular icon buttons:
 *  - Undo / Redo
 *  - Tools: Select (default), Pen, Object Deletion (Trash), Move/Rotate
 *  - Day / Night Mode toggle
 *  - Preview / Final View presentation toggle
 *  - Download / Export at bottom
 */

import React from 'react';
import {
  Undo2,
  Redo2,
  MousePointer2,
  PenTool,
  Trash2,
  Rotate3d,
  Sun,
  Moon,
  Eye,
  Download,
} from 'lucide-react';
import { ToolType, ThemeMode } from '../types';

interface LeftToolbarProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onTogglePreview: () => void;
  onOpenExport: () => void;
}

export const LeftToolbar: React.FC<LeftToolbarProps> = ({
  activeTool,
  onSelectTool,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  theme,
  onToggleTheme,
  onTogglePreview,
  onOpenExport,
}) => {
  const isNight = theme === 'night';
  const borderCol = isNight ? 'border-neutral-700' : 'border-black';
  const bgCol = isNight ? 'bg-[#14151a] text-white' : 'bg-white text-black';
  const hoverCol = isNight ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100';
  const activeClass = isNight ? 'bg-white text-black' : 'bg-black text-white';

  return (
    <aside
      className={`w-[64px] sm:w-[70px] border-r ${borderCol} flex flex-col items-center justify-between py-5 px-2 ${bgCol} shrink-0 select-none z-20 transition-colors`}
    >
      {/* Top: Undo, Redo, Tools */}
      <div className="flex flex-col items-center gap-3 w-full">
        {/* Undo */}
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Annuler (Ctrl+Z)"
          aria-label="Annuler"
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border ${borderCol} flex items-center justify-center transition-all ${
            canUndo
              ? `${hoverCol} active:scale-95 cursor-pointer`
              : 'opacity-25 cursor-not-allowed text-neutral-400'
          }`}
        >
          <Undo2 size={16} strokeWidth={1.8} />
        </button>

        {/* Redo */}
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title="Rétablir (Ctrl+Maj+Z)"
          aria-label="Rétablir"
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border ${borderCol} flex items-center justify-center transition-all ${
            canRedo
              ? `${hoverCol} active:scale-95 cursor-pointer`
              : 'opacity-25 cursor-not-allowed text-neutral-400'
          }`}
        >
          <Redo2 size={16} strokeWidth={1.8} />
        </button>

        {/* Thin divider */}
        <div className={`w-5 h-[1px] ${isNight ? 'bg-neutral-800' : 'bg-neutral-200'} my-1`} />

        {/* Select Tool */}
        <button
          type="button"
          onClick={() => onSelectTool('select')}
          title="Sélectionner (Cliquer sur un trait 3D)"
          aria-label="Sélectionner"
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border ${borderCol} flex items-center justify-center transition-all cursor-pointer ${
            activeTool === 'select' ? activeClass : `${hoverCol} active:scale-95`
          }`}
        >
          <MousePointer2 size={16} strokeWidth={1.8} />
        </button>

        {/* Pen Tool */}
        <button
          type="button"
          onClick={() => onSelectTool('pen')}
          title="Plume (Dessin de traits 3D fluides)"
          aria-label="Plume"
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border ${borderCol} flex items-center justify-center transition-all cursor-pointer ${
            activeTool === 'pen' ? activeClass : `${hoverCol} active:scale-95`
          }`}
        >
          <PenTool size={16} strokeWidth={1.8} />
        </button>

        {/* Object Deletion Mode (Trash Can) */}
        <button
          type="button"
          onClick={() => onSelectTool('eraser')}
          title="Supprimer un objet (Cliquer ou glisser sur un trait pour le supprimer)"
          aria-label="Supprimer un objet"
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border ${borderCol} flex items-center justify-center transition-all cursor-pointer ${
            activeTool === 'eraser' ? activeClass : `${hoverCol} active:scale-95`
          }`}
        >
          <Trash2 size={16} strokeWidth={1.8} />
        </button>

        {/* Move / Rotate 3D */}
        <button
          type="button"
          onClick={() => onSelectTool('navigate')}
          title="Orbite / Caméra 3D (Espace)"
          aria-label="Caméra 3D"
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border ${borderCol} flex items-center justify-center transition-all cursor-pointer ${
            activeTool === 'navigate' ? activeClass : `${hoverCol} active:scale-95`
          }`}
        >
          <Rotate3d size={16} strokeWidth={1.8} />
        </button>
      </div>

      {/* Bottom section: Day/Night, Preview, Export */}
      <div className="flex flex-col items-center gap-3 w-full">
        {/* Day / Night Mode Toggle */}
        <button
          type="button"
          onClick={onToggleTheme}
          title={isNight ? 'Passer en Mode Jour' : 'Passer en Mode Nuit'}
          aria-label="Mode Jour/Nuit"
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border ${borderCol} flex items-center justify-center ${hoverCol} active:scale-95 transition-all cursor-pointer`}
        >
          {isNight ? (
            <Sun size={16} strokeWidth={1.8} className="text-amber-400" />
          ) : (
            <Moon size={16} strokeWidth={1.8} className="text-neutral-800" />
          )}
        </button>

        {/* Preview / Final View Presentation Toggle */}
        <button
          type="button"
          onClick={onTogglePreview}
          title="Aperçu / Vue Finale (Masquer toute l'interface)"
          aria-label="Vue Finale"
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border ${borderCol} flex items-center justify-center ${hoverCol} active:scale-95 transition-all cursor-pointer`}
        >
          <Eye size={16} strokeWidth={1.8} />
        </button>

        {/* Export / Download Button */}
        <button
          type="button"
          onClick={onOpenExport}
          title="Exporter l'image ou le modèle 3D"
          aria-label="Télécharger"
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border ${borderCol} flex items-center justify-center ${hoverCol} active:scale-95 transition-all cursor-pointer`}
        >
          <Download size={16} strokeWidth={1.8} />
        </button>
      </div>
    </aside>
  );
};
