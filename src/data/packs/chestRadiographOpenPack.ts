import {
  CONTENT_PACK_SCHEMA,
  CONTENT_PACK_SCHEMA_VERSION,
  defineContentPack,
} from '../contentPack';
import { PD_USGOV } from './openLicenses';

/**
 * Open chest-radiograph teaching cases built on U.S. federal public-domain films
 * (CDC Public Health Image Library and NIH/NCI). Clinical review is recorded as
 * not reviewed; titles present the scenario, and alt text stays descriptive so
 * the tutor teaches by asking rather than by naming the diagnosis up front.
 */

const ACCENT = {
  category: 'xray',
  accentColor: 'rgba(96,165,250,1)',
  accentGlow: 'rgba(96,165,250,0.15)',
  accentBorder: 'rgba(96,165,250,0.35)',
  textClass: 'text-blue-400',
} as const;

const DEID =
  'Public teaching asset re-encoded to remove embedded file metadata. Independent de-identification review is not recorded.';
const WARN = ['Medical imaging'] as const;

export const chestRadiographOpenPack = defineContentPack({
  schema: CONTENT_PACK_SCHEMA,
  schemaVersion: CONTENT_PACK_SCHEMA_VERSION,
  id: 'chest-radiograph-open',
  title: 'Open chest-radiograph lessons',
  contentVersion: '1.0.0',
  cases: [
    {
      id: 'cxr-tb-cavitary',
      title: 'Chronic cough, weight loss, and night sweats',
      vignette:
        'A patient has chronic cough, weight loss, night sweats, and epidemiologic risk. Describe the bilateral infiltrates and the right apical lucency, then choose isolation and diagnostic steps.',
      domain: 'radiology',
      difficulty: 'intermediate',
      image: {
        src: '/images/chest-radiograph-open/cxr-tb-cavitary.jpg',
        mimeType: 'image/jpeg',
        sha256: '9c6fb83021e235d3e3e404019e4fb90692f6b847486d9d094daf32c96d6c5ff4',
        alt: 'An AP chest radiograph with bilateral upper-zone opacities and a rounded lucency at the right apex.',
        modality: 'CR',
        seriesLabel: 'Chest radiograph (AP)',
        width: 700,
        height: 542,
      },
      provenance: {
        sourceName: 'U.S. CDC Public Health Image Library, via Wikimedia Commons (File:Tuberculosis-x-ray.jpg)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Tuberculosis-x-ray.jpg',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:Tuberculosis-x-ray.jpg#Licensing',
        attribution: 'U.S. Centers for Disease Control and Prevention / Public Health Image Library.',
        license: PD_USGOV,
      },
      contentWarnings: WARN,
      neutralDescription:
        'An AP chest radiograph with bilateral upper-zone opacities and a rounded lucency at the right apex.',
      teachingNotes: [
        'Draft note (not clinically reviewed): CDC describes advanced bilateral pulmonary tuberculosis with infiltrates and right apical cavitation.',
        'A single low-resolution film cannot establish a microbiologic diagnosis; correlate clinically and confirm with testing.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Chest radiograph', ...ACCENT },
      lesson: {
        objectives: [
          'Use a systematic chest-film description.',
          'Recognize an upper-lobe cavitary pattern.',
          'Connect suspicion to airborne precautions and microbiologic confirmation.',
        ],
        clinicalCitations: [
          { id: 'ref-tuberculosis', title: 'Background reading: Tuberculosis', url: 'https://en.wikipedia.org/wiki/Tuberculosis' },
        ],
      },
    },
    {
      id: 'cxr-sars',
      title: 'Fever and hypoxemia in a returning traveler',
      vignette:
        'A traveler with fever, cough, and low oxygen levels has a chest radiograph during an outbreak scenario. Describe the opacity pattern and choose infection-control steps without diagnosing a specific pathogen from imaging.',
      domain: 'radiology',
      difficulty: 'intermediate',
      image: {
        src: '/images/chest-radiograph-open/cxr-sars.jpg',
        mimeType: 'image/jpeg',
        sha256: 'f2f8096a25aac0b33cd66be6b7a3189466f61f7c7c60ce054c7acda2b4f57610',
        alt: 'A chest radiograph with patchy air-space opacity, more pronounced in the lower zones.',
        modality: 'CR',
        seriesLabel: 'Chest radiograph',
        width: 600,
        height: 543,
      },
      provenance: {
        sourceName: 'U.S. CDC, via Wikimedia Commons (File:SARS xray.jpg)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:SARS_xray.jpg',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:SARS_xray.jpg#Licensing',
        attribution: 'U.S. Centers for Disease Control and Prevention.',
        license: PD_USGOV,
      },
      contentWarnings: WARN,
      neutralDescription:
        'A chest radiograph with patchy air-space opacity, more pronounced in the lower zones.',
      teachingNotes: [
        'Draft note (not clinically reviewed): CDC published this radiograph in association with severe acute respiratory syndrome.',
        'Radiographs do not identify a specific viral pathogen.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Chest radiograph', ...ACCENT },
      lesson: {
        objectives: [
          'Describe the distribution of air-space opacity.',
          'Distinguish an imaging pattern from an etiologic diagnosis.',
          'Prioritize respiratory isolation and confirmatory testing in context.',
        ],
        clinicalCitations: [
          { id: 'ref-sars', title: 'Background reading: Severe acute respiratory syndrome', url: 'https://en.wikipedia.org/wiki/Severe_acute_respiratory_syndrome' },
        ],
      },
    },
    {
      id: 'cxr-hantavirus',
      title: 'Rapidly progressive dyspnea after rodent exposure',
      vignette:
        'A patient with rodent exposure develops rapidly progressive shortness of breath and low blood pressure. Identify the pattern of interstitial edema and small effusions, and integrate the exposure history into the differential.',
      domain: 'radiology',
      difficulty: 'intermediate',
      image: {
        src: '/images/chest-radiograph-open/cxr-hantavirus.jpg',
        mimeType: 'image/jpeg',
        sha256: 'c4ab9c531a16781ddfcf1f3114c0ed842e7c61021cb6b07c826a156090fd0e65',
        alt: 'An AP chest radiograph with diffuse bilateral interstitial and air-space opacity and small pleural fluid.',
        modality: 'CR',
        seriesLabel: 'Chest radiograph (AP)',
        width: 700,
        height: 465,
      },
      provenance: {
        sourceName: 'U.S. CDC PHIL image 6077, via Wikimedia Commons (File:6077 lores.jpg)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:6077_lores.jpg',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:6077_lores.jpg#Licensing',
        attribution: 'U.S. Centers for Disease Control and Prevention / PHIL image 6077.',
        license: PD_USGOV,
      },
      contentWarnings: WARN,
      neutralDescription:
        'An AP chest radiograph with diffuse bilateral interstitial and air-space opacity and small pleural fluid.',
      teachingNotes: [
        'Draft note (not clinically reviewed): CDC describes mid-stage bilateral pulmonary effusions in hantavirus pulmonary syndrome.',
        'Treat the source diagnosis as contextual teaching truth, not proof that these findings are specific.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Chest radiograph', ...ACCENT },
      lesson: {
        objectives: [
          'Recognize a noncardiogenic edema pattern.',
          'Distinguish descriptive findings from cause.',
          'Connect exposure and shock physiology to urgent escalation.',
        ],
        clinicalCitations: [
          { id: 'ref-hantavirus', title: 'Background reading: Hantavirus pulmonary syndrome', url: 'https://en.wikipedia.org/wiki/Hantavirus_pulmonary_syndrome' },
        ],
      },
    },
    {
      id: 'cxr-histoplasmosis',
      title: 'Fever and cough after disturbing a dusty structure',
      vignette:
        'A patient develops fever and cough after disturbing a bat-inhabited structure in an endemic region. Describe the radiograph, prioritize the differential, and choose confirmatory testing.',
      domain: 'radiology',
      difficulty: 'intermediate',
      image: {
        src: '/images/chest-radiograph-open/cxr-histoplasmosis.jpg',
        mimeType: 'image/jpeg',
        sha256: 'b6d86140c440c02104d008c7c323ab511c02edd55646b924c6d233dabc32b7be',
        alt: 'A chest radiograph with scattered pulmonary opacities.',
        modality: 'CR',
        seriesLabel: 'Chest radiograph',
        width: 1899,
        height: 1815,
      },
      provenance: {
        sourceName: 'U.S. CDC PHIL image 3954, via Wikimedia Commons',
        sourceUrl:
          'https://commons.wikimedia.org/wiki/File:Chest_X-ray_acute_pulmonary_histoplasmosis_PHIL_3954.jpg',
        licenseEvidenceUrl:
          'https://commons.wikimedia.org/wiki/File:Chest_X-ray_acute_pulmonary_histoplasmosis_PHIL_3954.jpg#Licensing',
        attribution: 'U.S. Centers for Disease Control and Prevention / PHIL image 3954.',
        license: PD_USGOV,
      },
      contentWarnings: WARN,
      neutralDescription: 'A chest radiograph with scattered pulmonary opacities.',
      teachingNotes: [
        'Draft note (not clinically reviewed): CDC identifies this as acute pulmonary histoplasmosis.',
        'Exposure plus an image is not a final diagnosis; require clinician review of the differential and test selection.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Chest radiograph', ...ACCENT },
      lesson: {
        objectives: [
          'Describe pulmonary opacities systematically.',
          'Connect environmental exposure to a focused differential.',
          'Avoid equating exposure plus an image with a final diagnosis.',
        ],
        clinicalCitations: [
          { id: 'ref-histoplasmosis', title: 'Background reading: Histoplasmosis', url: 'https://en.wikipedia.org/wiki/Histoplasmosis' },
        ],
      },
    },
    {
      id: 'cxr-fibrothorax',
      title: 'Chronic breathlessness after a past chest infection',
      vignette:
        'A patient with a remote chest infection has chronic restrictive symptoms. Describe the pleural thickening and volume loss, and distinguish chronic change from an acute effusion.',
      domain: 'radiology',
      difficulty: 'intermediate',
      image: {
        src: '/images/chest-radiograph-open/cxr-fibrothorax.jpg',
        mimeType: 'image/jpeg',
        sha256: '9a889f6c4ad233038780a3d34f1fe706e2f87848fafbe69d174c530ad85cc5a5',
        alt: 'A chest radiograph with pleural thickening along one hemithorax and reduced volume on that side.',
        modality: 'CR',
        seriesLabel: 'Chest radiograph',
        width: 1195,
        height: 1177,
      },
      provenance: {
        sourceName: 'U.S. CDC PHIL image 6243, via Wikimedia Commons (File:Fibrothorax chest x-ray.jpg)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Fibrothorax_chest_x-ray.jpg',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:Fibrothorax_chest_x-ray.jpg#Licensing',
        attribution: 'U.S. Centers for Disease Control and Prevention / PHIL image 6243.',
        license: PD_USGOV,
      },
      contentWarnings: WARN,
      neutralDescription:
        'A chest radiograph with pleural thickening along one hemithorax and reduced volume on that side.',
      teachingNotes: [
        'Draft note (not clinically reviewed): CDC labels this as fibrothorax.',
        'Chronicity and cause require history and comparison imaging.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Chest radiograph', ...ACCENT },
      lesson: {
        objectives: [
          'Recognize pleural thickening and hemithorax volume loss.',
          'Distinguish pleural thickening from free pleural fluid.',
          'Connect the imaging findings to restrictive physiology.',
        ],
        clinicalCitations: [
          { id: 'ref-fibrothorax', title: 'Background reading: Fibrothorax', url: 'https://en.wikipedia.org/wiki/Fibrothorax' },
        ],
      },
    },
    {
      id: 'cxr-lung-mass',
      title: 'Weight loss and a persistent cough in a smoker',
      vignette:
        'An older adult with a smoking history and unintentional weight loss has a one-sided opacity. Localize it, avoid premature staging, and choose the next imaging step.',
      domain: 'radiology',
      difficulty: 'intermediate',
      image: {
        src: '/images/chest-radiograph-open/cxr-lung-mass.jpg',
        mimeType: 'image/jpeg',
        sha256: '330953bc2237aeb72a9862d5cc6d78a05f5664ad2a82da3114790d140ed1f3fd',
        alt: 'A chest radiograph with a focal rounded opacity in one lung.',
        modality: 'CR',
        seriesLabel: 'Chest radiograph',
        width: 1800,
        height: 1800,
      },
      provenance: {
        sourceName: 'U.S. National Cancer Institute, via Wikimedia Commons (File:LungCancer-Xray-01.jpg)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:LungCancer-Xray-01.jpg',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:LungCancer-Xray-01.jpg#Licensing',
        attribution: 'National Cancer Institute, U.S. National Institutes of Health.',
        license: PD_USGOV,
      },
      contentWarnings: WARN,
      neutralDescription: 'A chest radiograph with a focal rounded opacity in one lung.',
      teachingNotes: [
        'Draft note (not clinically reviewed): NCI released this radiograph labeled as lung cancer.',
        'A mass on radiography is not a tissue diagnosis; do not teach screening eligibility from it.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Chest radiograph', ...ACCENT },
      lesson: {
        objectives: [
          'Identify a focal pulmonary mass.',
          'Separate detection from tissue diagnosis.',
          'Outline appropriate cross-sectional evaluation.',
        ],
        clinicalCitations: [
          { id: 'ref-lung-cancer', title: 'Background reading: Lung cancer', url: 'https://en.wikipedia.org/wiki/Lung_cancer' },
        ],
      },
    },
  ],
});
