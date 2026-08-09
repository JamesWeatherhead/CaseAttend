import type { LearnerLevel } from '../../constants';
import type { Domain } from './types';

const PATH_TIP = '*Tip: When you describe a finding to the AI, that description is called a **prompt**. A precise prompt gets a better response. For example: "irregular nests of cells with dense surrounding stroma" is a stronger prompt than "the pink area."*';

const SUGGESTIONS_NO_IMAGE: Record<LearnerLevel, string[]> = {
  highschool: ["What is histology?", "Why do scientists stain tissue pink and blue?"],
  undergrad: ["What is H&E staining and what does each color show?", "Review basic breast tissue architecture with me."],
  ms_preclinical: ["What are the histologic features that distinguish benign from malignant?", "Review normal breast glandular architecture with me."],
  ms_clinical: ["How should I systematically analyze an H&E slide for grading?", "What molecular markers will I need to order and why?"],
  resident: ["What is the grading system for invasive ductal carcinoma?", "Walk me through the Nottingham grading criteria."],
};

const SUGGESTIONS_WITH_IMAGE: Record<LearnerLevel, string[]> = {
  highschool: ["What am I looking at in this image?", "What do the different colors mean?"],
  undergrad: ["Describe the tissue architecture I can see.", "What cell types are visible here?"],
  ms_preclinical: ["Walk me through the histology I see in this field.", "What cellular features indicate this is abnormal?"],
  ms_clinical: ["What is the most important finding and how does it change management?", "What is the differential diagnosis for this pattern?"],
  resident: ["Describe the morphological features and their significance.", "What is the differential diagnosis for this pattern?"],
};

function welcomeMessage(level: LearnerLevel, _studyId?: string): string {
  if (level === 'highschool') {
    return `**Case: 62-year-old woman with a lump in her breast.**\n\nHer doctor felt a hard lump during an exam and ordered a biopsy, which means they took a tiny piece of the lump to look at under a microscope. You are looking at that tissue, stained with special dyes that turn cell nuclei blue/purple and the rest of the cell pink.\n\n${PATH_TIP}\n\n---\n\nYou are at low magnification (4x). Start by looking at the overall shape of the tissue. Does it look organized or chaotic?\n\n**What do you think normal breast tissue should look like compared to a tumor?**`;
  }
  if (level === 'undergrad') {
    return `**Case: 62-year-old female, palpable breast mass.**\n\nA core biopsy was performed on a suspicious breast mass. The tissue has been stained with H&E (hematoxylin and eosin): hematoxylin stains nuclei blue/purple, eosin stains cytoplasm and extracellular matrix pink.\n\n${PATH_TIP}\n\n---\n\nStart at 4x to see the tissue architecture. Look for areas where the normal glandular pattern is disrupted. Then move to 10x.\n\n**What is the difference between epithelial and stromal tissue, and which do you see more of here?**`;
  }
  if (level === 'resident') {
    return `**Case: 62F, R breast UOQ palpable mass. BI-RADS 5 spiculated lesion. US-guided core biopsy.**\n\nH&E sections at 4x, 10x, and 40x. Your job: identify the lesion, characterize the invasion pattern, and work through the Nottingham grading components (tubule formation, nuclear pleomorphism, mitotic count).\n\n${PATH_TIP}\n\n---\n\nSystematic approach: (1) 4x: architecture, tumor boundaries, stromal response. (2) 10x: growth pattern, invasion front. (3) 40x: nuclear detail, mitotic figures, grading.\n\n**What is your differential for a spiculated breast mass on a core biopsy, and what histologic features would you use to distinguish IDC-NST from invasive lobular carcinoma?**`;
  }
  if (level === 'ms_clinical') {
    return `**Case: 62-year-old female, breast mass biopsy.**\n\nPalpable mass in the upper outer quadrant of the right breast. Mammography: BI-RADS 5 spiculated mass. Core biopsy performed. H&E sections at 4x, 10x, and 40x.\n\n${PATH_TIP}\n\n---\n\nIdentify the lesion type and begin grading. Then think about the next steps in workup.\n\n**What is your histologic diagnosis? Walk me through the Nottingham grading components. What molecular markers (ER, PR, HER2, Ki-67) would you order, and how does each result change the treatment plan?**`;
  }
  return `**Case: 62-year-old female, breast mass biopsy.**\n\nPalpable mass in the upper outer quadrant of the right breast. Mammography showed an irregular spiculated mass. Core biopsy was performed. You are reviewing H&E stained sections at 4x, 10x, and 40x magnification.\n\n${PATH_TIP}\n\n---\n\nStart at 4x (low power). In pathology, you always scan at low power first to understand the tissue architecture before zooming in.\n\nDescribe what you see and press Send. The current view is included automatically.\n\n**What features on histology distinguish a benign breast lesion from a malignant one? What cellular changes indicate that cells have become cancerous?**`;
}

function getInitialSuggestions(level: LearnerLevel, hasImage: boolean, _studyId?: string): string[] {
  return (hasImage ? SUGGESTIONS_WITH_IMAGE : SUGGESTIONS_NO_IMAGE)[level] || [];
}

export const pathology: Domain = {
  key: 'pathology',
  label: 'Pathology',
  artifactHints: {
    showWindowLevel: false,
    showSeriesSelector: true,
    showSegmentation: true,
  },
  welcomeMessage,
  getInitialSuggestions,
  contextLabel: () => 'Digital Pathology (H&E Histology)',
  captureLabel: () => 'Histology',
};
