# From VibeRad to CaseAttend

[← Documentation home](../README.md)

CaseAttend began with a deceptively simple question: could an AI model help a learner understand the medical image in front of them, one question at a time?

The first answer was **VibeRad**, a competition prototype built for Google DeepMind's “Vibe Code with Gemini 3 Pro” Kaggle hackathon. It became one of 50 winners from 4,096 entries. That result recognized the competition submission; it was not a clinical validation, a product certification, or an endorsement of today's CaseAttend project by Google or Google DeepMind.

## The spark

According to the [UTMB account of the project](https://www.utmb.edu/news/article/utmb-news/2026/06/26/utmb-ai-innovators-win-international-hackathon-with-radiology-viewer-and-teaching-tool), James Weatherhead heard about the hackathon at an AI conference and asked Peter McCaffrey what they might build with Gemini 3. The starting challenge was ambitious: could it make a radiology DICOM viewer?

The rough viewer quickly suggested a more interesting possibility. Instead of merely displaying an image, could it help someone learn from that image? The team expanded VibeRad into an AI teaching assistant that let learners inspect medical images, ask questions, and change the teaching level from high school through residency.

The original VibeRad team was James Weatherhead, Jake Weatherhead, Peter McCaffrey, and George Golovko. Their [Kaggle competition writeup](https://www.kaggle.com/competitions/gemini-3/writeups/new-writeup-1765065566929) preserves the submission's own account.

> [!IMPORTANT]
> The hackathon award belongs to **VibeRad, the competition project**. **CaseAttend is the open-source project that grew from that work.** The names should not be used interchangeably when describing the award or implying endorsement.

## What the win showed—and what it did not

| The prototype demonstrated | The award did not establish |
| --- | --- |
| A clinician or educator can turn an idea into an interactive prototype unusually quickly. | That the tutor is accurate enough for unsupervised use. |
| A model can discuss the same visual artifact a learner is inspecting. | That a model response is medical advice or a diagnostic result. |
| The teaching level and conversational approach can be shaped around the learner. | That the software, content, or data flow meets an institution's privacy, security, accessibility, legal, or research requirements. |
| Medical-image learning can be more interactive than a static slide or PDF. | That one prototype has proven an educational outcome. |

That distinction matters. A competition can reward a promising idea and an effective prototype. Turning that idea into dependable educational infrastructure requires slower work: explicit learning objectives, source records, versioning, review states, privacy boundaries, testing, and evaluation.

## The work after the prototype

CaseAttend carries the original idea forward while making the teaching structure visible and portable:

- A **Case Package** records the visual artifact, learner-facing context, provenance, usage terms, and review state.
- A **Lesson Plan** records what learners should accomplish, what evidence counts, how hints may escalate, and when the tutor should stop.
- A **reviewed intro cache** can provide a small, pre-generated opening experience without requiring a learner to connect a model.
- **Live AI** is a separate, explicit path for new questions. The browser sends the submitted view and conversation to OpenRouter and the selected model provider only when the learner presses **Send**.
- **Research Mode** can freeze the exact cases, lessons, routing, and collection rules for a study, while leaving institutional determination and participant governance outside the app.
- An **SDK** lets an engineering team reuse the teaching engine without adopting the whole CaseAttend interface.

The result is still an educational tool, not a clinical system. Its purpose is to make an experiment easier to inspect, adapt, rehearse, and study—not to make uncertainty disappear.

## A practical lesson for other teams

The most reusable part of the story is not “add AI to a viewer.” It is a way of moving from a frontline idea to a testable teaching experience:

1. **Begin with a real learner action.** What should someone notice, compare, explain, or decide?
2. **Put the destination in writing.** Define the objective and the evidence you would accept before tuning the conversation.
3. **Give the tutor boundaries.** Write the opening, allowed hints, escalation rules, and stopping conditions.
4. **Separate prepared teaching from live generation.** Use reviewed, pre-generated material where it is sufficient; make live model use visible and intentional.
5. **Make provenance and review states obvious.** “Publicly available,” “licensed,” “clinically supported,” and “reviewed” are different claims.
6. **Rehearse the failure paths.** Test plausible mistakes, premature diagnoses, requests for direct answers, accessibility needs, and model failures.
7. **Evaluate before scaling.** A compelling demonstration is a reason to run a careful pilot, not a substitute for one.

Start with [Choose your CaseAttend adaptation path](../adapt/choose-your-path.md). From there, you can follow the pattern without writing code in [Adapt CaseAttend without code](../adapt/no-code.md), publish a reviewed copy with the [Cloudflare Pages guide](../adapt/self-host-cloudflare.md), or begin a product integration with the [SDK adaptation guide](../adapt/sdk.md).

## Source note

The result, entry count, origin story, and team description above are based on the [UTMB news article](https://www.utmb.edu/news/article/utmb-news/2026/06/26/utmb-ai-innovators-win-international-hackathon-with-radiology-viewer-and-teaching-tool) and the original [VibeRad Kaggle writeup](https://www.kaggle.com/competitions/gemini-3/writeups/new-writeup-1765065566929). CaseAttend's current behavior and safeguards are documented in this repository and should be evaluated on their own merits.
