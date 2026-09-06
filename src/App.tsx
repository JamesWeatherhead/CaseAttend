

import React, { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo } from 'react';
import StudyList, { type CaseLibraryState } from './components/StudyList';
import CaseLinkButton from './components/CaseLinkButton';
import CaseRouteStatus from './components/CaseRouteStatus';
import { useCaseNavigation } from './hooks/useCaseNavigation';
import type {
  FrozenResearchSetup,
  ResearchMaterialOption,
} from './components/ResearchSetupWizard/ResearchSetupWizard';
import { DeferredViewer as ViewerCanvas, DeferredTutor as AiAssistantPanel } from './components/DeferredCaseTools';
import SeriesSelector from './components/SeriesSelector';
import MeasurementPanel from './components/MeasurementPanel';
import SegmentationPanel from './components/SegmentationPanel';
import SessionDataPanel from './components/SessionDataPanel';
import ResearchDataPanel from './components/ResearchDataPanel';
import SafetyModal from './components/SafetyModal';
import GuidedTour, { TourId } from './components/GuidedTour';
import FloatingToolbar from './components/FloatingToolbar';
import { TOOLS, MOCK_SEGMENTATION_DATA } from './constants';
import type { CasePackageV1 } from './core/casePackage';
import { primaryCaseModality } from './data/caseRegistry';
import type { ResearchViewerPolicyV1 } from './core/researchManifest';
import { Series, ToolMode, ConnectionType, DicomWebConfig, Measurement, SegmentationLayer, ViewerHandle, AiPointer, type CapturedTutorView } from './types';
import { fetchDicomWebSeries } from './services/dicomService';
import {
  beginOpenRouterOAuth,
  completeOpenRouterOAuth,
  pendingOAuthCode,
} from './services/openrouterAuth';
import { BYOK_CHANGED_EVENT, hasKey } from './services/byokStore';
import { generateIntroCacheLazily } from './services/deferredIntroCacheGeneration';
import {
  getPreference,
  PREFERENCE_KEYS,
  removePreference,
  setPreference,
} from './services/preferenceStore';
import { Activity, Sparkles, GripVertical, Shield, Loader2, X, Camera, Map, Database, ImageIcon } from 'lucide-react';
import { createCaseStudioController } from './services/caseStudioController';
import {
  researchSetupController,
  type ResearchParticipantSession,
} from './services/researchSetupController';

const LessonBuilder = React.lazy(() => import('./components/LessonBuilder'));
const CaseStudio = React.lazy(() => import('./components/CaseStudio/CaseStudio'));
const ResearchSetupWizard = React.lazy(() => import('./components/ResearchSetupWizard/ResearchSetupWizard'));
const ParticipantMode = React.lazy(() => import('./components/ParticipantMode/ParticipantMode'));

function resolveCapturedArtifact(
  casePackage: CasePackageV1,
  viewerSeriesId: string,
  frameIndex: number,
) {
  if (casePackage.artifact.kind === 'image') {
    if (
      viewerSeriesId !== `${casePackage.id}:${casePackage.artifact.seriesId}`
      || frameIndex !== 0
    ) return null;
    return {
      artifactKind: 'image' as const,
      seriesId: casePackage.artifact.seriesId,
      frameIndex: 0 as const,
      frameCount: 1 as const,
      assetSha256: casePackage.artifact.sha256,
    };
  }

  const series = casePackage.artifact.series.find(
    (candidate) => viewerSeriesId === `${casePackage.id}:${candidate.id}`,
  );
  const frame = series?.frames[frameIndex];
  if (!series || !frame) return null;
  return {
    artifactKind: 'image-stack' as const,
    seriesId: series.id,
    frameId: frame.id,
    frameIndex,
    frameCount: series.frames.length,
    assetSha256: frame.sha256,
  };
}

export function resolveArtifactAccessibleDescription(
  casePackage: CasePackageV1,
  viewerSeriesId: string | undefined,
  frameIndex: number,
): string {
  if (!viewerSeriesId || !casePackage.artifact) return casePackage.neutralDescription;
  if (casePackage.artifact.kind === 'image') {
    return viewerSeriesId === `${casePackage.id}:${casePackage.artifact.seriesId}`
      ? casePackage.artifact.alt
      : casePackage.neutralDescription;
  }
  const series = casePackage.artifact.series.find(
    (candidate) => viewerSeriesId === `${casePackage.id}:${candidate.id}`,
  );
  return series?.frames[frameIndex]?.alt ?? casePackage.neutralDescription;
}

const CaseContentWarnings: React.FC<{ warnings?: readonly string[] }> = ({ warnings }) => {
  if (!warnings?.length) return null;
  return (
    <div
      role="note"
      aria-label="Case content warning"
      className="relative z-20 flex w-full flex-none items-start gap-2 border-y border-amber-300/20 bg-[#17120b] px-3 py-2 text-[11px] leading-relaxed text-amber-100"
    >
      <Shield className="mt-0.5 h-3.5 w-3.5 flex-none text-amber-300" aria-hidden="true" />
      <span><strong className="font-semibold">Content note:</strong> {warnings.join(' · ')}</span>
    </div>
  );
};

