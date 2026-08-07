# CaseAttend

Socratic AI tutor for radiology and pathology. Work through real medical images — chest X-rays, brain MRI, H&E histology — with an AI that teaches by asking, not telling.

**Live:** [caseattend.com](https://caseattend.com) · Google DeepMind Hackathon winner

> **Educational use only.** CaseAttend is a teaching tool — not a diagnostic or clinical decision-making system.

## No keys, ever

CaseAttend stores **no API keys** — not in this repo, not on a server. You connect your own [OpenRouter](https://openrouter.ai) key; it lives only in your browser and calls OpenRouter directly, so inference never touches our infrastructure. Nothing to leak, and no bill to foot but your own.

The only backend is one stateless function (`functions/api/prompt.ts`) that returns the teaching prompt — it never sees a key.

## See it in action

CaseAttend runs on **[OpenRouter](https://openrouter.ai)**. Sign in with OpenRouter's single sign-on (GitHub, Google, or email) and one account unlocks **every model on OpenRouter** — from free Gemma vision models to frontier Claude, Gemini, and GPT. Two vision models, **Gemma 4 (Free)** and **Gemma 4 31B (Free)**, cost nothing and need no credit, so anyone can use CaseAttend and help improve it **for free** — no payment method, no shared developer key, no server-side secrets.

<p align="center">
  <img src="docs/screenshots/01-connect.png" width="420" alt="CaseAttend header with a Connect button">
</p>
<p align="center"><em>1. Open CaseAttend and click <strong>Connect</strong> — no account or credit card just to arrive here.</em></p>

<p align="center">
  <img src="docs/screenshots/02-byok-modal.png" width="360" alt="Bring your own AI modal: Continue with OpenRouter and a model list">
</p>
<p align="center"><em>2. <strong>Continue with OpenRouter.</strong> Your key is minted by OpenRouter and lives only in your browser — requests go straight to OpenRouter, never through our servers, so we can't see or bill it. Pick a model; the <strong>Free</strong> ones cost nothing.</em></p>

<p align="center">
  <img src="docs/screenshots/03-openrouter-signin.png" width="360" alt="OpenRouter sign-in with GitHub, Google, or email">
</p>
<p align="center"><em>3. Sign in with OpenRouter <strong>SSO</strong> — GitHub, Google, or email. One login gives you access to <strong>every model on OpenRouter</strong>.</em></p>

<p align="center">
  <img src="docs/screenshots/04-authorize.png" width="360" alt="OpenRouter authorization request with an optional credit limit">
</p>
<p align="center"><em>4. Authorize a scoped key and, if you like, set a <strong>spend cap</strong>. You stay in control of every cent — CaseAttend can never exceed it.</em></p>

<p align="center">
  <img src="docs/screenshots/05-connected.png" width="420" alt="CaseAttend header showing Powered by Gemma 4 31B (Free)">
</p>
<p align="center"><em>5. Back in the app — now <strong>powered by Gemma 4 31B (Free)</strong>, running entirely on a free model.</em></p>

<p align="center">
  <img src="docs/screenshots/06-free-models.png" width="460" alt="Two free vision models: Gemma 4 (Free) and Gemma 4 31B (Free)">
</p>
<p align="center"><em>6. Two free vision models — <strong>Gemma 4 (Free)</strong> and <strong>Gemma 4 31B (Free)</strong> — mean the whole community can learn and contribute at <strong>zero cost</strong>. Switch to a frontier model anytime; that runs on your own OpenRouter balance.</em></p>

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

CaseAttend's source code is licensed under [AGPL-3.0](LICENSE) © 2026 James Weatherhead.

The bundled teaching images are third-party works under their own licenses (TCGA open-access; Wikimedia Commons images under CC BY-SA 4.0 or CC BY 3.0), attributed in the case files under `lib/prompts/`. They are not covered by AGPL-3.0 and remain under their original terms.

**Commercial licensing.** AGPL-3.0 requires anyone who runs a modified version, including as a network service, to offer their source under the same terms. If that does not fit your use, for example embedding CaseAttend in a closed product or hosted service, a separate commercial license is available on request: contact James Weatherhead via [github.com/JamesWeatherhead](https://github.com/JamesWeatherhead).
