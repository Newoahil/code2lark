# Operational Analytics Rules

Use this file when the card is for operational analytics, daily operations, business monitoring, governance reminders, anomaly diagnosis, product group analysis, or sameSkuGroup analysis.

These are scenario overlay rules. They refine `ops_dashboard_card`, `analysis_card`, `alert_card`, and sometimes `executive_summary_card`; they do not create a separate top-level card pattern.

## Core Design Goal

Design operational analytics cards to help the reader understand the next sensible step, not to prove that many data points were collected.

Prefer this decision path:

1. Define the primary subject.
2. Identify the reader's first question.
3. Identify the action or decision the card should support.
4. Choose the metrics that justify that action or decision.
5. Arrange layout, components, and visual emphasis last.

Do not invent a business recommendation when the upstream context does not support one. If evidence is weak, say that confidence is low and recommend verification instead of strong action.

## When To Apply

Apply these rules when the scenario includes one or more of these signals:

- daily or weekly operations report
- business operations monitoring
- operations reminder or governance reminder
- anomaly diagnosis or risk triage
- product, SKU, product group, or sameSkuGroup operating analysis
- multi-source data freshness, fallback, mapping, or sample-size concern
- user needs to decide which object to handle first

Do not apply these rules globally to knowledge digests, generic approvals, pure progress cards, or cards whose purpose is only archival reporting.

## Subject And Narrative

- Choose one primary subject for the card: product, product group, data-source health, governance task, link pool, anomaly event, channel, region, or owner.
- If multiple subjects are unavoidable, keep one main narrative subject and split secondary subjects into clearly titled sections.
- Do not organize the card by data source order unless the card's subject is data-source health.
- Prefer action order: overall judgment, top risk or opportunity, prioritized objects, evidence, details.

## First-Screen Priority

For operational analytics, the first screen should usually answer:

- Is there a problem, opportunity, or low-confidence state today?
- Which object or issue matters most?
- Why does it deserve attention?
- What should the reader do next, or what should they verify first?

Use these conditional rules:

- If data is incomplete, stale, fallback-based, delayed, or sample-limited, place data quality and confidence near the top.
- If data is healthy and confidence is high, keep source, period, and update time close to the summary or footer instead of letting trust metadata dominate the card.
- If the card is a reminder, monitoring card, or patrol card, show trend, comparison, newly added problems, and recovered problems before static absolute values.
- If the card is a static inventory or snapshot, absolute values may lead, but period, scope, and update time must remain visible.
- If no action is required, do not force a fake action. State the current judgment and the observation condition instead.

## Information Architecture

Use this structure for most operational analytics cards:

1. Data state and confidence, when trust affects the decision.
2. Overall judgment with 1 to 3 conclusions.
3. Prioritized objects or issues, sorted by severity, impact, opportunity, or owner responsibility.
4. Evidence and explanation: trend, baseline, decisive KPI, known cause, or uncertainty.
5. Folded detail: full metric table, raw rows, link list, mapping gaps, or audit details.

Avoid moving raw detail, full row lists, or source-by-source sections above the judgment.

## Key Data Rules

- Treat KPIs as evidence for the judgment, not as independent decoration.
- Pair key numbers with period, unit, and comparison baseline when the claim depends on change.
- For reminders and monitoring, prefer yesterday comparison, 7-day average, same day last week, active/removed change, coverage change, new problems, and recovered problems.
- Keep current value, 7-day total, 30-day total, and ratio as supporting data unless the user's primary question is a static snapshot.
- Each prioritized row should include at least object, issue, known or suspected reason, suggested next step, owner or responsible role when available, and confidence when needed.

## Comparison And Contribution Integrity

Match the metric framing to the question being answered:

- Use absolute values to answer how large an object is or how it changed by itself.
- Use share, contribution, rank, or indexed position to answer where an object sits within a larger whole.
- When using a contribution metric, keep the denominator, scope, period, and unit visible. Do not compare ratios built from different scopes or time grains.
- Use stage-to-stage contribution gaps to reveal a possible mismatch, such as attention share exceeding outcome share. Treat the gap as evidence for investigation, not proof of a specific cause.
- If a denominator, downstream stage, or required source is missing, lower confidence and avoid derived rates that imply complete data.
- Do not promote a scenario's fixed series colors into a global standard. Choose locally consistent, accessible series labels and keep metric meaning readable without color.

Distinguish comparison shapes:

- A trend requires ordered observations at a consistent time grain, such as daily or weekly nodes.
- `1-day`, `7-day`, and `30-day` aggregates are window comparisons unless they are derived from consistent underlying time nodes.
- Label window comparisons explicitly. Do not draw them as if they were a continuous daily trend.
- Distinguish zero, missing, unavailable, and not applicable. A dash must not silently mean zero.

The skill may recommend required metric semantics and data-grain constraints. It must not calculate business metrics in the display layer or prescribe a production data model.

## Confidence And Attribution

Classify the strength of cause statements:

- Strong attribution: evidence directly supports the cause.
- Weak attribution: evidence suggests a likely cause but does not prove it.
- Insufficient evidence: cause cannot be determined from the provided context.

Do not present weak attribution as fact. For low-confidence cases, make the recommended next step a verification task, such as checking mapping, data freshness, crawl status, link state, or sample coverage.

## Anomaly Reminder Format

For anomaly reminders, prefer this sentence shape:

`object + anomaly + reason or evidence + suggested next step`

Examples:

- `Pocket 3 group 1d amount is 42% below the 7-day average; active links decreased and head-link visits declined, so check the promoted links and replenishment state first.`
- `Wide 300 group is missing 3 mapping records. Current operating judgment is low confidence; verify mapping and data capture before acting on the business conclusion.`

## Component Guidance

- Use a short judgment paragraph or note for the overall conclusion.
- Use KPI columns only for 3 to 5 decisive metrics; do not create a wall of flat KPI blocks.
- Use charts for trends, baselines, and changes when they alter the decision.
- Use a bounded table for prioritized objects, usually 5 to 10 rows.
- Fold full detail tables, raw data, source gaps, long evidence, and debug-like fields.
- Use tags for risk, confidence, freshness, new/recovered state, or action priority.
- Use buttons only when the reader can take a meaningful next step, such as view detail, assign owner, verify data, refresh, or open a downstream workflow.

## Red Lines

- Do not make the card table-first before stating the judgment.
- Do not make every metric visually equal.
- Do not hide low confidence, stale data, fallback, or sample shortage below the details.
- Do not claim trend, volatility, or decline without a baseline.
- Do not use raw scale to answer a relative-position question when share, contribution, or rank is required.
- Do not hide the denominator or compare contribution metrics built from inconsistent scopes.
- Do not present aggregate windows as a continuous time series.
- Do not treat missing or unavailable values as zero.
- Do not mix product, product group, data-source health, and governance state as equal subjects in one undifferentiated block.
- Do not add heavy analysis rules in the display layer. Assume the input context already contains structured conclusions, risk, priority, and suggested action when those are required.
- Do not expand first-round design into monitoring, diagnosis, governance, execution, and feedback writeback all at once. Prefer the shortest useful loop: see the issue, rank priority, suggest next step.

## Output Additions

When these rules apply, include these items in the structured decision block where relevant:

```markdown
operational_analytics_rules:
- primary_subject:
- reader_first_question:
- supported_action_or_decision:
- confidence_display:
- priority_sort:
- trend_or_baseline:
- comparison_scope_or_denominator:
- time_grain_integrity:
- missing_value_semantics:
- detail_boundary:
- non_goals:
```

For review tasks, check whether the existing card proves data collection instead of helping the reader decide what to inspect, verify, or handle next.
