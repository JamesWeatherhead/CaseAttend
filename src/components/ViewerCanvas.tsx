
import React, { useRef, useEffect, useId, useLayoutEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { Series, ToolMode, ViewportState, Point, Measurement, DicomWebConfig, SegmentationLayer, ViewerHandle, Segment, AiPointer } from '../types';
import { DEFAULT_VIEWPORT_STATE } from '../constants';
import { fetchDicomImageBlob, prefetchImage } from '../services/dicomService';
import { Loader2, AlertTriangle, Move } from 'lucide-react';

interface ViewerCanvasProps {
  series: Series | null;
  activeTool: ToolMode;
  dicomConfig: DicomWebConfig;
  connectionType: string | null;
  
  // Lifted State Props
  sliceIndex: number;
  onSliceChange: (index: number) => void;
  
  measurements: Measurement[];
  onMeasurementAdd: (m: Measurement) => void;
  onMeasurementUpdate: (m: Measurement) => void;
  activeMeasurementId: string | null;

  segmentationLayer: SegmentationLayer;
  onSegmentedSliceUpdate?: (sliceIndex: number, labelCount: number) => void;

  // New Prop: Enforce scrolling restrictions (e.g. for guided tour)
  isScrollEnabled?: boolean;

  // AI visual pointers (pulsing indicators on findings)
  aiPointers?: AiPointer[];
  getAnnotationAudit?: () => { revision: number; lastChangedAt?: string };
  onAnnotationMutation?: () => void;
  /** Neutral, answer-safe description exposed to assistive technology. */
  accessibleDescription?: string;
  /** Defense-in-depth interaction limits for a frozen participant condition. */
  interactionPolicy?: {
    allowFrameNavigation: boolean;
    allowWindowLevel: boolean;
    allowPanZoom: boolean;
    allowAnnotations: boolean;
    allowSegmentation: boolean;
  };
  /** Whether learner overlays are baked into the submitted JPEG. */
  includeAnnotationsInCapture?: boolean;
}

function pointToSegmentDistanceSquared(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return ((point.x - start.x) ** 2) + ((point.y - start.y) ** 2);
  }

  const projection = Math.max(0, Math.min(1, (
    ((point.x - start.x) * dx) + ((point.y - start.y) * dy)
  ) / ((dx * dx) + (dy * dy))));
  const closestX = start.x + (projection * dx);
  const closestY = start.y + (projection * dy);
  return ((point.x - closestX) ** 2) + ((point.y - closestY) ** 2);
}

function orientation(a: Point, b: Point, c: Point): number {
  return ((b.y - a.y) * (c.x - b.x)) - ((b.x - a.x) * (c.y - b.y));
}

function pointOnSegment(a: Point, b: Point, point: Point): boolean {
  return point.x >= Math.min(a.x, b.x)
    && point.x <= Math.max(a.x, b.x)
    && point.y >= Math.min(a.y, b.y)
    && point.y <= Math.max(a.y, b.y);
}

function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);
  const epsilon = Number.EPSILON * 16;

  if (((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon))
    && ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon))) {
    return true;
  }
  if (Math.abs(o1) <= epsilon && pointOnSegment(a1, a2, b1)) return true;
  if (Math.abs(o2) <= epsilon && pointOnSegment(a1, a2, b2)) return true;
  if (Math.abs(o3) <= epsilon && pointOnSegment(b1, b2, a1)) return true;
  if (Math.abs(o4) <= epsilon && pointOnSegment(b1, b2, a2)) return true;
  return false;
}

/** True only when a round-capped brush stroke can affect at least one image pixel. */
export function strokeTouchesImage(
  start: Point,
  end: Point,
  width: number,
  height: number,
  brushRadius: number,
): boolean {
  if (![start.x, start.y, end.x, end.y, width, height, brushRadius].every(Number.isFinite)) {
    return false;
  }
  if (width <= 0 || height <= 0 || brushRadius < 0) return false;

  const corners: [Point, Point, Point, Point] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const isInside = (point: Point) => (
    point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height
  );
  if (isInside(start) || isInside(end)) return true;

  const edges: Array<[Point, Point]> = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
  ];
  const radiusSquared = brushRadius * brushRadius;
  return edges.some(([edgeStart, edgeEnd]) => {
    if (segmentsIntersect(start, end, edgeStart, edgeEnd)) return true;
    return Math.min(
      pointToSegmentDistanceSquared(start, edgeStart, edgeEnd),
      pointToSegmentDistanceSquared(end, edgeStart, edgeEnd),
      pointToSegmentDistanceSquared(edgeStart, start, end),
      pointToSegmentDistanceSquared(edgeEnd, start, end),
    ) <= radiusSquared;
  });
}

