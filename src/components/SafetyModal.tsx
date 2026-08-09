import React, { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import type { CasePackageV1 } from '../core/casePackage';
import { listCasePackages } from '../data/caseRegistry';

interface SafetyModalProps {
  onClose: () => void;
}

function safeExternalUrl(value?: string): string | undefined {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function clinicianReviewText(casePackage: CasePackageV1): string {
  const review = casePackage.provenance.clinicianReview;
  if (!review.reviewed) return 'Not reviewed';
  return `Reviewed by ${review.reviewer}, ${review.credentials}, on ${review.reviewedAt}`;
}

function deidentificationText(casePackage: CasePackageV1): string {
  const attestation = casePackage.deidentification;
  if (attestation.status === 'attested') {
    return `Attested by ${attestation.attestedBy} on ${attestation.attestedAt}`;
  }
  if (attestation.status === 'synthetic') return 'Synthetic asset';
  return 'Not reviewed';
}

const SafetyModal: React.FC<SafetyModalProps> = ({ onClose }) => {
  const [casePackages, setCasePackages] = useState<readonly CasePackageV1[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let mounted = true;

    void listCasePackages()
      .then((packages) => {
        if (mounted) setCasePackages(packages);
      })
      .catch(() => {
        if (mounted) setLoadError(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="safety-modal-title"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
      >
        <div className="mb-5 flex shrink-0 items-center gap-3 border-b border-slate-800 pb-4">
          <div className="rounded-lg bg-amber-500/10 p-2">
            <Shield className="h-5 w-5 text-amber-500" />
          </div>
          <h3 id="safety-modal-title" className="text-lg font-bold text-white">
            Safety Information
          </h3>
        </div>

        <div className="mb-6 space-y-4 overflow-y-auto pr-2 text-sm text-slate-300">
          <div className="flex gap-3">
            <span className="font-mono font-bold text-slate-500">01</span>
            <p><strong>Not a Medical Device:</strong> This application is a prototype for educational and demonstration purposes only.</p>
          </div>
          <div className="flex gap-3">
            <span className="font-mono font-bold text-slate-500">02</span>
            <p><strong>No PHI:</strong> Do not upload or view real patient health information. Use only anonymized public data.</p>
          </div>
          <div className="flex gap-3">
            <span className="font-mono font-bold text-slate-500">03</span>
            <p><strong>AI Limitations:</strong> Generative AI can hallucinate. Never rely on the AI assistant for diagnosis, triage, or treatment.</p>
          </div>
          <div className="flex gap-3">
            <span className="font-mono font-bold text-slate-500">04</span>
            <div className="min-w-0 flex-1">
              <strong>
                Data Sources{casePackages ? ` (${casePackages.length} cases)` : ''}:
              </strong>

              {!casePackages && !loadError && (
                <p className="mt-2 text-slate-400" role="status">
                  Loading the Case Package registry...
                </p>
              )}

              {loadError && (
                <p className="mt-2 rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-red-200" role="alert">
                  The Case Package registry could not be loaded. Source and review details are unavailable.
                </p>
              )}

              {casePackages && (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {casePackages.map((casePackage) => {
                    const sourceUrl = safeExternalUrl(casePackage.provenance.sourceUrl);
                    const licenseUrl = safeExternalUrl(casePackage.provenance.license.url);

                    return (
                      <article key={casePackage.id} className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
                        <h4 className="font-semibold text-white">{casePackage.title}</h4>
                        <p className="mb-2 text-xs text-slate-400">
                          {casePackage.presentation.subtitle} | {casePackage.domain}
                        </p>
                        <dl className="space-y-1.5 text-xs">
                          <div>
                            <dt className="font-semibold text-slate-300">Source</dt>
                            <dd>{casePackage.provenance.sourceName}</dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-slate-300">Attribution</dt>
                            <dd>{casePackage.provenance.attribution}</dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-slate-300">License</dt>
                            <dd>
                              {licenseUrl ? (
                                <a
                                  href={licenseUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="break-words text-blue-400 underline hover:text-blue-300"
                                >
                                  {casePackage.provenance.license.name}
                                </a>
                              ) : casePackage.provenance.license.name}
                              {casePackage.provenance.license.spdxId
                                ? ` (${casePackage.provenance.license.spdxId})`
                                : ''}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-slate-300">Source link</dt>
                            <dd>
                              {sourceUrl ? (
                                <a
                                  href={sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 underline hover:text-blue-300"
                                >
                                  View source
                                </a>
                              ) : 'Not recorded in Case Package v1'}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-slate-300">Clinician review</dt>
                            <dd>{clinicianReviewText(casePackage)}</dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-slate-300">De-identification</dt>
                            <dd>{deidentificationText(casePackage)}</dd>
                            {casePackage.deidentification.notes && (
                              <dd className="mt-1 text-slate-400">{casePackage.deidentification.notes}</dd>
                            )}
                          </div>
                        </dl>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full shrink-0 rounded-lg border border-slate-700 bg-slate-800 py-2.5 font-medium text-white transition-colors hover:bg-slate-700"
        >
          I Understand
        </button>
      </div>
    </div>
  );
};

export default SafetyModal;
