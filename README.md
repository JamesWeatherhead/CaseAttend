# CaseAttend

Socratic AI tutor for radiology and pathology. Work through real medical images — chest X-rays, brain MRI, H&E histology — with an AI that teaches by asking, not telling.

**Live:** [caseattend.com](https://caseattend.com) · Google DeepMind Hackathon winner

> **Educational use only.** CaseAttend is a teaching tool — not a diagnostic or clinical decision-making system.

## No keys, ever

CaseAttend stores **no API keys** — not in this repo, not on a server. You connect your own [OpenRouter](https://openrouter.ai) key; it lives only in your browser and calls OpenRouter directly, so inference never touches our infrastructure. Nothing to leak, and no bill to foot but your own.

The only backend is one stateless function (`functions/api/prompt.ts`) that returns the teaching prompt — it never sees a key.

## Develop

```bash
npm install
npm run dev      # Vite dev server
npm run build    # production build -> dist/
```

Node 18+. No environment variables required.

## Stack

React 19 · TypeScript · Vite 6 · Tailwind 4, deployed on Cloudflare Pages (static SPA + one Pages Function).

## Contributing

PRs welcome — read [CONTRIBUTING.md](CONTRIBUTING.md) first. Clinical content needs clinician review, images must be de-identified and openly licensed, and commits are signed off (DCO). The key-never-leaves-the-browser rule is non-negotiable — see [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE) © 2026 James Weatherhead
