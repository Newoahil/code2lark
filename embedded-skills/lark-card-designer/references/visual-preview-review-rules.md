# Real-Client Visual Preview Review

Use this reference when a Feishu/Lark card has been rendered in a real client, when screenshots or recordings are available, or when rendering-dependent risks require a preview before design acceptance.

This is a design validation method. The implementation owner renders and delivers the preview. The designer skill reviews the evidence and gives revision directions; it does not send cards, configure credentials, write sender scripts, define callbacks, or deploy changes.

## When Preview Is Needed

Recommend a real-client preview when one or more of these conditions apply:

- the card has dense information, long text, a bounded table, multiple columns, images, charts, or collapsible content
- button hierarchy, form layout, disabled/loading/final states, or post-action feedback must be judged visually
- desktop and mobile clients may wrap, truncate, fold, or reorder content differently
- inline text color, tags, header color, spacing, or emphasis materially affects interpretation
- the card uses streaming or repeated partial updates and the stability of the layout matters
- a previous design review found overflow, weak hierarchy, excessive color, unclear actions, or inconsistent rendering
- the user must approve the concrete visual result rather than an abstract structure sketch

Do not require a preview for every low-risk text card. State why preview evidence is or is not necessary.

## Responsibility Boundary

The designer skill may:

- request screenshots, recordings, or rendered-card evidence
- define representative sample-data requirements
- specify which client surfaces and states should be reviewed
- compare preview versions and identify visible regressions
- issue concrete design modifications and acceptance criteria
- return a design verdict

The designer skill must not:

- call Feishu/Lark APIs or send a preview
- generate production-sendable JSON or sender scripts
- configure app credentials, tokens, webhooks, recipients, or environment variables
- define live callback actions or persistence behavior
- modify project implementation files, restart services, merge branches, or deploy

## Required Evidence

Request only evidence needed for the design risk. Prefer:

- a preview version label such as `<preview_version>`
- a Feishu desktop screenshot at normal reading width
- a Feishu mobile screenshot when the card is user-facing or structurally dense
- screenshots of important states: initial, loading, validation error, disabled, submitted/final, expanded, collapsed, or streaming-complete as relevant
- a short recording only when layout movement, streaming, or interaction transition cannot be judged from still images
- notes about observed truncation, wrapping, overflow, fold behavior, image crop, click state, or update flicker
- the design goal and previous preview version when comparison is requested

Do not claim visual acceptance from JSON, source code, or a structure sketch alone. If no real render is available, label conclusions as pre-render design review and list the evidence still required.

## Sample Data Policy

Use representative, realistic data shapes without exposing production identity.

- cover the longest plausible title, label, number, unit, URL, person name, and localized text
- include empty, missing, zero, negative, warning, error, and long-list states when relevant
- preserve realistic row counts and value ranges so density can be judged
- replace real customer, employee, order, product, tenant, chat, user, or audit identifiers with approved fictitious values or placeholders
- do not use `?` as a generic placeholder when the data shape affects layout
- do not include credentials, secrets, access tokens, webhook URLs, environment configuration, or unapproved production data

Use neutral placeholders when identity is not part of the design:

- `<preview_recipient>`
- `<preview_environment>`
- `<preview_version>`
- `<audit_reference>`
- `<representative_sample_data>`

## Preview Safety Requirements

The implementation owner should isolate preview behavior from production behavior. The design review must require:

- an approved private, non-production preview destination
- visibly non-production state when confusion with a live action is possible
- inert or no-op interactions for approve, reject, delete, publish, price change, permission change, and other consequential actions
- no production callback action, persistent mutation, notification fan-out, or external side effect
- no real recipient IDs, app IDs, tenant IDs, user IDs, chat IDs, tokens, secrets, or webhook URLs in review artifacts
- removal or secure handling of temporary preview credentials, scripts, and identifiers by the implementation owner

The design may specify that a preview control must be inert and how that state should look. It must not prescribe the callback value or implementation contract.

## Review Dimensions

Review the rendered result in this order:

1. **Task clarity**: Can the reader identify the conclusion, decision, or required action in the first screen?
2. **Information hierarchy**: Do title, status, key data, evidence, detail, and metadata appear in the right order?
3. **Data readability**: Are period, unit, baseline, denominator, labels, missing-value meaning, and row boundaries clear?
4. **Density and folding**: Is the first screen bounded? Are Top-N, long evidence, logs, and secondary fields folded or deferred appropriately?
5. **Visual semantics**: Is color restrained and semantic? Are status, risk, priority, and emphasis distinguishable without color alone?
6. **Interaction hierarchy**: Is there one clear primary action? Are secondary, dangerous, disabled, loading, error, and final states understandable?
7. **Responsive behavior**: Do text, tables, controls, charts, and images remain readable without incoherent wrapping, clipping, or excessive scrolling?
8. **State continuity**: For streaming or updates, do stable regions remain stable and does the card settle into a clear final result?
9. **Trust and audit**: Are source, time, owner, scope, and audit references present when needed without dominating the card?

Separate observations from inferences:

- `observed`: directly visible in the supplied render
- `inferred`: likely risk that still needs another state, viewport, or interaction to verify

## Revision Directions

Make feedback implementable as design direction without writing implementation code. Each issue should include:

- affected region or component
- observed problem
- reader impact
- required design change
- priority: `blocker`, `high`, `medium`, or `low`
- evidence needed to verify the revision

Prefer statements such as:

- "Keep only the decision, amount, risk, and deadline above the fold; move the evidence list into a collapsed detail region."
- "Use one primary action and place the return action second; the current equal emphasis makes the decision path ambiguous."
- "Replace paragraph-wide green text with a neutral sentence plus a short status tag; retain the words 'price decreased' so meaning does not depend on color."

Avoid field-level JSON instructions, callback names, SDK methods, repository paths, or deployment steps.

## Version Comparison

When comparing versions:

- compare the same viewport, client surface, sample data, and interaction state
- identify improvements, regressions, and unresolved risks separately
- tie every finding to a preview version
- do not accept a version solely because one issue improved if a higher-priority regression appeared
- keep the final accepted evidence or decision record according to the host project's process, without prescribing its storage path

## Verdicts

Use one verdict:

- `accepted`: no design blocker remains for the reviewed scope and evidence
- `accepted_with_minor_changes`: structure is sound; listed low-risk adjustments can be verified without another full review
- `revise_and_preview_again`: visible hierarchy, readability, interaction, responsive, or state-continuity issues require another render
- `insufficient_evidence`: the requested viewport, state, version, or representative data is missing

Preview acceptance covers only the reviewed design and evidence. It does not approve implementation correctness, API behavior, security, callbacks, deployment, or production release.

## Conditional Output Block

Include this block only for real-client preview planning or review:

```markdown
preview_review:
- preview_needed:
- reason:
- preview_version:
- evidence_reviewed:
- missing_evidence:
- target_clients_or_viewports:
- sample_data_policy:
- interaction_safety:
- observed_issues:
- inferred_risks:
- revision_priority:
- verdict:
- acceptance_criteria:
- implementation_owner:
```
