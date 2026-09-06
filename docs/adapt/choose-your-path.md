# Choose your CaseAttend adaptation path

[← Documentation home](../README.md)

Start with what your learners and organization need to change—not with the most technical option. CaseAttend has three practical adaptation paths:

- change the **teaching material** with the no-code tools;
- publish a **branded or curated copy** of the current site; or
- build CaseAttend's **teaching engine into another product** with the SDK.

The paths form a ladder, not a maturity ranking. The simplest path that meets the need is usually the easiest to review, rehearse, maintain, and explain to learners.

> [!IMPORTANT]
> CaseAttend grew from **VibeRad**, one of 50 winners selected from 4,096 entries in Google DeepMind's “Vibe Code with Gemini 3 Pro” Kaggle hackathon. The award belongs to the VibeRad competition prototype—not to today's CaseAttend project—and it was not a clinical validation or product certification. The useful lesson is that a strong prototype can begin quickly, while dependable educational use still requires deliberate content, privacy, accessibility, security, and evaluation work. Read [the full VibeRad-to-CaseAttend story](../story/google-deepmind-win.md).

> [!CAUTION]
> Every path remains educational, not diagnostic. Choosing a path does not establish image rights, de-identification, clinical accuracy, accessibility, institutional approval, or research approval.

## Decide at a glance

The time descriptions below are planning scales, not delivery promises. Approval, procurement, clinical review, accessibility testing, and institutional processes can take longer than the hands-on work.

| Path | Choose it when | Time and skills to expect | Governance you take on | First next action |
| --- | --- | --- | --- | --- |
| **No-code authoring** | The current site fits; only cases or lessons change. | Shortest path. An educator can create a draft in a focused session; review and rehearsal remain separate. | Content, rights, privacy, accessibility, clinical review, disclosure, and backups. | [Create a case](../guides/create-a-case.md), then [build its lesson](../guides/build-a-lesson.md). |
| **Self-host on Cloudflare Pages** | You need your own domain, branding, release history, or curated public copy without changing the architecture. | Small deployment project. It needs a Git/web maintainer plus a preview, review, release, and rollback cycle. | Everything above, plus dependencies, headers, domains, monitoring, support, and rollback. | Name the operational owner, then use the [Cloudflare Pages guide](self-host-cloudflare.md). |
| **Build with the SDK** | You need a different viewer, domain, provider, storage design, interface, research integration, or embedded tutor. | Software product project. Plan iterative engineering and cross-functional review cycles. | The complete data flow, credentials, retention, incidents, accessibility, content lifecycle, and learner support. | Complete the brief in the [SDK decision guide](sdk.md), then run the local examples. |

## A three-question shortcut

1. **Does the current site already do what learners need?** If yes, and only the teaching content changes, choose **no-code**.
2. **Does the current application behavior fit, but your organization needs to publish and operate its own copy?** Choose **self-hosting**.
3. **Must the application itself behave differently or connect to different systems?** Choose the **SDK**.

If the answer is uncertain, begin with no-code authoring using synthetic or explicitly approved material. A rehearsed lesson often reveals whether a new deployment or product integration is actually necessary.

## Path 1: Change the teaching without code

Choose this path when CaseAttend's existing case viewer, learner levels, and browser-local workflow already fit the learning activity.

Case Studio can prepare approved JPEG, PNG, or WebP images and record the case description, provenance, usage terms, accessibility text, and privacy or de-identification status. Lesson Builder can shape the audience, objectives, evidence, opening, hints, escalation rules, stopping conditions, teaching notes, sources, and clinical-review state.

This path is a good fit for:

- an educator piloting one visual case;
- a teaching team adapting a lesson for a different audience;
- a colleague reviewing a portable `.caseattend` case; or
- a program testing the learning design before requesting technical work.

It does not change CaseAttend's public branding, supported visual formats, hosting, provider architecture, or browser-local storage model. It is not a raw-DICOM workflow or a shared institutional content library.

**First next action:** If CaseAttend is new to the team, [complete one sample case](../getting-started/first-case.md). Then use the [no-code adaptation recipes](no-code.md) and keep a tested [portable backup](../guides/share-back-up-and-restore.md).

## Path 2: Operate your own copy

Choose self-hosting when the current application is fundamentally right, but your organization needs control over the public address, branding, published catalog, release history, or deployment timing.

