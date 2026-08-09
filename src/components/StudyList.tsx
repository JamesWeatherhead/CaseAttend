
import React, { useState, useEffect, useCallback } from 'react';
import type { CasePackageV1 } from '../core/casePackage';
import type { ConnectionType, DicomWebConfig } from '../types';
import { searchDicomWebStudies } from '../services/dicomService';
import { ArrowRight, Scan, Loader2, Award, ShieldCheck, Check, CircleCheck, Github, Mail, Layers, KeyRound, BookOpen, ImagePlus, Trash2, FlaskConical } from 'lucide-react';
import { beginOpenRouterOAuth } from '../services/openrouterAuth';
import { hasKey, BYOK_CHANGED_EVENT } from '../services/byokStore';
import OpenRouterMark, { OpenRouterLockup } from './OpenRouterLogo';
import { casePackageStore } from '../services/casePackageStore';

interface StudyListProps {
  onSelectStudy: (casePackage: CasePackageV1) => void;
  connectionType: ConnectionType;
  setConnectionType: (type: ConnectionType) => void;
  dicomConfig: DicomWebConfig;
  setDicomConfig: (config: DicomWebConfig) => void;
  onShowSafety?: () => void;
  onOpenLessonBuilder?: () => void;
  onOpenCaseStudio?: () => void;
  onOpenResearchSetup?: () => void;
  onDeleteLocalCase?: (caseId: string) => Promise<void>;
}

const CasePreviewBackdrop: React.FC<{
  casePackage: CasePackageV1;
  active: boolean;
}> = ({ casePackage, active }) => {
  const [src, setSrc] = useState(
    casePackage.preview.src.startsWith('case://assets/') ? '' : casePackage.preview.src,
  );

  useEffect(() => {
    let mounted = true;
    if (!casePackage.preview.src.startsWith('case://assets/')) {
      setSrc(casePackage.preview.src);
      return () => { mounted = false; };
    }
    void casePackageStore.resolveAssetUri(casePackage.preview.src).then((resolved) => {
      if (mounted) setSrc(resolved);
    }).catch(() => {
      if (mounted) setSrc('');
    });
    return () => { mounted = false; };
  }, [casePackage.preview.src]);

  return (
    <div
      role="img"
      aria-label={casePackage.preview.alt}
      className="absolute inset-0 transition-all duration-700 ease-out"
      style={{
        backgroundImage: src ? `url(${src})` : 'none',
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        opacity: active ? 0.8 : 0.6,
        imageRendering: 'auto',
        transition: 'opacity 500ms ease',
      }}
    />
  );
};

const TESTIMONIALS = [
  { quote: "I thought I had a good grasp on tension pneumothorax. Then it asked me to explain exactly how it causes hypotension and low preload. Turns out I didn't.", author: "PGY-1, General Surgery" },
  { quote: "It doesn't feel like an app. It feels like an attending pulled you aside because they actually want to teach you something.", author: "MS4, applying to residency" },
];

