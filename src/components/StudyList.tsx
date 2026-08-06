
import React, { useState, useEffect, useCallback } from 'react';
import { Study, ConnectionType, DicomWebConfig } from '../types';
import { searchDicomWebStudies } from '../services/dicomService';
import { ArrowRight, Scan, Microscope, Loader2, Award } from 'lucide-react';

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

        {/* Rotating testimonial */}
        <TestimonialRotator />

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
      </div>
    </div>
  );
};

export default StudyList;
