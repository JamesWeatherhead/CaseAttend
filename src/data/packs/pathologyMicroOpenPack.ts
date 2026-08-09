import {
  CONTENT_PACK_SCHEMA,
  CONTENT_PACK_SCHEMA_VERSION,
  defineContentPack,
} from '../contentPack';
import { PD_USGOV } from './openLicenses';

/**
 * Open microscopy and histopathology teaching cases built on public-domain
 * images from U.S. federal agencies (NCI, NIH, and the CDC Public Health Image
 * Library). Clinical review is recorded as not reviewed, and the source label is
 * carried only as unreviewed draft context, never as adjudicated ground truth.
 */

const ACCENT = {
  category: 'path',
  accentColor: 'rgba(168,85,247,1)',
  accentGlow: 'rgba(168,85,247,0.15)',
  accentBorder: 'rgba(168,85,247,0.35)',
  textClass: 'text-purple-400',
} as const;

const DEID =
  'Public teaching asset re-encoded to remove embedded file metadata. Independent de-identification review is not recorded.';
const HISTO = ['Histopathology image'] as const;
const MICRO = ['Microscopy image'] as const;
const REVIEW_NOTE =
  'This source label is not adjudicated ground truth for this teaching case, so specialist review is required before clinical use.';

export const pathologyMicroOpenPack = defineContentPack({
  schema: CONTENT_PACK_SCHEMA,
  schemaVersion: CONTENT_PACK_SCHEMA_VERSION,
  id: 'pathology-micro-open',
  title: 'Open microscopy and histopathology lessons',
  contentVersion: '1.0.0',
  cases: [
    {
      id: 'path-breast-duct',
      title: 'A suspicious breast lesion on core biopsy',
      vignette:
        'A patient with a palpable breast mass undergoes core needle biopsy, and the tissue is prepared with hematoxylin and eosin staining. Learners are asked to compare normal duct architecture with the pattern shown in the field. Consider what a single microscopic view can, and cannot, tell you about extent of disease.',
      domain: 'pathology',
      difficulty: 'intermediate',
      image: {
        src: '/images/pathology-micro-open/path-breast-duct.jpg',
        mimeType: 'image/jpeg',
        sha256: 'bcfa06dd36b1e24b866ac628f4f05e06175e24a889d14eefc306ab2edda9877c',
        alt: 'H&E photomicrograph of breast tissue with a duct expanded and filled by crowded atypical cells.',
        modality: 'PATH',
        seriesLabel: 'H&E photomicrograph',
        width: 2700,
        height: 1800,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:Breast cancer cells.jpg (National Cancer Institute)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Breast_cancer_cells.jpg',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:Breast_cancer_cells.jpg#Licensing',
        attribution:
          'Dr. Cecil Fox (photographer), National Cancer Institute (public domain, U.S. federal government work); H&E, 100x.',
        license: PD_USGOV,
      },
      contentWarnings: HISTO,
      neutralDescription:
        'H&E photomicrograph of breast tissue with a duct expanded and filled by crowded atypical cells.',
      teachingNotes: [
        'Draft note (not clinically reviewed): source label states an NCI H&E slide described as breast cancer invading normal tissue and filling a duct.',
        REVIEW_NOTE,
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Histopathology | Breast | Step 1', ...ACCENT },
      lesson: {
        objectives: [
          'Identify normal breast duct architecture and describe abnormal cellular proliferation within a duct.',
          'Distinguish the conceptual difference between in situ and invasive lesions, and explain why the distinction matters clinically.',
          'Relate histologic findings to the limits of staging and grading from a single microscopic field.',
        ],
        clinicalCitations: [
          { id: 'ref-path-breast-duct', title: 'Background reading: Breast cancer (StatPearls)', url: 'https://www.ncbi.nlm.nih.gov/books/NBK482286/' },
        ],
      },
    },
    {
      id: 'path-prostate',
      title: 'Interpreting a prostate needle biopsy',
      vignette:
        'A patient with an abnormal digital rectal examination and rising PSA undergoes prostate needle biopsy. The photomicrograph shows a proliferation of small glands next to more organized structures. Consider what can be concluded, and what cannot, from a single field.',
      domain: 'pathology',
      difficulty: 'intermediate',
      image: {
        src: '/images/pathology-micro-open/path-prostate.jpg',
        mimeType: 'image/jpeg',
        sha256: '6dbaaf2aa48939649ebd0a76b106bce6c8784aa8c95c56ff06c9aa4d64bf2c63',
        alt: 'H&E photomicrograph of prostate tissue with crowded small glands adjacent to larger, more organized glands.',
        modality: 'PATH',
        seriesLabel: 'H&E photomicrograph',
        width: 1200,
        height: 874,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:Prostatehistopath.jpg (NIH/NCI CGAP)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Prostatehistopath.jpg',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:Prostatehistopath.jpg#Licensing',
        attribution:
          'Composite of NIH/NCI CGAP photomicrographs, Wikimedia Commons (public domain, U.S. federal government work).',
        license: PD_USGOV,
      },
      contentWarnings: HISTO,
      neutralDescription:
        'H&E photomicrograph of prostate tissue with crowded small glands adjacent to larger, more organized glands.',
      teachingNotes: [
        'Draft note (not clinically reviewed): source label states a photomicrograph identified by NIH as invasive prostate adenocarcinoma.',
        REVIEW_NOTE,
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Histopathology | Prostate | Step 1', ...ACCENT },
      lesson: {
        objectives: [
          'Recognize the morphology of gland-forming adenocarcinoma in prostate tissue.',
          'Contrast crowded small malignant glands with benign prostatic architecture.',
          'Explain the role of Gleason grading and why a grade cannot be assigned casually from one image.',
        ],
        clinicalCitations: [
          { id: 'ref-path-prostate', title: 'Background reading: Prostate cancer (StatPearls)', url: 'https://www.ncbi.nlm.nih.gov/books/NBK470550/' },
        ],
      },
    },
    {
      id: 'path-afb-sputum',
      title: 'A sputum smear in a patient with chronic cough',
      vignette:
        'A patient with several weeks of cough, night sweats, and weight loss provides a sputum sample for microscopy. The smear is prepared with an acid-fast stain and the image shows the resulting appearance. Consider what a positive smear does, and does not, prove, and what steps come next.',
      domain: 'pathology',
      difficulty: 'intermediate',
      image: {
        src: '/images/pathology-micro-open/path-afb-sputum.png',
        mimeType: 'image/png',
        sha256: '3d817e35cfae818231202bf2020818534aa5575a0507bcf80454fa64b80a9025',
        alt: 'Acid-fast stained sputum smear with slender red rod-shaped organisms against a blue background.',
        modality: 'SM',
        seriesLabel: 'Acid-fast sputum smear',
        width: 2047,
        height: 2047,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:TB in sputum.png (CDC)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:TB_in_sputum.png',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:TB_in_sputum.png#Licensing',
        attribution:
          'Centers for Disease Control and Prevention (public domain, U.S. federal government work).',
        license: PD_USGOV,
      },
      contentWarnings: MICRO,
      neutralDescription:
        'Acid-fast stained sputum smear with slender red rod-shaped organisms against a blue background.',
      teachingNotes: [
        'Draft note (not clinically reviewed): source label states a sputum smear micrograph labeled by CDC as tuberculosis organisms in sputum.',
        REVIEW_NOTE,
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Microscopy | Sputum smear | Step 2', ...ACCENT },
      lesson: {
        objectives: [
          'Recognize the morphology of acid-fast bacilli on a stained sputum smear.',
          'Distinguish smear positivity from species identification, and describe what a smear result actually confirms.',
          'Connect microscopy findings to confirmatory workflows including culture and nucleic acid amplification testing.',
        ],
        clinicalCitations: [
          { id: 'ref-path-afb-sputum', title: 'Background reading: Tuberculosis (StatPearls)', url: 'https://www.ncbi.nlm.nih.gov/books/NBK441916/' },
        ],
      },
    },
    {
      id: 'path-malaria-falciparum',
      title: 'Fever in a returned traveler from an endemic region',
      vignette:
        'A febrile patient returns from recent travel in a malaria-endemic area, and thin and thick blood films are prepared. The image shows parasitized red cells, some containing more than one organism. Consider likely species, urgency, and immediate next steps.',
      domain: 'pathology',
      difficulty: 'intermediate',
      image: {
        src: '/images/pathology-micro-open/path-malaria-falciparum.png',
        mimeType: 'image/png',
        sha256: 'fdcd68a07c31eb5d1aed5bf41d46b5348391bc58d912d11c0f5978473cd0089e',
        alt: 'Giemsa-stained blood smear with red cells containing small ring-shaped inclusions, some with more than one.',
        modality: 'SM',
        seriesLabel: 'Giemsa blood smear',
        width: 710,
        height: 476,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:Plasmodium falciparum 01.png (CDC)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Plasmodium_falciparum_01.png',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:Plasmodium_falciparum_01.png#Licensing',
        attribution:
          'Centers for Disease Control and Prevention (public domain, U.S. federal government work).',
        license: PD_USGOV,
      },
      contentWarnings: MICRO,
      neutralDescription:
        'Giemsa-stained blood smear with red cells containing small ring-shaped inclusions, some with more than one.',
      teachingNotes: [
        'Draft note (not clinically reviewed): source label states a blood-smear image identified by CDC as Plasmodium falciparum.',
        REVIEW_NOTE,
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Microscopy | Blood smear | Step 2', ...ACCENT },
      lesson: {
        objectives: [
          'Recognize ring-form trophozoites and multiply-infected erythrocytes on a peripheral blood smear.',
          'Distinguish features compatible with Plasmodium falciparum from findings that require definitive species confirmation.',
          'Connect parasitemia estimates and severity criteria to clinical urgency and treatment escalation.',
        ],
        clinicalCitations: [
          { id: 'ref-path-malaria-falciparum', title: 'Background reading: Malaria (StatPearls)', url: 'https://www.ncbi.nlm.nih.gov/books/NBK551711/' },
        ],
      },
    },
    {
      id: 'path-malaria-vivax',
      title: 'Recurring fevers after travel',
      vignette:
        'A patient has recurring fevers weeks after returning from travel abroad, and a blood smear is examined. Some infected red cells appear enlarged, and organisms show a characteristic developmental morphology. Consider which species is likely and what relapse prevention actually requires.',
      domain: 'pathology',
      difficulty: 'intermediate',
      image: {
        src: '/images/pathology-micro-open/path-malaria-vivax.png',
        mimeType: 'image/png',
        sha256: 'ff5c07f8176bf7f01f073bf1ce2facc3cbca9049efbf693e41c42efbd96bb270',
        alt: 'Giemsa-stained blood smear with enlarged red cells containing developing ring and ameboid forms.',
        modality: 'SM',
        seriesLabel: 'Giemsa blood smear',
        width: 619,
        height: 417,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:Plasmodium vivax 01.png (CDC)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Plasmodium_vivax_01.png',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:Plasmodium_vivax_01.png#Licensing',
        attribution:
          'Centers for Disease Control and Prevention (public domain, U.S. federal government work).',
        license: PD_USGOV,
      },
      contentWarnings: MICRO,
      neutralDescription:
        'Giemsa-stained blood smear with enlarged red cells containing developing ring and ameboid forms.',
      teachingNotes: [
        'Draft note (not clinically reviewed): source label states a blood-smear image identified by CDC as Plasmodium vivax.',
        REVIEW_NOTE,
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Microscopy | Blood smear | Step 2', ...ACCENT },
      lesson: {
        objectives: [
          'Recognize enlarged infected erythrocytes and morphology compatible with Plasmodium vivax.',
          'Contrast vivax-compatible smear features with those typical of Plasmodium falciparum.',
          'Connect the hypnozoite life-cycle stage and G6PD status testing to relapse prevention considerations.',
        ],
        clinicalCitations: [
          { id: 'ref-path-malaria-vivax', title: 'Background reading: Plasmodium vivax', url: 'https://en.wikipedia.org/wiki/Plasmodium_vivax' },
        ],
      },
    },
    {
      id: 'path-giardia',
      title: 'Persistent diarrhea after wilderness travel',
      vignette:
        'A hiker develops several days of foul-smelling, non-bloody diarrhea and bloating after drinking from an untreated stream. A scanning electron micrograph of the suspected organism is shown as a morphology bridge, not as a routine clinical test. Consider what actually gets ordered in the clinic.',
      domain: 'pathology',
      difficulty: 'introductory',
      image: {
        src: '/images/pathology-micro-open/path-giardia.jpg',
        mimeType: 'image/jpeg',
        sha256: 'ee4bafa5b278a09a2d6bb16723d7487b62339887154fc76328696f3fa39f6cfe',
        alt: 'Scanning electron micrograph of a teardrop-shaped organism with paired structures and a concave surface.',
        modality: 'SEM',
        seriesLabel: 'Scanning electron micrograph',
        width: 626,
        height: 737,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:Giardia lamblia SEM 8698 lores.jpg (CDC)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Giardia_lamblia_SEM_8698_lores.jpg',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:Giardia_lamblia_SEM_8698_lores.jpg#Licensing',
        attribution:
          'Centers for Disease Control and Prevention, Public Health Image Library image 8698 (public domain, U.S. federal government work).',
        license: PD_USGOV,
      },
      contentWarnings: MICRO,
      neutralDescription:
        'Scanning electron micrograph of a teardrop-shaped organism with paired structures and a concave surface.',
      teachingNotes: [
        'Draft note (not clinically reviewed): source label states a CDC scanning electron micrograph of Giardia lamblia.',
        REVIEW_NOTE,
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Microscopy | SEM | Step 1', ...ACCENT },
      lesson: {
        objectives: [
          'Recognize the characteristic trophozoite morphology of Giardia in illustrative SEM images.',
          'Link freshwater or untreated-water exposure to a focused differential for infectious diarrhea.',
          'Distinguish teaching-oriented SEM morphology from stool antigen and ova-and-parasite testing used in real clinical workflows.',
        ],
        clinicalCitations: [
          { id: 'ref-path-giardia', title: 'Background reading: Giardiasis (StatPearls)', url: 'https://www.ncbi.nlm.nih.gov/books/NBK513239/' },
        ],
      },
    },
    {
      id: 'path-reye-liver',
      title: 'Encephalopathy in a child after a viral illness',
      vignette:
        'A young child develops persistent vomiting and progressive confusion during recovery from a viral illness that was treated at home with aspirin. Liver tissue is obtained during workup, and the histologic pattern is shown. Consider the type of fatty change and its systemic consequences.',
      domain: 'pathology',
      difficulty: 'intermediate',
      image: {
        src: '/images/pathology-micro-open/path-reye-liver.jpg',
        mimeType: 'image/jpeg',
        sha256: '105fb192f06af1e453078082db4587377f4bfbbf3979488b12d05d1707432072',
        alt: 'H&E photomicrograph of liver with hepatocytes showing fine, pale cytoplasmic vacuolation.',
        modality: 'PATH',
        seriesLabel: 'H&E photomicrograph',
        width: 1809,
        height: 1196,
      },
      provenance: {
        sourceName: "Wikimedia Commons, File:Reye's syndrome liver-histology.jpg (CDC)",
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Reye%27s_syndrome_liver-histology.jpg',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:Reye%27s_syndrome_liver-histology.jpg#Licensing',
        attribution:
          'Centers for Disease Control and Prevention (public domain, U.S. federal government work).',
        license: PD_USGOV,
      },
      contentWarnings: HISTO,
      neutralDescription:
        'H&E photomicrograph of liver with hepatocytes showing fine, pale cytoplasmic vacuolation.',
      teachingNotes: [
        'Draft note (not clinically reviewed): source label states a liver histology image identified by CDC as Reye syndrome.',
        REVIEW_NOTE,
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Histopathology | Liver | Step 1', ...ACCENT },
      lesson: {
        objectives: [
          'Identify microvesicular fatty change in hepatocytes on liver histology.',
          'Connect hepatic mitochondrial dysfunction to hypoglycemia, hyperammonemia, and encephalopathy.',
          'Distinguish microvesicular steatosis from the macrovesicular pattern seen in other common liver disorders.',
        ],
        clinicalCitations: [
          { id: 'ref-path-reye-liver', title: 'Background reading: Reye syndrome (StatPearls)', url: 'https://www.ncbi.nlm.nih.gov/books/NBK526101/' },
        ],
      },
    },
    {
      id: 'path-schistosoma',
      title: 'Terminal hematuria in a patient from an endemic region',
      vignette:
        'A patient who grew up in a region endemic for freshwater parasitic disease reports painless terminal hematuria and a history of swimming in local waterways. Cystoscopy is performed and bladder biopsies are obtained. Consider the parasite-related tissue findings and the long-term risks.',
      domain: 'pathology',
      difficulty: 'intermediate',
      image: {
        src: '/images/pathology-micro-open/path-schistosoma.jpg',
        mimeType: 'image/jpeg',
        sha256: 'fe6c850ad833d083139c3ad76bc46d4095956cba03a921915c7743310a92a82a',
        alt: 'Photomicrograph of bladder wall with inflammation surrounding oval parasite eggs.',
        modality: 'PATH',
        seriesLabel: 'Bladder histopathology',
        width: 1810,
        height: 1208,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:Schistosoma bladder histopathology.jpeg (CDC)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Schistosoma_bladder_histopathology.jpeg',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:Schistosoma_bladder_histopathology.jpeg#Licensing',
        attribution:
          'Centers for Disease Control and Prevention (public domain, U.S. federal government work).',
        license: PD_USGOV,
      },
      contentWarnings: HISTO,
      neutralDescription:
        'Photomicrograph of bladder wall with inflammation surrounding oval parasite eggs.',
      teachingNotes: [
        'Draft note (not clinically reviewed): source label states a bladder histopathology image identified by CDC as schistosomiasis.',
        REVIEW_NOTE,
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Histopathology | Bladder | Clerkship', ...ACCENT },
      lesson: {
        objectives: [
          'Identify schistosome ova and the associated granulomatous inflammation in bladder tissue.',
          'Connect a history of freshwater exposure in endemic regions to urinary parasitic disease.',
          'Explain the complications of chronic bladder inflammation, including fibrosis and downstream malignancy risk.',
        ],
        clinicalCitations: [
          { id: 'ref-path-schistosoma', title: 'Background reading: Schistosomiasis (StatPearls)', url: 'https://www.ncbi.nlm.nih.gov/books/NBK554434/' },
        ],
      },
    },
  ],
});
