

import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import StudyList from './components/StudyList';
import ViewerCanvas from './components/ViewerCanvas';
import SeriesSelector from './components/SeriesSelector';
import MeasurementPanel from './components/MeasurementPanel';
import SegmentationPanel from './components/SegmentationPanel';
import AiAssistantPanel from './components/AiAssistantPanel';
import SafetyModal from './components/SafetyModal';
import GuidedTour, { TourId } from './components/GuidedTour';
import FloatingToolbar from './components/FloatingToolbar';
import { TOOLS, MOCK_SEGMENTATION_DATA } from './constants';
import { Study, Series, ToolMode, ConnectionType, DicomWebConfig, Measurement, SegmentationLayer, ViewerHandle, AiPointer } from './types';
import { fetchDicomWebSeries } from './services/dicomService';
import { pendingOAuthCode, completeOpenRouterOAuth } from './services/openrouterAuth';
import { getDomain } from './lib/domains';
import { Activity, Sparkles, GripVertical, Shield, Loader2, X, Camera, Map, GraduationCap } from 'lucide-react';

const App: React.FC = () => {
  // Default to DICOMWEB (which is now effectively Local Mode via the service swap)
  const [connectionType, setConnectionType] = useState<ConnectionType>('DICOMWEB');
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [showTourMenu, setShowTourMenu] = useState(false);
  // OpenRouter OAuth: after the redirect back with ?code=, exchange it for a key.
  const [connectNotice, setConnectNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  
  // Config is less relevant now, but kept for type compatibility
  const [dicomConfig, setDicomConfig] = useState<DicomWebConfig>({ 
    url: 'local', 
    name: 'Local Dataset (CC0)'
  });

  const [selectedStudy, setSelectedStudy] = useState<Study | null>(null);
  const [studySeries, setStudySeries] = useState<Series[]>([]);
  const [activeSeries, setActiveSeries] = useState<Series | null>(null);
  const [activeTool, setActiveToolRaw] = useState<ToolMode>(ToolMode.SCROLL);
  const setActiveTool = (tool: ToolMode) => {
    setActiveToolRaw(tool);
    if (tool === ToolMode.BRUSH) {
      setSegmentationLayer(prev => prev.activeSegmentId ? prev : { ...prev, activeSegmentId: 1 });
    }
  };
  
  // No more auto-booting needed for local files
  const [isAutoBooting, setIsAutoBooting] = useState(false);
  
  const viewerRef = useRef<ViewerHandle>(null);
  
  const [sliceIndex, setSliceIndex] = useState(0);
  
  // Measurements State (Scoped by Series ID)
  const [measurementsBySeries, setMeasurementsBySeries] = useState<Record<string, Measurement[]>>({});
  const [activeMeasurementId, setActiveMeasurementId] = useState<string | null>(null);

  // Derived Measurements for Active Series
  const activeSeriesId = activeSeries?.id;
  const measurements = activeSeriesId ? (measurementsBySeries[activeSeriesId] || []) : [];

  // Default to AI tab
  const [activeRightTab, setActiveRightTab] = useState<'measure' | 'segment' | 'ai'>('ai');
  const [segmentationLayer, setSegmentationLayer] = useState<SegmentationLayer>({
    opacity: 1.0,
    isVisible: true,
    activeSegmentId: null,
    segments: MOCK_SEGMENTATION_DATA,
    brushSize: 5,
    segmentedSlices: [] // Initialize new list
  });

  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  
  // Tour State
  const [activeTour, setActiveTour] = useState<TourId | null>(null);
  // Track tour completion to block scrolling until done (only blocks if Quick Tour is running or initial)
  const [isTourCompleted, setIsTourCompleted] = useState(() => !!localStorage.getItem('caseattend.guidedTour.completed'));

  // FloatingToolbar State
  const [showLegacyToolbar, setShowLegacyToolbar] = useState(false);
  const [toolbarPos, setToolbarPos] = useState({ x: 20, y: 30 }); 
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const [toolbarOrientation, setToolbarOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const dragStartRef = useRef<{ 
    mouseX: number; 
    mouseY: number; 
    offsetX: number; 
    offsetY: number; 
  } | null>(null);
  const viewerContainerRef = useRef<HTMLDivElement>(null);

  // Center toolbar initially
  useLayoutEffect(() => {
    if (selectedStudy && viewerContainerRef.current) {
        const { clientWidth } = viewerContainerRef.current;
        const toolbarWidth = 460; // Approximate max width of toolbar
        
        // Calculate centered X, clamped to minimum 20px margin to prevent off-screen rendering
        const startX = Math.max(20, (clientWidth - toolbarWidth) / 2);
        
        setToolbarPos({ x: startX, y: 30 });
        setToolbarOrientation('horizontal');
    }
  }, [selectedStudy]); // Re-center when study loads

  // Toolbar Drag Logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        if (!isDraggingToolbar || !dragStartRef.current || !viewerContainerRef.current) return;
        
        e.preventDefault();

        // Pinned Drag Logic:
        // Position = Current Mouse + Initial Offset (Difference between Toolbar and Mouse at start)
        let newX = e.clientX + dragStartRef.current.offsetX;
        let newY = e.clientY + dragStartRef.current.offsetY;
        
        const { clientWidth, clientHeight } = viewerContainerRef.current;
        
        // Dimensions based on CURRENT orientation (no flipping during drag to avoid jitters)
        const tbW = toolbarOrientation === 'horizontal' ? 460 : 80;
        const tbH = toolbarOrientation === 'horizontal' ? 80 : 460;
        
        // Clamp to container bounds
        newX = Math.max(0, Math.min(newX, clientWidth - tbW));
        newY = Math.max(0, Math.min(newY, clientHeight - tbH));
        
        // Update state on every move for realtime feel
        // Note: FloatingToolbar has CSS transition disabled during dragging to ensure smoothness
        setToolbarPos({ x: newX, y: newY });
    };

    const handleMouseUp = (e: MouseEvent) => {
        if (!isDraggingToolbar || !dragStartRef.current || !viewerContainerRef.current) return;

        setIsDraggingToolbar(false);
        
        // Perform axis snap ONLY on drag end
        // Use the last known mouse position from the event to calculate final placement logic
        let checkX = e.clientX + dragStartRef.current.offsetX;
        const { clientWidth } = viewerContainerRef.current;
        
        // Recalculate clamp for logic consistency
        const currentW = toolbarOrientation === 'horizontal' ? 460 : 80;
        checkX = Math.max(0, Math.min(checkX, clientWidth - currentW));

        const EDGE_THRESHOLD = 100; // Pixels from edge to trigger vertical snap
        
        let newOrientation = toolbarOrientation;
        
        // Left Edge Check
        if (checkX < EDGE_THRESHOLD) {
            newOrientation = 'vertical';
        } 
        // Right Edge Check
        else if (checkX + currentW > clientWidth - EDGE_THRESHOLD) {
            newOrientation = 'vertical';
        } 
        else {
            newOrientation = 'horizontal';
        }
        
        setToolbarOrientation(newOrientation);
        dragStartRef.current = null;
    };

    if (isDraggingToolbar) {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingToolbar, toolbarOrientation]);

  const handleToolbarDragStart = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      // Record initial offset so the toolbar stays exactly under the cursor relative to where it was grabbed
      const offsetX = toolbarPos.x - e.clientX;
      const offsetY = toolbarPos.y - e.clientY;

      setIsDraggingToolbar(true);
      dragStartRef.current = {
          mouseX: e.clientX,
          mouseY: e.clientY,
          offsetX,
          offsetY
      };
  }, [toolbarPos.x, toolbarPos.y]);

  // Guided Tour Logic
  useEffect(() => {
    // Only check if we are actually viewing a study (not on study list)
    if (selectedStudy) {
      const tourCompleted = localStorage.getItem('caseattend.guidedTour.completed');
      if (!tourCompleted) {
        setIsTourCompleted(false); // Lock scrolling
        // Small delay to ensure DOM is ready
        const timer = setTimeout(() => setActiveTour('onboarding'), 1500);
        return () => clearTimeout(timer);
      } else {
        setIsTourCompleted(true);
      }
    }
  }, [selectedStudy]);

  const handleCloseTour = () => {
    // Only mark completed if we finished the quick start
    if (activeTour === 'onboarding') {
        localStorage.setItem('caseattend.guidedTour.completed', 'true');
        setIsTourCompleted(true);
    }
    setActiveTour(null);
  };

  const handleStartTour = (id: TourId) => {
    if (id === 'onboarding') {
         localStorage.removeItem('caseattend.guidedTour.completed');
         setIsTourCompleted(false);
         setActiveRightTab('ai'); // Start on the Tutor panel
    }
    setActiveTour(id);
    setShowTourMenu(false);
  };

  // Global AI Capture State (Lifted)
  const [aiContextImage, setAiContextImage] = useState<string | null>(null);
  const [aiContextSliceInfo, setAiContextSliceInfo] = useState<{slice: number; total?: number; label?: string} | null>(null);
  const [showCaptureToast, setShowCaptureToast] = useState(false);
  const [aiPointers, setAiPointers] = useState<AiPointer[]>([]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        if (!isResizingSidebar) return;
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth > 250 && newWidth < Math.min(800, window.innerWidth * 0.6)) {
            setSidebarWidth(newWidth);
        }
    };
    const handleMouseUp = () => setIsResizingSidebar(false);

    if (isResizingSidebar) {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar]);

  useEffect(() => {
    async function loadSeries() {
      if (!selectedStudy) {
        setStudySeries([]);
        setActiveSeries(null);
        return;
      }
      try {
        const seriesData = await fetchDicomWebSeries(dicomConfig, selectedStudy.id);
        setStudySeries(seriesData);
        if (seriesData.length > 0) {
          // Default to first series (T1 likely)
          setActiveSeries(seriesData[0]);
          setActiveRightTab('ai');
        } else {
          setActiveSeries(null);
        }
      } catch (err) {
        console.error("Error loading series", err);
      }
    }
    loadSeries();
  }, [selectedStudy, connectionType, dicomConfig]);

  useEffect(() => {
    if (activeSeries) {
      // Default slice selection
      setSliceIndex(Math.floor(activeSeries.instanceCount / 2));
      
      // Measurements are now persisted by series, so we don't clear them here.
      setActiveMeasurementId(null);
      // Reset capture context on series change to avoid stale context
      setAiContextImage(null);
      setAiContextSliceInfo(null);
      
      // Clear segmented slices list on series change since canvas is cleared
      setSegmentationLayer(prev => ({ ...prev, segmentedSlices: [] }));
    }
  }, [activeSeries?.id]);

  const handleMeasurementAdd = useCallback((m: Measurement) => {
    if (!activeSeriesId) return;
    setMeasurementsBySeries(prev => ({
        ...prev,
        [activeSeriesId]: [...(prev[activeSeriesId] || []), m]
    }));
    setActiveMeasurementId(m.id);
    setActiveTool(ToolMode.POINTER); 
    setActiveRightTab('measure'); 
  }, [activeSeriesId]);

  // Wrapped for ViewerCanvas prop stability
  const onMeasurementUpdateStable = useCallback((m: Measurement) => {
    if (!activeSeriesId) return;
    setMeasurementsBySeries(prev => ({
        ...prev,
        [activeSeriesId]: (prev[activeSeriesId] || []).map(item => item.id === m.id ? m : item)
    }));
  }, [activeSeriesId]);

  const handleMeasurementUpdate = useCallback((id: string, updates: Partial<Measurement>) => {
    if (!activeSeriesId) return;
    setMeasurementsBySeries(prev => ({
        ...prev,
        [activeSeriesId]: (prev[activeSeriesId] || []).map(m => m.id === id ? { ...m, ...updates } : m)
    }));
  }, [activeSeriesId]);

  const handleMeasurementDelete = useCallback((id: string) => {
    if (!activeSeriesId) return;
    setMeasurementsBySeries(prev => ({
        ...prev,
        [activeSeriesId]: (prev[activeSeriesId] || []).filter(m => m.id !== id)
    }));
    if (activeMeasurementId === id) setActiveMeasurementId(null);
  }, [activeSeriesId, activeMeasurementId]);
  
  const handleCaptureScreen = () => {
      return viewerRef.current?.captureScreenshot() || null;
  };

  const performGlobalCapture = useCallback(() => {
    const screenshot = handleCaptureScreen();
    if (screenshot) {
        setAiContextImage(screenshot);
        setAiContextSliceInfo({
            slice: sliceIndex + 1,
            total: activeSeries?.instanceCount,
            label: activeSeries?.description || selectedStudy?.description
        });
        setShowCaptureToast(true);
        setTimeout(() => setShowCaptureToast(false), 3000);
    }
  }, [sliceIndex, activeSeries, selectedStudy]);

  const clearGlobalCapture = () => {
    setAiContextImage(null);
    setAiContextSliceInfo(null);
  };

  const handleClearSegment = (id: number) => {
     if (viewerRef.current) {
        viewerRef.current.removeSegment(id);
     }
  };

  const handleSegmentedSliceUpdate = useCallback((sliceIdx: number, labelCount: number) => {
    setSegmentationLayer(prev => {
        // Remove existing entry for this slice
        const filtered = prev.segmentedSlices.filter(s => s.sliceIndex !== sliceIdx);
        // If it has labels, add new entry
        if (labelCount > 0) {
            return {
                ...prev,
                segmentedSlices: [...filtered, { sliceIndex: sliceIdx, labelCount }]
            };
        }
        // If count is 0, just remove
        return {
            ...prev,
            segmentedSlices: filtered
        };
    });
  }, []);

  // Complete the OpenRouter OAuth handshake if we were redirected back with a code.
  useEffect(() => {
    if (!pendingOAuthCode()) return;
    let cancelled = false;
    (async () => {
      const result = await completeOpenRouterOAuth();
      if (cancelled) return;
      setConnectNotice(
        result.ok
          ? { ok: true, msg: 'OpenRouter connected — your key stays in your browser.' }
          : { ok: false, msg: result.error || 'Could not finish connecting to OpenRouter.' }
      );
      setTimeout(() => setConnectNotice(null), 6000);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex h-screen w-screen bg-black text-gray-200 font-sans overflow-hidden flex-col">
      {connectNotice && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-lg text-xs font-medium shadow-xl border ${
            connectNotice.ok
              ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-200'
              : 'bg-red-950/90 border-red-500/30 text-red-200'
          }`}
        >
          {connectNotice.msg}
        </div>
      )}
      {/* Top Main Header - only shown when a case is open */}
      {selectedStudy && <header className="w-full bg-[#0f1011] border-b border-white/[0.06] flex-shrink-0 relative z-30">
        <div className="mx-auto flex items-center justify-between px-4 h-14 relative">
          {/* Left: Branding + Back */}
          <div className="flex items-center gap-3">
            {selectedStudy && (
              <button
                onClick={() => setSelectedStudy(null)}
                className="text-[#8a8f98] hover:text-white p-1.5 rounded-lg hover:bg-[#1e1f21] transition-colors"
                title="Back to study list"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </button>
            )}
            <div className="flex items-center gap-2.5">
              <img src="/logo.svg" alt="" className="w-7 h-7 rounded-lg" />
              <span className="text-[15px] font-semibold text-[#f7f8f8] tracking-tight">CaseAttend</span>
            </div>
          </div>

          {/* Center: Educational Banner */}
          <div
            data-tour-id="safety-banner"
            className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center justify-center text-[10px] font-medium text-blue-200/80 gap-2 bg-blue-950/40 px-3 py-1.5 rounded-full border border-blue-500/20 shadow-sm"
          >
            <GraduationCap className="w-3.5 h-3.5 text-blue-400" />
            <span>Educational Demo Only</span>
            <span className="text-blue-700/50">•</span>
            <span>Not for Clinical Use</span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            
            {/* Tour Menu Button */}
            <div className="relative">
                <button
                    data-tour-id="tours-menu-button"
                    onClick={() => setShowTourMenu(!showTourMenu)}
                    className="text-[11px] font-bold text-[#8a8f98] hover:text-white px-3 py-1.5 rounded-full bg-[#161718] border border-white/[0.08] hover:bg-[#1e1f21] transition-colors flex items-center gap-1.5"
                >
                    <Map className="w-3.5 h-3.5 text-blue-400" />
                    Tours
                </button>
                {showTourMenu && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowTourMenu(false)} />
                        <div className="absolute right-0 top-full mt-2 w-48 bg-[#161718] border border-white/[0.08] rounded-xl shadow-xl z-50 p-1 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-200">
                             <div className="px-3 py-2 text-[10px] font-bold text-[#8a8f98] uppercase tracking-wider border-b border-white/[0.06] mb-1">
                                 Guided Tours
                             </div>
                             <button onClick={() => { setActiveRightTab('ai'); handleStartTour('ai-tour'); }} className="text-left px-3 py-2 text-xs text-[#d0d6e0] hover:text-white hover:bg-[#1e1f21] rounded-lg transition-colors flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-blue-400" /> AI Tutor Tour
                             </button>
                             <button onClick={() => { setActiveRightTab('segment'); handleStartTour('seg-tour'); }} className="text-left px-3 py-2 text-xs text-[#d0d6e0] hover:text-white hover:bg-[#1e1f21] rounded-lg transition-colors flex items-center gap-2">
                                <Activity className="w-3.5 h-3.5 text-emerald-400" /> Annotation Tour
                             </button>
                        </div>
                    </>
                )}
            </div>

            <button
                onClick={() => setShowSafetyModal(true)}
                className="text-[11px] font-medium text-[#8a8f98] hover:text-blue-300 transition-colors flex items-center gap-1.5 px-2"
            >
                <Shield className="w-3.5 h-3.5" />
                <span className="hidden sm:inline underline underline-offset-2 decoration-white/[0.08] hover:decoration-blue-500/50">Safety</span>
            </button>
          </div>
        </div>
      </header>}

      {showSafetyModal && <SafetyModal onClose={() => setShowSafetyModal(false)} />}
      
      {/* Guided Tour Overlay */}
      {activeTour && <GuidedTour tourId={activeTour} onClose={handleCloseTour} onSwitchTab={setActiveRightTab} />}

      {!selectedStudy ? (
        <div className="h-full w-full bg-[#0f1011] overflow-hidden">
           <StudyList 
            onSelectStudy={setSelectedStudy} 
            connectionType={connectionType}
            setConnectionType={setConnectionType}
            dicomConfig={dicomConfig}
            setDicomConfig={setDicomConfig}
            onShowSafety={() => setShowSafetyModal(true)}
          />
        </div>
      ) : (
        <>
          <div className="flex-1 flex overflow-hidden">
              <div 
                ref={viewerContainerRef}
                className="flex-1 flex flex-col relative min-w-0"
              >
                  <FloatingToolbar
                    activeTool={activeTool}
                    onSelectTool={setActiveTool}
                    onCapture={performGlobalCapture}
                    position={toolbarPos}
                    onDragStart={handleToolbarDragStart}
                    orientation={toolbarOrientation}
                    isDragging={isDraggingToolbar}
                    instanceCount={activeSeries?.instanceCount ?? 1}
                    artifactHints={getDomain(selectedStudy.domain).artifactHints}
                  />

                  <ViewerCanvas
                    ref={viewerRef}
                    series={activeSeries}
                    activeTool={activeTool}
                    dicomConfig={dicomConfig}
                    connectionType={connectionType}
                    sliceIndex={sliceIndex}
                    onSliceChange={setSliceIndex}
                    measurements={measurements}
                    onMeasurementAdd={handleMeasurementAdd}
                    onMeasurementUpdate={onMeasurementUpdateStable}
                    activeMeasurementId={activeMeasurementId}
                    segmentationLayer={segmentationLayer}
                    onSegmentedSliceUpdate={handleSegmentedSliceUpdate}
                    isScrollEnabled={activeTour === null && (activeSeries?.instanceCount ?? 0) > 1}
                    aiPointers={aiPointers}
                  />
                  {getDomain(selectedStudy.domain).artifactHints.showSeriesSelector && (
                    <div className="flex-shrink-0 z-10">
                      <SeriesSelector
                        seriesList={studySeries}
                        activeSeriesId={activeSeries?.id}
                        onSelectSeries={setActiveSeries}
                        dicomConfig={dicomConfig}
                      />
                    </div>
                  )}
              </div>

              <div
                className={`w-1 bg-white/[0.06] hover:bg-blue-500 cursor-col-resize z-30 transition-colors flex flex-col items-center justify-center opacity-0 hover:opacity-100 ${isResizingSidebar ? 'opacity-100 bg-blue-500' : ''}`}
                onMouseDown={() => setIsResizingSidebar(true)}
              >
                 <GripVertical className="w-3 h-3 text-white" />
              </div>

              <div
                 className="flex flex-col h-full bg-[#0f1011] border-l border-white/[0.06] flex-shrink-0 relative"
                 style={{ width: sidebarWidth }}
              >
                  <div className="flex border-b border-white/[0.06]">
                      <button onClick={() => { setActiveRightTab('segment'); if (!segmentationLayer.activeSegmentId) setSegmentationLayer(prev => ({ ...prev, activeSegmentId: 1 })); setActiveTool(ToolMode.BRUSH); }} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-colors ${activeRightTab === 'segment' ? 'bg-[#161718] text-emerald-400 border-b-2 border-emerald-500' : 'text-[#8a8f98] hover:text-[#d0d6e0] hover:bg-[#161718]/50'}`}><Activity className="w-3.5 h-3.5" /> Annotate</button>
                      <button
                          id="tour-ai-tab"
                          data-tour-id="ai-tab"
                          aria-label="AI Tutor tab"
                          onClick={() => setActiveRightTab('ai')}
                          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-colors ${activeRightTab === 'ai' ? 'bg-[#161718] text-blue-400 border-b-2 border-blue-500' : 'text-[#8a8f98] hover:text-[#d0d6e0] hover:bg-[#161718]/50'}`}
                      >
                          <Sparkles className="w-3.5 h-3.5" /> Tutor
                      </button>
                  </div>
                  
                  <div className="flex-1 overflow-hidden relative">
                     {/* Keep all panels mounted to preserve state (especially AI chat) */}
                     <div className={`absolute inset-0 w-full h-full bg-[#0f1011] ${activeRightTab === 'measure' ? 'block z-10' : 'hidden'}`}>
                         <MeasurementPanel 
                            measurements={measurements}
                            activeMeasurementId={activeMeasurementId}
                            onSelect={setActiveMeasurementId}
                            onUpdate={handleMeasurementUpdate}
                            onDelete={handleMeasurementDelete}
                            onJumpToSlice={setSliceIndex}
                            onStartTour={() => {}}
                            studyMetadata={{ studyId: selectedStudy.id, patientName: selectedStudy.patientName, description: selectedStudy.description, modality: selectedStudy.modality }}
                          />
                     </div>
                     <div className={`absolute inset-0 w-full h-full bg-[#0f1011] ${activeRightTab === 'segment' ? 'block z-10' : 'hidden'}`}>
                         <SegmentationPanel 
                            layer={segmentationLayer} 
                            onChange={setSegmentationLayer} 
                            activeTool={activeTool} 
                            onSelectTool={setActiveTool}
                            onClearSegment={handleClearSegment}
                            onJumpToSlice={setSliceIndex}
                            onStartTour={() => handleStartTour('seg-tour')}
                         />
                     </div>
                     <div className={`absolute inset-0 w-full h-full bg-[#0f1011] ${activeRightTab === 'ai' ? 'block z-10' : 'hidden'}`}>
                         <AiAssistantPanel
                            capturedImage={aiContextImage}
                            capturedSliceMetadata={aiContextSliceInfo}
                            onCaptureTrigger={performGlobalCapture}
                            onClearCapture={clearGlobalCapture}
                            showCaptureToast={showCaptureToast}
                            studyMetadata={{ studyId: selectedStudy.id, patientName: selectedStudy.patientName, description: selectedStudy.description, modality: selectedStudy.modality, domain: selectedStudy.domain }}
                            cursor={{ seriesInstanceUID: activeSeries?.id || '', frameIndex: sliceIndex, activeMeasurementId: activeMeasurementId }}
                            onJumpToSlice={setSliceIndex}
                            activeSeriesInfo={activeSeries ? { description: activeSeries.description, instanceCount: activeSeries.instanceCount } : undefined}
                            onStartTour={() => handleStartTour('ai-tour')}
                            onPointers={setAiPointers}
                         />
                     </div>
                  </div>
              </div>
          </div>
        </>
      )}
    </div>
  );
};

export default App;