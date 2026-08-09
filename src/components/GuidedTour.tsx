
import React, { useState, useLayoutEffect, useEffect, useRef, useCallback, useMemo } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';

export type TourId = 'onboarding' | 'ai-tour' | 'seg-tour';

interface Step {
  selector: string;
  title: string;
  body: string;
  switchTab?: 'ai' | 'segment';
  requires?: 'segmentation';
}

const TOURS: Record<TourId, Step[]> = {
  'onboarding': [
    // Phase 1: AI Tutor intro
    {
      selector: '[data-tour-id="ai-panel"]',
      title: 'Welcome to CaseAttend',
      body: 'Read the case context and inspect the current visual. A vision-language model (VLM) can discuss what is visible alongside your question. Use it as a tutor, not as a clinical diagnostic system.',
      switchTab: 'ai'
    },
    {
      selector: '[data-tour-id="ai-provider"]',
      title: 'AI Model',
      body: 'Connect your own OpenRouter key, choose a vision-language model (VLM), and change it at any time. A VLM is an AI model that works with both images and text.',
      switchTab: 'ai'
    },
    {
      selector: '[data-tour-id="teaching-levels"]',
      title: 'Set Your Level',
      body: 'Choose your experience level. The tutor adjusts its teaching from plain language to board-style clinical reasoning.',
      switchTab: 'ai'
    },
    // Phase 2: Annotation tools
    {
      selector: '[data-tour-id="seg-header"]',
      title: 'Annotation Tools',
      body: 'Use the Annotate tab to mark findings directly on the current visual. Pick a label, choose a color, and paint where the case supports it.',
      switchTab: 'segment',
      requires: 'segmentation'
    },
    {
      selector: '[data-tour-id="seg-controls"]',
      title: 'Brush & Eraser',
      body: 'Select Brush to paint or Eraser to remove. Adjust the brush size with the slider.',
      switchTab: 'segment',
      requires: 'segmentation'
    },
    // Phase 3: Back to AI tutor for the workflow
    {
      selector: '[data-tour-id="viewer-toolbar"]',
      title: 'Explore the Current View',
      body: 'Use the available viewing tools to inspect the artifact. CaseAttend shows only the controls that apply, whether the case has one image or many frames.',
      switchTab: 'ai'
    },
    {
      selector: '[data-tour-id="ai-suggestions"]',
      title: 'Suggested Questions',
      body: 'Not sure what to ask? These suggestions adapt to your level. Use them as starting points, or type your own. When you press Send, CaseAttend captures the current view and includes it with your question.',
      switchTab: 'ai'
    }
  ],
  'ai-tour': [
    {
      selector: '[data-tour-id="ai-panel"]',
      title: 'Your AI Tutor',
      body: 'The tutor asks what you notice before explaining. This is educational software, not a clinical diagnostic system. Check each case\'s sources and provenance before use.'
    },
    {
      selector: '[data-tour-id="ai-provider"]',
      title: 'AI Model',
      body: 'Connect your own OpenRouter key and choose a vision-language model (VLM). A VLM is an AI model that can work with both the current visual and your text question.'
    },
    {
      selector: '[data-tour-id="teaching-levels"]',
      title: 'Teaching Levels',
      body: 'Choose your level. At High School you get plain language and analogies. At Resident level you get board-style clinical reasoning and differential diagnoses.'
    },
    {
      selector: '[data-tour-id="ai-suggestions"]',
      title: 'Suggested Questions',
      body: 'These adapt to your level and what you are looking at. First navigate or draw, then ask. When you press Send, CaseAttend captures the exact current view, including visible learner annotations, and sends it with your question.'
    },
    {
      selector: '[data-tour-id="ai-trash"]',
      title: 'Start Over',
      body: 'Clear the conversation and begin a fresh teaching session on the same case.'
    }
  ],
  'seg-tour': [
    {
      selector: '[data-tour-id="seg-header"]',
      title: 'Annotation Tools',
      body: 'Use annotations to highlight anatomy and mark findings. Paint directly on the image for teaching and practice.',
      requires: 'segmentation'
    },
    {
      selector: '[data-tour-id="seg-controls"]',
      title: 'Tools & Opacity',
      body: 'Switch between Pointer, Brush, and Eraser. Adjust opacity to see your annotations overlaid on the image.',
      requires: 'segmentation'
    },
    {
      selector: '[data-tour-id="seg-palette"]',
      title: 'Labels',
      body: 'Create named labels with different colors. Click a label to make it active, then paint on the slice to mark that structure.',
      requires: 'segmentation'
    }
  ]
};

