
import React, { useState, useEffect, useCallback } from 'react';
import { Study, ConnectionType, DicomWebConfig } from '../types';
import { searchDicomWebStudies } from '../services/dicomService';
import { ArrowRight, Scan, Microscope, Loader2, Award, Check, Github, Layers, KeyRound, BookOpen, FlaskConical, Code2 } from 'lucide-react';
import { beginOpenRouterOAuth } from '../services/openrouterAuth';
import { hasKey, BYOK_CHANGED_EVENT } from '../services/byokStore';
import OpenRouterMark, { OpenRouterLockup } from './OpenRouterLogo';

interface StudyListProps {
  onSelectStudy: (study: Study) => void;
  connectionType: ConnectionType;
  setConnectionType: (type: ConnectionType) => void;
  dicomConfig: DicomWebConfig;
  setDicomConfig: (config: DicomWebConfig) => void;
  onShowSafety?: () => void;
}

const CARDS = [
  {
    studyId: 'local-study-sub1',
    modality: 'MR',
    label: '72F, progressive memory decline',
    subtitle: 'Brain MRI',
    detail: 'Forgetting words and getting lost in familiar places. History of irregular heartbeat, high blood pressure, and diabetes.',
    icon: Scan,
    preview: '/images/sub-1/FLAIR/14.png',
    accentColor: 'rgba(59,130,246,1)',
    accentGlow: 'rgba(59,130,246,0.15)',
    accentBorder: 'rgba(59,130,246,0.3)',
    textClass: 'text-blue-400',
  },
  {
    studyId: 'patho-study-breast',
    modality: 'PATH',
    label: '62F, suspicious breast mass',
    subtitle: 'Pathology',
    detail: 'Lump found during routine exam. Imaging showed a suspicious mass. Biopsy taken for microscopic review.',
    icon: Microscope,
    preview: '/images/patho-1/HE_10x/1.webp',
    accentColor: 'rgba(244,63,94,1)',
    accentGlow: 'rgba(244,63,94,0.15)',
    accentBorder: 'rgba(244,63,94,0.3)',
    textClass: 'text-rose-400',
  },
  {
    studyId: 'cxr-pneumothorax',
    modality: 'CR',
    label: '21M, sudden chest pain',
    subtitle: 'Chest X-ray',
    detail: 'A tall, thin young man struggling to breathe after sudden stabbing chest pain.',
    icon: Scan,
    preview: '/images/cxr-pneumothorax/1.jpg',
    accentColor: 'rgba(245,158,11,1)',
    accentGlow: 'rgba(245,158,11,0.15)',
    accentBorder: 'rgba(245,158,11,0.3)',
    textClass: 'text-amber-400',
  },
  {
    studyId: 'cxr-pneumonia',
    modality: 'CR',
    label: '67M, cough and fever',
    subtitle: 'Chest X-ray',
    detail: 'Three days of worsening cough with thick sputum, fever, and chills.',
    icon: Scan,
    preview: '/images/cxr-pneumonia/1.jpg',
    accentColor: 'rgba(34,197,94,1)',
    accentGlow: 'rgba(34,197,94,0.15)',
    accentBorder: 'rgba(34,197,94,0.3)',
    textClass: 'text-green-400',
  },
  {
    studyId: 'cxr-chf',
    modality: 'CR',
    label: '68M, shortness of breath',
    subtitle: 'Chest X-ray',
    detail: 'Cannot lie flat, coughing up pink frothy sputum. Classic signs of fluid in the lungs.',
    icon: Scan,
    preview: '/images/cxr-chf/1.jpg',
    accentColor: 'rgba(139,92,246,1)',
    accentGlow: 'rgba(139,92,246,0.15)',
    accentBorder: 'rgba(139,92,246,0.3)',
    textClass: 'text-violet-400',
  },
  {
    studyId: 'cxr-effusion',
    modality: 'CR',
    label: '58M, progressive dyspnea',
    subtitle: 'Chest X-ray',
    detail: 'Weight loss and worsening shortness of breath over several weeks. One side looks dramatically different.',
    icon: Scan,
    preview: '/images/cxr-effusion/1.jpg',
    accentColor: 'rgba(6,182,212,1)',
    accentGlow: 'rgba(6,182,212,0.15)',
    accentBorder: 'rgba(6,182,212,0.3)',
    textClass: 'text-cyan-400',
  },
  {
    studyId: 'axr-sbo',
    modality: 'CR',
    label: '45F, abdominal pain and vomiting',
    subtitle: 'Abdominal X-ray',
    detail: 'Two days of worsening belly pain, bloating, and vomiting. She had her appendix removed years ago.',
    icon: Scan,
    preview: '/images/axr-sbo/1.jpg',
    accentColor: 'rgba(251,146,60,1)',
    accentGlow: 'rgba(251,146,60,0.15)',
    accentBorder: 'rgba(251,146,60,0.3)',
    textClass: 'text-orange-400',
  },
  {
    studyId: 'ct-epidural',
    modality: 'CT',
    label: '87F, fall with head injury',
    subtitle: 'Head CT',
    detail: 'An elderly woman found on the floor after a fall. She was initially alert but is now becoming drowsy.',
    icon: Scan,
    preview: '/images/ct-epidural/1.jpg',
    accentColor: 'rgba(20,184,166,1)',
    accentGlow: 'rgba(20,184,166,0.15)',
    accentBorder: 'rgba(20,184,166,0.3)',
    textClass: 'text-teal-400',
  },
  {
    studyId: 'ct-subdural',
    modality: 'CT',
    label: '80F, progressive headache',
    subtitle: 'Head CT',
    detail: 'Worsening headache and confusion over several days. She takes blood thinners for her heart.',
    icon: Scan,
    preview: '/images/ct-subdural/1.jpg',
    accentColor: 'rgba(236,72,153,1)',
    accentGlow: 'rgba(236,72,153,0.15)',
    accentBorder: 'rgba(236,72,153,0.3)',
    textClass: 'text-pink-400',
  },
  {
    studyId: 'cxr-pneumoperitoneum',
    modality: 'CR',
    label: '71F, acute abdominal pain',
    subtitle: 'Upright X-ray',
    detail: 'Sudden severe belly pain with a rigid, board-like abdomen. This is a surgical emergency.',
    icon: Scan,
    preview: '/images/cxr-pneumoperitoneum/1.jpg',
    accentColor: 'rgba(239,68,68,1)',
    accentGlow: 'rgba(239,68,68,0.15)',
    accentBorder: 'rgba(239,68,68,0.3)',
    textClass: 'text-red-400',
  },
  {
    studyId: 'axr-nec',
    modality: 'CR',
    label: 'Neonate, feeding intolerance',
    subtitle: 'Neonatal X-ray',
    detail: 'A premature baby with bloody stools, abdominal distension, and bilious vomiting.',
    icon: Scan,
    preview: '/images/axr-nec/1.jpg',
    accentColor: 'rgba(234,179,8,1)',
    accentGlow: 'rgba(234,179,8,0.15)',
    accentBorder: 'rgba(234,179,8,0.3)',
    textClass: 'text-yellow-400',
  },
  {
    studyId: 'xr-colles',
    modality: 'CR',
    label: 'Adult, wrist injury after fall',
    subtitle: 'Wrist X-ray',
    detail: 'Fell on an outstretched hand. The wrist looks deformed with a visible bump on the back.',
    icon: Scan,
    preview: '/images/xr-colles/1.jpg',
    accentColor: 'rgba(132,204,22,1)',
    accentGlow: 'rgba(132,204,22,0.15)',
    accentBorder: 'rgba(132,204,22,0.3)',
    textClass: 'text-lime-400',
  },
  {
    studyId: 'derm-melanoma',
    modality: 'XC',
    label: '55M, evolving pigmented lesion',
    subtitle: 'Dermatology',
    detail: 'A dark spot on the back that has been changing over the past year. Partner-noticed evolution, irregular border.',
    icon: Scan,
    preview: '/images/derm-melanoma/1.jpg',
    accentColor: 'rgba(217,70,239,1)',
    accentGlow: 'rgba(217,70,239,0.15)',
    accentBorder: 'rgba(217,70,239,0.3)',
    textClass: 'text-fuchsia-400',
  },
  {
    studyId: 'derm-bcc',
    modality: 'XC',
    label: '72M, slow-growing nasal lesion',
    subtitle: 'Dermatology',
    detail: 'A shiny bump on the nose that occasionally bleeds. Chronic sun exposure history.',
    icon: Scan,
    preview: '/images/derm-bcc/1.jpg',
    accentColor: 'rgba(20,184,166,1)',
    accentGlow: 'rgba(20,184,166,0.15)',
    accentBorder: 'rgba(20,184,166,0.3)',
    textClass: 'text-teal-400',
  },
  {
    studyId: 'derm-sebk',
    modality: 'XC',
    label: '65F, long-standing brown lesions',
    subtitle: 'Dermatology',
    detail: 'Multiple waxy, stuck-on-looking brown spots on the trunk. Present for years, no change, no symptoms.',
    icon: Scan,
    preview: '/images/derm-sebk/1.jpg',
    accentColor: 'rgba(168,85,247,1)',
    accentGlow: 'rgba(168,85,247,0.15)',
    accentBorder: 'rgba(168,85,247,0.3)',
    textClass: 'text-purple-400',
  },
];

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
    <div className="w-full max-w-[560px] flex flex-col items-center text-center px-4">
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
            onClick={() => { setFade(false); setTimeout(() => { setIdx(i); setFade(true); }, 400); }}
            className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === idx ? 'bg-[#8a8f98] w-4' : 'bg-[#2a2d35] hover:bg-[#4a4e58]'}`}
          />
        ))}
      </div>
    </div>
  );
};

/** Compact provider connection band. The platform and cases explain themselves first. */
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
      <div className="w-full max-w-[1100px] mb-10 flex justify-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-950/30 px-4 py-2 text-[13px] text-emerald-300/90">
          <Check className="w-4 h-4 flex-shrink-0" />
          <span>Connected to OpenRouter. Pick a case below to begin.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1100px] mb-10 rounded-2xl border border-white/[0.07] bg-[#0b0c0f] px-5 py-4 sm:px-6 sm:py-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start sm:items-center gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10">
            <OpenRouterMark className="h-[19px] w-[19px]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-[14px] font-semibold text-white">Bring a vision model when you are ready</h2>
              <OpenRouterLockup className="h-[17px] w-auto opacity-60" />
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#737985]">
              Two free models, no credit card, and your credentials stay with OpenRouter.
            </p>
          </div>
        </div>
        <button
          onClick={connect}
          disabled={connecting}
          className="inline-flex h-10 flex-shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 text-[13px] font-semibold text-blue-200 transition-colors hover:bg-blue-500/20 hover:text-white disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
        >
          <span>{connecting ? 'Redirecting...' : 'Connect OpenRouter'}</span>
          {!connecting && <ArrowRight className="h-3.5 w-3.5" />}
        </button>
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

const getFilterForStudy = (studyId: string): string => {
  if (studyId.startsWith('ct-')) return 'ct';
  if (studyId.startsWith('local-study')) return 'mri';
  if (studyId.startsWith('patho-')) return 'path';
  if (studyId.startsWith('derm-')) return 'derm';
  return 'xray'; // cxr-, axr-, xr- all count as x-ray
};

const StudyList: React.FC<StudyListProps> = ({ onSelectStudy, dicomConfig, onShowSafety }) => {
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    searchDicomWebStudies(dicomConfig).then((data) => { setStudies(data); setLoading(false); });
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-full bg-[#06070a]"><Loader2 className="w-5 h-5 text-[#62666d] animate-spin" /></div>;
  }

  return (
    <div className="relative flex flex-col h-full bg-[#06070a] overflow-y-auto select-none">

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center px-4 sm:px-6 pt-8 sm:pt-12 pb-12">

        {/* Platform-first hero */}
        <section className="w-full max-w-[960px] flex flex-col items-center text-center">
          <div className="flex items-center gap-3 mb-8">
            <img src="/logo.svg" alt="" className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl" />
            <span className="text-[22px] sm:text-[25px] font-bold text-white tracking-[-0.025em]">CaseAttend</span>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/[0.07] px-3 py-1.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-300/90">
            <Github className="h-3.5 w-3.5" />
            Open source platform for VLM education
          </div>

          <h1 className="mt-5 max-w-[900px] text-[36px] sm:text-[52px] lg:text-[60px] font-bold leading-[1.05] text-white tracking-[-0.045em]">
            Build and study tutors that can see what students see.
          </h1>

          <p className="mt-5 max-w-[760px] text-[14px] sm:text-[17px] leading-relaxed text-[#969ca7]">
            CaseAttend is an open foundation for case-based visual education. Compare vision-language models, study teaching behavior, add a specialty, or build a product on the same engine used across radiology, pathology, and dermatology.
          </p>

          <div className="mt-7 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
            <a href="#cases" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-[13px] font-semibold text-white transition-colors hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50">
              Try a case
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
            <a href="https://github.com/JamesWeatherhead/CaseAttend" target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.025] px-5 text-[13px] font-semibold text-[#d0d6e0] transition-colors hover:border-white/[0.18] hover:bg-white/[0.05] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30">
              <Github className="h-4 w-4" />
              Build with CaseAttend
            </a>
          </div>

          <div className="mt-6 flex max-w-[760px] flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-[#656b76]">
            <span>AGPL-3.0</span>
            <span>Domain plugins</span>
            <span>Browser-direct BYOK</span>
            <span>Reproducible cases</span>
            <a href="https://github.com/JamesWeatherhead/CaseAttend/blob/main/CITATION.cff" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#aeb4bf]">Citation-ready</a>
          </div>
        </section>

        {/* Recognition and learner proof */}
        <div className="mt-10 grid w-full max-w-[1000px] grid-cols-1 items-center gap-6 rounded-2xl border border-white/[0.06] bg-white/[0.015] px-5 py-6 sm:px-8 md:grid-cols-[0.72fr_1.28fr] md:gap-8">
          <a href="https://www.kaggle.com/competitions/gemini-3/writeups/new-writeup-1765065566929" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2.5 text-[12px] sm:text-[13px] text-amber-400/90 font-medium transition-colors hover:text-amber-300 md:border-r md:border-white/[0.07] md:py-2">
            <Award className="w-4 h-4 text-amber-400" />
            <span>Google DeepMind Hackathon Winner</span>
          </a>
          <div className="flex justify-center">
            <TestimonialRotator />
          </div>
        </div>

        {/* Three clear ways into the project */}
        <section aria-labelledby="paths-heading" className="mt-10 w-full max-w-[1100px]">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#4f5560]">One open engine</p>
              <h2 id="paths-heading" className="mt-1.5 text-[20px] sm:text-[24px] font-semibold tracking-[-0.025em] text-white">Learn with it. Research it. Build on it.</h2>
            </div>
            <a href="#how-it-works" className="hidden text-[11px] text-blue-400/80 transition-colors hover:text-blue-300 sm:block">How it works</a>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <a href="#cases" className="group rounded-2xl border border-white/[0.06] bg-[#0d0e11] p-5 transition-colors hover:border-blue-500/25 hover:bg-blue-500/[0.035]">
              <BookOpen className="h-5 w-5 text-blue-400" />
              <h3 className="mt-4 text-[14px] font-semibold text-white">Learn with it</h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-[#777d88]">Work through visual cases with a question-first tutor that adapts to the learner.</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-300/80 group-hover:text-blue-300">Open a case <ArrowRight className="h-3 w-3" /></span>
            </a>

            <a href="https://github.com/JamesWeatherhead/CaseAttend" target="_blank" rel="noopener noreferrer" className="group rounded-2xl border border-white/[0.06] bg-[#0d0e11] p-5 transition-colors hover:border-fuchsia-500/25 hover:bg-fuchsia-500/[0.035]">
              <FlaskConical className="h-5 w-5 text-fuchsia-400" />
              <h3 className="mt-4 text-[14px] font-semibold text-white">Research with it</h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-[#777d88]">Study grounding, multimodal pedagogy, model behavior, annotation, adaptation, and safety.</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-medium text-fuchsia-300/80 group-hover:text-fuchsia-300">Explore the source <ArrowRight className="h-3 w-3" /></span>
            </a>

            <a href="https://github.com/JamesWeatherhead/CaseAttend/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer" className="group rounded-2xl border border-white/[0.06] bg-[#0d0e11] p-5 transition-colors hover:border-emerald-500/25 hover:bg-emerald-500/[0.035]">
              <Code2 className="h-5 w-5 text-emerald-400" />
              <h3 className="mt-4 text-[14px] font-semibold text-white">Build on it</h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-[#777d88]">Add a visual domain through the plugin architecture or turn the engine into a new product.</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-300/80 group-hover:text-emerald-300">Read the contributor guide <ArrowRight className="h-3 w-3" /></span>
            </a>
          </div>
        </section>

        <div className="mt-8 w-full flex justify-center">
          <ConnectCallout />
        </div>

        {/* Section label + filters */}
        <div id="cases" className="w-full max-w-[1100px] mb-4 flex scroll-mt-6 flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-[11px] font-semibold text-[#4a4e58] uppercase tracking-[0.1em]">Cases</p>
          <div className="flex gap-1">
            {FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id)}
                className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all duration-200 ${
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
          {studies.filter(s => activeFilter === 'all' || getFilterForStudy(s.id) === activeFilter).map((study) => {
            const card = CARDS.find(c => c.studyId === study.id) || CARDS.find(c => c.modality === study.modality) || CARDS[0];
            const Icon = card.icon;
            const active = hovered === study.id;

            return (
              <button
                key={study.id}
                onClick={() => onSelectStudy(study)}
                onMouseEnter={() => setHovered(study.id)}
                onMouseLeave={() => setHovered(null)}
                className="group relative rounded-2xl overflow-hidden text-left outline-none aspect-[4/5] sm:aspect-[4/5]"
                style={{
                  transition: 'transform 250ms cubic-bezier(0.16,1,0.3,1), box-shadow 250ms ease',
                  transform: active ? 'scale(1.02)' : 'scale(1)',
                  boxShadow: active ? `0 0 40px 8px ${card.accentGlow}` : 'none',
                }}
              >
                {/* Background image: fills the card */}
                <div className="absolute inset-0">
                  <div
                    className="absolute inset-0 transition-all duration-700 ease-out"
                    style={{
                      backgroundImage: `url(${card.preview})`,
                      backgroundSize: 'contain',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                      opacity: active ? 0.8 : 0.6,
                      imageRendering: 'auto',
                      transition: 'opacity 500ms ease',
                    }}
                  />
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
                      background: `radial-gradient(ellipse 80% 50% at 50% 0%, ${card.accentGlow}, transparent 70%)`,
                      opacity: active ? 1 : 0.5,
                    }}
                  />
                </div>

                {/* Border */}
                <div className="absolute inset-0 rounded-2xl transition-all duration-200" style={{
                  boxShadow: active
                    ? `inset 0 0 0 1px ${card.accentBorder}`
                    : 'inset 0 0 0 1px rgba(255,255,255,0.04)',
                }} />

                {/* Content pinned to bottom */}
                <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-5 pt-8">
                  {/* Modality tag */}
                  <div className={`text-[10px] font-bold uppercase tracking-wider ${card.textClass} mb-2 opacity-80`}>
                    {card.subtitle}
                  </div>

                  {/* Case title */}
                  <div className="text-[16px] sm:text-[17px] font-bold text-white leading-tight mb-2">
                    {card.label}
                  </div>

                  {/* Clinical vignette */}
                  <p className="text-[11px] sm:text-[12px] text-[#6b7080] leading-relaxed mb-3 group-hover:text-[#8a8f98] transition-colors duration-300 line-clamp-3">
                    {card.detail}
                  </p>

                  {/* CTA */}
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold ${card.textClass} uppercase tracking-[0.08em] opacity-70 group-hover:opacity-100 transition-opacity`}>
                      Start Case
                    </span>
                    <ArrowRight className={`w-3.5 h-3.5 ${card.textClass} opacity-0 group-hover:opacity-70 transition-all duration-200 group-hover:translate-x-0.5`} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* How it works: depth for visitors who scroll beyond the cases. */}
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
                Same viewer, same tutor scaffold, different content. Radiology, pathology, dermatology today. A fourth domain is a plugin file plus a prompt module, with no viewer edits. See <a href="https://github.com/JamesWeatherhead/CaseAttend/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2 decoration-blue-500/30">CONTRIBUTING</a>.
              </p>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-[#0f1011] p-6 hover:border-white/[0.12] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                <KeyRound className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-[15px] font-bold text-white mb-2">BYOK, no keys on our servers</h3>
              <p className="text-[13px] text-[#8a8f98] leading-relaxed">
                Your OpenRouter key lives only in your browser and calls the model directly. Two free vision models included. Nothing on our infrastructure to leak, no bill for us to foot.
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
                <span>Whole-slide pre-analysis grounds the tutor in what's actually in the image, reducing hallucination and jailbreak surface.</span>
              </li>
              <li className="flex gap-3">
                <Check className="w-4 h-4 flex-shrink-0 mt-[3px] text-emerald-500/70" />
                <span>Auto-capture on send: the AI sees whatever you're looking at (and any drawings you just made) the moment you press Enter. No manual capture step.</span>
              </li>
            </ul>
          </div>

          <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-[#0a0b0c] p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-[690px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#4f5560]">Open by default</p>
              <p className="mt-2 text-[13px] leading-relaxed text-[#8a8f98]">
                Use, study, and extend CaseAttend under AGPL-3.0. Modified network services must publish their source. Commercial licensing is available for closed-source products.
              </p>
            </div>
            <div className="flex flex-shrink-0 gap-3 text-[12px]">
              <a href="https://github.com/JamesWeatherhead/CaseAttend/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-white/[0.08] px-3 py-2 text-[#aab0ba] transition-colors hover:border-white/[0.16] hover:text-white">Read the license</a>
              <a href="https://github.com/JamesWeatherhead" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-white/[0.08] px-3 py-2 text-[#aab0ba] transition-colors hover:border-white/[0.16] hover:text-white">Commercial contact</a>
            </div>
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
