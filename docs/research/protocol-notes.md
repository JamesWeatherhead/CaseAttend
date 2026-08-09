# Protocol planning notes

Use these prompts alongside the institution's required protocol, privacy, security, accessibility, and statistical review.

## Scientific design

- State the primary question, estimand, hypotheses, learning objectives, and outcomes before enrollment.
- Define eligibility, recruitment, sample size rationale, stopping rules, exclusions, missing-data handling, and analysis code outside CaseAttend.
- Distinguish educational performance, usability, and model-output outcomes.
- Specify whether assignment is fixed or uses the frozen SHA-256 weighted algorithm, including arm weights and stratification performed outside CaseAttend.
- Pilot task wording, timing, keyboard access, screen-reader flow, and small-screen layout.
- Participant information is English-only in v1. Use a separately reviewed workflow rather than presenting an unvalidated translation as frozen CaseAttend participant information.

## Reproducibility

- Record the exact Case Package and Lesson Plan digests for every step in every arm.
- Record the gateway, exact upstream provider ID and reviewed HTTPS policy URL, model identifier, temperature, top P, output-token limit, history window, prompt mode, capture policy, viewer policy, and enabled tools.
- Save the Research Manifest digest with each session.
- Treat a provider alias as mutable unless the provider guarantees a pinned model version.
- Record provider errors, retries, fallback behavior, and model unavailability without silently changing the arm.

## Privacy and security

- Use externally assigned high-entropy 20-character Crockford Base32 codes, protect the linkage key separately, and define external eligibility, issuance, reuse, and withdrawal procedures. CaseAttend must clear the raw code after deriving the stored manifest-scoped pseudonymous reference.
- Minimize timestamps, free text, captured images, annotations, and execution metadata.
- Keep raw chat off for browser-local Participant Mode; launch is blocked when a manifest enables it. Use an enabled raw-chat policy only to document a separately reviewed institution-managed implementation.
- Review the actual provider request and response in the deployed build.
- Verify that the OpenRouter key stays in browser-local storage, is sent only to OpenRouter, and is absent from research records and exports.
- State plainly that this bring-your-own-key boundary protects the credential, not the prompt, learner message, current-view image, or model response processed by OpenRouter and the upstream provider.
- Document browser-device ownership, shared-device risks, export encryption, transfer, access, backup, retention, and deletion.
- Explain that local deletion cannot remove earlier exports or provider-held copies.
- Distinguish the support packet, which contains the frozen study materials but no participant runs, from the restricted JSONL/CSV participant-data export. Neither file is automatically uploaded or encrypted.

## Oversight

- Export the draft support packet before seeking the responsible determination.
- Record the institution's determination, reference, date, and responsible role outside CaseAttend.
- Do not describe the Research Manifest digest, support packet, automated screening, or Participant Mode gate as IRB approval or proof of de-identification.
- Re-review material changes, including cases, lessons, model, provider, temperature, tasks, data fields, raw-chat policy, participant information, or retention.
- Do not describe synthetic status or a de-identification attestation as proof of HIPAA de-identification, FERPA compliance, consent, authorization, or permission to use the material.

## Participant operations

- Give participants the exact approved information before starting.
- Provide an obvious, keyboard-accessible Exit control that does not require completing a task.
- Define what Exit does to unsaved and already-recorded data.
- Do not expose the case catalog, authoring tools, model selector, learner-level selector, or unrelated data controls in Participant Mode.
- Do not reveal randomized arm labels, cases, models, or parameters before assignment unless an externally reviewed protocol explicitly defines an open-label design.
- Treat Participant Mode blinding as a user-interface control, not a security boundary: the frozen browser bundle contains all arms and a technically capable participant may inspect client-side data. Use a server-assigned design if stronger concealment is required.
- Test persistent storage and export recovery before enrollment. Do not launch participant sessions in memory-only fallback.
- Confirm every case is marked synthetic or carries a de-identification attestation before launch, and separately verify that the material is appropriate under the institution's actual workflow.
