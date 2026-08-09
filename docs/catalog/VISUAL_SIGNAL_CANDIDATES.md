# CaseAttend visual and signal lesson candidates

Research date: 2026-08-09

This is a catalog of **52 original lesson seeds** built around assets whose individual Wikimedia Commons file pages explicitly mark the work as CC0 or public domain. The lesson text and vignettes below are original proposals, not copied cases. The asset page is the provenance URL; the `#Licensing` anchor is the file-level license evidence. Preserve a local provenance record containing the page URL, creator/agency, license label, retrieval date, and original filename.

Global clinical/de-identification rules for every lesson:

- Educational use only; have a qualified clinician review the prompt, answer key, annotations, and any management claims before merge.
- Strip EXIF, DICOM headers, printed names, dates, accession numbers, facility names, and other overlays before bundling. A public-domain copyright tag is not a de-identification determination.
- Do not imply that the source agency, patient, photographer, or uploader endorses CaseAttend.
- Keep image interpretation probabilistic and tied to the presented vignette. Do not teach that a single image establishes a diagnosis in isolation.
- Dermatology and other externally visible patient photographs need an additional privacy/ethics review even when copyright is public domain. Prefer lesion crops without face, tattoos, jewelry, or other identifiers.
- Store the original asset unmodified, plus a derivative optimized for the app. Record transformations and checksum both.
- At import time, also save the Commons page’s permanent `oldid` URL or a machine-readable snapshot of its author/license fields. The live `#Licensing` link is the human-verifiable evidence, but a pinned revision makes later audits reproducible.

## ECG/EKG and hemodynamic signals

### 1. A Normal Rhythm Before Sedation

- **Level/domain/artifact:** Step 1 to Step 2; cardiac electrophysiology; single three-second vector ECG strip.
- **Original vignette seed:** A healthy adult undergoes a pre-procedure check. The monitor strip is regular, every QRS follows a P wave, and the rate is within the expected resting range. Ask the learner to name the rhythm and justify it before deciding whether the procedure can proceed.
- **Objectives:** Identify P-QRS-T sequence and regularity; calculate an approximate rate; distinguish normal sinus rhythm from common mimics.
- **Asset:** https://commons.wikimedia.org/wiki/File:Normal_Sinus_Rhythm.svg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Normal_Sinus_Rhythm.svg#Licensing - **CC0 1.0 Universal**.
- **Attribution:** Rocuronium Bromide, Wikimedia Commons; attribution not legally required under CC0 but retain in provenance.
- **Neutral description:** A schematic three-second ECG strip described by its creator as normal sinus rhythm.
- **Integration:** SVG/single signal image; render responsive SVG and a high-DPI PNG fallback. Keep axes/grid assumptions explicit because the schematic is not a calibrated 12-lead tracing.
- **Specific caveat:** Do not ask for axis, ischemia, or chamber enlargement from a short single-lead schematic.

### 2. The Irregular Rhythm That Changes With Breathing

- **Level/domain/artifact:** Step 1/pediatrics or family medicine; single vector ECG strip.
- **Original vignette seed:** An asymptomatic adolescent has a rhythm that accelerates with inspiration and slows with expiration. Ask whether this is sinus arrhythmia or atrial fibrillation and what feature settles the distinction.
- **Objectives:** Recognize respiratory variation in R-R intervals; confirm preserved P-QRS relationship; avoid labeling a benign pattern as atrial fibrillation.
- **Asset:** https://commons.wikimedia.org/wiki/File:Sinus_Arrhythmia.svg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Sinus_Arrhythmia.svg#Licensing - **CC0 1.0 Universal**.
- **Attribution:** Rocuronium Bromide, Wikimedia Commons.
- **Neutral description:** A schematic three-second ECG strip labeled sinus arrhythmia.
- **Integration:** SVG/single signal image; preserve aspect ratio and offer zoom. Pair with an optional synthetic respiratory phase indicator, clearly labeled as CaseAttend-created.
- **Specific caveat:** Age and symptoms matter; do not imply every irregular rhythm with P waves is benign.

### 3. A Premature Wide Beat During Palpitations

- **Level/domain/artifact:** Step 2, internal medicine/emergency medicine; single vector ECG strip.
- **Original vignette seed:** A patient reports intermittent “skipped beats” after excess caffeine. The strip contains one early wide complex followed by a pause. Ask the learner to identify the event and decide which history features would make it concerning.
- **Objectives:** Recognize a premature ventricular complex; distinguish a compensatory pause from sinus irregularity; identify red flags that warrant broader evaluation.
- **Asset:** https://commons.wikimedia.org/wiki/File:Premature_Ventricular_Complex.svg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Premature_Ventricular_Complex.svg#Licensing - **CC0 1.0 Universal**.
- **Attribution:** Rocuronium Bromide, Wikimedia Commons.
- **Neutral description:** A three-second schematic ECG containing a premature ventricular complex.
- **Integration:** SVG/single signal image; create click-to-mark P wave, ectopic QRS, and pause annotations in a separate overlay rather than burning them into the source.
- **Specific caveat:** A single PVC morphology cannot establish burden, origin, structural disease, or need for treatment.

### 4. A Long PR Interval on a Medication Check

- **Level/domain/artifact:** Step 1 to Step 2; conduction disease/pharmacology; single vector ECG strip.
- **Original vignette seed:** An older adult taking an AV-nodal blocking drug has no syncope but a prolonged PR interval with every P wave conducted. Ask for the conduction diagnosis and the next information needed before changing therapy.
- **Objectives:** Measure the PR interval conceptually; recognize first-degree AV block; connect medication and electrolyte review to conduction delay.
- **Asset:** https://commons.wikimedia.org/wiki/File:1st_Degree_AV_Block.svg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:1st_Degree_AV_Block.svg#Licensing - **CC0 1.0 Universal**.
- **Attribution:** Rocuronium Bromide, Wikimedia Commons.
- **Neutral description:** A three-second schematic strip showing prolonged AV conduction with 1:1 conduction.
- **Integration:** SVG/single signal image; add a calibrated teaching ruler only if the app clearly identifies it as an overlay and the source scale has been validated.
- **Specific caveat:** Do not infer symptoms, chronicity, or treatment from the tracing alone.

### 5. Wide QRS With a Left Bundle Pattern

- **Level/domain/artifact:** Step 2/internal medicine; schematic lead-pattern panel.
- **Original vignette seed:** A patient with dyspnea has a newly noted wide-complex conduction pattern. The learner compares V1 and V6 morphology and must identify a left bundle pattern, then explain why ischemia assessment becomes more difficult.
- **Objectives:** Recognize typical V1/V6 LBBB morphology; relate bundle delay to QRS widening and discordant repolarization; state why a new clinical context changes urgency.
- **Asset:** https://commons.wikimedia.org/wiki/File:Left_bundle_branch_block_ECG_characteristics.svg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Left_bundle_branch_block_ECG_characteristics.svg#Licensing - **CC0 1.0 Universal**.
- **Attribution:** Original A. Rad; vectorization Mrmw, Wikimedia Commons.
- **Neutral description:** A schematic comparison of characteristic QRS patterns in V1 and V6 for LBBB.
- **Integration:** SVG/single multi-panel schematic; make lead labels accessible text and do not present as a complete 12-lead study.
- **Specific caveat:** The diagram teaches morphology, not Sgarbossa assessment or a diagnosis of acute MI.

### 6. Wide QRS With a Right Bundle Pattern

