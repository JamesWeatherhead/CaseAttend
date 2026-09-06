import type { LearnerLevel } from '../../constants';
import type { Domain } from './types';

const DERM_TIP = '*Tip: Clinical photographs are not flipped like radiographs. When you describe a finding to the AI, that description is called a **prompt**. A precise prompt gets a better response. For example: "asymmetric dark macule with irregular border and two shades of brown" is a stronger prompt than "the dark spot."*';

const SUGGESTIONS_NO_IMAGE: Record<LearnerLevel, string[]> = {
  highschool: ["What is a mole and when is it dangerous?", "Why do doctors look at skin lesions so carefully?"],
  undergrad: ["What is the ABCDE rule for skin lesions?", "What are the most common types of skin cancer?"],
  ms_preclinical: ["Walk me through the ABCDE features I should identify.", "What layers of the skin are involved in different lesion types?"],
  ms_clinical: ["What is my differential for a new pigmented lesion?", "When would you biopsy vs. observe a skin lesion?"],
  ms_step2: ["What is my differential for a new pigmented lesion?", "When would you biopsy vs. observe a skin lesion?"],
  resident: ["What are the biopsy techniques and when to use each?", "How do you counsel a patient about a suspicious pigmented lesion?"],
};

const SUGGESTIONS_WITH_IMAGE: Record<LearnerLevel, string[]> = {
  highschool: ["What am I looking at on this skin?", "Does this look like a healthy mole or something to worry about?"],
  undergrad: ["What ABCDE features do I see on this lesion?", "How would I describe this to a doctor?"],
  ms_preclinical: ["Walk me through the ABCDE assessment for this lesion.", "What is the primary lesion morphology I see?"],
  ms_clinical: ["What is my differential based on this lesion's features?", "What is the appropriate biopsy technique for this lesion?"],
  ms_step2: ["What is my differential based on this lesion's features?", "What is the appropriate biopsy technique for this lesion?"],
  resident: ["Describe the lesion's key discriminating features.", "What is the differential and my recommended next step?"],
};

