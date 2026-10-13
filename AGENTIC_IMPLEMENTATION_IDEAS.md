# GodSend: agentic implementation ideas

Status: **decision document, not an approved PRD**. This is a menu of product and engineering approaches to review before implementation. The Solute Labs `.codex/agents/` configuration helps *develop* products; it is separate from any agent that runs *inside GodSend*.

## 1. What exists today

GodSend is a browser-based job outreach workspace. A person enters their profile, project stories, a contact, and a role; supplies an OpenAI-compatible API endpoint, model, and key; and reviews the resulting draft. The app can save drafts locally, rework them, pace a batch, open Gmail compose, or explicitly create Gmail drafts with a resume. It does not send email automatically.

| Area | Current implementation | What it means |
| --- | --- | --- |
| Drafting | `godsend-agent.mjs` makes two sequential calls: an evidence-only brief, then a subject/body draft. `script.js` adds a greeting, exact job details, capitalization, and signature. | This is a useful **fixed workflow**. The model does not dynamically choose tools or steps. |
| Evaluation | `harness/run.mjs` shares the production prompt code; `harness/cases.json` has four synthetic cases. Offline mode checks plumbing; live mode checks basic strings, length, and call count. | There is a real starter harness, but it cannot yet establish writing quality, factual grounding, or user value. |
| Model choice | The user selects one provider URL and model. Both stages use it. | **No model routing** is implemented. |
| Training | Prompts and local profile data are used at inference time. | **No model training or fine-tuning** is implemented. |
| Human control | Generated messages remain drafts. Rework is previewed before replacing a saved draft; Gmail draft creation is an explicit action. | This is a good boundary to preserve in every approach below. |
| Deployment | Static GitHub Pages app, with data in browser storage and the key in the tab by default. | A hosted agent, secret-bearing server, scheduled follow-up, or server-side telemetry would require a new architecture and privacy decisions. |

The strongest honest description today is: **a human-reviewed, two-stage AI drafting workflow with a small shared-code evaluation harness**. It is substantive work. Calling it autonomous multi-agent orchestration, training, or quality-aware routing today would overstate it.

## 2. The problems worth solving

1. **Grounding:** A polished email can still invent experience, misread a posting, or blend two separate project stories.
2. **Control:** Users need to see which facts the draft relies on and decide what leaves the browser and what goes into Gmail.
3. **Consistency:** Prompts and models can regress silently. Four smoke cases do not reveal whether a change improves real drafts.
4. **Effort:** Repeatedly matching a profile to each role and reviewing many similar drafts takes time.
5. **Economics:** More model calls can improve quality but increase latency and cost. Routing is valuable only after measuring that tradeoff.

Do not use reply rate or interviews as the only quality measure. Those outcomes also depend on the job market, recipient, timing, and candidate. Measure controllable draft quality and user edits first.

## 3. Four implementation approaches

These are alternatives, not four agents to build at once. The first approach is the best next step for the present static app.

| Approach | Runtime shape | Complexity | Change to local-first promise | Best reason to choose it |
| --- | --- | --- | --- | --- |
| A. Evidence-first | Fixed, human-reviewed workflow | Low–medium | None required | Prove grounded draft quality and improve the product now. |
| B. Bounded copilot | One tool-choosing agent | Medium | None if browser/provider support it | Users need flexible questions and revisions beyond forms. |
| C. Specialists | Deterministic controller plus up to three narrow agents | High | None required, but more calls | Evals show a separate verifier or writer materially helps. |
| D. Routing/hosted | Policy router; optional backend later | High | Backend changes it substantially | Measured cost/latency or cross-device needs justify it. |

### Approach A — Evidence-first drafting workflow and serious evals

**User experience.** Before a draft, show a compact “Why this note?” panel: selected role requirement, the applicant story or profile fact that supports it, missing information, and claims the writer must avoid. The user can change the selected story or remove a weak claim. Generate the note, then show a review checklist beside the draft.

**Implementation.** Keep the current two-stage flow in `godsend-agent.mjs`, but replace the free-form four-line brief with a versioned typed object, for example:

```json
{
  "role_title": "Frontend Engineer",
  "job_id": "FE-42",
  "role_need": "accessible interfaces",
  "evidence": [{ "source_id": "story-1", "claim": "built an accessible transit dashboard" }],
  "missing": ["no production impact supplied"],
  "do_not_claim": ["production deployment", "years of experience"]
}
```

