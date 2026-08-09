import {
  CONTENT_PACK_SCHEMA,
  CONTENT_PACK_SCHEMA_VERSION,
  defineContentPack,
} from '../contentPack';
import { CC0, PD_SELF } from './openLicenses';

/**
 * Open ECG and hemodynamic-signal teaching cases built on raster public-domain
 * and CC0 tracings. Clinical review is recorded as not reviewed; the source
 * label is carried only as unreviewed draft context, never as adjudicated truth.
 */

const ACCENT = {
  category: 'ecg',
  accentColor: 'rgba(251,113,133,1)',
  accentGlow: 'rgba(251,113,133,0.15)',
  accentBorder: 'rgba(251,113,133,0.35)',
  textClass: 'text-rose-400',
} as const;

const DEID =
  'Public teaching asset re-encoded to remove embedded file metadata. Independent de-identification review is not recorded.';
const WARN = ['Medical imaging'] as const;

export const ecgSignalsPack = defineContentPack({
  schema: CONTENT_PACK_SCHEMA,
  schemaVersion: CONTENT_PACK_SCHEMA_VERSION,
  id: 'ecg-signals',
  title: 'Open ECG and hemodynamic-signal lessons',
  contentVersion: '1.0.0',
  cases: [
    {
      id: 'ecg-afib',
      title: 'Palpitations and nausea on a cardiac glycoside',
      vignette:
        'An older adult taking a cardiac glycoside presents with nausea and an irregular pulse. The tracing is irregularly irregular without organized P waves. Identify the rhythm, the medication-safety concerns, and the immediate data to obtain.',
      domain: 'ecg',
      difficulty: 'intermediate',
      image: {
        src: '/images/ecg-signals/ecg-afib.jpg',
        mimeType: 'image/jpeg',
        sha256: 'fbe2549e9a581601d9f40e9160bac275df298933f544b6653c896901b5a6bd02',
        alt: 'A photographed 12-lead ECG with an irregularly irregular rhythm and no consistent P waves.',
        modality: 'ECG',
        seriesLabel: '12-lead ECG',
        width: 1600,
        height: 1129,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:ECG 005 b.jpg (Patho)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:ECG_005_b.jpg',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:ECG_005_b.jpg#Licensing',
        attribution:
          'Patho, Wikimedia Commons (public domain, PD-self); the file description notes atrial fibrillation and a digitoxin concentration.',
        license: PD_SELF,
      },
      contentWarnings: WARN,
      neutralDescription:
        'A photographed 12-lead ECG with an irregularly irregular rhythm and no consistent P waves.',
      teachingNotes: [
        'Draft note (not clinically reviewed): the source labels this as atrial fibrillation in a patient with an elevated digitoxin concentration.',
        'The image label is source metadata, not independently adjudicated ground truth; cardiology review is required.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'ECG | Rhythm', ...ACCENT },
      lesson: {
        objectives: [
          'Recognize atrial fibrillation on the tracing.',
          'Connect the drug history and renal or electrolyte status to toxicity risk.',
          'Separate rhythm identification from rate-control decisions.',
        ],
        clinicalCitations: [
          { id: 'ref-afib', title: 'Background reading: Atrial fibrillation', url: 'https://en.wikipedia.org/wiki/Atrial_fibrillation' },
        ],
      },
    },
    {
      id: 'ecg-cvp',
      title: 'Reading an ECG and venous pressure together',
      vignette:
        'A monitored patient has ECG and central venous pressure waveforms displayed together. Align the electrical events with the atrial and ventricular pressure waves, and look for a timing mismatch.',
      domain: 'ecg',
      difficulty: 'advanced',
      image: {
        src: '/images/ecg-signals/ecg-cvp.jpg',
        mimeType: 'image/jpeg',
        sha256: 'b2773acabb33e10882646f1619cd1ab951fb8e560154a363ee8fb4f6f94488ce',
        alt: 'A paired diagram showing an ECG tracing aligned with a central venous pressure waveform.',
        modality: 'ECG',
        seriesLabel: 'ECG and central venous pressure tracing',
        width: 3836,
        height: 1770,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:ECG and CVP Curves.jpg (Stefan Bellini)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:ECG_and_CVP_Curves.jpg',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:ECG_and_CVP_Curves.jpg#Licensing',
        attribution: 'Stefan Bellini, Wikimedia Commons (CC0).',
        license: CC0,
      },
      contentWarnings: WARN,
      neutralDescription:
        'A paired diagram showing an ECG tracing aligned with a central venous pressure waveform.',
      teachingNotes: [
        'Draft note (not clinically reviewed): paired ECG and central venous pressure curves for teaching wave timing.',
        'A schematic CVP curve is not a substitute for a calibrated bedside waveform or a clinical volume assessment.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'ECG | Hemodynamics', ...ACCENT },
      lesson: {
        objectives: [
          'Relate P and QRS timing to the a, c, and v waves.',
          'Distinguish electrical events from mechanical events.',
          'Explain why simultaneous signals improve interpretation.',
        ],
        clinicalCitations: [
          { id: 'ref-cvp', title: 'Background reading: Central venous pressure', url: 'https://en.wikipedia.org/wiki/Central_venous_pressure' },
        ],
      },
    },
  ],
});
