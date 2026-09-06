# Guided practice and deskilling

CaseAttend uses educator-supplied case facts to coach reasoning. The design aims to support independent thinking; it has not demonstrated prevention of deskilling, durable learning, clinical competence, or superiority over other teaching methods.

## Evidence informing the design

- **Bastani et al., PNAS (2025).** A randomized field study of nearly 1,000 high-school mathematics students separated assisted practice from an unassisted examination. Standard GPT assistance improved practice performance but the unassisted result was 17% lower than control. A tutor with teacher-designed safeguards largely removed that penalty; it did not establish a positive independent-exam effect. This was one school and short-term mathematics practice, not clinical training. The transferable design hypothesis is to supply teacher facts and hints while requiring student reasoning. [Article and correction notice](https://doi.org/10.1073/pnas.2422633122).
- **Kestin et al., Scientific Reports (2025).** A randomized crossover study of introductory physics found better immediate learning outcomes with a carefully structured tutor than in-class active learning. The authors report that prompts alone did not reliably enforce the intended sequence, so the application controlled progression. Two lessons at one university do not establish long-term retention or medical transfer. [Primary article](https://www.nature.com/articles/s41598-025-97652-6).
- **Budzyń et al., Lancet Gastroenterology & Hepatology (2025).** An observational before/after analysis reported lower adenoma detection during non-AI colonoscopies after AI implementation. The result motivates monitoring independent performance, but it does not prove permanent or causal deskilling. Procedural visual assistance also differs from conversational tutoring. The published correction should accompany interpretation. [PubMed record](https://pubmed.ncbi.nlm.nih.gov/40816301/), [correction](https://www.sciencedirect.com/science/article/abs/pii/S2468125325002948).
- **Roediger and Karpicke, Psychological Science (2006).** Retrieval practice improved delayed recall relative to restudy in prose-learning experiments, even though restudy improved immediate performance and confidence. This supports testing independent recall, with limits on extrapolating to clinical reasoning or AI. [Primary abstract](https://pubmed.ncbi.nlm.nih.gov/16507066/).

## Product interpretation

1. The answer key supplies known findings and locations. The model must not invent a diagnosis or silently replace educator facts. Extracted slide text and notes are instructor source material.
2. Students attempt a question before receiving hints. Guided mode suppresses cached-answer reveal controls. The application exposes explicit attempt and hint stages, alongside model instructions.
3. A separate small-model request checks only the submitted learner text against the current level's objectives and rubric. It returns exact learner quotations and constrained status codes. It cannot author corrective text in the evidence panel.
4. Status is **objective evidence**, not mastery. Help used is recorded. A same-case answer after feedback remains assisted even if no new hint is requested. Transfer requires another suitable case, and retention requires a delayed assessment.
5. Missing credentials, provider failures, invalid responses, ambiguous evidence, copied text, and absent reasoning must never become fabricated learning credit. Quotes and assessments remain ephemeral in ordinary learning. Frozen research is outside this integration.

## Evaluation still required

Before making educational-outcome claims, compare evaluator labels with independent educator judgments across correct paraphrases, incomplete reasoning, misconceptions, copied answers, and ambiguous responses. Assess calibration and disagreement by learner level. Run a prospectively specified study using separate unassisted and delayed outcomes, not completion counts or assisted chat accuracy. Model-based checks are formative and fallible.
