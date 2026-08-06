
import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Globe, BrainCircuit, X, Camera, ImageIcon, Trash2, CheckCircle2, AlertTriangle, RotateCcw, ArrowDown, HelpCircle, KeyRound } from 'lucide-react';
import { streamChatResponse, preAnalyzeSlice, AiMode, AIProvider } from '../services/aiClient';
import { hasKey, getModel, modelLabel, BYOK_CHANGED_EVENT } from '../services/byokStore';
import ConnectKeyModal from './ConnectKeyModal';
import { ChatMessage, CursorContext, AiPointer } from '../types';
import { MarkdownText } from '../utils/markdownUtils';
import { LearnerLevel, LEARNER_LEVELS } from '../constants';

interface AiAssistantPanelProps {
  // Capture props lifted to parent
  capturedImage: string | null;
  capturedSliceMetadata: { slice: number; total?: number; label?: string } | null;
  onCaptureTrigger: () => void;
  onClearCapture: () => void;
  showCaptureToast: boolean;

  studyMetadata?: {
    studyId: string;
    patientName: string;
    description: string;
    modality: string;
  };
  cursor?: CursorContext;
  onJumpToSlice?: (index: number) => void;
  activeSeriesInfo?: {
    description: string;
    instanceCount: number;
  };
  onStartTour?: () => void;
  onPointers?: (pointers: AiPointer[]) => void;
}

// Modality-aware static suggestions
const RADIOLOGY_SUGGESTIONS_NO_IMAGE: Record<LearnerLevel, string[]> = {
  highschool: ["What is MRI?", "What can brain scans show us?"],
  undergrad: ["What are the different MRI sequences and why do we use them?", "What should I know about this patient's history before looking at the images?"],
  ms_preclinical: ["Walk me through the anatomy I should know for this case.", "What sequences should I look at first and what does each one show?"],
  ms_clinical: ["Walk me through how to approach this case systematically.", "Given the clinical history, what is my differential before looking at imaging?"],
  resident: ["Given AFib and memory decline, what findings am I looking for?", "How do I distinguish chronic from acute infarct on MRI?"],
};

const PATHOLOGY_SUGGESTIONS_NO_IMAGE: Record<LearnerLevel, string[]> = {
  highschool: ["What is histology?", "Why do scientists stain tissue pink and blue?"],
  undergrad: ["What is H&E staining and what does each color show?", "Review basic breast tissue architecture with me."],
  ms_preclinical: ["What are the histologic features that distinguish benign from malignant?", "Review normal breast glandular architecture with me."],
  ms_clinical: ["How should I systematically analyze an H&E slide for grading?", "What molecular markers will I need to order and why?"],
  resident: ["What is the grading system for invasive ductal carcinoma?", "Walk me through the Nottingham grading criteria."],
};

const RADIOLOGY_SUGGESTIONS_WITH_IMAGE: Record<LearnerLevel, string[]> = {
  highschool: ["What am I looking at in this brain scan?", "Is anything unusual here?"],
  undergrad: ["What structures can I identify on this slice?", "What should look different if something is wrong?"],
  ms_preclinical: ["What anatomy do I see on this slice?", "What is the pathophysiology behind this finding?"],
  ms_clinical: ["What findings do I see and what is my differential?", "How does this sequence help me distinguish acute from chronic?"],
  resident: ["I think I see a finding — let me describe it.", "Compare this slice across sequences for me."],
};

const PATHOLOGY_SUGGESTIONS_WITH_IMAGE: Record<LearnerLevel, string[]> = {
  highschool: ["What am I looking at in this image?", "What do the different colors mean?"],
  undergrad: ["Describe the tissue architecture I can see.", "What cell types are visible here?"],
  ms_preclinical: ["Walk me through the histology I see in this field.", "What cellular features indicate this is abnormal?"],
  ms_clinical: ["What is the most important finding and how does it change management?", "What is the differential diagnosis for this pattern?"],
  resident: ["Describe the morphological features and their significance.", "What is the differential diagnosis for this pattern?"],
};

// ── CXR Case-Specific Welcome Messages ─────────────────────────────────
// Content sourced from case spec files with all review corrections applied.

const CXR_TIP = '*Tip: In radiology, images are flipped like you\'re facing the patient. Left side of the image = patient\'s right. When you describe a finding to the AI, that description is called a **prompt**. A precise prompt gets a better response. For example: "opacity in the patient\'s right lower lobe" is a stronger prompt than "the white area."*';

const CT_TIP = '*Tip: On CT, bright white = dense (blood, bone, contrast). Dark = air or fluid. Unlike X-rays, CT images are NOT flipped, so left on the screen is the patient\'s left. When you describe a finding to the AI, that description is called a **prompt**. A precise prompt gets a better response. For example: "hyperdense collection in the left epidural space with midline shift" is a stronger prompt than "the white area."*';

