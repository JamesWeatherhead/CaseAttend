# Self-host CaseAttend on Cloudflare Pages

[← Documentation home](../README.md)

This path gives a team its own web address and deployment history while keeping CaseAttend's existing browser-direct architecture. It is a reasonable fit for a program that can maintain a Git repository and complete its own content, security, privacy, accessibility, and clinical reviews.

You do not need to run an application server for the standard CaseAttend site. The repository builds a static Vite application into a folder named `dist/`.

> [!IMPORTANT]
> Self-hosting changes who serves the website. It does not make live AI local. When a learner presses **Send**, OpenRouter and the selected model provider still receive the submitted inference content.

## Decide what you are adapting

| Goal | Best starting point |
| --- | --- |
| Use your own cases and lessons, but keep the current site | Use the browser authoring tools and portable exports; you may not need to host anything. |
| Publish a branded or curated copy of the current app | Fork the repository and use this guide. |
| Embed the teaching engine in another product | Use the [SDK adaptation guide](sdk.md). |
| Collect multi-participant research data | Treat that as a separate system requiring institutional design and review; the standard static deployment is not a research-data backend. |

## Before you publish

Assign an owner for each of these questions:

- **Content:** Which cases and lessons will ship, and who can update them?
- **Rights:** May you redistribute every image and other asset under its recorded terms?
- **Privacy:** What material may educators and learners submit to the site and to a live model?
- **Clinical review:** Who reviews each version, and how will outdated content be withdrawn?
- **Accessibility:** Who will test the complete adapted experience with the people and devices you expect to support?
- **Operations:** Who monitors deployments, dependencies, security reports, domains, and rollback?

The MIT License covers CaseAttend's code. Bundled images and other third-party works retain their own terms. Review the repository [license](../../LICENSE), [third-party notices](../../THIRD_PARTY_NOTICES.md), and each Case Package before redistributing a copy.

Do not put an OpenRouter key in the repository or Cloudflare build settings. The standard app uses each person's browser-held key; a build-time secret would create a different and unsafe credential model. Values embedded in a client-side Vite build are not server secrets.

## Verify the build locally

Ask the person responsible for deployment to install Git and a repository-supported Node release (`^22.22.2`, `^24.15.0`, or `>=26.0.0`), then run:

```bash
git clone https://github.com/JamesWeatherhead/CaseAttend.git
cd CaseAttend
npm ci
npm run typecheck
npm test
npm run build
```

A successful production build creates `dist/`. Preview that exact build with:

```bash
npm run preview
```

Open the local address printed by Vite and complete the checks in [Before each release](#before-each-release).

## Connect the repository to Cloudflare Pages

The repository does not include a Cloudflare deployment script or project configuration. The steps below use Cloudflare's generic Git integration; dashboard wording can change.

1. Fork or mirror the repository into the GitHub or GitLab account your team controls.
2. In Cloudflare, create a Pages project and connect that repository.
3. Choose the branch your team has approved for production, usually `main`.
4. Enter these build settings:

   | Setting | Value |
   | --- | --- |
   | Framework | React (Vite), if a preset is offered |
   | Root directory | Repository root |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Node version | Pin `22.22.2` through `NODE_VERSION` (or another release allowed by the repository `engines` field) |

5. Do not add an OpenRouter API key or other shared model credential.
6. Save and deploy. Review the build log and open the generated `pages.dev` preview.

Cloudflare documents the current [Git integration flow](https://developers.cloudflare.com/pages/get-started/git-integration/) and the [React/Vite build settings](https://developers.cloudflare.com/pages/configuration/build-configuration/). A Git-connected project normally creates a new deployment when the production branch changes; other branches can produce preview deployments.

> [!NOTE]
> Cloudflare's platform recommendations evolve. This guide describes Pages because it matches the repository's static output. Check Cloudflare's current guidance before creating a new long-lived project.

## Keep the security headers

The repository's [`public/_headers`](../../public/_headers) file is copied into the production output. It defines browser security headers and the narrow connection policy that lets the app call OpenRouter directly.

After deployment, confirm that the host actually serves those headers. In particular, do not casually widen `Content-Security-Policy` to allow arbitrary connection destinations. Adding analytics, fonts, scripts, storage, a model proxy, or a new provider changes the data flow and requires review—not just a configuration tweak.

Read [SECURITY.md](../../SECURITY.md) before changing the credential or network boundary.

## Add a custom domain

Once the `pages.dev` deployment passes review:

1. Add the intended domain in the Pages project's custom-domain settings.
2. Follow Cloudflare's DNS instructions for the zone that owns the domain.
3. Wait for the certificate and domain status to become active.
4. Test both the public hostname and the `pages.dev` project address.
5. Record the production commit and the person who approved the release.

Use your organization's normal change-control and domain-ownership practices. A custom domain can make a site look institutionally approved, so pair it with clear ownership, educational-use language, and a support contact.

## Before each release

- [ ] The approved commit passed `npm run typecheck`, `npm test`, and `npm run build`.
- [ ] Every distributed case has confirmed provenance, usage terms, attribution, and human privacy review.
- [ ] Every learner-ready lesson has appropriate clinical sources and a truthful review state.
- [ ] Intro caches are approved and match the current lesson versions.
- [ ] No API key, patient identifier, learner identifier, chat, or source document was committed.
- [ ] Keyboard, zoom, contrast, reflow, screen-reader, loading, and error paths were tested on the deployed site.
- [ ] The deployed headers preserve the documented network boundary.
- [ ] A named owner can roll back to the previous known-good deployment.
- [ ] Learners are told that live submissions go to OpenRouter and the selected model provider.

## Update without losing control

Keep institutional content and branding changes in small, reviewable commits. When the upstream CaseAttend project changes:

1. Review the upstream changes and release notes before merging.
2. Re-run the full checks locally or in continuous integration.
3. Use a preview deployment for educator, privacy, security, and accessibility review.
4. Promote only the exact reviewed commit.
5. Keep the previous successful deployment available for rollback.

Self-hosting gives your team operational control. It also gives your team operational responsibility.
