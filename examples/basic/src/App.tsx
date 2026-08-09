import { useMemo, useState } from 'react';
import { type CoreEventV1 } from '@caseattend/core';
import { TutorComposer } from '@caseattend/react';
import '@caseattend/react/styles.css';
import {
  createBasicExampleEngine,
  CURRENT_VIEW,
  NEUTRAL_DESCRIPTION,
  SYNTHETIC_CASE,
  SYNTHETIC_VISUAL_DATA_URL,
} from './adapters';

export default function App() {
  const [events, setEvents] = useState<readonly CoreEventV1[]>([]);
  const engine = useMemo(
    () => createBasicExampleEngine((event) => setEvents((current) => [...current, event])),
    [],
  );

  return (
    <>
      <a className="example-skip" href="#composer">Skip to the tutor composer</a>
      <main className="example-shell">
        <header className="example-header">
          <p className="example-badge">Local deterministic demo</p>
          <h1>Build a visual tutor without a provider account</h1>
          <p>
            This starter replaces the case registry, artifact loader, domain plugin,
            prompt composer, inference adapter, and session store. It uses synthetic
            geometry, makes no external request, and never asks for a credential.
          </p>
        </header>

        <p className="example-notice" role="note">
          Privacy default: the current view is captured only inside Send. Raw learner
          and tutor text stays in component memory and is absent from the event preview.
        </p>

        <div className="example-grid">
          <figure className="example-visual">
            <img src={SYNTHETIC_VISUAL_DATA_URL} alt={NEUTRAL_DESCRIPTION} />
            <figcaption className="example-caption">{NEUTRAL_DESCRIPTION}</figcaption>
          </figure>
          <div id="composer">
            <TutorComposer
              engine={engine}
              material={SYNTHETIC_CASE}
              captureCurrentView={() => CURRENT_VIEW}
              learnerLevel="general"
            />
          </div>
        </div>

        <section className="example-events" aria-labelledby="events-heading">
          <h2 id="events-heading">Metadata-only session events</h2>
          <p>
            Replace <code>MemorySessionStore</code> with your own teaching store.
            The engine sends this closed event shape, never messages, prompts, images,
            or credentials.
          </p>
          <pre aria-label="Session event JSON">{events.length ? JSON.stringify(events, null, 2) : 'No events yet. Send one observation to inspect the event contract.'}</pre>
        </section>
      </main>
    </>
  );
}