const TestimonialRotator: React.FC = () => {
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);

  const next = useCallback(() => {
    setFade(false);
    setTimeout(() => {
      setIdx(prev => (prev + 1) % TESTIMONIALS.length);
      setFade(true);
    }, 400);
  }, []);

  useEffect(() => {
    const timer = setInterval(next, 10000);
    return () => clearInterval(timer);
  }, [next]);

  const t = TESTIMONIALS[idx];

  return (
    <div className="w-full max-w-[560px] mb-8 flex flex-col items-center text-center px-4">
      <div
        className="transition-all duration-400 ease-in-out"
        style={{
          opacity: fade ? 1 : 0,
          transform: fade ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 400ms ease, transform 400ms ease',
        }}
      >
        <p className="text-[13px] sm:text-[14px] text-[#9ca3af] leading-relaxed italic mb-3">
          "{t.quote}"
        </p>
        <p className="text-[11px] text-[#4a4e58] font-medium tracking-wide">
          {t.author}
        </p>
      </div>
      {/* Dots */}
      <div className="flex gap-1.5 mt-4">
        {TESTIMONIALS.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Show testimonial ${i + 1} of ${TESTIMONIALS.length}`}
            aria-pressed={i === idx}
            onClick={() => { setFade(false); setTimeout(() => { setIdx(i); setFade(true); }, 400); }}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            <span
              aria-hidden="true"
              className={`h-1.5 rounded-full transition-all duration-300 ${i === idx ? 'w-4 bg-[#8a8f98]' : 'w-1.5 bg-[#2a2d35]'}`}
            />
          </button>
        ))}
      </div>
    </div>
  );
};

/** Multi-colour Google "G", for the sign-in method chip. */
const GoogleG: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
    <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
    <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
    <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
  </svg>
);

/** One sign-in-method chip; every route goes through OpenRouter's own sign-in. */
const ProviderChip: React.FC<{ label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean }> = ({ label, icon, onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={`Continue with OpenRouter using ${label}`}
    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.02] hover:bg-white/[0.05] disabled:opacity-60 px-3.5 py-2 text-[13px] text-[#c9ced8] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
  >
    {icon}
    <span>{label}</span>
  </button>
);

/**
 * Landing-page activation band: a two-column OpenRouter sign-in. The left states
 * the offer (free, no card, sign-in methods); the right is the single blue
 * "Continue with OpenRouter" action and its two reassurances. Once connected it
 * collapses to a quiet confirmation instead of nagging.
 */
const ConnectCallout: React.FC = () => {
  const [connected, setConnected] = useState<boolean>(hasKey());
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const sync = () => setConnected(hasKey());
    window.addEventListener(BYOK_CHANGED_EVENT, sync);
    return () => window.removeEventListener(BYOK_CHANGED_EVENT, sync);
  }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      await beginOpenRouterOAuth(); // full-page redirect to OpenRouter sign-in
    } catch {
      setConnecting(false); // only reached if the redirect failed to start
    }
  };

  if (connected) {
    return (
      <div className="w-full max-w-[1100px] mb-12 flex justify-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-950/30 px-4 py-2 text-[13px] text-emerald-300/90">
          <Check className="w-4 h-4 flex-shrink-0" />
          <span>Connected to OpenRouter. Pick a case below to begin.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1100px] mb-12 rounded-[20px] border border-white/[0.07] bg-white/[0.02] p-6 sm:p-9">
      <div className="grid grid-cols-1 md:grid-cols-2">

        {/* Left: the offer */}
        <div className="md:pr-10">
          <OpenRouterLockup className="h-[26px] w-auto" />
          <h2 className="mt-5 text-[22px] sm:text-[24px] font-semibold text-white tracking-[-0.02em]">
            Start free with OpenRouter
          </h2>
          <p className="mt-2.5 max-w-[420px] text-[14px] leading-relaxed text-[#9096a0]">
            Use Google, GitHub, or email to sign in in seconds. No credit card required.
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <ProviderChip label="Google" onClick={connect} disabled={connecting} icon={<GoogleG className="w-[15px] h-[15px]" />} />
            <ProviderChip label="GitHub" onClick={connect} disabled={connecting} icon={<Github className="w-[15px] h-[15px]" />} />
            <ProviderChip label="Email" onClick={connect} disabled={connecting} icon={<Mail className="w-[15px] h-[15px]" />} />
          </div>
        </div>

        {/* Right: the action */}
        <div className="mt-8 pt-8 border-t border-white/[0.07] md:mt-0 md:pt-0 md:border-t-0 md:border-l md:border-white/[0.07] md:pl-10 flex flex-col justify-center">
          <button
            onClick={connect}
            disabled={connecting}
            className="w-full inline-flex items-center justify-center gap-2 sm:gap-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 h-[52px] px-4 sm:px-6 text-[15px] font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
          >
            <OpenRouterMark className="w-[18px] h-[18px]" />
            <span>{connecting ? 'Redirecting to OpenRouter…' : 'Continue with OpenRouter'}</span>
            {!connecting && <ArrowRight className="w-4 h-4" />}
          </button>
          <ul className="mt-5 space-y-3">
            <li className="flex items-center gap-2.5 text-[13.5px] text-[#9096a0]">
              <CircleCheck className="w-[18px] h-[18px] flex-shrink-0 text-[#6b7080]" />
              <span>Two free Gemma vision models included</span>
            </li>
            <li className="flex items-center gap-2.5 text-[13.5px] text-[#9096a0]">
              <ShieldCheck className="w-[18px] h-[18px] flex-shrink-0 text-[#6b7080]" />
              <span>Your key is sent only to OpenRouter</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'xray', label: 'X-ray' },
  { id: 'ct', label: 'CT' },
  { id: 'mri', label: 'MRI' },
  { id: 'path', label: 'Pathology' },
  { id: 'derm', label: 'Dermatology' },
];

const StudyList: React.FC<StudyListProps> = ({
  onSelectStudy,
  dicomConfig,
  onOpenLessonBuilder,
  onOpenCaseStudio,
  onOpenResearchSetup,
  onDeleteLocalCase,
}) => {
  const [casePackages, setCasePackages] = useState<readonly CasePackageV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState('all');

  const loadCases = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setCasePackages(await searchDicomWebStudies(dicomConfig));
    } catch {
      setLoadError('Cases could not be loaded. Your browser-local session data is still available.');
    } finally {
      setLoading(false);
    }
  }, [dicomConfig]);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  if (loading) {
    return <div className="flex items-center justify-center h-full bg-[#06070a]" role="status" aria-label="Loading cases"><Loader2 className="w-5 h-5 text-[#62666d] animate-spin" /></div>;
  }

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-[#06070a] px-6 text-center">
        <p className="max-w-md text-sm text-[#c9ced8]" role="alert">{loadError}</p>
        <button
          type="button"
          onClick={() => void loadCases()}
          className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        >
          Try loading cases again
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full bg-[#06070a] overflow-y-auto">

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center px-4 sm:px-6 pt-12 sm:pt-20 pb-12">

        {/* Brand */}
        <div className="flex flex-col items-center mb-6 sm:mb-8">
          <div className="flex items-center gap-4 sm:gap-5 mb-4">
            <img src="/logo.svg" alt="CaseAttend" className="w-12 h-12 sm:w-16 sm:h-16 rounded-[14px]" />
            <h1 className="text-[38px] sm:text-[56px] font-bold text-white tracking-[-0.03em]">
              CaseAttend
            </h1>
          </div>
          <p className="text-[18px] sm:text-[22px] text-[#d0d6e0] font-medium mb-3 text-center max-w-[720px] leading-snug tracking-[-0.01em]">
            Case-based visual reasoning tutor for medical education.
          </p>
          <p className="text-[14px] sm:text-[15px] text-[#8a8f98] font-normal text-center max-w-[600px] leading-relaxed">
            Read the case. Scroll the image. Draw on it. The tutor teaches by asking, points at what you should see, and adapts to your level, from high school to resident. Radiology, pathology, dermatology.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            {onOpenLessonBuilder && (
              <button
                type="button"
                onClick={onOpenLessonBuilder}
                className="min-h-11 inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 text-[13px] font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070a]"
              >
                <BookOpen className="w-4 h-4" aria-hidden="true" />
                Create a lesson
              </button>
            )}
            {onOpenCaseStudio && (
              <button
                type="button"
                onClick={onOpenCaseStudio}
                className="min-h-11 inline-flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.05] hover:bg-white/[0.09] px-4 text-[13px] font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070a]"
              >
                <ImagePlus className="w-4 h-4" aria-hidden="true" />
                Create a case
              </button>
            )}
            {onOpenResearchSetup && (
              <button
                type="button"
                onClick={onOpenResearchSetup}
                className="min-h-11 inline-flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-400/[0.08] hover:bg-violet-400/[0.14] px-4 text-[13px] font-semibold text-violet-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06070a]"
              >
                <FlaskConical className="w-4 h-4" aria-hidden="true" />
                Set up a research study
              </button>
            )}
            <a href="#how-it-works" className="min-h-11 inline-flex items-center px-3 text-[12px] text-blue-400/80 hover:text-blue-300 underline underline-offset-4 decoration-blue-500/30 hover:decoration-blue-400/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 rounded-lg">
              How it works
            </a>
          </div>
          {(onOpenLessonBuilder || onOpenResearchSetup) && (
            <p className="mt-2 text-[11px] text-[#5e6570] text-center">
              Build versioned teaching content or a reproducible VLM education protocol in your browser. CaseAttend does not provide institutional approval.
            </p>
          )}
        </div>

        {/* Testimonial social proof up top, before the ask */}
        <div className="w-full flex justify-center mb-6 sm:mb-8">
          <TestimonialRotator />
        </div>

        {/* Trust signals */}
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-5 mb-8">
          <a href="https://www.kaggle.com/competitions/gemini-3/writeups/new-writeup-1765065566929" target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 text-[13px] sm:text-[14px] text-amber-400/90 font-medium hover:text-amber-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 rounded-lg">
            <Award className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
            <span>Google DeepMind Hackathon Winner</span>
          </a>
        </div>

        {/* Sign in with OpenRouter. Free, no card, credentials stay with OpenRouter. */}
        <ConnectCallout />

        {/* Section label + filters */}
        <div className="w-full max-w-[1100px] mb-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] font-semibold text-[#4a4e58] uppercase tracking-[0.1em]">Cases</p>
          <div className="flex w-full max-w-full gap-1 overflow-x-auto pb-1 sm:w-auto" aria-label="Filter cases">
            {FILTERS.map(f => (
              <button
                key={f.id}
                type="button"
                aria-pressed={activeFilter === f.id}
                onClick={() => setActiveFilter(f.id)}
                className={`min-h-11 shrink-0 whitespace-nowrap px-3 py-1 rounded-full text-[11px] font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
                  activeFilter === f.id
                    ? 'bg-white/[0.08] text-white'
                    : 'text-[#4a4e58] hover:text-[#8a8f98] hover:bg-white/[0.03]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Case grid: 1 col mobile, 2 col tablet, 3 col desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-[1100px]">
          {casePackages.filter((casePackage) => activeFilter === 'all' || casePackage.presentation.category === activeFilter).map((casePackage) => {
            const active = hovered === casePackage.id;
            const { presentation } = casePackage;

            return (
              <article
                key={casePackage.id}
                onMouseEnter={() => setHovered(casePackage.id)}
                onMouseLeave={() => setHovered(null)}
                className="group relative rounded-2xl overflow-hidden text-left outline-none aspect-[4/5] sm:aspect-[4/5]"
                style={{
                  transition: 'transform 250ms cubic-bezier(0.16,1,0.3,1), box-shadow 250ms ease',
                  transform: active ? 'scale(1.02)' : 'scale(1)',
                  boxShadow: active ? `0 0 40px 8px ${presentation.accentGlow}` : 'none',
                }}
              >
                <button
                  type="button"
                  className="absolute inset-0 z-20 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-inset"
                  onClick={() => onSelectStudy(casePackage)}
                  aria-label={`Start case: ${casePackage.title}`}
                />
                {casePackage.preview.src.startsWith('case://assets/') && onDeleteLocalCase && (
                  <button
                    type="button"
                    className="absolute right-3 top-3 z-30 inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-white/[0.12] bg-black/70 text-[#c9ced8] hover:bg-red-950 hover:text-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                    aria-label={`Delete browser-local case: ${casePackage.title}`}
                    onClick={() => {
                      if (!window.confirm(`Delete browser-local case "${casePackage.title}" from this browser?`)) return;
                      void onDeleteLocalCase(casePackage.id).then(() => loadCases()).catch(() => {
                        setLoadError('The browser-local case could not be deleted. Your other cases were not changed.');
                      });
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
                {/* Background image: fills the card */}
                <div className="absolute inset-0">
                  <CasePreviewBackdrop casePackage={casePackage} active={active} />
                  {/* Gradient overlay: dark at bottom for text legibility only */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(to top, #06070a 20%, rgba(6,7,10,0.6) 50%, transparent 70%)`,
                    }}
                  />
                  {/* Modality-colored ambient glow at top */}
                  <div
                    className="absolute inset-0 transition-opacity duration-500"
                    style={{
                      background: `radial-gradient(ellipse 80% 50% at 50% 0%, ${presentation.accentGlow}, transparent 70%)`,
                      opacity: active ? 1 : 0.5,
                    }}
                  />
                </div>

                {/* Border */}
                <div className="absolute inset-0 rounded-2xl transition-all duration-200" style={{
                  boxShadow: active
                    ? `inset 0 0 0 1px ${presentation.accentBorder}`
                    : 'inset 0 0 0 1px rgba(255,255,255,0.04)',
                }} />

                {/* Content pinned to bottom */}
                <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-5 pt-8">
                  {/* Modality tag */}
                  <div className={`text-[10px] font-bold uppercase tracking-wider ${presentation.textClass} mb-2 opacity-80`}>
                    {presentation.subtitle}
                  </div>
                  {casePackage.preview.src.startsWith('case://assets/') && (
                    <div className="mb-2 inline-flex min-h-6 items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                      Browser-local
                    </div>
                  )}

                  {/* Case title */}
                  <div className="text-[16px] sm:text-[17px] font-bold text-white leading-tight mb-2">
                    {casePackage.title}
                  </div>

                  {/* Clinical vignette */}
                  <p className="text-[11px] sm:text-[12px] text-[#6b7080] leading-relaxed mb-3 group-hover:text-[#8a8f98] transition-colors duration-300 line-clamp-3">
                    {casePackage.vignette}
                  </p>

                  {/* CTA */}
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold ${presentation.textClass} uppercase tracking-[0.08em] opacity-70 group-hover:opacity-100 transition-opacity`}>
                      Start Case
                    </span>
                    <ArrowRight className={`w-3.5 h-3.5 ${presentation.textClass} opacity-0 group-hover:opacity-70 transition-all duration-200 group-hover:translate-x-0.5`} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* How it works anchor target for the hero link, and depth for scroll-down readers */}
        <section id="how-it-works" className="mt-20 w-full max-w-[1000px] scroll-mt-16">
          <div className="text-center mb-10">
            <p className="text-[11px] font-semibold text-[#4a4e58] uppercase tracking-[0.1em] mb-3">How it works</p>
            <h2 className="text-[24px] sm:text-[32px] font-bold text-white tracking-[-0.02em] mb-3">
              An AI tutor grounded in a real artifact.
            </h2>
            <p className="text-[14px] sm:text-[15px] text-[#8a8f98] max-w-[640px] mx-auto leading-relaxed">
              Not another chat bot. CaseAttend teaches case-based visual reasoning: the tutor asks before it tells, points at what you should see, and adapts to your level. The engine is domain-agnostic; the content is per-specialty.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="rounded-2xl border border-white/[0.06] bg-[#0f1011] p-6 hover:border-white/[0.12] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
                <Scan className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-[15px] font-bold text-white mb-2">Case-based, not chat-based</h3>
              <p className="text-[13px] text-[#8a8f98] leading-relaxed">
                Every session is a real image with a clinical vignette. You scroll slices, adjust contrast, draw on findings. The tutor teaches from a question-first scaffold, not a monologue.
              </p>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-[#0f1011] p-6 hover:border-white/[0.12] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center mb-4">
                <Layers className="w-5 h-5 text-fuchsia-400" />
              </div>
              <h3 className="text-[15px] font-bold text-white mb-2">Domain plugin architecture</h3>
              <p className="text-[13px] text-[#8a8f98] leading-relaxed">
                Same viewer, same tutor scaffold, different content. Radiology, pathology, dermatology today. A fourth domain is a plugin file plus a prompt module. No viewer edits. See <a href="https://github.com/JamesWeatherhead/CaseAttend/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2 decoration-blue-500/30">CONTRIBUTING</a>.
              </p>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-[#0f1011] p-6 hover:border-white/[0.12] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                <KeyRound className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-[15px] font-bold text-white mb-2">BYOK, no keys on our servers</h3>
              <p className="text-[13px] text-[#8a8f98] leading-relaxed">
                Your OpenRouter key is stored in your browser and sent only to OpenRouter for model requests. CaseAttend servers never receive it. Two free vision models included.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-[#0a0b0c] p-6">
            <p className="text-[11px] font-semibold text-[#4a4e58] uppercase tracking-[0.1em] mb-4">Under the hood</p>
            <ul className="space-y-3 text-[13px] text-[#8a8f98] leading-relaxed">
              <li className="flex gap-3">
                <Check className="w-4 h-4 flex-shrink-0 mt-[3px] text-emerald-500/70" />
                <span>Structured <code className="text-[12px] font-mono text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded">&lt;POINTERS&gt;</code> and <code className="text-[12px] font-mono text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded">&lt;SUGGESTIONS&gt;</code> emitted by the model, rendered on-image and per-learner-level.</span>
              </li>
              <li className="flex gap-3">
                <Check className="w-4 h-4 flex-shrink-0 mt-[3px] text-emerald-500/70" />
                <span>Learner-level system prompts (High school, Undergrad, Pre-Step 1, Post-Step 1, Resident) so depth adapts to your background.</span>
              </li>
              <li className="flex gap-3">
                <Check className="w-4 h-4 flex-shrink-0 mt-[3px] text-emerald-500/70" />
                <span>Submitting a question captures an image from the viewer at that moment, including learner annotations.</span>
              </li>
              <li className="flex gap-3">
                <Check className="w-4 h-4 flex-shrink-0 mt-[3px] text-emerald-500/70" />
                <span>Auto-capture on send: the AI sees whatever you're looking at (and any drawings you just made) the moment you press Enter. No manual capture step.</span>
              </li>
            </ul>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-[12px] text-[#6b7080]">
            <a href="https://github.com/JamesWeatherhead/CaseAttend" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-white transition-colors">
              <Github className="w-3.5 h-3.5" /> Source on GitHub (AGPL-3.0)
            </a>
            <span className="text-[#2a2d33]">•</span>
            <a href="https://www.kaggle.com/competitions/gemini-3/writeups/new-writeup-1765065566929" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-white transition-colors">
              <Award className="w-3.5 h-3.5" /> Google DeepMind hackathon writeup
            </a>
            <span className="text-[#2a2d33]">•</span>
            <a href="https://github.com/JamesWeatherhead/CaseAttend/blob/main/CITATION.cff" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              Cite
            </a>
          </div>
        </section>

      </div>
    </div>
  );
};

export default StudyList;
