import {
  CONTENT_PACK_SCHEMA,
  CONTENT_PACK_SCHEMA_VERSION,
  defineContentPack,
} from '../contentPack';
import { PD_USGOV } from './openLicenses';

/**
 * Open fundoscopy teaching cases built on National Eye Institute (NIH/NEI)
 * public-domain fundus photographs. Every file page marks the work as a U.S.
 * federal government work. Clinical review is recorded as not reviewed, and the
 * source label is carried only as unreviewed draft context, never as truth.
 */

const ACCENT = {
  category: 'ophthalmology',
  accentColor: 'rgba(249,115,22,1)',
  accentGlow: 'rgba(249,115,22,0.15)',
  accentBorder: 'rgba(249,115,22,0.35)',
  textClass: 'text-orange-400',
} as const;

const DEID =
  'Public teaching asset re-encoded to remove embedded file metadata. Independent de-identification review is not recorded.';
const WARN = ['Medical imaging'] as const;

export const ophthalmologyFundusPack = defineContentPack({
  schema: CONTENT_PACK_SCHEMA,
  schemaVersion: CONTENT_PACK_SCHEMA_VERSION,
  id: 'ophthalmology-fundus',
  title: 'Open fundoscopy lessons (NEI)',
  contentVersion: '1.0.0',
  cases: [
    {
      id: 'fundus-normal',
      title: 'Orienting to a fundus photograph before seeing pathology',
      vignette:
        'A learner is presented with a color fundus photograph as the first step in building a structured examination habit. Before any pathology is introduced, they should be able to name the major landmarks and describe what a healthy posterior pole looks like.',
      domain: 'ophthalmology',
      difficulty: 'introductory',
      image: {
        src: '/images/ophthalmology-fundus/fundus-normal.jpg',
        mimeType: 'image/jpeg',
        sha256: '6da1df2020cc1fdde88955822c82d69141e30d37cace80760c8c82328ee91285',
        alt: 'Color fundus photograph showing the optic disc, macula, and branching retinal vessels of the posterior pole.',
        modality: 'OP',
        seriesLabel: 'Fundus photograph',
        width: 900,
        height: 630,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:Fundus photograph-normal retina EDA06.JPG (National Eye Institute)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Fundus_photograph-normal_retina_EDA06.JPG',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:Fundus_photograph-normal_retina_EDA06.JPG#Licensing',
        attribution:
          'National Eye Institute, National Institutes of Health (public domain, U.S. federal government work), ref. EDA06.',
        license: PD_USGOV,
      },
      contentWarnings: WARN,
      neutralDescription:
        'Color fundus photograph showing the optic disc, macula, and branching retinal vessels of the posterior pole.',
      teachingNotes: [
        'Draft note (not clinically reviewed): source label states a fundus photograph labeled by NEI as a normal retina.',
        'This source label is not adjudicated ground truth for this teaching case, so specialist review is required before clinical use.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Fundus | Screening | Step 1', ...ACCENT },
      lesson: {
        objectives: [
          'Identify the optic disc, macula, and major retinal vessels on a fundus photograph.',
          'Describe the expected pattern of vessel emergence from the disc and the typical disc to cup relationship.',
          'Establish a structured sequence for examining every fundus image in the same order.',
        ],
        clinicalCitations: [
          { id: 'ref-fundus-normal', title: 'Background reading: Fundus (eye)', url: 'https://en.wikipedia.org/wiki/Fundus_(eye)' },
        ],
      },
    },
    {
      id: 'fundus-background-dr',
      title: 'Routine diabetes screening photograph with subtle vascular findings',
      vignette:
        'A patient with type 2 diabetes reports no visual complaints and comes in for annual screening imaging. The photograph shows early small vessel change, so the learner must decide whether this warrants urgent treatment or a plan for close follow-up.',
      domain: 'ophthalmology',
      difficulty: 'intermediate',
      image: {
        src: '/images/ophthalmology-fundus/fundus-background-dr.jpg',
        mimeType: 'image/jpeg',
        sha256: 'b14c70ceffad9fa592ec6e340b4a08b47184f70ddc6e5708ba3495f2916196f6',
        alt: 'Color fundus photograph of the posterior pole with scattered small red dots and spots along the vessels.',
        modality: 'OP',
        seriesLabel: 'Fundus photograph',
        width: 900,
        height: 600,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:Fundus retinopathy EDA03.JPG (National Eye Institute)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Fundus_retinopathy_EDA03.JPG',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:Fundus_retinopathy_EDA03.JPG#Licensing',
        attribution:
          'National Eye Institute, National Institutes of Health (public domain, U.S. federal government work), ref. EDA03.',
        license: PD_USGOV,
      },
      contentWarnings: WARN,
      neutralDescription:
        'Color fundus photograph of the posterior pole with scattered small red dots and spots along the vessels.',
      teachingNotes: [
        'Draft note (not clinically reviewed): source label states a fundus photograph described by NEI as background retinopathy with small vessel change and leakage.',
        'This source label is not adjudicated ground truth for this teaching case, so specialist review is required before clinical use.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Fundus | Diabetes | Step 2', ...ACCENT },
      lesson: {
        objectives: [
          'Recognize microvascular retinal changes such as microaneurysms, dot hemorrhages, and small areas of leakage in the posterior pole.',
          'Distinguish background retinopathy from proliferative disease based on the absence of neovascularization.',
          'Match the severity level to an appropriate screening interval and referral pathway.',
        ],
        clinicalCitations: [
          { id: 'ref-fundus-background-dr', title: 'Background reading: Diabetic retinopathy', url: 'https://en.wikipedia.org/wiki/Diabetic_retinopathy' },
        ],
      },
    },
    {
      id: 'fundus-proliferative-dr',
      title: 'New floaters in a patient with longstanding diabetes',
      vignette:
        'A patient with poorly controlled diabetes over many years reports new floaters and intermittent visual haze. Their fundus photograph shows changes beyond simple microvascular disease, and the learner must reason about how quickly this patient should be seen.',
      domain: 'ophthalmology',
      difficulty: 'advanced',
      image: {
        src: '/images/ophthalmology-fundus/fundus-proliferative-dr.jpg',
        mimeType: 'image/jpeg',
        sha256: '389469b439973952b4532d4ef662ee1215434ea96bb8c912ded55621a5efabae',
        alt: 'Color fundus photograph with abnormal fine vessels and patches of hemorrhage across the retina.',
        modality: 'OP',
        seriesLabel: 'Fundus photograph',
        width: 1000,
        height: 655,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:Fundus Proliferative retinopathy EDA01.JPG (National Eye Institute)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Fundus_Proliferative_retinopathy_EDA01.JPG',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:Fundus_Proliferative_retinopathy_EDA01.JPG#Licensing',
        attribution:
          'National Eye Institute, National Institutes of Health (public domain, U.S. federal government work), ref. EDA01.',
        license: PD_USGOV,
      },
      contentWarnings: WARN,
      neutralDescription:
        'Color fundus photograph with abnormal fine vessels and patches of hemorrhage across the retina.',
      teachingNotes: [
        'Draft note (not clinically reviewed): source label states a fundus photograph labeled by NEI as proliferative retinopathy.',
        'This source label is not adjudicated ground truth for this teaching case, so specialist review is required before clinical use.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Fundus | Diabetes | Step 2', ...ACCENT },
      lesson: {
        objectives: [
          'Distinguish proliferative from nonproliferative retinopathy on a fundus photograph.',
          'Identify features that suggest neovascularization or preretinal or vitreous hemorrhage.',
          'Connect a report of new floaters plus these findings to same day or same week ophthalmology evaluation.',
        ],
        clinicalCitations: [
          { id: 'ref-fundus-proliferative-dr', title: 'Background reading: Diabetic retinopathy', url: 'https://en.wikipedia.org/wiki/Diabetic_retinopathy' },
        ],
      },
    },
    {
      id: 'fundus-macular-edema',
      title: 'Central visual blur in a patient with diabetes',
      vignette:
        'A patient with diabetes reports blurring at the center of their vision when reading. The fundus photograph focuses attention on the region responsible for fine central acuity, and the learner must reason about why involvement there produces symptoms.',
      domain: 'ophthalmology',
      difficulty: 'intermediate',
      image: {
        src: '/images/ophthalmology-fundus/fundus-macular-edema.jpg',
        mimeType: 'image/jpeg',
        sha256: '93fbe9306cd072e0b5ff80ab3d735ce56365c48e64fcd0a639c1907330f22f9e',
        alt: 'Color fundus photograph centered on the macula with focal pale exudate and retinal thickening.',
        modality: 'OP',
        seriesLabel: 'Fundus photograph',
        width: 900,
        height: 600,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:Fundus Diabetic macular edema EDA04.JPG (National Eye Institute)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Fundus_Diabetic_macular_edema_EDA04.JPG',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:Fundus_Diabetic_macular_edema_EDA04.JPG#Licensing',
        attribution:
          'National Eye Institute, National Institutes of Health (public domain, U.S. federal government work), ref. EDA04.',
        license: PD_USGOV,
      },
      contentWarnings: WARN,
      neutralDescription:
        'Color fundus photograph centered on the macula with focal pale exudate and retinal thickening.',
      teachingNotes: [
        'Draft note (not clinically reviewed): source label states a fundus photograph labeled by NEI as diabetic macular edema.',
        'This source label is not adjudicated ground truth for this teaching case, so specialist review is required before clinical use.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Fundus | Macula | Step 2', ...ACCENT },
      lesson: {
        objectives: [
          'Locate the macula on a fundus photograph and describe its relationship to the optic disc.',
          'Recognize a pattern consistent with macular edema, such as retinal thickening or focal leakage near the fovea.',
          'Explain why central retinal involvement drives visual symptoms and prompts referral for imaging and treatment.',
        ],
        clinicalCitations: [
          { id: 'ref-fundus-macular-edema', title: 'Background reading: Macular edema', url: 'https://en.wikipedia.org/wiki/Macular_edema' },
        ],
      },
    },
    {
      id: 'fundus-amd',
      title: 'Reading difficulty in dim light in an older adult',
      vignette:
        'An older adult reports increasing difficulty reading small print in dim light. Their fundus photograph shows changes at the macula that fall short of frank distortion or a central scotoma, and the learner must decide what to counsel about warning signs.',
      domain: 'ophthalmology',
      difficulty: 'intermediate',
      image: {
        src: '/images/ophthalmology-fundus/fundus-amd.jpg',
        mimeType: 'image/jpeg',
        sha256: '6a7843639363ac00db2ee0f5ba5dce66ac2b4f75948cc6b9a0e9b8f7121080e6',
        alt: 'Color fundus photograph of the macula showing pale round deposits and pigment change.',
        modality: 'OP',
        seriesLabel: 'Fundus photograph',
        width: 400,
        height: 343,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:Intermediate age related macular degeneration.jpg (National Eye Institute)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Intermediate_age_related_macular_degeneration.jpg',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:Intermediate_age_related_macular_degeneration.jpg#Licensing',
        attribution:
          'National Eye Institute, National Institutes of Health (public domain, U.S. federal government work), ref. EDA2.',
        license: PD_USGOV,
      },
      contentWarnings: WARN,
      neutralDescription:
        'Color fundus photograph of the macula showing pale round deposits and pigment change.',
      teachingNotes: [
        'Draft note (not clinically reviewed): source label states an NEI fundus photograph described as intermediate age related macular degeneration.',
        'This source label is not adjudicated ground truth for this teaching case, so specialist review is required before clinical use.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Fundus | Macula | Clerkship', ...ACCENT },
      lesson: {
        objectives: [
          'Recognize drusen and pigmentary change at the macula consistent with intermediate age related macular degeneration.',
          'Connect macular location to loss of central rather than peripheral vision.',
          'Distinguish routine follow-up from new metamorphopsia or acute central vision loss that requires urgent evaluation.',
        ],
        clinicalCitations: [
          { id: 'ref-fundus-amd', title: 'Background reading: Macular degeneration', url: 'https://en.wikipedia.org/wiki/Macular_degeneration' },
        ],
      },
    },
    {
      id: 'fundus-cmv-retinitis',
      title: 'Floaters and visual field loss in a severely immunocompromised patient',
      vignette:
        'A patient with advanced immunosuppression, for example from untreated HIV or a post transplant regimen, reports floaters and a shrinking visual field. Their fundus photograph shows a pattern the learner should treat as sight threatening and time sensitive.',
      domain: 'ophthalmology',
      difficulty: 'advanced',
      image: {
        src: '/images/ophthalmology-fundus/fundus-cmv-retinitis.jpg',
        mimeType: 'image/jpeg',
        sha256: 'd92d37e452b620e1f23e27fa3c4cf225f0158fb9dee49d5d2ded58a19f78bd7d',
        alt: 'Color fundus photograph with areas of retinal whitening and hemorrhage tracking along the vessels.',
        modality: 'OP',
        seriesLabel: 'Fundus photograph',
        width: 1800,
        height: 1200,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:Fundus photograph-CMV retinitis EDA07.JPG (National Eye Institute)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Fundus_photograph-CMV_retinitis_EDA07.JPG',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:Fundus_photograph-CMV_retinitis_EDA07.JPG#Licensing',
        attribution:
          'National Eye Institute, National Institutes of Health (public domain, U.S. federal government work), ref. EDA07.',
        license: PD_USGOV,
      },
      contentWarnings: WARN,
      neutralDescription:
        'Color fundus photograph with areas of retinal whitening and hemorrhage tracking along the vessels.',
      teachingNotes: [
        'Draft note (not clinically reviewed): source label states a fundus photograph labeled by NEI as CMV retinitis.',
        'This source label is not adjudicated ground truth for this teaching case, so specialist review is required before clinical use.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Fundus | Infectious | Step 2', ...ACCENT },
      lesson: {
        objectives: [
          'Recognize a necrotizing retinitis pattern with hemorrhage and retinal whitening consistent with CMV retinitis.',
          'Connect the degree of immune compromise to the risk of opportunistic retinal infection.',
          'Prioritize same day ophthalmology and infectious disease evaluation over routine outpatient follow-up.',
        ],
        clinicalCitations: [
          { id: 'ref-fundus-cmv-retinitis', title: 'Background reading: Cytomegalovirus retinitis', url: 'https://en.wikipedia.org/wiki/Cytomegalovirus_retinitis' },
        ],
      },
    },
    {
      id: 'fundus-retinal-detachment',
      title: 'Flashes and a curtain-like visual deficit in a young adult with a notable family history',
      vignette:
        'A young adult with a family history of retinal and central nervous system tumors reports flashes and a curtain moving across their peripheral vision. The fundus photograph shows a finding that pairs a time critical eye emergency with the need for broader syndromic surveillance.',
      domain: 'ophthalmology',
      difficulty: 'advanced',
      image: {
        src: '/images/ophthalmology-fundus/fundus-retinal-detachment.jpg',
        mimeType: 'image/jpeg',
        sha256: 'e5de317dd24a5d9b1b373964a42696e907eedb5186652b2d7f6c0461d6526f2f',
        alt: 'Color fundus photograph showing an elevated, billowing area of retina.',
        modality: 'OP',
        seriesLabel: 'Fundus photograph',
        width: 504,
        height: 386,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:Retinal detachment in Von Hippel-Lindau disease.jpg (National Eye Institute)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Retinal_detachment_in_Von_Hippel-Lindau_disease.jpg',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:Retinal_detachment_in_Von_Hippel-Lindau_disease.jpg#Licensing',
        attribution:
          'National Eye Institute, National Institutes of Health (public domain, U.S. federal government work), ref. EDA08.',
        license: PD_USGOV,
      },
      contentWarnings: WARN,
      neutralDescription:
        'Color fundus photograph showing an elevated, billowing area of retina.',
      teachingNotes: [
        'Draft note (not clinically reviewed): source label states an NEI image described as retinal detachment in the setting of von Hippel-Lindau disease.',
        'This source label is not adjudicated ground truth for this teaching case, so specialist review is required before clinical use.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Fundus | Emergency | Clerkship', ...ACCENT },
      lesson: {
        objectives: [
          'Recognize retinal detachment on a fundus photograph.',
          'Treat flashes, floaters, and a curtain-like peripheral visual deficit as ophthalmologic emergencies.',
          'Connect a suggestive family history to the need for multisystem surveillance across the retina, brain, kidney, and adrenal.',
        ],
        clinicalCitations: [
          { id: 'ref-fundus-retinal-detachment', title: 'Background reading: Retinal detachment', url: 'https://en.wikipedia.org/wiki/Retinal_detachment' },
        ],
      },
    },
  ],
});
