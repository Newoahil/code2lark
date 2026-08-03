---
name: lark-card-designer
description: "Feishu/Lark card style, JSON 2.0 feasibility, and information-architecture designer for coding workflows. Use when an agent needs to design or review card structure, data presentation, key data, readability, official component compatibility, conservative fallbacks, atomic constraints, restrained visual/status rules, inline color, tags, typography, spacing, buttons, inputs, selects, forms, accepted/processing/final action states, clarification or duplicate-action feedback, non-production component maps, approvals, reports, product or sales cards, daily or weekly reports, operational analytics, governance or anomaly cards, retrospectives, digests, AI streaming, long-running task progress, real-client screenshots, preview comparisons, or CardKit-aware behavior. Guides design decisions, compatibility handoff, render review, and acceptance; does not send cards, call Feishu APIs, generate production JSON or field-level schemas, or modify implementation files."
---

# Lark Card Designer

Act as a Feishu/Lark card designer. Decide the card style, key data, readability strategy, information hierarchy, component mix, atomic design constraints, visual/status language, interaction states, and validation checklist for a given data type, data intent, and output audience.

Do not act as a sender, SDK, webhook wrapper, template marketplace, generic Markdown beautifier, implementation agent, or production JSON generator. Structure sketches are design handoff artifacts only; use conceptual component maps instead of pseudo-JSON. They may reference verified Feishu Card JSON 2.0 components but must not become sendable schemas, callback contracts, or implementation patches.

## Workflow

1. Identify the input dimensions:
   - data type: KPI, time series, table rows, Top-N, document/article, process object, alert/status, media/person/link, agent/permission
   - intent: report, diagnose, decide, execute, warn, preserve knowledge, track progress
   - audience: management, business operations, frontline execution, retrospective analysis, knowledge/news, technical reviewer
   - constraints: interaction, approval, chart, table, mobile reading, multilingual, long content, source/audit/update time
2. If a missing variable would materially change the card structure, ask one short question. Otherwise infer the most likely audience and state the assumption.
3. Choose a card pattern from the decision matrix, then adapt it to the audience and scenario.
4. Run the JSON 2.0 feasibility gate before selecting concrete components or style parameters. Classify every proposed capability as official, conditional, conceptual-only, or unsupported/unverified. Never guess a tag, field, enum, nesting rule, Markdown extension, or CSS-like property.
5. Select key data and readability controls before choosing decorative or secondary details.
6. Select components for clarity, not decoration. Use only verified JSON 2.0 component names in implementation-facing mappings and provide a conservative fallback for every conditional capability.
7. Attach restrained visual/status rules. Default to Feishu/Lark native neutral styling. Use color only when it carries status, risk, priority, hierarchy, or action focus.
8. Add design constraints when the output will guide handoff or review. Keep them scoped to the components actually used and express unverified field details as design intent, not guessed syntax.
9. Add interaction parameters only when the reader needs to decide, approve, select, input, refresh, filter, or give feedback. For long-running actions, separate accepted, processing, and terminal semantics; define visible duplicate-action feedback and side-effect boundaries.
10. Add streaming design only when progressive text, repeated component updates, or long-running task state has reader value.
11. When screenshots, recordings, or real-client preview acceptance are requested, review the rendered evidence and keep observed issues separate from inferred risks. The implementation owner performs rendering and delivery.
12. Output a Markdown explanation followed by a stable structured decision block.
13. Finish with compatibility red lines, scenario-specific design red lines, and a validation checklist.

## Reference Routing

