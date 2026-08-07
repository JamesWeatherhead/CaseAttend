
import React, { useState, useLayoutEffect, useEffect, useRef } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';

export type TourId = 'onboarding' | 'ai-tour' | 'seg-tour';

interface Step {
  selector: string;
  title: string;
  body: string;
  switchTab?: 'ai' | 'segment';
}

const TOURS: Record<TourId, Step[]> = {
  'onboarding': [
    // Phase 1: AI Tutor intro
    {
      selector: '[data-tour-id="ai-panel"]',
      title: 'Welcome to CaseAttend',
      body: 'Read the case above. You have a patient with a clinical history, and imaging has been ordered. Your job: find the abnormality and interpret it.',
      switchTab: 'ai'
    },
    {
      selector: '[data-tour-id="ai-provider"]',
      title: 'AI Model',
      body: 'You are using Claude Opus 4.6 from Anthropic, one of the leading frontier AI labs. Support for OpenAI, Google, and other major providers is coming soon.',
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
      body: 'Use the Annotate tab to mark findings directly on the image. Pick a label, choose a color, and paint on the slice.',
      switchTab: 'segment'
    },
    {
      selector: '[data-tour-id="seg-controls"]',
      title: 'Brush & Eraser',
      body: 'Select Brush to paint or Eraser to remove. Adjust the brush size with the slider.',
      switchTab: 'segment'
    },
    // Phase 3: Back to AI tutor for the workflow
    {
      selector: '[data-tour-id="series-rail"]',
      title: 'Pick a Sequence',
      body: 'Different MRI sequences show different things. Start on FLAIR, then the tutor will guide you through DWI, T1, and ADC.',
      switchTab: 'ai'
    },
    {
      selector: '[data-tour-id="capture-button"]',
      title: 'Capture & Discuss',
      body: 'When you spot something, capture the slice with the camera. The tutor will ask you to describe what you see and guide you through the interpretation.',
      switchTab: 'ai'
    },
    {
      selector: '[data-tour-id="ai-suggestions"]',
      title: 'Suggested Questions',
      body: 'Not sure what to ask? These suggestions adapt to your level. Use them as starting points, or type your own.',
      switchTab: 'ai'
    }
  ],
  'ai-tour': [
    {
      selector: '[data-tour-id="ai-panel"]',
      title: 'Your AI Tutor',
      body: 'The tutor asks what you see before telling you. This is an educational tool with pre-verified teaching cases, not a clinical diagnostic system.'
    },
    {
      selector: '[data-tour-id="ai-provider"]',
      title: 'AI Model',
      body: 'You are currently using Claude Opus 4.6 from Anthropic, one of the leading frontier AI labs. Support for OpenAI, Google, and other major providers is coming soon.'
    },
    {
      selector: '[data-tour-id="teaching-levels"]',
      title: 'Teaching Levels',
      body: 'Choose your level. At High School you get plain language and analogies. At Resident level you get board-style clinical reasoning and differential diagnoses.'
    },
    {
      selector: '[data-tour-id="ai-suggestions"]',
      title: 'Suggested Questions',
      body: 'These adapt to your level and what you are looking at. Use them as starting points, or type your own questions.'
    },
    {
      selector: '[data-tour-id="capture-button"]',
      title: 'Capture First, Then Ask',
      body: 'The tutor needs to see what you see. Capture a slice before asking about a specific finding, otherwise answers will be generic.'
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
      body: 'Use annotations to highlight anatomy and mark findings. Paint directly on the image for teaching and practice.'
    },
    {
      selector: '[data-tour-id="seg-controls"]',
      title: 'Tools & Opacity',
      body: 'Switch between Pointer, Brush, and Eraser. Adjust opacity to see your annotations overlaid on the image.'
    },
    {
      selector: '[data-tour-id="seg-palette"]',
      title: 'Labels',
      body: 'Create named labels with different colors. Click a label to make it active, then paint on the slice to mark that structure.'
    }
  ]
};

interface GuidedTourProps {
  tourId: TourId | null;
  onClose: () => void;
  onSwitchTab?: (tab: 'ai' | 'segment') => void;
}

const GuidedTour: React.FC<GuidedTourProps> = ({ tourId, onClose, onSwitchTab }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipDimensions, setTooltipDimensions] = useState({ width: 0, height: 0 });

  const tooltipRef = useRef<HTMLDivElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  // Reset tour state when tourId changes
  useEffect(() => {
    if (tourId) {
      setCurrentStep(0);
      // Switch tab for the first step
      const firstStep = TOURS[tourId]?.[0];
      if (firstStep?.switchTab && onSwitchTab) onSwitchTab(firstStep.switchTab);
    }
  }, [tourId]);

  const steps = tourId ? TOURS[tourId] : [];
  const isOpen = !!tourId && steps.length > 0;

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
      setTimeout(measureTarget, 350);
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
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onClose();
    }
  };

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
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">

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
            className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-[360px] max-w-[90vw] shadow-2xl flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-300 absolute"
            style={tooltipStyle}
        >
            <div className="flex justify-between items-start">
                <h3 className="text-base font-bold text-slate-100 leading-tight">
                    {step.title}
                </h3>
                <button
                    onClick={onClose}
                    className="text-slate-500 hover:text-white transition-colors"
                    aria-label="Close tour"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
                {step.body}
            </p>

            <div className="flex items-center justify-between pt-2 mt-1">
                <div className="text-xs text-slate-500 font-mono">
                    {currentStep + 1} / {steps.length}
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={onClose}
                        className="text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
                    >
                        End tour
                    </button>
                    <button
                        ref={nextButtonRef}
                        onClick={handleNext}
                        className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-blue-900/20"
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