- **Level/domain/artifact:** Step 2/internal medicine or emergency medicine; schematic lead-pattern panel.
- **Original vignette seed:** A patient with pleuritic chest pain has a wide QRS pattern. Ask the learner to recognize RBBB morphology, then separate the conduction finding from the differential for the patient’s symptoms.
- **Objectives:** Identify rSR-type V1 and broad terminal S in V6; distinguish RBBB from LBBB; avoid treating RBBB as proof of pulmonary embolism.
- **Asset:** https://commons.wikimedia.org/wiki/File:Right_bundle_branch_block_ECG_characteristics.svg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Right_bundle_branch_block_ECG_characteristics.svg#Licensing - **CC0 1.0 Universal**.
- **Attribution:** Original A. Rad; vectorization Mrmw, Wikimedia Commons.
- **Neutral description:** A schematic comparison of V1 and V6 patterns associated with RBBB.
- **Integration:** SVG/single multi-panel schematic; use a side-by-side toggle with the LBBB lesson while keeping both original files and provenance separate.
- **Specific caveat:** A two-lead morphology panel cannot determine acuity or cause.

### 7. Atrial Fibrillation in a Patient Taking Digitoxin

- **Level/domain/artifact:** Step 2/internal medicine/pharmacology; single raster 12-lead ECG photograph.
- **Original vignette seed:** An older adult taking a cardiac glycoside presents with nausea and an irregular pulse. The tracing is irregularly irregular without organized P waves. Ask for rhythm, medication-safety concerns, and immediate data to obtain.
- **Objectives:** Recognize atrial fibrillation; connect drug history and renal/electrolyte status to toxicity risk; separate rhythm identification from rate-control decisions.
- **Asset:** https://commons.wikimedia.org/wiki/File:ECG_005_b.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:ECG_005_b.jpg#Licensing - **Public domain dedication (PD-self), worldwide**.
- **Attribution:** Patho, Wikimedia Commons; file description notes atrial fibrillation and a digitoxin concentration.
- **Neutral description:** A photographed ECG identified by the uploader as atrial fibrillation in a patient with an elevated digitoxin concentration.
- **Integration:** JPEG/single signal image; crop borders only after checking for hidden patient text; offer pan/zoom and preserve full tracing resolution.
- **Specific caveat:** The image label is source metadata, not independently adjudicated ground truth; cardiology review required.

### 8. Precordial Lead Placement and a “Strange” ECG

- **Level/domain/artifact:** Step 1, nursing, paramedic, clerkship; vector electrode-placement diagram.
- **Original vignette seed:** A repeat ECG looks dramatically different from one obtained an hour earlier in a clinically unchanged patient. The learner must inspect precordial lead placement before concluding the heart changed.
- **Objectives:** Place V1-V6 correctly; predict how placement error can alter morphology; build a repeat-before-escalate quality-control habit when clinically appropriate.
- **Asset:** https://commons.wikimedia.org/wiki/File:Precordial_leads_in_ECG.svg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Precordial_leads_in_ECG.svg#Licensing - **CC0 1.0 Universal**.
- **Attribution:** Mikael Häggström, Wikimedia Commons.
- **Neutral description:** A schematic showing precordial ECG lead locations.
- **Integration:** SVG/single diagram; implement drag-and-drop electrode placement with keyboard equivalents and an accessible text description.
- **Specific caveat:** The diagram teaches placement, not interpretation; account for anatomy and local protocol rather than exact pixel positions.

### 9. Reading ECG and Central Venous Pressure Together

- **Level/domain/artifact:** Advanced clerkship/critical care; single raster paired physiologic signal plot.
- **Original vignette seed:** A monitored patient has ECG and central venous pressure waveforms displayed together. Ask the learner to align electrical events with atrial and ventricular pressure waves and spot a timing mismatch.
- **Objectives:** Relate P/QRS timing to a, c, and v waves; distinguish electrical from mechanical events; identify why simultaneous signals improve interpretation.
- **Asset:** https://commons.wikimedia.org/wiki/File:ECG_and_CVP_Curves.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:ECG_and_CVP_Curves.jpg#Licensing - **CC0 1.0 Universal**.
- **Attribution:** Stefan Bellini, Wikimedia Commons.
- **Neutral description:** A paired diagram of ECG and central venous pressure curves.
- **Integration:** JPEG/single multi-signal image; add synchronized cursor lines and alt text for the timing relationships.
- **Specific caveat:** A schematic CVP curve is not a substitute for a calibrated bedside waveform or clinical volume assessment.

## Ultrasound and POCUS

### 10. Compressibility of a Normal Appendix

- **Level/domain/artifact:** Step 2/emergency medicine or pediatrics; two-panel ultrasound image.
- **Original vignette seed:** A child has right-lower-quadrant pain but improving symptoms. Graded compression images show a small compressible tubular structure. Ask which findings support a normal appendix and what still limits exclusion of appendicitis.
- **Objectives:** Explain graded compression; identify compressibility and size concepts; state limitations of a nonvisualized or partially visualized appendix.
- **Asset:** https://commons.wikimedia.org/wiki/File:Ultrasonography_of_a_normal_appendix_without_and_with_compression.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Ultrasonography_of_a_normal_appendix_without_and_with_compression.jpg#Licensing - **CC0 1.0 Universal**.
- **Attribution:** Mikael Häggström, M.D., Wikimedia Commons.
- **Neutral description:** Paired ultrasound views of a normal appendix before and during compression.
- **Integration:** JPEG/two-panel image; preserve both panels and let the learner compare with a slider, not separate crops.
- **Specific caveat:** Do not teach that one still image rules out appendicitis; operator skill and the full exam matter.

### 11. Gallstones, Wall Thickening, and Pericholecystic Fluid

- **Level/domain/artifact:** Step 2/surgery or emergency medicine; single abdominal ultrasound image.
- **Original vignette seed:** A 48-year-old develops eight hours of right-upper-quadrant pain, fever, and nausea after a meal. The image shows stones, a thick wall, and adjacent fluid. Ask the learner to synthesize imaging and symptoms and identify what additional bedside finding strengthens the diagnosis.
- **Objectives:** Recognize stones, wall thickening, and pericholecystic fluid; distinguish biliary colic from inflammatory disease; explain the role and limitations of a sonographic Murphy sign.
- **Asset:** https://commons.wikimedia.org/wiki/File:Ultrasonography_of_cholecystitis.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Ultrasonography_of_cholecystitis.jpg#Licensing - **CC0 1.0 Universal**.
- **Attribution:** Mikael Häggström, M.D., Wikimedia Commons.
- **Neutral description:** An abdominal ultrasound described by its creator as showing gallstones, wall thickening, and pericholecystic fluid.
- **Integration:** JPEG/single image; create optional removable arrows as app overlays. Do not crop away depth scale or orientation marker.
- **Specific caveat:** Static findings require clinical correlation and expert review; wall thickening has multiple causes.

### 12. Increased Renal Echogenicity in Diabetes

- **Level/domain/artifact:** Step 2/internal medicine/nephrology; single renal ultrasound image.
- **Original vignette seed:** A patient with longstanding diabetes and gradually worsening kidney function undergoes renal ultrasound. Ask learners to describe echogenicity and size without claiming a histologic diagnosis from imaging.
- **Objectives:** Compare renal cortex with adjacent reference tissue; recognize chronic parenchymal-disease patterns; separate imaging description from etiologic diagnosis.
- **Asset:** https://commons.wikimedia.org/wiki/File:Ultrasonography_of_kidney_with_diabetic_nephropathy.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Ultrasonography_of_kidney_with_diabetic_nephropathy.jpg#Licensing - **CC0 1.0 Universal**.
- **Attribution:** Mikael Häggström, M.D., Wikimedia Commons.
- **Neutral description:** A renal ultrasound labeled by the creator as diabetic nephropathy.
- **Integration:** JPEG/single image; preserve grayscale and avoid aggressive contrast enhancement. Add a separate normal comparator only if it has its own compatible provenance.
- **Specific caveat:** Ultrasound cannot alone distinguish diabetic nephropathy from other medical renal diseases.

### 13. B-Lines After Blunt Chest Trauma