Use local validation for required fields, source IDs, lengths, exact title/ID, and forbidden claims. When the chosen provider supports schema-constrained output, use it for the brief and draft; keep a validated JSON fallback for other OpenAI-compatible providers. A valid schema does **not** prove the claims are true, so compare each claim against the supplied profile before displaying a “grounded” badge. Add a review state such as `brief_ready → user_confirmed → drafted → user_approved`.

**Harness work.** Expand `harness/cases.json` into a versioned suite with synthetic typical, missing-data, contradictory, injection, and revision cases. Save prompt version, model/provider, latency, call count, failures, and human review scores. Add exact checks for names, role title/ID, selected story ID, recipient-email exclusion, and no invented numbers. Use blinded human comparisons for warmth, specificity, and usefulness; a model judge can help sort cases only after it agrees with human labels.

**Tradeoff.** This is easy to ship on the current static architecture and provides credible evidence of quality. It is a controlled workflow, not a tool-using runtime agent. That is fine: the product benefit matters more than the label.

**Success signal.** Fewer unsupported claims and less editing per accepted draft, with acceptable latency and cost. Define thresholds from a baseline run rather than inventing impressive percentages.

### Approach B — One bounded outreach copilot with local read-only tools

**User experience.** The user asks “Which of my stories best fits this role?”, “What information is missing?”, or “Make the ask less pushy.” One copilot can inspect only the selected contact, posting, and approved profile stories, then propose a brief, draft, or revision for review.

**Implementation.** Give one runtime agent a small tool surface implemented by the application:

| Tool | Allowed result | Boundary |
| --- | --- | --- |
| `get_selected_role()` | The chosen job title, ID, and posting text | No browsing or hidden contacts. |
| `list_profile_stories(role)` | User-approved stories with stable IDs | No resume file or API key. |
| `get_saved_draft(contact_id)` | The selected local draft | Read only. |
| `get_writing_preferences()` | The selected style and user-authored direction | No access to unrelated workspace data. |

The agent may choose among these tools and ask for missing context, then return a proposed brief or revision as its output. The app validates every tool argument, limits calls and tokens, and requires the user to accept a proposed change. The model never receives recipient email addresses, OAuth tokens, API keys, or resume bytes. Keep Gmail creation outside the agent tool set at first.

**Harness work.** Evaluate tool choice and argument accuracy as well as output quality: Did it request only the selected contact? Did it ask when evidence was missing? Did it avoid tool loops? Did it produce a proposal rather than mutate storage? Record a trace of tool names, arguments **after redaction**, results, latency, and review outcome.

**Tradeoff.** This is genuinely agentic because the model chooses actions within a narrow tool set. It adds complexity around tool contracts, loop limits, and prompt injection from job descriptions. It can still run in the browser if the chosen provider supports tool calling and browser CORS; otherwise it needs a backend.

**Success signal.** Better completion of ambiguous user requests than a fixed form, without unauthorized reads or writes. If the request types remain predictable, Approach A may be simpler and stronger.

### Approach C — Supervised specialist workflow

**User experience.** A visible “Prepare → Write → Review” process produces an evidence card, one draft, and a specific critique. The user can inspect the critique and decide whether to accept a suggested revision.

**Implementation.** Use at most three narrow specialists under a deterministic controller:

1. **Evidence selector:** returns source IDs and a claim ledger, with no ability to write an email.
2. **Writer:** drafts from the approved ledger and user style; cannot access the full contact directory or Gmail.
3. **Verifier:** compares draft claims with source IDs and returns `pass`, `needs_review`, or `unsupported` plus exact spans. It cannot silently rewrite or approve its own output.

The controller owns the state machine, maximum call count, retries, and final result. The verifier is a quality signal, not proof; deterministic checks and human review remain necessary. A manager-style composition fits when one product UI owns the final answer and specialists are bounded helpers. Add a specialist only when evals show that separate instructions improve results over Approach A or B.

**Harness work.** Evaluate each stage and the full workflow. Include cases where the verifier must catch an invented metric, a merged story, a fake relationship, a missing job ID, and instructions embedded in posting text. Compare against the simpler workflow on the *same* cases and human rubric. Track added latency and cost per accepted draft.

