# Card Patterns

Use this file for scenario-specific structure. These are design patterns, not production templates.

## Daily Or Weekly Report

Use when the card summarizes periodic work, metrics, risk, and next actions.

- First screen: period, overall status, 3 to 5 key conclusions, top risk.
- Body: KPI columns, key changes, top gains/drops, action items.
- Details: fold long tables, raw logs, project lists, or evidence.
- Footer/note: data source, update time, reporting scope, owner.
- Components: header, markdown conclusion, KPI columns, chart for trends, table for bounded actions, collapsible details.
- Avoid: listing every row before saying whether the period is good or bad.

## Product Data

Use for SKU, inventory, conversion, category, store, price, refund, or merchandising data.

- First screen: product/category/scope, period, health status, critical anomaly.
- Body: sales, volume, inventory, conversion, margin, refund rate, Top/Bottom products.
- Details: native table with bounded fields: SKU, name, price, inventory, sales, conversion, status, owner.
- Media: use thumbnails only when visual identification changes the decision.
- Components: KPI columns, Top-N table, anomaly tags, optional image, detail link.
- Avoid: letting product images crowd out metrics; showing unbounded SKU tables.

## Sales Data

Use for revenue, orders, CRM opportunities, pipeline, forecast, region, channel, or team performance.

- First screen: target achievement, forecast gap, risk level, biggest movement.
- Body: trend, YoY/MoM, funnel or stage distribution, region/channel split, Top/Bottom.
- Details: opportunities or customer rows only when they drive action.
- Components: KPI columns, trend chart, funnel or composition chart, Top-N table, action table.
- Audience adaptation: management sees forecast and risk; operations sees channel/stage; frontline sees customer/opportunity action.
- Avoid: mixing executive target gaps and row-level follow-up without hierarchy.

## Article, Blog, Or News Digest

Use for front-edge blog, article collection, industry news, research, or knowledge aggregation.

- First screen: topic, collection period, must-read items, why they matter.
- Body: categories such as must read, optional, archive; each item has title, one-sentence summary, source, time, tags, link.
- Details: longer notes, excerpts, or related links can be folded.
- Components: categorized rich text/list, tags, link buttons, feedback buttons, optional image.
- Feedback: add useful/not useful, not interested, read later, or save when personalization matters.
- Avoid: full article dumps; unsourced summaries.

## Approval Card

Use for expense, release, procurement, content, permission, or generic approval.

- First screen: approval object, current state, applicant, deadline, amount/scope, risk.
- Body: what is being approved, reason, impact, evidence.
- Actions: approve, reject, return for changes, view details. Use destructive or high-risk confirmation.
- State lock: after completion, disable or replace buttons and show final state.
- Audit: applicant, approver, operation time, reason/comment, history.
- Components: header, facts table or fields, risk note, action buttons, audit footer.
- Avoid: treating approval as a report; omitting state or audit fields.

## Retrospective Analysis

Use for incident review, campaign review, project review, metric anomaly analysis, or root cause discussion.

- First screen: topic, result state, one-sentence conclusion, impact.
- Body: facts, baseline, comparison, cause hypothesis, evidence.
- Actions: improvement items with owner and deadline.
- Details: raw data, logs, timeline, references folded.
- Components: markdown conclusion, comparison chart, evidence table, action table, collapsible appendix.
- Avoid: stating causes without evidence or hiding the corrective action.

## Progress Card

Use when one task card is updated over time.

- First screen: current state, current step, blocker or next expected event.
- Body: one primary streaming text region when needed, recent progress, concise tool/process steps, partial result.
- Details: logs and long tool output folded.
- Update mode: choose text streaming, component partial update, full replacement, or hybrid according to what changes.
- Interaction: keep complex forms and approvals out of the active streaming phase; define stop, retry, input, and feedback only for valid states.
- Final state: close the streaming phase and switch to the result-oriented pattern when the task completes.
- Components: stable status header, one streaming/progress region, step summary, collapsible logs, footer with run stats.
- Avoid: sending many separate cards for one continuously updating task; multiple competing streaming regions; leaving the final card in a process-first layout.

Read `streaming-card-rules.md` whenever the progress card uses progressive text, repeated component updates, or CardKit streaming behavior.
