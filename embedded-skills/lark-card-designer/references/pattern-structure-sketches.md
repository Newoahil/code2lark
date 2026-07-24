# Pattern Structure Sketches

Use this file when design handoff needs a more concrete structure sketch than the default output. These are design sketches only. Do not treat them as production-sendable Feishu JSON, field-level schemas, or implementation templates.

Keep sketches small. Show hierarchy, component intent, and field placement; avoid full API envelopes, credentials, callbacks, or complete component schemas.

## Contents

- Executive Summary Card
- Ops Dashboard Card
- Digest Card
- Action Approval Card
- Analysis Card
- Alert Card
- Progress Card

## Executive Summary Card

Use for management reporting, business health, decision summaries, and high-level risk.

```json
{
  "note": "Design handoff sketch only, not production-sendable Feishu JSON.",
  "schema": "json_2_0_like",
  "header": {
    "title": "period + scope + conclusion",
    "template": "neutral_or_single_status_color"
  },
  "elements": [
    { "tag": "markdown", "content": "one-sentence conclusion and decision point" },
    { "tag": "column_set", "purpose": "3_to_5_kpi_with_unit_baseline_delta" },
    { "tag": "chart_or_markdown", "purpose": "small trend or target gap only if it changes the decision" },
    { "tag": "note", "content": "source, update time, scope, caveat" },
    { "tag": "collapsible", "content": "supporting details or raw rows" }
  ]
}
```

## Ops Dashboard Card

Use for daily/weekly operations, product operations, sales operations, anomalies, and owner follow-up.

```json
{
  "note": "Design handoff sketch only, not production-sendable Feishu JSON.",
  "schema": "json_2_0_like",
  "header": {
    "title": "period + scope + health/status",
    "template": "neutral_or_status_color"
  },
  "elements": [
    { "tag": "markdown", "content": "what changed, what needs attention" },
    { "tag": "column_set", "purpose": "key_kpi_group" },
    { "tag": "chart", "purpose": "trend, composition, funnel, or target gap" },
    { "tag": "table", "purpose": "bounded_actionable_rows", "visible_rows": "5_to_10" },
    { "tag": "collapsible", "content": "raw rows, old periods, long notes" },
    { "tag": "note", "content": "source, owner, update time" }
  ]
}
```

Product variant: make row identity `SKU/category`; prioritize inventory, sales, conversion, margin/refund, status, owner.

Sales variant: prioritize revenue/order, target, forecast gap, funnel stage, region/channel, owner.

## Digest Card

Use for blog, article, research, industry news, and knowledge aggregation.

```json
{
  "note": "Design handoff sketch only, not production-sendable Feishu JSON.",
  "schema": "json_2_0_like",
  "header": {
    "title": "topic + collection period",
    "template": "neutral_or_priority_status"
  },
  "elements": [
    { "tag": "markdown", "content": "why this collection matters" },
    { "tag": "markdown_or_rich_text", "section": "must_read", "fields": ["title", "summary", "source", "time", "tags", "link"] },
    { "tag": "markdown_or_rich_text", "section": "optional", "fields": ["title", "summary", "source", "link"] },
    { "tag": "collapsible", "content": "archive, related links, longer notes" },
    { "tag": "button_group", "purpose": "open, read later, useful/not useful when feedback matters" }
  ]
}
```

## Action Approval Card

Use for approvals, confirmations, parameterized execution, permission changes, procurement, releases, and auditable decisions.

```json
{
  "note": "Design handoff sketch only, not production-sendable Feishu JSON.",
  "schema": "json_2_0_like",
  "header": {
    "title": "approval object + current state",
    "template": "pending_or_final_status"
  },
  "elements": [
    { "tag": "markdown", "content": "decision object, consequence, deadline" },
    { "tag": "column_set_or_table", "purpose": "applicant, amount/scope, reason, impact, risk" },
    { "tag": "note", "content": "policy caveat, audit requirement, source" },
    { "tag": "form_optional", "purpose": "reject reason, return reason, parameter selection" },
    { "tag": "button_group", "primary": "approve", "secondary": ["reject", "return", "view_detail"] },
    { "tag": "collapsible", "content": "history, evidence, raw policy text" },
    { "tag": "note", "content": "final state, operator, time, comment after action" }
  ]
}
```

Always specify post-action state: `pending -> submitting -> approved/rejected/returned/expired/failed`.

## Analysis Card

Use for retrospectives, root-cause analysis, evidence-backed diagnosis, and campaign/project reviews.

```json
{
  "note": "Design handoff sketch only, not production-sendable Feishu JSON.",
  "schema": "json_2_0_like",
  "header": {
    "title": "topic + result state",
    "template": "neutral_or_risk_status"
  },
  "elements": [
    { "tag": "markdown", "content": "one-sentence conclusion, impact, confidence" },
    { "tag": "chart_or_table", "purpose": "baseline comparison and evidence" },
    { "tag": "markdown", "content": "cause hypothesis with evidence boundary" },
    { "tag": "table", "purpose": "corrective actions with owner and deadline" },
    { "tag": "collapsible", "content": "raw data, logs, timeline, references" },
    { "tag": "note", "content": "source, limitation, update time" }
  ]
}
```

## Alert Card

Use for incidents, warnings, short abnormal notifications, and single-status updates.

```json
{
  "note": "Design handoff sketch only, not production-sendable Feishu JSON.",
  "schema": "json_2_0_like",
  "header": {
    "title": "severity + impacted object",
    "template": "severity_status_color"
  },
  "elements": [
    { "tag": "markdown", "content": "current status, impact, likely cause" },
    { "tag": "markdown_or_note", "content": "mitigation and next update time" },
    { "tag": "button_group_optional", "purpose": "view details, acknowledge, refresh" },
    { "tag": "collapsible", "content": "logs and secondary context" }
  ]
}
```

Escalate to `action_approval_card` when the reader must approve, confirm, or execute.

## Progress Card

Use for long-running tasks, streaming updates, and process tracking.

```json
{
  "note": "Design handoff sketch only, not production-sendable Feishu JSON.",
  "schema": "json_2_0_like",
  "header": {
    "title": "task + current state",
    "template": "running_completed_failed_or_blocked"
  },
  "elements": [
    { "tag": "markdown", "purpose": "single_primary_streaming_region", "content": "latest useful result or generated answer" },
    { "tag": "markdown_or_step_list", "purpose": "current step, concise tool-result summary, blocker, next event" },
    { "tag": "button_group_optional", "purpose": "stop, retry, provide input, or feedback only when valid for current state" },
    { "tag": "collapsible", "content": "tool output, logs, historical steps" },
    { "tag": "note", "content": "run stats, source, update time, timeout or fallback note" }
  ]
}
```

Keep the header and primary content region stable during updates. When complete, close streaming, remove generating language, and switch to the final result pattern instead of keeping a process-first layout.
