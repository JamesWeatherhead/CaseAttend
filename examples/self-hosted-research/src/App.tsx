import { useMemo, useState } from 'react';
import { type CoreEventV1 } from '@caseattend/core';
import { TutorComposer } from '@caseattend/react';
import '@caseattend/react/styles.css';
import {
  createResearchExampleEngine,
  CURRENT_VIEW,
  NEUTRAL_DESCRIPTION,
  RESEARCH_CASE,
  SYNTHETIC_VISUAL_DATA_URL,
} from './adapters';

export default function App() {
  const [records, setRecords] = useState<readonly CoreEventV1[]>([]);
  const engine = useMemo(
    () => createResearchExampleEngine((record) => setRecords((current) => [...current, record])),
    [],
  );

  return (
    <>
      <a className="example-skip" href="#research-composer">Skip to the research tutor composer</a>
      <main className="example-shell">
        <header className="example-header">
          <p className="example-badge">Synthetic, memory-only research demo</p>
          <h1>Replace the research sink without exposing raw content</h1>
          <p>
            This example configures the same headless engine with a research
            destination instead of a teaching session store. It uses no participant
            identifier, patient data, external model, collector server, or credential.
          </p>
        </header>

        <p className="example-notice" role="note">
          This is an adapter integration example, not a production collector and not
          evidence of IRB, ethics, privacy, security, or accessibility approval. A real
          deployment needs its own institutional review and data controls.
        </p>

        <div className="example-grid">
          <figure className="example-visual">
            <img src={SYNTHETIC_VISUAL_DATA_URL} alt={NEUTRAL_DESCRIPTION} />
            <figcaption className="example-caption">{NEUTRAL_DESCRIPTION}</figcaption>
          </figure>
          <div id="research-composer">
            <TutorComposer
              engine={engine}
              material={RESEARCH_CASE}
              captureCurrentView={() => CURRENT_VIEW}
              learnerLevel="general"
              labels={{
                heading: 'Run a synthetic study turn',
                messageLabel: 'Synthetic learner observation',
              }}
            />
          </div>
        </div>

        <section className="example-events" aria-labelledby="research-records-heading">
          <h2 id="research-records-heading">Records received by ResearchSink</h2>
          <p>
            Only the versioned event vocabulary appears here. Raw learner text, tutor
            text, prompt content, image bytes, and credentials are deliberately absent.
          </p>
          <pre aria-label="Research sink record JSON">{records.length ? JSON.stringify(records, null, 2) : 'No records yet. Submit one synthetic observation to inspect the sink contract.'}</pre>
        </section>
      </main>
    </>
  );
}