const DeferredWorkspaceFallback: React.FC = () => (
  <main
    className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-[#08090b] p-6 text-center"
    aria-busy="true"
    aria-live="polite"
  >
    <Loader2 className="h-6 w-6 animate-spin text-blue-300" aria-hidden="true" />
    <h1 className="text-xl font-semibold text-white">Opening your workspace</h1>
    <p className="max-w-xl text-sm text-[#9ca3af]">Loading the browser-local tools for this activity.</p>
  </main>
);

export function normalizeToolForArtifact(
  tool: ToolMode,
  artifactHints: CasePackageV1['artifactHints'],
  instanceCount: number,
  interactionPolicy?: ResearchViewerPolicyV1,
): ToolMode {
  if (
    tool === ToolMode.SCROLL
    && (instanceCount <= 1 || interactionPolicy?.allowFrameNavigation === false)
  ) return ToolMode.POINTER;
  if (
    tool === ToolMode.WINDOW_LEVEL
    && (!artifactHints.showWindowLevel || interactionPolicy?.allowWindowLevel === false)
  ) return ToolMode.POINTER;
  if (
    (tool === ToolMode.PAN || tool === ToolMode.ZOOM)
    && interactionPolicy?.allowPanZoom === false
  ) return ToolMode.POINTER;
  if (tool === ToolMode.MEASURE && interactionPolicy?.allowAnnotations === false) {
    return ToolMode.POINTER;
  }
  if (
    (tool === ToolMode.BRUSH || tool === ToolMode.ERASER)
    && (
      !artifactHints.showSegmentation
      || interactionPolicy?.allowAnnotations === false
      || interactionPolicy?.allowSegmentation === false
    )
  ) return ToolMode.POINTER;
  return tool;
}

const App: React.FC = () => {
  const libraryStateRef = useRef<CaseLibraryState | undefined>(undefined);
  const [homeView, setHomeViewRaw] = useState<'cases' | 'lesson-builder' | 'case-studio' | 'research-setup' | 'participant'>('cases');
  const navigationRef = useRef<ReturnType<typeof useCaseNavigation> | null>(null);
  const setHomeView = useCallback((view: typeof homeView) => {
    // Protect the workspace before any asynchronous setup or React render.
    if (view === 'cases') navigationRef.current?.resume();
    else navigationRef.current?.suspend();
    setHomeViewRaw(view);
  }, []);
  const [lessonBuilderInitialCaseId, setLessonBuilderInitialCaseId] = useState<string | undefined>();
  const caseStudioController = useMemo(() => createCaseStudioController({
    runIntroCacheGeneration: generateIntroCacheLazily,
  }), []);
  const [researchMaterials, setResearchMaterials] = useState<readonly ResearchMaterialOption[]>([]);
  const [researchMaterialsLoading, setResearchMaterialsLoading] = useState(false);
  const [researchMaterialsError, setResearchMaterialsError] = useState('');
  const [researchStorageStatus, setResearchStorageStatus] = useState(
    researchSetupController.getStorageStatus(),
  );
  const [participantFrozen, setParticipantFrozen] = useState<FrozenResearchSetup | null>(null);
  const [participantSession, setParticipantSession] = useState<ResearchParticipantSession | null>(null);
  const [participantInferenceReady, setParticipantInferenceReady] = useState(() => hasKey());
  const [participantInferenceBusy, setParticipantInferenceBusy] = useState(false);
  const [participantViewerReady, setParticipantViewerReady] = useState(false);
  const [participantTutorReady, setParticipantTutorReady] = useState(false);
  const participantCancelInferenceRef = useRef<(() => Promise<void>) | null>(null);
  const researchSetupRequestRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = researchSetupController.subscribeStorageStatus((status) => {
      if (mounted) setResearchStorageStatus(status);
    });
    return () => {
      mounted = false;
      unsubscribe();
      researchSetupRequestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const syncInferenceReadiness = () => setParticipantInferenceReady(hasKey());
    syncInferenceReadiness();
    window.addEventListener(BYOK_CHANGED_EVENT, syncInferenceReadiness);
    return () => window.removeEventListener(BYOK_CHANGED_EVENT, syncInferenceReadiness);
  }, []);

  const registerParticipantInferenceCancellation = useCallback(
    (cancelAndWait: (() => Promise<void>) | null) => {
      participantCancelInferenceRef.current = cancelAndWait;
    },
    [],
  );

  const openResearchSetup = useCallback(() => {
    const requestId = ++researchSetupRequestRef.current;
    setHomeView('research-setup');
    setResearchMaterialsLoading(true);
    setResearchMaterialsError('');
    void Promise.all([
      researchSetupController.initialize(),
      researchSetupController.listMaterials(),
    ]).then(([status, materials]) => {
      if (requestId !== researchSetupRequestRef.current) return;
      setResearchStorageStatus(status);
      setResearchMaterials(materials);
    }).catch(() => {
      if (requestId === researchSetupRequestRef.current) {
        setResearchMaterialsError('Research materials could not be verified. Reload before setting up a study.');
      }
    }).finally(() => {
      if (requestId === researchSetupRequestRef.current) setResearchMaterialsLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!participantSession) return undefined;
    return () => participantSession.releaseAssets();
  }, [participantSession]);

  const exitParticipantMode = useCallback(async () => {
    const session = participantSession;
    if (session) {
      const cancelAndWait = participantCancelInferenceRef.current;
      if (cancelAndWait) {
        await cancelAndWait();
      } else if (participantInferenceBusy) {
        throw new Error('The active AI request cannot be stopped safely yet. Wait for it to finish, then try Exit study again.');
      }
    }
    if (session && !session.recorder.isEnded) {
      try {
        await session.recorder.end('withdrawn');
      } catch {
        throw new Error('The withdrawn run could not be finalized in browser research storage. The study remains open; try Exit study again.');
      }
    }
    setParticipantSession(null);
    setParticipantFrozen(null);
    setSelectedStudy(null);
    setStudySeries([]);
    setActiveSeries(null);
    setAiPointers([]);
    setParticipantInferenceBusy(false);
    participantCancelInferenceRef.current = null;
    setHomeView('cases');
  }, [participantInferenceBusy, participantSession]);
  const participantConfig = useMemo(
    () => participantFrozen
      ? researchSetupController.createParticipantLaunchConfig(participantFrozen)
      : null,
    [participantFrozen],
  );
  const startParticipantSession = useCallback(async (participantCode: string) => {
    if (!participantFrozen) throw new Error('The frozen research configuration is no longer available.');
    if (!hasKey()) {
      setParticipantInferenceReady(false);
      throw new Error('Participant launch is blocked because this browser does not have an OpenRouter key. Exit Participant Mode and ask the study team how to connect an approved key before returning.');
    }
    const session = await researchSetupController.startParticipant(participantFrozen, participantCode);
    setParticipantViewerReady(false);
    setParticipantTutorReady(false);
    setParticipantInferenceBusy(false);
    setParticipantSession(session);
    setSelectedStudy(session.portableCase.casePackage);
    setStudySeries([...session.series]);
    setActiveSeries(session.series[0] ?? null);
    setActiveRightTab('ai');
    setActiveToolRaw(ToolMode.POINTER);
    setAiPointers([]);
    return {
      participantReference: session.participantReference,
      armId: session.armId,
      taskFlow: {
        tasks: session.bundle.researchManifest.tasks,
        recorder: session.recorder,
      },
    };
  }, [participantFrozen]);
  // Default to DICOMWEB (which is now effectively Local Mode via the service swap)
  const [connectionType, setConnectionType] = useState<ConnectionType>('DICOMWEB');
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [showSessionData, setShowSessionData] = useState(false);
  const [showResearchData, setShowResearchData] = useState(false);
  const openSessionData = useCallback(() => setShowSessionData(true), []);
  const closeSessionData = useCallback(() => setShowSessionData(false), []);
  const [showTourMenu, setShowTourMenu] = useState(false);
  // OpenRouter OAuth: after the redirect back with ?code=, exchange it for a key.
  const [connectNotice, setConnectNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  
  // Config is less relevant now, but kept for type compatibility
  const [dicomConfig, setDicomConfig] = useState<DicomWebConfig>({ 
    url: 'local', 
    name: 'Local Dataset (CC0)'
  });

  const [selectedStudy, setSelectedStudy] = useState<CasePackageV1 | null>(null);
  const navigation = useCaseNavigation(setSelectedStudy);
  navigationRef.current = navigation;
  const caseHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (homeView === 'cases' && selectedStudy) caseHeadingRef.current?.focus({ preventScroll: true });
  }, [homeView, selectedStudy?.id]);
  const participantViewerPolicy = participantSession?.arm.viewerPolicy;
  const participantCapturePolicy = participantSession?.arm.capturePolicy;
  const effectiveArtifactHints = useMemo(() => selectedStudy ? ({
    showWindowLevel: selectedStudy.artifactHints.showWindowLevel
      && participantViewerPolicy?.allowWindowLevel !== false,
    showSeriesSelector: selectedStudy.artifactHints.showSeriesSelector
      && participantViewerPolicy?.allowSeriesSwitch !== false,
    showSegmentation: selectedStudy.artifactHints.showSegmentation
      && participantViewerPolicy?.allowAnnotations !== false
      && participantViewerPolicy?.allowSegmentation !== false,
  }) : null, [participantViewerPolicy, selectedStudy]);
  const handleBackToCases = navigation.back;
  const [studySeries, setStudySeries] = useState<Series[]>([]);
  const [activeSeries, setActiveSeries] = useState<Series | null>(null);
  const seriesLoadRequestRef = useRef(0);
  const [seriesLoadError, setSeriesLoadError] = useState(false);
  const [seriesLoadAttempt, setSeriesLoadAttempt] = useState(0);
  const [activeTool, setActiveToolRaw] = useState<ToolMode>(ToolMode.SCROLL);
  const setActiveTool = (tool: ToolMode) => {
    const allowedTool = selectedStudy
      ? normalizeToolForArtifact(
          tool,
          selectedStudy.artifactHints,
          activeSeries?.instanceCount ?? 1,
          participantViewerPolicy,
        )
      : tool;
    setActiveToolRaw(allowedTool);
    if (allowedTool === ToolMode.BRUSH) {
      setSegmentationLayer(prev => prev.activeSegmentId ? prev : { ...prev, activeSegmentId: 1 });
    }
  };
  
  // No more auto-booting needed for local files
  const [isAutoBooting, setIsAutoBooting] = useState(false);
  
  const viewerRef = useRef<ViewerHandle>(null);
  const tutorContainerRef = useRef<HTMLDivElement>(null);
  const jumpToLearningPane = (pane: 'image' | 'tutor') => {
    const target = pane === 'image' ? viewerContainerRef.current : tutorContainerRef.current;
    if (pane === 'tutor') setActiveRightTab('ai');
    target?.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    target?.focus({ preventScroll: true });
  };
  
  const [sliceIndex, setSliceIndex] = useState(0);
  
  // Measurements State (Scoped by Series ID)
  const [measurementsBySeries, setMeasurementsBySeries] = useState<Record<string, Measurement[]>>({});
  const [activeMeasurementId, setActiveMeasurementId] = useState<string | null>(null);
  const annotationAuditRef = useRef<{ revision: number; lastChangedAt?: string }>({ revision: 0 });
  const bumpAnnotationAudit = useCallback(() => {
    annotationAuditRef.current = {
      revision: annotationAuditRef.current.revision + 1,
      lastChangedAt: new Date().toISOString(),
    };
  }, []);
  const getAnnotationAudit = useCallback(() => annotationAuditRef.current, []);

  // Derived Measurements for Active Series
  const activeSeriesId = activeSeries?.id;
  const measurements = activeSeriesId ? (measurementsBySeries[activeSeriesId] || []) : [];
  const currentAccessibleDescription = selectedStudy
    ? resolveArtifactAccessibleDescription(selectedStudy, activeSeriesId, sliceIndex)
    : '';

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

  const [sidebarWidth, setSidebarWidth] = useState(420);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  
  // Tour State
  const [activeTour, setActiveTour] = useState<TourId | null>(null);

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

  // Tours remain available from Help without interrupting the first case.
  const handleCloseTour = () => {
    // Only mark completed if we finished the quick start
    if (activeTour === 'onboarding') {
        setPreference(PREFERENCE_KEYS.guidedTourCompleted, 'true');
    }
    setActiveTour(null);
  };

  const handleStartTour = (id: TourId) => {
    if (id === 'onboarding') {
         removePreference(PREFERENCE_KEYS.guidedTourCompleted);
         setActiveRightTab('ai'); // Start on the Tutor panel
    }
    setActiveTour(id);
    setShowTourMenu(false);
  };

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
    const requestId = ++seriesLoadRequestRef.current;
    let cancelled = false;
    setSeriesLoadError(false);

    async function loadSeries() {
      if (!selectedStudy) {
        setStudySeries([]);
        setActiveSeries(null);
        return;
      }

      // Do not render the previous case's series while the next package resolves.
      setStudySeries([]);
      setActiveSeries(null);

      if (
        participantSession
        && participantSession.portableCase.casePackage.manifest.sha256 === selectedStudy.manifest.sha256
      ) {
        const exactSeries = [...participantSession.series];
        if (cancelled || requestId !== seriesLoadRequestRef.current) return;
        setStudySeries(exactSeries);
        setActiveSeries(exactSeries[0] ?? null);
        setActiveRightTab('ai');
        return;
      }

      try {
        const seriesData = await fetchDicomWebSeries(dicomConfig, selectedStudy.id, selectedStudy);
        if (cancelled || requestId !== seriesLoadRequestRef.current) return;

        setStudySeries(seriesData);
        if (seriesData.length > 0) {
          // Default to first series (T1 likely)
          setActiveSeries(seriesData[0]);
          setActiveRightTab('ai');
        } else {
          setActiveSeries(null);
          setSeriesLoadError(true);
        }
      } catch (err) {
        if (cancelled || requestId !== seriesLoadRequestRef.current) return;
        console.error("Error loading series", err);
        setSeriesLoadError(true);
      }
    }

    void loadSeries();
    return () => {
      cancelled = true;
    };
  }, [selectedStudy, connectionType, dicomConfig, participantSession, seriesLoadAttempt]);

  useEffect(() => {
    if (activeSeries) {
      // Default slice selection
      setSliceIndex(Math.floor(activeSeries.instanceCount / 2));
      
      // Measurements are now persisted by series, so we don't clear them here.
      setActiveMeasurementId(null);
      // Clear segmented slices list on series change since canvas is cleared
      setSegmentationLayer(prev => ({ ...prev, segmentedSlices: [] }));
    }
  }, [activeSeries?.id]);

  useEffect(() => {
    annotationAuditRef.current = { revision: 0 };
    setMeasurementsBySeries({});
    setActiveMeasurementId(null);
  }, [selectedStudy?.id, selectedStudy?.manifest.sha256]);

  useEffect(() => {
    if (!selectedStudy) return;
    const allowedTool = normalizeToolForArtifact(
      activeTool,
      effectiveArtifactHints ?? selectedStudy.artifactHints,
      activeSeries?.instanceCount ?? 1,
      participantViewerPolicy,
    );
    if (allowedTool !== activeTool) setActiveToolRaw(allowedTool);
    if (!(effectiveArtifactHints?.showSegmentation ?? false) && activeRightTab === 'segment') {
      setActiveRightTab('ai');
    }
    if (participantViewerPolicy?.allowAnnotations === false && activeRightTab === 'measure') {
      setActiveRightTab('ai');
    }
  }, [
    activeRightTab,
    activeSeries?.id,
    activeSeries?.instanceCount,
    activeTool,
    selectedStudy,
    effectiveArtifactHints,
    participantViewerPolicy,
  ]);

  const handleMeasurementAdd = useCallback((m: Measurement) => {
    if (!activeSeriesId) return;
    bumpAnnotationAudit();
    setMeasurementsBySeries(prev => ({
        ...prev,
        [activeSeriesId]: [...(prev[activeSeriesId] || []), m]
    }));
    setActiveMeasurementId(m.id);
    setActiveTool(ToolMode.POINTER); 
    setActiveRightTab('measure'); 
  }, [activeSeriesId, bumpAnnotationAudit]);

  // Wrapped for ViewerCanvas prop stability
  const onMeasurementUpdateStable = useCallback((m: Measurement) => {
    if (!activeSeriesId) return;
    bumpAnnotationAudit();
    setMeasurementsBySeries(prev => ({
        ...prev,
        [activeSeriesId]: (prev[activeSeriesId] || []).map(item => item.id === m.id ? m : item)
    }));
  }, [activeSeriesId, bumpAnnotationAudit]);

  const handleMeasurementUpdate = useCallback((id: string, updates: Partial<Measurement>) => {
    if (!activeSeriesId) return;
    bumpAnnotationAudit();
    setMeasurementsBySeries(prev => ({
        ...prev,
        [activeSeriesId]: (prev[activeSeriesId] || []).map(m => m.id === id ? { ...m, ...updates } : m)
    }));
  }, [activeSeriesId, bumpAnnotationAudit]);

  const handleMeasurementDelete = useCallback((id: string) => {
    if (!activeSeriesId) return;
    bumpAnnotationAudit();
    setMeasurementsBySeries(prev => ({
        ...prev,
        [activeSeriesId]: (prev[activeSeriesId] || []).filter(m => m.id !== id)
    }));
    if (activeMeasurementId === id) setActiveMeasurementId(null);
  }, [activeSeriesId, activeMeasurementId, bumpAnnotationAudit]);
  
  const captureCurrentView = useCallback((): CapturedTutorView | null => {
    if (!selectedStudy) return null;
    const capture = viewerRef.current?.captureCurrentView();
    if (!capture) return null;
    const artifact = resolveCapturedArtifact(
      selectedStudy,
      capture.seriesId,
      capture.frameIndex,
    );
    if (!artifact || artifact.frameCount !== capture.frameCount) return null;
    return {
      image: capture.image,
      mimeType: capture.mimeType,
      width: capture.width,
      height: capture.height,
      capturePipelineVersion: capture.capturePipelineVersion,
      slice: capture.frameIndex + 1,
      total: capture.frameCount,
      label: activeSeries?.description || selectedStudy.neutralDescription,
      viewSnapshot: {
        ...artifact,
        annotation: capture.annotation,
      },
    };
  }, [activeSeries?.description, selectedStudy]);

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
          ? { ok: true, msg: 'OpenRouter connected. Your key is stored in this browser and sent only to OpenRouter.' }
          : { ok: false, msg: result.error || 'Could not finish connecting to OpenRouter.' }
      );
      setTimeout(() => setConnectNotice(null), 6000);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={`flex w-screen bg-black text-gray-200 font-sans flex-col ${homeView === 'participant' ? 'h-[100dvh] overflow-x-hidden overflow-y-auto' : 'h-screen overflow-hidden'}`}>
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
      {selectedStudy && homeView !== 'participant' && <header className="w-full bg-[#0f1011] border-b border-white/[0.06] flex-shrink-0 relative z-30">
        <div className="mx-auto flex items-center justify-between px-4 h-14 relative">
          {/* Left: Branding + Back */}
          <div className="flex items-center gap-3">
            {selectedStudy && (
              <button
                onClick={handleBackToCases}
                className="min-h-11 min-w-11 text-[#8a8f98] hover:text-white rounded-lg hover:bg-[#1e1f21] transition-colors inline-flex items-center justify-center"
                title="Back to study list"
                aria-label="Back to study list"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </button>
            )}
            <div className="flex items-center gap-2.5">
              <img src="/logo.svg" alt="" className="w-7 h-7 rounded-lg" />
              <span className="hidden sm:inline text-[15px] font-semibold text-[#f7f8f8] tracking-tight">CaseAttend</span>
            </div>
          </div>


          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            
            {/* Tour Menu Button */}
            <div className="relative">
                <button
                    data-tour-id="tours-menu-button"
                    onClick={() => setShowTourMenu(!showTourMenu)}
                    className="min-h-11 min-w-11 text-[11px] font-bold text-[#8a8f98] hover:text-white px-3 rounded-full bg-[#161718] border border-white/[0.08] hover:bg-[#1e1f21] transition-colors flex items-center justify-center gap-1.5"
                    aria-label="Open guided tours"
                    aria-expanded={showTourMenu}
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
                             <button onClick={() => { setActiveRightTab('ai'); handleStartTour('ai-tour'); }} className="min-h-11 text-left px-3 py-2 text-xs text-[#d0d6e0] hover:text-white hover:bg-[#1e1f21] rounded-lg transition-colors flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-blue-400" /> AI Tutor Tour
                             </button>
                             {effectiveArtifactHints?.showSegmentation && (
                               <button onClick={() => { setActiveRightTab('segment'); handleStartTour('seg-tour'); }} className="min-h-11 text-left px-3 py-2 text-xs text-[#d0d6e0] hover:text-white hover:bg-[#1e1f21] rounded-lg transition-colors flex items-center gap-2">
                                  <Activity className="w-3.5 h-3.5 text-emerald-400" /> Annotation Tour
                               </button>
                             )}
                        </div>
                    </>
                )}
            </div>

            <button
                type="button"
                onClick={openSessionData}
                className="min-h-11 min-w-11 text-[11px] font-medium text-[#8a8f98] hover:text-blue-300 transition-colors flex items-center justify-center gap-1.5 px-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                aria-label="Open browser-local session data"
            >
                <Database className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Session data</span>
            </button>

            <button
                onClick={() => setShowSafetyModal(true)}
                className="min-h-11 min-w-11 text-[11px] font-medium text-[#8a8f98] hover:text-blue-300 transition-colors flex items-center justify-center gap-1.5 px-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                aria-label="Open safety information"
            >
                <Shield className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline underline underline-offset-2 decoration-white/[0.08] hover:decoration-blue-500/50">Safety</span>
            </button>
          </div>
        </div>
        <div className="max-h-[35dvh] overflow-y-auto border-t border-white/[0.06] px-5 py-3 bg-[#101722]">
          <div className="flex items-start justify-between gap-3">
            <h1 ref={caseHeadingRef} tabIndex={-1} className="min-w-0 pt-2 text-base sm:text-lg font-semibold leading-snug text-slate-100 focus:outline-none">{selectedStudy.title}</h1>
            <div className="shrink-0"><CaseLinkButton key={selectedStudy.id} caseId={selectedStudy.id} local={selectedStudy.preview?.src.startsWith('case://assets/') ?? false} /></div>
          </div>
          <details className="mt-1 text-sm text-slate-300">
            <summary className="min-h-9 w-fit cursor-pointer py-1 text-blue-300 focus-visible:outline-2 focus-visible:outline-blue-300">Case details</summary>
            <p className="max-w-4xl py-2 leading-relaxed">{selectedStudy.vignette}</p>
          </details>
          <p data-tour-id="safety-banner" className="text-xs text-slate-400">For education. Not for clinical use.</p>
        </div>
        <nav aria-label="Learning workspace" className="ca-pane-nav md:hidden flex border-t border-white/[0.08] bg-[#101722]">
          <button type="button" onClick={() => jumpToLearningPane('image')} className="min-h-11 flex-1 flex items-center justify-center gap-2 text-sm text-slate-200 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-blue-300"><ImageIcon size={16} aria-hidden="true" />View image</button>
          <button type="button" onClick={() => jumpToLearningPane('tutor')} className="min-h-11 flex-1 flex items-center justify-center gap-2 border-l border-white/[0.08] text-sm text-blue-200 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-blue-300"><Sparkles size={16} aria-hidden="true" />Open tutor</button>
        </nav>
      </header>}

      {showSafetyModal && <SafetyModal onClose={() => setShowSafetyModal(false)} />}
      {showSessionData && <SessionDataPanel onClose={closeSessionData} />}
      {showResearchData && <ResearchDataPanel onClose={() => setShowResearchData(false)} />}

      {!selectedStudy && homeView === 'research-setup' && (
        <button
          type="button"
          onClick={openSessionData}
          className="fixed bottom-4 right-4 z-30 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-[#161718] px-3 text-xs font-semibold text-[#c9ced8] shadow-lg hover:bg-[#202226] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          aria-label="Open browser-local session data"
        >
          <Database className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Session data</span>
        </button>
      )}
      {!selectedStudy && homeView === 'research-setup' && (
        <button
          type="button"
          onClick={() => setShowResearchData(true)}
          className="fixed bottom-4 left-4 z-30 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-violet-300/20 bg-[#161718] px-3 text-xs font-semibold text-violet-100 shadow-lg hover:bg-[#202226] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
          aria-label="Open restricted research data"
        >
          <Database className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Research data</span>
        </button>
      )}
      
      {/* Guided Tour Overlay */}
      {activeTour && homeView !== 'participant' && (
        <GuidedTour
          tourId={activeTour}
          onClose={handleCloseTour}
          onSwitchTab={setActiveRightTab}
          capabilities={{
            segmentation: effectiveArtifactHints?.showSegmentation ?? false,
          }}
        />
      )}

      <React.Suspense fallback={<DeferredWorkspaceFallback />}>
      {homeView === 'participant' && participantFrozen && participantConfig ? (
        <ParticipantMode
          config={participantConfig}
          storageStatus={researchStorageStatus}
          inferenceReady={participantInferenceReady}
          inferenceBusy={participantInferenceBusy}
          activityReady={participantViewerReady && participantTutorReady}
          cancelInferenceAndWait={participantCancelInferenceRef.current ?? undefined}
          onStart={startParticipantSession}
          onExit={exitParticipantMode}
          renderActivity={() => participantSession && selectedStudy ? (
            <div data-testid="research-participant-workspace" className="flex min-h-[56rem] w-full flex-col bg-black text-gray-200 md:h-[calc(100dvh-9rem)] md:min-h-[36rem] md:flex-row md:overflow-hidden">
              <div
                ref={viewerContainerRef}
                className="relative flex h-[50dvh] min-h-[20rem] min-w-0 flex-none flex-col md:h-auto md:min-h-0 md:flex-1"
              >
                <FloatingToolbar
                  activeTool={activeTool}
                  onSelectTool={setActiveTool}
                  position={toolbarPos}
                  onDragStart={handleToolbarDragStart}
                  orientation={toolbarOrientation}
                  isDragging={isDraggingToolbar}
                  instanceCount={activeSeries?.instanceCount ?? 1}
                  artifactHints={effectiveArtifactHints ?? selectedStudy.artifactHints}
                  interactionPolicy={participantViewerPolicy}
                />
                <CaseContentWarnings warnings={selectedStudy.contentWarnings} />
                <ViewerCanvas
                  onReadyChange={setParticipantViewerReady}
                  allowReload={false}
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
                  segmentationLayer={effectiveArtifactHints?.showSegmentation
                    ? segmentationLayer
                    : { ...segmentationLayer, isVisible: false }}
                  onSegmentedSliceUpdate={handleSegmentedSliceUpdate}
                  isScrollEnabled={
                    participantViewerPolicy?.allowFrameNavigation !== false
                    && (activeSeries?.instanceCount ?? 0) > 1
                  }
                  aiPointers={aiPointers}
                  getAnnotationAudit={getAnnotationAudit}
                  onAnnotationMutation={bumpAnnotationAudit}
                  accessibleDescription={currentAccessibleDescription}
                  interactionPolicy={participantViewerPolicy}
                  includeAnnotationsInCapture={participantCapturePolicy?.includeVisibleAnnotations ?? true}
                />
                {effectiveArtifactHints?.showSeriesSelector && (
                  <div className="z-10 flex-shrink-0">
                    <SeriesSelector
                      seriesList={studySeries}
                      activeSeriesId={activeSeries?.id}
                      onSelectSeries={setActiveSeries}
                      dicomConfig={dicomConfig}
                    />
                  </div>
                )}
              </div>
              <div className="flex h-[52rem] min-h-[36rem] w-full flex-none flex-col border-t border-white/[0.06] bg-[#0f1011] md:h-full md:w-[24rem] md:border-l md:border-t-0">
                <div className="flex border-b border-white/[0.06]">
                  {effectiveArtifactHints?.showSegmentation && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveRightTab('segment');
                        if (!segmentationLayer.activeSegmentId) {
                          setSegmentationLayer((previous) => ({ ...previous, activeSegmentId: 1 }));
                        }
                        setActiveTool(ToolMode.BRUSH);
                      }}
                      className={`min-h-11 flex-1 px-3 py-3 text-xs font-bold uppercase tracking-wide ${activeRightTab === 'segment' ? 'border-b-2 border-emerald-500 bg-[#161718] text-emerald-400' : 'text-[#8a8f98]'}`}
                    >
                      Annotate
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveRightTab('ai')}
                    className={`min-h-11 flex-1 px-3 py-3 text-xs font-bold uppercase tracking-wide ${activeRightTab === 'ai' ? 'border-b-2 border-blue-500 bg-[#161718] text-blue-400' : 'text-[#8a8f98]'}`}
                  >
                    Tutor
                  </button>
                </div>
                <div className="relative min-h-0 flex-1 overflow-hidden">
                  {effectiveArtifactHints?.showSegmentation && (
                    <div className={`absolute inset-0 bg-[#0f1011] ${activeRightTab === 'segment' ? 'z-10 block' : 'hidden'}`}>
                      <SegmentationPanel
                        layer={segmentationLayer}
                        onChange={setSegmentationLayer}
                        activeTool={activeTool}
                        onSelectTool={setActiveTool}
                        onClearSegment={handleClearSegment}
                        onJumpToSlice={setSliceIndex}
                        onStartTour={() => undefined}
                      />
                    </div>
                  )}
                  <div className={`absolute inset-0 bg-[#0f1011] ${activeRightTab === 'ai' ? 'z-10 block' : 'hidden'}`}>
                    <AiAssistantPanel
                      onReadyChange={setParticipantTutorReady}
                      allowReload={false}
                      captureCurrentView={captureCurrentView}
                      sessionContext={{
                        casePackageRef: {
                          id: selectedStudy.id,
                          schemaVersion: selectedStudy.schemaVersion,
                          sha256: selectedStudy.manifest.sha256,
                        },
                        lessonPlanRef: selectedStudy.lessonPlanRef,
                      }}
                      studyMetadata={{
                        studyId: selectedStudy.id,
                        description: selectedStudy.teachingNotes.join(' '),
                        modality: primaryCaseModality(selectedStudy),
                        domain: selectedStudy.domain,
                      }}
                      cursor={{
                        seriesInstanceUID: activeSeries?.id || '',
                        frameIndex: sliceIndex,
                        activeMeasurementId,
                      }}
                      onJumpToSlice={setSliceIndex}
                      activeSeriesInfo={activeSeries ? {
                        description: activeSeries.description,
                        instanceCount: activeSeries.instanceCount,
                      } : undefined}
                      onPointers={setAiPointers}
                      onInferenceBusyChange={setParticipantInferenceBusy}
                      onCancelInferenceReady={registerParticipantInferenceCancellation}
                      lockedTutor={{
                        manifestSha256: participantSession.bundle.researchManifest.manifest.sha256,
                        learnerLevel: participantSession.step.learnerLevel,
                        mode: participantSession.step.mode,
                        runtime: {
                          casePackage: participantSession.portableCase.casePackage,
                          lessonPlan: participantSession.portableCase.lessonPlan,
                          expectedSystemPromptSha256: participantSession.step.systemPromptSha256,
                          historyWindowMessages: participantSession.arm.inferencePolicy.historyWindowMessages,
                          requestTemplateVersion: participantSession.step.requestTemplateVersion,
                          openRouterPolicy: {
                            model: participantSession.arm.inferencePolicy.requestedModelId,
                            upstreamProviderId: participantSession.arm.inferencePolicy.provider.only[0],
                            temperature: participantSession.arm.inferencePolicy.temperature,
                            topP: participantSession.arm.inferencePolicy.topP,
                            ...(participantSession.arm.inferencePolicy.seed === undefined
                              ? {}
                              : { seed: participantSession.arm.inferencePolicy.seed }),
                            maxTokens: participantSession.arm.inferencePolicy.maxTokens,
                            allowFallbacks: false,
                            requireParameters: true,
                            zeroDataRetention: true,
                            dataCollection: 'deny',
                          },
                        },
                        research: {
                          recorder: participantSession.recorder,
                          caseStepId: participantSession.step.id,
                          inferenceConfigSha256: participantSession.inferenceConfigSha256,
                        },
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <main className="flex min-h-[20rem] flex-1 flex-col items-center justify-center gap-3 bg-[#08090b] p-6 text-center" aria-busy="true">
              <Loader2 className="h-6 w-6 animate-spin text-violet-300" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-white">Loading the assigned activity</h2>
              <p className="max-w-xl text-sm text-[#9ca3af]">The exact case, lesson, viewer policy, and model route are being verified.</p>
            </main>
          )}
        />
      ) : !selectedStudy && homeView === 'research-setup' ? (
        researchMaterialsLoading ? (
          <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-[#08090b] p-6 text-center" aria-busy="true">
            <Loader2 className="h-6 w-6 animate-spin text-violet-300" aria-hidden="true" />
            <h1 className="text-xl font-semibold text-white">Verifying exact research materials</h1>
            <p className="max-w-xl text-sm text-[#9ca3af]">CaseAttend is checking the available Case Packages and Lesson Plans before Research Setup opens.</p>
          </main>
        ) : researchMaterialsError ? (
          <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-[#08090b] p-6 text-center">
            <h1 className="text-xl font-semibold text-white">Research Setup is unavailable</h1>
            <p role="alert" className="max-w-xl text-sm text-red-200">{researchMaterialsError}</p>
            <button type="button" className="min-h-11 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300" onClick={() => setHomeView('cases')}>Back to cases</button>
          </main>
        ) : (
          <ResearchSetupWizard
            materials={researchMaterials}
            storageStatus={researchStorageStatus}
            onExit={() => setHomeView('cases')}
            onSaveDraft={(draft) => researchSetupController.saveDraft(draft)}
            onExportSupportPacket={async (draft, frozen) => { await researchSetupController.exportSupportPacket(draft, frozen); }}
            onFreeze={(draft) => researchSetupController.freeze(draft)}
            onLaunchParticipant={(frozen) => {
              setParticipantSession(null);
              setParticipantFrozen(frozen);
              setHomeView('participant');
            }}
          />
        )
      ) : !selectedStudy && homeView === 'lesson-builder' ? (
        <LessonBuilder
          onExit={() => { setLessonBuilderInitialCaseId(undefined); setHomeView('cases'); }}
          initialCaseId={lessonBuilderInitialCaseId}
          loadStoredLesson={caseStudioController.loadStoredLesson}
          saveUpdatedBundle={caseStudioController.saveUpdatedBundle}
          exportPortableCase={caseStudioController.exportCase}
          resolveAssetUri={caseStudioController.resolveAssetUri}
        />
      ) : !selectedStudy && homeView === 'case-studio' ? (
        <CaseStudio
          onExit={() => setHomeView('cases')}
          processFiles={caseStudioController.processFiles}
          scanAssets={caseStudioController.scanAssets}
          saveCase={caseStudioController.saveCase}
          importCase={caseStudioController.importCase}
          exportCase={caseStudioController.exportCase}
          onPreview={(casePackage) => { setHomeView('cases'); navigation.open(casePackage); }}
          onOpenLessonBuilder={(caseId) => {
            setLessonBuilderInitialCaseId(caseId);
            setHomeView('lesson-builder');
          }}
          releaseAsset={caseStudioController.releaseAsset}
          getStorageStatus={caseStudioController.getStorageStatus}
          subscribeStorageStatus={caseStudioController.subscribeStorageStatus}
          getIntroCacheStatus={caseStudioController.getIntroCacheStatus}
          generateIntroCache={caseStudioController.generateIntroCacheForCase}
          approveIntroCache={caseStudioController.approveIntroCacheForCase}
          saveIntroCacheDraft={caseStudioController.saveIntroCacheDraftForCase}
          clearIntroCache={caseStudioController.clearIntroCacheForCase}
          subscribeIntroCacheChanges={caseStudioController.subscribeIntroCacheChanges}
          hasApiKey={hasKey}
          onConnectOpenRouter={() => { void beginOpenRouterOAuth(); }}
        />
      ) : homeView === 'cases' && navigation.status !== 'ready' ? (
        <CaseRouteStatus status={navigation.status} onBack={navigation.back} onRetry={navigation.retry} />
      ) : !selectedStudy ? (
        <div className="h-full w-full bg-[#0f1011] overflow-hidden">
           <StudyList 
            stateRef={libraryStateRef}
            onSelectStudy={navigation.open}
            connectionType={connectionType}
            setConnectionType={setConnectionType}
            dicomConfig={dicomConfig}
            setDicomConfig={setDicomConfig}
            onOpenSessionData={openSessionData}
            onOpenResearchData={() => setShowResearchData(true)}
            onShowSafety={() => setShowSafetyModal(true)}
            onOpenLessonBuilder={() => { setLessonBuilderInitialCaseId(undefined); setHomeView('lesson-builder'); }}
            onOpenCaseStudio={() => setHomeView('case-studio')}
            onOpenResearchSetup={openResearchSetup}
            onDeleteLocalCase={caseStudioController.deleteCase}
          />
        </div>
      ) : (
        <>
          <div data-testid="case-workspace" className="ca-learner-workspace min-h-0 flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
              <div 
                ref={viewerContainerRef}
                data-testid="case-viewer-pane"
                role="region"
                aria-label="Teaching image"
                tabIndex={-1}
                className="ca-image-pane h-[50dvh] min-h-[20rem] flex-none md:h-auto md:min-h-0 md:flex-1 flex flex-col relative min-w-0"
              >
                  <FloatingToolbar
                    docked
                    activeTool={activeTool}
                    onSelectTool={setActiveTool}
                    position={toolbarPos}
                    onDragStart={handleToolbarDragStart}
                    orientation={toolbarOrientation}
                    isDragging={isDraggingToolbar}
                    instanceCount={activeSeries?.instanceCount ?? 1}
                    artifactHints={selectedStudy.artifactHints}
                  />
                  <CaseContentWarnings warnings={selectedStudy.contentWarnings} />

                  {seriesLoadError && <div role="alert" className="border-b border-amber-400/30 bg-amber-950 p-4 text-sm text-amber-100">
                    <p>The teaching image could not be opened.</p>
                    <button type="button" onClick={() => setSeriesLoadAttempt(attempt => attempt + 1)} className="mt-2 min-h-11 rounded-lg border border-amber-300/50 px-4 font-semibold focus-visible:outline-2 focus-visible:outline-amber-200">Try loading the image again</button>
                  </div>}

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
                    segmentationLayer={selectedStudy.artifactHints.showSegmentation
                      ? segmentationLayer
                      : { ...segmentationLayer, isVisible: false }}
                    onSegmentedSliceUpdate={handleSegmentedSliceUpdate}
                    isScrollEnabled={activeTour === null && (activeSeries?.instanceCount ?? 0) > 1}
                    aiPointers={aiPointers}
                    getAnnotationAudit={getAnnotationAudit}
                    onAnnotationMutation={bumpAnnotationAudit}
                    accessibleDescription={currentAccessibleDescription}
                  />
                  {selectedStudy.artifactHints.showSeriesSelector && (
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
                data-testid="case-resize-divider"
                className={`ca-pane-resizer hidden md:flex w-1 bg-white/[0.06] hover:bg-blue-500 cursor-col-resize z-30 transition-colors flex-col items-center justify-center opacity-0 hover:opacity-100 ${isResizingSidebar ? 'opacity-100 bg-blue-500' : ''}`}
                onMouseDown={() => setIsResizingSidebar(true)}
              >
                 <GripVertical className="w-3 h-3 text-white" />
              </div>

              <div
                 data-testid="case-tutor-pane"
                 ref={tutorContainerRef}
                 role="region"
                 aria-label="Tutor workspace"
                 tabIndex={-1}
                 className="ca-tutor-pane flex flex-col h-[75dvh] min-h-[36rem] md:h-full md:min-h-0 w-full md:w-[var(--caseattend-sidebar-width)] bg-[#0f1011] border-t md:border-t-0 md:border-l border-white/[0.06] flex-none md:flex-shrink-0 relative"
                 style={{ '--caseattend-sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
              >
                  <div className="flex border-b border-white/[0.06]">
                      {selectedStudy.artifactHints.showSegmentation && (
                        <button onClick={() => { setActiveRightTab('segment'); if (!segmentationLayer.activeSegmentId) setSegmentationLayer(prev => ({ ...prev, activeSegmentId: 1 })); setActiveTool(ToolMode.BRUSH); }} className={`min-h-11 flex-1 py-3 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-colors ${activeRightTab === 'segment' ? 'bg-[#161718] text-emerald-400 border-b-2 border-emerald-500' : 'text-[#8a8f98] hover:text-[#d0d6e0] hover:bg-[#161718]/50'}`}><Activity className="w-3.5 h-3.5" /> Annotate</button>
                      )}
                      <button
                          id="tour-ai-tab"
                          data-tour-id="ai-tab"
                          aria-label="AI Tutor tab"
                          onClick={() => setActiveRightTab('ai')}
                          className={`min-h-11 flex-1 py-3 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-colors ${activeRightTab === 'ai' ? 'bg-[#161718] text-blue-400 border-b-2 border-blue-500' : 'text-[#8a8f98] hover:text-[#d0d6e0] hover:bg-[#161718]/50'}`}
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
                          />
                     </div>
                     {selectedStudy.artifactHints.showSegmentation && <div className={`absolute inset-0 w-full h-full bg-[#0f1011] ${activeRightTab === 'segment' ? 'block z-10' : 'hidden'}`}>
                         <SegmentationPanel 
                            layer={segmentationLayer} 
                            onChange={setSegmentationLayer} 
                            activeTool={activeTool} 
                            onSelectTool={setActiveTool}
                            onClearSegment={handleClearSegment}
                            onJumpToSlice={setSliceIndex}
                            onStartTour={() => handleStartTour('seg-tour')}
                         />
                     </div>}
                     <div className={`absolute inset-0 w-full h-full bg-[#0f1011] ${activeRightTab === 'ai' ? 'block z-10' : 'hidden'}`}>
                         <AiAssistantPanel
                            captureCurrentView={captureCurrentView}
                            sessionContext={{
                              casePackageRef: {
                                id: selectedStudy.id,
                                schemaVersion: selectedStudy.schemaVersion,
                                sha256: selectedStudy.manifest.sha256,
                              },
                              lessonPlanRef: selectedStudy.lessonPlanRef,
                            }}
                            studyMetadata={{
                              studyId: selectedStudy.id,
                              description: selectedStudy.teachingNotes.join(' '),
                              modality: primaryCaseModality(selectedStudy),
                              domain: selectedStudy.domain,
                            }}
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
      </React.Suspense>
    </div>
  );
};

export default App;
