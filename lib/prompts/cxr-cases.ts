/**
 * CXR Case Context Blocks
 * Appended to the base radiology system prompt when a CXR case is active.
 * All content has been reviewed and corrected per board-alignment audits.
 */

export const CXR_CASE_CONTEXTS: Record<string, string> = {

// ═══════════════════════════════════════════════════════════════════════════
// PNEUMOTHORAX
// ═══════════════════════════════════════════════════════════════════════════
'cxr-pneumothorax': `
=== CASE CONTEXT: TENSION PNEUMOTHORAX ===

CLINICAL CONTEXT:
This is a left-sided tension pneumothorax in a 21-year-old male. PA chest
radiograph. The patient is a tall, thin male presenting with sudden-onset
left-sided pleuritic chest pain, progressive dyspnea, tachycardia,
hypotension, hypoxia, and absent left-sided breath sounds. This is a
classic presentation of primary spontaneous pneumothorax that has
progressed to tension physiology. Tension pneumothorax is a clinical
emergency requiring immediate intervention; delay for imaging should not
occur if the diagnosis is clinically evident, but in this case the
radiograph was obtained and confirms the diagnosis.

KNOWN DIAGNOSIS:
Left-sided tension pneumothorax.

KEY RADIOGRAPHIC FINDINGS:
1. Absent lung markings in the left hemithorax laterally and apically,
   indicating air in the pleural space with no underlying lung parenchyma
   visible in these regions.
2. Mediastinal shift to the right, seen as displacement of the heart,
   trachea, and mediastinal structures away from the affected side. This
   is the hallmark of tension physiology.
3. Collapsed left lung, visible as an opacified mass near the left hilum
   where the lung parenchyma has retracted.
4. Possible flattening or inversion of the left hemidiaphragm (tension
   effect of positive intrapleural pressure).
5. The right lung appears normally aerated for comparison.

TEACHING APPROACH:
Use a question-first approach. Do NOT reveal the diagnosis immediately. Guide
the student to identify findings step by step:
  Step 1: Ask what they notice about symmetry between the two sides.
  Step 2: Ask them to describe where lung markings are present vs absent.
  Step 3: Ask about the position of the heart and trachea.
  Step 4: Ask what could cause air in the pleural space.
  Step 5: Ask what differentiates this from a simple pneumothorax.
CONFIRM the diagnosis only after the student has identified the key
findings (absent lung markings, mediastinal shift) or has explicitly
stated "tension pneumothorax." If the student is stuck after 2-3
attempts at any step, provide a targeted hint rather than the answer.

TEACHING PEARLS:
1. Tension pneumothorax is a CLINICAL diagnosis, not a radiographic one.
   In a real emergency, you do not wait for an X-ray if the patient has
   absent breath sounds, tracheal deviation, hypotension, and JVD. You
   decompress immediately. This case has an X-ray for educational
   purposes; in practice, obtaining imaging should never delay treatment
   of suspected tension pneumothorax. In a hemodynamically unstable
   patient with these exam findings, obtaining imaging before
   decompression constitutes a management error.

2. The mechanism of tension physiology: a one-way valve effect allows air
   to enter the pleural space during inspiration but prevents it from
   escaping during expiration. Intrapleural pressure rises progressively,
   compressing the ipsilateral lung (collapse), shifting the mediastinum
   to the contralateral side, compressing the contralateral lung, and
   compressing the great vessels (SVC/IVC) and cardiac chambers, which
   reduces venous return and causes obstructive shock. The traditional
   teaching describes "kinking" of the great vessels; more precisely,
   elevated intrathoracic pressure compresses the SVC/IVC and cardiac
   chambers, impeding venous return. Recent evidence also implicates
   severe hypoxia from pulmonary shunting as a major contributor to
   cardiovascular collapse. Death results from cardiovascular collapse,
   not respiratory failure alone. Tension pneumothorax is one of the
   reversible "Ts" in the Hs and Ts mnemonic for PEA (Hypovolemia,
   Hypoxia, Hydrogen ion/acidosis, Hypo/Hyperkalemia, Hypothermia;
   Tension pneumothorax, Tamponade, Toxins, Thrombosis/PE).

3. Primary spontaneous pneumothorax occurs most commonly in tall, thin
   males aged 15-35, due to rupture of apical subpleural blebs. Smoking
   increases risk approximately 22-fold in men and 9-fold in women
   (Bense et al., 1987), with a dose-response relationship. Despite the
   "spontaneous" label, these patients have subclinical apical bullous
   disease. Laterality is approximately equal, with some series showing
   a very slight left-sided predominance (~48% left vs. ~51% right),
   though this difference is not clinically significant. Connect the
   one-way valve mechanism to Boyle's Law for pre-med students: during
   inspiration, thoracic volume increases and intrapleural pressure drops,
   creating a pressure gradient that draws air through the pleural defect.

4. Tension pneumothorax vs. simple pneumothorax on imaging: the critical
   differentiator is mediastinal shift. A simple pneumothorax shows air
   in the pleural space and partial lung collapse, but the mediastinum
   remains midline. Once the mediastinum shifts away from the affected
   side, this indicates positive pressure buildup (tension physiology).

5. Needle decompression: 14- or 16-gauge angiocatheter. Standard length
   is 5 cm (ATLS), though 8 cm is recommended by TCCC and increasingly
   favored due to high failure rates with 5 cm needles; a 2025 meta-
   analysis suggests 7 cm as optimal. ATLS 10th edition (2018) changed
   the primary recommended site to the 4th/5th ICS, anterior axillary
   line (AAL), based on evidence that chest wall thickness is less at
   this site (failure rate approximately 13% at AAL vs. 33-38% at 2nd
   ICS MCL in systematic reviews). However, the 2nd ICS MCL remains
   widely taught for board exams and is recommended by the ETC. A 2025
   meta-analysis suggests the 2nd ICS MCL may be safer for left-sided
   decompression due to cardiac injury risk at lateral sites. For USMLE
   purposes, know both sites and their rationale.

6. Definitive management: tube thoracostomy. BTS 2023 and ERS/EACTS/ESTS
   2024 guidelines recommend small-bore chest tubes (14 Fr or smaller) as
   first-line for spontaneous pneumothorax in stable, non-ventilated
   patients. Larger tubes (24-32 Fr) are reserved for hemothorax,
   mechanically ventilated patients, or persistent large air leaks.

7. Re-expansion pulmonary edema (RPE): occurs in 0.5-1% of cases.
   Historically reported mortality is approximately 20% (Mahfood et al.,
   1988), though more recent series suggest many cases are self-limited
   with milder presentations. The condition should still be considered
   potentially life-threatening.

8. VATS indications: recurrent ipsilateral pneumothorax, first
   contralateral episode, persistent air leak >5-7 days, high-risk
   occupation (pilot, diver), bilateral pneumothorax, hemopneumothorax.
   Recurrence rate drops from ~30% (observation) to 2-5% after VATS
   with pleurodesis (up to 14% without pleurodesis).

=== END CASE CONTEXT ===
`,

// ═══════════════════════════════════════════════════════════════════════════
// PNEUMONIA
// ═══════════════════════════════════════════════════════════════════════════
'cxr-pneumonia': `
=== CASE CONTEXT: LOBAR PNEUMONIA ===

CLINICAL CONTEXT:
This is a PA chest X-ray showing right middle lobe lobar pneumonia in a
67-year-old male. The patient presents with 3 days of productive cough
with purulent sputum, fever (38.6 C), rigors, and mild dyspnea. PMH:
COPD (FEV1 55% predicted), 30 pack-year smoking history (quit 5 years
ago), hypertension, pre-diabetes. Vitals: HR 98, BP 135/82, RR 22,
SpO2 93% on room air. Exam: bronchial breath sounds over right anterior
chest, egophony, dullness to percussion. WBC 15,200 with left shift.
Procalcitonin 2.4 ng/mL. Nasopharyngeal culture: Moraxella catarrhalis.

KNOWN DIAGNOSIS:
RIGHT MIDDLE LOBE LOBAR PNEUMONIA (community-acquired, Moraxella catarrhalis).

KEY RADIOGRAPHIC FINDINGS:
- Dense homogeneous consolidation in the right middle lobe
- Silhouette sign: loss of the right heart border (the right middle lobe
  is anterior and medial; when it consolidates, it obscures the adjacent
  right heart border)
- Air bronchograms may be visible within the consolidation
- Costophrenic angles should be evaluated for parapneumonic effusion
- Left lung is clear; no contralateral disease
- No pneumothorax, no mediastinal shift

When a student identifies the consolidation correctly, CONFIRM IT CLEARLY
and then probe deeper.

TEACHING PEARLS:

1. "The silhouette sign is your best friend for lobe localization on a
   frontal CXR. If the right heart border disappears, the pathology is in
   the right middle lobe or lingula. If the right hemidiaphragm
   disappears, it is in the right lower lobe."

2. "Air bronchograms prove the opacity is consolidation (alveoli filled
   with fluid/pus), not a pleural effusion or a mass."

3. "Moraxella catarrhalis is a gram-negative diplococcus that almost
   universally produces beta-lactamase. Amoxicillin alone will fail;
   amoxicillin-clavulanate, a respiratory fluoroquinolone, or a macrolide
   is needed."

4. "Lobar pneumonia classically suggests a typical bacterial pathogen:
   S. pneumoniae, H. influenzae, Moraxella catarrhalis, Klebsiella.
   Atypical organisms (Mycoplasma, Chlamydophila, Legionella) tend to
   produce patchy/interstitial patterns, though overlap exists."

5. "Organisms by age: neonates (GBS, E. coli); children 4 weeks-5 years
   (RSV, parainfluenza, S. pneumoniae, H. influenzae type B); school-age
   5-18 years (Mycoplasma, Chlamydophila, S. pneumoniae); young adults
   (Mycoplasma, Chlamydophila); elderly/COPD (S. pneumoniae, H.
   influenzae, Moraxella, Klebsiella, Legionella); alcoholics (Klebsiella,
   anaerobes); post-influenza (S. aureus)."

6. "Parapneumonic effusions complicate 20-40% of bacterial pneumonias.
   Complicated parapneumonic effusion (pH < 7.20, glucose < 60, LDH >
   1000, positive Gram stain or culture, loculations, or frank pus)
   requires chest tube drainage. pH < 7.20 is the single most accurate
   predictor."

7. "ATS/IDSA 2019 CAP guidelines: outpatient healthy (amoxicillin or
   doxycycline; macrolide monotherapy only if local resistance < 25%);
   outpatient with comorbidities (respiratory FQ alone, or oral
   beta-lactam [amoxicillin-clavulanate, cefpodoxime, or cefuroxime] +
   macrolide); inpatient non-ICU (respiratory FQ alone, or beta-lactam +
   macrolide); inpatient ICU (beta-lactam + macrolide, or beta-lactam +
   respiratory FQ)."

8. "CURB-65: Confusion, Urea > 7 mmol/L (BUN > 19), RR >= 30, BP
   systolic < 90 or diastolic <= 60, Age >= 65. Score 0-1: outpatient.
   Score 2: short inpatient or closely supervised outpatient. Score 3-5:
   inpatient, consider ICU if 4-5. PSI/PORT: Classes I-II outpatient,
   Class III observation/short stay, Classes IV-V inpatient with Class V
   prompting ICU evaluation."

9. "Lung abscess: ampicillin-sulbactam is preferred first-line
   (clindamycin is an alternative but carries higher C. difficile risk).
   Drainage if > 6 cm or failing medical therapy."

10. "Procalcitonin > 0.25 ng/mL supports bacterial etiology; serial
    measurement can guide antibiotic duration. ATS/IDSA 2019 recommends
    NOT withholding initial empiric antibiotics based on low procalcitonin
    if clinical suspicion for CAP is high."

11. "Distinguish lobar pneumonia (uniform consolidation of one lobe,
    S. pneumoniae, four classic stages: congestion, red hepatization, gray
    hepatization, resolution) from bronchopneumonia (patchy consolidation
    centered on bronchioles, multiple organisms) from interstitial/atypical
    pneumonia (diffuse alveolar septal inflammation, Mycoplasma, viruses)."

=== END CASE CONTEXT ===
`,

// ═══════════════════════════════════════════════════════════════════════════
// CHF / PULMONARY EDEMA
// ═══════════════════════════════════════════════════════════════════════════
'cxr-chf': `
=== CASE CONTEXT: CHF / PULMONARY EDEMA ===

CLINICAL CONTEXT:
This is an acute decompensated heart failure (ADHF) case with pulmonary
edema on PA chest radiograph. The patient is a 68-year-old male with
known HFrEF (EF 30%), hypertension, type 2 diabetes, CKD stage 3a, and
atrial fibrillation. He presents with progressive dyspnea, orthopnea,
paroxysmal nocturnal dyspnea, and bilateral lower extremity edema after
running out of his diuretic medication 10 days ago. The chest X-ray
demonstrates the classic constellation of findings seen in congestive
heart failure with pulmonary edema. The image contains minor annotations
(circled cephalization, arrow marking effusions).

KNOWN DIAGNOSIS:
Acute decompensated heart failure with pulmonary edema (cardiogenic).

KEY RADIOGRAPHIC FINDINGS:
1. Cardiomegaly: the cardiac silhouette exceeds 50% of the thoracic
   diameter (the cardiothoracic ratio). Reflects chronic ventricular
   dilation.
2. Cephalization (apical vascular redistribution): upper lobe pulmonary
   vessels are prominent and equal to or larger than the lower lobe
   vessels. One of the earliest CXR signs of elevated pulmonary venous
   pressure (PCWP approximately 12-18 mmHg). The image has a circled
   annotation highlighting this finding.
3. Bilateral pleural effusions: fluid in both pleural spaces blunting
   the costophrenic angles. An arrow annotation marks this finding.
   CHF effusions are typically bilateral (right >= left), related to
   greater right pleural surface area.
4. Pulmonary edema pattern: bilateral perihilar/central haziness
   ("bat-wing" pattern) representing alveolar edema from transudation
   at elevated capillary pressures (PCWP > 25 mmHg).
5. Possible Kerley B lines: short (1-2 cm) horizontal lines at the
   lung periphery, representing thickened interlobular septa from
   interstitial edema (PCWP approximately 18-25 mmHg).
6. Peribronchial cuffing: thickening of bronchial walls from
   interstitial edema.

TEACHING APPROACH:
Use a question-first approach. Guide the student step by step:
  Step 1: Heart size (normal or enlarged?).
  Step 2: Blood vessels at top vs. bottom (cephalization).
  Step 3: Costophrenic angles (sharp or blunted?).
  Step 4: Lung fields (clear or hazy?).
  Step 5: Unifying diagnosis connecting all findings.
CONFIRM after the student identifies 2-3 key findings or states "heart
failure" or "pulmonary edema."

TEACHING PEARLS:

1. "ABCDE mnemonic for CXR findings in CHF: A = Alveolar edema / Air
   bronchograms, B = Kerley B lines (1-2 cm horizontal lines at lung
   periphery), C = Cardiomegaly (CTR > 0.5 on PA), D = Dilated upper
   lobe vessels (cephalization), E = Effusions (bilateral, right >= left)."

2. "CXR findings correlate with PCWP in a predictable sequence:
   cephalization (12-18 mmHg), then Kerley B lines and peribronchial
   cuffing (interstitial edema, 18-25 mmHg), then frank alveolar edema
   (> 25 mmHg). This patient has all three stages."

3. "Cardiogenic vs. non-cardiogenic pulmonary edema: cardiogenic shows
   central/perihilar bat-wing distribution, cardiomegaly, cephalization,
   Kerley B lines, and pleural effusions. Non-cardiogenic (ARDS) shows
   diffuse bilateral opacities, NORMAL heart size, NO cephalization, and
   typically NO effusions. Air bronchograms are actually more
   characteristic of ARDS than cardiogenic edema."

4. "BNP interpretation: BNP > 400 pg/mL strongly suggestive of CHF.
   BNP 100-400 is the gray zone. BNP < 100 rules out CHF. NT-proBNP
   uses three age brackets: >= 450 if age < 50, >= 900 if age 50-75,
   >= 1800 if age > 75. NT-proBNP < 300 pg/mL rules out acute HF
   across all age groups. Obesity falsely lowers BNP; renal failure
   falsely elevates it."

5. "Stevenson hemodynamic classification: Warm-dry (Profile A) =
   compensated. Warm-wet (Profile B) = most common ADHF, adequate
   perfusion but volume overloaded, treat with IV diuretics and
   vasodilators. Cold-wet (Profile C) = low output plus congestion,
   may need inotropes. Cold-dry (Profile L) = rare, may need volume.
   Hemodynamic definitions: Wet = PCWP >= 18 mmHg; Cold = cardiac
   index < 2.2 L/min/m2."

6. "NIPPV (CPAP or BiPAP) has Class IIa evidence (2022 AHA/ACC
   guidelines) for reducing intubation rates and improving symptoms
   in acute pulmonary edema. Strong meta-analytic support but the
   largest RCT (3CPO) showed symptom improvement without significant
   mortality or intubation reduction."

7. "Four pillars of GDMT for HFrEF: ARNI (or ACEi/ARB), beta-blocker
   (carvedilol, metoprolol succinate, bisoprolol), MRA (spironolactone
   or eplerenone), SGLT2i (dapagliflozin or empagliflozin). Do not
   start beta-blockers during acute decompensation."

8. "Morphine is now discouraged by AHA guidelines due to association
   with increased intubation rates and ICU admission (ADHERE registry
   data)."

=== END CASE CONTEXT ===
`,

// ═══════════════════════════════════════════════════════════════════════════
// PLEURAL EFFUSION
// ═══════════════════════════════════════════════════════════════════════════
'cxr-effusion': `
=== CASE CONTEXT: MASSIVE PLEURAL EFFUSION ===

CLINICAL CONTEXT:
This is a massive left-sided pleural effusion on PA chest radiograph. The
image shows complete opacification of the left hemithorax with contralateral
(rightward) mediastinal shift. The patient is a 58-year-old male with a
40-pack-year smoking history and underlying lung cancer (left upper lobe
adenocarcinoma, stage IVA, EGFR wild-type, PD-L1 TPS 60%). He presents
with progressive dyspnea over 3 weeks, 15-pound weight loss, left pleuritic
chest pain, and orthopnea. This is a classic presentation of malignant
pleural effusion.

KNOWN DIAGNOSIS:
Massive left-sided pleural effusion, malignant (secondary to lung cancer).

KEY RADIOGRAPHIC FINDINGS:
- Complete opacification (white-out) of the left hemithorax
- Contralateral (rightward) mediastinal shift, indicating the effusion is
  under pressure and displacing midline structures
- Loss of the left hemidiaphragm silhouette
- Loss of the left costophrenic angle
- Loss of the left cardiac border (silhouette sign)
- Meniscus sign is NOT visible because the effusion is too large
- Right lung appears clear
- No visible rib lesions or bony metastases on this film

TEACHING APPROACH:
Use a question-first approach. Guide the student:
  Step 1: Compare the two sides of the chest.
  Step 2: Ask what could cause complete opacification of one hemithorax.
  Step 3: Ask about the direction of mediastinal shift and what it means.
  Step 4: Ask about the differential for a unilateral white-out.
  Step 5: Ask how they would characterize the fluid (transudative vs
          exudative).
CONFIRM after the student identifies the key findings or states "pleural
effusion."

TEACHING PEARLS:

1. "Mediastinal shift tells you volume. A pleural effusion that shifts the
   mediastinum AWAY from the affected side is massive and under pressure.
   If the mediastinum does NOT shift (or shifts TOWARD the effusion),
   suspect endobronchial obstruction causing concurrent lung collapse, or
   trapped lung. Absent mediastinal shift is a red flag that pleurodesis
   may fail."

2. "Light's criteria: pleural fluid is an exudate if ANY one of three
   criteria is met: (a) pleural fluid protein / serum protein > 0.5,
   (b) pleural fluid LDH / serum LDH > 0.6, (c) pleural fluid LDH >
   2/3 the upper limit of normal for serum LDH. Sensitivity ~98% for
   exudates. If Light's criteria call it an exudate but you suspect a
   transudate, check the serum-effusion albumin gradient (SEAG = serum
   albumin minus pleural fluid albumin); SEAG > 1.2 g/dL reclassifies
   as transudate. Useful in CHF patients on diuretics where Light's
   misclassifies approximately 25% of transudates."

3. "A complete white-out has a short differential: (a) massive pleural
   effusion (contralateral mediastinal shift), (b) complete lung
   collapse/atelectasis from endobronchial obstruction (ipsilateral
   mediastinal shift), (c) pneumonectomy (surgical clips, no shift),
   (d) extensive consolidation (air bronchograms may be present). The
   direction of mediastinal shift is the single most important
   discriminator."

4. "Malignant effusions are the most common cause of massive effusions.
   Top causes: lung cancer, breast cancer, lymphoma. Cytology from a
   single thoracentesis has ~60% sensitivity; a second sample increases
   to ~75%. Thoracoscopic biopsy: 90-97%."

5. "Classify effusions: transudative (CHF, cirrhosis, nephrotic
   syndrome) vs. exudative (pneumonia, malignancy, TB, PE, RA,
   pancreatitis). PE usually causes exudative effusions via increased
   capillary permeability but can occasionally cause transudative
   effusions via right heart failure; the default board answer is
   exudative."

6. "Complicated parapneumonic effusion criteria requiring drainage:
   pH < 7.20 (most accurate single predictor), glucose < 60 mg/dL,
   LDH > 1,000, positive Gram stain or culture, loculations on imaging,
   or frank pus (empyema)."

7. "Re-expansion pulmonary edema: traditional teaching recommends
   limiting drainage to 1,000-1,500 mL per session. Recent evidence
   (Feller-Kopman et al., 2007) suggests RPE is rare (< 1%) even with
   larger volumes, and symptom-guided drainage (stop for cough, chest
   tightness, or pleural pressure < -20 cmH2O) may be more important
   than a fixed volume cutoff. For board exams, 1,500 mL remains the
   standard answer."

8. "Malignant effusion management: expandable lung -> chemical pleurodesis
   (talc; success rate approximately 80-95% in published series) or IPC.
   Trapped/non-expandable lung -> IPC (spontaneous pleurodesis in ~45-50%
   over weeks to months). Asymptomatic MPE -> observation only per ATS
   guideline. Pleurodesis is contraindicated in trapped lung."

=== END CASE CONTEXT ===
`,

// ═══════════════════════════════════════════════════════════════════════════
// SMALL BOWEL OBSTRUCTION (Abdominal X-ray)
// ═══════════════════════════════════════════════════════════════════════════
'axr-sbo': `
=== CASE CONTEXT: SMALL BOWEL OBSTRUCTION ===

CLINICAL CONTEXT:
This is a small bowel obstruction (SBO) in a 45-year-old female with a
history of prior appendectomy. Upright abdominal radiograph. The patient
presents with 2 days of progressive crampy abdominal pain, abdominal
distension, nausea, and vomiting (initially bilious, now feculent). She
has not passed flatus for 24 hours and her last bowel movement was 3 days
ago. Vitals: HR 105, BP 118/76, T 37.8C, RR 18. Exam: abdomen distended
and tympanitic, diffuse tenderness without peritoneal signs, high-pitched
tinkling bowel sounds. Labs: WBC 11,200, lactate 1.4, BMP with BUN 28,
Cr 1.1, K 3.2, Cl 92. The most likely etiology is adhesive SBO from
prior surgery.

KNOWN DIAGNOSIS:
Small bowel obstruction (adhesive, from prior appendectomy).

KEY RADIOGRAPHIC FINDINGS:
1. Multiple dilated loops of small bowel (>3 cm diameter). Small bowel is
   identified by the valvulae conniventes (plicae circulares), which are
   thin mucosal folds that cross the entire lumen.
2. Multiple air-fluid levels at different heights within the same loop
   (differential air-fluid levels), which is characteristic of mechanical
   obstruction. This produces the classic "step-ladder" pattern on upright
   films.
3. Paucity of gas in the colon and rectum, suggesting complete or
   near-complete obstruction. Gas distal to the obstruction has been
   absorbed or passed.
4. No free air under the diaphragm (no pneumoperitoneum), which would
   suggest perforation.
5. Centrally located dilated loops (small bowel is central; large bowel
   is peripheral/frames the abdomen).

TEACHING APPROACH:
Use a question-first approach. Do NOT reveal the diagnosis immediately.
  Step 1: Ask what they notice about the bowel gas pattern.
  Step 2: Ask them to distinguish small bowel from large bowel.
  Step 3: Ask about the air-fluid levels and what they signify.
  Step 4: Ask them to look for gas in the colon/rectum.
  Step 5: Ask what could cause bowel to become blocked.
CONFIRM the diagnosis after the student identifies dilated small bowel
with air-fluid levels and absent distal gas, or states "small bowel
obstruction." If stuck after 2-3 attempts, provide a targeted hint.

TEACHING PEARLS:

1. "The 3-6-9 rule: small bowel is abnormally dilated at >3 cm, large
   bowel at >6 cm, and cecum at >9 cm. A cecum >12 cm is at risk for
   perforation."

2. "Small bowel vs. large bowel on X-ray: small bowel has valvulae
   conniventes (thin folds that cross the entire lumen, like rungs of a
   ladder). Large bowel has haustra (thick, incomplete folds that do NOT
   cross the entire lumen). Small bowel is central; large bowel frames
   the periphery."

3. "Adhesions from prior surgery are the #1 cause of SBO (60-75% of
   cases). The top 3 causes: adhesions, hernias, and tumors. Always ask
   about surgical history."

4. "Air-fluid levels at DIFFERENT heights within the same loop are
   characteristic of mechanical obstruction. In paralytic ileus,
   air-fluid levels tend to be at the SAME height, and both small and
   large bowel are diffusely dilated without a clear transition point."

5. "Obstipation (complete absence of gas and stool passage) = complete
   obstruction. Partial SBO may still allow some gas to pass distally.
   This distinction matters for management: complete SBO is more likely
   to require surgery."

6. "The transition point is where dilated bowel meets decompressed bowel.
   CT with IV contrast (not oral) is the next step to identify the
   transition point, assess for strangulation (bowel wall thickening,
   mesenteric haziness, reduced enhancement), and determine etiology."

LEARNING OBJECTIVES BY LEVEL:

HIGH SCHOOL:
- Understand that food moves through a long tube (intestine) and can get
  blocked like a clogged pipe
- Recognize that the black areas on the X-ray are gas, and too much gas
  in swollen loops means something is stuck
- Know that surgery scars inside the body can cause the intestine to
  stick together and block

UNDERGRADUATE:
- Identify dilated small bowel loops on an abdominal X-ray
- Understand the difference between small bowel and large bowel
  appearance on radiograph (valvulae conniventes vs. haustra)
- Know the 3-6-9 rule for abnormal bowel dilation
- Understand that air-fluid levels form when gas rises above fluid in an
  obstructed, fluid-filled loop

MEDICAL STUDENT (STEP 1 and STEP 2):
Step 1 concepts:
- Pathophysiology of SBO: mechanical obstruction causes proximal dilation
  from swallowed air and accumulated secretions (the small bowel secretes
  several liters of fluid daily). Distension leads to third-spacing,
  dehydration, and electrolyte abnormalities (hypokalemic, hypochloremic
  metabolic alkalosis from vomiting).
- Strangulation: when blood supply is compromised (closed-loop
  obstruction, volvulus, or incarcerated hernia). Leads to ischemia,
  necrosis, perforation, and sepsis.
- Distinguish mechanical SBO from paralytic ileus: mechanical has
  differential air-fluid levels, dilated small bowel with decompressed
  colon, and high-pitched bowel sounds. Ileus has diffuse dilation of
  both small and large bowel, air-fluid levels at similar heights, and
  absent/hypoactive bowel sounds.

Step 2 concepts:
- Initial management: NPO, NG tube decompression, aggressive IV fluid
  resuscitation (NS with K+ repletion), Foley for urine output
  monitoring. Correct electrolytes.
- CT abdomen/pelvis with IV contrast (no oral) is the study of choice
  to confirm diagnosis, identify transition point, and evaluate for
  strangulation.
- Indications for surgery: complete obstruction, signs of strangulation
  (fever, tachycardia, peritoneal signs, elevated lactate, CT findings
  of compromised bowel), failure to improve with conservative management
  after 48-72 hours.
- Water-soluble contrast challenge (Gastrografin): both diagnostic and
  therapeutic. If contrast reaches the colon within 24 hours, the
  obstruction is likely to resolve nonoperatively. Also has an osmotic
  effect that may help resolve partial SBO.

RESIDENT:
- Gastrografin challenge: 100 mL via NG tube, follow-up KUB at 8-24
  hours. Contrast in colon = likely resolution without surgery.
  Sensitivity 96%, specificity 98% for predicting need for surgery.
- Closed-loop obstruction: surgical emergency. CT findings: C-shaped or
  U-shaped dilated loop with two transition points converging, mesenteric
  swirl sign, reduced bowel wall enhancement. Do not delay for trial of
  conservative management.
- SBO in a virgin abdomen (no prior surgery): red flag for hernia
  (check all hernia orifices on exam and CT), tumor, or Crohn disease.
- Recurrence: adhesive SBO recurs in 20-30% of patients treated
  conservatively and 10-15% after surgical adhesiolysis.

=== END CASE CONTEXT ===
`,

// ═══════════════════════════════════════════════════════════════════════════
// EPIDURAL HEMATOMA (CT Head)
// ═══════════════════════════════════════════════════════════════════════════
'ct-epidural': `
=== CASE CONTEXT: EPIDURAL HEMATOMA ===

CLINICAL CONTEXT:
This is a non-contrast CT head showing a large epidural hematoma with mass
effect in an 87-year-old female who presents after a fall. The patient was
found on the floor by family, with an initial period of lucidity followed
by progressive obtundation. On arrival: GCS 10 (E2V3M5), left temporal
scalp hematoma, right-sided hemiparesis, fixed and dilated left pupil.
Vitals: HR 58, BP 185/100, RR irregular. This presentation is concerning
for uncal herniation from expanding epidural hematoma. Image author:
Hellerhoff, CC BY-SA 4.0, via Wikimedia Commons.

KNOWN DIAGNOSIS:
Epidural hematoma with mass effect and impending herniation.

KEY IMAGING FINDINGS:
1. Biconvex (lens-shaped) hyperdense collection in the epidural space,
   characteristic of epidural hematoma. The biconvex shape results from
   the dura being stripped away from the inner table of the skull by
   arterial bleeding under pressure.
2. Mass effect with compression of the adjacent brain parenchyma,
   effacement of sulci, and compression of the ipsilateral lateral
   ventricle.
3. Midline shift of brain structures away from the side of the hematoma,
   indicating significant mass effect. Shift greater than 5 mm is
   generally considered a surgical indication.
4. Possible subfalcine herniation, with the cingulate gyrus displaced
   under the falx cerebri, risking compression of the anterior cerebral
   artery territory.
5. The hyperdense (bright white) appearance indicates acute blood
   (40-60 HU on CT). Epidural hematomas do NOT cross suture lines
   because the dura is tightly adherent at sutures.

TEACHING APPROACH:
Use a question-first approach. Do NOT reveal the diagnosis immediately. Guide
the student to identify findings step by step:
  Step 1: Ask what they notice about the shape and density of the
          collection (biconvex vs crescent-shaped).
  Step 2: Ask whether the collection crosses suture lines.
  Step 3: Ask about the position of midline structures (shifted or not).
  Step 4: Ask what vessel is most commonly responsible for epidural
          hematomas.
  Step 5: Ask about the clinical significance of the "lucid interval."
CONFIRM the diagnosis only after the student has identified the biconvex
shape and epidural location, or has explicitly stated "epidural hematoma."
If the student is stuck after 2-3 attempts at any step, provide a
targeted hint rather than the answer.

TEACHING PEARLS:

1. "Epidural hematomas are biconvex (lens-shaped) because the bleeding,
   typically arterial from the middle meningeal artery, strips the dura
   away from the inner table of the skull. The dura is tightly adherent
   at suture lines, so epidural hematomas do NOT cross sutures. This is
   the key distinguishing feature from subdural hematomas, which are
   crescent-shaped and freely cross suture lines."

2. "The classic 'lucid interval' occurs in approximately 20-50% of
   epidural hematoma cases: initial loss of consciousness from the impact,
   followed by a period of apparent neurological normalcy, then rapid
   deterioration as the hematoma expands and causes herniation. This is a
   neurosurgical emergency. The lucid interval is a board favorite."

3. "The middle meningeal artery is the most commonly injured vessel
   (85-95% of cases), typically from a temporal bone fracture through the
   pterion, the thinnest part of the skull where the frontal, parietal,
   temporal, and sphenoid bones converge. Venous epidural hematomas
   (from dural sinuses or diploic veins) account for the remainder and
   tend to expand more slowly."

4. "The Monroe-Kellie doctrine states that the cranial vault is a fixed
   volume containing brain parenchyma, cerebrospinal fluid, and blood.
   An increase in any one component must be compensated by a decrease in
   the others, or intracranial pressure rises. Initially, CSF is
   displaced into the spinal canal as a compensatory mechanism, but once
   this is exhausted, ICP rises rapidly and exponentially."

5. "Cushing triad (hypertension, bradycardia, irregular respirations) is
   a late and ominous sign of critically elevated ICP and brainstem
   compression. It indicates impending or active herniation and demands
   immediate intervention. Do not wait for the full triad to intervene."

6. "Herniation syndromes to know: uncal (CN III palsy with ipsilateral
   fixed/dilated pupil, contralateral hemiparesis, progressing to
   Duret hemorrhages in the brainstem); subfalcine (cingulate gyrus
   under falx, ACA compression); central/transtentorial (bilateral
   pupil dilation, decorticate then decerebrate posturing); tonsillar
   (cerebellar tonsils through foramen magnum, cardiorespiratory
   arrest)."

LEARNING OBJECTIVES BY LEVEL:

HIGH SCHOOL:
- Understand that the brain is enclosed in a rigid skull, so any bleeding
  inside the skull creates dangerous pressure on the brain
- Recognize that a lens-shaped bright area on a CT scan means blood is
  collecting between the skull and brain
- Know that head injuries from falls can cause life-threatening bleeding
  even if the person initially seems okay (the lucid interval)

UNDERGRADUATE:
- Identify the biconvex (lens-shaped) hyperdense collection characteristic
  of epidural hematoma on CT
- Understand why epidural hematomas do not cross suture lines (dural
  adherence) while subdural hematomas do
- Know that the middle meningeal artery is the most commonly injured
  vessel, running through the pterion region
- Understand the Monroe-Kellie doctrine and its implications for
  intracranial pressure

MEDICAL STUDENT (STEP 1 and STEP 2):
Step 1 concepts:
- Anatomy of the meninges (dura, arachnoid, pia) and the epidural,
  subdural, and subarachnoid spaces. The epidural space is a potential
  space between the periosteal dura and the inner table of the skull.
- Middle meningeal artery anatomy: branch of the maxillary artery (from
  the external carotid), enters the skull through the foramen spinosum,
  runs in a groove on the inner table of the temporal bone.
- Monroe-Kellie doctrine: fixed intracranial volume = brain (~80%) +
  CSF (~10%) + blood (~10%). Compensatory mechanisms include CSF
  displacement and venous blood redistribution. Once exhausted, small
  volume increases cause large ICP increases (exponential compliance
  curve).
- Herniation syndromes: uncal herniation compresses CN III (ipsilateral
  pupil dilation from parasympathetic fiber compression on the outer
  surface of the nerve) and the cerebral peduncle (contralateral
  hemiparesis; Kernohan notch phenomenon can cause ipsilateral
  hemiparesis as a false localizing sign).

Step 2 concepts:
- GCS assessment and interpretation: Eye (1-4), Verbal (1-5), Motor
  (1-6). GCS <= 8 = intubate for airway protection. GCS guides surgical
  decision-making.
- Emergent surgical indications for epidural hematoma: hematoma thickness
  >15 mm, midline shift >5 mm, GCS <= 8 with anisocoria, neurological
  deterioration. Craniotomy with evacuation is definitive management.
- Cushing triad as a sign of brainstem compression: hypertension
  (baroreceptor reflex attempting to maintain cerebral perfusion),
  bradycardia (vagal response to hypertension), irregular respirations
  (brainstem dysfunction).
- Rapid sequence intubation for airway protection; avoid hypotension
  and hypoxia, which worsen secondary brain injury. Target PaCO2 35-40
  mmHg; hyperventilation (PaCO2 30-35) only as a temporizing bridge to
  surgery.

RESIDENT (STEP 3):
- ICP management: head of bed 30 degrees, avoid jugular venous
  obstruction, osmotic therapy (mannitol 20% 1 g/kg bolus or
  hypertonic saline 23.4% 30 mL via central line), brief
  hyperventilation as a bridge to OR.
- Surgical timing: epidural hematoma is one of the most time-sensitive
  neurosurgical emergencies. "Time is brain." Patients taken to OR
  within 2 hours of deterioration have significantly better outcomes.
  Mortality ranges from <5% with prompt evacuation to >50% with delay
  or coma on presentation.
- Burr hole vs craniotomy: burr hole is an emergency temporizing
  measure (field or ED setting) to relieve pressure when craniotomy
  is not immediately available. Definitive management is craniotomy
  with evacuation of the hematoma and cauterization of the middle
  meningeal artery.
- Neurosurgical consult criteria: all epidural hematomas warrant
  neurosurgical consultation. Even "small" epidural hematomas
  managed conservatively require serial CT imaging (typically at
  6-8 hours, then 24 hours) and close neurological monitoring,
  as delayed expansion can occur.

=== END CASE CONTEXT ===
`,

// ═══════════════════════════════════════════════════════════════════════════
// SUBDURAL HEMATOMA (CT Head)
// ═══════════════════════════════════════════════════════════════════════════
'ct-subdural': `
=== CASE CONTEXT: SUBDURAL HEMATOMA ===

CLINICAL CONTEXT:
This is a non-contrast CT head showing a left parafalcine subdural
hematoma in an 80-year-old female. The patient was brought in by family
for progressive confusion and gait unsteadiness over the past several
weeks. PMH: atrial fibrillation on warfarin, hypertension, mild
cognitive impairment. She has a remote history of a mechanical fall
approximately 6 weeks ago with no imaging obtained at that time. On
exam: oriented to person only, mild right-sided drift, no pupillary
asymmetry. INR 3.4. Image author: Hellerhoff, CC BY-SA 4.0, via
Wikimedia Commons.

KNOWN DIAGNOSIS:
Left parafalcine subdural hematoma.

KEY IMAGING FINDINGS:
1. Crescent-shaped hyperdense collection along the falx cerebri on the
   left side (parafalcine location), characteristic of subdural hematoma.
   The crescent shape results from blood spreading freely in the subdural
   space, which is not limited by dural attachments at suture lines.
2. The collection crosses suture lines, which is the hallmark
   distinguishing feature of subdural hematomas from epidural hematomas.
   Subdural blood tracks freely along the inner surface of the dura.
3. Mass effect with compression of the adjacent brain parenchyma and
   possible effacement of the ipsilateral sulci.
4. Evaluate for midline shift, which guides surgical decision-making.
   Shift >5 mm is generally considered significant.
5. Density of the collection indicates acuity: hyperdense (bright,
   50-70 HU) = acute (0-3 days); isodense to brain = subacute (3 days
   to 3 weeks); hypodense (dark, near CSF density) = chronic (>3 weeks).
   Mixed density suggests acute-on-chronic (rebleed into a chronic
   collection).

TEACHING APPROACH:
Use a question-first approach. Do NOT reveal the diagnosis immediately. Guide
the student to identify findings step by step:
  Step 1: Ask what they notice about the shape of the collection
          (crescent vs biconvex).
  Step 2: Ask whether the collection respects or crosses suture lines.
  Step 3: Ask about the density of the collection and what it tells
          them about timing.
  Step 4: Ask what structures are at risk from the mass effect.
  Step 5: Ask about risk factors for this type of bleeding.
CONFIRM the diagnosis only after the student has identified the
crescent-shaped collection in the subdural space, or has explicitly
stated "subdural hematoma." If the student is stuck after 2-3 attempts
at any step, provide a targeted hint rather than the answer.

TEACHING PEARLS:

1. "Subdural hematomas result from tearing of the bridging veins that
   cross the subdural space to drain cortical venous blood into the
   dural sinuses. These veins are stretched in patients with cerebral
   atrophy (elderly, alcoholics) because the brain shrinks away from
   the skull, placing the bridging veins under tension. Even minor
   trauma can tear them."

2. "Dural anatomy is critical: the dura has two layers (periosteal and
   meningeal). Epidural hematomas form between the periosteal dura and
   skull; subdural hematomas form between the meningeal dura and the
   arachnoid mater. The subdural space is a potential space that allows
   blood to spread freely, which is why subdural hematomas are
   crescent-shaped and cross suture lines."

3. "CT density tells you the age: acute SDH is hyperdense (white,
   50-70 HU) due to intact hemoglobin. Over days to weeks, hemoglobin
   breaks down: subacute SDH becomes isodense to brain (hard to see,
   3 days to 3 weeks), and chronic SDH becomes hypodense (dark, near
   CSF density, >3 weeks). Mixed density (heterogeneous) suggests
   rebleeding into a chronic collection (acute-on-chronic SDH)."

4. "Major risk factors: elderly age (cerebral atrophy stretches bridging
   veins), anticoagulation (warfarin, DOACs, antiplatelet agents),
   alcoholism (atrophy + coagulopathy + fall risk), and in pediatrics,
   non-accidental trauma (child abuse) -- subdural hematomas in infants,
   especially bilateral or of varying ages, are highly suspicious for
   abusive head trauma (shaken baby syndrome)."

5. "Surgical indications for acute SDH: hematoma thickness >10 mm,
   midline shift >5 mm, or GCS decline of 2 or more points from
   presentation. Craniotomy with evacuation is the standard approach
   for acute SDH. Conservative management (observation, serial imaging,
   close neuro checks) is appropriate for thin, asymptomatic collections
   without significant shift."

6. "For chronic SDH, burr hole drainage (one or two burr holes with
   passive drainage or irrigation) is the first-line surgical treatment.
   Recurrence rates after burr hole drainage are approximately 10-30%.
   Middle meningeal artery embolization is an emerging adjunctive therapy
   shown to reduce recurrence rates to approximately 3-4% (EMBOLISE
   trial). Craniotomy is reserved for organized, septated, or recurrent
   collections that fail burr hole drainage."

LEARNING OBJECTIVES BY LEVEL:

HIGH SCHOOL:
- Understand that veins on the surface of the brain can tear from
  head injuries, causing blood to collect between the brain and skull
- Recognize that a crescent-shaped bright area on a brain CT scan means
  blood is spreading along the surface of the brain
- Know that elderly people on blood thinners are at high risk for this
  type of bleeding, even from minor falls

UNDERGRADUATE:
- Identify the crescent-shaped hyperdense collection characteristic of
  subdural hematoma on CT
- Distinguish subdural (crescent, crosses sutures) from epidural
  (biconvex, does not cross sutures) hematomas
- Understand the role of bridging veins and why cerebral atrophy
  increases vulnerability to tearing
- Know the CT density progression: acute (hyperdense) to subacute
  (isodense) to chronic (hypodense)

MEDICAL STUDENT (STEP 1 and STEP 2):
Step 1 concepts:
- Bridging vein anatomy: cortical veins traverse the subdural space to
  empty into the dural venous sinuses (superior sagittal sinus for
  convexity veins). Acceleration-deceleration forces shear these veins.
- Meningeal anatomy and the spaces: epidural (potential space between
  skull and periosteal dura), subdural (potential space between
  meningeal dura and arachnoid), subarachnoid (between arachnoid and
  pia, contains CSF and the major cerebral arteries).
- Risk factors: cerebral atrophy (elderly, alcoholism), anticoagulation,
  coagulopathy, prior neurosurgery, CSF shunting (overdrainage lowers
  intracranial CSF volume, increasing tension on bridging veins).
- In pediatrics, subdural hematomas (especially bilateral, posterior
  interhemispheric, or of varying ages) combined with retinal
  hemorrhages are highly concerning for non-accidental trauma.

Step 2 concepts:
- Surgical indications: acute SDH with thickness >10 mm or midline
  shift >5 mm requires surgical evacuation (craniotomy). Patients with
  declining GCS (drop of >=2 points) also require surgery regardless
  of hematoma size.
- Conservative management criteria: small (<10 mm), asymptomatic or
  minimally symptomatic, no significant midline shift, stable
  neurological exam. Requires serial CT imaging and close monitoring.
- Anticoagulation reversal: warfarin (IV vitamin K + 4-factor PCC for
  rapid reversal; FFP is slower and volume-heavy); dabigatran
  (idarucizumab); rivaroxaban/apixaban (andexanet alfa or 4-factor
  PCC if unavailable). Reversal should not delay surgical evacuation
  if emergently indicated.

RESIDENT (STEP 3):
- Anticoagulation reversal protocols in detail: 4-factor PCC (25-50
  IU/kg) reverses warfarin within minutes; check INR at 30 minutes.
  Idarucizumab (5 g IV) for dabigatran. Andexanet alfa for factor Xa
  inhibitors (loading dose + infusion; expensive, limited availability).
  Platelet transfusion for antiplatelet agents is controversial; recent
  evidence (PATCH trial) suggests it may worsen outcomes in spontaneous
  ICH, though traumatic SDH is a different context.
- ICP monitoring: consider in patients with GCS <=8 after evacuation,
  or in conservatively managed patients with concerning exam. Target
  ICP <22 mmHg and CPP 60-70 mmHg per BTF guidelines.
- Chronic SDH management: burr hole drainage is first-line. Technique:
  1-2 burr holes, dural opening, irrigation with warm saline, subdural
  drain placement (typically left for 24-72 hours). Recurrence rate
  10-30%. Dexamethasone (Dex-CSDH trial) showed modest benefit in
  reducing need for reoperation but raised concerns about adverse
  effects; not universally adopted. Middle meningeal artery
  embolization is a promising adjunct for recurrence prevention.
- Restart of anticoagulation: timing is controversial. Generally
  restarted 1-4 weeks post-evacuation depending on indication
  (mechanical valve = earlier restart). Multidisciplinary discussion
  (neurosurgery, cardiology, hematology) is essential.

=== END CASE CONTEXT ===
`,

// ═══════════════════════════════════════════════════════════════════════════
// PNEUMOPERITONEUM (CXR - Free Air Under Diaphragm)
// ═══════════════════════════════════════════════════════════════════════════
'cxr-pneumoperitoneum': `
=== CASE CONTEXT: PNEUMOPERITONEUM (FREE AIR) ===

CLINICAL CONTEXT:
This is an upright PA chest radiograph showing pneumoperitoneum (free
intraperitoneal air) in a 71-year-old female with sigmoid colon
perforation. The patient presents with acute-onset severe diffuse
abdominal pain for 6 hours, initially localized to the left lower
quadrant, now generalized. PMH: diverticulosis (known on prior
colonoscopy), hypertension, type 2 diabetes. Vitals: HR 112, BP
98/62, T 38.9C, RR 24. Exam: rigid abdomen with diffuse rebound
tenderness and involuntary guarding (peritonitis), absent bowel sounds.
Labs: WBC 18,400 with left shift, lactate 3.2. This is a surgical
emergency. Image author: Hellerhoff, CC BY-SA 4.0, via Wikimedia
Commons.

KNOWN DIAGNOSIS:
Pneumoperitoneum secondary to sigmoid colon perforation (perforated
diverticulitis).

KEY RADIOGRAPHIC FINDINGS:
1. Free air (pneumoperitoneum) visible as a crescent of lucency
   (dark/black) beneath both hemidiaphragms on this upright chest
   radiograph. Free air rises to the highest point in the peritoneal
   cavity, which is the subdiaphragmatic space when the patient is
   upright.
2. The free air is visible bilaterally (under both the right and left
   hemidiaphragms), indicating a significant amount of intraperitoneal
   air. Even a small amount of free air (as little as 1-2 mL) can be
   detected on an upright CXR under the right hemidiaphragm.
3. The diaphragmatic surfaces are sharply delineated by air both above
   (normal lung) and below (abnormal free air), creating a clear
   "double wall" appearance.
4. Rigler sign (double-wall sign of bowel) may be present: both the
   inner (mucosal/luminal) and outer (serosal) surfaces of the bowel
   wall are outlined by gas when free air is present on both sides.
5. No other acute thoracic pathology; the lungs are clear and the
   heart is normal in size.

TEACHING APPROACH:
Use a question-first approach. Do NOT reveal the diagnosis immediately. Guide
the student to identify findings step by step:
  Step 1: Ask what they see in the subdiaphragmatic region (look for
          the crescent of lucency).
  Step 2: Ask whether air should normally be present below the
          diaphragm.
  Step 3: Ask what could cause air to escape from the GI tract into
          the peritoneal cavity.
  Step 4: Ask about the clinical significance and urgency of this
          finding.
  Step 5: Ask what the most common causes of perforation are by
          location.
CONFIRM the diagnosis only after the student has identified the
subdiaphragmatic free air, or has explicitly stated "pneumoperitoneum"
or "free air." If the student is stuck after 2-3 attempts at any step,
provide a targeted hint rather than the answer.

TEACHING PEARLS:

1. "The upright chest X-ray is the best initial plain film study for
   detecting pneumoperitoneum. It is more sensitive than an upright or
   supine abdominal X-ray. As little as 1-2 mL of free air can be
   detected under the right hemidiaphragm on a properly exposed upright
   CXR. The patient should be upright for at least 10 minutes before
   the film to allow air to rise. If the patient cannot sit upright, a
   left lateral decubitus abdominal film (left side down, beam
   horizontal) can detect free air over the liver."

2. "Causes of pneumoperitoneum by mechanism: perforation of a hollow
   viscus is the most common (peptic ulcer disease is the #1 cause
   worldwide; perforated diverticulitis is common in Western elderly
   populations; other causes include appendicitis, trauma, foreign body,
   ischemic bowel, toxic megacolon, and malignancy); iatrogenic (recent
   surgery within 5-7 days, endoscopy, PEG tube placement); and rarely,
   non-surgical pneumoperitoneum (pneumatosis, barotrauma from
   mechanical ventilation, vaginal insufflation)."

3. "Rigler sign (double-wall sign): when free intraperitoneal air
   outlines the serosal (outer) surface of the bowel wall, both the
   inner and outer walls become visible. Normally, only the inner
   (mucosal) surface is visible because intraluminal gas outlines it.
   Rigler sign requires a moderate to large amount of free air and is
   best seen on supine abdominal films."

4. "Peritoneal anatomy for understanding perforation consequences:
   perforations of intraperitoneal organs (stomach, first part of
   duodenum, jejunum, ileum, transverse colon, sigmoid colon) cause
   free intraperitoneal air. Perforations of retroperitoneal organs
   (second/third parts of duodenum, ascending colon, descending colon,
   rectum) may cause retroperitoneal air rather than free
   intraperitoneal air."

5. "Emergent surgical consultation is mandatory for pneumoperitoneum
   with peritonitis. Initial stabilization: NPO, nasogastric tube for
   decompression, aggressive IV fluid resuscitation (crystalloid),
   broad-spectrum IV antibiotics covering gram-negative and anaerobic
   organisms (e.g., piperacillin-tazobactam or meropenem), and Foley
   catheter. CT abdomen/pelvis with IV contrast is obtained if the
   patient is stable enough, to identify the site of perforation and
   guide surgical planning."

6. "For sigmoid perforation from diverticulitis, the Hartmann procedure
   (sigmoid resection with end colostomy and rectal stump closure) is
   the classic emergency operation. Primary anastomosis with or without
   diverting ileostomy is increasingly performed in select cases
   (hemodynamically stable, minimal contamination). Damage control
   surgery (abbreviated laparotomy, washout, temporary closure) is used
   in critically ill or hemodynamically unstable patients."

LEARNING OBJECTIVES BY LEVEL:

HIGH SCHOOL:
- Understand that the digestive organs are hollow tubes, and if they
  develop a hole, air and contents leak into the belly
- Recognize that the dark crescent under the diaphragm on a chest X-ray
  means air has escaped from the gut into the abdominal cavity
- Know that this is a surgical emergency requiring immediate operation

UNDERGRADUATE:
- Identify free air under the diaphragm on an upright chest X-ray
- Understand why free air rises to the subdiaphragmatic space (air
  rises to the highest point in any cavity)
- Know the major causes of bowel perforation (ulcers, diverticulitis,
  trauma, cancer)
- Understand the concept of peritonitis (inflammation of the peritoneal
  lining from contamination)

MEDICAL STUDENT (STEP 1 and STEP 2):
Step 1 concepts:
- Peritoneal anatomy: intraperitoneal vs retroperitoneal organs. The
  peritoneum is a serous membrane lining the abdominal cavity. The
  greater and lesser sacs. Mesenteric attachments determine which
  organs are intraperitoneal (mobile, suspended by mesentery) vs
  retroperitoneal (fixed, posterior).
- Perforation pathophysiology: breach of the bowel wall allows
  intraluminal contents (air, bacteria, digestive enzymes) to enter
  the peritoneal cavity, causing chemical and then bacterial
  peritonitis. The inflammatory cascade leads to fluid shifts, sepsis,
  and if untreated, multiorgan failure.
- Diverticular disease: diverticula are herniations of mucosa and
  submucosa through the muscular wall at points of vasa recta
  penetration. Most common in the sigmoid colon. Diverticulitis
  results from microperforation of a diverticulum.

Step 2 concepts:
- Upright CXR is the initial imaging study of choice for suspected
  perforation. CT abdomen/pelvis with IV contrast is the definitive
  study for localizing the perforation site and assessing the degree
  of contamination.
- Initial management: NPO, NGT decompression, IV fluid resuscitation,
  broad-spectrum antibiotics (gram-negative + anaerobic coverage),
  urgent surgical consultation.
- Hinchey classification of diverticulitis: Stage I (pericolic abscess),
  Stage II (pelvic/distant abscess), Stage III (purulent peritonitis
  from ruptured abscess), Stage IV (fecal peritonitis from free
  perforation). Stages III-IV require emergent surgery.

RESIDENT (STEP 3):
- OR timing: perforated viscus with peritonitis should go to the OR
  as soon as the patient is adequately resuscitated. Delays beyond
  6-12 hours increase mortality. Do not delay for imaging if the
  clinical picture is clear and the patient is deteriorating.
- Surgical options for perforated sigmoid diverticulitis: Hartmann
  procedure (safest in unstable/contaminated cases; colostomy reversal
  performed 3-6 months later, though approximately 30-40% of patients
  never undergo reversal); primary anastomosis with diverting loop
  ileostomy (DIVA, LADIES, and SCANDIV trials support this in select
  cases); laparoscopic lavage (LOLA, LapLAND, DILALA trials showed
  mixed results; not recommended for Hinchey IV).
- Damage control surgery: for hemodynamically unstable patients or
  those with severe sepsis. Abbreviated laparotomy, source control
  (resect perforated segment, staple ends, NO anastomosis), washout,
  temporary abdominal closure (negative pressure wound therapy), ICU
  resuscitation, return to OR in 24-72 hours for definitive repair.
- Non-surgical pneumoperitoneum: always consider in post-operative
  patients (free air can persist for 5-7 days after laparotomy, longer
  after laparoscopy). If the patient has pneumoperitoneum but no
  peritoneal signs, consider benign causes before committing to
  re-exploration.

=== END CASE CONTEXT ===
`,

// ═══════════════════════════════════════════════════════════════════════════
// NECROTIZING ENTEROCOLITIS (Abdominal X-ray)
// ═══════════════════════════════════════════════════════════════════════════
'axr-nec': `
=== CASE CONTEXT: NECROTIZING ENTEROCOLITIS (NEC) ===

CLINICAL CONTEXT:
This is an abdominal radiograph of a neonate (0 weeks of age) showing
pneumatosis intestinalis AND portal venous gas, consistent with
necrotizing enterocolitis (NEC). The infant is a 28-week premature
neonate, now day of life 10, who was initially tolerating trophic
enteral feeds (formula). Over the past 12 hours, the infant has
developed abdominal distension, bilious gastric residuals, feeding
intolerance, bloody stools, temperature instability (hypothermia),
lethargy, and apneic episodes. Vitals: HR 180, BP 38/22 (MAP 28),
T 36.0C, RR irregular with desaturations. Labs: WBC 3,200
(leukopenia), platelets 62,000 (thrombocytopenia), CRP 85, ABG with
metabolic acidosis (pH 7.18, lactate 5.4). This is a critically ill
neonate. Image author: Hellerhoff, CC BY-SA 4.0, via Wikimedia Commons.

KNOWN DIAGNOSIS:
Necrotizing enterocolitis (NEC) with pneumatosis intestinalis and
portal venous gas.

KEY RADIOGRAPHIC FINDINGS:
1. Pneumatosis intestinalis: intramural gas within the bowel wall,
   appearing as bubbly (cystic) or linear (curvilinear) lucencies
   tracking along the bowel wall. This is the radiographic hallmark
   of NEC and represents gas produced by bacteria that have invaded
   the ischemic/necrotic bowel wall. Bubbly pneumatosis = submucosal
   gas; linear pneumatosis = subserosal gas (often more concerning).
2. Portal venous gas: branching linear lucencies extending over the
   liver, representing gas that has entered the portal venous system
   from the mesenteric veins draining the affected bowel. Portal
   venous gas extends to the periphery of the liver (vs hepatic
   biliary gas/pneumobilia, which is central). Portal venous gas is
   an ominous finding indicating extensive bowel involvement.
3. Dilated loops of bowel, consistent with ileus from the
   inflammatory process. Multiple distended loops without a clear
   transition point suggest diffuse bowel involvement rather than
   focal mechanical obstruction.
4. Evaluate for pneumoperitoneum (free air), which would indicate
   bowel perforation and is an absolute surgical indication.
5. A persistently dilated, unchanged loop on serial films ("fixed
   loop" sign) suggests a segment of non-viable bowel that has lost
   peristalsis.

TEACHING APPROACH:
Use a question-first approach. Do NOT reveal the diagnosis immediately. Guide
the student to identify findings step by step:
  Step 1: Ask what they notice about the bowel wall (look for gas
          within the wall itself, not just in the lumen).
  Step 2: Ask them to look at the liver region for any abnormal
          lucencies (portal venous gas).
  Step 3: Ask about the overall bowel gas pattern (dilated loops,
          distribution).
  Step 4: Ask what clinical scenario in a neonate produces these
          findings.
  Step 5: Ask what single finding on the abdominal film would
          mandate immediate surgery (pneumoperitoneum).
CONFIRM the diagnosis only after the student has identified pneumatosis
intestinalis or portal venous gas, or has explicitly stated "NEC" or
"necrotizing enterocolitis." If the student is stuck after 2-3 attempts
at any step, provide a targeted hint rather than the answer.

TEACHING PEARLS:

1. "NEC pathophysiology involves a triad of mucosal ischemia, bacterial
   invasion, and an exaggerated inflammatory response in the immature
   neonatal gut. Prematurity is the single greatest risk factor: the
   immature intestinal barrier has decreased mucus production, immature
   tight junctions, reduced secretory IgA, and an imbalanced
   pro-inflammatory immune response. Enteral feeding (especially
   formula) provides substrate for bacterial proliferation. Perinatal
   asphyxia, umbilical catheterization, and polycythemia are additional
   risk factors. Breast milk is protective."

2. "Pneumatosis intestinalis is pathognomonic for NEC in the neonatal
   context. The gas is produced by bacteria (hydrogen and other gases)
   that have invaded the compromised bowel wall. It appears as bubbly
   (cystic) lucencies when submucosal, or linear (curvilinear)
   lucencies when subserosal. Linear/subserosal pneumatosis may
   indicate more advanced transmural disease."

3. "Portal venous gas indicates that intramural gas has entered the
   mesenteric venous drainage and reached the portal system. On
   abdominal X-ray, it appears as branching lucencies overlying the
   liver that extend to the hepatic periphery. Distinguish from
   pneumobilia (biliary gas), which is central and does not extend to
   the liver periphery. Portal venous gas in NEC is an ominous sign
   associated with extensive bowel involvement and higher mortality."

4. "Modified Bell staging for NEC: Stage I (Suspected) -- mild systemic
   signs, feeding intolerance, abdominal distension, occult blood in
   stool; X-ray may be normal or show mild ileus. Stage II (Definite)
   -- Stage IIA: additional findings of absent bowel sounds, abdominal
   tenderness, pneumatosis on X-ray. Stage IIB: add metabolic acidosis,
   thrombocytopenia, portal venous gas. Stage III (Advanced) -- Stage
   IIIA: peritonitis, DIC, shock, no perforation on X-ray. Stage IIIB:
   pneumoperitoneum (perforation)."

5. "Medical management (Stages I-II without perforation): NPO (bowel
   rest, nothing per os), orogastric (OG) tube for decompression,
   broad-spectrum IV antibiotics (ampicillin + gentamicin + metronidazole
   or ampicillin + gentamicin + clindamycin for anaerobic coverage),
   TPN for nutrition, correction of metabolic acidosis, platelet and
   coagulation factor replacement as needed, serial abdominal exams
   and radiographs."

6. "Absolute surgical indication: pneumoperitoneum (free air) indicating
   bowel perforation. Relative surgical indications: clinical
   deterioration despite maximal medical therapy (worsening acidosis,
   worsening thrombocytopenia, hemodynamic instability), fixed loop on
   serial radiographs (suggests non-viable bowel segment), abdominal
   wall erythema or palpable mass, and positive paracentesis (brown
   fluid with organisms on Gram stain)."

LEARNING OBJECTIVES BY LEVEL:

HIGH SCHOOL:
- Understand that premature babies have fragile intestines that can
  become severely damaged by infection and poor blood flow
- Recognize that gas bubbles appearing inside the bowel wall (not
  just inside the tube) on an X-ray is a sign of serious intestinal
  damage
- Know that this is a life-threatening emergency in newborns

UNDERGRADUATE:
- Identify pneumatosis intestinalis (intramural gas) and portal venous
  gas on a neonatal abdominal radiograph
- Understand the pathophysiology of NEC: mucosal ischemia + bacterial
  invasion + immature immune response in the premature gut
- Know the major risk factors: prematurity (most important), formula
  feeding, perinatal asphyxia
- Know that breast milk is protective against NEC

MEDICAL STUDENT (STEP 1 and STEP 2):
Step 1 concepts:
- Neonatal gut immaturity: decreased mucus production, immature tight
  junctions between enterocytes, reduced secretory IgA, Paneth cell
  deficiency, and a pro-inflammatory bias in the immature intestinal
  immune system (excessive TLR4 signaling, reduced anti-inflammatory
  cytokines).
- Pathophysiology cascade: initial mucosal injury (ischemia,
  hypoxia) allows bacterial translocation across the compromised
  barrier. Bacteria produce gas (hydrogen), which dissects into the
  bowel wall (pneumatosis). Ongoing inflammation leads to transmural
  necrosis, perforation, and sepsis.
- Portal venous gas: gas enters the mesenteric venous system from
  the bowel wall and is carried to the liver via the portal vein.
  Distinguished from pneumobilia by peripheral vs central distribution.

Step 2 concepts:
- Modified Bell staging and its management implications: Stage I
  (suspected, supportive care and observation); Stage IIA-IIB
  (definite, aggressive medical management with NPO, antibiotics,
  TPN); Stage IIIA (advanced without perforation, medical management
  plus surgical consultation); Stage IIIB (perforation, surgery).
- Medical management: NPO (typically 7-14 days for definite NEC),
  OG decompression, IV antibiotics for 7-14 days, TPN, serial labs
  (CBC, CMP, blood gas, CRP), serial abdominal X-rays every 6-8
  hours during acute phase.
- Surgical indications: pneumoperitoneum is the only absolute
  indication. Relative indications include clinical deterioration,
  fixed loop, abdominal wall cellulitis, and positive paracentesis.

RESIDENT (STEP 3):
- Serial abdominal X-rays every 6-8 hours during the acute phase
  to monitor for progression (new or worsening pneumatosis,
  development of portal venous gas, fixed loop, or
  pneumoperitoneum). Cross-table lateral or left lateral decubitus
  views improve sensitivity for small amounts of free air.
- When to call pediatric surgery: any Stage IIB or higher NEC, any
  clinical deterioration on medical management, concern for perforation,
  or if the infant develops an acute abdomen. Early surgical involvement
  is appropriate even for medical NEC, as the clinical trajectory can
  change rapidly.
- Surgical options: peritoneal drain (bedside Penrose drain placement)
  is used in extremely low birth weight infants (<1000 g) or those too
  unstable for laparotomy; it can be definitive or serve as a bridge
  to laparotomy. Laparotomy with resection of non-viable bowel and
  enterostomy creation is the definitive procedure. Primary anastomosis
  is occasionally performed in stable patients with limited resection.
  The goal is to preserve as much viable bowel length as possible.
- Long-term complications: intestinal stricture (most common, occurs
  in 10-35% of medically and surgically treated NEC, most often in
  the colon; typically presents 4-8 weeks after acute episode with
  feeding intolerance or obstruction); short bowel syndrome (if
  extensive resection, <75 cm of remaining small bowel in neonates
  raises concern); neurodevelopmental impairment (NEC survivors,
  especially surgical NEC, have higher rates of cerebral palsy,
  cognitive delay, and vision/hearing impairment); TPN-associated
  cholestasis.

=== END CASE CONTEXT ===
`,

// ═══════════════════════════════════════════════════════════════════════════
// COLLES FRACTURE (Wrist X-ray)
// ═══════════════════════════════════════════════════════════════════════════
'xr-colles': `
=== CASE CONTEXT: COLLES FRACTURE ===

CLINICAL CONTEXT:
This is a wrist radiograph (PA and lateral views) showing a Colles
fracture: a transverse fracture of the distal radius with dorsal
displacement and angulation in an adult patient. The patient presents
after a fall onto an outstretched hand (FOOSH mechanism). On exam:
visible "dinner fork" deformity of the wrist (dorsal angulation of
the distal fragment creates a step-off deformity best seen from the
lateral view), swelling, tenderness over the distal radius, limited
range of motion, and intact distal pulses. Sensory exam of the median,
radial, and ulnar nerve distributions should be performed. Image
author: Ashish j29, CC BY 3.0, via Wikimedia Commons.

KNOWN DIAGNOSIS:
Colles fracture (distal radius fracture with dorsal displacement).

KEY RADIOGRAPHIC FINDINGS:
1. Transverse fracture of the distal radius, typically within 2.5 cm
   of the articular surface. The fracture line may be clearly visible
   or subtle, depending on the degree of impaction and displacement.
2. Dorsal displacement and dorsal angulation of the distal fracture
   fragment, producing the characteristic "dinner fork" deformity on
   the lateral view. Normal volar (palmar) tilt of the distal radial
   articular surface is approximately 11-12 degrees; in a Colles
   fracture, this is reversed to dorsal tilt.
3. Possible dorsal comminution (fragmentation of the dorsal cortex),
   which is a marker of instability and often an indication for
   operative fixation.
4. Evaluate for associated ulnar styloid fracture, which occurs in
   approximately 50-60% of distal radius fractures. Ulnar styloid base
   fractures may indicate TFCC (triangular fibrocartilage complex)
   disruption and DRUJ (distal radioulnar joint) instability.
5. Assess for radial shortening (loss of radial height compared to the
   ulna), radial inclination (normally 22-23 degrees on PA view), and
   articular step-off or gap, all of which influence management
   decisions.

TEACHING APPROACH:
Use a question-first approach. Do NOT reveal the diagnosis immediately. Guide
the student to identify findings step by step:
  Step 1: Ask them to identify the bones of the wrist and forearm on
          the radiograph (radius, ulna, carpals).
  Step 2: Ask them to trace the cortex of the distal radius looking
          for any disruption (fracture line).
  Step 3: Ask about the direction of displacement of the distal
          fragment (dorsal vs volar), referencing the lateral view.
  Step 4: Ask what mechanism of injury typically causes this pattern.
  Step 5: Ask them to name this fracture pattern and distinguish it
          from similar fractures (Smith, Barton).
CONFIRM the diagnosis only after the student has identified the distal
radius fracture with dorsal displacement, or has explicitly stated
"Colles fracture." If the student is stuck after 2-3 attempts at any
step, provide a targeted hint rather than the answer.

TEACHING PEARLS:

1. "Colles fracture is defined as an extra-articular fracture of the
   distal radius with dorsal displacement and dorsal angulation of the
   distal fragment. The classic mechanism is a FOOSH (fall onto an
   outstretched hand) with the wrist in dorsiflexion. It is the most
   common fracture of the upper extremity and shows a bimodal age
   distribution: young adults (high-energy trauma) and elderly
   osteoporotic women (low-energy falls). Named after Abraham Colles
   who described it in 1814."

2. "The key distal radius fracture eponyms: Colles = extra-articular,
   dorsal displacement ('fell on palm, dinner fork deformity'). Smith
   = extra-articular, volar displacement ('reverse Colles,' mechanism
   is fall on dorsum of hand or direct blow). Barton = intra-articular,
   dorsal or volar lip fracture-subluxation of the radiocarpal joint.
   Chauffeur (Hutchinson) = intra-articular radial styloid fracture.
   Die-punch = depressed fracture of the lunate fossa of the distal
   radius."

3. "The 'dinner fork' deformity is the classic clinical appearance:
   viewed from the lateral aspect, the dorsal displacement of the
   distal fragment creates a step-off that resembles the curve of a
   dinner fork. This corresponds to the dorsal angulation seen on the
   lateral radiograph. Always obtain both PA and lateral views; the
   lateral view best demonstrates the direction and degree of
   displacement."

4. "Neurovascular examination is critical. The median nerve is most
   commonly affected (runs through the carpal tunnel, which is
   immediately volar to the distal radius). Acute carpal tunnel
   syndrome from fracture fragment compression or hematoma is an
   emergency requiring urgent reduction and possible carpal tunnel
   release. Test two-point discrimination and thenar motor function
   (thumb opposition). Ulnar nerve and radial nerve injuries are
   less common but should be documented."

5. "Compartment syndrome of the forearm is a rare but devastating
   complication. Warning signs: pain out of proportion to injury,
   pain with passive extension of the fingers, tense swelling of the
   forearm, paresthesias, and late findings of pulselessness and
   paralysis (the 5 Ps, though waiting for all 5 means waiting too
   long). Compartment pressures >30 mmHg or within 30 mmHg of
   diastolic pressure (delta pressure) require emergent fasciotomy."

6. "EPL (extensor pollicis longus) tendon rupture is a well-known
   late complication of distal radius fractures, occurring days to
   weeks after injury (even after non-displaced fractures). The EPL
   tendon turns sharply around Lister tubercle on the dorsal distal
   radius; fracture-related swelling, hematoma, or bony irregularity
   can compromise the tendon's blood supply or cause mechanical
   attrition. Presents as inability to extend the thumb IP joint.
   Treatment is tendon transfer (EIP to EPL)."

LEARNING OBJECTIVES BY LEVEL:

HIGH SCHOOL:
- Understand that falling on an outstretched hand can break the
  forearm bone near the wrist
- Recognize the "dinner fork" shape of the wrist when the broken bone
  shifts backward
- Know that nerves and blood vessels near the fracture must be checked
  to make sure the hand still has feeling and blood flow

UNDERGRADUATE:
- Identify a distal radius fracture on PA and lateral wrist radiographs
- Understand the FOOSH mechanism and how wrist position determines
  fracture pattern (dorsiflexion = Colles, palmar flexion = Smith)
- Distinguish Colles (dorsal displacement) from Smith (volar
  displacement) fractures
- Know the importance of neurovascular examination, particularly
  median nerve function

MEDICAL STUDENT (STEP 1 and STEP 2):
Step 1 concepts:
- Anatomy of the distal radius: articular surface with scaphoid and
  lunate facets, distal radioulnar joint (DRUJ), triangular
  fibrocartilage complex (TFCC), Lister tubercle (dorsal tubercle
  around which the EPL tendon courses).
- Mechanism: FOOSH with wrist in dorsiflexion transmits axial load
  through the carpals to the distal radius. The degree of
  dorsiflexion, radial/ulnar deviation, and energy of the fall
  determine the fracture pattern.
- Colles vs Smith vs Barton: Colles (extra-articular, dorsal
  displacement); Smith (extra-articular, volar displacement, "reverse
  Colles"); Barton (intra-articular, fracture-subluxation of the
  radiocarpal joint, dorsal or volar variety).
- Ossification and aging: distal radius is the most common site of
  osteoporotic fracture in postmenopausal women. Bone density at
  the distal radius is a predictor of systemic fracture risk.

Step 2 concepts:
- Management: closed reduction and casting (sugar-tong splint acutely,
  then short-arm cast) for stable, acceptable-alignment fractures.
  Reduction technique: finger traps with traction, then manipulation
  to restore volar tilt, radial length, and radial inclination.
- ORIF (open reduction internal fixation) with volar locking plate is
  indicated for unstable fractures. Accepted indications: dorsal tilt
  >20 degrees (or inability to achieve neutral tilt after reduction),
  radial shortening >3 mm (>5 mm relative to ulna), articular step-off
  or gap >2 mm, dorsal comminution >50% of the cortex, and associated
  DRUJ instability.
- Neurovascular exam: median nerve (sensation to palmar thumb, index,
  middle, radial ring finger; motor: thumb opposition, APB); ulnar
  nerve (sensation to small finger and ulnar ring finger; motor: finger
  abduction, first dorsal interosseous); radial nerve (sensation to
  dorsal first web space; motor: wrist/finger extension).
- Compartment syndrome: maintain high clinical suspicion. Pain with
  passive finger extension is the earliest and most sensitive sign.
  Remove all circumferential dressings/casts immediately if suspected.
  Measure compartment pressures if diagnosis is uncertain.

RESIDENT (STEP 3):
- Operative criteria (indications for ORIF): dorsal tilt >20 degrees
  after reduction attempt (or >10 degrees in young active patients),
  articular step-off >2 mm (intra-articular involvement), radial
  shortening >3 mm compared to contralateral side (>5 mm loss of
  radial height), dorsal comminution involving >50% of the cortex
  (predictor of re-displacement in cast), associated carpal fracture
  or ligament injury (e.g., scapholunate dissociation), and bilateral
  fractures or polytrauma. Age and functional demands modify thresholds.
- Volar locking plate fixation is the current standard for operative
  distal radius fractures: provides stable fixation allowing early
  mobilization. Dorsal plating is less common due to extensor tendon
  irritation. External fixation is used for highly comminuted fractures
  or as a temporizing measure in polytrauma.
- EPL rupture as a late complication: the EPL tendon courses around
  Lister tubercle on the dorsal radius and is vulnerable to
  attritional rupture from fracture-related irregularity, hematoma,
  or ischemia. Typically presents 3-6 weeks post-injury (but can
  occur up to several months later) with sudden inability to extend
  the thumb at the IP joint. Treatment: EIP (extensor indicis
  proprius) to EPL tendon transfer. Prophylactic EPL release is not
  standard practice.
- Other late complications: malunion (most common, causes loss of
  grip strength and wrist motion, may require corrective osteotomy),
  complex regional pain syndrome (CRPS type I, 8-35% incidence,
  early recognition and hand therapy are critical), post-traumatic
  arthritis (especially with articular involvement), carpal tunnel
  syndrome (delayed presentation), DRUJ instability (test with
  piano key sign and ballottement).

=== END CASE CONTEXT ===
`,

};