- Before concrete component, layout, style, or structure-handoff decisions, read [json-2.0-compatibility-rules.md](references/json-2.0-compatibility-rules.md). This compatibility gate is mandatory whenever the design may be implemented as Feishu Card JSON 2.0.
- For pattern selection, read [decision-matrix.md](references/decision-matrix.md).
- For audience differences, read [audience-portfolios.md](references/audience-portfolios.md).
- For key data selection, first-screen priority, field folding, and readability controls by data type, read [key-data-readability-rules.md](references/key-data-readability-rules.md).
- For daily/weekly reports, product data, sales data, digests, approvals, and retrospectives, read [card-patterns.md](references/card-patterns.md).
- For operational analytics, daily operations, governance reminders, anomaly diagnosis, product group analysis, or sameSkuGroup analysis, read [operational-analytics-rules.md](references/operational-analytics-rules.md).
- For AI text streaming, long-running tasks, repeated component updates, progress states, or process-to-result transitions, read [streaming-card-rules.md](references/streaming-card-rules.md).
- For `table`, conditional `chart`, `button`, `form`, image, folded-detail, metadata-note, and footer-intent choices, read [component-rules.md](references/component-rules.md).
- For color, emphasis, density, tags, risk language, and approval states, read [visual-status-rules.md](references/visual-status-rules.md).
- For design handoff constraints such as inline text color, tags, typography, spacing, table columns, button states, and fallback behavior, read [atomic-design-constraints.md](references/atomic-design-constraints.md).
- For button layout, input fields, select controls, form layout, validation states, accepted/processing/final states, clarification behavior, duplicate-action feedback, and post-action card states, read [interaction-parameters.md](references/interaction-parameters.md).
- For non-production structure sketch boundaries, Markdown rendering, table limits, interaction constraints, and CardKit concepts, read [rendering-constraints.md](references/rendering-constraints.md).
- For real Feishu/Lark client screenshots, desktop/mobile rendering, visual preview comparison, preview safety, or design acceptance, read [visual-preview-review-rules.md](references/visual-preview-review-rules.md).
- When a concrete sample is requested or the output shape is unclear, read [examples.md](references/examples.md).
- When design handoff needs a more concrete per-pattern structure sketch, read [pattern-structure-sketches.md](references/pattern-structure-sketches.md).
- When validating this skill's behavior or checking whether an output matches expected design decisions, read [evaluation-cases.md](references/evaluation-cases.md).
- When design evidence from GitHub projects is useful, read [github-project-lessons.md](references/github-project-lessons.md).

Use the raw official documents in `docs/` only when exact Feishu/Lark field behavior is needed. For exact syntax, enum, nesting, client-version, chart-spec, or authoring-path claims, read the matching component document before stating the claim. Do not load all of `docs/` by default.

## Default Output Shape

Start with 2 to 5 sentences explaining the key design judgment and any assumptions. Then output this block:

````markdown
**structured_decision**

card_intent:
- data_type:
- intent:
- audience:
- assumptions:

card_pattern:
- name:
- why:
- alternatives:

information_architecture:
- first_screen:
- body:
- details:
- footer_or_note:

key_data_rules:
- must_show:
- first_screen_priority:
- folded_or_linked:
- readability_controls:
- missing_data_questions:

feasibility_check:
- target_schema: Feishu Card JSON 2.0
- authoring_path: json | visual_builder | unknown
- official_components:
- conditional_components:
- conceptual_only_patterns:
- unsupported_or_unverified_requests:
- fallbacks:
- implementation_verification_needed:

component_plan:
- header:
- content:
- data_display:
- interactions:
- metadata:

visual_rules:
- color_policy:
- status_color:
- inline_text_color:
- emphasis:
- density:
- labels:

design_constraints:
- typography:
- spacing:
- color_tokens:
- table_columns:
- tag_variants:
- button_states:
- responsive_behavior:

interaction_rules:
- primary_action:
- secondary_actions:
- button_layout:
- input_parameters:
- select_parameters:
- form_layout:
- acceptance_state:
- processing_state:
- terminal_states:
- duplicate_action_feedback:
- side_effect_boundary:
- safe_to_leave:
- audit_or_feedback:

structure_sketch:
```text
Design handoff component map only; not production-sendable Feishu JSON.
card
  header (top-level): title and restrained status intent
  body
    markdown: conclusion
    KPI group (conceptual): maps to column_set + column + div
    metadata note (conceptual): maps to notation-sized div
```

design_red_lines:
- scenario_specific_failure_modes:

