
import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import type { CasePackageV1 } from '../core/casePackage';
import type { ConnectionType, DicomWebConfig } from '../types';
import { searchDicomWebStudies } from '../services/dicomService';
import { ArrowRight, Scan, Loader2, Award, ShieldCheck, Check, CircleCheck, Github, BookOpen, ImagePlus, Trash2, FlaskConical, Search, Database, X } from 'lucide-react';
import { beginOpenRouterOAuth } from '../services/openrouterAuth';
import { hasKey, BYOK_CHANGED_EVENT } from '../services/byokStore';
import OpenRouterMark from './OpenRouterLogo';
import './StudyList.css';
import { SAMPLE_CASE_ID } from '../data/sampleCase';
import CaseLibraryPreview from './CaseLibraryPreview';
import { matchesStudyFilter, STUDY_FILTERS } from './studyFilters';

export interface CaseLibraryState {
  searchQuery: string;
  activeFilter: string;
  visibleCount: number;
  scrollTop: number;
  focusTriggerId?: string;
}

interface StudyListProps {
  stateRef?: React.MutableRefObject<CaseLibraryState | undefined>;
  onSelectStudy: (casePackage: CasePackageV1) => void;
  connectionType: ConnectionType;
  setConnectionType: (type: ConnectionType) => void;
  dicomConfig: DicomWebConfig;
  setDicomConfig: (config: DicomWebConfig) => void;
  onShowSafety?: () => void;
  onOpenLessonBuilder?: () => void;
  onOpenCaseStudio?: () => void;
  onOpenResearchSetup?: () => void;
  onOpenSessionData?: () => void;
  onOpenResearchData?: () => void;
  onDeleteLocalCase?: (caseId: string) => Promise<void>;
}

const TESTIMONIALS = [
  { quote: "I thought I had a good grasp on tension pneumothorax. Then it asked me to explain exactly how it causes hypotension and low preload. Turns out I didn't.", author: "PGY-1, General Surgery" },
  { quote: "It doesn't feel like an app. It feels like an attending pulled you aside because they actually want to teach you something.", author: "MS4, applying to residency" },
];

const TestimonialRotator: React.FC = () => {
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  ));
  const animationTimeout = useRef<number | null>(null);

  const selectTestimonial = useCallback((getNextIndex: (currentIndex: number) => number) => {
    if (animationTimeout.current !== null) {
      window.clearTimeout(animationTimeout.current);
      animationTimeout.current = null;
    }
    if (prefersReducedMotion) {
      setIdx(getNextIndex);
      setFade(true);
      return;
    }
    setFade(false);
    animationTimeout.current = window.setTimeout(() => {
      setIdx(getNextIndex);
      setFade(true);
      animationTimeout.current = null;
    }, 400);
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotionPreference = () => setPrefersReducedMotion(motionPreference.matches);
    syncMotionPreference();
    motionPreference.addEventListener?.('change', syncMotionPreference);
    return () => motionPreference.removeEventListener?.('change', syncMotionPreference);
  }, []);

  useEffect(() => () => {
    if (animationTimeout.current !== null) window.clearTimeout(animationTimeout.current);
  }, []);

  const t = TESTIMONIALS[idx];

  return (
    <div className="w-full max-w-[560px] mb-8 flex flex-col items-center text-center px-4">
      <div
        className="transition-all duration-400 ease-in-out"
        style={{
          opacity: fade ? 1 : 0,
          transform: prefersReducedMotion || fade ? 'translateY(0)' : 'translateY(8px)',
          transition: prefersReducedMotion ? 'none' : 'opacity 400ms ease, transform 400ms ease',
        }}
      >
        <p className="text-[16px] text-[#9ca3af] leading-relaxed italic mb-3">
          "{t.quote}"
        </p>
        <p className="text-[14px] text-[#9ca3af] font-medium tracking-wide">
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
            onClick={() => selectTestimonial(() => i)}
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

const ConnectCallout: React.FC = () => {
  const [connected, setConnected] = useState(hasKey());
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const sync = () => setConnected(hasKey());
    window.addEventListener(BYOK_CHANGED_EVENT, sync);
    return () => window.removeEventListener(BYOK_CHANGED_EVENT, sync);
  }, []);
  const connect = async () => {
    setConnecting(true);
    setError('');
    try { await beginOpenRouterOAuth(); }
    catch {
      setConnecting(false);
      setError('Could not open OpenRouter. Please try again.');
    }
  };
  return (
    <aside className="ca-connect" aria-label="Optional AI connection">
      <div>
        <h2>{connected ? 'Your AI tutor is connected' : 'Ready for a deeper conversation?'}</h2>
        <p>{connected ? 'Open a case to ask your own questions.' : 'Connect OpenRouter to ask your own questions. Sample starter answers need no account.'}</p>
        {error && <p role="alert" className="ca-error">{error}</p>}
      </div>
      {connected ? <span className="ca-connected"><Check size={18} aria-hidden="true" /> Connected</span> : (
        <button type="button" onClick={connect} disabled={connecting} className="ca-button ca-button-secondary min-h-11">
          <OpenRouterMark className="h-4 w-4" />
          {connecting ? 'Redirecting to OpenRouter…' : 'Continue with OpenRouter'}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      )}
    </aside>
  );
};