- **Level/domain/artifact:** Step 2/emergency medicine/trauma; single lung ultrasound image.
- **Original vignette seed:** A stable patient has focal chest tenderness after blunt trauma. Lung ultrasound shows focal vertical artifacts. Ask whether the pattern is compatible with early contusion and which dangerous alternatives still require assessment.
- **Objectives:** Identify B-lines; relate focal distribution to lung injury; distinguish artifact recognition from exclusion of pneumothorax or hemothorax.
- **Asset:** https://commons.wikimedia.org/wiki/File:Lung_Contusion.png
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Lung_Contusion.png#Licensing - **Public domain dedication (PD-self), worldwide**.
- **Attribution:** Bizorsilva, Wikimedia Commons.
- **Neutral description:** A still ultrasound identified by its creator as early pulmonary contusion with B-lines.
- **Integration:** PNG/single still; retain the original, but consider the lesson provisional until a clinician confirms that a static frame is pedagogically sufficient.
- **Specific caveat:** Lung sliding and dynamic artifact behavior cannot be assessed reliably from a still image.

### 14. Parasternal Long-Axis M-Mode Measurement

- **Level/domain/artifact:** Clerkship/cardiology or POCUS; single echocardiography M-mode image.
- **Original vignette seed:** A patient with exertional dyspnea has a parasternal long-axis view with M-mode sampling across the left ventricle. Ask learners to orient the image and explain what can and cannot be estimated.
- **Objectives:** Identify the parasternal long-axis view; relate the M-mode cursor to LV dimensions; recognize measurement and foreshortening limitations.
- **Asset:** https://commons.wikimedia.org/wiki/File:PLAX_Mmode.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:PLAX_Mmode.jpg#Licensing - **Public domain dedication (PD-self), worldwide**.
- **Attribution:** Kjetil Lenes (Commons user Ekko), Wikimedia Commons.
- **Neutral description:** A parasternal long-axis echocardiogram with an M-mode LV measurement.
- **Integration:** JPEG/single image; do not derive numeric measurements unless pixel calibration is validated. Preserve cursor and measurement annotations.
- **Specific caveat:** One view cannot establish ejection fraction or valvular diagnosis.

### 15. Orienting a Four-Chamber Echocardiographic View

- **Level/domain/artifact:** Step 1 anatomy to clerkship POCUS; single echocardiogram.
- **Original vignette seed:** A learner receives an unlabeled four-chamber frame and must identify atria, ventricles, apex, and image left/right before answering any pathology question.
- **Objectives:** Orient a four-chamber view; identify chamber relationships; explain why screen position is not identical to anatomic left/right.
- **Asset:** https://commons.wikimedia.org/wiki/File:Echocardiogram_4chambers.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Echocardiogram_4chambers.jpg#Licensing - **Public domain dedication (PD-self), worldwide**.
- **Attribution:** Kjetil Lenes, Wikimedia Commons.
- **Neutral description:** A still echocardiographic four-chamber view with the apex directed downward.
- **Integration:** JPEG/single image; build hover/click labels as removable overlays and provide nonvisual chamber-order text.
- **Specific caveat:** This is an orientation lesson, not a complete structural or functional examination.

### 16. Atrial Septal Defect on Echocardiography

- **Level/domain/artifact:** Step 1 congenital physiology to pediatric/cardiology clerkship; single echocardiogram.
- **Original vignette seed:** A young adult with a fixed split S2 has an echocardiographic frame showing an ostium secundum defect. Ask learners to connect anatomy, shunt direction, and auscultation.
- **Objectives:** Locate the atrial septum; explain left-to-right shunt physiology; connect chronic shunt to right-sided volume load.
- **Asset:** https://commons.wikimedia.org/wiki/File:Echokardiogram_von_Atriumseptumdefekt_%28Ostium_secundum%29.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Echokardiogram_von_Atriumseptumdefekt_%28Ostium_secundum%29.jpg#Licensing - **Public domain dedication (PD-self), worldwide**.
- **Attribution:** Kjetil Lenes (Commons user Ekko), Wikimedia Commons.
- **Neutral description:** A still echocardiogram identified by its creator as an ostium secundum atrial septal defect.
- **Integration:** JPEG/single image; verify the unescaped parentheses URL in the import script and add an optional anatomy overlay.
- **Specific caveat:** Shunt magnitude, direction, and closure eligibility require Doppler and a full study.

### 17. Ventricular Septal Defect on Echocardiography

- **Level/domain/artifact:** Step 1 congenital physiology to pediatric clerkship; single echocardiogram.
- **Original vignette seed:** An infant has poor feeding and a harsh holosystolic murmur. The frame shows a ventricular septal defect. Ask learners to reason from defect anatomy to symptoms and expected hemodynamics.
- **Objectives:** Locate the interventricular septum and defect; explain left-to-right shunting after pulmonary resistance falls; distinguish anatomy from defect severity.
- **Asset:** https://commons.wikimedia.org/wiki/File:Ventricular_Septal_Defect.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Ventricular_Septal_Defect.jpg#Licensing - **Public domain dedication (PD-self), worldwide**.
- **Attribution:** Kjetil Lenes, Wikimedia Commons.
- **Neutral description:** A still echocardiogram identified by the creator as a ventricular septal defect.
- **Integration:** JPEG/single image; optional pointer overlay should not obscure the defect. Pair with a CaseAttend-created simplified pressure diagram.
- **Specific caveat:** Defect size and clinical severity cannot be inferred reliably from this still alone.

### 18. First-Trimester Dating Scan Orientation

- **Level/domain/artifact:** Obstetrics clerkship; single obstetric ultrasound image.
- **Original vignette seed:** A patient is uncertain of the last menstrual period and presents for a first-trimester dating scan. Ask learners to orient the image and identify which measurements and clinical questions belong in a complete evaluation.
- **Objectives:** Recognize a first-trimester intrauterine gestational image; distinguish dating from viability assessment; list safety and counseling limits of a single still.
- **Asset:** https://commons.wikimedia.org/wiki/File:Scan12weeks.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Scan12weeks.jpg#Licensing - **Public domain (medical image/no original creative authorship; file page assertion)**.
- **Attribution:** Wikimedia Commons uploader Angela; original scan described as the uploader’s family image.
- **Neutral description:** A still obstetric ultrasound described as a 12-week dating scan.
- **Integration:** JPEG/single image; remove any embedded annotations not needed for learning and conduct enhanced privacy review because the source concerns a real pregnancy.
- **Specific caveat:** Do not infer viability, fetal health, sex, or precise gestational age from an uncalibrated still.

## Radiology

### 19. Advanced Pulmonary Tuberculosis on Chest Radiograph

- **Level/domain/artifact:** Step 2/internal medicine/infectious disease; single AP chest radiograph.
- **Original vignette seed:** A patient has chronic cough, weight loss, night sweats, and epidemiologic risk. Ask learners to describe bilateral infiltrates and right apical cavitation, then choose isolation and diagnostic steps.
- **Objectives:** Use a systematic chest-film description; recognize an upper-lobe cavitary pattern; connect suspicion to airborne precautions and microbiologic confirmation.
- **Asset:** https://commons.wikimedia.org/wiki/File:Tuberculosis-x-ray.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Tuberculosis-x-ray.jpg#Licensing - **Public domain, U.S. federal government (CDC)**.
- **Attribution:** Centers for Disease Control and Prevention/Public Health Image Library; credit agency and listed content provider.
- **Neutral description:** An AP chest radiograph described by CDC as advanced bilateral pulmonary tuberculosis with infiltrates and right apical cavitation.
- **Integration:** JPEG/single image; preserve lung fields and labels; allow zoom and a reversible region-of-interest overlay.
- **Specific caveat:** Image is low resolution and diagnosis requires clinical and microbiologic correlation.

### 20. SARS Pattern Recognition on Chest Radiograph

