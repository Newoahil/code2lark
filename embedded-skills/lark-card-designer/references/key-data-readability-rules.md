# Key Data And Readability Rules

Use this file when choosing what information must be visible, what can be folded, and how to keep a Feishu/Lark card readable for a specific data type.

The goal is not to show less data. The goal is to put the decisive data first, keep supporting data traceable, and prevent wide or noisy content from hiding the point.

## Key Data Selection Algorithm

1. Identify the card's primary question:
   - `what happened`: report, alert, progress, digest
   - `why it happened`: analysis, retrospective, diagnosis
   - `what should I do`: approval, execution, frontline operations
   - `what changed`: KPI, time series, sales/product operations
2. Promote fields that answer the primary question:
   - result or state
   - object or scope
   - magnitude, unit, and comparison baseline
   - risk, anomaly, or priority
   - owner, deadline, or next action
   - source, period, update time, or audit trail
3. Keep the first screen bounded:
   - one conclusion or state sentence
   - 3 to 5 primary metrics or facts
   - one top risk, anomaly, or required action
   - source/period/update time when trust depends on it
4. Fold or link secondary data:
   - raw rows beyond the first useful page
   - IDs, logs, historical details, evidence chains, or debug output
   - repeated metrics that do not change the decision
   - long text, long article excerpts, full comments, or full audit history
5. Ask one question only when a missing variable changes the structure. Prefer asking about audience, period/baseline, action state, or data source.

## Data Type Field Matrix

| Data type | Must show | First-screen priority | Fold or link | Readability control |
| --- | --- | --- | --- | --- |
| Scalar KPI | metric name, value, unit, period, baseline | value, delta, status, target gap | calculation detail, historical series | KPI block plus short explanation |
| Time series | period, metric, current value, trend, comparison | trend direction, anomaly, latest value | full time table, old periods | chart or compact trend; avoid many date columns |
| Composition / contribution | numerator object, denominator/scope, share, period, comparison | relative position, share change, stage gap | raw numerator/denominator rows, calculation detail | composition or multi-series trend with explicit denominator |
| Detail rows / table | row identity, status, key value, owner/action | top risky/actionable rows | raw IDs, low-priority columns, long notes | native table; 5 to 10 visible rows |
| Top-N ranking | rank, item name, metric, change, reason/status | top movers, top risks, best/worst | complete ranking, raw evidence | Top-N list/table; sort key explicit |
| Product data | SKU/category, inventory, sales, conversion, margin/refund, status | scope, health, anomaly, Top/Bottom products | full SKU table, image-heavy detail | KPI + Top-N + bounded SKU table |
| Sales data | revenue/order, target, forecast, pipeline stage, region/channel, owner | target achievement, forecast gap, risk, biggest movement | customer/opportunity rows unless actionable | KPI + trend/funnel + action rows |
| Article/blog/news digest | title, source, publish/collect time, summary, priority, link | must-read items, why it matters | full article body, long excerpts | categorized list with tags and links |
| Approval/process object | object, applicant, state, amount/scope, reason, deadline, risk | decision object, current state, consequence, primary action | full history, raw policy text | facts block + action area + audit footer |
| Alert/status | severity, impacted object, cause, time, mitigation | current status, impact, required action | full logs, secondary context | status header + short mitigation path |
| Long-running progress | current step, state, blocker, next update, latest result | current state and next expected event | long tool output, old steps | conceptual step summary mapped to `markdown`/`div`; conditional `collapsible_panel` logs or detail link |
| Agent/permission | requester/agent, permission scope, resource, risk, expiry, audit | identity, scope, impact, approve/reject decision | raw permission JSON, full policy docs | technical facts table; no decorative language |

## Intent-Specific Key Data

| Intent | Promote | Avoid promoting |
| --- | --- | --- |
| Report | conclusion, KPI, delta, period, source | row-level details before the result |
| Diagnose | conclusion, baseline, evidence, cause confidence | cause statements without evidence |
| Decide | tradeoff, risk, consequence, recommended action | neutral summaries with no decision point |
| Execute | object, state, owner, deadline, enabled action | explanations that bury the button |
| Warn | severity, impact, mitigation, update time | decorative urgency or vague alarm words |
| Preserve knowledge | topic, priority, source, link, why it matters | unsourced summaries or full article dumps |
| Track progress | current step, blocker, next update, final target | every historical log line |

## Readability Rules

### First Screen

- Lead with the answer, state, or required action before raw data.
- Use 3 to 5 key facts for the primary summary. If more facts are required, group them into sections.
- Put period, scope, unit, source, and update time close to the metric group, not hidden in a distant appendix.
- Keep action cards especially direct: object, risk/consequence, deadline, action.

### Numbers And Metrics

- Always pair values with units when units change interpretation.
- Show baseline for deltas: YoY, MoM, target, previous period, forecast, or threshold.
- For share, contribution, rate, or penetration metrics, show or clearly name the denominator and scope.
- Use raw values for scale questions and relative metrics for position-within-a-whole questions.
- Distinguish `0`, missing, unavailable, and not applicable; never let `-` silently mean zero.
- Use signed deltas consistently. Do not mix `+12%`, `up 12%`, and `12 percent higher` in one card.
- Mark abnormal values with text plus tag/color; do not rely on color alone.

### Time Grain And Comparison

- Call a series a trend only when observations use a consistent ordered time grain.
- Label `1-day`, `7-day`, and `30-day` aggregates as window comparison unless underlying daily or weekly nodes exist.
- Do not connect unrelated aggregate windows with a line that implies continuous movement.
- Compare metrics only when scope, denominator, period, unit, and calculation definition are compatible.

### Tables

- Use visible columns for identity, status, decisive metric, owner/action, and update time.
- Move raw IDs, debug fields, long comments, and secondary metrics to folded detail.
- Default visible rows to the smallest useful set, usually 5 to 10.
- If a table has more than 3 important columns on mobile, pivot secondary columns into stacked label/value text or folded detail.

### Text

- Keep summaries to one or two short sentences per section.
- Use bullets for parallel facts; use paragraphs only for explanation.
- Do not paste full article bodies, policy text, logs, or CSV-like content into the first screen.
- Preserve source and caveat text when the claim depends on them.

### Actions

- Put the primary action near the decision context.
- Keep secondary actions visible only when they are likely next steps.
- Show disabled, loading, final, expired, and permission-denied states when actions change card state.

## Missing Data Questions

Ask one short question when one of these missing fields would change the layout:

| Missing field | Ask because |
| --- | --- |
| audience | management, operations, and frontline cards use different first screens |
| period or baseline | KPI and trend cards need comparison context |
| source or update time | trust and audit fields may be required |
| approval state or permissions | action availability and final state change the card |
| primary action | action cards need button layout and post-action state |
| row volume or column count | table strategy depends on density and mobile readability |

## Output Shape

When useful, add this compact block:

```markdown
key_data_rules:
- must_show: [period, scope, primary_metric, unit, baseline, source]
- first_screen_priority: [conclusion, 3_to_5_kpi, top_risk, next_action]
- folded_or_linked: [raw_rows, audit_history, long_notes]
- readability_controls: [bounded_table, visible_units, mobile_vertical_stack]
- missing_data_questions: [baseline_if_absent]
```