const StudyList: React.FC<StudyListProps> = ({
  onSelectStudy,
  dicomConfig,
  onShowSafety,
  onOpenLessonBuilder,
  onOpenCaseStudio,
  onOpenResearchSetup,
  onDeleteLocalCase,
  onOpenSessionData,
  onOpenResearchData,
  stateRef,
}) => {
  const [casePackages, setCasePackages] = useState<readonly CasePackageV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(stateRef?.current?.visibleCount ?? 12);
  const nextCaseRef = useRef<HTMLButtonElement | null>(null);
  const focusNextIndex = useRef<number | null>(null);
  const [activeFilter, setActiveFilter] = useState(stateRef?.current?.activeFilter ?? 'all');
  const [searchQuery, setSearchQuery] = useState(stateRef?.current?.searchQuery ?? '');
  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const restoredRef = useRef(false);
  const filtersRef = useRef({ activeFilter, searchQuery });
  const rememberLibrary = (focusTriggerId?: string) => {
    if (stateRef) stateRef.current = {
      activeFilter, searchQuery, visibleCount,
      scrollTop: mainRef.current?.scrollTop ?? 0,
      focusTriggerId,
    };
  };
  const selectCase = (casePackage: CasePackageV1, triggerId = `case:${casePackage.id}`) => {
    rememberLibrary(triggerId);
    onSelectStudy(casePackage);
  };

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

  useEffect(() => {
    if (filtersRef.current.activeFilter !== activeFilter || filtersRef.current.searchQuery !== searchQuery) {
      setVisibleCount(12);
      filtersRef.current = { activeFilter, searchQuery };
    }
  }, [activeFilter, searchQuery]);
  useLayoutEffect(() => {
    if (loading || loadError || restoredRef.current || !mainRef.current) return;
    restoredRef.current = true;
    const saved = stateRef?.current;
    if (!saved) return;
    const trigger = Array.from(mainRef.current.querySelectorAll<HTMLButtonElement>('[data-case-trigger]'))
      .find(button => button.dataset.caseTrigger === saved.focusTriggerId);
    trigger?.focus({ preventScroll: true });
    mainRef.current.scrollTop = saved.scrollTop;
  }, [loading, loadError, stateRef]);
  useEffect(() => {
    if (focusNextIndex.current !== null) {
      nextCaseRef.current?.focus();
      focusNextIndex.current = null;
    }
  }, [visibleCount]);

  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const visibleCasePackages = casePackages.filter((casePackage) => {
    if (!matchesStudyFilter(casePackage, activeFilter)) return false;
    if (!normalizedSearchQuery) return true;
    return [
      casePackage.title,
      casePackage.vignette,
      casePackage.domain,
      casePackage.presentation.subtitle,
    ].join(' ').toLocaleLowerCase().includes(normalizedSearchQuery);
  });
  const firstAvailableCase = casePackages.find(casePackage => casePackage.id === SAMPLE_CASE_ID) ?? casePackages[0];
  const hasBuiltInSample = casePackages.some((casePackage) => (
    !casePackage.preview.src.startsWith('case://assets/')
  ));
  const clearCaseFilters = () => {
    setSearchQuery('');
    setActiveFilter('all');
    searchRef.current?.focus();
  };

  return (
    <main ref={mainRef} className="ca-home" aria-labelledby="landing-title" onScroll={() => { if (restoredRef.current) rememberLibrary(stateRef?.current?.focusTriggerId); }}>
      <a className="ca-skip" href="#case-library">Skip to cases</a>
      <header className="ca-header">
        <a href="#" className="ca-brand" aria-label="CaseAttend home">
          <img src="/logo.svg" alt="" aria-hidden="true" width="36" height="36" />
          <h1 id="landing-title">CaseAttend</h1>
        </a>
        <nav aria-label="Main navigation" className="ca-nav">
          <a href="#case-library">Cases</a>
          <a href="#teaching-tools">For educators</a>
          <a href="#how-it-works">How it works</a>
          {onOpenSessionData && <button type="button" onClick={onOpenSessionData} aria-label="Open browser-local session data"><Database size={16} aria-hidden="true" /><span>Session data</span></button>}
        </nav>
      </header>

      <div className="ca-content">
        <section className="ca-intro" aria-labelledby="intro-heading">
          <div>
            <p className="ca-eyebrow">VISUAL LEARNING · MEDICAL EDUCATION</p>
            <h2 id="intro-heading">Look closer. Think it through.</h2>
            <p className="ca-intro-description">Real images. Clinical cases. A tutor that helps you reason, one question at a time.</p>
            {hasBuiltInSample && <p className="ca-free-note"><CircleCheck size={16} aria-hidden="true" />Built-in samples offer pre-reviewed starter questions without an account or key.</p>}
          </div>
          <button type="button" data-case-trigger="sample" onClick={() => firstAvailableCase && selectCase(firstAvailableCase, 'sample')} disabled={!firstAvailableCase} className="ca-button ca-button-primary min-h-11">
            {loading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Scan size={18} aria-hidden="true" />}
            Try a sample case<ArrowRight size={18} aria-hidden="true" />
          </button>
        </section>

        <section id="case-library" className="ca-library" aria-labelledby="cases-heading" tabIndex={-1}>
          <div className="ca-library-heading">
            <div>
              <h2 id="cases-heading">Cases</h2>
              <p aria-live="polite" aria-atomic="true">
                {loading ? 'Loading the case library…' : loadError ? 'The case library is temporarily unavailable.' : `Showing ${Math.min(visibleCount, visibleCasePackages.length)} of ${visibleCasePackages.length} ${visibleCasePackages.length === 1 ? 'case' : 'cases'}`}
              </p>
            </div>
            <div className="ca-search">
              <label htmlFor="case-search" className="sr-only">Search cases</label>
              <Search size={18} aria-hidden="true" />
              <input ref={searchRef} id="case-search" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search title, specialty, or vignette" />
              {searchQuery && <button type="button" aria-label="Clear search" onClick={() => { setSearchQuery(''); searchRef.current?.focus(); }}><X size={16} aria-hidden="true" /></button>}
            </div>
          </div>
          <div className="ca-filters overflow-x-auto" role="group" aria-label="Filter cases">
            {STUDY_FILTERS.map(f => (
              <button key={f.id} type="button" aria-pressed={activeFilter === f.id} onClick={() => setActiveFilter(f.id)} className="min-h-11">{f.label}</button>
            ))}
          </div>
          {(searchQuery || activeFilter !== 'all') && (
            <div className="ca-filter-summary"><span>{visibleCasePackages.length} matching {visibleCasePackages.length === 1 ? 'case' : 'cases'}</span><button type="button" onClick={clearCaseFilters}>Clear search and filters</button></div>
          )}
          <div className="ca-grid" aria-busy={loading}>
            {loading && <div className="ca-empty" role="status" aria-label="Loading cases"><Loader2 size={22} className="animate-spin" aria-hidden="true" /><p>Loading cases…</p></div>}
            {!loading && loadError && <div className="ca-empty"><p role="alert">{loadError}</p><button type="button" onClick={() => void loadCases()} className="ca-button ca-button-primary min-h-11">Try loading cases again</button></div>}
            {!loading && !loadError && visibleCasePackages.length === 0 && <div className="ca-empty" role="status"><Search size={28} aria-hidden="true" /><h3>No cases found</h3><p>{casePackages.length === 0 ? 'No cases are available in this browser yet.' : 'Try another search term or choose a different topic.'}</p></div>}
            {!loading && !loadError && visibleCasePackages.slice(0, visibleCount).map((casePackage, index) => (
              <article key={casePackage.id} className="ca-card">
                <button ref={index === focusNextIndex.current ? nextCaseRef : undefined} data-case-trigger={`case:${casePackage.id}`} type="button" className="ca-card-action" onClick={() => selectCase(casePackage)} aria-label={`Start case: ${casePackage.title}`} />
                <div className="ca-card-image"><CaseLibraryPreview preview={casePackage.preview} /></div>
                {casePackage.preview.src.startsWith('case://assets/') && onDeleteLocalCase && <button type="button" className="ca-delete min-h-11" aria-label={`Delete browser-local case: ${casePackage.title}`} onClick={() => {
                  if (!window.confirm(`Delete browser-local case "${casePackage.title}" from this browser?`)) return;
                  void onDeleteLocalCase(casePackage.id).then(() => loadCases()).catch(() => setLoadError('The browser-local case could not be deleted. Your other cases were not changed.'));
                }}><Trash2 size={16} aria-hidden="true" /></button>}
                <div className="ca-card-body">
                  <p className="ca-card-meta">{casePackage.presentation.subtitle}</p>
                  <h3>{casePackage.title}</h3>
                  <p className="ca-card-vignette">{casePackage.vignette}</p>
                  <div className="ca-card-footer"><span>{casePackage.preview.src.startsWith('case://assets/') ? 'Browser-local case' : 'Explore case'}</span><ArrowRight size={18} aria-hidden="true" /></div>
                </div>
              </article>
            ))}
          </div>
          {!loading && !loadError && visibleCasePackages.length > visibleCount && <div className="ca-show-more"><button type="button" className="ca-button ca-button-secondary min-h-11" onClick={() => { focusNextIndex.current = visibleCount; setVisibleCount(count => count + 12); }}>Show more cases <span>({visibleCasePackages.length - visibleCount} remaining)</span></button></div>}
        </section>

        <ConnectCallout />

        <section id="teaching-tools" className="ca-teaching" aria-labelledby="teaching-heading">
          <div className="ca-section-heading"><p className="ca-eyebrow">FOR EDUCATORS & RESEARCHERS</p><h2 id="teaching-heading">Teach with your own material.</h2><p>Turn teaching images and slides into guided lessons, or prepare a research study.</p></div>
          <div className="ca-tools">
            {onOpenLessonBuilder && <button type="button" onClick={onOpenLessonBuilder} className="ca-tool min-h-11" aria-label="Create a lesson from PDF or PowerPoint"><BookOpen size={22} aria-hidden="true" /><span><strong>Create a lesson</strong><small>Start from a PDF or PowerPoint</small></span><ArrowRight size={18} aria-hidden="true" /></button>}
            {onOpenCaseStudio && <button type="button" onClick={onOpenCaseStudio} className="ca-tool min-h-11" aria-label="Create a case from images"><ImagePlus size={22} aria-hidden="true" /><span><strong>Create a case</strong><small>Use your own teaching images</small></span><ArrowRight size={18} aria-hidden="true" /></button>}
            {onOpenResearchSetup && <button type="button" onClick={onOpenResearchSetup} className="ca-tool min-h-11" aria-label="Set up a research study"><FlaskConical size={22} aria-hidden="true" /><span><strong>Set up a research study</strong><small>Prepare a reproducible protocol</small></span><ArrowRight size={18} aria-hidden="true" /></button>}
          </div>
          {onOpenResearchData && <button type="button" className="ca-text-button" onClick={onOpenResearchData} aria-label="Open restricted research data"><Database size={16} aria-hidden="true" /> Research data</button>}
          <p className="ca-secondary-note">Use de-identified teaching material. Research requires your institution’s approval where applicable.</p>
        </section>

        <section id="how-it-works" className="ca-how" aria-labelledby="how-heading">
          <div className="ca-section-heading"><p className="ca-eyebrow">HOW IT WORKS</p><h2 id="how-heading">Build the reasoning behind the answer.</h2></div>
          <div className="ca-steps">
            <div><span>01</span><h3>Choose a case</h3><p>Read the vignette and choose your learner level, from high school to resident.</p></div>
            <div><span>02</span><h3>Explore the image</h3><p>Zoom, scroll through slices, and draw on the findings you want to discuss.</p></div>
            <div><span>03</span><h3>Think with your tutor</h3><p>Start with reviewed questions. Connect OpenRouter for a live conversation about your current view.</p></div>
          </div>
          <div className="ca-testimonial"><TestimonialRotator /></div>
        </section>
        <footer className="ca-footer">
          <div><strong>CaseAttend</strong><p>For education. Not for diagnosis or treatment.</p></div>
          <nav aria-label="Help and resources">
            {onShowSafety && <button type="button" onClick={onShowSafety}><ShieldCheck size={16} aria-hidden="true" />Safety &amp; privacy</button>}
            <a href="https://github.com/JamesWeatherhead/CaseAttend/blob/main/docs/README.md" target="_blank" rel="noopener noreferrer">User guides</a>
            <a href="/image-credits.html">Image credits</a>
            <a href="https://github.com/JamesWeatherhead/CaseAttend" target="_blank" rel="noopener noreferrer"><Github size={16} aria-hidden="true" />Source</a>
            <a href="https://github.com/JamesWeatherhead/CaseAttend/blob/main/CITATION.cff" target="_blank" rel="noopener noreferrer">Cite</a>
            <a href="https://www.kaggle.com/competitions/gemini-3/writeups/new-writeup-1765065566929" target="_blank" rel="noopener noreferrer"><Award size={16} aria-hidden="true" />Hackathon story</a>
          </nav>
        </footer>
      </div>
    </main>
  );
};

export default StudyList;