- **Level/domain/artifact:** Step 2/internal medicine/infectious disease; single chest radiograph.
- **Original vignette seed:** A traveler with fever, cough, and hypoxemia has a chest radiograph during an outbreak scenario. Ask the learner to describe the opacity pattern and choose infection-control steps without diagnosing a pathogen from imaging.
- **Objectives:** Describe air-space opacity distribution; distinguish imaging pattern from etiologic diagnosis; prioritize respiratory isolation and confirmatory testing in context.
- **Asset:** https://commons.wikimedia.org/wiki/File:SARS_xray.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:SARS_xray.jpg#Licensing - **Public domain, U.S. federal government (CDC)**.
- **Attribution:** Centers for Disease Control and Prevention.
- **Neutral description:** A chest radiograph published by CDC in association with severe acute respiratory syndrome.
- **Integration:** JPEG/single image; retain the original file title in provenance but use neutral UI alt text that does not reveal the answer.
- **Specific caveat:** Radiographs do not identify a specific viral pathogen.

### 21. Hantavirus Pulmonary Syndrome Progression

- **Level/domain/artifact:** Step 2/emergency medicine/infectious disease; single AP chest radiograph.
- **Original vignette seed:** A patient with rodent exposure develops rapidly progressive dyspnea and hypotension. Ask learners to identify interstitial edema and bilateral effusions and integrate exposure history into the differential.
- **Objectives:** Recognize a noncardiogenic edema pattern; distinguish descriptive findings from cause; connect exposure and shock physiology to urgent escalation.
- **Asset:** https://commons.wikimedia.org/wiki/File:6077_lores.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:6077_lores.jpg#Licensing - **Public domain, U.S. federal government (CDC)**.
- **Attribution:** Centers for Disease Control and Prevention/PHIL, image 6077.
- **Neutral description:** An AP chest radiograph described by CDC as mid-stage bilateral pulmonary effusions in hantavirus pulmonary syndrome.
- **Integration:** JPEG/single image; quality is limited, so show at native aspect ratio with zoom but no AI upscaling that invents detail.
- **Specific caveat:** Treat source diagnosis as contextual ground truth for teaching, not proof that these findings are specific.

### 22. Acute Pulmonary Histoplasmosis on Chest X-Ray

- **Level/domain/artifact:** Step 2/internal medicine/infectious disease; single chest radiograph.
- **Original vignette seed:** A patient develops fever and cough after disturbing a bat-infested structure in an endemic region. Ask learners to describe the radiograph, prioritize differential diagnoses, and choose confirmatory testing.
- **Objectives:** Describe pulmonary opacities systematically; connect environmental exposure to histoplasmosis; avoid equating exposure plus image with a final diagnosis.
- **Asset:** https://commons.wikimedia.org/wiki/File:Chest_X-ray_acute_pulmonary_histoplasmosis_PHIL_3954.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Chest_X-ray_acute_pulmonary_histoplasmosis_PHIL_3954.jpg#Licensing - **Public domain, U.S. federal government (CDC)**.
- **Attribution:** Centers for Disease Control and Prevention/PHIL, image 3954; preserve any named content provider from the file page.
- **Neutral description:** A chest radiograph identified by CDC as acute pulmonary histoplasmosis.
- **Integration:** JPEG/single image; hide the diagnostic filename in learner-facing asset URLs to prevent answer leakage.
- **Specific caveat:** Require clinician review of the differential and test-selection key.

### 23. Fibrothorax and Chronic Pleural Disease

- **Level/domain/artifact:** Step 2/pulmonology; single chest radiograph.
- **Original vignette seed:** A patient with remote empyema has chronic restrictive symptoms. Ask learners to describe pleural thickening and volume loss and distinguish chronic change from an acute effusion.
- **Objectives:** Recognize pleural rind/thickening and hemithorax volume loss; distinguish fibrothorax from free pleural fluid; connect imaging to restrictive physiology.
- **Asset:** https://commons.wikimedia.org/wiki/File:Fibrothorax_chest_x-ray.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Fibrothorax_chest_x-ray.jpg#Licensing - **Public domain, U.S. federal government (CDC)**.
- **Attribution:** Centers for Disease Control and Prevention/PHIL, image 6243.
- **Neutral description:** A chest radiograph described by CDC as fibrothorax.
- **Integration:** JPEG/single image; add separate labels for pleura, lung volume, and mediastinal position only in review mode.
- **Specific caveat:** Chronicity and etiology require history and comparison imaging.

### 24. Congestive Heart Failure Pattern on Chest X-Ray

- **Level/domain/artifact:** Step 2/internal medicine/emergency medicine; single chest radiograph.
- **Original vignette seed:** A patient with orthopnea and leg swelling has a chest radiograph. Ask learners to assess heart size, vascular congestion, edema, and effusions, then choose immediate stabilization priorities.
- **Objectives:** Recognize common radiographic signs of hydrostatic edema; distinguish imaging findings from severity at bedside; integrate film with oxygenation and examination.
- **Asset:** https://commons.wikimedia.org/wiki/File:Congestive_heart_failure_x-ray.png
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Congestive_heart_failure_x-ray.png#Licensing - **Public domain, U.S. federal government (CDC)**.
- **Attribution:** Centers for Disease Control and Prevention.
- **Neutral description:** A chest radiograph labeled by CDC as congestive heart failure.
- **Integration:** PNG/single image; preserve grayscale and include an unannotated learner view plus clinician-reviewed overlays.
- **Specific caveat:** Portable technique and patient positioning can change apparent cardiac size and congestion.

### 25. A Lung Mass on Chest Radiograph

- **Level/domain/artifact:** Step 2/internal medicine/oncology; single chest radiograph.
- **Original vignette seed:** An older adult with smoking history and unintentional weight loss has a unilateral opacity. Ask learners to localize it, avoid premature staging, and choose the next imaging step.
- **Objectives:** Identify a focal pulmonary mass; separate detection from tissue diagnosis; outline appropriate cross-sectional evaluation.
- **Asset:** https://commons.wikimedia.org/wiki/File:LungCancer-Xray-01.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:LungCancer-Xray-01.jpg#Licensing - **Public domain, U.S. federal government (NIH/NCI)**.
- **Attribution:** National Cancer Institute, National Institutes of Health; creator not specified on the file page.
- **Neutral description:** A chest radiograph released by NCI and labeled as lung cancer.
- **Integration:** JPEG/single image; remove diagnosis from learner-facing filename and alt text while keeping it in instructor metadata.
- **Specific caveat:** A mass on radiography is not a histologic diagnosis and the asset should not teach screening eligibility.

### 26. Posterior Fossa Tumor on MRI

- **Level/domain/artifact:** Step 1 neuroanatomy to pediatrics/neurology clerkship; single MRI image.
- **Original vignette seed:** A child presents with morning headache, vomiting, and gait instability. Ask learners to localize the lesion and reason about obstructive hydrocephalus before naming a tumor category.
- **Objectives:** Localize a posterior fossa mass; connect mass effect to symptoms; separate radiographic localization from histopathologic diagnosis.
- **Asset:** https://commons.wikimedia.org/wiki/File:MRI_of_PNET.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:MRI_of_PNET.jpg#Licensing - **Public domain, U.S. federal government (NIH/NCI)**.
- **Attribution:** National Institutes of Health/National Cancer Institute; preserve file-page creator information.
- **Neutral description:** An MRI identified by the source as a primitive neuroectodermal tumor.
- **Integration:** JPEG/single MRI slice; add orientation labels only after neuroradiology review and avoid invented windowing.
- **Specific caveat:** Modern nomenclature differs from older “PNET” labels; update terminology with a specialist while preserving source history.

### 27. White Matter Lesions and Blood Pressure Control