const CXR_WELCOME_MESSAGES: Record<string, Record<LearnerLevel, string>> = {
  'cxr-pneumothorax': {
    highschool: `**A 21-year-old man came to the emergency room because he suddenly felt a sharp pain in his chest and had trouble breathing.**\n\nAn X-ray is a type of medical image that uses a small amount of radiation to take a picture of the inside of your body. On a chest X-ray, bones appear bright white, air appears black, and soft tissues appear in shades of gray. The lungs are normally filled with air, so they look dark on both sides of the chest.\n\n*Tip: You can ask me to explain anything in simpler terms. Try saying "What does that mean?" whenever something is unclear.*\n\nTake a close look at the image. Compare the left side and the right side of the chest.\n\n**Can you spot any difference between the left side and the right side of the image?**`,
    undergrad: `**A 21-year-old male presents to the ED with acute-onset left-sided chest pain and dyspnea. No prior medical history. A PA chest radiograph was obtained.**\n\nOn a normal chest X-ray, both lung fields should appear symmetrically dark because they are filled with air. You should see branching pulmonary vessels extending from the hila toward the periphery. The mediastinum (containing the heart, great vessels, trachea, and esophagus) should be roughly midline.\n\n*Tip: Describe exactly what you see before jumping to a diagnosis. Saying "I notice X on the left but not on the right" trains your observational skills.*\n\nLook carefully at both lung fields. Pay attention to lung markings, the position of the heart and trachea, and any asymmetry.\n\n**What differences do you notice between the left and right hemithoraces?**`,
    ms_preclinical: `**A 21-year-old male with no significant PMH presents to the ED with sudden-onset left-sided pleuritic chest pain and progressive dyspnea. He is tall and thin (BMI 19). Vitals: HR 118, BP 102/68, RR 28, SpO2 91% on room air. Breath sounds markedly diminished on the left. Trachea may be deviated. A PA chest radiograph was obtained.**\n\n*Tip: Build your differential first, then use the imaging to narrow it.*\n\nThis presentation combines sudden pleuritic chest pain, dyspnea, tachycardia, hypoxia, and unilateral diminished breath sounds in a young, tall, thin male.\n\n**Describe what you see on the CXR. What pathophysiological mechanism could cause air to accumulate in the pleural space? What would happen to intrapleural pressure, and how does that explain the physical exam findings?**`,
    ms_clinical: `**A 21-year-old male with no significant PMH presents to the ED with sudden-onset left-sided pleuritic chest pain and progressive dyspnea. He is tall and thin (BMI 19). Vitals: HR 118, BP 102/68, RR 28, SpO2 91% on room air. Breath sounds markedly diminished on the left. Trachea may be deviated. A PA chest radiograph was obtained.**\n\n*Tip: Build your differential first, then use the imaging to narrow it.*\n\nThis presentation combines sudden pleuritic chest pain, dyspnea, tachycardia, hypoxia, and unilateral diminished breath sounds in a young, tall, thin male.\n\n**What is your differential for acute-onset dyspnea with pleuritic chest pain in a young male? Based on the imaging, what is the diagnosis, and what is your immediate management plan?**`,
    resident: `**EMS brings in a 21-year-old male, no PMH, in moderate-to-severe respiratory distress. Onset 2 hours prior. Tall, asthenic habitus (6'2", 145 lbs). Vitals: HR 124, BP 94/62, RR 32, SpO2 88% on 15L NRB. JVD present. Trachea deviated right. Left hemithorax hyperresonant. Breath sounds absent left. A portable PA chest radiograph was obtained.**\n\nNote: In a real scenario with these vitals and exam findings, obtaining imaging before decompression would be a management error. This X-ray is available for educational purposes only.\n\n*Tip: Walk me through your decision-making in real time. I will push back if your reasoning has a gap.*\n\n**Is this a needle-decompression-first or chest-tube-first scenario? Walk me through your ATLS algorithm, including anatomical landmarks. ATLS 10th edition changed the primary needle decompression site to 4th/5th ICS at the AAL; how does this compare to the traditional 2nd ICS MCL?**`,
  },
  'cxr-pneumonia': {
    highschool: `**Case: 67-year-old man with a bad cough and fever.**\n\nFor the past 3 days he has had a cough that brings up thick yellow-green mucus, a temperature of 101.5 F, and chills. His doctor ordered a chest X-ray.\n\n*Tip: Be specific when describing what you see. "White area in the right lung" is a stronger description than "something looks wrong."*\n\nYou are looking at a chest X-ray. Healthy lungs should look mostly dark because they are full of air. Bones look white. The heart sits in the middle.\n\nLook at both lungs. Does one side look different from the other? Is there an area that looks whiter or cloudier than the rest?\n\n**What do you think happens to the lungs when someone gets pneumonia?**`,
    undergrad: `**Case: 67-year-old male, productive cough and fever x 3 days.**\n\nPresenting with purulent sputum, fever (38.6 C / 101.5 F), and rigors. Former smoker with COPD. Nasopharyngeal culture grew Moraxella catarrhalis. PA chest X-ray obtained.\n\n*Tip: "Dense opacity in the right middle lung zone with a sharp inferior border" is more useful than "something white on the right."*\n\nYou are viewing a PA chest X-ray. The lungs have 5 lobes: 3 on the right (upper, middle, lower) and 2 on the left (upper, lower). On a frontal view the lobes overlap, but certain signs help localize findings.\n\nCompare the density of right and left lungs. Pay attention to whether any area looks opacified and whether the heart border or diaphragm outline is affected.\n\n**What is the difference between consolidation and atelectasis, and how might you tell them apart on this X-ray?**`,
    ms_preclinical: `**Case: 67M, productive cough, fever, rigors x 3 days.**\n\nPMH: COPD, 30 pack-year history (quit 5 years ago). Vitals: T 38.6 C, HR 98, BP 135/82, RR 22, SpO2 93% RA. Exam: decreased breath sounds and bronchial breathing over right anterior chest; dullness to percussion. WBC 15,200 with left shift. NP culture: Moraxella catarrhalis. PA CXR obtained.\n\n*Tip: Use radiologic language. "Dense opacity obscuring the right heart border" gets a more precise teaching response.*\n\nSystematic approach: (1) Technical quality. (2) Mediastinal contours and hilae. (3) Each lung zone. (4) Costophrenic angles and retrocardiac space. (5) Bones and soft tissues.\n\nFocus on the right lung. Identify the abnormality and determine which lobe is involved using the silhouette sign.\n\n**What is the silhouette sign and how does it help you localize this finding? What is the pathophysiology of lobar consolidation, and what are the 4 classic histologic stages?**`,
    ms_clinical: `**Case: 67M, productive cough, fever, rigors x 3 days.**\n\nPMH: COPD, 30 pack-year history (quit 5 years ago). Vitals: T 38.6 C, HR 98, BP 135/82, RR 22, SpO2 93% RA. Exam: decreased breath sounds and bronchial breathing over right anterior chest; dullness to percussion. WBC 15,200 with left shift. NP culture: Moraxella catarrhalis. PA CXR obtained.\n\n*Tip: Use radiologic language. "Dense opacity obscuring the right heart border" gets a more precise teaching response.*\n\nIdentify the finding, localize it, then shift to management.\n\n**Based on age, comorbidities, and the cultured organism, would you classify this as "typical" or "atypical" pneumonia? Calculate the CURB-65 score. What is your empiric antibiotic regimen per ATS/IDSA guidelines?**`,
    resident: `**Case: 67M, ED presentation. CC: productive cough, fever, dyspnea x 3 days.**\n\nPMH: COPD (FEV1 55%), 30 pack-year (quit 5 yrs), HTN, pre-diabetes. Vitals: T 38.6 C, HR 98, BP 135/82, RR 22, SpO2 93% RA. Exam: bronchial breath sounds RML, egophony, dullness to percussion. Labs: WBC 15.2 (left shift), procalcitonin 2.4 ng/mL. Sputum Gram stain: gram-negative diplococci. NP culture: Moraxella catarrhalis. PA CXR obtained.\n\n*Tip: Frame questions like an oral board case. The AI will respond at attending-level depth.*\n\nAfter your interpretation, work through: (1) CURB-65 and PSI/PORT score. (2) Disposition. (3) Empiric antibiotics per ATS/IDSA 2019 guidelines. (4) Parapneumonic effusion risk. (5) Treatment failure criteria.\n\n**Given Moraxella catarrhalis (a universal beta-lactamase producer), how does this affect your empiric regimen? When would you de-escalate to targeted therapy?**`,
  },
  'cxr-chf': {
    highschool: `**Welcome to your case.**\n\n**A 68-year-old man comes to the emergency room because he cannot catch his breath. Over the past few days his breathing has gotten worse, especially when he lies down. He has had to sleep sitting up.**\n\nThe heart is a pump. When it becomes too weak to pump effectively, blood backs up into the lungs like a traffic jam. Fluid leaks into the air sacs, making it very hard to breathe.\n\n*Tip: You can ask me to explain anything in simpler terms. There are no wrong questions.*\n\nOn a normal X-ray, the lungs should look mostly dark because they are full of air. The heart sits in the middle as a white shape.\n\n**Can you see anything different about the size of the heart? And do the lungs look clear and dark, or hazy and white?**`,
    undergrad: `**Welcome to your case.**\n\n**A 68-year-old male with hypertension and type 2 diabetes presents with progressive dyspnea over 5 days, orthopnea, and bilateral lower extremity edema. Last night he experienced paroxysmal nocturnal dyspnea. Vitals: HR 110, BP 168/94, RR 28, SpO2 89% RA. PA chest radiograph obtained.**\n\n*Tip: Be specific. "The blood vessels at the top of the lungs look bigger than the ones at the bottom" is much more useful than "something looks weird."*\n\nNormally, blood flow follows gravity: in an upright patient, vessels at the bases are larger than those at the apices. When the left ventricle fails, pressure builds in the pulmonary veins and fluid leaks into the tissue.\n\nLook at the heart size, upper vs. lower lung vessels, and the costophrenic angles.\n\n**What do you notice about the relative size of blood vessels at the top vs. bottom of the lungs? What could cause this reversal?**`,
    ms_preclinical: `**Welcome to your case.**\n\n**A 68-year-old male with PMH of HTN, T2DM, and known HFrEF (EF 30%) presents with 5 days of progressive dyspnea, now dyspneic at rest. 3-pillow orthopnea, 2 episodes of PND this week. Ran out of furosemide 10 days ago. Exam: JVD, bibasilar crackles, S3 gallop, 2+ pitting edema. Vitals: HR 110, BP 168/94, RR 28, SpO2 89% RA. BNP 1,840 pg/mL. PA CXR obtained.**\n\n*Tip: Describe every finding before synthesizing. Use the ABCDE mnemonic: Alveolar edema, Kerley B lines, Cardiomegaly, Dilated upper lobe vessels, Effusions.*\n\nThis case is high-yield for Starling forces and the pathophysiology of pulmonary edema.\n\n**Walk me through every radiographic finding you can identify. Then explain the pathophysiologic sequence: how does elevated LVEDP lead to each finding you see on the CXR?**`,
    ms_clinical: `**Welcome to your case.**\n\n**A 68-year-old male with PMH of HTN, T2DM, and known HFrEF (EF 30%) presents with 5 days of progressive dyspnea, now dyspneic at rest. 3-pillow orthopnea, 2 episodes of PND this week. Ran out of furosemide 10 days ago. Exam: JVD, bibasilar crackles, S3 gallop, 2+ pitting edema. Vitals: HR 110, BP 168/94, RR 28, SpO2 89% RA. BNP 1,840 pg/mL. PA CXR obtained.**\n\n*Tip: Describe every finding before synthesizing. Use the ABCDE mnemonic: Alveolar edema, Kerley B lines, Cardiomegaly, Dilated upper lobe vessels, Effusions.*\n\nIdentify the findings, then shift to acute management.\n\n**What is the BNP telling you and how does it fit the clinical picture? Walk me through your initial management: oxygen strategy, diuretic regimen, and when you would consider NIPPV vs. intubation.**`,
    resident: `**Welcome to your case.**\n\n**A 68-year-old male with HFrEF (EF 30%, ischemic CMP s/p LAD stent), HTN, T2DM, CKD 3a, AFib (rate-controlled on metoprolol) presents via EMS in acute respiratory distress. Ran out of furosemide 10 days ago. Vitals: HR 118 (irreg irreg), BP 178/102, RR 32, SpO2 85% on 15L NRB. BNP 1,840. Bedside echo: EF 20-25%, moderate MR, RVSP 55. PA CXR obtained.**\n\nNIPPV has Class IIa evidence (not Class I) for reducing intubation rates per 2022 AHA/ACC guidelines.\n\n*Tip: Treat this like oral boards. Walk me through your first 30 minutes.*\n\nClassify this patient's Stevenson profile (Wet = PCWP >= 18; Cold = CI < 2.2 L/min/m2).\n\n**What is this patient's Stevenson profile? Walk me through your acute management: oxygen strategy, IV diuretic regimen, vasodilator candidacy, and your threshold for inotropic support.**`,
  },
  'cxr-effusion': {
    highschool: `**Welcome to your case.**\n\n**A 58-year-old man comes to the emergency room because he can barely breathe. He has been getting more and more short of breath over the past three weeks, and now he can only walk a few steps. He has also lost 15 pounds without trying.**\n\n*Tip: You can ask me anything. If I use a word you do not know, just say "what does that mean?"*\n\nA normal chest X-ray should look mostly dark on both sides, because the lungs are full of air.\n\nNotice that one side of this X-ray looks completely different from the other. One side is almost entirely white.\n\n**Which side looks abnormal, and what do you think might be filling that space to make it white instead of black?**`,
    undergrad: `**Welcome to your case.**\n\n**A 58-year-old male presents with 3 weeks of progressive dyspnea on exertion, now dyspneic at rest. He reports 15-pound unintentional weight loss over 2 months. 40-pack-year smoking history. Vitals: HR 105, RR 24, SpO2 91% RA. Breath sounds absent over the entire left hemithorax. PA chest radiograph obtained.**\n\n*Tip: Describe what you see in your own words before asking me to explain.*\n\nRemember the pleural space: the thin potential space between the visceral pleura (covering the lung) and the parietal pleura (lining the chest wall). Normally it contains only a few milliliters of fluid.\n\n**One hemithorax is completely opacified. What could accumulate in the pleural space to cause this, and can you think of reasons the fluid might be protein-poor (transudate) versus protein-rich (exudate)?**`,
    ms_preclinical: `**Welcome to your case.**\n\n**A 58-year-old male with a 40-pack-year smoking history presents with progressive dyspnea over 3 weeks. 15-pound weight loss, nonproductive cough, dull left chest pain. Vitals: T 37.2C, HR 105, BP 128/82, RR 24, SpO2 91% RA. Exam: tracheal deviation to the right, absent breath sounds and dullness to percussion over the entire left hemithorax, decreased tactile fremitus. PA CXR obtained.**\n\n*Tip: Talk through your reasoning. Do not just name the finding; tell me WHY.*\n\nRead systematically: airway, bones, cardiac silhouette, diaphragm, everything else.\n\n**Describe the radiographic findings. What is the anatomy of the pleural space, and what pathophysiologic mechanisms cause fluid to accumulate there? Walk me through Light's criteria: the three parameters and their cutoffs.**`,
    ms_clinical: `**Welcome to your case.**\n\n**A 58-year-old male with a 40-pack-year smoking history presents with progressive dyspnea over 3 weeks. 15-pound weight loss, nonproductive cough, dull left chest pain. Vitals: T 37.2C, HR 105, BP 128/82, RR 24, SpO2 91% RA. Exam: tracheal deviation to the right, absent breath sounds and dullness to percussion over the entire left hemithorax, decreased tactile fremitus. PA CXR obtained.**\n\n*Tip: Talk through your reasoning. Do not just name the finding; tell me what it changes about management.*\n\nIdentify the findings, classify the effusion, then plan your workup.\n\n**Given the smoking history and weight loss, what is at the top of your differential? After confirming a large pleural effusion, what are the next diagnostic steps and how would the fluid analysis guide your management?**`,
    resident: `**Welcome to your case.**\n\n**A 58-year-old male with NSCLC (left upper lobe adenocarcinoma, stage IVA, EGFR wild-type, PD-L1 TPS 60%) presents with progressive dyspnea despite 4L O2 at home. Completed cycle 1 of carboplatin/pemetrexed plus pembrolizumab 3 weeks ago. Pleural fluid: LDH 340 (serum 220), protein 5.8 (serum 7.2), glucose 45, pH 7.28. Prior cytology: adenocarcinoma cells. PA CXR obtained.**\n\n*Tip: I will challenge your management decisions. Defend your plan and anticipate complications.*\n\nTalc pleurodesis success rate is approximately 80-95% in published series (not 70-80%). For asymptomatic MPE, the ATS guideline recommends observation only.\n\n**This patient has a known malignant effusion with symptomatic recurrence. What are your management options (large-volume thoracentesis vs. pleurodesis vs. IPC), and what factors in this patient influence your choice?**`,
  },
  'axr-sbo': {
    highschool: `**A 45-year-old woman comes to the emergency room with terrible belly pain. For the last 2 days, her stomach has been getting more and more swollen and painful. She has been throwing up and has not been able to go to the bathroom.**\n\nShe had her appendix removed a few years ago. Scar tissue from that surgery may be causing a problem inside.\n\n*Tip: You can ask me to explain anything. Just say "what does that mean?" if I use a word you don't know.*\n\nYou are looking at an X-ray of her abdomen (belly area) taken while she was standing up. On an X-ray, gas looks black and bones look white.\n\nLook at the middle of the image. Do you see any areas that look like swollen tubes? Can you spot the flat, straight lines where dark (gas) meets lighter gray (fluid)?\n\n**What do you think happens inside your body when the intestine gets blocked?**`,
    undergrad: `**A 45-year-old female presents with 2 days of progressive crampy abdominal pain, distension, nausea, and vomiting. No flatus for 24 hours. PMH: appendectomy 5 years ago. Vitals: HR 105, BP 118/76. Abdomen is distended and tympanitic with high-pitched bowel sounds. Upright abdominal radiograph obtained.**\n\n*Tip: Describe what you see before jumping to a diagnosis. "Multiple loops of dilated bowel with horizontal lines inside them" is more useful than "it looks abnormal."*\n\nOn an upright abdominal X-ray, gas rises to the top of fluid-filled loops, creating air-fluid levels (horizontal lines). The small bowel normally should not exceed 3 cm in diameter.\n\nLook at the bowel gas pattern. Are the loops of bowel dilated? Can you identify air-fluid levels? Is there gas in the colon and rectum?\n\n**What is the difference between small bowel and large bowel on an X-ray, and which do you think is affected here?**`,
    ms_preclinical: `**A 45-year-old female with PMH of appendectomy presents with 2 days of progressive crampy abdominal pain, distension, nausea, and bilious vomiting progressing to feculent. Obstipation for 24 hours. Vitals: HR 105, BP 118/76, T 37.8C. Exam: distended, tympanitic, diffuse tenderness without peritoneal signs, high-pitched tinkling bowel sounds. Labs: WBC 11.2, lactate 1.4, K 3.2, Cl 92. Upright abdominal X-ray obtained.**\n\n*Tip: Be precise. "Dilated loops of small bowel with differential air-fluid levels and paucity of colonic gas" is a much stronger prompt than "something looks wrong."*\n\nApply the 3-6-9 rule: small bowel >3 cm, large bowel >6 cm, cecum >9 cm = abnormally dilated.\n\n**Identify the dilated loops. Are these small bowel or large bowel, and how can you tell? What is the pathophysiology of mechanical bowel obstruction, and why does this patient have hypokalemia and hypochloremia?**`,
    ms_clinical: `**A 45-year-old female with PMH of appendectomy presents with 2 days of progressive crampy abdominal pain, distension, nausea, and bilious vomiting progressing to feculent. Obstipation for 24 hours. Vitals: HR 105, BP 118/76, T 37.8C. Exam: distended, tympanitic, diffuse tenderness without peritoneal signs, high-pitched tinkling bowel sounds. Labs: WBC 11.2, lactate 1.4, K 3.2, Cl 92. Upright abdominal X-ray obtained.**\n\n*Tip: Be precise. "Dilated loops of small bowel with differential air-fluid levels and paucity of colonic gas" is a much stronger prompt than "something looks wrong."*\n\nConfirm the diagnosis on imaging, then plan your management.\n\n**Is this a complete or partial SBO, and how do you determine that? Walk me through your initial management (NPO, NG tube, fluids, electrolyte repletion). What are the indications for surgical intervention vs. continued conservative management? Would you order a Gastrografin challenge?**`,
    resident: `**A 45-year-old female, PMH appendectomy 5 years ago, presents with 2 days of progressive SBO symptoms. Now with feculent vomiting and obstipation x 24h. Vitals: HR 105, BP 118/76, T 37.8C. Exam: distended, tympanitic, diffuse tenderness, no peritoneal signs, high-pitched bowel sounds. Labs: WBC 11.2, lactate 1.4 (normal <2.0), BMP: K 3.2, Cl 92, BUN 28, Cr 1.1. Upright AXR obtained.**\n\n*Tip: Walk me through your decision-making like oral boards. I will push back on gaps in your reasoning.*\n\nYour read: confirm the diagnosis, then outline your management algorithm.\n\n**Interpret this film. Then: (1) What CT findings would indicate strangulation and mandate emergent surgery? (2) This patient has no peritoneal signs and a normal lactate; would you pursue a Gastrografin challenge, and what are the criteria for success vs. failure? (3) If she fails conservative management at 48 hours, what is your operative plan and how do you counsel about recurrence risk?**`,
  },
  'ct-epidural': {
    highschool: `**An 87-year-old woman fell and hit her head. She was brought to the emergency room, and doctors ordered a CT scan of her brain.**\n\nA CT scan is like a very detailed X-ray that takes pictures of slices through the body. On a head CT, bone looks bright white, the brain is gray, and fluid-filled spaces are dark. The brain should look roughly the same on both sides.\n\n*Tip: On CT, bright white means something dense like blood or bone. Dark means air or fluid. When you describe something to the AI, that description is called a prompt. A precise prompt gets a better response.*\n\nLook at this image carefully. Compare the left side and the right side.\n\n**What do you notice that looks different on the two sides? Do you see a bright white area that seems to be pushing things over?**`,
    undergrad: `**An 87-year-old female presents to the ED after a mechanical fall with head strike. She had a brief loss of consciousness, then appeared lucid before rapidly deteriorating. Non-contrast head CT obtained.**\n\nOn a non-contrast head CT, acute blood appears hyperdense (bright white) compared to normal gray brain parenchyma. The brain should be roughly symmetric, and the midline structures (falx cerebri, septum pellucidum) should be centered.\n\n*Tip: Describe the density, shape, and location of any abnormal collection. "Hyperdense biconvex collection in the right temporal region" is a much stronger prompt than "white area on one side."*\n\nLook at both sides of the brain. Identify any abnormal high-density collection. Note its shape and whether it crosses suture lines. Is the midline shifted?\n\n**What is the shape of the abnormal collection, and how does it differ from a subdural hematoma in morphology?**`,
    ms_preclinical: `**An 87-year-old female with PMH of atrial fibrillation on warfarin presents after a mechanical fall with head strike. Witnessed LOC followed by a lucid interval, then rapid decline to GCS 8 (E2V2M4). Vitals: HR 58, BP 188/102, RR 10 (Cushing triad). Non-contrast head CT obtained.**\n\n*Tip: On CT, bright white = dense (blood, bone, contrast). Dark = air or fluid. Be specific with location and morphology in your prompts.*\n\nHead CT systematic read: (1) Scalp and calvarium. (2) Extra-axial spaces. (3) Brain parenchyma. (4) Midline structures. (5) Ventricles. (6) Posterior fossa.\n\n**Describe the finding on CT. What is its shape and what anatomical layer is it in? What artery is classically responsible for epidural hematomas? Explain the pathophysiology of the lucid interval. How does the Monroe-Kellie doctrine explain the rapid clinical deterioration?**`,
    ms_clinical: `**An 87-year-old female with PMH of atrial fibrillation on warfarin presents after a mechanical fall with head strike. Witnessed LOC followed by a lucid interval, then rapid decline to GCS 8 (E2V2M4). Vitals: HR 58, BP 188/102, RR 10 (Cushing triad). Left pupil fixed and dilated. Non-contrast head CT obtained.**\n\n*Tip: On CT, bright white = dense (blood, bone, contrast). Dark = air or fluid. Describe findings precisely for a better teaching response.*\n\nIdentify the finding on CT, assess its severity, and shift to management.\n\n**What is your GCS assessment and what do the individual components tell you? What are the indications for emergent craniotomy? Describe the herniation syndromes, and which one does the fixed dilated left pupil suggest. What is the significance of the Cushing triad?**`,
    resident: `**An 87-year-old female on warfarin (INR 3.2) for AFib presents after mechanical fall. GCS declined from 14 to 8 over 45 minutes. Vitals: HR 52, BP 192/108, RR 10. Left pupil 6mm fixed. Right hemiparesis. Non-contrast head CT shows large right-sided epidural hematoma with 12mm midline shift and early uncal herniation.**\n\n*Tip: Walk me through your decision-making like oral boards. I will challenge gaps in your reasoning.*\n\nThis is a time-critical scenario. Simultaneous resuscitation and surgical planning required.\n\n**Walk me through your ICP management algorithm: osmotic therapy (mannitol vs. hypertonic saline), head of bed positioning, ventilator targets. What is your anticoagulation reversal protocol for warfarin (4-factor PCC vs. FFP, vitamin K dosing)? Discuss surgical timing: does this patient go to OR before or after INR correction? What is the operative approach and what complications are you counseling the family about in an 87-year-old?**`,
  },
  'ct-subdural': {
    highschool: `**An 80-year-old woman came to the hospital after her family noticed she was confused and unsteady. Doctors ordered a CT scan of her brain to look inside.**\n\nA CT scan takes pictures of slices through the head. The brain should look about the same on both sides. Bone appears bright white, brain tissue is gray, and the spaces filled with fluid are very dark.\n\n*Tip: On CT, bright white means something dense like blood or bone. Dark means air or fluid. When you describe something to the AI, that description is called a prompt. A precise prompt gets a better response.*\n\nCompare the two sides of the brain carefully.\n\n**Do you see something extra on one side that should not be there? Does one side look like it is being squeezed?**`,
    undergrad: `**An 80-year-old female presents with progressive confusion, unsteady gait, and left-sided weakness over the past week. PMH includes hypertension and she takes daily aspirin. Non-contrast head CT obtained.**\n\nOn a non-contrast head CT, acute blood is hyperdense (white), subacute blood becomes isodense (same gray as brain), and chronic blood becomes hypodense (dark). The shape of an extra-axial collection helps distinguish its anatomical compartment.\n\n*Tip: Focus on the shape: crescent-shaped collections spread along the brain surface, while lens-shaped collections are confined by dural attachments. A precise description makes a stronger prompt.*\n\nLook at both hemispheres. Identify any abnormal collection. Note its shape, density, and relationship to the falx cerebri.\n\n**Can you identify the crescent-shaped collection? How does its shape differ from an epidural hematoma, and what does that tell you about the anatomical layer it occupies?**`,
    ms_preclinical: `**An 80-year-old female with PMH of HTN, on aspirin 81mg daily, presents with 1 week of progressive headache, confusion, and left-sided weakness. Family reports a fall 3 weeks ago. Exam: GCS 14 (E4V4M6), left pronator drift, left hyperreflexia. Non-contrast head CT obtained.**\n\n*Tip: On CT, bright white = dense (blood, bone, contrast). Dark = air or fluid. Describe findings with anatomical precision for a better teaching response.*\n\nHead CT systematic read: (1) Scalp and calvarium. (2) Extra-axial spaces. (3) Brain parenchyma. (4) Midline structures. (5) Ventricles. (6) Posterior fossa.\n\n**Describe the finding. What is the anatomy of the bridging veins and why are they vulnerable in the elderly? Classify the hematoma density: is this acute, subacute, or chronic? What are the risk factors for subdural hematoma (brain atrophy, anticoagulation, alcoholism)? How does the timing of the fall correlate with the CT appearance?**`,
    ms_clinical: `**An 80-year-old female with PMH of HTN, on aspirin 81mg daily, presents with 1 week of progressive headache, confusion, and left-sided weakness. Family reports a fall 3 weeks ago. Exam: GCS 14 (E4V4M6), left pronator drift, left hyperreflexia. Non-contrast head CT shows a left parafalcine subdural hematoma with 8mm midline shift.**\n\n*Tip: On CT, bright white = dense (blood, bone, contrast). Dark = air or fluid. Describe findings precisely, then shift to management.*\n\nIdentify the finding, classify it, and determine your management plan.\n\n**What are the surgical indications for subdural hematoma (thickness >10mm, midline shift >5mm, GCS drop >2 points)? Does this patient meet criteria for surgery or observation? If surgical, what is the procedure? When would you choose burr hole drainage vs. craniotomy?**`,
    resident: `**An 80-year-old female on aspirin and Plavix (dual antiplatelet for recent coronary stent 4 months ago) presents with subacute decline. GCS 14, left hemiparesis. CT: left parafalcine SDH, mixed density (acute on chronic), 14mm max thickness, 8mm midline shift. No hydrocephalus. Cardiology confirms DES was placed 4 months ago; stopping DAPT carries stent thrombosis risk.**\n\n*Tip: Walk me through your decision-making like oral boards. I will challenge gaps in your reasoning.*\n\nThis case involves competing risks: expanding SDH vs. stent thrombosis.\n\n**Walk me through your antiplatelet reversal protocol: platelet transfusion efficacy for aspirin vs. P2Y12 inhibitors, desmopressin role, and timing of reversal relative to surgery. What is your ICP monitoring plan? Discuss your operative approach: burr hole vs. craniotomy for mixed-density SDH. What is your long-term plan for chronic SDH management (subdural drain duration, repeat imaging protocol, recurrence rate)? How do you navigate the DAPT discussion with cardiology?**`,
  },
  'cxr-pneumoperitoneum': {
    highschool: `**A 71-year-old woman came to the emergency room with sudden, severe belly pain. She feels very sick and her stomach is rigid and tender.**\n\nDoctors ordered an upright chest X-ray. When a patient stands up for a chest X-ray, any free air inside the belly floats upward and collects under the diaphragm (the dome-shaped muscle that separates the chest from the belly).\n\n*Tip: You can ask me to explain anything in simpler terms. Just say "what does that mean?" if I use a word you don't know.*\n\nLook at the very top of the belly area, just below the dome shapes (the diaphragm). Normally you should see the diaphragm sitting right on top of darker organs.\n\n**Do you see a thin dark line under the dome shapes at the top? What do you think that dark line could be, and how might air get inside the belly?**`,
    undergrad: `**A 71-year-old female presents to the ED with acute-onset severe abdominal pain, rigidity, and rebound tenderness. PMH: diverticulosis, hypertension. Vitals: HR 112, BP 98/62, T 38.9C. An upright PA chest radiograph was obtained.**\n\n*Tip: On an upright CXR, free intraperitoneal air rises to the highest point, which is under the diaphragm. "Crescent of lucency under the right hemidiaphragm" is a much stronger prompt than "something looks dark up there."*\n\nOn an upright chest X-ray, the diaphragm normally appears as a smooth dome sitting directly on top of the abdominal organs. If air is free in the peritoneal cavity, it rises and appears as a dark crescent between the diaphragm and the liver or stomach.\n\nLook carefully at both hemidiaphragms. Is there a lucent (dark) line between the diaphragm and the organs below it?\n\n**What causes air to leak into the abdominal cavity? What are the most common causes of bowel perforation?**`,
    ms_preclinical: `**A 71-year-old female with PMH of diverticulosis and HTN presents with acute-onset severe diffuse abdominal pain x 6 hours. Exam: diffuse peritonitis with guarding and rigidity. Vitals: HR 112, BP 98/62, T 38.9C, RR 24. Labs: WBC 18.4 with left shift, lactate 3.8. Upright PA CXR obtained.**\n\n*Tip: Use precise radiologic language. "Free air under the right hemidiaphragm" is a stronger prompt than "something dark at the top."*\n\nSystematic approach: (1) Look under both hemidiaphragms for free air. (2) Assess the lung fields. (3) Check mediastinal contours. Free air under the diaphragm on an upright film is called pneumoperitoneum.\n\n**Identify the finding. What are the causes of pneumoperitoneum (peptic ulcer perforation, diverticular perforation, trauma, iatrogenic)? Describe the peritoneal anatomy: what is the difference between the greater and lesser sac? What is the Rigler sign and when would you see it on a supine film?**`,
    ms_clinical: `**A 71-year-old female with PMH of diverticulosis and HTN presents with acute-onset severe diffuse abdominal pain x 6 hours. Exam: diffuse peritonitis with guarding and rigidity. Vitals: HR 112, BP 98/62, T 38.9C, RR 24. Labs: WBC 18.4 with left shift, lactate 3.8. Upright PA CXR obtained.**\n\n*Tip: Use precise radiologic language. Identify the finding, then shift to management.*\n\nThis is a surgical emergency. Confirm the finding on imaging, then outline your management.\n\n**This patient has free air and peritonitis with hemodynamic instability. What is your initial resuscitation plan? Given her history of diverticulosis, sigmoid perforation is the leading diagnosis. What operation would you perform: Hartmann procedure vs. primary anastomosis? What factors influence this decision (degree of contamination, hemodynamic status, patient comorbidities)?**`,
    resident: `**A 71-year-old female, PMH diverticulosis (known sigmoid disease on prior colonoscopy), HTN, T2DM, BMI 34. Presents with 6 hours of diffuse abdominal pain. Exam: rigid abdomen, diffuse peritonitis. Vitals: HR 112, BP 98/62 (MAP 74), T 38.9C, RR 24, SpO2 94% RA. Labs: WBC 18.4, lactate 3.8, Cr 1.6 (baseline 0.9). Upright CXR obtained. CT abdomen/pelvis shows free air, free fluid, and sigmoid wall thickening with adjacent fat stranding.**\n\n*Tip: Walk me through your decision-making like oral boards. I will push back on gaps in your reasoning.*\n\nThis is Hinchey stage IV (feculent peritonitis). Time to OR is the critical variable.\n\n**Walk me through your first 60 minutes: resuscitation (fluid strategy, vasopressors, broad-spectrum antibiotics per SIS guidelines), OR timing, and operative plan. Hartmann procedure vs. primary anastomosis with diverting loop ileostomy: what does the LADIES trial tell us? Discuss damage control surgery principles if the patient decompensates intraoperatively. What are your sepsis bundle targets?**`,
  },
  'axr-nec': {
    highschool: `**This is an X-ray of a newborn baby who has become very sick. The baby's belly has become swollen and the baby is not tolerating feedings.**\n\nAn X-ray of the belly (abdomen) shows the intestines, which are the long tubes that digest food. In a healthy baby, you would see normal loops of intestine with some gas inside them. The gas appears dark on the X-ray.\n\n*Tip: You can ask me to explain anything. Just say "what does that mean?" if I use a word you don't know.*\n\nLook carefully at the intestines. In a healthy baby, the walls of the intestines should look smooth and thin.\n\n**Do you see any unusual patterns in the intestines? Does the gas pattern look bubbly or frothy in places where it should look smooth?**`,
    undergrad: `**A premature neonate (born at 28 weeks gestational age, now day of life 10) presents with abdominal distension, feeding intolerance, bilious emesis, and bloody stools. Vitals: HR 180, T 36.2C (hypothermia), RR 60. Abdomen is distended and tender with discoloration. An AP abdominal radiograph was obtained.**\n\n*Tip: Describe exactly what you see. "Bubbly lucencies within the bowel wall and branching linear lucencies overlying the liver" is far more useful than "it looks abnormal."*\n\nOn a neonatal abdominal X-ray, look for: (1) bowel gas pattern and distribution, (2) bowel wall integrity, (3) gas where it should not be (in the bowel wall or over the liver), and (4) free air suggesting perforation.\n\nLook for gas where it does not belong: within the bowel wall itself (bubbly or linear pattern) and branching over the liver shadow.\n\n**Can you identify gas in the bowel wall (pneumatosis intestinalis)? Do you see any branching lucencies over the liver that could represent portal venous gas?**`,
    ms_preclinical: `**A 28-week premature neonate (birth weight 1,100g), day of life 10, on enteral feeds with formula. Presents with acute abdominal distension, feeding intolerance, bilious emesis, and hematochezia. Vitals: HR 180, T 36.2C, RR 60, SpO2 88% on nasal cannula. Labs: WBC 4.2 (leukopenia), platelets 62K, CRP 8.4, ABG: pH 7.22, lactate 4.1. AP abdominal radiograph obtained.**\n\n*Tip: Be precise. "Pneumatosis intestinalis with portal venous gas" is a much stronger prompt than "something looks wrong."*\n\nSystematic neonatal AXR read: (1) Bowel gas pattern and distribution. (2) Bowel wall thickness and integrity. (3) Intramural gas (pneumatosis). (4) Portal venous gas. (5) Free air (pneumoperitoneum). (6) Soft tissues.\n\n**Identify the findings. What is the pathophysiology of necrotizing enterocolitis at the cellular level (mucosal ischemia, bacterial translocation, inflammatory cascade)? What are the risk factors (prematurity, formula feeding, perinatal hypoxia)? What is pneumatosis intestinalis and what does it represent histologically?**`,
    ms_clinical: `**A 28-week premature neonate (birth weight 1,100g), day of life 10, on enteral feeds with formula. Presents with acute abdominal distension, feeding intolerance, bilious emesis, and hematochezia. Vitals: HR 180, T 36.2C, RR 60, SpO2 88%. Labs: WBC 4.2, platelets 62K, CRP 8.4, ABG: pH 7.22, lactate 4.1. AP abdominal radiograph obtained showing pneumatosis intestinalis and portal venous gas.**\n\n*Tip: Identify the findings and classify the severity, then shift to management.*\n\nClassify this using the Modified Bell staging system.\n\n**What Modified Bell stage is this patient (Stage I, II, or III)? What are the criteria for each stage? Walk me through medical management (NPO, NGT decompression, broad-spectrum antibiotics, TPN). What finding on AXR mandates surgical intervention (pneumoperitoneum)? What are the other indications for surgical consultation (clinical deterioration, fixed dilated loop, abdominal wall erythema)?**`,
    resident: `**A 28-week premature neonate, DOL 10, birth weight 1,100g, formula-fed. Acute deterioration with distension, hematochezia, and hemodynamic instability requiring pressors. Labs: WBC 4.2 (bandemia), platelets 62K, CRP 8.4, ABG: pH 7.22, lactate 4.1, base deficit -12. Serial AXRs show progressive pneumatosis intestinalis, portal venous gas, and now a fixed dilated loop in the RLQ that has not changed position over 12 hours.**\n\n*Tip: Walk me through your decision-making like oral boards. I will challenge gaps in your reasoning.*\n\nThis is Modified Bell Stage IIIB (advanced NEC with intestinal perforation or clinical deterioration despite maximal medical therapy).\n\n**Walk me through your serial AXR monitoring protocol: what are you looking for on each film and how frequently? The fixed dilated loop is concerning: why, and does it mandate surgery? Discuss the surgical options: peritoneal drain (penrose drain) vs. exploratory laparotomy. When do you choose each? What are the long-term complications (short bowel syndrome, stricture formation, neurodevelopmental outcomes) and how do you counsel the family?**`,
  },
  'xr-colles': {
    highschool: `**An adult tripped and fell, landing on an outstretched hand. Their wrist is now very swollen and painful, and it looks bent at an odd angle. The doctor ordered an X-ray of the wrist.**\n\nOn an X-ray, bones appear bright white and soft tissues are gray. The two main bones in the forearm are the radius (on the thumb side) and the ulna (on the pinky side). They connect to the small wrist bones at the bottom of the image.\n\n*Tip: You can ask me to explain anything. Just say "what does that mean?" if I use a word you don't know.*\n\nLook at the bone on the thumb side near the wrist. Follow it down toward the wrist joint.\n\n**Can you see where the bone looks broken? Does one part of the bone look like it is pushed backward compared to the rest?**`,
    undergrad: `**An adult presents to the ED after a fall onto an outstretched hand (FOOSH injury). The wrist is swollen with a visible deformity. PA and lateral wrist radiographs were obtained.**\n\n*Tip: "Transverse fracture of the distal radius with dorsal displacement and angulation" is a much stronger prompt than "the bone looks broken."*\n\nOn a lateral wrist X-ray, the distal radius should have a slight volar (palmar) tilt of about 11 degrees. On the PA view, the radial articular surface normally has about 22 degrees of inclination. A fracture that disrupts these angles produces visible deformity.\n\nLook at the distal radius on both views. Identify the fracture line. On the lateral view, note the direction of displacement.\n\n**Can you identify the fracture line? Describe the displacement and angulation you see. What is the "dinner fork" deformity and why does it occur with this type of fracture?**`,
    ms_preclinical: `**An adult presents after a fall onto an outstretched hand (FOOSH). Exam: dorsal wrist deformity ("dinner fork"), tenderness over the distal radius, limited ROM. Neurovascularly intact distally. PA and lateral wrist radiographs obtained.**\n\n*Tip: Use precise orthopedic language. "Distal radius fracture with 25 degrees of dorsal tilt and 5mm of shortening" is a much stronger prompt than "the wrist is broken."*\n\nOn the PA view, assess: radial inclination (normal ~22 degrees), radial height (normal ~11mm), and articular congruity. On the lateral view, assess: volar tilt (normal ~11 degrees volar; dorsal tilt = abnormal).\n\n**Describe the fracture. What is the mechanism (FOOSH)? Differentiate Colles fracture (dorsal displacement) from Smith fracture (volar displacement) and Barton fracture (rim fracture with subluxation). What is the relevant radiocarpal joint anatomy? Which nerve is at risk and why (median nerve and carpal tunnel)?**`,
    ms_clinical: `**An adult presents after a FOOSH injury. Exam: dorsal wrist deformity, swelling, and tenderness. Neurovascularly intact. PA and lateral wrist X-rays show a distal radius fracture with dorsal displacement and angulation, 3mm of radial shortening, and no intra-articular extension.**\n\n*Tip: Identify the fracture, classify it, then plan management.*\n\nAssess the fracture on both views and determine your management plan.\n\n**Describe your reduction technique for a Colles fracture (hematoma block, traction, manipulation). What are the indications for ORIF vs. closed reduction and casting (dorsal tilt >20 degrees, radial shortening >3mm, intra-articular step-off >2mm)? What is your neurovascular exam checklist? How do you assess for and monitor compartment syndrome?**`,
    resident: `**An adult, PMH osteoporosis, presents after a ground-level FOOSH. X-rays: comminuted distal radius fracture with 25 degrees dorsal tilt, 5mm radial shortening, 2mm intra-articular step-off involving the scaphoid fossa. Ulnar styloid avulsion fracture present. DRUJ stability questionable on exam. Neurovascularly intact.**\n\n*Tip: Walk me through your decision-making like oral boards. I will challenge gaps in your reasoning.*\n\nThis fracture meets multiple operative criteria.\n\n**Walk me through the operative criteria: dorsal tilt >20 degrees, radial shortening >3mm, intra-articular step-off >2mm. This patient meets all three. What is your preferred fixation (volar locking plate vs. external fixation vs. fragment-specific fixation) and why? How does the ulnar styloid fracture and potential DRUJ instability change your plan? Discuss late complications: EPL tendon rupture (and its mechanism from the Lister tubercle), malunion, post-traumatic arthritis, and CRPS. What is your post-operative rehab protocol?**`,
  },
};