**Tradeoff.** Clearer responsibilities and a strong technical portfolio story, but more calls, more failure points, and no automatic guarantee that the verifier is independent or correct. Avoid building this just to claim “multi-agent.”

**Success signal.** A material improvement in groundedness or user editing that justifies the extra calls and complexity.

### Approach D — Provider routing and optional hosted operations

**User experience.** GodSend selects a cheaper/faster configured model for straightforward jobs and a stronger one for hard cases. Users can see which route was selected, why, and an estimated call budget before running. A later hosted edition could coordinate jobs across devices or schedule reminders.

**Implementation.** Start with a deterministic routing policy rather than a model deciding its own price tier. For example, classify an input as `simple`, `missing_context`, or `high_risk` using explicit features: posting length, amount of profile evidence, conflicting facts, or previous validation failure. Route **stages** separately only if the provider settings allow it. Persist a route decision and fallback reason with each run. Add timeouts, rate-limit handling, a per-run call budget, and an easy manual model override. Evaluate routing quality against a fixed-model baseline before shipping automatic choices.

The current app holds a user-supplied key in the browser. A hosted version would require authentication, server-side key handling, scoped storage, retention and deletion rules, per-user quotas, and an explicit data-sharing UX. It would also change the promise that the workspace lives only in the browser. Do not introduce a backend merely to add the word “agentic.”

**Harness work.** Replay the same synthetic suite across candidate models and routes. Measure quality, cost, latency, fallback frequency, and errors. Flag cases where the cheap route worsens factual accuracy or where the expensive route adds no value. Use production feedback only with consent and data minimization.

**Tradeoff.** Potential cost/performance gains and a path to a larger service, but operational expense and a meaningful privacy migration. Training or fine-tuning is a separate later decision: it needs enough consented, high-quality examples and a held-out eval to beat prompt/routing changes.

**Success signal.** Equal or better human-rated quality at lower cost/latency, with no regression on safety and grounding cases.

## 4. Product features that fit these approaches

| Feature | First sensible implementation | Why it matters |
| --- | --- | --- |
| **Role-fit evidence card** | A: structured brief with story IDs and missing-data warning | Shows the user where claims come from. |
| **Claim inspection** | A: highlight draft spans tied to profile facts; mark uncertain spans | Makes review faster and more trustworthy. |
| **Revision coach** | A first; B if free-form requests become common | Turns “rework” into a specific, reviewable suggestion. |
| **Follow-up suggestion** | A: draft a follow-up only after the user marks a message sent; never auto-send | Helps repeat a common task without background outreach. |
| **Job posting helper** | A: parse pasted posting into requirements; B for interactive questions | Reduces manual re-entry while keeping source text visible. |
| **Quality-aware model routing** | D, only after a larger eval suite | Creates a measurable cost/quality engineering story. |
| **Multi-agent review** | C, only if a simpler verifier fails a measured benchmark | Adds separation when it earns its complexity. |

Avoid an autonomous contact finder or auto-sender as an early feature. Both add data provenance, consent, deliverability, provider-policy, and trust problems before the core drafting quality is established.

## 5. Recommended first build: Approach A

Approach A is the strongest first PRD candidate because it extends working code, makes the product more useful, and gives a credible engineering story. Build it in small releases:

1. **Baseline:** Freeze `v1` prompts and cases. Add 30–50 synthetic cases across roles, missing information, adversarial posting text, revisions, and exact job IDs. Run the existing writer and collect blinded human review on a subset.
2. **Evidence contract:** Define `EvidenceBriefV1` and validate it. Give every role story a stable source ID. Distinguish `supported`, `adjacent`, and `missing` evidence; never label adjacent experience as an exact match.
3. **Review UI:** Show the chosen requirement and supporting story before drafting. Allow the user to change the story or continue with a “no direct match” warning. Keep the draft editable.
4. **Claim checks:** Add deterministic assertions for exact title/ID, recipient greeting, excluded recipient email, numbers absent from source data, and signature handling. Flag uncertain claims for review rather than silently “fixing” them.
5. **Eval report:** Compare `v1` and `v2` on the same cases, with pass/fail reasons, per-stage latency, API call count, model/provider ID, and human rubric. Keep real contact information out of committed fixtures and logs.
6. **Decision gate:** Only then decide whether a bounded tool-using copilot, specialist verifier, or routing policy addresses failures that remain.