- **Level/domain/artifact:** Step 2/neurology/internal medicine; single comparative MRI panel.
- **Original vignette seed:** An older adult with longstanding hypertension has cognitive concerns and MRI white matter hyperintensities. Ask learners to describe the finding, explain vascular risk association, and avoid claiming it explains all symptoms.
- **Objectives:** Recognize white matter lesion patterns; connect small-vessel disease risk to hypertension; distinguish association from causation in symptom interpretation.
- **Asset:** https://commons.wikimedia.org/wiki/File:White_Matter_Lesions_%2848601156232%29.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:White_Matter_Lesions_%2848601156232%29.jpg#Licensing - **Public domain, U.S. federal government (NIH)**.
- **Attribution:** National Institutes of Health image gallery; SPRINT-related image, exact credit retained from file page.
- **Neutral description:** An NIH image panel illustrating MRI white matter lesions in the context of a blood-pressure study.
- **Integration:** JPEG/multi-panel image; do not separate panels without carrying panel meaning and provenance.
- **Specific caveat:** Do not infer an individual’s prognosis or cognitive diagnosis from this illustrative panel.

### 28. Acro-osteolysis on Hand Radiographs

- **Level/domain/artifact:** Step 2/rheumatology/endocrinology; multi-image hand radiograph panel.
- **Original vignette seed:** A patient has distal digit shortening and chronic occupational or systemic symptoms. Ask learners to describe terminal tuft resorption and construct a differential rather than jump to one disease.
- **Objectives:** Identify acro-osteolysis; distinguish terminal tuft from band patterns; generate a focused differential using exposure and systemic clues.
- **Asset:** https://commons.wikimedia.org/wiki/File:Acroosteolysis-_x-rays.png
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Acroosteolysis-_x-rays.png#Licensing - **Public domain, U.S. federal government (CDC)**.
- **Attribution:** Centers for Disease Control and Prevention.
- **Neutral description:** A hand-radiograph panel labeled by CDC as acro-osteolysis.
- **Integration:** PNG/multi-image panel; preserve panel order and add learner-controlled zoom for distal phalanges.
- **Specific caveat:** Etiology cannot be determined from morphology alone.

## Pathology and microscopy

### 29. Invasive Breast Cancer Filling a Duct

- **Level/domain/artifact:** Step 1/pathology or surgery clerkship; single H&E photomicrograph.
- **Original vignette seed:** A patient has a suspicious breast lesion and biopsy. Ask learners to compare normal duct architecture with tumor filling/invasion and connect morphology to why tissue diagnosis is necessary.
- **Objectives:** Identify duct and abnormal cellular proliferation; distinguish in situ from invasive concepts; relate histology to staging limits.
- **Asset:** https://commons.wikimedia.org/wiki/File:Breast_cancer_cells.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Breast_cancer_cells.jpg#Licensing - **Public domain, U.S. federal government (NIH/NCI)**.
- **Attribution:** Dr. Cecil Fox (photographer), National Cancer Institute; H&E image, 100x, August 1987.
- **Neutral description:** An NCI H&E slide described as breast cancer invading normal tissue and filling a duct.
- **Integration:** JPEG/single micrograph; retain stated magnification and do not add a scale bar unless calibrated.
- **Specific caveat:** Histologic subtype, grade, receptor status, and invasion require a pathologist and additional material.

### 30. Prostate Adenocarcinoma Histology

- **Level/domain/artifact:** Step 1/pathology or urology clerkship; single photomicrograph.
- **Original vignette seed:** A patient with an abnormal prostate evaluation undergoes biopsy. Ask learners to contrast crowded small glands with benign architecture and explain why a grade cannot be assigned casually from one image.
- **Objectives:** Recognize gland-forming adenocarcinoma morphology; compare benign and malignant architecture; explain the role and limits of Gleason grading.
- **Asset:** https://commons.wikimedia.org/wiki/File:Prostatehistopath.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Prostatehistopath.jpg#Licensing - **Public domain, U.S. federal government (NIH/NCI)**.
- **Attribution:** Composite by Commons/English Wikipedia user InvictaHOG from NIH/NCI CGAP photomicrographs; original page lacks machine-readable author metadata.
- **Neutral description:** A photomicrograph identified by NIH as invasive prostate adenocarcinoma.
- **Integration:** JPEG/single micrograph; use pathologist-reviewed region overlays and retain the untouched source.
- **Specific caveat:** Do not teach a Gleason score from an isolated, possibly compressed image.

### 31. Acid-Fast Bacilli in Sputum

- **Level/domain/artifact:** Step 1/microbiology to Step 2 infectious disease; single stained smear micrograph.
- **Original vignette seed:** A patient with chronic cough provides sputum. Ask learners to identify acid-fast organisms on the smear, interpret what a positive smear means, and name confirmatory steps.
- **Objectives:** Recognize acid-fast bacillus morphology; distinguish smear positivity from species identification; connect microscopy to isolation and molecular/culture testing.
- **Asset:** https://commons.wikimedia.org/wiki/File:TB_in_sputum.png
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:TB_in_sputum.png#Licensing - **Public domain, U.S. federal government (CDC)**.
- **Attribution:** Centers for Disease Control and Prevention.
- **Neutral description:** A sputum smear micrograph labeled by CDC as tuberculosis organisms in sputum.
- **Integration:** PNG/single micrograph; add an answer-reveal overlay marking representative bacilli, reviewed by microbiology faculty.
- **Specific caveat:** Smear morphology alone does not establish species or drug susceptibility.

### 32. Plasmodium falciparum on Peripheral Smear

- **Level/domain/artifact:** Step 1/microbiology and Step 2 infectious disease; single smear micrograph.
- **Original vignette seed:** A febrile traveler returns from a malaria-endemic region. Ask learners to identify falciparum-compatible forms, estimate urgency, and choose immediate testing/treatment considerations.
- **Objectives:** Recognize ring-form morphology and multiple infection of erythrocytes; distinguish falciparum-compatible features from definitive species confirmation; connect parasitemia/severity to urgency.
- **Asset:** https://commons.wikimedia.org/wiki/File:Plasmodium_falciparum_01.png
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Plasmodium_falciparum_01.png#Licensing - **Public domain, U.S. federal government (CDC)**.
- **Attribution:** Centers for Disease Control and Prevention.
- **Neutral description:** A blood-smear image identified by CDC as Plasmodium falciparum.
- **Integration:** PNG/single micrograph; pair with separate CC0/PD species images only in a licensed comparison stack.
- **Specific caveat:** Treatment decisions require clinical severity, parasitemia, geography, and current guidance.

### 33. Plasmodium vivax on Peripheral Smear

- **Level/domain/artifact:** Step 1/microbiology and Step 2 infectious disease; single smear micrograph.
- **Original vignette seed:** A patient has recurrent fever after travel. Ask learners to identify features compatible with P. vivax and explain why relapse prevention needs additional patient-specific testing.
- **Objectives:** Recognize enlarged infected erythrocytes and vivax-compatible forms; contrast with falciparum; connect hypnozoites and G6PD testing to management concepts.
- **Asset:** https://commons.wikimedia.org/wiki/File:Plasmodium_vivax_01.png
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Plasmodium_vivax_01.png#Licensing - **Public domain, U.S. federal government (CDC)**.
- **Attribution:** Centers for Disease Control and Prevention.
- **Neutral description:** A blood-smear image identified by CDC as Plasmodium vivax.
- **Integration:** PNG/single micrograph; create a blind compare/contrast interaction with the falciparum image.
- **Specific caveat:** Morphologic overlap and mixed infection require expert review and additional testing.

### 34. Giardia on Scanning Electron Microscopy

