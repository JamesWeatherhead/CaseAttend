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

## Browser-local case authoring

Case Studio accepts JPEG, PNG, and WebP only. It verifies the file signature,
declared type, dimensions, byte and pixel limits, decodes the image, and
re-encodes it through canvas before the prepared copy can be saved. Original
bytes and source filenames are not written to the case store or portable
archive. Raw DICOM, remote image URLs, SVG, and other active or metadata-rich
formats are rejected by the public authoring workflow.

Text recognition runs from self-hosted worker, language, and WebAssembly assets.
Recognized text is discarded after local pattern checks; portable packages do
not contain scan text or scan results. Browser face detection is advisory and
may be unavailable. A successful automated pass is never represented as proof
of de-identification, consent, HIPAA compliance, IRB status, or permission to
publish. Saving requires a separate human review and explicit synthetic or
de-identification state.

The `.caseattend` importer rejects undeclared files, duplicate or traversing
paths, decompression limit violations, MIME or dimension mismatches, invalid
digests, and tampered Case Package or Lesson Plan manifests. Import is
validated before storage so a failed archive cannot replace existing work.
Case Studio, its store, local screening, preview, and archive code must not
import the OpenRouter key or inference clients.

## Reporting a vulnerability

Please report security issues **privately** via GitHub Security Advisories — use
the "Report a vulnerability" button on the repository's **Security** tab — rather
than opening a public issue. We aim to acknowledge within 7 days.
