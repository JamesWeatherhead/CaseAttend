# Self-hosted research adapter example

From the repository root:

```bash
npm ci
npm run example:research
```

The example replaces `ResearchSink` with a memory-only implementation and
shows every record it receives. The event contract contains no learner text,
model text, prompt, image bytes, screenshot, participant-entered identifier,
or credential.

This repository does not silently turn the example into a network collector.
Before replacing the memory sink with institution-managed storage, complete
the required scientific, ethics, privacy, security, accessibility, and legal
review. Revalidate the closed event schema at the collector boundary and define
authentication, authorization, encryption, retention, deletion, and incident
response.
