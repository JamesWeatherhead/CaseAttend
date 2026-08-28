# CaseAttend SDK

The CaseAttend SDK is the builder layer of the CaseAttend visual teaching
platform. It separates teaching orchestration from the CaseAttend application
so another product can provide its own cases, artifacts, domains, model
connection, session storage, and approved research workflow.

The first SDK release contains two packages:

- `@caseattend/core` is a headless TypeScript engine. It has no React, DOM,
  browser storage, or model-provider dependency.
- `@caseattend/react` provides an accessible tutor composer that receives a
  configured core engine. It does not read credentials or choose a provider.

## Try it from a fresh clone

For a fresh repository clone, use Node `^22.22.2`, `^24.15.0`, or `>=26.0.0`.
The examples use deterministic local model adapters, so
they need no account, API key, external model request, or patient data.

```bash
npm ci
npm run example:basic
```

Open the local URL printed by Vite. The basic example shows where to replace
the case registry, artifact loader, domain plugin, model adapter, and session
store.

The research example uses a synthetic case and an in-memory, closed-vocabulary
research sink:

```bash
npm run example:research
```

It is a safe integration example, not a production research collector and not
an institutional approval workflow.

## Core boundary

Create an engine by supplying every capability explicitly:

```ts
import { createCaseAttendEngine } from '@caseattend/core';

const engine = createCaseAttendEngine({
  caseRegistry,
  artifactLoader,
  domains,
  promptComposer,
  inference,
  destination: { kind: 'teaching', sessionStore },
  platform,
});
```

The public adapter contracts are:

- `CaseRegistry`: list and resolve validated teaching material.
- `ArtifactLoader`: resolve artifact references to bytes and declared media
  metadata. It does not return a DOM image, `Blob`, or provider URL.
- `DomainPlugin`: supply domain language and viewer capability hints without
  editing the engine or tutor composer.
- `PromptComposer`: create the exact provider prompt from validated case,
  lesson, and runtime context.
- `InferenceAdapter`: perform model inference. Provider credentials stay in
  the adapter's private closure and are never an engine input or output.
- `SessionStore`: receive strict, metadata-only teaching events.
- `ResearchSink`: receive strict, metadata-only research events in an
  explicitly research-configured engine.
- `CorePlatform`: inject a clock, SHA-256 implementation, and
  collision-resistant safe ID generator without relying on browser or Node
  globals. Browser examples use `crypto.randomUUID()` for turn IDs.

An engine accepts either a teaching `SessionStore` or a research
`ResearchSink`, never both. `CoreEventV1` has no fields for learner text, model
text, prompts, image bytes, screenshots, credentials, or authorization
headers.

## Explicit submit boundary

The React composer calls `captureCurrentView` only from the form submit path.
The captured bytes and learner message are transient inputs to `runTurn`. They
are not added to engine events or passed to storage and research adapters.

This preserves CaseAttend's privacy distinction: a provider adapter may send
the submitted message and current view to its declared provider, but a key must
remain inside that adapter. Browser-only key handling protects the credential;
it does not make an inference payload local.

Adapters and React host callbacks are trusted application code, not sandboxed
plugins. `InferenceAdapter`, `ArtifactLoader`, `captureCurrentView`, and
`onTurnComplete` intentionally handle raw data at their documented boundaries;
adding one changes who can receive that data. Review the
[trusted extension boundary](privacy-and-accessibility.md#trusted-extension-boundary)
before installing third-party integrations.

## Build and verify

```bash
npm run typecheck
npm test
npm run build:sdk
npm run build:examples
npm run pack:sdk
```

The package contract tests import the built core package in a Node process
without browser globals, verify the allowlisted public exports, and confirm
that a credential marker cannot reach cases, events, exports, or a research
sink.

## Package status

The repository is the source of truth. Check the package metadata and release
notes before relying on a registry version. Scoped npm packages must be
published with public visibility, and a release should use npm trusted
publishing and provenance instead of a long-lived registry token.

See [privacy and accessibility](privacy-and-accessibility.md) for integration
defaults and [licensing](licensing.md) before distributing or hosting a product
built from the SDK.
