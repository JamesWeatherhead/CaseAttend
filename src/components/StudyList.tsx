
import React, { useState, useEffect, useCallback } from 'react';
import { Study, ConnectionType, DicomWebConfig } from '../types';
import { searchDicomWebStudies } from '../services/dicomService';
import { ArrowRight, Scan, Microscope, Loader2, Award, ShieldCheck, Check, CircleCheck, Github, Mail } from 'lucide-react';
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
            onClick={() => { setFade(false); setTimeout(() => { setIdx(i); setFade(true); }, 400); }}
            className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === idx ? 'bg-[#8a8f98] w-4' : 'bg-[#2a2d35] hover:bg-[#4a4e58]'}`}
          />
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
    className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.02] hover:bg-white/[0.05] disabled:opacity-60 px-3.5 py-2 text-[13px] text-[#c9ced8] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
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
              <span>Your credentials stay with OpenRouter</span>
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
];

const getFilterForStudy = (studyId: string): string => {
  if (studyId.startsWith('ct-')) return 'ct';
  if (studyId.startsWith('local-study')) return 'mri';
  if (studyId.startsWith('patho-')) return 'path';
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
      <div className="relative z-10 flex flex-col items-center px-4 sm:px-6 pt-12 sm:pt-20 pb-12">

        {/* Brand */}
        <div className="flex flex-col items-center mb-5 sm:mb-6">
          <div className="flex items-center gap-4 sm:gap-5 mb-4">
            <img src="/logo.svg" alt="CaseAttend" className="w-12 h-12 sm:w-16 sm:h-16 rounded-[14px]" />
            <h1 className="text-[38px] sm:text-[56px] font-bold text-white tracking-[-0.03em]">
              CaseAttend
            </h1>
          </div>
          <p className="text-[16px] sm:text-[20px] text-[#8a8f98] font-medium mb-2">AI tutor for medical imaging.</p>
        </div>

        {/* Trust signals */}
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-5 mb-8">
          <a href="https://www.kaggle.com/competitions/gemini-3/writeups/new-writeup-1765065566929" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[13px] sm:text-[14px] text-amber-400/90 font-medium hover:text-amber-300 transition-colors">
            <Award className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
            <span>Google DeepMind Hackathon Winner</span>
          </a>
        </div>

        {/* Sign in with OpenRouter — free, no card, credentials stay with OpenRouter */}
        <ConnectCallout />

        {/* Section label + filters */}
        <div className="w-full max-w-[1100px] mb-4 flex items-center justify-between">
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

        {/* Social proof, moved below the cases so it never delays them */}
        <div className="mt-16 w-full flex justify-center">
          <TestimonialRotator />
        </div>
      </div>
    </div>
  );
};

export default StudyList;
