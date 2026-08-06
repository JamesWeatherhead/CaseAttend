
import React from 'react';
import { Shield } from 'lucide-react';

interface SafetyModalProps {
  onClose: () => void;
}

const SafetyModal: React.FC<SafetyModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
       <div className="bg-slate-900 border border-slate-700 max-w-md w-full rounded-xl p-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-5 border-b border-slate-800 pb-4">
             <div className="p-2 bg-amber-500/10 rounded-lg">
                <Shield className="w-5 h-5 text-amber-500" />
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
             <div className="flex gap-3">
                <span className="font-mono text-slate-500 font-bold">04</span>
                <div><strong>Data Sources:</strong>
                  <p className="mt-1"><strong>Radiology (Brain MRI):</strong> CC0 (Public Domain). Chris Rorden, John Absher, and Roger Newman-Norlund (2024). Stroke Outcome Optimization Project (SOOP). OpenNeuro. [Dataset] doi: 10.18112/openneuro.ds004889.v1.1.2. <a href="https://openneuro.org/datasets/ds004889/versions/1.1.2" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline break-all">https://openneuro.org/datasets/ds004889/versions/1.1.2</a></p>
                  <p className="mt-2"><strong>Pathology (Breast Biopsy):</strong> Open Access. The Cancer Genome Atlas (TCGA-BRCA), case TCGA-AC-A62V. H&E tiles extracted from Aperio SVS whole-slide image. National Cancer Institute Genomic Data Commons. <a href="https://portal.gdc.cancer.gov/projects/TCGA-BRCA" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline break-all">https://portal.gdc.cancer.gov/projects/TCGA-BRCA</a></p>
                  <p className="mt-2"><strong>Chest X-ray (Pneumothorax):</strong> Hellerhoff, CC BY-SA 4.0, via Wikimedia Commons.</p>
                  <p className="mt-1"><strong>Chest X-ray (Pneumonia):</strong> Mikael Haggstrom, MD, CC0 (Public Domain), via Wikimedia Commons.</p>
                  <p className="mt-1"><strong>Chest X-ray (CHF / Pulmonary Edema):</strong> Hellerhoff, CC BY-SA 4.0, via Wikimedia Commons.</p>
                  <p className="mt-1"><strong>Chest X-ray (Pleural Effusion):</strong> James Heilman, MD, CC BY-SA 3.0, via Wikimedia Commons.</p>
                  <p className="mt-1"><strong>Abdominal X-ray (Small Bowel Obstruction):</strong> James Heilman, MD, CC BY-SA 3.0, via Wikimedia Commons.</p>
                  <p className="mt-1"><strong>Head CT (Epidural Hematoma):</strong> Hellerhoff, CC BY-SA 4.0, via Wikimedia Commons.</p>
                  <p className="mt-1"><strong>Head CT (Subdural Hematoma):</strong> Hellerhoff, CC BY-SA 4.0, via Wikimedia Commons.</p>
                  <p className="mt-1"><strong>Upright X-ray (Pneumoperitoneum):</strong> Hellerhoff, CC BY-SA 4.0, via Wikimedia Commons.</p>
                  <p className="mt-1"><strong>Neonatal X-ray (NEC):</strong> Hellerhoff, CC BY-SA 4.0, via Wikimedia Commons.</p>
                  <p className="mt-1"><strong>Wrist X-ray (Colles Fracture):</strong> Lucien Monfils, CC BY-SA 3.0, via Wikimedia Commons.</p>
                </div>
             </div>
          </div>
          <button 
            onClick={onClose}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium border border-slate-700 transition-colors"
          >
            I Understand
          </button>
       </div>
    </div>
  );
};

export default SafetyModal;