function getWelcomeMessage(isPathology: boolean, level: LearnerLevel = 'ms_preclinical', studyId?: string): string {
  // Check for CXR case-specific welcome messages (inject modality-appropriate tip)
  if (studyId && CXR_WELCOME_MESSAGES[studyId]) {
    const base = CXR_WELCOME_MESSAGES[studyId][level] || CXR_WELCOME_MESSAGES[studyId].ms_preclinical;
    // CT cases get the CT-specific tip; all others get the standard radiology L/R + prompting tip
    const tipToInject = studyId.startsWith('ct-') ? CT_TIP : CXR_TIP;
    return base.replace(/\*Tip:[^*]+\*/, tipToInject);
  }

  if (isPathology) {
    const pathTip = '*Tip: When you describe a finding to the AI, that description is called a **prompt**. A precise prompt gets a better response. For example: "irregular nests of cells with dense surrounding stroma" is a stronger prompt than "the pink area."*';

    if (level === 'highschool') {
      return `**Case: 62-year-old woman with a lump in her breast.**\n\nHer doctor felt a hard lump during an exam and ordered a biopsy, which means they took a tiny piece of the lump to look at under a microscope. You are looking at that tissue, stained with special dyes that turn cell nuclei blue/purple and the rest of the cell pink.\n\n${pathTip}\n\n---\n\nYou are at low magnification (4x). Start by looking at the overall shape of the tissue. Does it look organized or chaotic?\n\n**What do you think normal breast tissue should look like compared to a tumor?**`;
    }
    if (level === 'undergrad') {
      return `**Case: 62-year-old female, palpable breast mass.**\n\nA core biopsy was performed on a suspicious breast mass. The tissue has been stained with H&E (hematoxylin and eosin): hematoxylin stains nuclei blue/purple, eosin stains cytoplasm and extracellular matrix pink.\n\n${pathTip}\n\n---\n\nStart at 4x to see the tissue architecture. Look for areas where the normal glandular pattern is disrupted. Then move to 10x.\n\n**What is the difference between epithelial and stromal tissue, and which do you see more of here?**`;
    }
    if (level === 'resident') {
      return `**Case: 62F, R breast UOQ palpable mass. BI-RADS 5 spiculated lesion. US-guided core biopsy.**\n\nH&E sections at 4x, 10x, and 40x. Your job: identify the lesion, characterize the invasion pattern, and work through the Nottingham grading components (tubule formation, nuclear pleomorphism, mitotic count).\n\n${pathTip}\n\n---\n\nSystematic approach: (1) 4x: architecture, tumor boundaries, stromal response. (2) 10x: growth pattern, invasion front. (3) 40x: nuclear detail, mitotic figures, grading.\n\n**What is your differential for a spiculated breast mass on a core biopsy, and what histologic features would you use to distinguish IDC-NST from invasive lobular carcinoma?**`;
    }
    if (level === 'ms_clinical') {
      return `**Case: 62-year-old female, breast mass biopsy.**\n\nPalpable mass in the upper outer quadrant of the right breast. Mammography: BI-RADS 5 spiculated mass. Core biopsy performed. H&E sections at 4x, 10x, and 40x.\n\n${pathTip}\n\n---\n\nIdentify the lesion type and begin grading. Then think about the next steps in workup.\n\n**What is your histologic diagnosis? Walk me through the Nottingham grading components. What molecular markers (ER, PR, HER2, Ki-67) would you order, and how does each result change the treatment plan?**`;
    }
    // ms_preclinical default
    return `**Case: 62-year-old female, breast mass biopsy.**\n\nPalpable mass in the upper outer quadrant of the right breast. Mammography showed an irregular spiculated mass. Core biopsy was performed. You are reviewing H&E stained sections at 4x, 10x, and 40x magnification.\n\n${pathTip}\n\n---\n\nStart at 4x (low power). In pathology, you always scan at low power first to understand the tissue architecture before zooming in.\n\nCapture what you see and describe it.\n\n**What features on histology distinguish a benign breast lesion from a malignant one? What cellular changes indicate that cells have become cancerous?**`;
  }

  const tip = '*Tip: In radiology, images are flipped like you\'re facing the patient. Left side of the image = patient\'s right. When you describe a finding to the AI, that description is called a **prompt**. A precise prompt gets a better response. For example: "patient\'s right lateral ventricle" is a stronger prompt than "the right side."*';

  if (level === 'highschool') {
    return `**Case: 72-year-old woman with memory problems.**\n\nFor the past 6 months she has been forgetting words and getting lost in places she knows well. She also has an irregular heartbeat, high blood pressure, and diabetes. Her doctor ordered a brain scan (MRI) to figure out what is going on.\n\n${tip}\n\n---\n\nYou are looking at a brain MRI. This is a special type of picture that lets doctors see inside the brain without surgery. You are on the FLAIR view, which is good at showing areas of damage.\n\nScroll through the slices and look for anything that seems different between the left and right sides of the brain. When you spot something, capture it with the camera.\n\n**What do you think could cause someone to lose their memory?**`;
  }

  if (level === 'undergrad') {
    return `**Case: 72-year-old female, progressive memory decline.**\n\n6-month history of word-finding difficulty and spatial disorientation. PMH: atrial fibrillation (irregular heart rhythm that can cause blood clots), hypertension, type 2 diabetes. Brain MRI ordered to evaluate for dementia.\n\n${tip}\n\n---\n\nYou are starting on the FLAIR sequence, which suppresses cerebrospinal fluid signal and makes areas of edema or gliosis appear bright. This is the go-to sequence for spotting white matter lesions and infarcts.\n\nScroll through the slices. Look for asymmetry between hemispheres, bright signal where it should not be, or changes in ventricle size.\n\n**Given her risk factors (atrial fibrillation, hypertension, diabetes), what vascular pathology might explain her symptoms?**`;
  }

  if (level === 'resident') {
    return `**Case: 72F, progressive cognitive decline x 6 months.**\n\nPresenting complaint: word-finding difficulty, topographic disorientation. PMH: atrial fibrillation (on apixaban), HTN (on lisinopril), T2DM (A1c 7.8). No acute focal deficits on exam. MMSE 22/30. MRI brain ordered to evaluate for vascular vs. neurodegenerative etiology.\n\n${tip}\n\n---\n\nYou are on FLAIR. Your systematic approach: (1) Survey for territorial infarcts and their vascular distribution. (2) Grade periventricular and deep white matter hyperintensities (Fazekas scale). (3) Assess for volume loss patterns (global vs. focal, symmetric vs. asymmetric). (4) Cross-reference DWI for acute vs. chronic lesions.\n\nScroll through, identify all findings, then capture.\n\n**What is your differential for progressive cognitive decline with these vascular risk factors, and how would you use the MRI sequences to distinguish vascular cognitive impairment from Alzheimer disease?**`;
  }

  if (level === 'ms_clinical') {
    return `**Case: 72-year-old female, progressive memory decline.**\n\n6-month history of word-finding difficulty and getting lost in familiar places. PMH: atrial fibrillation, hypertension, type 2 diabetes. MMSE 22/30. Brain MRI ordered.\n\n${tip}\n\n---\n\nSystematic MRI read: (1) Survey for territorial infarcts. (2) Grade white matter disease. (3) Assess volume loss patterns. (4) Cross-reference DWI for acute vs. chronic.\n\nScroll through, identify all findings, then capture.\n\n**What is your differential for this presentation? How do you distinguish vascular cognitive impairment from Alzheimer disease on imaging? What is this patient's CHA2DS2-VASc score and is anticoagulation adequate?**`;
  }

  // Default: ms_preclinical
  return `**Case: 72-year-old female, progressive memory decline.**\n\n6-month history of word-finding difficulty and getting lost in familiar places. Past medical history: atrial fibrillation, hypertension, type 2 diabetes. Brain MRI ordered to rule out dementia.\n\n${tip}\n\n---\n\nYou are starting on the FLAIR sequence. Scroll through the slices, and when you see something that catches your eye, capture it with the camera and tell me what you see.\n\n**What structures can you identify on this slice? Do you notice any areas where the signal intensity looks different between the two hemispheres? What are you expecting to find given this patient's history?**`;
}

