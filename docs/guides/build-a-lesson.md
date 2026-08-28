# Build a lesson

[← Documentation home](../README.md)

Lesson Builder turns your teaching intent into a structured, versioned lesson. The tutor still responds conversationally, but your plan gives that conversation a destination.

You need a Case Package before you begin. You can choose a built-in case or [create your own visual case](create-a-case.md).

## Plan the lesson first

A small, specific lesson usually works better than a long list of topics. Before opening the builder, write down:

- who the learners are;
- what they should be able to notice, explain, compare, or decide;
- what you would accept as evidence of learning;
- the first question you want the tutor to ask;
- how hints should become more explicit;
- when the tutor should stop; and
- which sources support the image and the clinical teaching claims.

Use the [lesson-planning worksheet](../templates/lesson-planning-worksheet.md) if you want a fill-in template.

## Open Lesson Builder

Choose one route:

- From the home screen, select **Create a lesson from PDF or PowerPoint**. Import is optional; you can build the lesson manually.
- After saving a browser-local case, select **Build the lesson**.

Lesson Builder has five steps: **Setup**, **Objectives/evidence**, **Tutor path**, **Sources/review**, and **Review/export**.

If your source material is already in a PDF or PowerPoint presentation, you may first [import its text into an editable draft](import-pdf-powerpoint.md). Import is a starting point, not a finished lesson.

## Step 1: Set up the lesson

### Choose the Case Package

Select the exact visual case this lesson teaches. A lesson remains linked to that case revision.

### Name and version the lesson

- **Lesson title:** a human-readable title.
- **Stable lesson ID:** lowercase words separated by hyphens, such as `pleural-line-reasoning`.
- **Content version:** a three-part version such as `1.0.0`.

Keep the same lesson ID across revisions. Increase the version when teaching content changes:

- `1.0.0` for the first learner-ready release;
- `1.0.1` for a small correction that does not change the learning design;
- `1.1.0` for a meaningful addition or teaching-path improvement; and
- `2.0.0` when the purpose or expected learner behavior changes substantially.

Version numbers are an educator convention, not an automatic clinical-review process.

### Define the audience

Choose every learner level the lesson is designed to support. List genuine prerequisites one per line. A prerequisite is something learners should already know, not another objective for this lesson.

### Check the neutral description

Describe what the learner receives without naming the answer. This answer-safe description is shared by the case and lesson.

## Step 2: Define objectives and evidence

Each objective has four connected parts:

| Part | Purpose | Example |
| --- | --- | --- |
| **Objective ID** | Stable label used inside the plan | `compare-sides` |
| **Learner-facing objective** | What the learner should accomplish | `Compare the pleural margins on both sides.` |
| **Assessment criterion** | The standard for satisfactory performance | `The learner makes a side-to-side comparison before naming a finding.` |
| **Observable evidence** | What the tutor could hear in the conversation | `Names the relevant landmark` or `Explains the asymmetry in their own words` |

Write objectives around visible behavior. “Understand the image” is hard to assess. “Identify two relevant features and explain how each changes the differential” is observable.

Start with one to three objectives. Use **Add objective** only when the added objective is necessary for this specific case.

## Step 3: Design the tutor path

### Socratic opening

Write the first focused question the learner should receive. It should direct attention without revealing the answer.

Example:

> Before naming a diagnosis, which two regions would you compare, and what difference do you notice?

### Allowed hints

Link each hint to an objective and arrange hints from least to most revealing.

1. **Orient:** suggest where to look.
2. **Compare:** name a useful comparison.
3. **Interpret:** connect the feature to a concept.
4. **Explain:** reveal more only after the learner has attempted the reasoning.

A hint is permission for the tutor to use that information. It is not a guarantee that every model response will be perfect, so rehearse the lesson.

### Escalation conditions

State when the tutor may become more explicit and what it should do. Good conditions are observable:

- the learner has attempted the same objective twice;
- the learner asks for direct help after receiving a hint; or
- the learner states a safety-critical misconception.

Avoid vague rules such as “when confused.” Describe what confusion would look like in the interaction.

### Stopping conditions

Define when the teaching exchange should conclude and the message the tutor should give. A stopping condition might be successful completion, a reasonable turn limit, repeated inability to progress, or a safety boundary.

The stopping message should summarize the next appropriate step without pretending the learner has mastered more than the conversation showed.

### Educator instructions and answer notes

Use **Educator tutor instructions** for tone, sequence, learner agency, and behavior to avoid. Use **Answer-revealing teaching notes** for the actual teaching interpretation, one note per line.

Answer notes are exported and may be sent to the selected model during a learner interaction. They are not shown as the neutral case description.

## Step 4: Add sources and record review state

Every source has a role:

- **Artifact provenance** identifies where the case image came from.
- **Clinical teaching** supports a medical or educational claim in the lesson.

A reuse license is not clinical evidence. An image-source page does not automatically support the diagnosis or management discussion. Add an HTTPS URL, a DOI, or both, and verify the source yourself.

Leave **Reviewed by a qualified clinician** off unless that review has actually occurred. If you turn it on, record the reviewer, credentials, and review time. A reviewed lesson also needs a clinical-teaching source. CaseAttend validates that the fields are present; it does not verify the reviewer or grant approval.

## Step 5: Review, validate, and export

When you open **Review/export**, Lesson Builder validates the plan and creates SHA-256 hashes—digital fingerprints—for the exact lesson and linked case. Any content change produces a different fingerprint. Fix every item under **Review these items**, then select **Validate lesson** if needed.

Review the exact prompt preview:

- **Fixed by CaseAttend** contains the locked public safety policy.
- **Educator controlled** contains your versioned lesson content.
- **Runtime case context** shows the case information used for the preview.

Then use the export action shown for the selected case: **Export portable case** for a browser-created case or **Export JSON bundle** for a built-in case.

The result depends on the case:

- For a case created in this browser, the lesson revision is saved with that case and the download is a portable `.caseattend` file containing the linked lesson and referenced re-encoded images.
- For a built-in case, the download is a JSON case-and-lesson bundle. It records the metadata, versions, and hashes, but it is not a `.caseattend` restore file for Case Studio.

Lesson Builder does not provide general draft autosave for every path. Complete validation and export before leaving, especially when adapting a built-in case.

## Rehearse before release

Open the case as a learner and test at least these paths:

- a correct observation with weak reasoning;
- a plausible but incorrect answer;
- a request for a hint;
- a learner who jumps straight to the diagnosis;
- a learner who needs the stopping condition; and
- each intended learner level.

Check that the tutor asks for evidence, uses hints in a sensible order, does not reveal answer notes too early, and stops appropriately. Model behavior can vary, so one successful rehearsal is not a guarantee.

## Final release checklist

- [ ] Objectives describe learner behavior, not just topics.
- [ ] Every objective has a criterion and observable evidence.
- [ ] The opening question directs attention without giving away the answer.
- [ ] Hints become gradually more explicit.
- [ ] Escalation and stopping rules are concrete.
- [ ] Answer-revealing content is in educator notes, not neutral fields.
- [ ] Artifact and clinical sources have the correct roles.
- [ ] The clinical-review state is truthful.
- [ ] The version changed when the content changed.
- [ ] The lesson was rehearsed at every intended level.
- [ ] A portable or JSON export is stored with your release notes.

---

Next: [Import PDF or PowerPoint text →](import-pdf-powerpoint.md)