- **Level/domain/artifact:** Step 1/microbiology; single SEM image.
- **Original vignette seed:** A hiker develops foul-smelling diarrhea after untreated water exposure. Use the SEM only as a morphology bridge, then ask which stool tests are clinically useful.
- **Objectives:** Recognize Giardia’s characteristic trophozoite form; link exposure to a focused differential; distinguish illustrative SEM morphology from routine diagnosis.
- **Asset:** https://commons.wikimedia.org/wiki/File:Giardia_lamblia_SEM_8698_lores.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Giardia_lamblia_SEM_8698_lores.jpg#Licensing - **Public domain, U.S. federal government (CDC)**.
- **Attribution:** Centers for Disease Control and Prevention/PHIL, image 8698; retain file-page photographer/content-provider credit.
- **Neutral description:** A CDC scanning electron micrograph of Giardia lamblia.
- **Integration:** JPEG/single SEM; clearly label false color if applicable and retain magnification metadata where available.
- **Specific caveat:** SEM is not the usual clinical diagnostic method.

### 35. Microvesicular Fatty Change in Reye Syndrome

- **Level/domain/artifact:** Step 1/pathology and pediatrics; single liver histology image.
- **Original vignette seed:** A child develops vomiting and encephalopathy after a viral illness and aspirin exposure. Ask learners to connect microvesicular steatosis to mitochondrial dysfunction and the prevention message.
- **Objectives:** Identify microvesicular fatty change; connect hepatic mitochondrial injury to hypoglycemia/hyperammonemia; distinguish this pattern from macrovesicular steatosis.
- **Asset:** https://commons.wikimedia.org/wiki/File:Reye%27s_syndrome_liver-histology.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Reye%27s_syndrome_liver-histology.jpg#Licensing - **Public domain, U.S. federal government (CDC)**.
- **Attribution:** Centers for Disease Control and Prevention.
- **Neutral description:** A liver histology image identified by CDC as Reye syndrome.
- **Integration:** JPEG/single micrograph; include a separate, clinician-authored normal comparator rather than altering the source.
- **Specific caveat:** The syndrome is a clinical-pathologic diagnosis; do not infer exposure or causality from histology alone.

### 36. Schistosoma-Associated Bladder Pathology

- **Level/domain/artifact:** Step 1/microbiology/pathology to urology clerkship; single histopathology image.
- **Original vignette seed:** A patient from an endemic region has terminal hematuria. Ask learners to recognize parasite-associated bladder inflammation, connect exposure route to disease, and consider long-term malignancy risk.
- **Objectives:** Identify schistosome ova/inflammation in bladder tissue; connect freshwater exposure to urinary disease; explain chronic-inflammation complications.
- **Asset:** https://commons.wikimedia.org/wiki/File:Schistosoma_bladder_histopathology.jpeg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Schistosoma_bladder_histopathology.jpeg#Licensing - **Public domain, U.S. federal government (CDC)**.
- **Attribution:** Centers for Disease Control and Prevention.
- **Neutral description:** A bladder histopathology image identified by CDC as schistosomiasis.
- **Integration:** JPEG/single micrograph; keep source label instructor-only and use a region overlay for ova after pathology review.
- **Specific caveat:** Species, activity, and cancer diagnosis cannot be determined from one low-resolution field.

## Dermatology and visible bedside diagnosis

### 37. Multiple Pigmented Lesions and Melanoma

- **Level/domain/artifact:** Step 2/dermatology or primary care; single clinical photograph.
- **Original vignette seed:** A patient presents with numerous darkly pigmented lesions and one changing lesion. Ask learners to use a structured description and identify which features require urgent dermoscopic/biopsy evaluation.
- **Objectives:** Apply ABCDE language; distinguish screening concern from diagnosis; choose appropriate escalation for a changing pigmented lesion.
- **Asset:** https://commons.wikimedia.org/wiki/File:Malignant_melanoma_on_chest.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Malignant_melanoma_on_chest.jpg#Licensing - **Public domain, U.S. federal government (CDC)**.
- **Attribution:** CDC/PHIL image 13444; Carl Washington, M.D. (Emory University School of Medicine) and Mona Saraiya, M.D., M.P.H.
- **Neutral description:** A clinical chest photograph published by CDC and described as multiple lesions diagnosed as malignant melanoma.
- **Integration:** JPEG/single patient photograph; crop to lesions only after ethics/privacy review and never use as a skin-tone “normalization” target.
- **Specific caveat:** Copyright status does not prove consent for every reuse; facial/identity review and clinician review are mandatory.

### 38. A Pearly Waxy Papule

- **Level/domain/artifact:** Step 2/primary care or dermatology; single clinical photograph.
- **Original vignette seed:** A patient has a slowly enlarging shiny pale papule on a sun-exposed area. Ask learners to describe it, generate a differential, and choose biopsy rather than name a cancer solely from appearance.
- **Objectives:** Describe papule morphology; recognize features concerning for basal cell carcinoma; explain why biopsy confirms diagnosis.
- **Asset:** https://commons.wikimedia.org/wiki/File:Skin_cancer_waxy_lump.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Skin_cancer_waxy_lump.jpg#Licensing - **Public domain, U.S. federal government (NIH/NCI)**.
- **Attribution:** Dermatology Branch, National Cancer Institute.
- **Neutral description:** An NCI clinical photograph described as a small smooth shiny pale waxy lump that may be skin cancer.
- **Integration:** JPEG/single clinical photo; color-manage consistently and do not sharpen or recolor the lesion.
- **Specific caveat:** Appearance alone cannot establish histology; ensure teaching works across skin tones with additional separately licensed examples.

### 39. A Rough Scaly Red Patch

- **Level/domain/artifact:** Step 2/primary care or dermatology; single clinical photograph.
- **Original vignette seed:** An older outdoor worker has a persistent rough scaly erythematous patch. Ask learners to distinguish descriptive morphology, precancerous concern, and biopsy indications.
- **Objectives:** Describe a scaly erythematous patch; compare actinic keratosis, squamous carcinoma, eczema, and psoriasis; identify features requiring biopsy/referral.
- **Asset:** https://commons.wikimedia.org/wiki/File:Scaly_red_skin_spot.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Scaly_red_skin_spot.jpg#Licensing - **Public domain, U.S. federal government (NIH/NCI)**.
- **Attribution:** Dermatology Branch, National Cancer Institute.
- **Neutral description:** An NCI photograph described as a flat red area that has become rough, dry, and scaly.
- **Integration:** JPEG/single clinical photo; hide source diagnosis in learner mode and provide calibrated display guidance.
- **Specific caveat:** One legacy NCI photo is not representative of all skin tones or presentations.

### 40. Secondary Syphilis Rash

- **Level/domain/artifact:** Step 2/internal medicine, family medicine, or sexual health; single clinical photograph.
- **Original vignette seed:** A patient has a diffuse rash including palms/soles plus systemic symptoms and a recent painless ulcer. Ask learners to describe the rash, choose testing, and provide nonjudgmental counseling.
- **Objectives:** Recognize a secondary-syphilis-compatible distribution; connect disease stages; choose treponemal/nontreponemal testing and partner/public-health steps.
- **Asset:** https://commons.wikimedia.org/wiki/File:Manifestations_of_secondary_syphilis_Treponema_pallidum_6539_lores.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Manifestations_of_secondary_syphilis_Treponema_pallidum_6539_lores.jpg#Licensing - **Public domain, U.S. federal government (CDC)**.
- **Attribution:** Centers for Disease Control and Prevention/PHIL, image 6539.
- **Neutral description:** A CDC clinical image showing cutaneous manifestations identified as secondary syphilis.
- **Integration:** JPEG/single patient photograph; privacy crop, neutral filename, and trauma-informed wording are required.
- **Specific caveat:** Rash is nonspecific and testing/treatment content must follow current guidelines.

### 41. Rubella-Like Exanthem

