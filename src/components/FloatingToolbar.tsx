
import React from 'react';
import { ToolMode } from '../types';
import { TOOLS } from '../constants';
import type { ArtifactHints } from '../lib/domains';
import type { ResearchViewerPolicyV1 } from '../core/researchManifest';
import { GripVertical, GripHorizontal } from 'lucide-react';

interface FloatingToolbarProps {
  activeTool: ToolMode;
  onSelectTool: (t: ToolMode) => void;
  position: { x: number; y: number };
  onDragStart: (e: React.MouseEvent) => void;
  orientation: 'horizontal' | 'vertical';
  isDragging?: boolean;
  instanceCount?: number;
  artifactHints?: ArtifactHints;
  interactionPolicy?: ResearchViewerPolicyV1;
  docked?: boolean;
}

const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  activeTool,
  onSelectTool,
  position,
  onDragStart,
  orientation,
  isDragging,
  instanceCount = 1,
  artifactHints,
  interactionPolicy,
  docked = false,
}) => {
  const visibleTools = TOOLS.filter(t => {
    if (
      t.id === ToolMode.SCROLL
      && (instanceCount <= 1 || interactionPolicy?.allowFrameNavigation === false)
    ) return false;
    if (
      t.id === ToolMode.WINDOW_LEVEL
      && ((artifactHints && !artifactHints.showWindowLevel) || interactionPolicy?.allowWindowLevel === false)
    ) return false;
    if (
      (t.id === ToolMode.PAN || t.id === ToolMode.ZOOM)
      && interactionPolicy?.allowPanZoom === false
    ) return false;
    if (t.id === ToolMode.MEASURE && interactionPolicy?.allowAnnotations === false) return false;
    if (
      (t.id === ToolMode.BRUSH || t.id === ToolMode.ERASER)
      && (
        (artifactHints && !artifactHints.showSegmentation)
        || interactionPolicy?.allowAnnotations === false
        || interactionPolicy?.allowSegmentation === false
      )
    ) return false;
    return true;
  });
  const isVertical = orientation === 'vertical';

  return (
    <div
      data-tour-id="viewer-toolbar"
      role="toolbar"
      aria-label="Image tools"
      className={docked ? 'flex min-h-14 shrink-0 items-center overflow-x-auto border-b border-white/[0.08] bg-[#101722] px-3 py-1.5' : `absolute z-40 flex items-center bg-[#161718]/95 border border-white/[0.08] rounded-2xl shadow-2xl backdrop-blur-md select-none ${
        // Only apply transition when NOT dragging to avoid lag/rubber-banding
        !isDragging ? 'transition-all duration-200' : ''
      } ${
        isVertical ? 'flex-col w-16 py-1' : 'flex-row h-16 px-1'
      }`}
      style={docked ? undefined : {
        left: position.x,
        top: position.y,
        touchAction: 'none'
      }}
    >
      {/* Drag Handle */}
      {!docked && <button
        type="button"
        className={`flex items-center justify-center cursor-grab active:cursor-grabbing text-[#8a8f98] hover:text-[#d0d6e0] transition-colors hover:bg-white/[0.04] ${
          isVertical
            ? 'w-full min-h-11 mb-1 border-b border-white/[0.06] rounded-t-xl'
            : 'h-full min-w-11 mr-1 border-r border-white/[0.06] rounded-l-xl'
        }`}
        onMouseDown={onDragStart}
        title="Drag toolbar"
        aria-label="Drag viewer toolbar"
      >
        {isVertical ? <GripHorizontal className="w-4 h-4" /> : <GripVertical className="w-4 h-4" />}
      </button>}

      {/* Tools Container */}
      <div className={`flex items-center gap-1.5 ${!docked && isVertical ? 'flex-col p-1' : 'flex-row'}`}>
        {visibleTools.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <button
              type="button"
              key={tool.id}
              onClick={() => onSelectTool(tool.id)}
              className={docked ? `min-h-11 shrink-0 rounded-lg px-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}` : `min-h-11 min-w-11 rounded-xl transition-all active:scale-95 border flex items-center justify-center ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50 scale-105 border-blue-500'
                  : 'bg-[#1e1f21] text-[#d0d6e0] hover:bg-[#28282c] hover:text-white border-transparent hover:border-white/[0.08]'
              } ${isVertical ? 'w-10 h-10' : 'p-2.5'}`}
              title={tool.label}
              aria-label={tool.label}
              aria-pressed={isActive}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              {docked && <span>{tool.label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default FloatingToolbar;
