import React, { Suspense, useLayoutEffect } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

class FeatureLoadError extends Error {}

function FeatureStatus({ label, failed = false, allowReload = true }: { label: string; failed?: boolean; allowReload?: boolean }) {
  return (
    <div
      className="flex h-full min-h-48 w-full flex-1 flex-col items-center justify-center gap-3 bg-[#0f1011] p-5 text-center"
      role={failed ? 'alert' : 'status'}
      aria-busy={!failed}
    >
      {failed
        ? <RefreshCw className="h-5 w-5 text-amber-200" aria-hidden="true" />
        : <Loader2 className="h-5 w-5 animate-spin text-blue-300" aria-hidden="true" />}
      <h2 className="text-base font-semibold text-white">
        {failed ? `Couldn't load the ${label}` : `Opening the ${label}`}
      </h2>
      <p className="max-w-xs text-sm leading-relaxed text-[#a4a9b2]">
        {failed
          ? allowReload
            ? 'Check your connection, then reload. This case will reopen, and your current workspace will restart.'
            : 'Use Exit study to safely end this session. Then reload the page before starting again.'
          : 'Getting your case ready. This may take a moment on your first visit.'}
      </p>
      {failed && allowReload && <button
        type="button"
        onClick={() => window.location.reload()}
        className="min-h-11 rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-300"
      >Reload case to open the {label}</button>}
    </div>
  );
}

class LoadBoundary extends React.Component<{
  children: React.ReactNode;
  label: string;
  allowReload: boolean;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(error: unknown) {
    // Only recover module downloads here. Runtime faults must not silently
    // remount a running tutor and discard its inference cancellation seam.
    if (!(error instanceof FeatureLoadError)) throw error;
    return { failed: true };
  }

  render() {
    return this.state.failed
      ? <FeatureStatus label={this.props.label} failed allowReload={this.props.allowReload} />
      : this.props.children;
  }
}

function Ready({ children, onChange }: {
  children: React.ReactNode;
  onChange?: (ready: boolean) => void;
}) {
  useLayoutEffect(() => {
    onChange?.(true);
    return () => onChange?.(false);
  }, [onChange]);
  return children;
}

export function deferFeature<T extends React.ComponentType<any>>(load: () => Promise<{ default: T }>) {
  // Browsers can cache rejected module downloads for the document's lifetime.
  // An explicit reload recovers ordinary cases; research must exit safely first.
  return React.lazy(async () => {
    try { return await load(); }
    catch { throw new FeatureLoadError('The tool could not be downloaded.'); }
  });
}

export default function DeferredFeature<T extends React.ComponentType<any>>({
  component: Component, label, onReadyChange, allowReload = true, children,
}: {
  component: React.LazyExoticComponent<T>;
  label: string;
  onReadyChange?: (ready: boolean) => void;
  allowReload?: boolean;
  children: (Component: React.LazyExoticComponent<T>) => React.ReactNode;
}) {

  return (
    <LoadBoundary label={label} allowReload={allowReload}>
      <Suspense fallback={<FeatureStatus label={label} />}>
        <Ready onChange={onReadyChange}>{children(Component)}</Ready>
      </Suspense>
    </LoadBoundary>
  );
}