- **Level/domain/artifact:** Pediatrics/family medicine/Step 2; single clinical photograph.
- **Original vignette seed:** A child has a fine erythematous rash after mild prodromal illness. Ask learners to compare rubella, measles, roseola, and drug eruption and identify pregnancy/public-health implications.
- **Objectives:** Describe a maculopapular exanthem; distinguish clinical clues among common exanthems; explain why laboratory/public-health confirmation matters.
- **Asset:** https://commons.wikimedia.org/wiki/File:Rash_of_rubella_on_skin_of_child%27s_back.JPG
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Rash_of_rubella_on_skin_of_child%27s_back.JPG#Licensing - **Public domain, U.S. federal government (CDC)**.
- **Attribution:** Centers for Disease Control and Prevention.
- **Neutral description:** A CDC photograph described as rubella rash on a child’s back.
- **Integration:** JPEG/single patient photograph; use a cropped back-only view and strip metadata; avoid showing diagnosis in alt text before answer reveal.
- **Specific caveat:** A rash photo cannot confirm rubella and the real child image needs privacy/ethics review.

### 42. Cutaneous Histoplasmosis in Disseminated Disease

- **Level/domain/artifact:** Advanced Step 2/internal medicine/infectious disease; single clinical photograph.
- **Original vignette seed:** An immunocompromised patient in an endemic area has systemic symptoms and a new ulcerative skin lesion. Ask learners to integrate cutaneous findings with disseminated infection and select biopsy/culture/antigen tests.
- **Objectives:** Describe the lesion without overclaiming specificity; connect immunosuppression to dissemination; choose appropriate diagnostic sampling.
- **Asset:** https://commons.wikimedia.org/wiki/File:Histoplasmosis,_due_to_the_fungus_Histoplasma_capsulatum_skin_lesion_6840_lores.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Histoplasmosis,_due_to_the_fungus_Histoplasma_capsulatum_skin_lesion_6840_lores.jpg#Licensing - **Public domain, U.S. federal government (CDC)**.
- **Attribution:** Centers for Disease Control and Prevention/PHIL, image 6840.
- **Neutral description:** A CDC clinical photograph identified as a Histoplasma capsulatum skin lesion.
- **Integration:** JPEG/single patient photograph; lesion crop and privacy review required; preserve surrounding skin enough to teach morphology.
- **Specific caveat:** Cutaneous appearance is not pathogen-specific.

### 43. Intertriginous Candidiasis

- **Level/domain/artifact:** Step 2/family medicine or inpatient medicine; single clinical photograph.
- **Original vignette seed:** A patient with diabetes has a painful erythematous rash in a moist skin fold with peripheral satellite lesions. Ask learners to build the differential and address predisposing factors.
- **Objectives:** Recognize an intertriginous candidiasis-compatible pattern; distinguish it from inverse psoriasis and bacterial intertrigo; identify moisture, glucose, and medication risk factors.
- **Asset:** https://commons.wikimedia.org/wiki/File:Derm-57.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Derm-57.jpg#Licensing - **Public domain, U.S. federal government (Department of Veterans Affairs)**.
- **Attribution:** U.S. Department of Veterans Affairs HIV dermatology teaching file.
- **Neutral description:** A VA clinical photograph labeled skin candidiasis.
- **Integration:** JPEG/single patient photograph; privacy crop and neutral alt text required.
- **Specific caveat:** Confirm that the current file page contains no patient identifiers and have dermatology review the morphology.

### 44. Pseudofolliculitis Barbae

- **Level/domain/artifact:** Step 2/primary care, dermatology, military medicine; single clinical photograph.
- **Original vignette seed:** A patient develops inflammatory papules in the beard area after close shaving. Ask learners to explain the mechanical cause and propose culturally sensitive grooming and treatment options.
- **Objectives:** Recognize a follicular beard-area pattern; explain curved-hair re-entry; distinguish pseudofolliculitis from bacterial folliculitis and acne.
- **Asset:** https://commons.wikimedia.org/wiki/File:Pseudofolliculitis_Barbae.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Pseudofolliculitis_Barbae.jpg#Licensing - **Public domain, U.S. federal government (U.S. Army)**.
- **Attribution:** Army Medical Department; Madigan Army Medical Center Dermatology and SAUSHEC Dermatology teaching file.
- **Neutral description:** A clinical photograph from a U.S. military dermatology teaching file identified as pseudofolliculitis barbae.
- **Integration:** JPEG/single patient photograph; crop to beard area, preserve skin color fidelity, and run enhanced privacy review.
- **Specific caveat:** Avoid racial essentialism; teach hair curvature, shaving practices, and occupational policy without stereotyping.

## Ophthalmology and fundus interpretation

### 45. Establishing a Normal Fundus Baseline

- **Level/domain/artifact:** Step 1 anatomy to Step 2/primary care; single fundus photograph.
- **Original vignette seed:** A learner must orient a normal fundus before seeing pathology. Ask them to identify optic disc, macula, vessels, and expected disc-to-cup language.
- **Objectives:** Identify major fundus landmarks; describe normal vessel emergence and macular location; establish a structured examination sequence.
- **Asset:** https://commons.wikimedia.org/wiki/File:Fundus_photograph-normal_retina_EDA06.JPG
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Fundus_photograph-normal_retina_EDA06.JPG#Licensing - **Public domain, U.S. federal government (NIH/NEI)**.
- **Attribution:** National Eye Institute, National Institutes of Health, ref. EDA06.
- **Neutral description:** A fundus photograph labeled by NEI as a normal retina.
- **Integration:** JPEG/single fundus image; circular crop only if no anatomy is lost; add keyboard-accessible landmark pins.
- **Specific caveat:** Do not use one image as a universal normal across age, pigmentation, camera, and refractive status.

### 46. Background Diabetic Retinopathy

- **Level/domain/artifact:** Step 2/internal medicine or ophthalmology; single fundus photograph.
- **Original vignette seed:** A patient with diabetes has no visual symptoms but screening photography shows early vascular changes. Ask learners to identify abnormalities and connect them to follow-up rather than emergency treatment.
- **Objectives:** Recognize microvascular retinal changes; distinguish nonproliferative/background disease from proliferative disease; connect severity to screening and referral.
- **Asset:** https://commons.wikimedia.org/wiki/File:Fundus_retinopathy_EDA03.JPG
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Fundus_retinopathy_EDA03.JPG#Licensing - **Public domain, U.S. federal government (NIH/NEI)**.
- **Attribution:** National Eye Institute, National Institutes of Health, ref. EDA03.
- **Neutral description:** A fundus photograph described by NEI as background retinopathy with small-vessel deterioration and leakage.
- **Integration:** JPEG/single fundus image; add reversible lesion markers after ophthalmology adjudication.
- **Specific caveat:** Grade and management cannot be assigned safely from a single uncalibrated image.

### 47. Proliferative Diabetic Retinopathy

- **Level/domain/artifact:** Step 2/internal medicine/ophthalmology; single fundus photograph.
- **Original vignette seed:** A patient with longstanding diabetes reports new floaters. Ask learners to identify neovascularization-compatible changes and recognize the urgency of ophthalmic referral.
- **Objectives:** Distinguish proliferative from nonproliferative disease; recognize neovascularization and hemorrhage concepts; connect symptoms to urgent evaluation.
- **Asset:** https://commons.wikimedia.org/wiki/File:Fundus_Proliferative_retinopathy_EDA01.JPG
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Fundus_Proliferative_retinopathy_EDA01.JPG#Licensing - **Public domain, U.S. federal government (NIH/NEI)**.
- **Attribution:** National Eye Institute, National Institutes of Health, ref. EDA01.
- **Neutral description:** A fundus photograph labeled by NEI as proliferative retinopathy.
- **Integration:** JPEG/single fundus image; use a compare mode with the background-retinopathy image and keep distinct provenance for both.
- **Specific caveat:** A specialist must validate all marked lesions and referral language.

### 48. Diabetic Macular Edema

