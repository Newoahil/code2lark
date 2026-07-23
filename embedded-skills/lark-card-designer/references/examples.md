# Minimal Examples

These examples show output shape, not full implementation. Keep real outputs concise unless the user asks for depth.

## Daily/Weekly Report

Input: weekly business operations report with KPI, risk, and action items.

```markdown
card_intent:
- data_type: time series + KPI + action rows
- intent: report and execute
- audience: business operations
- assumptions: default to operations because owner/action items are present

card_pattern:
- name: ops_dashboard_card
- why: needs KPI health, trend, anomaly, and owner actions

information_architecture:
- first_screen: period, overall status, 3 key conclusions, top risk
- body: KPI columns, trend chart, action table
- details: raw project rows folded
- footer_or_note: source and update time

component_plan:
- header: status color from overall health
- content: markdown conclusion
- data_display: KPI columns + trend chart + bounded action table
- interactions: view detail or refresh if data is live
- metadata: source, period, owner
```

## Product Data

Input: SKU sales, inventory, conversion, refund rate, product image fields.

```markdown
card_intent:
- data_type: product rows + KPI + anomaly tags
- intent: diagnose and execute
- audience: business operations

card_pattern:
- name: ops_dashboard_card
- why: product data needs metric health plus object-level action

information_architecture:
- first_screen: category/store, period, inventory or conversion risk
- body: KPI columns, Top/Bottom SKU, anomaly tags
- details: bounded SKU native table
- footer_or_note: source table and update time

component_plan:
- data_display: native table for SKU rows, optional thumbnail only for recognition
- interactions: view product detail, assign owner if action is needed
```

## Sales Data

Input: monthly revenue, target completion, forecast gap, opportunities by stage.

```markdown
card_intent:
- data_type: KPI + time series + funnel + opportunity rows
- intent: report and diagnose
- audience: management

card_pattern:
- name: executive_summary_card
- why: target completion and forecast gap require decision-level focus

information_architecture:
- first_screen: target completion, forecast gap, key risk
- body: trend chart, funnel or stage composition, top risks
- details: opportunity rows folded
- footer_or_note: CRM source, period, forecast assumptions
```

## Article Or News Digest

Input: front-edge AI blog list with titles, links, sources, summaries.

```markdown
card_intent:
- data_type: article list + external links
- intent: preserve knowledge and triage reading
- audience: knowledge/news

card_pattern:
- name: digest_card
- why: reader needs priority, summary, source, and feedback

information_architecture:
- first_screen: topic, collection period, must-read items
- body: must read / optional / archive groups
- details: related links folded
- footer_or_note: source count and collection time

interaction_rules:
- primary_action: open must-read item
- secondary_actions: useful, not interested, read later
```

## Approval Card

Input: procurement approval with applicant, amount, reason, impact, approver.

```markdown
card_intent:
- data_type: process object + amount + risk fields
- intent: decide
- audience: frontline execution

card_pattern:
- name: action_approval_card
- why: user must make an auditable decision

information_architecture:
- first_screen: object, applicant, amount, current state, deadline
- body: reason, impact, risk, evidence
- details: purchase details and history folded
- footer_or_note: audit fields

interaction_rules:
- primary_action: approve
- secondary_actions: reject, return for changes, view details
- state_changes: lock buttons after final decision
- audit_or_feedback: approver, time, comment
```

## Retrospective Analysis

Input: campaign performance dropped, with KPI comparison, suspected causes, action items.

```markdown
card_intent:
- data_type: KPI comparison + evidence + action rows
- intent: diagnose and improve
- audience: retrospective analysis

card_pattern:
- name: analysis_card
- why: needs conclusion, evidence, cause, and corrective action

information_architecture:
- first_screen: one-sentence conclusion, impact, baseline
- body: comparison chart, evidence table, cause hypothesis
- details: raw campaign data folded
- footer_or_note: data source and limitations

component_plan:
- data_display: comparison chart + evidence table
- interactions: view raw data, create follow-up task if supported
```
