# Component Rules

Choose components from the data shape and reader action. Avoid component variety for its own sake.

## Component Selection Table

| Need | Prefer | Use when | Avoid |
| --- | --- | --- | --- |
| One clear conclusion | header + markdown/div | Summary, alert, report first screen | Table for one sentence |
| 3 to 5 metrics | KPI columns / column set | Key numbers need comparison | More than 6 flat KPI |
| Bounded rows | native table | SKU, sales, opportunity, approval history | Markdown pipe table or raw CSV |
| Time trend | chart | Daily/weekly trend, YoY/MoM, forecast | Many time columns in a table |
| Composition | chart | Category, channel, status distribution | Percent text without context |
| Funnel | chart | Sales stages, conversion path | Flat table with no stage hierarchy |
| Ranking | Top-N table/list | Hot items, anomalies, best/worst | Full detail rows mixed into ranking |
| Secondary evidence | collapsible panel | Logs, raw data, long references | Expanded first-screen detail |
| Decision/action | button/action | Approval, confirmation, feedback, jump | Asking user to type reply text |
| Parameter input | select/input/form | Environment, project, person, date | Many mutually exclusive buttons |
| Person fields | user/user list or readable mention | Applicant, approver, owner | Opaque IDs |
| Source and caveat | note/footer | Data update time, source, limitation | Competing with the title |

## Table Rules

- Use native table for structured rows/columns.
- Keep first-screen tables small. Prefer 5 to 10 rows, then fold or link out.
- Preserve field names, units, sorting, and status columns.
- Put action columns only when row-level action is expected.
- Do not convert structured rows into prose before designing the table.

## Chart Rules

- Trend: line chart or compact trend chart.
- Composition: pie, donut, stacked bar, or comparable composition chart.
- Contribution over time: multi-series line chart only when each series uses the same denominator, scope, and time grain.
- Funnel: funnel chart or staged conversion layout.
- Ranking: bar chart or Top-N table.
- Target gap: progress bar, bullet chart, or KPI plus delta.
- Anomaly: highlight label plus trend context.
- Label series by metric meaning, not color alone. Use direct labels, legend text, line style, or markers so the chart remains understandable without color.
- Treat aggregate windows such as 1-day, 7-day, and 30-day as categorical comparisons unless consistent time nodes support a real trend.
- Do not use a chart if one sentence or a KPI block communicates the point better.

## Button And Action Rules

- Use one primary action. Use secondary actions only when they are truly alternatives.
- Approval cards usually need approve, reject, return, and view details.
- Destructive or irreversible actions need confirmation copy.
- Disable, hide, or replace buttons after the state changes.
- Make button text action-oriented, for example "批准", "退回修改", "查看详情".
- For button layout, loading/disabled/final states, input fields, selects, and form layout, use `interaction-parameters.md`.

## Collapsible Rules

- Fold raw logs, long tables, evidence, previous history, and low-priority details.
- Do not fold the conclusion, current state, primary risk, or required action.
- If a folded section is essential for audit, label it clearly.

## Image Rules

- Use images for product recognition, article preview, or evidence only when they change comprehension.
- Keep images secondary to metrics and actions.
- For design handoff, note that image components require usable Feishu image resources such as `image_key` downstream.

## Metadata Rules

- Reports need period, scope, data source, update time.
- Approvals need applicant, approver, current state, operation time, reason/comment.
- Sales/product data need unit and field definitions.
- Knowledge digests need source, publish time, collection time, and link.
