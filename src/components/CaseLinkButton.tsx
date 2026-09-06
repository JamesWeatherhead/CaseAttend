import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Link } from 'lucide-react';
import { caseLink } from '../services/caseNavigation';
import { useDialogFocus } from '../hooks/useDialogFocus';

function CaseLinkDetails({ url, local, copied, onClose }: { url: string; local: boolean; copied: boolean; onClose: () => void }) {
  const dialogRef = useDialogFocus(onClose);
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="case-link-title" tabIndex={-1} onClick={event => event.stopPropagation()}
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-600 bg-slate-900 p-5 text-slate-200 shadow-xl">
        <h2 id="case-link-title" className="text-lg font-semibold">{copied ? 'Case link copied' : 'Copy this case link'}</h2>
        {!copied && <input aria-label="Case link" readOnly value={url} onFocus={event => event.currentTarget.select()} className="mt-4 w-full rounded-lg border border-slate-500 bg-slate-950 p-3 text-base" />}
        {local && <p className="mt-3 text-sm leading-relaxed">This case is saved in this browser. To share it with someone else, export its .caseattend file from Create a case.</p>}
        <button type="button" onClick={onClose} className="mt-4 min-h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-blue-300">Done</button>
      </div>
    </div>, document.body,
  );
}

export default function CaseLinkButton({ caseId, local }: { caseId: string; local: boolean }) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const url = caseLink(caseId, window.location.href);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
    } catch {
      setState('manual');
    }
  };
  return (
    <div className="relative">
      <button type="button" onClick={() => { void copy(); }}
        aria-label={local ? 'Copy case link for this browser' : 'Copy case link'}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-blue-200 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-blue-300">
        {state === 'copied' ? <Check size={15} aria-hidden="true" /> : <Link size={15} aria-hidden="true" />}
        {state === 'copied' ? 'Copied' : 'Copy link'}
      </button>
      <span role="status" className="sr-only">{state === 'copied' ? 'Case link copied.' : ''}</span>
      {(state === 'manual' || (state === 'copied' && local)) && <CaseLinkDetails url={url} local={local} copied={state === 'copied'} onClose={() => setState('idle')} />}
    </div>
  );
}