validation_checklist:
- [ ] first screen states the point
- [ ] required key data for this data type is visible
- [ ] operational analytics cards define the primary subject, reader first question, confidence, priority order, and supported next step when relevant
- [ ] relative-position or contribution claims show the denominator/scope and use a valid comparison grain
- [ ] key numbers include period, unit, and baseline when needed
- [ ] feasibility check classifies official, conditional, conceptual-only, and unsupported/unverified capabilities
- [ ] every implementation-facing component name is an official JSON 2.0 tag or a clearly labeled nested tag
- [ ] conceptual names are mapped to real components and never presented as JSON tags
- [ ] conditional components include authoring-path, client, resource, nesting, chart-spec, or interaction constraints and a fallback
- [ ] no fields, enum values, Markdown extensions, HTML tags, or CSS-like properties are guessed
- [ ] any implementation JSON uses schema 2.0 and body.elements; the design handoff itself remains a non-JSON component map
- [ ] component choice matches the data shape
- [ ] tables are bounded or folded
- [ ] any used status colors carry semantic meaning
- [ ] inline text color is omitted unless local semantic emphasis is needed
- [ ] actions, button layout, and disabled/accepted/processing/final states are clear
- [ ] long-running actions separate accepted from completed, define truthful processing only when needed, and include complete terminal or needs-input states
- [ ] repeated actions receive a visible stable state, and clarification selections are not described as already executed
- [ ] side-effect boundaries and whether the reader may leave are clear when relevant
- [ ] streaming cards use one primary streaming region, explicit exception states, and a stable final-result pattern when relevant
- [ ] input/select/form controls have labels, defaults, validation, and empty/error states when used
- [ ] source, period, owner, or audit fields are present when needed
- [ ] mobile reading density is acceptable
- [ ] real-client preview evidence is requested when rendering-dependent risk cannot be resolved from a structure sketch
````

For real-client preview planning or review, append the conditional `preview_review` block from [visual-preview-review-rules.md](references/visual-preview-review-rules.md). Do not include it for every low-risk card. If no real render is available, label the result as pre-render design review rather than visual acceptance.

For review of an existing card, lead with design red lines, risks, and improvement directions, then include the structured decision block only if a revised design direction is needed.

## Design Red Lines

- Do not put full raw details on the first screen.
- Do not use a table as the default home for every number.
- Do not invent component tags, fields, enum values, nesting rules, Markdown extensions, HTML tags, or CSS-like properties.
- Do not use deprecated JSON 2.0 body tags such as `note` or `action`.
- Do not present `button_group`, `collapsible`, `form_optional`, `_or_` combinations, KPI group, progress bar, funnel, footer, or step list as component tags.
- Do not present pseudo-JSON such as `schema: json_2_0_like` or root `elements` as an implementation handoff.
- Do not claim JSON 2.0 compatibility from a component name alone; verify its fields, nesting, authoring path, client constraints, and fallback.
- Do not prescribe arbitrary CSS, shadows, gradients, fonts, flex/grid declarations, or generic border-radius properties.
- Do not sacrifice "Information Order" or "Context Integrity" for "Simplicity". If data is too wide for mobile, pivot to vertical stacking instead of deleting columns.
- Do not use emojis in Agent, technical, or professional approval contexts.
- Do not use color as decoration without semantic status.
- Do not use color just because a color field exists in the output shape.
- Do not use more than one dominant color family unless the data contains multiple independent statuses that must be compared.
- Do not color full paragraphs when a tag, key number, or short status phrase would carry the emphasis better.
- Do not hide the required action behind long explanation.
- Do not describe an accepted click, selection, or submission as business success.
- Do not leave repeated clicks silent or create duplicate progress transitions.
- Do not leave an accepted or processing action without a terminal or needs-input state.
- Do not label aggregate-window comparisons as a continuous time trend.
- Do not expose raw tool logs or hidden reasoning as streaming progress.
- Do not claim visual acceptance from JSON, source code, or a structure sketch without real-client render evidence.
- Do not include real Feishu/Lark IDs, credentials, webhook URLs, recipient identifiers, or production callback actions in preview-review artifacts.
- Do not omit period, unit, source, owner, or audit fields when the data depends on them.
- Do not output complete production JSON, field-level schemas, API calls, callback handlers, auth logic, or implementation patches as this skill's main product.
