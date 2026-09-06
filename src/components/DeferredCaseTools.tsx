import React from 'react';
import type { ViewerHandle } from '../types';
import type ViewerCanvas from './ViewerCanvas';
import type { ProductionTutorProps } from './ProductionTutor';
import DeferredFeature, { deferFeature } from './DeferredFeature';

// Reuse resolved lazy identities so subsequent cases open without a new wait.
const LazyViewer = deferFeature(() => import('./ViewerCanvas'));
const LazyTutor = deferFeature(() => import('./ProductionTutor'));
type Readiness = { onReadyChange?: (ready: boolean) => void; allowReload?: boolean };

export const DeferredViewer = React.forwardRef<ViewerHandle, React.ComponentProps<typeof ViewerCanvas> & Readiness>(
  function DeferredViewer({ onReadyChange, allowReload, ...props }, ref) {
    return <DeferredFeature component={LazyViewer} label="image viewer" onReadyChange={onReadyChange} allowReload={allowReload}>
      {Viewer => <Viewer {...props} ref={ref} />}
    </DeferredFeature>;
  },
);

export function DeferredTutor({ onReadyChange, allowReload, ...props }: ProductionTutorProps & Readiness) {
  return <DeferredFeature component={LazyTutor} label="tutor" onReadyChange={onReadyChange} allowReload={allowReload}>
    {Tutor => <Tutor {...props} />}
  </DeferredFeature>;
}