The first implementation should not change Gmail permissions, auto-send behavior, or the local-first storage promise. The proposed UI should tell users exactly when supplied profile and posting text will be sent to their chosen model provider.

## 6. A useful evaluation scorecard

Record scores per case, not just one overall percentage. A case fails if it invents a credential, result, relationship, or metric, even if the prose is good.

| Dimension | Example assessment |
| --- | --- |
| Groundedness | Every applicant claim maps to a supplied profile/story field. |
| Role accuracy | Exact title and ID are preserved; employer requirements are not presented as applicant experience. |
| Personalization | Uses one relevant detail, without fake familiarity or generic flattery. |
| Voice | Human reviewer rates clarity, warmth, and whether they would edit before use. |
| User control | No storage mutation, Gmail draft, or external action occurs without the matching explicit UI step. |
| Privacy | Email address, API key, OAuth token, and resume file stay out of model prompts and eval artifacts. |
| Reliability | Valid output, actionable errors, bounded retries, no partial overwrite. |
| Efficiency | Calls, latency, and estimated cost per accepted draft. |

Treat prompt injection in pasted job descriptions and recipient context as a core evaluation category. Those fields are untrusted data even when the user pasted them. Keep any tool that could create a Gmail draft behind application validation and an explicit user action. [OpenAI's eval guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices) recommends evaluating tool choice, arguments, and handoffs separately as systems become more agentic; [guardrails and human review guidance](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals) places checks at the tool boundary where side effects occur.

## 7. How to choose the PRD

Before writing a PRD, answer these five questions:

1. Which single user pain is first: inaccurate claims, too much editing, choosing a story, or managing many contacts?
2. Must the first version remain a browser-only static site?
3. Is the product allowed to call only the user's chosen provider, or can it select among models?
4. Should the assistant only propose text, or may it create Gmail drafts after an explicit click?
5. What measured improvement over today's baseline would justify another model call?

For a first PRD, I recommend **“Evidence-backed outreach drafting”**: a visible evidence card, editable draft, claim warnings, and a larger repeatable evaluation suite. The PRD should specify user stories, screens, the evidence data contract, privacy boundaries, acceptance criteria, and a baseline-vs-new eval plan. Approaches B–D can remain explicit future options until that evidence exists.

## 8. What to show when applying for AI engineering roles

GodSend can become a strong portfolio project if the repository demonstrates decisions and measured tradeoffs, not just a list of AI features:

- A one-page architecture diagram showing the browser UI, local data, two model stages, evaluation harness, and explicit Gmail-draft boundary.
- A versioned, fully synthetic eval suite with a documented human rubric, baseline results, failure examples, and a before/after comparison for each meaningful change.
- One short technical write-up on a real decision: why a structured evidence brief reduced unsupported claims, why a verifier did or did not help, or when a routing policy saved cost without reducing quality.
- A trace example with personal data redacted, showing prompt version, stage outcomes, latency, call count, and an actionable failure reason.
- A clear limitations section: browser-only storage, user-supplied model key, provider CORS, evaluation sample size, and the fact that drafts still require human review.

The honest claim today is **workflow orchestration and a starter evaluation harness**. After Approach A, you could credibly demonstrate evidence contracts, regression evaluation, and human review design. Claim model routing, tool-using agents, training, or autonomous operations only after the corresponding implementation and measurements exist.

## 9. References and implementation notes

- Current code: [`godsend-agent.mjs`](godsend-agent.mjs), [`script.js`](script.js), [`harness/run.mjs`](harness/run.mjs), [`harness/cases.json`](harness/cases.json), [`README.md`](README.md).
- [OpenAI agent runtime overview](https://developers.openai.com/api/docs/guides/agents): Responses API, Agents SDK, and Agents API serve different ownership and orchestration needs. This document does not require a runtime migration.
- [OpenAI orchestration guidance](https://developers.openai.com/api/docs/guides/agents/orchestration): add specialists only when task boundaries justify them; a manager can keep the final answer while specialists remain bounded helpers.
- [OpenAI Structured Outputs guidance](https://developers.openai.com/api/docs/guides/structured-outputs): schema adherence helps with parseability; application checks still need to verify truth and business rules. Provider compatibility must be checked before relying on a schema mode.
- [OpenAI evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices): compare workflows with case-level evals and human judgments; let eval results drive multi-agent complexity.
