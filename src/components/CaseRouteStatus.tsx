import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

export default function CaseRouteStatus({ status, onBack, onRetry }: {
  status: 'loading' | 'invalid' | 'missing' | 'error';
  onBack: () => void;
  onRetry: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [status]);
  const title = status === 'loading' ? 'Opening your case' : status === 'invalid' ? 'This case link is incomplete' : status === 'missing' ? 'This case isn’t available here' : 'We couldn’t open this case';
  const detail = status === 'loading' ? 'Getting the teaching image and lesson ready.' : status === 'invalid' ? 'Check the link, or choose a case from the library.' : status === 'missing' ? 'It may have been removed, or saved in a different browser. For a shared local case, import its .caseattend file from Create a case.' : 'Try again. If this is a local case, check that it is still saved in this browser.';
  return (
    <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto bg-[#08090b] p-6 text-center" aria-busy={status === 'loading'}>
      {status === 'loading' && <Loader2 className="h-7 w-7 animate-spin text-blue-300" aria-hidden="true" />}
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold text-white focus:outline-none">{title}</h1>
      <p className="max-w-md text-base leading-relaxed text-slate-300">{detail}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {(status === 'error' || status === 'missing') && <button type="button" onClick={onRetry} className="min-h-11 rounded-xl bg-blue-600 px-5 font-semibold text-white focus-visible:outline-2 focus-visible:outline-blue-300">Try again</button>}
        <button type="button" onClick={onBack} className="min-h-11 rounded-xl border border-slate-600 px-5 text-blue-200 focus-visible:outline-2 focus-visible:outline-blue-300">Back to cases</button>
      </div>
    </main>
  );
}
