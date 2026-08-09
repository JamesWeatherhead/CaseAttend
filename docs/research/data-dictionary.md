# Research data dictionary

The frozen Research Manifest is the source of truth for a participant run. Exact field names are defined by the versioned schema in `src/core/researchManifest.ts`.

## Manifest groups

| Group | Purpose | Sensitivity and notes |
| --- | --- | --- |
| Identity | Manifest ID, version, title, purpose | Do not put participant or patient identifiers in study text |
| Scientific plan | Population, hypotheses, objectives, outcomes | Protocol metadata, not an approval record |
| Materials | Case Package ID, schema version, manifest digest, Lesson Plan ID, version, digest | Digests pin exact content and detect later changes |
| Arms | Assignment weight and exact inference, upstream-provider policy URL, viewer, capture, and case sequence policy | Provider, model, and condition details stay hidden before randomized assignment in Participant Mode |
| Tasks | Ordered pre/post instructions with no response, single-choice option IDs, or bounded integer scales | v1 deliberately excludes free-text answers; map each instrument to a prespecified outcome |
| Participant information | English-language disclosures shown before launch | v1 supports `language: en` only and must match the actual frozen data flow |
| Data policy | Enabled fields, raw-chat policy, retention, deletion, access roles | Browser-local Participant Mode launches only with raw chat disabled |
| Oversight | Draft or institution-determined status | Records an external determination; CaseAttend does not issue it |
| Manifest | SHA-256 digest | Integrity reference, not a signature or proof of approval |

## Participant and session fields

Collect only fields enabled by the frozen manifest.

| Field | Default | Purpose | Main risk |
| --- | --- | --- | --- |
| Derived pseudonymous participant reference | Required | Link configured sessions without collecting a name | Stored with the run and may remain linkable through an external code key |
| Raw 20-character participant code | Never stored | Transient input used to derive the study-scoped reference | Issuance, eligibility, linkage, reuse, and withdrawal remain external study-team responsibilities |
| Manifest reference | On | Reproduce the exact study configuration | Can reveal study membership |
| Assigned arm | On | Analyze randomized or fixed allocation | Small cells can increase re-identification risk |
| Case and lesson identity | Indirect through manifest and assigned-arm references | Join the restricted rows to the separately controlled frozen study configuration | May reveal study condition; case and lesson bodies are not copied into the restricted export |
| Session start and end | Optional | Duration and completion analysis | Fine timestamps can be identifying |
| Structured learner actions | Optional | Interaction and process measures | Detailed sequences can form a behavioral fingerprint |
| Outcome responses | Optional | Primary or secondary outcome analysis | v1 stores only option IDs or bounded numeric scores; small cells or sensitive instruments can still create disclosure risk |
| Provider execution metadata | Optional | Model, latency, token, and error analysis | Provider identifiers and timestamps can be sensitive |
| Current-view capture fingerprint | On for model sends | Verify the exact submitted JPEG without retaining pixels | Stores digest, dimensions, capture pipeline, and annotation aggregates—not the image or data URL |
| Raw conversation content | Not supported in browser-local Participant Mode | May be described in a support packet for a separately reviewed implementation | Highest free-text disclosure and provider-data risk; enabling the policy blocks browser-local launch |

## Pseudonymous-code rules

- Issue 20-character Crockford Base32 codes outside CaseAttend using an institution-controlled high-entropy procedure.
- Do not derive a code from a name, email, student ID, birth date, or medical record number.
- Keep any linkage key outside CaseAttend with separate access controls.
- Control duplicate or reused codes through an external study procedure; CaseAttend records that boundary but does not keep an issuance ledger.
- Define what happens when a participant asks to withdraw but no linkage key is available.

## Export boundaries

- The support packet contains the frozen manifest, exact prompts, portable cases and lessons, planning templates, and checksums. It contains no participant runs or event records.
- The restricted JSONL/CSV export contains the study reference, derived pseudonymous run records, and the closed event vocabulary. It does not contain the frozen manifest body, prompt or case/lesson bodies, raw messages, screenshots or images, participant-entered direct-identifier fields, or authentication keys. Researcher-authored identifiers can still be identifying and must be reviewed before sharing.
- Neither export is automatically uploaded or encrypted. Treat restricted participant data under the approved storage, transfer, access, retention, and deletion plan.

## Missing and derived data

Document missing-data rules, exclusions, arm assignment failures, provider failures, retries, derived scores, and analysis-code versions in the protocol. Do not infer consent, identity, clinical correctness, or de-identification status from interaction events.
