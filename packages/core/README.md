# @caseattend/core

Headless TypeScript contracts and orchestration for building visual teaching
tools with CaseAttend. The package has no React, DOM, browser-storage, or model
provider dependency.

```ts
import { createCaseAttendEngine } from '@caseattend/core';

const engine = createCaseAttendEngine({
  caseRegistry,
  artifactLoader,
  domains: [domainPlugin],
  promptComposer,
  inference,
  destination: { kind: 'teaching', sessionStore },
  platform,
});

const result = await engine.runTurn({
  caseId: 'synthetic-shapes',
  learnerMessage: 'The circle overlaps the rectangle.',
  learnerLevel: 'general',
  mode: 'chat',
  hasImage: true,
  artifact: { id: 'current-view' },
  historyWindowMessages: [],
});
```

Every capability is injected. `ArtifactLoader` resolves bytes, `DomainPlugin`
keeps domain IDs open, and `InferenceAdapter` closes over its own credentials.
`CorePlatform` supplies the clock, SHA-256 operation, and collision-resistant
safe ID generator instead of making the package depend on runtime globals.
The engine accepts either a teaching `SessionStore` or a research
`ResearchSink`, never both. Its versioned events deliberately exclude raw
learner/model text, prompt text, artifact bytes, screenshots, and credentials.

Use the repository's [basic example](https://github.com/JamesWeatherhead/CaseAttend/tree/main/examples/basic)
for a complete, deterministic setup that needs no provider account. Read the
[SDK guide](https://github.com/JamesWeatherhead/CaseAttend/tree/main/docs/sdk)
before integrating storage, inference, or research collection.

Licensed under the [MIT License](LICENSE). See the SDK licensing guide for
plain language and the complete `LICENSE` file for controlling terms.
