# @caseattend/react

Accessible React composition for the headless CaseAttend teaching engine.

```tsx
import { TutorComposer } from '@caseattend/react';
import '@caseattend/react/styles.css';

<TutorComposer
  engine={engine}
  material={material}
  captureCurrentView={() => viewer.captureAndRegisterCurrentView()}
/>
```

`captureCurrentView` runs synchronously inside native form submission, before
the first state change or asynchronous engine call. It returns an artifact
reference that the engine's injected `ArtifactLoader` resolves to the exact
captured bytes.

The component uses native form controls, explicit labels and instructions,
visible focus indicators, status announcements, and keyboard-sized targets.
It imports no provider or browser storage implementation. Raw conversation
text remains in component memory and is cleared when the conversation is
cleared or the component unmounts.

The default learner level is the domain-neutral `general` ID. Pass another
open, validated learner-level ID when your prompt composer defines one.

See the repository [SDK guide](https://github.com/JamesWeatherhead/CaseAttend/tree/main/docs/sdk)
for a complete setup, privacy boundaries, examples, and license information.

Licensed under the [MIT License](LICENSE). The complete `LICENSE` file controls.