The standard repository builds a static site. Cloudflare Pages can publish that site from a Git repository, with preview deployments for review and a production branch for approved releases. A named maintainer should own updates and rollback after launch.

Self-hosting does **not** make live AI local and does not create a private model backend. In the standard architecture, a learner's browser still sends an intentional live request directly to OpenRouter, which routes it to the selected model provider. An educator's intro-cache generation request follows the same provider boundary.

This path is a good fit for:

- a school or program publishing a curated catalog under its own domain;
- a team that needs reviewed branding or educational-use language;
- an organization that can maintain Git-based releases and browser security headers; or
- a project that wants deployment control without creating a new application backend.

**First next action:** Assign content, privacy, clinical, accessibility, security, and deployment owners. Then use [Self-host CaseAttend on Cloudflare Pages](self-host-cloudflare.md) to build locally before connecting the repository to a host.

## Path 3: Build a different product with the SDK

Choose the SDK when the change is larger than content or hosting. The SDK provides the reusable teaching structure while your application supplies the artifact loader, domain language, model adapter, event store, and learner interface.

This path is appropriate when you need to:

- embed the tutor in an existing learning platform;
- support an artifact or viewer the current site does not provide;
- use an institution-approved provider or local model;
- introduce a managed storage or identity design; or
- build a separately governed research or product workflow.

The SDK does not make those choices safe automatically. Adapters are trusted application code. The adopting team must document exactly which systems can receive learner text, lesson content, artifact bytes, model output, and credentials—and what is stored, for how long, and under whose authority.

**First next action:** Bring the educator, engineering, privacy, security, accessibility, and operational owners together to complete the one-page brief in [Adapt CaseAttend with the SDK](sdk.md). Then inspect the [technical SDK guide](../sdk/README.md) and run its local examples before adding live inference.

## Understand the data boundary before choosing

The three paths do not share an identical privacy model.

### In the current no-code site

- Case creation, lesson editing, validation, image preparation, PDF or PowerPoint text extraction, and export run in the browser.
- The raw PDF or PowerPoint source file is not uploaded for extraction or included in an export. Text applied to Lesson Builder becomes Lesson Plan content and may later enter a model request.
- Opening the web application creates ordinary requests to its static host, including a same-origin check for a published intro cache. Opening or inspecting a case does not by itself send its images, lesson content, or chat to a model.
- When a learner presses **Send**, the current view, learner message, relevant conversation, case context, and active Lesson Plan prompt—including educator teaching notes—go to OpenRouter and the selected model provider.
- When an educator selects **Generate draft answers**, case context, objectives, teaching notes, and up to four representative case images go to OpenRouter and the selected provider. The draft and any later approval remain browser-local and are not included in a `.caseattend` export.

### In a standard self-hosted copy

The host changes, but the browser-direct model boundary above does not. Adding analytics, a shared credential, a proxy, another provider, remote storage, or new scripts changes that boundary and requires a fresh review.

### In an SDK product

The adopting application's adapters define the boundary. Keep credentials inside the private model-adapter boundary, minimize stored data, and make every external destination understandable to learners and reviewers. Do not assume that “self-hosted” means “no third party receives data.”

Read [SECURITY.md](../../SECURITY.md) before using institutional material or changing any credential or network path.

## Responsibilities shared by every path

Whichever route you choose, name the people responsible for:

- the learning objective and evidence of progress;
- source accuracy, image rights, and attribution;
- privacy, de-identification, consent, and institutional requirements;
- clinical or subject-matter review for the exact released version;
- accessible descriptions, warnings, keyboard use, screen-reader behavior, zoom, and reflow;
- disclosure of model use and every organization that receives submitted content;
- rehearsal of wrong answers, refusals, timeouts, and stopping behavior; and
- versioning, correction, withdrawal, backup, and support.

CaseAttend records some of these decisions. It does not make or approve them for the organization.

## The practical recommendation

Start with the smallest reversible experiment:

1. write one observable learning objective;
2. use synthetic or explicitly approved material;
3. build and rehearse one lesson;
4. document what learners and providers can see; and
5. move to hosting or SDK work only when the pilot identifies a real need.

That progression carries forward the best part of the VibeRad origin: begin with a concrete learner experience, then make the structure, evidence, and responsibilities more explicit as the work grows.

---

Next: [Adapt CaseAttend without code →](no-code.md)
