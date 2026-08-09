# Security Policy

## The invariant: your key never touches our servers

CaseAttend is bring-your-own-key. Your OpenRouter API key is stored only in your
browser's `localStorage` and is sent **only** to `https://openrouter.ai` for
inference. It is never transmitted to, logged by, or stored on any CaseAttend
server. Versioned teaching prompts are assembled locally in the browser.
CaseAttend has no prompt or inference backend.

Changes that would weaken this are out of scope and will not be merged:

- routing the key anywhere other than `https://openrouter.ai`;
- loosening the Content-Security-Policy `connect-src` beyond
  `'self' https://openrouter.ai` (see `public/_headers`);
- adding a backend, proxy, or dependency that receives or can exfiltrate the key.

CI enforces this on every pull request.

## Browser-local learning records

CaseAttend's default session event log is metadata-only and browser-local.
Events are stored in IndexedDB, or in memory when IndexedDB is unavailable.
Recording, previewing, exporting, and deleting these events must not make a
network request.

The versioned event schema deliberately has no fields for API keys,
authorization headers, raw prompts or chat, screenshots, base64 images,
annotation coordinates, names, or emails. Export validates every event again
and fails closed if a record does not match the allowlisted schema. Any future
multi-participant collector requires a separate, explicit, consented research
deployment and must never receive an OpenRouter credential.

## Reporting a vulnerability

Please report security issues **privately** via GitHub Security Advisories — use
the "Report a vulnerability" button on the repository's **Security** tab — rather
than opening a public issue. We aim to acknowledge within 7 days.