const CASE_WELCOMES: Record<string, Record<LearnerLevel, string>> = {
  'derm-melanoma': {
    highschool: `**Case: 55-year-old man notices a dark spot on his back that has changed over the last year.**\n\nHis partner pointed it out. It has been getting bigger and the color looks uneven. He came in worried it might be dangerous.\n\n${DERM_TIP}\n\nLook carefully at the lesion. Does it look like the same color all the way through? Are the edges smooth like a circle, or bumpy and uneven?\n\n**What features do you notice about this dark spot on the skin?**`,
    undergrad: `**Case: 55-year-old male, pigmented lesion on the back, evolving over 12 months.**\n\nHis partner noticed the lesion was changing. On history: gradual enlargement, darkening, and irregular border development.\n\n${DERM_TIP}\n\nApply the ABCDE rule as you look at the lesion:\n- **A**symmetry: does one half match the other?\n- **B**order: is it smooth or irregular?\n- **C**olor: uniform or variegated?\n- **D**iameter: larger than 6 mm?\n- **E**volution: changing over time?\n\n**What ABCDE features are you noticing, and which do you think are most concerning?**`,
    ms_preclinical: `**Case: 55-year-old male, evolving pigmented lesion on the upper back x 12 months.**\n\nPartner-noticed change. History: gradual enlargement, asymmetric darkening. No bleeding, no itch. Fair skin (Fitzpatrick II), history of significant sun exposure in his twenties. No personal or family history of skin cancer.\n\n${DERM_TIP}\n\nSystematic dermatologic exam:\n1. Describe the primary lesion (macule, papule, nodule, plaque).\n2. Apply ABCDE for pigmented lesions.\n3. Compare with the patient's other nevi (the "ugly duckling" sign).\n4. Palpate for induration, surface changes.\n\n**Walk me through your ABCDE assessment. Given fair skin, sun exposure, and evolution over a year, what is the pathophysiologic concern? What is the difference between a benign melanocytic nevus and melanoma at the cellular level?**`,
    ms_clinical: `**Case: 55-year-old male, evolving pigmented lesion on the upper back x 12 months. Fitzpatrick II, significant historical sun exposure.**\n\nPartner-noticed change. Gradual enlargement, asymmetric darkening. No bleeding, no itch. No personal or family history of skin cancer.\n\n${DERM_TIP}\n\nDescribe the lesion, apply ABCDE, then decide on management.\n\n**What are your top three differential diagnoses for this pigmented lesion? What biopsy technique would you use here (shave, punch, excisional) and why? If the biopsy confirms your top diagnosis, what determines the definitive surgical margin?**`,
    ms_step2: `**Case: 55-year-old male, evolving pigmented lesion on the upper back x 12 months. Fitzpatrick II, significant historical sun exposure.**\n\nPartner-noticed change. Gradual enlargement, asymmetric darkening. No bleeding, no itch. No personal or family history of skin cancer.\n\n${DERM_TIP}\n\nDescribe the lesion, apply ABCDE, then decide on management.\n\n**What are your top three differential diagnoses for this pigmented lesion? What biopsy technique would you use here (shave, punch, excisional) and why? If the biopsy confirms your top diagnosis, what determines the definitive surgical margin?**`,
    resident: `**Case: 55M, evolving pigmented lesion, upper back, 12-month evolution. Fitzpatrick II, cumulative UV exposure. No personal or family history of melanoma. Full-body skin exam otherwise unremarkable, no palpable lymphadenopathy.**\n\n${DERM_TIP}\n\nDemonstration case: known melanoma (confirmed on excisional biopsy). Use it to work through complete staging and management.\n\n**Describe the lesion's dermoscopic and clinical features. What biopsy technique is preferred for a suspected melanoma and why is shave biopsy contraindicated? Assume histopathology returns melanoma, Breslow depth 1.4 mm, no ulceration, mitotic rate 2/mm². What is the T stage per AJCC 8th edition? What are the surgical margins per NCCN, and when is sentinel lymph node biopsy indicated?**`,
  },
  'derm-bcc': {
    highschool: `**Case: 72-year-old man with a slow-growing bump on his nose that sometimes bleeds when he shaves.**\n\nHe has been outside a lot in his life, working construction. The bump has been there for about two years and has slowly gotten bigger.\n\n${DERM_TIP}\n\nLook at the bump carefully. What color is it? Is the surface smooth and shiny, or rough and crusty? Do you see any tiny blood vessels on it?\n\n**Describe what you see. What might a bump like this be made of?**`,
    undergrad: `**Case: 72-year-old male, slow-growing lesion on the nose, occasional bleeding with shaving.**\n\nSignificant chronic sun exposure history. The lesion has enlarged gradually over two years.\n\n${DERM_TIP}\n\nFor nodular lesions in sun-exposed skin, look for:\n- Pearly, translucent, or shiny surface\n- Telangiectasias (small visible blood vessels) crossing the lesion\n- Rolled borders\n- Central ulceration or crusting\n- Slow growth pattern\n\n**Describe the lesion. Which of these features are present, and why does chronic sun exposure predispose to this type of growth?**`,
    ms_preclinical: `**Case: 72-year-old male, 2-year evolution of a lesion on the nasal tip. History of chronic occupational UV exposure. Occasional bleeding with minor trauma. No pain, no rapid growth.**\n\n${DERM_TIP}\n\nSystematic approach for nodular skin lesions:\n1. Primary morphology (papule vs. nodule; surface: pearly, verrucous, keratotic, ulcerated).\n2. Vascular features (telangiectasias, arborizing vessels).\n3. Borders (rolled, indistinct, sharply demarcated).\n4. Pigmentation (present or absent).\n5. Location and its epidemiologic significance.\n\n**Describe the lesion using this framework. What is the pathophysiology behind chronic UV-induced skin cancer? What is the histologic layer of origin for the most common skin cancer, and why does it rarely metastasize despite being locally destructive?**`,
    ms_clinical: `**Case: 72M, 2-year slow-growing nasal lesion with occasional bleeding. Chronic UV exposure history.**\n\n${DERM_TIP}\n\nIdentify the lesion, then plan management.\n\n**What is your differential (basal cell carcinoma, squamous cell carcinoma, amelanotic melanoma, sebaceous hyperplasia)? What features on this lesion favor your top diagnosis? Compare biopsy techniques (shave vs. punch) for a suspected non-melanoma skin cancer. If biopsy confirms your diagnosis, when is Mohs surgery indicated versus standard excision?**`,
    ms_step2: `**Case: 72M, 2-year slow-growing nasal lesion with occasional bleeding. Chronic UV exposure history.**\n\n${DERM_TIP}\n\nIdentify the lesion, then plan management.\n\n**What is your differential (basal cell carcinoma, squamous cell carcinoma, amelanotic melanoma, sebaceous hyperplasia)? What features on this lesion favor your top diagnosis? Compare biopsy techniques (shave vs. punch) for a suspected non-melanoma skin cancer. If biopsy confirms your diagnosis, when is Mohs surgery indicated versus standard excision?**`,
    resident: `**Case: 72M, 2-year evolution nasal-tip lesion, chronic actinic damage, occasional traumatic bleeding. Fitzpatrick II.**\n\n${DERM_TIP}\n\nDemonstration case: known basal cell carcinoma, nodular subtype. Use it to work through subtyping and surgical planning.\n\n**Describe the clinical features and place them in the context of BCC subtypes (nodular, superficial, morpheaform, pigmented, basosquamous). This is a nasal-tip lesion: apply the Mohs Appropriate Use Criteria. What are the H-zone considerations for facial BCC and how do they change your management? Discuss reconstructive options if a Mohs defect requires closure at the nasal tip.**`,
  },
  'derm-sebk': {
    highschool: `**Case: 65-year-old woman with several brown, waxy-looking spots on her back that she has had for years.**\n\nShe is worried because her friend was recently diagnosed with skin cancer. The spots do not hurt or itch, and they have not changed much.\n\n${DERM_TIP}\n\nLook at the surface of these spots. Do they look like they are sitting on top of the skin, or growing into it? Is the surface smooth, or does it look rough and warty?\n\n**Describe what you see. Do they look worrying, or do they look like a common harmless skin change?**`,
    undergrad: `**Case: 65-year-old female, long-standing brown lesions on the trunk. No symptoms, no recent change.**\n\nMultiple similar lesions present. She is concerned after learning a friend has skin cancer.\n\n${DERM_TIP}\n\nFor pigmented lesions in older patients, contrast the features that suggest a benign entity like seborrheic keratosis:\n- "Stuck-on" appearance (looks pasted onto the skin)\n- Waxy, verrucous, or warty surface\n- Well-demarcated, often multiple\n- Uniform tan-to-brown color\n- No evolution\n\nWith the features that suggest melanoma (ABCDE). Recognizing benign look-alikes is a core dermatology skill.\n\n**Which features here point toward a benign process? Why is this pattern common in older adults, and what is the underlying cellular process?**`,
    ms_preclinical: `**Case: 65-year-old female, multiple long-standing pigmented lesions on the trunk. No evolution, no symptoms. Concerned after a friend's skin cancer diagnosis.**\n\n${DERM_TIP}\n\nSystematic differential:\n- **Seborrheic keratosis** (benign, epidermal proliferation of keratinocytes)\n- **Melanocytic nevus** (benign, melanocytic)\n- **Solar lentigo** (benign, flat, sun-related)\n- **Melanoma** (malignant)\n- **Pigmented BCC** (rare but possible mimic)\n\n**Apply the ABCDE rule to this lesion and describe what argues against melanoma. What is the histologic hallmark of a seborrheic keratosis (horn cysts, hyperkeratosis, acanthosis of basaloid cells)? Why is this considered a "benign epidermal tumor" rather than a nevus?**`,
    ms_clinical: `**Case: 65F, multiple long-standing waxy pigmented lesions on the trunk. No change. She is anxious about skin cancer.**\n\n${DERM_TIP}\n\nIdentify the lesion, then decide on management and counseling.\n\n**What is your top diagnosis and what are the discriminating features from melanoma? When would you biopsy a suspected seborrheic keratosis (atypical features, sudden change, "sign of Leser-Trélat")? How do you counsel this patient about self-monitoring and when to return for reassessment?**`,
    ms_step2: `**Case: 65F, multiple long-standing waxy pigmented lesions on the trunk. No change. She is anxious about skin cancer.**\n\n${DERM_TIP}\n\nIdentify the lesion, then decide on management and counseling.\n\n**What is your top diagnosis and what are the discriminating features from melanoma? When would you biopsy a suspected seborrheic keratosis (atypical features, sudden change, "sign of Leser-Trélat")? How do you counsel this patient about self-monitoring and when to return for reassessment?**`,
    resident: `**Case: 65F, multiple stable pigmented lesions on the trunk, present for years, waxy stuck-on appearance. Full skin exam otherwise unremarkable. Concerned about melanoma after a friend's diagnosis.**\n\n${DERM_TIP}\n\nDemonstration case: known seborrheic keratosis. Use it to work through recognition and patient counseling for a common benign look-alike.\n\n**Walk through the discriminating dermoscopic features of SK (milia-like cysts, comedo-like openings, fissures and ridges, sharp demarcation) versus melanoma. When does the "sign of Leser-Trélat" become clinically important, and what is the evidence for its association with internal malignancy? How do you approach a patient with high-anxiety multiple SKs: education vs. destruction (cryotherapy, curettage, electrodesiccation), and what are the trade-offs?**`,
  },
};

function welcomeMessage(level: LearnerLevel, studyId?: string): string {
  if (studyId && CASE_WELCOMES[studyId]) {
    return CASE_WELCOMES[studyId][level] || CASE_WELCOMES[studyId].ms_preclinical;
  }
  return `**Welcome to a dermatology case.**\n\n${DERM_TIP}\n\nDescribe the lesion using the ABCDE framework, then build your differential.\n\n**What primary morphology and features do you notice on this lesion?**`;
}

function getInitialSuggestions(level: LearnerLevel, hasImage: boolean, _studyId?: string): string[] {
  return (hasImage ? SUGGESTIONS_WITH_IMAGE : SUGGESTIONS_NO_IMAGE)[level] || [];
}

export const dermatology: Domain = {
  key: 'dermatology',
  label: 'Dermatology',
  artifactHints: {
    showWindowLevel: false,
    showSeriesSelector: false,
    showSegmentation: true,
  },
  welcomeMessage,
  getInitialSuggestions,
  contextLabel: () => 'Dermatology (clinical photograph)',
  captureLabel: () => 'Skin photo',
};