const ViewerCanvas = forwardRef<ViewerHandle, ViewerCanvasProps>(({ 
  series, 
  activeTool, 
  dicomConfig, 
  connectionType,
  sliceIndex,
  onSliceChange,
  measurements,
  onMeasurementAdd,
  onMeasurementUpdate,
  activeMeasurementId,
  segmentationLayer,
  onSegmentedSliceUpdate,
  isScrollEnabled = true, // Default to enabled
  aiPointers,
  getAnnotationAudit,
  onAnnotationMutation,
  accessibleDescription,
  interactionPolicy,
  includeAnnotationsInCapture = true,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const accessibleDescriptionId = useId();
  const hasFittedRef = useRef(false);
  
  // Segmentation Data: Keyed by Series ID -> Slice Index
  // Map<SeriesID, Map<SliceIndex, Canvas>>
  const maskCacheRef = useRef<Map<string, Map<number, HTMLCanvasElement>>>(new Map());
  const renderCacheRef = useRef<Map<string, Map<number, HTMLCanvasElement>>>(new Map());
  const sliceSegmentIdsRef = useRef<Map<string, Map<number, Set<number>>>>(new Map());
  
  // Track current series ID to handle async restoration safely
  const currentSeriesIdRef = useRef<string | null>(null);
  
  // Local Viewport State (Pan/Zoom/WWWC only)
  const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEWPORT_STATE);
  const [renderTick, setRenderTick] = useState(0); // Used to force re-render during painting
  
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentImageBitmap, setCurrentImageBitmap] = useState<HTMLImageElement | null>(null);
  
  // Responsive Canvas State - Init to non-zero to ensure visibility
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 800, height: 600 });
  const lastSizeRef = useRef<{ width: number; height: number } | null>(null);

  // Interaction State (Refs for synchronous updates during high-frequency events)
  const interactionRef = useRef({
    isDragging: false,
    dragStart: null as Point | null,
    lastDrawPoint: null as Point | null,
    activeButton: null as number | null
  });

  // State for UI/Cursor feedback only
  const [isDraggingState, setIsDraggingState] = useState(false);

  // AI Pointer animation
  const pointerPhaseRef = useRef(0);
  const pointerAnimRef = useRef<number | null>(null);
  
  const [draftMeasurement, setDraftMeasurement] = useState<Measurement | null>(null);
  const loadedFrameRef = useRef<{ seriesId: string; frameIndex: number } | null>(null);
  
  // Helper to get caches for the current series
  const getSeriesCaches = () => {
    if (!series?.id) return null;
    const key = series.id;
    
    if (!maskCacheRef.current.has(key)) maskCacheRef.current.set(key, new Map());
    if (!renderCacheRef.current.has(key)) renderCacheRef.current.set(key, new Map());
    if (!sliceSegmentIdsRef.current.has(key)) sliceSegmentIdsRef.current.set(key, new Map());
    
    return {
       maskBySlice: maskCacheRef.current.get(key)!,
       renderBySlice: renderCacheRef.current.get(key)!,
       sliceIdsBySlice: sliceSegmentIdsRef.current.get(key)!
    };
  };

  // Expose Capabilities
  useImperativeHandle(ref, () => ({
    captureCurrentView: () => {
      const canvas = canvasRef.current;
      const loadedFrame = loadedFrameRef.current;
      if (
        !canvas
        || canvas.width <= 0
        || canvas.height <= 0
        || !series
        || !currentImageBitmap
        || !loadedFrame
        || loadedFrame.seriesId !== series.id
        || loadedFrame.frameIndex !== sliceIndex
      ) {
        return null;
      }

      // AI pointers are transient tutor output, not learner-authored evidence.
      // Re-render without them for the export, then immediately restore the
      // visible canvas. Learner measurements and segmentation remain included.
      renderScene(false, includeAnnotationsInCapture);
      try {
        const exported = document.createElement('canvas');
        exported.width = canvas.width;
        exported.height = canvas.height;
        const exportedContext = exported.getContext('2d');
        if (!exportedContext) return null;
        // Window/level is a CSS filter in the viewer. Bake the same filter into
        // the submitted pixels so the model receives what the learner saw.
        exportedContext.filter = getFilterStyle();
        exportedContext.drawImage(canvas, 0, 0);

        const sliceIdsBySlice = sliceSegmentIdsRef.current.get(series.id);
        const measurementCount = measurements.filter(
          (measurement) => measurement.sliceIndex === sliceIndex,
        ).length;
        const activeFrameLabelCount = sliceIdsBySlice?.get(sliceIndex)?.size ?? 0;
        const segmentedFrameCount = sliceIdsBySlice
          ? [...sliceIdsBySlice.values()].filter((ids) => ids.size > 0).length
          : 0;
        const audit = getAnnotationAudit?.() ?? { revision: 0 };

        return {
          image: exported.toDataURL('image/jpeg', 0.9),
          mimeType: 'image/jpeg' as const,
          width: exported.width,
          height: exported.height,
          capturePipelineVersion: 'caseattend-canvas-jpeg-v1' as const,
          seriesId: series.id,
          frameIndex: sliceIndex,
          frameCount: series.instances.length,
          annotation: {
            present: measurementCount > 0 || segmentedFrameCount > 0,
            measurementCount,
            segmentedFrameCount,
            activeFrameLabelCount,
            revision: audit.revision,
            ...(audit.lastChangedAt ? { lastChangedAt: audit.lastChangedAt } : {}),
          },
        };
      } finally {
        renderScene(true);
      }
    },
    removeSegment: (id: number) => {
      let removedSegment = false;
      // Iterate over all series caches to remove the segment ID
      maskCacheRef.current.forEach((maskBySlice, seriesKey) => {
          maskBySlice.forEach((canvas) => {
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;
            const w = canvas.width;
            const h = canvas.height;
            const imageData = ctx.getImageData(0, 0, w, h);
            const data = imageData.data;
            let dirty = false;
            
            for (let i = 0; i < data.length; i += 4) {
               // Check if this pixel belongs to the segment (ID stored in Red channel)
               // and is not fully transparent
               if (data[i] === id && data[i+3] > 0) {
                   data[i+3] = 0; // Clear alpha to 0 (erase)
                   dirty = true;
               }
            }
            
            if (dirty) {
               ctx.putImageData(imageData, 0, 0);
               removedSegment = true;
            }
          });
      });
      
      // Update tracking sets to remove this ID from all series/slices
      sliceSegmentIdsRef.current.forEach((sliceIdsBySlice, seriesKey) => {
          sliceIdsBySlice.forEach((ids, sliceIdx) => {
            if (ids.has(id)) {
                ids.delete(id);
                removedSegment = true;
                // Only notify if we are modifying the CURRENT visible series
                if (seriesKey === series?.id) {
                    onSegmentedSliceUpdate?.(sliceIdx, ids.size);
                }
            }
          });
      });
      if (removedSegment) onAnnotationMutation?.();
      
      // Clear all visual caches to force redraw everywhere
      renderCacheRef.current.forEach(map => map.clear());
      setRenderTick(t => t + 1);
    }
  }));

  // --- HELPER FUNCTIONS ---

  const getRenderCanvas = (sliceIdx: number, w: number, h: number, segments: Segment[]) => {
      const caches = getSeriesCaches();
      if (!caches) return null;
      const { renderBySlice, maskBySlice } = caches;

      // 1. Check Visual Cache
      if (renderBySlice.has(sliceIdx)) {
          return renderBySlice.get(sliceIdx);
      }

      // 2. Check Data Mask (ID Map)
      const maskCanvas = maskBySlice.get(sliceIdx);
      if (!maskCanvas) return null;

      // 3. Rebuild Visual Cache from Data Mask
      const renderCanvas = document.createElement('canvas');
      renderCanvas.width = w; renderCanvas.height = h;
      const rCtx = renderCanvas.getContext('2d');
      const mCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
      if (!rCtx || !mCtx) return null;

      const maskData = mCtx.getImageData(0, 0, w, h);
      const renderData = rCtx.createImageData(w, h); // Initialized to transparent black

      // Create lookup map for speed
      const segMap = new Map<number, {r:number, g:number, b:number}>();
      segments.forEach(s => {
         if (s.isVisible) {
             segMap.set(s.id, { r: s.color[0], g: s.color[1], b: s.color[2] });
         }
      });

      const src = maskData.data;
      const dst = renderData.data;
      const len = src.length;

      // Pixel Iteration: Map ID -> Color
      for (let i = 0; i < len; i += 4) {
          const alpha = src[i+3];
          
          if (alpha > 200) { 
              // Recover ID directly from Red channel.
              const id = src[i];
              
              const color = segMap.get(id);
              if (color) {
                  dst[i] = color.r;
                  dst[i+1] = color.g;
                  dst[i+2] = color.b;
                  dst[i+3] = 255; 
              }
          }
      }

      rCtx.putImageData(renderData, 0, 0);
      renderBySlice.set(sliceIdx, renderCanvas);
      return renderCanvas;
  };

  const renderLabelMap = (
      ctx: CanvasRenderingContext2D, 
      width: number, 
      height: number, 
      sliceIdx: number, 
      layer: SegmentationLayer
  ) => {
      const visualCanvas = getRenderCanvas(sliceIdx, width, height, layer.segments);
      if (visualCanvas) {
         ctx.save();
         ctx.globalAlpha = layer.opacity;
         ctx.drawImage(visualCanvas, 0, 0, width, height);
         ctx.restore();
      }
  };

  const getActiveMaskCanvas = (width: number, height: number): HTMLCanvasElement | null => {
     const caches = getSeriesCaches();
     if (!caches) return null;
     const { maskBySlice } = caches;
     
     if (!maskBySlice.has(sliceIndex)) {
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        maskBySlice.set(sliceIndex, c);
     }
     return maskBySlice.get(sliceIndex)!;
  };

  const recomputeSliceSegments = (sliceIdx: number) => {
    const caches = getSeriesCaches();
    if (!caches) return;
    const { sliceIdsBySlice, maskBySlice } = caches;
  
    const existing = sliceIdsBySlice.get(sliceIdx);
    if (!existing || existing.size === 0) return;
  
    const maskCanvas = maskBySlice.get(sliceIdx);
    if (!maskCanvas) {
      // No mask at all → clear set and badge
      sliceIdsBySlice.set(sliceIdx, new Set());
      onSegmentedSliceUpdate?.(sliceIdx, 0);
      return;
    }
  
    const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
  
    const { width, height } = maskCanvas;
    const { data } = ctx.getImageData(0, 0, width, height);
  
    const remaining = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];        // stored segment id
      const a = data[i + 3];    // alpha
      if (a > 0 && existing.has(r)) {
        remaining.add(r);
        // Optimization: if we found all existing IDs, we can stop early
        if (remaining.size === existing.size) break;
      }
    }
  
    // Only update and notify if something actually changed
    if (remaining.size !== existing.size) {
      sliceIdsBySlice.set(sliceIdx, remaining);
      onSegmentedSliceUpdate?.(sliceIdx, remaining.size);
    }
  };

  // --- MAIN RENDER FUNCTION ---
  const renderScene = (
    includeAiPointers = true,
    includeLearnerAnnotations = interactionPolicy?.allowAnnotations !== false,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!currentImageBitmap) return;

    ctx.save();
    
    // Transform
    ctx.translate(canvas.width / 2 + viewport.pan.x, canvas.height / 2 + viewport.pan.y);
    ctx.scale(viewport.scale, viewport.scale);
    
    // Enable high-quality image scaling for zoom
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Draw Image Centered
    const w = currentImageBitmap.width || 512;
    const h = currentImageBitmap.height || 512;
    ctx.translate(-w/2, -h/2);
    ctx.drawImage(currentImageBitmap, 0, 0, w, h);

    // --- SEGMENTATION LAYER RENDERING ---
    if (
      includeLearnerAnnotations
      && interactionPolicy?.allowSegmentation !== false
      && segmentationLayer.isVisible
    ) {
       renderLabelMap(ctx, w, h, sliceIndex, segmentationLayer);
    }

    // --- MEASUREMENT LAYER RENDERING ---
    const sliceMeasurements = includeLearnerAnnotations
      ? measurements.filter(m => m.sliceIndex === sliceIndex)
      : [];
    
    // Track occupied label space to resolve overlaps
    // Stores { x, y, w, h } in world (image) coordinates, but with scale factors accounted for collision
    const labelBoxes: {x: number, y: number, w: number, h: number}[] = [];

    const drawLine = (m: Measurement, isSelected: boolean) => {
      ctx.beginPath();
      ctx.strokeStyle = isSelected ? '#4ade80' : '#fbbf24'; 
      ctx.lineWidth = 2 / viewport.scale;
      ctx.moveTo(m.start.x, m.start.y);
      ctx.lineTo(m.end.x, m.end.y);
      ctx.stroke();

      const r = 4 / viewport.scale;
      ctx.fillStyle = isSelected ? '#4ade80' : '#fbbf24';
      ctx.beginPath(); ctx.arc(m.start.x, m.start.y, r, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.arc(m.end.x, m.end.y, r, 0, 6.28); ctx.fill();

      if (m.value > 0) {
        ctx.fillStyle = '#fff';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 4;
        const fontSize = 14 / viewport.scale;
        ctx.font = `bold ${fontSize}px monospace`;
        
        const mx = (m.start.x + m.end.x)/2;
        const my = (m.start.y + m.end.y)/2;
        const val = (m.value * 0.5).toFixed(1);
        const labelText = m.label ? `${m.label}: ` : '';
        const fullText = `${labelText}${val} mm`;
        
        const metrics = ctx.measureText(fullText);
        const textWidth = metrics.width;
        
        // Initial Position (offset by 10 pixels in image space)
        let textX = mx + 10;
        let textY = my;

        // Collision Resolution (Move down if overlapping)
        const padding = 2 / viewport.scale;
        let attempts = 0;
        const shiftStep = fontSize + padding;

        while (attempts < 10) {
            const collision = labelBoxes.some(box => {
                // AABB Collision Test
                const l1 = textX;
                const r1 = textX + textWidth;
                const t1 = textY - fontSize;
                const b1 = textY + (fontSize * 0.2); // Descent

                const l2 = box.x;
                const r2 = box.x + box.w;
                const t2 = box.y - box.h;
                const b2 = box.y + (box.h * 0.2);
                
                return !(l1 > r2 || r1 < l2 || t1 > b2 || b1 < t2);
            });

            if (!collision) break;
            
            // Shift down
            textY += shiftStep;
            attempts++;
        }

        labelBoxes.push({ x: textX, y: textY, w: textWidth, h: fontSize });

        ctx.fillText(fullText, textX, textY);
        ctx.shadowBlur = 0;
      }
    };

    sliceMeasurements.forEach(m => drawLine(m, m.id === activeMeasurementId));
    if (draftMeasurement) drawLine(draftMeasurement, true);

    // --- AI POINTER INDICATORS ---
    if (includeAiPointers && aiPointers && aiPointers.length > 0) {
      const phase = pointerPhaseRef.current;
      const pulse = Math.sin(phase * Math.PI * 2);

      aiPointers.forEach(pointer => {
        const px = (pointer.x / 100) * w;
        const py = (pointer.y / 100) * h;
        const baseR = 22 / viewport.scale;
        const ringR = baseR * (1 + 0.25 * pulse);

        // Outer glow
        const gradient = ctx.createRadialGradient(px, py, ringR * 0.5, px, py, ringR * 2);
        gradient.addColorStop(0, `rgba(59, 130, 246, ${0.15 + 0.08 * pulse})`);
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
        ctx.beginPath();
        ctx.arc(px, py, ringR * 2, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Ring
        ctx.beginPath();
        ctx.arc(px, py, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(96, 165, 250, ${0.7 + 0.25 * pulse})`;
        ctx.lineWidth = 2.5 / viewport.scale;
        ctx.stroke();

        // Center dot
        ctx.beginPath();
        ctx.arc(px, py, 3.5 / viewport.scale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(147, 197, 253, 0.95)';
        ctx.fill();

        // Label
        if (pointer.label) {
          const fontSize = 12 / viewport.scale;
          ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          ctx.shadowBlur = 6 / viewport.scale;
          ctx.fillText(pointer.label, px + ringR + 6 / viewport.scale, py + fontSize * 0.35);
          ctx.shadowBlur = 0;
        }
      });
    }

    ctx.restore();
  };

  // --- EFFECTS ---

  // 0. Resize Observer
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    
    let animationFrameId: number;
    const resizeObserver = new ResizeObserver((entries) => {
      animationFrameId = requestAnimationFrame(() => {
        if (!entries.length) return;
        const entry = entries[0];
        const { width, height } = entry.contentRect;

        if (width <= 0 || height <= 0) return;

        const newW = Math.round(width);
        const newH = Math.round(height);

        setCanvasSize((prev) => {
            if (!lastSizeRef.current) {
                lastSizeRef.current = { width: newW, height: newH };
                return { width: newW, height: newH };
            }

            const prevW = lastSizeRef.current.width;
            const prevH = lastSizeRef.current.height;

            if (prevW === newW && prevH === newH) return prev;

            const deltaX = (newW - prevW) / 2;
            const deltaY = (newH - prevH) / 2;

            setViewport((vp) => ({
                ...vp,
                pan: {
                    x: vp.pan.x + deltaX,
                    y: vp.pan.y + deltaY,
                },
            }));

            lastSizeRef.current = { width: newW, height: newH };
            return { width: newW, height: newH };
        });
      });
    });

    resizeObserver.observe(containerRef.current);
    return () => {
        resizeObserver.disconnect();
        cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Update current series ID ref
  useEffect(() => {
      currentSeriesIdRef.current = series?.id || null;
  }, [series?.id]);

  // 1. Reset Viewport on Series Change
  useEffect(() => {
    if (series) {
      setViewport(DEFAULT_VIEWPORT_STATE);
      setLoadError(null);
      setRenderTick(0);
      setCurrentImageBitmap(null);
      hasFittedRef.current = false;

      setTimeout(() => {
        if (currentSeriesIdRef.current !== series.id) return;
        const caches = getSeriesCaches();
        if (caches && caches.sliceIdsBySlice.size > 0) {
            caches.sliceIdsBySlice.forEach((ids, idx) => {
                onSegmentedSliceUpdate?.(idx, ids.size);
            });
        }
      }, 0);
    }
  }, [series?.id]);

  // Fit to View Logic
  useLayoutEffect(() => {
    if (currentImageBitmap && !hasFittedRef.current && canvasSize.width > 0 && canvasSize.height > 0) {
      const imgW = currentImageBitmap.width || 512;
      const imgH = currentImageBitmap.height || 512;
      if (imgW === 0 || imgH === 0) return;

      const scaleX = canvasSize.width / imgW;
      const scaleY = canvasSize.height / imgH;
      const scale = Math.max(0.05, Math.min(scaleX, scaleY) * 0.95);
      
      setViewport(prev => ({ ...prev, scale, pan: { x: 0, y: 0 } }));
      hasFittedRef.current = true;
    }
  }, [currentImageBitmap, canvasSize.width, canvasSize.height]);

  // 2. Invalidate Render Cache when Segment Definitions Change
  useEffect(() => {
    renderCacheRef.current.forEach(map => map.clear());
    setRenderTick(t => t + 1);
  }, [segmentationLayer.segments]);

  // 3. PERFORMANCE: Intelligent Prefetching
  // Whenever the sliceIndex changes, we look ahead and behind to start loading neighboring images into the cache.
  // This makes scrolling feel instantaneous.
  useEffect(() => {
    if (!series || !series.instances) return;
    
    // Look ahead 5 frames, look behind 2 frames
    const neighbors = [];
    for (let i = 1; i <= 5; i++) neighbors.push(sliceIndex + i);
    for (let i = 1; i <= 2; i++) neighbors.push(sliceIndex - i);
    
    neighbors.forEach(idx => {
        if (idx >= 0 && idx < series.instances.length) {
            prefetchImage(series.instances[idx]);
        }
    });
  }, [sliceIndex, series]);

  // 4. Fetch Image Data (Current Frame)
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    loadedFrameRef.current = null;

    const loadFrame = async () => {
      if (!series || series.instances.length === 0) return;
      setIsImageLoading(true);
      setLoadError(null);

      if (sliceIndex < 0 || sliceIndex >= series.instances.length) {
         setLoadError(`Index ${sliceIndex} out of bounds`);
         setIsImageLoading(false);
         return;
      }

      const url = series.instances[sliceIndex];
      try {
        // Fetch Blob (Will use Memory Cache if available)
        const blob = await fetchDicomImageBlob(dicomConfig, url);
        
        if (!active) return;

        objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.src = objectUrl;
        
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        if (active) {
          setCurrentImageBitmap(img);
          loadedFrameRef.current = { seriesId: series.id, frameIndex: sliceIndex };
          setIsImageLoading(false);
        }
      } catch (err: any) {
        if (active) {
          console.error("Frame Load Error", err);
          setLoadError("Failed to render frame: " + (err.message || "Unknown error"));
          setIsImageLoading(false);
        }
      }
    };

    loadFrame();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [series, sliceIndex, connectionType, dicomConfig]);

  // 5. Render Loop
  useLayoutEffect(() => {
    renderScene();
  }, [viewport, currentImageBitmap, measurements, activeMeasurementId, draftMeasurement, sliceIndex, segmentationLayer, renderTick, canvasSize, aiPointers]);

  // 6. AI Pointer Animation Loop
  useEffect(() => {
    if (!aiPointers || aiPointers.length === 0) {
      if (pointerAnimRef.current) {
        cancelAnimationFrame(pointerAnimRef.current);
        pointerAnimRef.current = null;
      }
      pointerPhaseRef.current = 0;
      return;
    }

    const animate = () => {
      pointerPhaseRef.current = (Date.now() % 1800) / 1800; // 1.8s cycle
      renderScene();
      pointerAnimRef.current = requestAnimationFrame(animate);
    };
    pointerAnimRef.current = requestAnimationFrame(animate);

    return () => {
      if (pointerAnimRef.current) {
        cancelAnimationFrame(pointerAnimRef.current);
        pointerAnimRef.current = null;
      }
    };
  }, [aiPointers]);


  // --- INTERACTION HANDLERS ---

  const getCanvasPoint = (e: { clientX: number; clientY: number }): Point => {
     const canvas = canvasRef.current;
     if (!canvas) return { x: 0, y: 0 };
     const rect = canvas.getBoundingClientRect();
     const x = e.clientX - rect.left;
     const y = e.clientY - rect.top;
     
     const centeredX = x - canvas.width/2 - viewport.pan.x;
     const centeredY = y - canvas.height/2 - viewport.pan.y;
     return { 
       x: (centeredX / viewport.scale) + (currentImageBitmap?.width || 512)/2, 
       y: (centeredY / viewport.scale) + (currentImageBitmap?.height || 512)/2 
     };
  };

  const handleMouseDown = (
    e: React.MouseEvent<HTMLCanvasElement> | React.PointerEvent<HTMLCanvasElement>,
  ) => {
    e.preventDefault(); 

    const annotationTool = activeTool === ToolMode.MEASURE;
    const segmentationTool = activeTool === ToolMode.BRUSH || activeTool === ToolMode.ERASER;
    if (
      (e.button === 1 && interactionPolicy?.allowPanZoom === false)
      || (activeTool === ToolMode.PAN && interactionPolicy?.allowPanZoom === false)
      || (activeTool === ToolMode.ZOOM && interactionPolicy?.allowPanZoom === false)
      || (activeTool === ToolMode.WINDOW_LEVEL && interactionPolicy?.allowWindowLevel === false)
      || (activeTool === ToolMode.SCROLL && interactionPolicy?.allowFrameNavigation === false)
      || (annotationTool && interactionPolicy?.allowAnnotations === false)
      || (segmentationTool && (
        interactionPolicy?.allowAnnotations === false
        || interactionPolicy?.allowSegmentation === false
      ))
    ) return;
    
    interactionRef.current.isDragging = true;
    interactionRef.current.dragStart = { x: e.clientX, y: e.clientY };
    interactionRef.current.activeButton = e.button;
    
    setIsDraggingState(true);

    if (e.button === 1) return;

    const p = getCanvasPoint(e);

    if (e.button === 0) {
        if (activeTool === ToolMode.MEASURE) {
            setDraftMeasurement({
                id: 'draft',
                start: p, end: p, value: 0,
                sliceIndex: sliceIndex,
                createdAt: Date.now()
            });
        }
        
        const isPaintTool = activeTool === ToolMode.BRUSH || activeTool === ToolMode.ERASER;
        if (isPaintTool && segmentationLayer.isVisible && currentImageBitmap) {
            if (activeTool === ToolMode.BRUSH && !segmentationLayer.activeSegmentId) return;
            interactionRef.current.lastDrawPoint = p;
            paintOnMask(p, p);
        }
    }
  };

  const paintOnMask = (p1: Point, p2: Point): boolean => {
     if (!currentImageBitmap) return false;
     const w = currentImageBitmap.width || 512;
     const h = currentImageBitmap.height || 512;
     const isEraser = activeTool === ToolMode.ERASER;
     const size = segmentationLayer.brushSize;
     const segId = segmentationLayer.activeSegmentId;

     // A missing segment is not a valid learner annotation, and a stroke whose
     // round brush footprint never reaches the image must be a true no-op. In
     // particular, neither case may advance audit timing or claim that this
     // frame has segmentation when the exported pixels are unchanged.
     if (!isEraser && (
       segId === null
       || !segmentationLayer.segments.some((segment) => segment.id === segId)
     )) return false;
     if (!strokeTouchesImage(p1, p2, w, h, size / 2)) return false;
     
     const maskCanvas = getActiveMaskCanvas(w, h);
     if (!maskCanvas) return false;
     
     const ctxMask = maskCanvas.getContext('2d');
     if (!ctxMask) return false;

     // Snapshot only the affected mask rectangle. Erasing transparent pixels
     // must not advance the learner annotation audit clock or manufacture a
     // session event when the visible artifact is unchanged.
     const eraserRadius = (size / 2) + 2;
     const eraseX = Math.max(0, Math.floor(Math.min(p1.x, p2.x) - eraserRadius));
     const eraseY = Math.max(0, Math.floor(Math.min(p1.y, p2.y) - eraserRadius));
     const eraseRight = Math.min(w, Math.ceil(Math.max(p1.x, p2.x) + eraserRadius));
     const eraseBottom = Math.min(h, Math.ceil(Math.max(p1.y, p2.y) + eraserRadius));
     const eraseWidth = eraseRight - eraseX;
     const eraseHeight = eraseBottom - eraseY;
     const eraseBefore = isEraser && eraseWidth > 0 && eraseHeight > 0
       ? ctxMask.getImageData(eraseX, eraseY, eraseWidth, eraseHeight)
       : null;
     
     const visualCanvas = getRenderCanvas(sliceIndex, w, h, segmentationLayer.segments);
     const ctxVisual = visualCanvas?.getContext('2d');

     if (!isEraser && segId !== null) {
         const caches = getSeriesCaches();
         if (caches) {
             const { sliceIdsBySlice } = caches;
             let sliceSets = sliceIdsBySlice.get(sliceIndex);
             if (!sliceSets) {
                 sliceSets = new Set();
                 sliceIdsBySlice.set(sliceIndex, sliceSets);
             }
             if (!sliceSets.has(segId)) {
                 sliceSets.add(segId);
                 onSegmentedSliceUpdate?.(sliceIndex, sliceSets.size);
             }
         }
     }

     let visualColor = 'rgba(0,0,0,0)';
     if (!isEraser && segId !== null) {
         const seg = segmentationLayer.segments.find(s => s.id === segId);
         if (seg) visualColor = `rgb(${seg.color.join(',')})`;
     }

     const drawStroke = (ctx: CanvasRenderingContext2D, isMask: boolean) => {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = size;

        if (isEraser) {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
            ctx.fillStyle = 'rgba(0,0,0,1)';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            if (isMask) {
                ctx.strokeStyle = `rgb(${segId}, 0, 0)`;
                ctx.fillStyle = `rgb(${segId}, 0, 0)`; 
            } else {
                ctx.strokeStyle = visualColor;
                ctx.fillStyle = visualColor;
            }
        }

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        const passes = (isMask && !isEraser) ? 8 : 1;
        for (let i = 0; i < passes; i++) ctx.stroke();

        ctx.beginPath();
        ctx.arc(p1.x, p1.y, size/2, 0, Math.PI*2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, size/2, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
     };

     drawStroke(ctxMask, true);
     if (isEraser && eraseBefore) {
       const eraseAfter = ctxMask.getImageData(eraseX, eraseY, eraseWidth, eraseHeight);
       const changed = eraseBefore.data.some((value, index) => value !== eraseAfter.data[index]);
       if (!changed) return false;
     }
     if (ctxVisual) drawStroke(ctxVisual, false);
     onAnnotationMutation?.();
     renderScene();

     if (isEraser) {
       recomputeSliceSegments(sliceIndex);
     }
     return true;
  };

  const handleMouseMove = (
    e: React.MouseEvent<HTMLCanvasElement> | React.PointerEvent<HTMLCanvasElement>,
  ) => {
    if (!interactionRef.current.isDragging) return;
    
    const { activeButton, dragStart } = interactionRef.current;
    
    if (activeButton === 1 && dragStart && interactionPolicy?.allowPanZoom !== false) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        setViewport(p => ({ ...p, pan: { x: p.pan.x + dx, y: p.pan.y + dy }}));
        interactionRef.current.dragStart = { x: e.clientX, y: e.clientY };
        return;
    }

    if (
      activeButton === 0
      && interactionPolicy?.allowAnnotations !== false
      && interactionPolicy?.allowSegmentation !== false
      && (activeTool === ToolMode.BRUSH || activeTool === ToolMode.ERASER)
    ) {
        const lastP = interactionRef.current.lastDrawPoint;
        if (lastP) {
           const p = getCanvasPoint(e);
           paintOnMask(lastP, p);
           interactionRef.current.lastDrawPoint = p;
           return;
        }
    }

    if (!dragStart || !series) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    if (activeTool === ToolMode.PAN && activeButton === 0 && interactionPolicy?.allowPanZoom !== false) {
      setViewport(p => ({ ...p, pan: { x: p.pan.x + dx, y: p.pan.y + dy }}));
      interactionRef.current.dragStart = { x: e.clientX, y: e.clientY };
    } else if (activeTool === ToolMode.ZOOM && activeButton === 0 && interactionPolicy?.allowPanZoom !== false) {
      const zoomFactor = 1 + (dy * -0.005);
      setViewport(p => ({ ...p, scale: Math.max(0.1, Math.min(5, p.scale * zoomFactor)) }));
      interactionRef.current.dragStart = { x: e.clientX, y: e.clientY };
    } else if (activeTool === ToolMode.WINDOW_LEVEL && activeButton === 0 && interactionPolicy?.allowWindowLevel !== false) {
      setViewport(p => ({ 
        ...p, 
        windowWidth: p.windowWidth + dx * 2, 
        windowCenter: p.windowCenter - dy * 2 
      }));
      interactionRef.current.dragStart = { x: e.clientX, y: e.clientY };
    } else if (activeTool === ToolMode.SCROLL && activeButton === 0) {
      // SCROLL BLOCKING for drag gesture
      if (isScrollEnabled === false || interactionPolicy?.allowFrameNavigation === false) return;

      if (Math.abs(dy) > 10) {
        const dir = dy > 0 ? 1 : -1;
        const max = series.instances.length || series.instanceCount;
        const next = Math.max(0, Math.min(max - 1, sliceIndex + dir));
        if (next !== sliceIndex) {
            onSliceChange(next);
            interactionRef.current.dragStart = { x: e.clientX, y: e.clientY };
        }
      }
    } else if (
      activeTool === ToolMode.MEASURE
      && draftMeasurement
      && activeButton === 0
      && interactionPolicy?.allowAnnotations !== false
    ) {
      const p = getCanvasPoint(e);
      const dist = Math.sqrt(Math.pow(p.x - draftMeasurement.start.x, 2) + Math.pow(p.y - draftMeasurement.start.y, 2));
      setDraftMeasurement({ ...draftMeasurement, end: p, value: dist });
    }
  };

  const handleMouseUp = () => {
    interactionRef.current.isDragging = false;
    interactionRef.current.dragStart = null;
    interactionRef.current.lastDrawPoint = null;
    interactionRef.current.activeButton = null;
    setIsDraggingState(false);

    if (activeTool === ToolMode.MEASURE && draftMeasurement) {
      if (draftMeasurement.value > 5) {
         onMeasurementAdd({
             ...draftMeasurement,
             id: Date.now().toString(),
             label: `M${measurements.length + 1}`
         });
      }
      setDraftMeasurement(null);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    handleMouseDown(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse') return;
    handleMouseMove(e);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse') return;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    handleMouseUp();
  };
  
  const handleWheel = (e: React.WheelEvent) => {
     const isZoomAction = e.ctrlKey || e.metaKey || activeTool === ToolMode.ZOOM;

     if (isZoomAction) {
         if (interactionPolicy?.allowPanZoom === false) return;
         const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
         setViewport(p => ({ 
             ...p, 
             scale: Math.max(0.1, Math.min(5, p.scale * zoomFactor) )
         }));
     } else {
        // SCROLL BLOCKING for mouse wheel
        if (isScrollEnabled === false || interactionPolicy?.allowFrameNavigation === false) return;

        const dir = e.deltaY > 0 ? 1 : -1;
        const max = series?.instances.length || series?.instanceCount || 0;
        const next = Math.max(0, Math.min(max - 1, sliceIndex + dir));
        onSliceChange(next);
     }
  };

  const centerView = () => {
    if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const newW = Math.round(rect.width);
        const newH = Math.round(rect.height);
        if (newW <= 0 || newH <= 0) return;
        setCanvasSize(prev => {
            if (prev.width === newW && prev.height === newH) return prev;
            lastSizeRef.current = { width: newW, height: newH };
            return { width: newW, height: newH };
        });
    }
    setViewport((vp) => ({ ...vp, pan: { x: 0, y: 0 } }));
  };

  const getFilterStyle = () => {
    const c = (DEFAULT_VIEWPORT_STATE.windowWidth / viewport.windowWidth) * 100;
    const b = 100 + ((DEFAULT_VIEWPORT_STATE.windowCenter - viewport.windowCenter) / 5);
    return `contrast(${Math.max(0, c)}%) brightness(${Math.max(0, b)}%)`;
  };

  const handleCanvasKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const maxFrame = Math.max(0, (series?.instances.length || series?.instanceCount || 1) - 1);
    let nextFrame: number | null = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
      nextFrame = Math.max(0, sliceIndex - 1);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
      nextFrame = Math.min(maxFrame, sliceIndex + 1);
    } else if (e.key === 'Home') {
      nextFrame = 0;
    } else if (e.key === 'End') {
      nextFrame = maxFrame;
    } else if ((e.key === '+' || e.key === '=') && interactionPolicy?.allowPanZoom !== false) {
      e.preventDefault();
      setViewport((previous) => ({ ...previous, scale: Math.min(5, previous.scale * 1.1) }));
      return;
    } else if (e.key === '-' && interactionPolicy?.allowPanZoom !== false) {
      e.preventDefault();
      setViewport((previous) => ({ ...previous, scale: Math.max(0.1, previous.scale * 0.9) }));
      return;
    }

    if (
      nextFrame !== null
      && isScrollEnabled !== false
      && interactionPolicy?.allowFrameNavigation !== false
    ) {
      e.preventDefault();
      if (nextFrame !== sliceIndex) onSliceChange(nextFrame);
    }
  };

  if (!series) {
    return <div className="flex-1 bg-black flex items-center justify-center text-gray-500">Select a series</div>;
  }

  const hasMultipleFrames = series.instanceCount > 1;
  const keyboardFrameNavigationAvailable = hasMultipleFrames
    && isScrollEnabled !== false
    && interactionPolicy?.allowFrameNavigation !== false;
  const keyboardZoomAvailable = interactionPolicy?.allowPanZoom !== false;
  const activeToolOwnsTouch = (
    (activeTool === ToolMode.PAN || activeTool === ToolMode.ZOOM)
      ? interactionPolicy?.allowPanZoom !== false
      : activeTool === ToolMode.WINDOW_LEVEL
        ? interactionPolicy?.allowWindowLevel !== false
        : activeTool === ToolMode.SCROLL
          ? keyboardFrameNavigationAvailable
          : activeTool === ToolMode.MEASURE
            ? interactionPolicy?.allowAnnotations !== false
            : (activeTool === ToolMode.BRUSH || activeTool === ToolMode.ERASER)
              ? interactionPolicy?.allowAnnotations !== false
                && interactionPolicy?.allowSegmentation !== false
              : false
  );
  const keyboardInstructions = [
    keyboardFrameNavigationAvailable
      ? 'Use arrow keys, Home, or End to change views.'
      : '',
    keyboardZoomAvailable
      ? 'Use plus or minus to zoom.'
      : '',
  ].filter(Boolean).join(' ')
    || 'Viewer keyboard controls are frozen for this study.';
  const scrollPct = series.instanceCount > 0 ? (sliceIndex / series.instanceCount) * 100 : 0;
  
  let cursorStyle = 'default';
  if (activeTool === ToolMode.PAN || (interactionRef.current.activeButton === 1 && isDraggingState)) cursorStyle = 'move';
  else if (activeTool === ToolMode.BRUSH || activeTool === ToolMode.ERASER) cursorStyle = 'crosshair';
  else if (activeTool === ToolMode.ZOOM) cursorStyle = 'zoom-in';

  return (
    <div 
        className="flex-1 bg-black relative overflow-hidden select-none flex items-center justify-center" 
        ref={containerRef} 
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()} 
    >
      {accessibleDescription && (
        <span id={accessibleDescriptionId} className="sr-only">
          {accessibleDescription}
        </span>
      )}
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleCanvasKeyDown}
        tabIndex={0}
        role="img"
        aria-describedby={accessibleDescription ? accessibleDescriptionId : undefined}
        aria-label={`${series.description || series.modality}. Current view ${sliceIndex + 1} of ${Math.max(1, series.instanceCount)}. ${keyboardInstructions}`}
        style={{ 
          cursor: cursorStyle,
          filter: getFilterStyle(),
          // Pointer mode and frozen controls leave vertical pan/pinch zoom to
          // the participant page, which is the sole mobile scroll owner.
          touchAction: activeToolOwnsTouch ? 'none' : 'pan-y pinch-zoom',
        }}
        className="block"
      />
      
      {keyboardFrameNavigationAvailable && (
        <div
          data-testid="slice-scrollbar"
          className="absolute right-2 top-4 bottom-4 w-1.5 bg-gray-800 rounded-full overflow-hidden opacity-50 hover:opacity-100 transition-opacity pointer-events-none"
        >
           <div
             className="bg-blue-500 w-full rounded-full"
             style={{ height: '5%', top: `${scrollPct}%`, position: 'absolute' }}
           />
        </div>
      )}

      {isImageLoading && (
        <div className="absolute top-4 right-8 text-blue-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}

      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-50">
           <div className="bg-red-900/80 p-4 rounded text-red-200 flex flex-col items-center max-w-md text-center">
             <AlertTriangle className="w-8 h-8 mb-2" />
             <p className="font-bold mb-1">Load Failed</p>
             <p className="text-sm opacity-90">{loadError}</p>
           </div>
        </div>
      )}

      <div className="absolute top-4 left-4 text-xs font-mono text-lime-400 pointer-events-none drop-shadow-md">
        <div className="text-sm font-bold text-white mb-1">
          {series.description && series.description !== 'No Description' ? series.description : series.modality}
        </div>
        <div>Modality: {series.modality}</div>
        <div>Scale: {viewport.scale.toFixed(2)}x</div>
        {segmentationLayer.isVisible && <div className="text-emerald-400 mt-1">Annotations: On</div>}
      </div>
      <div className="absolute bottom-4 right-8 flex items-center gap-3 text-xs font-mono pointer-events-auto">
        <button
            type="button"
            onClick={centerView}
            className="min-h-11 px-3 py-1 rounded-md bg-slate-800/80 text-slate-100 border border-slate-600 hover:bg-slate-700/90 flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
            <Move className="w-3 h-3" />
            Center view
        </button>

        {hasMultipleFrames && (
          <span
            data-testid="frame-counter"
            className="text-blue-400 drop-shadow-md pointer-events-none"
          >
              Image: {sliceIndex + 1} / {series.instanceCount}
          </span>
        )}
      </div>
    </div>
  );
});

export default React.memo(ViewerCanvas);