// CXR-specific suggestions (shared across all CXR cases for the initial state)
const CXR_SUGGESTIONS_NO_IMAGE: Record<LearnerLevel, string[]> = {
  highschool: ["What does a normal chest X-ray look like?", "How do doctors read X-rays?"],
  undergrad: ["What is the systematic approach to reading a chest X-ray?", "How do I tell the left side from the right?"],
  ms_preclinical: ["What anatomy should I identify on a CXR?", "Explain the silhouette sign and how it localizes findings."],
  ms_clinical: ["Walk me through the ABCDE approach to this CXR.", "What findings should I look for given the clinical history?"],
  resident: ["What is my differential based on the clinical presentation?", "How do I integrate the imaging with the exam findings?"],
};

const CXR_SUGGESTIONS_WITH_IMAGE: Record<LearnerLevel, string[]> = {
  highschool: ["Does one side look different from the other?", "What could cause this white area?"],
  undergrad: ["What abnormality do I see and which side is it on?", "Is the heart or trachea shifted?"],
  ms_preclinical: ["What is the silhouette sign and how does it help here?", "What is the pathophysiology behind this finding?"],
  ms_clinical: ["Let me describe the findings I see on this CXR.", "What is my management plan based on these findings?"],
  resident: ["I want to present this case as if at morning report.", "What is my management plan based on these findings?"],
};