interface GuidedTourProps {
  tourId: TourId | null;
  onClose: () => void;
  onSwitchTab?: (tab: 'ai' | 'segment') => void;
  capabilities?: {
    segmentation: boolean;
  };
}

const GuidedTour: React.FC<GuidedTourProps> = ({
  tourId,
  onClose,
  onSwitchTab,
  capabilities,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipDimensions, setTooltipDimensions] = useState({ width: 0, height: 0 });

  const tooltipRef = useRef<HTMLDivElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  const segmentationAvailable = capabilities?.segmentation !== false;
  const steps = useMemo(() => {
    const tourSteps = tourId ? TOURS[tourId] : [];
    return segmentationAvailable
      ? tourSteps
      : tourSteps.filter((step) => step.requires !== 'segmentation');
  }, [segmentationAvailable, tourId]);

  // Reset tour state when tourId changes
  useEffect(() => {
    if (tourId) {
      setCurrentStep(0);
      // Switch tab for the first step
      const firstStep = steps[0];
      if (firstStep?.switchTab && onSwitchTab) onSwitchTab(firstStep.switchTab);
    }
  }, [onSwitchTab, steps, tourId]);

  const isOpen = !!tourId && steps.length > 0;

  // Keep modal focus inside the tour and return it to the control that opened
  // the tour. This effect intentionally depends only on the open state so a
  // step change does not restore focus behind the dialog.
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    return () => previouslyFocused?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (tourId && steps.length === 0) onClose();
  }, [onClose, steps.length, tourId]);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((previousStep) => Math.min(previousStep + 1, steps.length - 1));
    } else {
      onClose();
    }
  }, [currentStep, onClose, steps.length]);

  const handlePrevious = useCallback(() => {
    setCurrentStep((previousStep) => Math.max(previousStep - 1, 0));
  }, []);

  // Switch tab when step changes
  useEffect(() => {
    if (!isOpen) return;
    const step = steps[currentStep];
    if (step?.switchTab && onSwitchTab) onSwitchTab(step.switchTab);
  }, [currentStep, isOpen]);

  // Update target position and focus management
  useLayoutEffect(() => {
    if (!isOpen) return;

    let rafId = 0;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    const step = steps[currentStep];

    const findTarget = () => step ? document.querySelector(step.selector) as HTMLElement | null : null;

    const measureTarget = () => {
      const target = findTarget();
      if (target) {
        const rect = target.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
           setTargetRect(rect);
        } else {
           setTargetRect(null);
        }
      } else {
        setTargetRect(null);
      }
    };

    // Defer reads to after layout reflow
    const updateTarget = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measureTarget);
    };

    // Scroll the target into view before measuring (handles elements inside scroll containers)
    const el = findTarget();
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      // Wait for smooth scroll to settle, then measure
      settleTimer = setTimeout(measureTarget, 350);
    }
    measureTarget();

    window.addEventListener('resize', updateTarget);
    window.addEventListener('scroll', updateTarget, true);

    // ResizeObserver catches flex/grid reflows that window resize misses
    let ro: ResizeObserver | null = null;
    if (el) {
      ro = new ResizeObserver(updateTarget);
      ro.observe(el);
      if (el.parentElement) ro.observe(el.parentElement);
    }

    // Auto-focus the next button for accessibility
    const timer = setTimeout(() => {
        nextButtonRef.current?.focus();
    }, 100);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateTarget);
      window.removeEventListener('scroll', updateTarget, true);
      ro?.disconnect();
      if (settleTimer) clearTimeout(settleTimer);
      clearTimeout(timer);
    };
  }, [isOpen, currentStep, steps]);

  // Measure tooltip for positioning calculations
  useLayoutEffect(() => {
    if (tooltipRef.current) {
        const { width, height } = tooltipRef.current.getBoundingClientRect();
        setTooltipDimensions({ width, height });
    }
  }, [isOpen, currentStep, targetRect]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Tab') {
          const focusable = tooltipRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          );
          if (!focusable || focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          } else if (!tooltipRef.current?.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleNext();
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handlePrevious();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrevious, isOpen, onClose]);

  if (!isOpen) return null;

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  // Calculate Tooltip Position
  let tooltipStyle: React.CSSProperties = {};

  // Clamp highlight box to viewport
  const highlightPad = 4;
  const ringInset = 4; // extra inset so the ring-2 border doesn't clip at viewport edges
  const hlTop = targetRect ? Math.max(ringInset, targetRect.top - highlightPad) : 0;
  const hlLeft = targetRect ? Math.max(ringInset, targetRect.left - highlightPad) : 0;
  const hlWidth = targetRect ? Math.min(targetRect.width + highlightPad * 2, window.innerWidth - hlLeft - ringInset) : 0;
  const hlHeight = targetRect ? Math.min(targetRect.height + highlightPad * 2, window.innerHeight - hlTop - ringInset) : 0;

  if (targetRect) {
    const gap = 16;
    const tooltipW = tooltipDimensions.width;
    const tooltipH = tooltipDimensions.height;
    const spaceLeft = targetRect.left;
    const spaceRight = window.innerWidth - targetRect.right;
    const spaceBelow = window.innerHeight - targetRect.bottom;
    const spaceAbove = targetRect.top;
    const isTallTarget = targetRect.height > window.innerHeight * 0.5;

    let top: number;
    let left: number;

    // For tall targets (like full-height panels), position to the side
    if (isTallTarget && spaceLeft >= tooltipW + gap) {
      // Position to the LEFT of the target
      left = targetRect.left - tooltipW - gap;
      top = targetRect.top + 60; // Offset from top of panel
    } else if (isTallTarget && spaceRight >= tooltipW + gap) {
      // Position to the RIGHT of the target
      left = targetRect.right + gap;
      top = targetRect.top + 60;
    } else {
      // Standard: center horizontally, position above or below
      const targetCenterX = targetRect.left + (targetRect.width / 2);
      left = targetCenterX - (tooltipW / 2);

      if (spaceBelow >= tooltipH + gap) {
        top = targetRect.bottom + gap;
      } else if (spaceAbove >= tooltipH + gap) {
        top = targetRect.top - tooltipH - gap;
      } else if (spaceBelow > spaceAbove) {
        top = targetRect.bottom + gap;
      } else {
        top = targetRect.top - tooltipH - gap;
      }
    }

    // Clamp to viewport
    const maxLeft = window.innerWidth - tooltipW - 16;
    left = Math.max(16, Math.min(left, maxLeft));
    const maxTop = window.innerHeight - tooltipH - 16;
    top = Math.max(16, Math.min(top, maxTop));

    tooltipStyle = {
        position: 'fixed',
        top,
        left,
        zIndex: 120
    };
  } else {
    // Fallback: Center Screen
    tooltipStyle = {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 120
    };
  }

  return (
    <div
        className="fixed inset-0 z-[100]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guided-tour-title"
        aria-describedby="guided-tour-body"
    >

        {/* 1. Interaction Blocker */}
        <div className="absolute inset-0 bg-transparent" onClick={(e) => e.stopPropagation()} />

        {/* 2. Visual Overlay (Highlight Box) */}
        {targetRect ? (
             <div
                className="absolute z-[110] rounded-xl ring-2 ring-blue-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] pointer-events-none transition-all duration-300 ease-in-out"
                style={{
                    top: hlTop,
                    left: hlLeft,
                    width: hlWidth,
                    height: hlHeight,
                }}
             />
        ) : (
            <div className="absolute inset-0 bg-black/70 z-[110] pointer-events-none" />
        )}

        {/* 3. Tooltip Card */}
        <div
            ref={tooltipRef}
            className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-[360px] max-w-[90vw] max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain shadow-2xl flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-300 absolute"
            style={tooltipStyle}
        >
            <div className="flex justify-between items-start">
                <h3 id="guided-tour-title" className="text-base font-bold text-slate-100 leading-tight">
                    {step.title}
                </h3>
                <button
                    type="button"
                    onClick={onClose}
                    className="min-h-11 min-w-11 -mr-3 -mt-3 text-slate-500 hover:text-white transition-colors inline-flex items-center justify-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    aria-label="Close tour"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <p id="guided-tour-body" className="text-sm text-slate-300 leading-relaxed">
                {step.body}
            </p>

            <div className="flex items-center justify-between pt-2 mt-1">
                <div className="text-xs text-slate-500 font-mono">
                    {currentStep + 1} / {steps.length}
                </div>

                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-11 px-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    >
                        End tour
                    </button>
                    <button
                        type="button"
                        ref={nextButtonRef}
                        onClick={handleNext}
                        className="min-h-11 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-blue-900/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                    >
                        {isLast ? 'Done' : 'Next'}
                        {isLast ? <Check className="w-3 h-3" /> : <ArrowRight className="w-3 h-3" />}
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};

export default GuidedTour;
