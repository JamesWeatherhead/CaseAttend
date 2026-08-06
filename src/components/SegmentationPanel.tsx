
import React, { useState } from 'react';
import { SegmentationLayer, Segment, ToolMode } from '../types';
import {
  Eye,
  EyeOff,
  Activity,
  Brush,
  MousePointer2,
  Circle,
  Plus,
  Eraser,
  Layers,
  Edit2,
  HelpCircle,
  X
} from 'lucide-react';

interface SegmentationPanelProps {
  layer: SegmentationLayer;
  onChange: (layer: SegmentationLayer) => void;
  activeTool: ToolMode;
  onSelectTool: (tool: ToolMode) => void;
  onClearSegment?: (id: number) => void;
  onJumpToSlice?: (index: number) => void;
  onStartTour?: () => void;
}

const componentToHex = (c: number) => {
  const hex = c.toString(16);
  return hex.length === 1 ? "0" + hex : hex;
};

const rgbToHex = (r: number, g: number, b: number) => {
  return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
};

const SegmentationPanel: React.FC<SegmentationPanelProps> = ({
  layer,
  onChange,
  activeTool,
  onSelectTool,
  onClearSegment,
  onJumpToSlice,
  onStartTour
}) => {
  // New label form state
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState<string>('#34d399'); // emerald-ish default

  const toggleGlobalVisibility = () => {
    onChange({ ...layer, isVisible: !layer.isVisible });
  };

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...layer, opacity: parseFloat(e.target.value) });
  };

  const setActiveSegment = (id: number) => {
    onChange({ ...layer, activeSegmentId: id });
    // Automatically switch to Brush when picking a segment
    if (activeTool !== ToolMode.BRUSH) {
      onSelectTool(ToolMode.BRUSH);
    }
  };

  const hexToRgb = (hex: string): [number, number, number] => {
    const clean = hex.replace('#', '');
    const bigint = parseInt(clean, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return [r, g, b];
  };

  const handleAddSegment = () => {
    const label =
      newLabelName.trim() || `Label ${layer.segments.length + 1}`;
    const color = hexToRgb(newLabelColor);

    const newSegment: Segment = {
      id:
        layer.segments.reduce(
          (max, s) => Math.max(max, s.id),
          0,
        ) + 1,
      label,
      color,
      isVisible: true,
    };

    onChange({
      ...layer,
      segments: [...layer.segments, newSegment],
      activeSegmentId: newSegment.id,
    });
    setNewLabelName('');
  };

  const toolButtonClasses = (tool: ToolMode) =>
    `flex-1 flex items-center justify-center gap-1 py-1.5 rounded-full text-[10px] font-bold border transition-colors ${
      activeTool === tool
        ? 'bg-emerald-600 border-emerald-500 text-white'
        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
    }`;

  // Sort slices for display
  const sortedSlices = [...(layer.segmentedSlices || [])].sort((a, b) => a.sliceIndex - b.sliceIndex);

  return (
    <div className="w-full bg-[#0f1011] border-l border-white/[0.06] flex flex-col h-full">
      {/* Header */}
      <div data-tour-id="seg-header" className="h-14 bg-[#161718] border-b border-white/[0.06] px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 text-slate-100 font-bold">
          <Activity className="w-4 h-4 text-emerald-500" />
          <span>Annotation</span>
          {onStartTour && (
              <button
                  onClick={onStartTour}
                  className="ml-2 text-[10px] text-emerald-300 hover:text-white flex items-center gap-1 transition-colors"
                  title="Tour the Annotation panel"
              >
                  <HelpCircle className="w-3.5 h-3.5" />
              </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleGlobalVisibility}
            className={`p-1.5 rounded transition-colors ${
              layer.isVisible
                ? 'text-emerald-400 bg-emerald-950'
                : 'text-slate-500 hover:text-slate-300'
            }`}
            title={
              layer.isVisible
                ? 'Hide Annotations'
                : 'Show Annotations'
            }
          >
            {layer.isVisible ? (
              <Eye className="w-4 h-4" />
            ) : (
              <EyeOff className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Layer Controls */}
      <div data-tour-id="seg-controls" className="p-4 border-b border-white/[0.06] bg-[#161718]/50 space-y-3 flex-shrink-0">
        {/* Tool mode buttons */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => onSelectTool(ToolMode.POINTER)}
            className={toolButtonClasses(ToolMode.POINTER)}
            title="Pointer / select"
          >
            <MousePointer2 className="w-3.5 h-3.5" />
            Pointer
          </button>
          <button
            onClick={() => onSelectTool(ToolMode.BRUSH)}
            className={toolButtonClasses(ToolMode.BRUSH)}
            title="Paint with active label"
          >
            <Brush className="w-3.5 h-3.5" />
            Brush
          </button>
          <button
            onClick={() => onSelectTool(ToolMode.ERASER)}
            className={toolButtonClasses(ToolMode.ERASER)}
            title="Erase annotations"
          >
            <Eraser className="w-3.5 h-3.5" />
            Eraser
          </button>
        </div>

        {/* Opacity + brush size */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
              <Circle className="w-3 h-3" />
              Global Opacity
            </span>
            <span className="text-xs font-mono text-slate-400">
              {(layer.opacity * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={layer.opacity}
            onChange={handleOpacityChange}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500 mb-4"
          />

          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
              <Circle className="w-3 h-3" />
              Brush Size
            </span>
            <span className="text-xs font-mono text-slate-400">
              {layer.brushSize}px
            </span>
          </div>
          <input
            type="range"
            min="0.5"
            max="50"
            step="0.5"
            value={layer.brushSize}
            onChange={(e) =>
              onChange({
                ...layer,
                brushSize: parseFloat(e.target.value),
              })
            }
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
        </div>
      </div>

      {/* Main Content Area: Flex List */}
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-slate-950 [&::-webkit-scrollbar-thumb]:bg-slate-800 hover:[&::-webkit-scrollbar-thumb]:bg-slate-700">
        
        {/* Segmented Slices List */}
        <div className="border-b border-slate-800">
             <div className="px-4 py-2 text-xs font-bold text-slate-500 uppercase bg-slate-950 flex flex-col">
                <span className="flex items-center gap-2"><Layers className="w-3 h-3" /> Annotated Slices</span>
                <span className="text-[9px] text-slate-600 font-normal mt-0.5 normal-case">Click to jump viewer</span>
             </div>
             <div className="px-2 pb-2">
                {sortedSlices.length === 0 ? (
                    <div className="p-4 text-center text-[10px] text-slate-600 italic">
                        No slices painted yet - pick a label and use Brush to start annotating.
                    </div>
                ) : (
                    <div className="space-y-1">
                        {sortedSlices.map((sliceInfo) => (
                            <div 
                                key={sliceInfo.sliceIndex}
                                onClick={() => onJumpToSlice && onJumpToSlice(sliceInfo.sliceIndex)}
                                className="flex items-center justify-between px-3 py-2 text-xs text-slate-300 hover:bg-slate-900 cursor-pointer rounded border border-transparent hover:border-slate-800 transition-colors group"
                            >
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                    <span className="font-mono">Slice {sliceInfo.sliceIndex + 1}</span>
                                </div>
                                <span className="px-1.5 py-0.5 bg-slate-800 rounded text-[9px] text-slate-500 font-medium">
                                   {sliceInfo.labelCount} label{sliceInfo.labelCount !== 1 ? 's' : ''}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
             </div>
        </div>

        {/* Segments Palette */}
        <div data-tour-id="seg-palette" className="px-4 py-2 text-xs font-bold text-slate-500 uppercase bg-slate-950 sticky top-0 border-b border-slate-800 flex flex-col gap-2 mt-2">
          <div className="flex justify-between items-center">
            <span>Labels</span>
            <span className="text-[10px] text-slate-600 font-normal">
              {layer.segments.length} items
            </span>
          </div>

          {/* New label row */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              placeholder="New label..."
              className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-emerald-500"
            />
            <input
              type="color"
              value={newLabelColor}
              onChange={(e) => setNewLabelColor(e.target.value)}
              className="w-8 h-7 rounded border border-slate-700 cursor-pointer bg-transparent"
              title="Label color"
            />
            <button
              onClick={handleAddSegment}
              className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Add
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-800/50">
          {layer.segments.map((seg) => {
            const isActive = layer.activeSegmentId === seg.id;
            return (
              <div
                key={seg.id}
                onClick={() => setActiveSegment(seg.id)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-emerald-900/20'
                    : 'hover:bg-slate-900'
                }`}
              >
                <div className="relative w-4 h-4 flex-shrink-0 group">
                   <div 
                      className="absolute inset-0 w-4 h-4 rounded-full shadow-sm ring-1 ring-white/10 pointer-events-none"
                      style={{
                        backgroundColor: `rgb(${seg.color.join(',')})`,
                      }}
                   />
                   <input
                      type="color"
                      value={rgbToHex(seg.color[0], seg.color[1], seg.color[2])}
                      onChange={(e) => {
                          const newColor = hexToRgb(e.target.value);
                          const updated = layer.segments.map(s => s.id === seg.id ? { ...s, color: newColor } : s);
                          onChange({ ...layer, segments: updated });
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      title="Change color"
                   />
                </div>

                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={seg.label}
                    onChange={(e) => {
                         const updated = layer.segments.map(s => s.id === seg.id ? { ...s, label: e.target.value } : s);
                         onChange({ ...layer, segments: updated });
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        setActiveSegment(seg.id);
                    }}
                    className={`w-full bg-transparent border-b border-transparent focus:border-emerald-500 focus:outline-none text-sm font-medium truncate py-0.5 transition-colors ${
                       isActive ? 'text-white' : 'text-slate-400 hover:border-slate-700'
                    }`}
                  />
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onClearSegment) onClearSegment(seg.id);
                  }}
                  className="flex-shrink-0 p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                  title="Clear all annotations for this label"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-3 bg-[#161718] border-t border-white/[0.06] text-[10px] text-[#8a8f98] text-center flex-shrink-0">
        Select a label, then use Brush to paint or Eraser to remove
      </div>
    </div>
  );
};

export default SegmentationPanel;
