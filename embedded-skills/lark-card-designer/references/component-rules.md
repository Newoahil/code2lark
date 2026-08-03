# Component Rules

Choose components from the data shape and reader action. Avoid component variety for its own sake.

Before using any component name in an implementation-facing mapping, classify it with `json-2.0-compatibility-rules.md`. Conceptual patterns must map to official tags, and conditional components must include a fallback.

## Component Selection Table

| Need | Prefer | Use when | Avoid |
| --- | --- | --- | --- |
| One clear conclusion | header + markdown/div | Summary, alert, report first screen | Table for one sentence |
| 3 to 5 metrics | KPI group mapped to `column_set` + `column` + `div`/`markdown` | Key numbers need comparison | Treating KPI group as a tag; more than 6 flat KPI |
| Bounded rows | native table | SKU, sales, opportunity, approval history | Markdown pipe table or raw CSV |
| Time trend | chart | Daily/weekly trend, YoY/MoM, forecast | Many time columns in a table |
| Composition | chart | Category, channel, status distribution | Percent text without context |
| Funnel | chart | Sales stages, conversion path | Flat table with no stage hierarchy |
| Ranking | Top-N table/list | Hot items, anomalies, best/worst | Full detail rows mixed into ranking |
| Secondary evidence | `collapsible_panel` for JSON authoring | Logs, raw data, long references | Using `collapsible` as a tag; assuming visual-builder support |
| Decision/action | individual `button`; `overflow` for low-priority actions | Approval, confirmation, feedback, jump | Using deprecated or invented grouped-action tags |
| Parameter input | select/input/form | Environment, project, person, date | Many mutually exclusive buttons |
| Person fields | `person` / `person_list` or readable mention | Applicant, approver, owner | Opaque IDs; invented `user` tags |
| Source and caveat | notation-sized neutral `div` or concise `markdown` | Data update time, source, limitation | Deprecated `note` tag; competing with the title |

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
- Funnel: verified `chart` with a validated funnel spec, or a staged conversion layout using `table`/`markdown`.
- Ranking: bar chart or Top-N table.
- Target gap: verified `chart` spec when the visual adds value, otherwise KPI plus delta. Progress bar and bullet chart are conceptual forms, not component tags.
- Anomaly: highlight label plus trend context.
- Label series by metric meaning, not color alone. Use direct labels, legend text, line style, or markers so the chart remains understandable without color.
- Treat aggregate windows such as 1-day, 7-day, and 30-day as categorical comparisons unless consistent time nodes support a real trend.
- Do not use a chart if one sentence or a KPI block communicates the point better.
- Treat every chart as conditional until the implementation owner validates its VChart `chart_spec`.

## Button And Action Rules

- Use one primary action. Use secondary actions only when they are truly alternatives.
- Approval cards usually need approve, reject, return, and view details.
- Destructive or irreversible actions need confirmation copy.
- Disable, hide, or replace buttons after the state changes.
- Make button text action-oriented, for example "批准", "退回修改", "查看详情".
- For button layout, loading/disabled/final states, input fields, selects, and form layout, use `interaction-parameters.md`.
- A horizontal button row is a conceptual layout. Map it to verified `button` components in `column_set`/`column`, or use `overflow` for lower-priority options.

## Collapsible Rules

- Fold raw logs, long tables, evidence, previous history, and low-priority details.
- Do not fold the conclusion, current state, primary risk, or required action.
- If a folded section is essential for audit, label it clearly.
- When the visual builder is the authoring path, replace `collapsible_panel` with a concise summary plus a detail link or separate detail card.

## Image Rules

- Use images for product recognition, article preview, or evidence only when they change comprehension.
- Keep images secondary to metrics and actions.
- For design handoff, note that image components require usable Feishu image resources such as `image_key` downstream.

## Metadata Rules

- Reports need period, scope, data source, update time.
- Approvals need applicant, approver, current state, operation time, reason/comment.
- Sales/product data need unit and field definitions.
- Knowledge digests need source, publish time, collection time, and link.

## Compatibility-Sensitive Components

- `form`, selects, inputs, and buttons require exact field and interaction verification; this skill specifies design intent, not callback schema.
- `collapsible_panel`, `select_img`, and `checker` are unavailable in the visual builder.
- `audio` is JSON-only and carries client, file-resource, forwarding, and fallback constraints.
- `chart` requires a valid VChart specification.
- Table data types, column definitions, and nesting must be checked in the table document.
- Unknown or unsupported components fall back to `markdown`, `div`, bounded `table`, or an external detail link.
