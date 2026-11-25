/**
 * @file ExportModal.tsx
 * Modal dialog for exporting the 3D drawing as:
 *  - High-res PNG image (opaque or transparent background)
 *  - Binary GLB / GLTF 2.0 model (preserving vertex colors & PBR materials)
 *  - Wavefront OBJ 3D model
 */

import React, { useState } from 'react';
import { X, Image as ImageIcon, Box, Layers, Download, Check } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExportPNG: (transparent: boolean) => void;
  onExportOBJ: () => void;
  onExportGLTF: () => Promise<void>;
  strokeCount: number;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  onExportPNG,
  onExportOBJ,
  onExportGLTF,
  strokeCount,
}) => {
  const [exportType, setExportType] = useState<'png' | 'glb' | 'obj'>('png');
  const [transparentBg, setTransparentBg] = useState(false);
  const [hasExported, setHasExported] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const handleDownload = async () => {
    setIsExporting(true);
    try {
      if (exportType === 'png') {
        onExportPNG(transparentBg);
      } else if (exportType === 'glb') {
        await onExportGLTF();
      } else {
        onExportOBJ();
      }
      setHasExported(true);
      setTimeout(() => setHasExported(false), 2000);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 select-none">
      <div className="w-[430px] max-w-[94vw] bg-white border border-black rounded-[24px] shadow-2xl overflow-hidden flex flex-col text-black">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black">
          <h2 className="text-sm font-extrabold tracking-[0.06em] uppercase font-display">
            EXPORTER LE DESSIN
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-5">
          {/* Format selection */}
          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => setExportType('png')}
              className={`p-3 rounded-[16px] border flex flex-col items-center gap-2 cursor-pointer transition-all ${
                exportType === 'png'
                  ? 'border-black bg-neutral-50 shadow-sm ring-1 ring-black'
                  : 'border-neutral-300 hover:border-black/50'
              }`}
            >
              <ImageIcon size={20} strokeWidth={1.7} />
              <div className="text-center">
                <span className="text-xs font-bold block">Image PNG</span>
                <span className="text-[9px] text-neutral-500">Rendu 2D HD</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setExportType('glb')}
              className={`p-3 rounded-[16px] border flex flex-col items-center gap-2 cursor-pointer transition-all ${
                exportType === 'glb'
                  ? 'border-black bg-neutral-50 shadow-sm ring-1 ring-black'
                  : 'border-neutral-300 hover:border-black/50'
              }`}
            >
              <Layers size={20} strokeWidth={1.7} />
              <div className="text-center">
                <span className="text-xs font-bold block">GLB / GLTF</span>
                <span className="text-[9px] text-neutral-500">Couleurs & PBR</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setExportType('obj')}
              className={`p-3 rounded-[16px] border flex flex-col items-center gap-2 cursor-pointer transition-all ${
                exportType === 'obj'
                  ? 'border-black bg-neutral-50 shadow-sm ring-1 ring-black'
                  : 'border-neutral-300 hover:border-black/50'
              }`}
            >
              <Box size={20} strokeWidth={1.7} />
              <div className="text-center">
                <span className="text-xs font-bold block">Modèle OBJ</span>
                <span className="text-[9px] text-neutral-500">Maillage 3D brut</span>
              </div>
            </button>
          </div>

          {/* PNG Options */}
          {exportType === 'png' && (
            <div className="p-3.5 rounded-[14px] bg-neutral-50 border border-neutral-200 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold block">Arrière-plan transparent</span>
                <span className="text-[10px] text-neutral-500">
                  Idéal pour l'intégration graphique
                </span>
              </div>
              <input
                type="checkbox"
                checked={transparentBg}
                onChange={(e) => setTransparentBg(e.target.checked)}
                className="w-4 h-4 accent-black cursor-pointer rounded"
              />
            </div>
          )}

          {/* GLB Info */}
          {exportType === 'glb' && (
            <div className="p-3.5 rounded-[14px] bg-neutral-50 border border-neutral-200 text-[11px] text-neutral-600 space-y-1">
              <div className="flex justify-between">
                <span>Nombre de traits :</span>
                <span className="font-mono-code font-bold">{strokeCount}</span>
              </div>
              <p className="text-[10px] text-neutral-500 pt-1">
                Fichier binaire GLTF 2.0 (.glb) conservant les dégradés par sommet (vertex colors) et les matériaux PBR pour Blender, Unity ou le web.
              </p>
            </div>
          )}

          {/* OBJ Info */}
          {exportType === 'obj' && (
            <div className="p-3.5 rounded-[14px] bg-neutral-50 border border-neutral-200 text-[11px] text-neutral-600 space-y-1">
              <div className="flex justify-between">
                <span>Nombre de traits :</span>
                <span className="font-mono-code font-bold">{strokeCount}</span>
              </div>
              <p className="text-[10px] text-neutral-500 pt-1">
                Fichier Wavefront .obj avec coordonnées 3D, normales lissées et groupes d'objets.
              </p>
            </div>
          )}

          {/* Action Button */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={strokeCount === 0 || isExporting}
            className={`w-full h-11 rounded-[14px] border border-black flex items-center justify-center gap-2 text-xs font-bold tracking-widest uppercase transition-all ${
              strokeCount === 0 || isExporting
                ? 'opacity-40 cursor-not-allowed bg-neutral-100'
                : 'bg-black text-white hover:bg-neutral-800 active:scale-98 cursor-pointer'
            }`}
          >
            {hasExported ? (
              <>
                <Check size={16} />
                <span>Téléchargé !</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>Télécharger {exportType.toUpperCase()}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
