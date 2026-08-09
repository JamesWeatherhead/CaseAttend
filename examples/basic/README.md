# Basic SDK example

From the repository root:

```bash
npm ci
npm run example:basic
```

This example uses a synthetic image and deterministic local inference. It
needs no account, key, patient data, or external request. Inspect
`src/adapters.ts` to see one small replacement for every headless core adapter.

The example passes the domain-neutral `general` learner level and its prompt
composer defines what that level means for this lesson.

The `captureCurrentView` callback runs synchronously only when the learner
submits the native form. In a real viewer, that callback should snapshot the
current pixels and register them with the injected `ArtifactLoader` before it
returns the reference.