- **Level/domain/artifact:** Step 2/internal medicine/ophthalmology; single fundus photograph.
- **Original vignette seed:** A patient with diabetes reports central visual blur. Ask learners to locate the macula, identify leakage/exudate-compatible findings, and explain why central location matters.
- **Objectives:** Locate the macula; recognize a macular-edema-compatible pattern; connect central retinal involvement to visual symptoms and referral.
- **Asset:** https://commons.wikimedia.org/wiki/File:Fundus_Diabetic_macular_edema_EDA04.JPG
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Fundus_Diabetic_macular_edema_EDA04.JPG#Licensing - **Public domain, U.S. federal government (NIH/NEI)**.
- **Attribution:** National Eye Institute, National Institutes of Health, ref. EDA04.
- **Neutral description:** A fundus photograph labeled by NEI as diabetic macular edema.
- **Integration:** JPEG/single fundus image; provide a macula-localization overlay and avoid contrast changes that exaggerate exudates.
- **Specific caveat:** OCT and clinical examination are central to diagnosis and treatment decisions.

### 49. Intermediate Age-Related Macular Degeneration

- **Level/domain/artifact:** Step 2/geriatrics, primary care, or ophthalmology; single fundus photograph.
- **Original vignette seed:** An older adult reports difficulty reading in dim light. Ask learners to identify drusen/pigmentary change, distinguish dry/intermediate disease from acute neovascular symptoms, and counsel on urgent warning signs.
- **Objectives:** Recognize intermediate AMD-compatible fundus changes; connect macular location to central vision; distinguish routine follow-up from new distortion requiring urgent evaluation.
- **Asset:** https://commons.wikimedia.org/wiki/File:Intermediate_age_related_macular_degeneration.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Intermediate_age_related_macular_degeneration.jpg#Licensing - **Public domain, U.S. federal government (NIH/NEI)**.
- **Attribution:** National Eye Institute, National Institutes of Health, ref. EDA2.
- **Neutral description:** An NEI fundus photograph described as intermediate age-related macular degeneration.
- **Integration:** JPEG/single fundus image; mark drusen only in feedback mode and validate display color.
- **Specific caveat:** Do not infer acuity or treatment eligibility from this still.

### 50. CMV Retinitis in an Immunocompromised Patient

- **Level/domain/artifact:** Advanced Step 2/internal medicine, infectious disease, ophthalmology; single fundus photograph.
- **Original vignette seed:** A severely immunocompromised patient reports floaters and visual field loss. Ask learners to recognize a necrotizing retinitis pattern and prioritize same-day ophthalmologic evaluation.
- **Objectives:** Recognize a CMV-retinitis-compatible fundus pattern; connect immune status to risk; distinguish urgent referral from routine outpatient follow-up.
- **Asset:** https://commons.wikimedia.org/wiki/File:Fundus_photograph-CMV_retinitis_EDA07.JPG
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Fundus_photograph-CMV_retinitis_EDA07.JPG#Licensing - **Public domain, U.S. federal government (NIH/NEI)**.
- **Attribution:** National Eye Institute, National Institutes of Health, ref. EDA07.
- **Neutral description:** A fundus photograph labeled by NEI as CMV retinitis.
- **Integration:** JPEG/single fundus image; remove diagnostic title in learner mode and provide answer-reveal annotations.
- **Specific caveat:** Other infectious and inflammatory retinitides can overlap; specialist confirmation is required.

### 51. Retinal Detachment in von Hippel-Lindau Disease

- **Level/domain/artifact:** Step 1 genetics to Step 2 ophthalmology/neurology; single slit-lamp/fundus photograph.
- **Original vignette seed:** A young adult with a family history of retinal and CNS tumors reports flashes and a curtain-like visual deficit. Ask learners to identify detachment, act on symptoms, and connect findings to syndromic surveillance.
- **Objectives:** Recognize retinal detachment; identify flashes/floaters/curtain as emergencies; connect VHL to retinal angiomas and multisystem surveillance.
- **Asset:** https://commons.wikimedia.org/wiki/File:Retinal_detachment_in_Von_Hippel-Lindau_disease.jpg
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:Retinal_detachment_in_Von_Hippel-Lindau_disease.jpg#Licensing - **Public domain, U.S. federal government (NIH/NEI)**.
- **Attribution:** National Eye Institute, National Institutes of Health, ref. EDA08.
- **Neutral description:** An NEI image described as retinal detachment in von Hippel-Lindau disease.
- **Integration:** JPEG/single image; annotate detached retina only after specialist review; preserve the full field.
- **Specific caveat:** The source diagnosis is syndromic context, but this image alone cannot diagnose VHL.

### 52. What Retinitis Pigmentosa Can Feel Like

- **Level/domain/artifact:** Step 1 visual pathways to Step 2 primary care/ophthalmology; single simulated-vision image.
- **Original vignette seed:** A patient reports progressive night blindness and tunnel vision. Instead of a fundus image, the learner first sees a visual simulation and must translate the experience into history, examination, and referral questions.
- **Objectives:** Connect peripheral field loss to patient experience; elicit night-vision and family-history symptoms; distinguish a simulation from diagnostic evidence.
- **Asset:** https://commons.wikimedia.org/wiki/File:A_scene_as_it_might_be_viewed_by_a_person_with_retinitis_pigmentosa_EDS07.JPG
- **License evidence/label:** https://commons.wikimedia.org/wiki/File:A_scene_as_it_might_be_viewed_by_a_person_with_retinitis_pigmentosa_EDS07.JPG#Licensing - **Public domain, U.S. federal government (NIH/NEI)**.
- **Attribution:** National Eye Institute, National Institutes of Health, ref. EDS07.
- **Neutral description:** An NEI simulation of a scene as it might be viewed by a person with retinitis pigmentosa.
- **Integration:** JPEG/single simulation; label prominently as a simulation, include an accessible textual equivalent, and never use it as a diagnostic test.
- **Specific caveat:** Individual experiences vary; avoid claiming the simulation represents every person with retinitis pigmentosa.

## Recommended implementation order

Start with assets that are both high-yield and technically simple:

1. Normal sinus rhythm, sinus arrhythmia, PVC, and first-degree AV block.
2. Normal fundus, background retinopathy, proliferative retinopathy, and macular edema.
3. Tuberculosis chest radiograph, CHF chest radiograph, lung mass, and white matter lesions.
4. Normal appendix, cholecystitis, four-chamber orientation, and lung B-lines.
5. Falciparum/vivax comparison, TB sputum, breast histology, and prostate histology.
6. Waxy papule, scaly patch, secondary syphilis, and pseudofolliculitis barbae after privacy review.

The strongest catalog structure is one PR per coherent **lesson family**, with one commit per lesson, rather than 52 simultaneous one-file PRs. Suggested families: `ecg-basics`, `bundle-blocks`, `hemodynamics`, `pocus-abdomen`, `pocus-cardiac`, `chest-radiography`, `neuro-and-msk-radiology`, `blood-and-parasite-microscopy`, `cancer-histopathology`, `dermatology`, and `fundoscopy`. Each PR should contain the asset/provenance record, original case, answer key, objective tags, accessibility text, and tests.

### Evidence tiers for merge review

- **Tier A:** File-level U.S. federal public domain plus named agency/reference number (CDC PHIL, NEI EDA/EDS, NCI image ID). These are the best first merges, although medical accuracy and patient privacy still need review.
- **Tier B:** CC0 or PD-self with a named clinician/creator and a clear description (Rocuronium Bromide ECG vectors; Mikael Häggström ultrasound/lead-placement images; Kjetil Lenes echocardiograms; Stefan Bellini ECG/CVP image). Merge after one independent clinician verifies the depicted finding.
- **Tier C:** Public-domain assertion based on no original authorship, missing machine-readable creator/source, a legacy composite, or an externally visible real patient (for example the 12-week scan, prostate composite, and clinical dermatology photographs). Keep these as candidates until provenance, privacy, and clinical review are explicitly signed off.
