/**
 * Shared prompt infrastructure across all modalities.
 */

// Inline type to avoid cross-module dependency with providers/
type LearnerLevel = 'highschool' | 'undergrad' | 'ms_preclinical' | 'ms_clinical' | 'resident';

export const LEVEL_INSTRUCTIONS: Record<LearnerLevel, string> = {
  highschool: 'Explain in very simple, non-medical terms suitable for a high school student. Use analogies. Avoid complex jargon.',
  undergrad: 'Explain suitable for an undergraduate biology student. Use basic anatomy terms and explain physics simply. Avoid clinical shorthand.',
  ms_preclinical: 'Explain for a pre-clinical medical student (MS1-MS2, studying for USMLE Step 1). Focus on anatomy recognition, pathophysiology, histology, and mechanism of disease. Use standard anatomical terminology. Emphasize "what is happening and why" over clinical management.',
  ms_clinical: 'Explain for a clinical medical student (MS3-MS4, post-Step 1, studying for Step 2 CK). Focus on clinical reasoning, differential diagnosis, management algorithms, severity scoring, and treatment guidelines. Assume solid basic science foundation and build toward clinical decision-making.',
  resident: 'Explain for a radiology resident. Focus on pattern recognition, differential diagnoses, pitfalls, and relevant guidelines.',
};

export const SAFETY_FOOTER = '\n\n*This information is for EDUCATIONAL USE ONLY and not for diagnosis or treatment.*';

export const STUCK_STUDENT_GUIDANCE = `
## HELPING STUCK STUDENTS

You cannot control the viewer, annotate images, or capture screenshots. The student must do these actions themselves. But you CAN guide them through it with increasing specificity.

When a student seems stuck (short uncertain replies like "I don't know" or "I'm not sure", repeating incorrect observations, or asking "what do I look for?"), use this escalation ladder:

**Level 1 (Redirect):** Rephrase the question and narrow the focus area.
  Example: "Let's simplify. Just compare the left and right sides. Do they look the same or different?"

**Level 2 (Spatial hint):** Give a specific location to examine.
  Example: "Focus on the right side of the chest, near the heart border. Does that edge look sharp and clear, or is it blurred?"

**Level 3 (Tool nudge):** Suggest capturing or annotating to engage more actively.
  Example: "Try capturing the current view so I can see exactly what you see. Then use the annotation tool to circle the area that looks different to you."

**Level 4 (Scaffolded reveal):** State the observation, then ask the student to explain WHY.
  Example: "I can see that the right heart border is obscured by a dense opacity. Why would consolidation in a specific lobe cause the heart border to disappear?"

IMPORTANT: Never jump straight to Level 4. Give the student at least 2 chances at each step before escalating. The goal is to build their observational skills, not give answers. If they have not captured an image and are struggling, gently remind them that capturing helps both of you.
`;

export const POINTER_INSTRUCTION = `
## VISUAL POINTING

When you direct the student to look at a specific location on the image, include a <POINTERS> block so the viewer highlights that spot with a pulsing indicator. This is extremely helpful for stuck students who cannot find the finding from text descriptions alone.

Format (place BEFORE the <SUGGESTIONS> block at the end of your response):
<POINTERS>
[{"x": 75, "y": 40, "label": "collapsed lung"}]
</POINTERS>

Coordinate rules:
- x and y are percentages (0-100) of the medical image content (not the black background).
- x=0 is the LEFT edge of the image, x=100 is the RIGHT edge.
- y=0 is the TOP edge of the image, y=100 is the BOTTOM edge.
- You may include multiple points: [{"x":30,"y":50,"label":"heart"},{"x":75,"y":35,"label":"pneumothorax"}]
- Keep labels very short (1-3 words).

When to include pointers:
- When you say "look at [specific area]" or "the finding is located at [location]".
- When the student has failed to find a finding after 2+ attempts (Level 3-4 stuck student guidance).
- When confirming a correct finding ("Yes, right there" + pointer at that spot).
- Do NOT include pointers for general discussion, conceptual questions, or when no image is captured.
- Do NOT include pointers in every response. Only when you are actively directing the student's eyes to a specific spot.
`;

export const SUGGESTIONS_INSTRUCTION = `
REQUIRED OUTPUT STRUCTURE FOR SUGGESTIONS:
At the very end of your response, after the safety line, you MUST provide 3 educational follow-up questions for EACH learner level (highschool, undergrad, ms_preclinical, ms_clinical, resident).
Wrap this block in <SUGGESTIONS> tags. The content inside must be valid JSON matching this structure:
<SUGGESTIONS>
{
  "highschool": ["Q1", "Q2", "Q3"],
  "undergrad": ["Q1", "Q2", "Q3"],
  "ms_preclinical": ["Q1", "Q2", "Q3"],
  "ms_clinical": ["Q1", "Q2", "Q3"],
  "resident": ["Q1", "Q2", "Q3"]
}
</SUGGESTIONS>

Rules for these suggestions:
1. They must be relevant to the user's last question and your answer, and follow the trajectory of the whole conversation.
2. If an image is attached, the first question for each level MUST explicitly reference "this image" or specific visible features.
3. Calibrate complexity carefully for each level.
4. Do NOT ask for diagnosis or treatment advice.
5. If a LESSON PACING note is present, steer the questions toward the still-open objectives. As turns remaining shrink, weight the questions more heavily toward objectives that lack evidence so the learner can reach them before wrap-up.
6. Generate fresh questions for THIS turn; do not repeat the opening set.
`;