function getInitialSuggestions(
  learnerLevel: LearnerLevel,
  hasImageContext: boolean,
  isPathology: boolean,
  studyId?: string
): string[] {
  const isCxr = studyId?.startsWith('cxr-') || studyId?.startsWith('axr-') || studyId?.startsWith('ct-') || studyId?.startsWith('xr-');
  if (hasImageContext) {
    if (isCxr) return CXR_SUGGESTIONS_WITH_IMAGE[learnerLevel] || [];
    return (isPathology ? PATHOLOGY_SUGGESTIONS_WITH_IMAGE : RADIOLOGY_SUGGESTIONS_WITH_IMAGE)[learnerLevel] || [];
  }
  if (isCxr) return CXR_SUGGESTIONS_NO_IMAGE[learnerLevel] || [];
  return (isPathology ? PATHOLOGY_SUGGESTIONS_NO_IMAGE : RADIOLOGY_SUGGESTIONS_NO_IMAGE)[learnerLevel] || [];
}

const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({ 
  capturedImage,
  capturedSliceMetadata,
  onCaptureTrigger,
  onClearCapture,
  showCaptureToast,
  studyMetadata, 
  cursor, 
  onJumpToSlice, 
  activeSeriesInfo,
  onStartTour,
  onPointers
}) => {
  // Learner Level State (must be before messages so welcome adapts)
  const [learnerLevel, setLearnerLevel] = useState<LearnerLevel>(() => {
    const stored = localStorage.getItem('caseattend_learner_level') as string;
    // Migrate old 'medstudent' value to new default
    if (stored === 'medstudent') return 'ms_preclinical';
    return (stored as LearnerLevel) || 'ms_preclinical';
  });

  const initMsg: ChatMessage[] = [
    { id: 'welcome', role: 'model', text: getWelcomeMessage(studyMetadata?.modality === 'PATH', learnerLevel, studyMetadata?.studyId) }
  ];
  const [messages, setMessages] = useState(initMsg);

  // Update welcome message when modality or learner level changes
  useEffect(() => {
    const isPath = studyMetadata?.modality === 'PATH';
    setMessages(prev => {
      if (prev.length === 1 && prev[0].id === 'welcome') {
        return [{ id: 'welcome', role: 'model', text: getWelcomeMessage(isPath, learnerLevel, studyMetadata?.studyId) }];
      }
      return prev;
    });
  }, [studyMetadata?.modality, studyMetadata?.studyId, learnerLevel]);

  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [showMedPicker, setShowMedPicker] = useState(false);
  const [mode, setMode] = useState<AiMode>('chat');
  // BYOK is the launch model: every visitor uses their own OpenRouter balance, so
  // no inference is billed to a shared developer key. (setProvider retained for a
  // possible future owner-funded tier.)
  const [provider, setProvider] = useState<AIProvider>('openrouter');

  // BYOK connection state, kept in sync via BYOK_CHANGED_EVENT so the status bar
  // and model label update the instant the user connects or switches model.
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [byokConnected, setByokConnected] = useState<boolean>(() => hasKey());
  const [byokModelLabel, setByokModelLabel] = useState<string>(() => modelLabel(getModel()));

  useEffect(() => {
    const sync = () => {
      setByokConnected(hasKey());
      setByokModelLabel(modelLabel(getModel()));
    };
    window.addEventListener(BYOK_CHANGED_EVENT, sync);
    return () => window.removeEventListener(BYOK_CHANGED_EVENT, sync);
  }, []);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const activeRequestRef = useRef(false);

  // Aliases for lifted state
  const attachedScreenshot = capturedImage;
  const capturedSliceInfo = capturedSliceMetadata;

  // Scroll State
  const [isUserNearBottom, setIsUserNearBottom] = useState(true);
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);
  
  // Dynamic suggestions cache (pre-fetched for all levels)
  const [dynamicSuggestionsMap, setDynamicSuggestionsMap] = useState<Record<LearnerLevel, string[]> | null>(null);

  // Pre-analysis context: grounding description generated when a slice is first captured.
  // Prepended to every user prompt so the AI stays grounded in the actual image content.
  const [sliceAnalysis, setSliceAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    localStorage.setItem('caseattend_learner_level', learnerLevel);
  }, [learnerLevel]);

  useEffect(() => {
    localStorage.setItem('caseattend_provider', provider);
  }, [provider]);

  // Clear dynamic suggestions when capture changes
  useEffect(() => {
    if (capturedImage) {
       setDynamicSuggestionsMap(null);
    }
  }, [capturedImage]);

  // Run whole-slide pre-analysis once when the study loads.
  // Uses the first image of the first series as the overview.
  // This grounds ALL subsequent AI responses in the actual slide content,
  // preventing jailbreaking regardless of what the user captures or segments.
  useEffect(() => {
    if (!studyMetadata) return;
    // BYOK: hold off on grounding until the visitor connects their key.
    // Re-runs automatically when byokConnected flips true (see deps).
    if (provider === 'openrouter' && !byokConnected) {
      setSliceAnalysis(null);
      setIsAnalyzing(false);
      return;
    }
    setSliceAnalysis(null);
    setIsAnalyzing(true);

    // Load the first image of the current study as the overview for pre-analysis
    const cxrOverviews: Record<string, string> = {
      'cxr-pneumothorax': '/images/cxr-pneumothorax/1.jpg',
      'cxr-pneumonia': '/images/cxr-pneumonia/1.jpg',
      'cxr-chf': '/images/cxr-chf/1.jpg',
      'cxr-effusion': '/images/cxr-effusion/1.jpg',
    };
    const overviewUrl = studyMetadata.modality === 'PATH'
      ? '/images/patho-1/HE_4x/1.webp'
      : cxrOverviews[studyMetadata.studyId] || '/images/sub-1/FLAIR/14.png';

    fetch(overviewUrl)
      .then(r => r.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          preAnalyzeSlice(
            base64,
            provider,
            studyMetadata.modality === 'PATH' ? 'pathology' : 'radiology',
            'Whole slide overview',
            studyMetadata.description || ''
          ).then(analysis => {
            if (analysis) {
              setSliceAnalysis(analysis);
              console.log('[Slide Pre-analysis] Grounding context cached:', analysis.substring(0, 120) + '...');
            }
          }).finally(() => setIsAnalyzing(false));
        };
        reader.readAsDataURL(blob);
      })
      .catch(() => setIsAnalyzing(false));
  }, [studyMetadata?.id, provider, byokConnected]);

  // Scroll welcome message to top on first render
  const hasScrolledWelcome = useRef(false);
  useEffect(() => {
    if (!hasScrolledWelcome.current && chatContainerRef.current && messages.length === 1 && messages[0].id === 'welcome') {
      chatContainerRef.current.scrollTop = 0;
      hasScrolledWelcome.current = true;
    }
  }, [messages]);

  // Track whether user has interacted during streaming
  const userInteractedRef = useRef(false);

  // Any user interaction inside the chat kills auto-scroll
  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const stopAutoScroll = () => {
      userInteractedRef.current = true;
      setIsPinnedToBottom(false);
    };
    el.addEventListener('wheel', stopAutoScroll, { passive: true });
    el.addEventListener('touchstart', stopAutoScroll, { passive: true });
    el.addEventListener('pointerdown', stopAutoScroll);
    return () => {
      el.removeEventListener('wheel', stopAutoScroll);
      el.removeEventListener('touchstart', stopAutoScroll);
      el.removeEventListener('pointerdown', stopAutoScroll);
    };
  }, []);

  // Re-enable auto-scroll when a NEW message starts streaming (user sends a message)
  const prevMessageCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessageCount.current && isThinking) {
      userInteractedRef.current = false;
      setIsPinnedToBottom(true);
    }
    prevMessageCount.current = messages.length;
  }, [messages.length, isThinking]);

  // Smart Auto-Scroll Effect
  useEffect(() => {
    if (chatContainerRef.current && isPinnedToBottom && !userInteractedRef.current && messages.length > 1) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isThinking, isPinnedToBottom]);

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setIsUserNearBottom(distanceFromBottom < 80);
  };

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
        chatContainerRef.current.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' });
    }
    setIsPinnedToBottom(true);
  };

  // Derived suggestions: Use Dynamic if available, else Static Initial
  const isPathology = studyMetadata?.modality === 'PATH';
  const currentSuggestions = dynamicSuggestionsMap
      ? dynamicSuggestionsMap[learnerLevel]
      : getInitialSuggestions(learnerLevel, !!attachedScreenshot, isPathology, studyMetadata?.studyId);

  const handleCapture = () => {
      onCaptureTrigger();
  };

  const handleClearChat = () => {
    // Abort active request if clearing
    if (activeRequestRef.current) {
      activeRequestRef.current = false;
      setIsThinking(false);
    }

    setMessages([{
      id: 'welcome',
      role: 'model',
      text: getWelcomeMessage(studyMetadata?.modality === 'PATH', learnerLevel, studyMetadata?.studyId)
    }]);
    
    onClearCapture();
    setInput('');
    setDynamicSuggestionsMap(null);
    setIsPinnedToBottom(true);
  };

  const handleCancel = () => {
    activeRequestRef.current = false;
    setIsThinking(false);
    
    // Remove the placeholder message (the one with empty text)
    setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'model' && !last.text) {
            return prev.slice(0, -1);
        }
        return prev;
    });
  };

  const handleSendMessage = async (text: string = input, promptOverride?: string) => {
    const finalText = promptOverride || text;
    if ((!finalText.trim() && !attachedScreenshot) || isThinking) return;

    // BYOK gate: if the visitor hasn't connected OpenRouter yet, open the Connect
    // modal instead of erroring — they've already seen the case; this is the ask.
    if (provider === 'openrouter' && !hasKey()) {
      setShowConnectModal(true);
      return;
    }

    // 1. Optimistically Add User Message
    const userMsg: ChatMessage = { 
        id: Date.now().toString(), role: 'user', text: finalText, hasAttachment: !!attachedScreenshot
    };
    setMessages(prev => [...prev, userMsg]);
    setIsPinnedToBottom(true); // Force scroll on new message
    
    // Save current input to restore on error if needed
    const textToRestore = input;
    
    // Clear Input immediately for responsiveness, but we might restore it on error.
    if (!promptOverride) setInput('');
    setIsThinking(true);
    activeRequestRef.current = true;
    // Clear previous AI pointers when starting a new request
    if (onPointers) onPointers([]);
    
    const imageToSend = attachedScreenshot;

    // Build conversation history as context (include welcome message + prior exchanges)
    const historyLines = messages
      .filter(m => m.text) // skip empty thinking placeholders
      .slice(-10) // last 10 messages max to avoid token bloat
      .map(m => m.role === 'user' ? `Student: ${m.text}` : `Tutor: ${m.text}`)
      .join('\n\n');

    let promptToSend = `[CONVERSATION HISTORY]\n${historyLines}\n\n[CURRENT MESSAGE]\nStudent: ${finalText}`;

    // Only mention image context if the student references the image or tries to discuss a specific finding
    if (!imageToSend) {
      promptToSend += '\n\n[NOTE: No image is currently captured. Only ask the student to capture an image if they specifically reference something they see in the viewer. If they are answering a general question or discussing concepts, respond normally without mentioning image capture.]';
    }
    
    // Inject study/series metadata as context for all modes
    if (studyMetadata) {
        const isPathology = studyMetadata.modality === 'PATH';
        const modalityLabel = isPathology ? 'Digital Pathology (H&E Histology)' : `Radiology (${studyMetadata.modality})`;
        promptToSend += `\n\n[Study Context: ${modalityLabel}, ${studyMetadata.description}`;
        if (activeSeriesInfo) promptToSend += `, Series: ${activeSeriesInfo.description}`;
        if (capturedSliceInfo) promptToSend += `, Captured: ${capturedSliceInfo.label || 'slice'} ${capturedSliceInfo.slice}/${capturedSliceInfo.total || '?'}`;
        else if (cursor) promptToSend += `, Current frame: ${cursor.frameIndex + 1}`;
        promptToSend += ']';
    }

    // Inject pre-analysis grounding context (prevents hallucination and jailbreaking)
    if (sliceAnalysis) {
        promptToSend += `\n\n[IMAGE PRE-ANALYSIS (ground truth - base your answers on this factual description of what is actually in the image):\n${sliceAnalysis}]`;
    }

    const botMsgId = (Date.now() + 1).toString();
    
    let botMessageExtras = {};
    if (imageToSend) {
       let label = capturedSliceInfo?.label || studyMetadata?.description;
       if (!label || label === "No Description" || label === "OT") {
         label = studyMetadata?.modality === 'PATH' ? 'Histology' : 'MRI series';
       }

       botMessageExtras = {
          attachedSliceThumbnailDataUrl: imageToSend,
          attachedSliceIndex: capturedSliceInfo?.slice,
          attachedSequenceLabel: label
       };
    }

    // 2. Add "Thinking" Placeholder (Initially empty text triggers thinking bubble)
    setMessages(prev => [...prev, { 
        id: botMsgId, 
        role: 'model', 
        text: '', 
        isThinking: mode === 'deep_think',
        ...botMessageExtras
    }]);

    try {
        let fullText = '';
        await streamChatResponse(
            promptToSend,
            mode,
            learnerLevel,
            imageToSend,
            (chunk, sources, toolCalls, suggestionsPayload, fullTextReplace, pointersPayload) => {
                // Cancellation Check
                if (!activeRequestRef.current) return;

                if (toolCalls && onJumpToSlice) {
                    toolCalls.forEach(call => {
                        if (call.name === 'set_cursor_frame') {
                            const idx = Math.round(call.args.index);
                            if (!isNaN(idx)) onJumpToSlice(idx);
                        }
                    });
                }

                // Handle Inline Suggestions from Stream
                if (suggestionsPayload) {
                    setDynamicSuggestionsMap(suggestionsPayload);
                }

                // Handle AI Pointers (visual indicators on the image)
                if (pointersPayload && onPointers) {
                    onPointers(pointersPayload);
                }

                if (fullTextReplace !== undefined) {
                    fullText = fullTextReplace;
                } else {
                    fullText += chunk;
                }

                setMessages(prev => prev.map(m => m.id === botMsgId ? {
                    ...m,
                    text: fullText,
                    sources: sources || m.sources
                } : m));
            },
            provider,
            studyMetadata?.modality === 'PATH' ? 'pathology' : 'radiology',
            studyMetadata?.studyId
        );
    } catch (error: any) {
        // If cancelled, do not render error
        if (!activeRequestRef.current) return;

        // ERROR HANDLING
        console.error("Chat Error Caught in Component:", error);

        // 1. Remove the placeholder bot message
        setMessages(prev => prev.filter(m => m.id !== botMsgId));
        
        // 2. Restore input if it was typed by user (not a suggestion click)
        if (!promptOverride) {
            setInput(textToRestore);
        }

        // 3. Add Error Message Card
        const errorMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'error',
            text: error.message || "An unexpected error occurred.",
            originalPrompt: finalText // Save for retry
        };
        setMessages(prev => [...prev, errorMessage]);
        setIsPinnedToBottom(true);
    } finally {
        if (activeRequestRef.current) {
            setIsThinking(false);
            activeRequestRef.current = false;
        }
    }
  };

  const getProviderLabel = () => {
      switch(provider) {
          case 'openrouter': return byokModelLabel;
          case 'claude': return 'Claude Opus';
          case 'openai': return 'GPT-5.4 Pro';
          case 'gemini': return 'Gemini Pro';
          default: return provider;
      }
  };

  const getLearnerLevelShortLabel = (id: string) => {
      switch(id) {
          case 'highschool': return "HS";
          case 'undergrad': return "Undergrad";
          case 'ms_preclinical': return "Pre-Step 1";
          case 'ms_clinical': return "Post-Step 1";
          case 'resident': return "Resident";
          default: return "Gen";
      }
  };

  const getLearnerLevelTooltip = (id: string) => {
      switch(id) {
          case 'highschool': return "High school level explanation";
          case 'undergrad': return "Undergraduate biology/pre-med";
          case 'ms_preclinical': return "Pre-clinical medical student (MS1-MS2, Step 1 focus)";
          case 'ms_clinical': return "Clinical medical student (MS3-MS4, Step 2 focus)";
          case 'resident': return "Resident level explanation";
          default: return "";
      }
  };

  const hasCapturedImage = !!attachedScreenshot;

  return (
    <div data-tour-id="ai-panel" className="flex flex-col h-full bg-[#0f1011]">
      {/* Main Header */}
      <div className="h-14 bg-[#161718] border-b border-white/[0.06] px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 text-[#f7f8f8] font-bold">
          <Sparkles className="w-4 h-4 text-blue-400" /> <span>AI Tutor</span>
          {onStartTour && (
              <button
                  onClick={onStartTour}
                  className="ml-2 text-[10px] text-blue-300 hover:text-white flex items-center gap-1 transition-colors"
                  title="Tour the AI tutor"
              >
                  <HelpCircle className="w-3.5 h-3.5" />
              </button>
          )}
        </div>
        <button
            data-tour-id="ai-trash"
            onClick={handleClearChat}
            className="p-1.5 rounded-lg bg-[#1e1f21] border border-white/[0.08] text-[#8a8f98] hover:text-red-400 hover:border-red-500/50 transition-colors"
            title="Clear Chat / New Conversation"
        >
            <Trash2 className="w-4 h-4" />
        </button>
      </div>
      
      {/* Status Bar */}
      <div className="bg-[#161718]/50 border-b border-white/[0.06] p-2 flex items-center justify-between text-[10px] flex-shrink-0">
          <div className="flex items-center gap-2">
              <span data-tour-id="ai-provider" className="text-[10px] text-blue-300/70 font-medium">
                {byokConnected ? `Powered by ${byokModelLabel}` : 'Bring your own AI'}
              </span>
              <button
                onClick={() => setShowConnectModal(true)}
                className="flex items-center gap-1 text-[10px] font-semibold text-blue-400 hover:text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/30 hover:border-blue-400/50 bg-blue-500/5 transition-colors"
                title={byokConnected ? 'Change model or disconnect' : 'Connect your OpenRouter account'}
              >
                <KeyRound className="w-2.5 h-2.5" />
                {byokConnected ? 'Change' : 'Connect'}
              </button>
          </div>
          <div className="flex items-center gap-1">
               {attachedScreenshot ? (
                   <span className="flex items-center gap-1 text-emerald-400 font-medium">
                       <ImageIcon className="w-3 h-3" />
                       Active {capturedSliceInfo && `(Slice ${capturedSliceInfo.slice})`}
                       {isAnalyzing && <span className="text-yellow-400 ml-1 animate-pulse">analyzing...</span>}
                       {sliceAnalysis && !isAnalyzing && <span className="text-emerald-500 ml-1">grounded</span>}
                   </span>
               ) : (
                   <span className="flex items-center gap-1 text-[#62666d]">
                       <ImageIcon className="w-3 h-3" />
                       No image context
                   </span>
               )}
          </div>
      </div>

      {/* Messages Container with Independent Scrolling Context */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        <div className="flex-1 relative min-h-0">
            <div 
                className="absolute inset-0 overflow-y-auto p-4 space-y-5 no-scrollbar" 
                ref={chatContainerRef}
                onScroll={handleScroll}
            >
                {messages.map((m) => {
                    if (m.role === 'error') {
                        return (
                            <div key={m.id} className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-2">
                                <div className="max-w-[90%] w-full bg-red-950/40 border border-red-500/30 rounded-xl p-3 flex items-start gap-3 shadow-lg">
                                    <div className="mt-0.5 p-1 bg-red-500/10 rounded-full">
                                        <AlertTriangle className="w-4 h-4 text-red-400" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-xs font-bold text-red-300 mb-1">AI Request Failed</div>
                                        <div className="text-xs text-red-200/80 leading-relaxed mb-2">
                                            {m.text}
                                        </div>
                                        <div className="text-[10px] text-red-400/60 mb-2">
                                            Your question has been preserved above.
                                        </div>
                                        {m.originalPrompt && (
                                            <button 
                                                onClick={() => handleSendMessage(m.originalPrompt)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs rounded-md border border-red-500/20 transition-colors"
                                            >
                                                <RotateCcw className="w-3 h-3" /> Retry Request
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    // THINKING BUBBLE (Render if role=model and text is empty)
                    if (m.role === 'model' && !m.text) {
                        let subtitleText = "";
                        const pLabel = getProviderLabel();
                        if (mode === 'deep_think') {
                            subtitleText = `${pLabel} is reasoning step by step before answering.`;
                        } else if (mode === 'search') {
                            subtitleText = `${pLabel} is searching and synthesizing key findings.`;
                        } else {
                            const levelLabels: Record<string, string> = {
                                highschool: "High school",
                                undergrad: "Undergrad",
                                ms_preclinical: "Pre-Step 1",
                                ms_clinical: "Post-Step 1",
                                resident: "Resident"
                            };
                            const label = levelLabels[learnerLevel] || "Med";
                            subtitleText = `${pLabel} is preparing a ${label}-level explanation.`;
                        }

                        return (
                            <div key={m.id} className="flex flex-col items-start animate-in fade-in slide-in-from-bottom-2 duration-300 w-full">
                                <div className="max-w-[95%] rounded-xl p-4 shadow-sm bg-[#161718] border border-white/[0.06]">

                                   {/* Title Row */}
                                   <div className="flex items-center gap-2 mb-2">
                                       <Sparkles className="w-4 h-4 text-blue-400 animate-pulse" />
                                       <span className="text-blue-100 font-bold text-sm">Teaching in progress</span>
                                   </div>

                                   {/* Subtitle */}
                                   <div className="text-xs text-[#d0d6e0] mb-3 leading-relaxed font-medium">
                                       {subtitleText}
                                   </div>

                                   {/* Status Row */}
                                   <div className="flex items-center gap-2 text-xs text-[#8a8f98]">
                                       <div className="flex space-x-1">
                                            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-[bounce_1s_infinite_-0.3s]"></div>
                                            <div className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-[bounce_1s_infinite_-0.15s]"></div>
                                            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-[bounce_1s_infinite]"></div>
                                       </div>
                                       <span className="text-blue-200/60">Generating your answer...</span>
                                   </div>
                                </div>
                            </div>
                        );
                    }

                    return (
                    <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[95%] rounded-xl p-3 shadow-sm ${m.role === 'user' ? 'bg-[#1e1f21] text-[#d0d6e0] border-l-2 border-blue-500/30' : 'bg-[#161718] text-[#d0d6e0] border border-white/[0.06]'}`}>
                            
                            {/* New Thumbnail Header for Model */}
                            {m.role === 'model' && m.attachedSliceThumbnailDataUrl && (
                                <div className="flex items-center gap-3 mb-3 pb-3 border-b border-white/10">
                                    <img 
                                        src={m.attachedSliceThumbnailDataUrl} 
                                        className="w-16 h-16 rounded object-cover border border-white/10 bg-black/50"
                                        alt="Analyzed Slice"
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Teaching context</span>
                                        <span className="text-[11px] text-slate-300 font-medium">
                                        Slice {m.attachedSliceIndex ?? '?'} • {m.attachedSequenceLabel || 'Brain MRI series'}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {m.hasAttachment && m.role === 'user' && (
                                <div
                                    className="mb-2 text-xs text-blue-300 bg-blue-950/50 px-2 py-1 rounded w-fit flex gap-1 cursor-help"
                                    title="The AI is using the slice you captured for this question."
                                >
                                    <ImageIcon className="w-3 h-3"/> Using captured slice
                                </div>
                            )}
                            
                            <MarkdownText content={m.text} />
                            {m.sources && m.sources.length > 0 && (
                                <div className="mt-3 pt-2 border-t border-white/10">
                                    <div className="text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1"><Globe className="w-3 h-3"/> Sources</div>
                                    {m.sources.map((src, i) => <a key={i} href={src.uri} target="_blank" className="block text-xs text-blue-400 truncate hover:underline">{src.title || src.uri}</a>)}
                                </div>
                            )}
                        </div>
                    </div>
                )})}

                {!isThinking && currentSuggestions.length > 0 && (
                    <div data-tour-id="ai-suggestions" className="mt-3 animate-in fade-in duration-300">
                        <div className="mb-2 text-[10px] text-slate-500 uppercase font-bold ml-1">
                            Suggested Follow-ups
                        </div>
                        {/* Dynamic Suggestion Chips */}
                        <div className="flex flex-wrap gap-2 mb-4">
                            {currentSuggestions.map((sugg, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleSendMessage(sugg)}
                                    className="text-left text-xs bg-[#1e1f21] hover:bg-[#28282c] text-blue-200 px-3 py-1.5 rounded-full border border-white/[0.08] transition-all active:scale-95"
                                >
                                    {sugg}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Jump To Latest Pill */}
            {!isPinnedToBottom && (
                <button
                    onClick={scrollToBottom}
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#1e1f21]/90 hover:bg-[#28282c] text-blue-300 border border-blue-500/30 shadow-lg rounded-full px-4 py-1.5 text-xs font-bold flex items-center gap-2 transition-all animate-in fade-in slide-in-from-bottom-2 z-10 backdrop-blur-sm"
                >
                    <ArrowDown className="w-3.5 h-3.5" />
                    Jump to latest
                </button>
            )}
        </div>

        {/* Capture Toast */}
        {showCaptureToast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-900/90 text-emerald-100 px-4 py-2 rounded-full shadow-xl border border-emerald-500/50 flex items-center gap-2 text-xs z-20 animate-in slide-in-from-top-4 fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Captured slice. All AI modes will now see this image.</span>
            </div>
        )}

        <div className="p-4 bg-[#161718] border-t border-white/[0.06] flex-shrink-0">
            {/* Attached Image Preview */}
            {attachedScreenshot && (
                <div className="relative inline-block border border-blue-500 rounded overflow-hidden shadow-lg group mb-3">
                    <img src={attachedScreenshot} alt="Snapshot" className="h-16 w-auto opacity-80 group-hover:opacity-100 transition-opacity" />
                    <button onClick={() => { onClearCapture(); setDynamicSuggestionsMap(null); }} className="absolute top-0 right-0 bg-black/50 hover:bg-red-500 text-white p-0.5"><X className="w-3 h-3" /></button>
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-white px-1 text-center truncate">
                        {capturedSliceInfo ? `Slice ${capturedSliceInfo.slice}` : 'Captured'}
                    </div>
                </div>
            )}
            
            {/* Compact Learner Level Row */}
            <div data-tour-id="teaching-levels" className="flex items-center justify-end mb-2 gap-2 text-[11px] text-[#8a8f98]">
                <div className="inline-flex items-center rounded-lg bg-[#0f1011]/50 border border-white/[0.08] p-0.5 gap-0.5">
                    <button type="button" onClick={() => { setLearnerLevel('highschool'); setShowMedPicker(false); }}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${learnerLevel === 'highschool' ? 'bg-blue-600 text-white shadow-sm' : 'text-[#8a8f98] hover:bg-[#1e1f21] hover:text-[#d0d6e0]'}`}>
                      HS
                    </button>
                    <button type="button" onClick={() => { setLearnerLevel('undergrad'); setShowMedPicker(false); }}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${learnerLevel === 'undergrad' ? 'bg-blue-600 text-white shadow-sm' : 'text-[#8a8f98] hover:bg-[#1e1f21] hover:text-[#d0d6e0]'}`}>
                      Undergrad
                    </button>
                    {/* Med button with popover */}
                    <div className="relative">
                      <button type="button" onClick={() => setShowMedPicker(prev => !prev)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${(learnerLevel === 'ms_preclinical' || learnerLevel === 'ms_clinical') ? 'bg-blue-600 text-white shadow-sm' : 'text-[#8a8f98] hover:bg-[#1e1f21] hover:text-[#d0d6e0]'}`}>
                        Med{(learnerLevel === 'ms_preclinical' || learnerLevel === 'ms_clinical') ? (learnerLevel === 'ms_preclinical' ? ' (Pre)' : ' (Post)') : ''}
                      </button>
                      {showMedPicker && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex gap-1 bg-[#1e1f21] border border-white/[0.12] rounded-lg p-1 shadow-xl z-30 whitespace-nowrap">
                          <button type="button" onClick={() => { setLearnerLevel('ms_preclinical'); setShowMedPicker(false); }}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${learnerLevel === 'ms_preclinical' ? 'bg-blue-600 text-white' : 'text-[#8a8f98] hover:bg-[#2a2d35] hover:text-white'}`}>
                            Pre-Step 1
                          </button>
                          <button type="button" onClick={() => { setLearnerLevel('ms_clinical'); setShowMedPicker(false); }}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${learnerLevel === 'ms_clinical' ? 'bg-blue-600 text-white' : 'text-[#8a8f98] hover:bg-[#2a2d35] hover:text-white'}`}>
                            Post-Step 1
                          </button>
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-[#1e1f21]" />
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={() => { setLearnerLevel('resident'); setShowMedPicker(false); }}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${learnerLevel === 'resident' ? 'bg-blue-600 text-white shadow-sm' : 'text-[#8a8f98] hover:bg-[#1e1f21] hover:text-[#d0d6e0]'}`}>
                      Resident
                    </button>
                </div>
            </div>

            {/* Input Area */}
            <div className="relative flex gap-3 items-center">
                <div className="relative group">
                    <button
                        onClick={handleCapture}
                        title="Capture the current slice so the AI can see it."
                        aria-label="Capture current slice as context"
                        className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all ${
                            attachedScreenshot
                            ? 'bg-blue-900/60 border-blue-500/50 text-blue-200 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                            : 'bg-blue-900/40 border-blue-700/50 text-blue-200 hover:bg-blue-800'
                        }`}
                    >
                        <Camera className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="relative flex-1">
                    <input
                        className="w-full bg-[#0f1011] border border-white/[0.08] rounded-lg pr-10 pl-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none text-[#d0d6e0] placeholder:text-[#62666d] shadow-inner" 
                        placeholder={mode === 'deep_think' ? "Ask complex question..." : "Ask a question..."} 
                        value={input} 
                        onChange={(e) => setInput(e.target.value)} 
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} 
                        disabled={isThinking}
                    />
                    <button 
                        onClick={() => handleSendMessage()} 
                        disabled={(!input.trim() && !attachedScreenshot) || isThinking} 
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-blue-500 hover:text-blue-400 disabled:opacity-50 transition-colors"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Dynamic Status / Hint Footer */}
            <div data-tour-id="image-status" className="mt-2 text-[11px] text-[#8a8f98] leading-tight min-h-[20px] flex items-center justify-between">
                {isThinking ? (
                    <div className="w-full flex items-center justify-between bg-blue-900/10 border border-blue-500/20 rounded-lg px-3 py-2 animate-in fade-in">
                        <div className="flex items-center gap-2.5">
                            <div className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                            </div>
                            <span className="text-blue-200 font-medium">{getProviderLabel()} is thinking... <span className="text-blue-400/70 text-[10px] ml-1">(~10s)</span></span>
                        </div>
                        <button
                            onClick={handleCancel}
                            className="flex items-center gap-1.5 px-2 py-1 hover:bg-white/5 rounded text-[#8a8f98] hover:text-white transition-colors"
                        >
                            <span className="text-[10px] font-bold uppercase tracking-wider">Cancel</span>
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                ) : (
                    <div className="w-full">
                         {!hasCapturedImage ? (
                            <span>No image attached. Click the camera to capture the current slice before asking image questions.</span>
                        ) : (
                            <span>
                                Using last captured slice: <span className="text-slate-200 font-mono">{capturedSliceInfo?.slice}</span>
                                {capturedSliceInfo?.total && <span className="text-slate-500"> / {capturedSliceInfo.total}</span>}
                                {<span className="text-slate-400"> ({capturedSliceInfo?.label || "MRI series"})</span>}
                                . Click the camera again to update.
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
      </div>

      {showConnectModal && <ConnectKeyModal onClose={() => setShowConnectModal(false)} />}
    </div>
  );
};

export default AiAssistantPanel;
