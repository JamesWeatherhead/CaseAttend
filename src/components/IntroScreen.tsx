

import React, { useState } from 'react';
import { 
  Activity, Shield, ArrowRight, Bot, 
  MousePointer2, Globe, GraduationCap, Sparkles
} from 'lucide-react';

interface IntroScreenProps {
  onStartDemo: () => void;
}

const IntroScreen: React.FC<IntroScreenProps> = ({ onStartDemo }) => {
  const [showSafety, setShowSafety] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans text-slate-200">
      
      {/* Main Card */}
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-2">
        
        {/* Left Column: Minimal Clinical Mock */}
        <div className="bg-black p-6 md:p-8 flex flex-col gap-6 border-b md:border-b-0 md:border-r border-slate-800">
            {/* Mock Header */}
            <div className="flex items-center justify-between text-xs text-slate-500 font-mono border-b border-slate-800 pb-2">
                <span>CRANIAL_CT_01</span>
                <span>IMG: 49/166</span>
            </div>

            {/* Mock Viewport */}
            <div className="aspect-square w-full bg-slate-900 rounded border border-slate-800 relative overflow-hidden flex items-center justify-center group">
                {/* Abstract Scan Representation */}
                <div className="w-3/4 h-3/4 bg-slate-800/50 rounded-full blur-2xl opacity-60"></div>
                <div className="w-1/2 h-2/3 bg-slate-800 rounded-[2rem] opacity-80 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"></div>
                
                {/* Highlight ROI */}
                <div className="absolute top-[60%] left-[45%] w-12 h-8 border-2 border-blue-500/50 bg-blue-500/10 rounded-sm shadow-[0_0_15px_rgba(59,130,246,0.2)]"></div>
                
                {/* Minimal Overlay Info */}
                <div className="absolute top-2 left-2 text-[10px] text-slate-600 font-mono">
                   R
                </div>
                <div className="absolute top-2 right-2 text-[10px] text-slate-600 font-mono">
                   L
                </div>
            </div>

            {/* Mock Chat Strip */}
            <div className="flex flex-col gap-3 mt-auto">
                {/* User Message */}
                <div className="flex justify-end">
                    <div className="bg-blue-900/20 border border-blue-500/20 text-blue-100 text-xs py-2 px-3 rounded-lg max-w-[90%]">
                        What region did I highlight on this slice?
                    </div>
                </div>

                {/* Bot Message */}
                <div className="flex justify-start">
                    <div className="bg-slate-800/50 border border-slate-700 text-slate-300 text-xs p-3 rounded-lg w-full">
                        <div className="flex items-center gap-1.5 mb-1.5 text-blue-400 font-bold uppercase tracking-wider text-[10px]">
                            <Bot className="w-3 h-3" /> Anatomy / Region
                        </div>
                        <p className="leading-relaxed text-slate-200 mb-2">
                            The highlighted area overlies the cerebellum on the patient's left side.
                        </p>
                        <div className="flex items-center gap-1 text-[10px] text-amber-500/80 border-t border-slate-700/50 pt-1.5">
                            <Shield className="w-2.5 h-2.5" />
                            Educational use only - not for diagnosis or treatment.
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Right Column: Copy & Actions */}
        <div className="p-8 md:p-12 flex flex-col justify-center bg-slate-900">
            {/* New Branding Lockup */}
            <div className="flex flex-col mb-6">
              <span className="text-xl font-semibold text-[#f7f8f8] tracking-tight leading-none">CaseAttend</span>
            </div>

            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">
                Ask the scan.
            </h1>
            <p className="text-lg text-blue-400 font-medium mb-6">
                An AI tutor sits beside your DICOM viewer.
            </p>

            <div className="text-sm text-slate-400 leading-relaxed mb-8 space-y-2">
                <p>
                    CaseAttend is a medical education platform that leverages advanced AI reasoning and native multimodality.
                </p>
                <p>
                    This demo uses public, anonymized DICOM data and is strictly for educational purposes.
                </p>
            </div>

            <ul className="space-y-4 mb-10">
                <li className="flex items-start gap-3">
                    <div className="mt-0.5 text-emerald-400"><MousePointer2 className="w-4 h-4" /></div>
                    <div>
                        <span className="block text-sm font-bold text-slate-200">Point-and-ask anatomy teaching</span>
                        <span className="text-xs text-slate-500">Highlight any region to get instant context.</span>
                    </div>
                </li>
                <li className="flex items-start gap-3">
                    <div className="mt-0.5 text-blue-400"><Globe className="w-4 h-4" /></div>
                    <div>
                        <span className="block text-sm font-bold text-slate-200">Search and guideline support</span>
                        <span className="text-xs text-slate-500">Cross-reference findings with web guidelines.</span>
                    </div>
                </li>
            </ul>

            <div className="mt-auto space-y-4">
                <button
                    onClick={onStartDemo}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-4 rounded-lg shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2 group border border-blue-500"
                >
                    Start Demo
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
                
                <div className="text-center">
                    <button 
                        onClick={() => setShowSafety(true)}
                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors inline-flex items-center gap-1.5"
                    >
                        <Shield className="w-3 h-3" /> Safety & Data Privacy
                    </button>
                </div>
            </div>
        </div>

      </div>

      {/* Safety Modal */}
      {showSafety && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
           <div className="bg-slate-900 border border-slate-700 max-w-md w-full rounded-xl p-6 shadow-2xl">
              <div className="flex items-center gap-3 mb-5 border-b border-slate-800 pb-4">
                 <div className="p-2 bg-blue-500/10 rounded-lg">
                    <GraduationCap className="w-5 h-5 text-blue-400" />
                 </div>
                 <h3 className="text-lg font-bold text-white">Safety Information</h3>
              </div>
              <div className="space-y-4 text-sm text-slate-300 mb-6">
                 <div className="flex gap-3">
                    <span className="font-mono text-slate-500 font-bold">01</span>
                    <p><strong>Not a Medical Device:</strong> This application is a prototype for educational and demonstration purposes only.</p>
                 </div>
                 <div className="flex gap-3">
                    <span className="font-mono text-slate-500 font-bold">02</span>
                    <p><strong>No PHI:</strong> Do not upload or view real patient health information. Use only anonymized public data.</p>
                 </div>
                 <div className="flex gap-3">
                    <span className="font-mono text-slate-500 font-bold">03</span>
                    <p><strong>AI Limitations:</strong> Generative AI can hallucinate. Never rely on the AI assistant for diagnosis, triage, or treatment.</p>
                 </div>
              </div>
              <button 
                onClick={() => setShowSafety(false)}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium border border-slate-700 transition-colors"
              >
                I Understand
              </button>
           </div>
        </div>
      )}
    </div>
  );
};

export default IntroScreen;