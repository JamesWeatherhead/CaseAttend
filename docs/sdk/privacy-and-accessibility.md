# SDK privacy and accessibility defaults

The SDK makes provider, storage, and research behavior explicit through
adapters. That flexibility does not remove the builder's responsibility to
preserve safe defaults.

## Credential boundary

- Keep credentials inside the provider adapter. Do not add a credential,
  token, key, or authorization field to an engine request, case, event, export,
  or sink record.
- Do not serialize an engine or adapter configuration.
- In a browser-direct integration, send the key only to the declared model
  gateway. Do not proxy it through the product's server.
- Explain every destination that receives learner text or artifact bytes. A
  browser-held key protects the credential, not the inference payload.

The included examples use deterministic local inference and make no external
model request. Add a real provider only after implementing a provider-specific
adapter and a clear data-flow disclosure.

## Trusted extension boundary

Core adapter types are contracts, not sandboxes. An installed third-party
adapter or host callback runs with the JavaScript privileges your application
gives it. In particular:

- `InferenceAdapter` intentionally receives the composed prompt, learner
  message, case material, and loaded artifact bytes needed for inference.
- `ArtifactLoader` controls how an artifact reference becomes raw bytes.
- React's `captureCurrentView` host callback can read the current viewer and
  registers the captured pixels before returning an artifact reference.
- React's `onTurnComplete` callback receives the learner message, tutor text,
  result metadata, and submitted artifact label for that completed turn.

The engine cannot inspect or prevent those integrations from copying,
persisting, or transmitting data. Installing or replacing one changes the set
of code—and potentially organizations—that can receive raw content. Review its
source, permissions, destinations, retention behavior, and disclosures before
use. Do not load untrusted adapters in a learner or research deployment.

## Data minimization

- Capture a view only after the learner explicitly submits a message.
- Treat learner text, model text, prompt text, and artifact bytes as transient.
- Persist only validated, closed-vocabulary `CoreEventV1` records.
- Generate opaque, collision-resistant event IDs; never derive them from a
  name, email address, participant code, or other user-entered identifier.
- Default ordinary teaching to a memory session store unless the learner has a
  clear local-data preview and delete path.
- Do not enable a research sink in an ordinary teaching engine.
- Use synthetic fixtures in demos and tests.

The research example is deliberately memory-only. A real collector needs a
separate institutional review of consent, identity handling, transport,
authentication, authorization, retention, deletion, incident response, and
provider data practices.

## Accessible composition

The React starter follows these defaults:

- native headings, labels, textarea, and form submission;
- complete keyboard operation with a logical focus order;
- a visible focus indicator and controls at least 24 by 24 CSS pixels;
- instructions associated with the message field;
- busy, result, and error changes announced as status messages;
- no automatic focus movement after a successful request;
- no disabled browser zoom, timed interaction, or automatic motion;
- a neutral text description alongside the visual artifact.

These defaults are a starting point, not a claim that a downstream product is
conformant. Test the complete integration against
[WCAG 2.2](https://www.w3.org/TR/WCAG22/), including contrast, reflow, zoom,
focus visibility, target size, error recovery, and screen-reader output.

Useful implementation references include WAI guidance for
[form labels](https://www.w3.org/WAI/tutorials/forms/labels/),
[status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html),
and [minimum target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
