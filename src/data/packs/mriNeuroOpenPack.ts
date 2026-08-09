import {
  CONTENT_PACK_SCHEMA,
  CONTENT_PACK_SCHEMA_VERSION,
  defineContentPack,
} from '../contentPack';
import { PD_USGOV } from './openLicenses';

/**
 * Open neuroradiology teaching cases built on public-domain brain MRI images
 * from the National Institutes of Health (NCI and NIH image galleries). Clinical
 * review is recorded as not reviewed, and the source label is carried only as
 * unreviewed draft context so the tutor teaches by asking, not by revealing.
 */

const ACCENT = {
  category: 'mri',
  accentColor: 'rgba(59,130,246,1)',
  accentGlow: 'rgba(59,130,246,0.15)',
  accentBorder: 'rgba(59,130,246,0.35)',
  textClass: 'text-blue-400',
} as const;

const DEID =
  'Public teaching asset re-encoded to remove embedded file metadata. Independent de-identification review is not recorded.';
const WARN = ['Medical imaging'] as const;

export const mriNeuroOpenPack = defineContentPack({
  schema: CONTENT_PACK_SCHEMA,
  schemaVersion: CONTENT_PACK_SCHEMA_VERSION,
  id: 'mri-neuro-open',
  title: 'Open neuro MRI lessons (NIH)',
  contentVersion: '1.0.0',
  cases: [
    {
      id: 'mri-posterior-fossa',
      title: 'A child with morning headaches, vomiting, and an unsteady gait',
      vignette:
        'A school-aged child presents with several weeks of headaches that are worst on waking and are frequently followed by vomiting. On examination the child has a wide-based, unsteady gait and mild difficulty with tandem walking. Brain MRI has been obtained for further evaluation.',
      domain: 'radiology',
      difficulty: 'intermediate',
      image: {
        src: '/images/mri-neuro-open/mri-posterior-fossa.jpg',
        mimeType: 'image/jpeg',
        sha256: '40dbca7cf38173760da8c21e9923ba427d944b5257ed264834fc52daa88fd76b',
        alt: 'Axial brain MRI slice showing the cerebellum, brainstem, and fourth ventricle region.',
        modality: 'MR',
        seriesLabel: 'Axial brain MRI',
        width: 600,
        height: 599,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:MRI of PNET.jpg (National Cancer Institute)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:MRI_of_PNET.jpg',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:MRI_of_PNET.jpg#Licensing',
        attribution:
          'National Cancer Institute, National Institutes of Health (public domain, U.S. federal government work).',
        license: PD_USGOV,
      },
      contentWarnings: WARN,
      neutralDescription:
        'Axial brain MRI slice showing the cerebellum, brainstem, and fourth ventricle region.',
      teachingNotes: [
        'Draft note (not clinically reviewed): source label states this image is a primitive neuroectodermal tumor.',
        'This source label is not adjudicated ground truth for this teaching case, so specialist review is required before clinical use.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Brain MRI | Posterior fossa | Step 1', ...ACCENT },
      lesson: {
        objectives: [
          'Localize a posterior fossa lesion on brain MRI using cerebellar, brainstem, and fourth ventricle landmarks.',
          'Explain how a posterior fossa mass can produce morning headache, vomiting, and gait instability through mass effect and obstructive hydrocephalus.',
          'Distinguish radiographic localization and imaging differential from a specific histopathologic diagnosis, which requires tissue sampling.',
        ],
        clinicalCitations: [
          { id: 'ref-mri-posterior-fossa', title: 'Background reading: Medulloblastoma', url: 'https://en.wikipedia.org/wiki/Medulloblastoma' },
        ],
      },
    },
    {
      id: 'mri-white-matter',
      title: 'Memory concerns in an older adult with long-standing hypertension',
      vignette:
        'An older adult with a long history of hypertension presents with several months of mild concerns about memory and processing speed. Brain MRI shows patchy white matter hyperintensities on FLAIR sequences. The patient and family ask what these findings mean for the cognitive symptoms.',
      domain: 'radiology',
      difficulty: 'intermediate',
      image: {
        src: '/images/mri-neuro-open/mri-white-matter.jpg',
        mimeType: 'image/jpeg',
        sha256: 'fb11282328ad7d61012e60f973c20a8e824883079a2712244cb9d76762d2932f',
        alt: 'Brain MRI FLAIR image panel of the cerebral white matter and ventricles.',
        modality: 'MR',
        seriesLabel: 'Brain MRI (FLAIR panel)',
        width: 4904,
        height: 6000,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:White Matter Lesions (48601156232).jpg (National Institutes of Health)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:White_Matter_Lesions_%2848601156232%29.jpg',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:White_Matter_Lesions_%2848601156232%29.jpg#Licensing',
        attribution:
          'National Institutes of Health image gallery (public domain, U.S. federal government work); image associated with a blood-pressure study.',
        license: PD_USGOV,
      },
      contentWarnings: WARN,
      neutralDescription:
        'Brain MRI FLAIR image panel of the cerebral white matter and ventricles.',
      teachingNotes: [
        'Draft note (not clinically reviewed): source label states an NIH image panel illustrating MRI white matter lesions in the context of a blood-pressure study.',
        'This source label is not adjudicated ground truth for this teaching case, so specialist review is required before clinical use.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Brain MRI | White matter | Step 2', ...ACCENT },
      lesson: {
        objectives: [
          'Describe common radiographic patterns of white matter hyperintensities on FLAIR MRI, including periventricular and deep white matter distributions.',
          'Explain the association between chronic hypertension, cerebral small-vessel disease, and white matter changes on imaging.',
          'Distinguish an imaging association from a causal explanation when counseling a patient about cognitive symptoms.',
        ],
        clinicalCitations: [
          { id: 'ref-mri-white-matter', title: 'Background reading: Cerebral small vessel disease', url: 'https://en.wikipedia.org/wiki/Cerebral_small_vessel_disease' },
        ],
      },
    },
  ],
});
