# Research workflows

CaseAttend Research Setup helps an educator describe a reproducible visual-learning study, freeze the exact case and lesson references, prepare a support packet for institutional review, and run a locked browser-local participant activity.

A **vision-language model (VLM)** is an AI model that can interpret images and words together. A **frontier model** means a highly capable current model; many frontier models are VLMs, but neither term guarantees the other.

## What this workflow does

1. Records the study purpose, participant population, hypotheses, learning objectives, and outcomes.
2. Pins each study arm to exact Case Package and Lesson Plan digests.
3. Records assignment, model, exact upstream provider and reviewed policy URL, inference parameters, viewer, capture, and task policies.
4. Documents participant information, pseudonymous-code rules, selected data fields, access, retention, and deletion procedures. Participant information is English-only in v1.
5. Requires a human review of the provider terms and the actual data flow before a manifest can be frozen.
6. Exports a support packet that researchers can attach to their own protocol materials and, separately, restricted participant-data JSONL or CSV.

Research Setup v1 can author ordered pre-activity and post-activity tasks as instruction-only steps, single-choice questions, or bounded integer scales. It does not collect free-text outcome answers. Define scoring, missing-data handling, and analysis outside CaseAttend before enrollment.

Participant Mode launches only from a frozen manifest when durable browser storage is available, the researcher records that the institution's required determination has been completed outside CaseAttend, raw-chat collection is off, and every case is marked synthetic or carries a de-identification attestation. Those labels are researcher-supplied package metadata and do not prove that an institutional, legal, or regulatory standard has been met.

The study team must issue high-entropy 20-character participant codes outside CaseAttend and control eligibility, linkage, reuse, and withdrawal there. CaseAttend uses the entered code only long enough to derive a manifest-scoped pseudonymous reference; it stores the derived reference with the run and clears the raw code.

## What this workflow does not do

CaseAttend does not grant IRB or ethics approval, decide whether an activity is research, establish consent, establish HIPAA de-identification or HIPAA/FERPA compliance, promise anonymity, or decide that a provider is appropriate. Automated image checks and launch gates are workflow controls only. A pseudonymous participant reference can still be linkable data.

## Browser and provider boundary

Research configuration and recorded sessions are browser-local by default. A model request goes directly from the participant's browser to OpenRouter, which routes it to the one allowlisted upstream provider. The browser-held OpenRouter key is sent only to OpenRouter and is excluded from research records and exports. This protects the credential boundary, not the inference payload: OpenRouter and the upstream provider receive the system prompt, participant message, and current-view capture described by the frozen arm policy. CaseAttend's static application server receives neither the key nor the request.

Browser-local Participant Mode never records raw learner or model text. Research Setup can describe a raw-chat policy in a support packet for a separately reviewed institution-managed implementation, but enabling that policy blocks launch in this browser-only implementation.

Researchers must still review the selected provider's current terms, retention, training, location, subprocessors, and institutional agreements. See [data-flow.md](data-flow.md).

## Two different exports

- A **research support packet** contains the frozen manifest, exact prompts, portable case/lesson archives, editable planning templates, and checksums. It contains no participant runs or research records.
- A **restricted research-data export** contains only the study reference, pseudonymous runs, and closed-vocabulary event records. It excludes raw learner/model text, prompts, images and screenshots, participant-entered direct-identifier fields, authentication keys, and case/lesson bodies. Researcher-authored identifiers can still be identifying and require review before sharing.

Both downloads are created locally and are not automatically uploaded or encrypted. Apply the institution's approved encryption, access, transfer, retention, and deletion controls after download.

## Recommended sequence

1. Create and clinically review cases and lessons as appropriate for the study.
2. Build a draft Research Manifest and export a support packet.
3. Complete local scientific, privacy, security, accessibility, and institutional review.
4. Record the institution's determination without describing CaseAttend as the approving body.
5. Freeze the manifest, confirm persistent storage, and pilot Participant Mode with non-sensitive test data.
6. Export and verify data before the documented retention deadline.

The templates in this folder are starting points, not legal or regulatory advice. Useful official starting points include [OHRP's guidance on coded private information](https://www.hhs.gov/ohrp/regulations-and-policy/guidance/research-involving-coded-private-information/index.html), [45 CFR 46](https://www.hhs.gov/ohrp/regulations-and-policy/regulations/45-cfr-46/index.html), the [U.S. Department of Education privacy and data-sharing guidance](https://studentprivacy.ed.gov/privacy-and-data-sharing) and [written-agreement checklist](https://studentprivacy.ed.gov/resources/written-agreement-checklist), and OpenRouter's current [provider-routing](https://openrouter.ai/docs/guides/routing/provider-selection) and [request-parameter](https://openrouter.ai/docs/api_reference/parameters) documentation.
