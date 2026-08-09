import {
  CONTENT_PACK_SCHEMA,
  CONTENT_PACK_SCHEMA_VERSION,
  defineContentPack,
} from '../contentPack';
import { CC0, PD_SELF } from './openLicenses';

/**
 * Open ultrasound and POCUS teaching cases. Every artifact is a CC0 or
 * public-domain still whose Wikimedia Commons file page asserts the reuse terms.
 * Case and lesson clinical review is recorded as not reviewed; titles and alt
 * text stay neutral so the tutor teaches by asking, not by revealing the answer.
 */

const ACCENT = {
  category: 'ultrasound',
  accentColor: 'rgba(34,211,238,1)',
  accentGlow: 'rgba(34,211,238,0.15)',
  accentBorder: 'rgba(34,211,238,0.35)',
  textClass: 'text-cyan-400',
} as const;

const DEID =
  'Public teaching asset re-encoded to remove embedded file metadata. Independent de-identification review is not recorded.';
const WARN = ['Medical imaging'] as const;

export const ultrasoundPocusPack = defineContentPack({
  schema: CONTENT_PACK_SCHEMA,
  schemaVersion: CONTENT_PACK_SCHEMA_VERSION,
  id: 'ultrasound-pocus',
  title: 'Open ultrasound and POCUS lessons',
  contentVersion: '1.0.0',
  cases: [
    {
      id: 'us-appendix-normal',
      title: 'Right lower quadrant pain in a child',
      vignette:
        'A child has right lower quadrant pain but improving symptoms. Graded compression images show a small compressible tubular structure. Which findings support a normal appendix, and what still limits exclusion of appendicitis?',
      domain: 'ultrasound',
      difficulty: 'intermediate',
      image: {
        src: '/images/ultrasound-pocus/us-appendix-normal.jpg',
        mimeType: 'image/jpeg',
        sha256: 'a753ee04904c37c994f88da6a7ae38641bbcaa753b66501aa4913fbb7e824d88',
        alt: 'Paired ultrasound views of an appendix before and during graded compression.',
        modality: 'US',
        seriesLabel: 'Graded-compression ultrasound (two panels)',
        width: 343,
        height: 232,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:Ultrasonography of a normal appendix without and with compression.jpg (Mikael Haggstrom, M.D.)',
        sourceUrl:
          'https://commons.wikimedia.org/wiki/File:Ultrasonography_of_a_normal_appendix_without_and_with_compression.jpg',
        licenseEvidenceUrl:
          'https://commons.wikimedia.org/wiki/File:Ultrasonography_of_a_normal_appendix_without_and_with_compression.jpg#Licensing',
        attribution: 'Mikael Haggstrom, M.D., Wikimedia Commons (CC0).',
        license: CC0,
      },
      contentWarnings: WARN,
      neutralDescription: 'Paired ultrasound views of an appendix before and during graded compression.',
      teachingNotes: [
        'Draft note (not clinically reviewed): the source labels these as paired views of a normal appendix before and during graded compression.',
        'Do not teach that one still image rules out appendicitis; operator skill and the full examination matter.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Ultrasound | POCUS', ...ACCENT },
      lesson: {
        objectives: [
          'Explain graded compression and why it is used.',
          'Identify the size and compressibility features that suggest a normal appendix.',
          'State the limitations of a nonvisualized or partially visualized appendix.',
        ],
        clinicalCitations: [
          { id: 'ref-appendicitis', title: 'Background reading: Appendicitis', url: 'https://en.wikipedia.org/wiki/Appendicitis' },
        ],
      },
    },
    {
      id: 'us-cholecystitis',
      title: 'Right upper quadrant pain after a fatty meal',
      vignette:
        'A 48-year-old develops eight hours of right upper quadrant pain, fever, and nausea after a meal. The image shows echogenic foci, a thickened wall, and adjacent fluid. Synthesize the imaging and symptoms, and identify what additional bedside finding would strengthen the assessment.',
      domain: 'ultrasound',
      difficulty: 'intermediate',
      image: {
        src: '/images/ultrasound-pocus/us-cholecystitis.jpg',
        mimeType: 'image/jpeg',
        sha256: '3f41f1fb8ac2841b183778c4988770b2e588212962b32a08b62cd57e581daad9',
        alt: 'An abdominal ultrasound of the gallbladder showing echogenic foci with posterior shadowing, a thickened wall, and a thin rim of adjacent fluid.',
        modality: 'US',
        seriesLabel: 'Gallbladder ultrasound',
        width: 673,
        height: 571,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:Ultrasonography of cholecystitis.jpg (Mikael Haggstrom, M.D.)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Ultrasonography_of_cholecystitis.jpg',
        licenseEvidenceUrl:
          'https://commons.wikimedia.org/wiki/File:Ultrasonography_of_cholecystitis.jpg#Licensing',
        attribution: 'Mikael Haggstrom, M.D., Wikimedia Commons (CC0).',
        license: CC0,
      },
      contentWarnings: WARN,
      neutralDescription:
        'An abdominal ultrasound of the gallbladder showing echogenic foci with posterior shadowing, a thickened wall, and a thin rim of adjacent fluid.',
      teachingNotes: [
        'Draft note (not clinically reviewed): the source describes gallstones, gallbladder wall thickening, and pericholecystic fluid.',
        'Static findings require clinical correlation; wall thickening has many causes.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Ultrasound | Biliary', ...ACCENT },
      lesson: {
        objectives: [
          'Recognize echogenic foci, gallbladder wall thickening, and pericholecystic fluid.',
          'Distinguish uncomplicated biliary colic from inflammatory gallbladder disease.',
          'Explain the role and limitations of a sonographic Murphy sign.',
        ],
        clinicalCitations: [
          { id: 'ref-cholecystitis', title: 'Background reading: Cholecystitis', url: 'https://en.wikipedia.org/wiki/Cholecystitis' },
        ],
      },
    },
    {
      id: 'us-renal-diabetic',
      title: 'Worsening kidney function in longstanding diabetes',
      vignette:
        'A patient with longstanding diabetes and gradually worsening kidney function undergoes renal ultrasound. Describe the echogenicity and size without claiming a histologic diagnosis from imaging alone.',
      domain: 'ultrasound',
      difficulty: 'intermediate',
      image: {
        src: '/images/ultrasound-pocus/us-renal-diabetic.jpg',
        mimeType: 'image/jpeg',
        sha256: '0b983378960f1cfb0cfcc79419d99d36d7a6ac18bdd22f91aa43c91a73b1f29f',
        alt: 'A renal ultrasound showing a kidney with increased cortical echogenicity relative to adjacent tissue.',
        modality: 'US',
        seriesLabel: 'Renal ultrasound',
        width: 632,
        height: 640,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:Ultrasonography of kidney with diabetic nephropathy.jpg (Mikael Haggstrom, M.D.)',
        sourceUrl:
          'https://commons.wikimedia.org/wiki/File:Ultrasonography_of_kidney_with_diabetic_nephropathy.jpg',
        licenseEvidenceUrl:
          'https://commons.wikimedia.org/wiki/File:Ultrasonography_of_kidney_with_diabetic_nephropathy.jpg#Licensing',
        attribution: 'Mikael Haggstrom, M.D., Wikimedia Commons (CC0).',
        license: CC0,
      },
      contentWarnings: WARN,
      neutralDescription:
        'A renal ultrasound showing a kidney with increased cortical echogenicity relative to adjacent tissue.',
      teachingNotes: [
        'Draft note (not clinically reviewed): the source labels this as diabetic nephropathy.',
        'Ultrasound alone cannot distinguish diabetic nephropathy from other medical renal diseases.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Ultrasound | Renal', ...ACCENT },
      lesson: {
        objectives: [
          'Compare renal cortical echogenicity with adjacent reference tissue.',
          'Recognize an imaging pattern of chronic parenchymal disease.',
          'Separate an imaging description from an etiologic diagnosis.',
        ],
        clinicalCitations: [
          { id: 'ref-diabetic-nephropathy', title: 'Background reading: Diabetic nephropathy', url: 'https://en.wikipedia.org/wiki/Diabetic_nephropathy' },
        ],
      },
    },
    {
      id: 'us-lung-blines',
      title: 'Focal chest tenderness after blunt trauma',
      vignette:
        'A stable patient has focal chest wall tenderness after blunt trauma. Lung ultrasound shows focal vertical artifacts. Is this pattern compatible with an early contusion, and which dangerous alternatives still require assessment?',
      domain: 'ultrasound',
      difficulty: 'intermediate',
      image: {
        src: '/images/ultrasound-pocus/us-lung-blines.png',
        mimeType: 'image/png',
        sha256: 'ab76ad0af4c188d5bc2961e62a577812e24f388d069ed57c3ac04b70ebb71976',
        alt: 'A still lung ultrasound showing several vertical hyperechoic artifacts arising from the pleural line.',
        modality: 'US',
        seriesLabel: 'Lung ultrasound',
        width: 435,
        height: 362,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:Lung Contusion.png (Bizorsilva)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Lung_Contusion.png',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:Lung_Contusion.png#Licensing',
        attribution: 'Bizorsilva, Wikimedia Commons (public domain, PD-self).',
        license: PD_SELF,
      },
      contentWarnings: WARN,
      neutralDescription:
        'A still lung ultrasound showing several vertical hyperechoic artifacts arising from the pleural line.',
      teachingNotes: [
        'Draft note (not clinically reviewed): the source describes early pulmonary contusion with B-lines.',
        'Lung sliding and dynamic artifact behavior cannot be assessed reliably from a still image.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Ultrasound | Lung', ...ACCENT },
      lesson: {
        objectives: [
          'Identify vertical pleural-line artifacts (B-lines).',
          'Relate a focal artifact distribution to possible lung injury.',
          'Explain why a still frame cannot exclude pneumothorax or hemothorax.',
        ],
        clinicalCitations: [
          { id: 'ref-pulmonary-contusion', title: 'Background reading: Pulmonary contusion', url: 'https://en.wikipedia.org/wiki/Pulmonary_contusion' },
        ],
      },
    },
    {
      id: 'us-plax-mmode',
      title: 'Exertional dyspnea: a parasternal long-axis view',
      vignette:
        'A patient with exertional dyspnea has a parasternal long-axis view with M-mode sampling across the left ventricle. Orient the image and explain what can and cannot be estimated from it.',
      domain: 'ultrasound',
      difficulty: 'intermediate',
      image: {
        src: '/images/ultrasound-pocus/us-plax-mmode.jpg',
        mimeType: 'image/jpeg',
        sha256: '1aeaf07e59ffeeb203f16c509a9c5a6c407687f717317707b26bd8672278c384',
        alt: 'A parasternal long-axis echocardiogram with an M-mode cursor sampling across the left ventricle.',
        modality: 'US',
        seriesLabel: 'Parasternal long-axis (M-mode)',
        width: 636,
        height: 434,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:PLAX Mmode.jpg (Kjetil Lenes)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:PLAX_Mmode.jpg',
        licenseEvidenceUrl: 'https://commons.wikimedia.org/wiki/File:PLAX_Mmode.jpg#Licensing',
        attribution: 'Kjetil Lenes (Commons user Ekko), Wikimedia Commons (public domain).',
        license: PD_SELF,
      },
      contentWarnings: WARN,
      neutralDescription:
        'A parasternal long-axis echocardiogram with an M-mode cursor sampling across the left ventricle.',
      teachingNotes: [
        'Draft note (not clinically reviewed): a parasternal long-axis echocardiogram with an M-mode left ventricular measurement.',
        'Do not derive numeric measurements unless pixel calibration is validated; one view cannot establish ejection fraction.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Echocardiography | M-mode', ...ACCENT },
      lesson: {
        objectives: [
          'Identify the parasternal long-axis view.',
          'Relate the M-mode cursor to left ventricular dimensions.',
          'Recognize measurement and foreshortening limitations.',
        ],
        clinicalCitations: [
          { id: 'ref-echocardiography', title: 'Background reading: Echocardiography', url: 'https://en.wikipedia.org/wiki/Echocardiography' },
        ],
      },
    },
    {
      id: 'us-echo-4chamber',
      title: 'Orienting an apical four-chamber view',
      vignette:
        'A learner receives an unlabeled four-chamber frame and must identify the atria, ventricles, apex, and image left and right before answering any question about pathology.',
      domain: 'ultrasound',
      difficulty: 'introductory',
      image: {
        src: '/images/ultrasound-pocus/us-echo-4chamber.jpg',
        mimeType: 'image/jpeg',
        sha256: '676abf601b5ed54a9a76cabeb4b2828a7b4fd46fb672b388366d783433ca1d4d',
        alt: 'A still four-chamber echocardiographic view with the apex directed toward the bottom of the image.',
        modality: 'US',
        seriesLabel: 'Apical four-chamber view',
        width: 636,
        height: 434,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:Echocardiogram 4chambers.jpg (Kjetil Lenes)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Echocardiogram_4chambers.jpg',
        licenseEvidenceUrl:
          'https://commons.wikimedia.org/wiki/File:Echocardiogram_4chambers.jpg#Licensing',
        attribution: 'Kjetil Lenes, Wikimedia Commons (public domain).',
        license: PD_SELF,
      },
      contentWarnings: WARN,
      neutralDescription:
        'A still four-chamber echocardiographic view with the apex directed toward the bottom of the image.',
      teachingNotes: [
        'Draft note (not clinically reviewed): a four-chamber echocardiographic view with the apex directed toward the bottom of the image.',
        'This is an orientation exercise, not a complete structural or functional examination.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Echocardiography', ...ACCENT },
      lesson: {
        objectives: [
          'Orient a four-chamber view and identify the chambers.',
          'Describe the relationships between the atria and ventricles.',
          'Explain why screen position is not identical to anatomic left and right.',
        ],
        clinicalCitations: [
          { id: 'ref-echocardiography', title: 'Background reading: Echocardiography', url: 'https://en.wikipedia.org/wiki/Echocardiography' },
        ],
      },
    },
    {
      id: 'us-echo-asd',
      title: 'A fixed split S2 in a young adult',
      vignette:
        'A young adult with a fixed split S2 has an echocardiographic frame showing a defect in the atrial septum. Connect the anatomy, shunt direction, and auscultation findings.',
      domain: 'ultrasound',
      difficulty: 'intermediate',
      image: {
        src: '/images/ultrasound-pocus/us-echo-asd.jpg',
        mimeType: 'image/jpeg',
        sha256: '99816c9f6b6410cbc047105e229ac0d8515ebd16c520a062e1362a1489367f64',
        alt: 'A still echocardiogram showing the atrial septum with a discontinuity in its mid portion.',
        modality: 'US',
        seriesLabel: 'Echocardiogram',
        width: 636,
        height: 434,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:Echokardiogram von Atriumseptumdefekt (Ostium secundum).jpg (Kjetil Lenes)',
        sourceUrl:
          'https://commons.wikimedia.org/wiki/File:Echokardiogram_von_Atriumseptumdefekt_%28Ostium_secundum%29.jpg',
        licenseEvidenceUrl:
          'https://commons.wikimedia.org/wiki/File:Echokardiogram_von_Atriumseptumdefekt_%28Ostium_secundum%29.jpg#Licensing',
        attribution: 'Kjetil Lenes (Commons user Ekko), Wikimedia Commons (public domain).',
        license: PD_SELF,
      },
      contentWarnings: WARN,
      neutralDescription:
        'A still echocardiogram showing the atrial septum with a discontinuity in its mid portion.',
      teachingNotes: [
        'Draft note (not clinically reviewed): the source identifies an ostium secundum atrial septal defect.',
        'Shunt magnitude, direction, and closure eligibility require Doppler and a full study.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Echocardiography', ...ACCENT },
      lesson: {
        objectives: [
          'Locate the atrial septum on the image.',
          'Explain left-to-right shunt physiology.',
          'Connect a chronic shunt to right-sided volume load.',
        ],
        clinicalCitations: [
          { id: 'ref-asd', title: 'Background reading: Atrial septal defect', url: 'https://en.wikipedia.org/wiki/Atrial_septal_defect' },
        ],
      },
    },
    {
      id: 'us-echo-vsd',
      title: 'A harsh holosystolic murmur in an infant',
      vignette:
        'An infant has poor feeding and a harsh holosystolic murmur. The frame shows a defect in the interventricular septum. Reason from the defect anatomy to the symptoms and expected hemodynamics.',
      domain: 'ultrasound',
      difficulty: 'intermediate',
      image: {
        src: '/images/ultrasound-pocus/us-echo-vsd.jpg',
        mimeType: 'image/jpeg',
        sha256: '6587b70a52c29da4d7dbeb48dd2c84a99460c95e0ffc641a848ef11104e8e26e',
        alt: 'A still echocardiogram showing the interventricular septum with a discontinuity.',
        modality: 'US',
        seriesLabel: 'Echocardiogram',
        width: 636,
        height: 434,
      },
      provenance: {
        sourceName: 'Wikimedia Commons, File:Ventricular Septal Defect.jpg (Kjetil Lenes)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Ventricular_Septal_Defect.jpg',
        licenseEvidenceUrl:
          'https://commons.wikimedia.org/wiki/File:Ventricular_Septal_Defect.jpg#Licensing',
        attribution: 'Kjetil Lenes, Wikimedia Commons (public domain).',
        license: PD_SELF,
      },
      contentWarnings: WARN,
      neutralDescription:
        'A still echocardiogram showing the interventricular septum with a discontinuity.',
      teachingNotes: [
        'Draft note (not clinically reviewed): the source identifies a ventricular septal defect.',
        'Defect size and clinical severity cannot be inferred reliably from this still alone.',
      ],
      deidentificationNotes: DEID,
      presentation: { subtitle: 'Echocardiography', ...ACCENT },
      lesson: {
        objectives: [
          'Locate the interventricular septum and the defect.',
          'Explain left-to-right shunting after pulmonary resistance falls.',
          'Distinguish defect anatomy from defect severity.',
        ],
        clinicalCitations: [
          { id: 'ref-vsd', title: 'Background reading: Ventricular septal defect', url: 'https://en.wikipedia.org/wiki/Ventricular_septal_defect' },
        ],
      },
    },
  ],
});
