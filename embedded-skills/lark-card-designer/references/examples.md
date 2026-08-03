# Minimal Examples

These examples show design-output shape, not implementation. Component maps are conceptual handoff artifacts and must not be converted into sendable JSON without exact official verification.

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
- body: KPI group, trend evidence, bounded action table
- details: raw project rows folded or linked
- footer_or_note: source and update time

feasibility_check:
- target_schema: Feishu Card JSON 2.0
- authoring_path: unknown
- official_components: [markdown, column_set, div, table]
- conditional_components: [chart, collapsible_panel]
- conceptual_only_patterns: [KPI group, metadata note]
- unsupported_or_unverified_requests: []
- fallbacks: [vertical metric stack, markdown comparison, detail link]
- implementation_verification_needed: [column nesting, table columns, chart_spec, collapsible authoring path]

component_plan:
- content: markdown conclusion
- data_display: KPI group maps to column_set + column + div; table is bounded to actionable rows
- interactions: button only if view detail or refresh is a verified user action
- metadata: notation-sized neutral div for source, period, and owner
```

## Product Data

Input: SKU sales, inventory, conversion, refund rate, product image fields.

```markdown
card_intent:
- data_type: product rows + KPI + anomaly labels
- intent: diagnose and execute
- audience: business operations

card_pattern:
- name: ops_dashboard_card
- why: product data needs metric health plus object-level action

information_architecture:
- first_screen: category/store, period, inventory or conversion risk
- body: KPI group, Top/Bottom SKU, anomaly labels
- details: bounded SKU table
- footer_or_note: source table and update time

feasibility_check:
- target_schema: Feishu Card JSON 2.0
- authoring_path: unknown
- official_components: [markdown, div, table]
- conditional_components: [column_set, img]
- conceptual_only_patterns: [KPI group, anomaly label, metadata note]
- unsupported_or_unverified_requests: []
- fallbacks: [vertical metric stack, SKU text identity instead of image]
- implementation_verification_needed: [column nesting, table columns, image resource and fields]

component_plan:
- data_display: bounded table for SKU rows; thumbnail only when recognition changes the decision
- interactions: verified button or detail link for product detail; assignment stays conceptual unless interaction support is confirmed
```

## Sales Data

Input: monthly revenue, target completion, forecast gap, opportunities by stage.

```markdown
card_intent:
- data_type: KPI + time series + funnel stages + opportunity rows
- intent: report and diagnose
- audience: management

card_pattern:
- name: executive_summary_card
- why: target completion and forecast gap require decision-level focus

information_architecture:
- first_screen: target completion, forecast gap, key risk
- body: trend evidence, stage composition, top risks
- details: opportunity rows folded or linked
- footer_or_note: CRM source, period, forecast assumptions

feasibility_check:
- target_schema: Feishu Card JSON 2.0
- authoring_path: unknown
- official_components: [markdown, div, table]
- conditional_components: [column_set, chart, collapsible_panel]
- conceptual_only_patterns: [KPI group, funnel visualization, metadata note]
- unsupported_or_unverified_requests: []
- fallbacks: [vertical metric stack, staged markdown or bounded stage table, detail link]
- implementation_verification_needed: [column nesting, chart_spec, table columns, collapsible authoring path]
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
- body: must-read, optional, and archive groups
- details: related links folded or linked
- footer_or_note: source count and collection time

feasibility_check:
- target_schema: Feishu Card JSON 2.0
- authoring_path: unknown
- official_components: [markdown, div, button, overflow]
- conditional_components: [collapsible_panel]
- conceptual_only_patterns: [article group, button row, metadata note]
- unsupported_or_unverified_requests: []
- fallbacks: [markdown article list, one primary button plus text links, archive link]
- implementation_verification_needed: [link syntax, button fields, interaction behavior, collapsible authoring path]

interaction_rules:
- primary_action: open must-read item when a verified button or link path is available
- secondary_actions: useful, not interested, or read later only when the host supports the callbacks
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
- details: purchase details and history folded or linked
- footer_or_note: audit fields

feasibility_check:
- target_schema: Feishu Card JSON 2.0
- authoring_path: json
- official_components: [markdown, div, button, overflow]
- conditional_components: [column_set, form, input, collapsible_panel]
- conceptual_only_patterns: [decision facts, button row, metadata note]
- unsupported_or_unverified_requests: []
- fallbacks: [labeled div facts, one primary button plus overflow, external reason form, detail link]
- implementation_verification_needed: [column nesting, button and form fields, callback behavior, idempotency, collapsible nesting]

interaction_rules:
- primary_action: approve
- secondary_actions: reject, return for changes, view details
- acceptance_state: lock controls and state that the interaction was received
- processing_state: show only when downstream work is genuinely asynchronous
- terminal_states: approved, rejected, returned, cancelled, expired, failed, needs_input
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
- body: comparison evidence, evidence rows, cause hypothesis
- details: raw campaign data folded or linked
- footer_or_note: data source and limitations

feasibility_check:
- target_schema: Feishu Card JSON 2.0
- authoring_path: unknown
- official_components: [markdown, div, table]
- conditional_components: [chart, collapsible_panel]
- conceptual_only_patterns: [comparison evidence, metadata note]
- unsupported_or_unverified_requests: []
- fallbacks: [markdown comparison with baseline, bounded evidence table, detail link]
- implementation_verification_needed: [chart_spec, table columns, collapsible authoring path]

component_plan:
- data_display: choose chart only after chart_spec validation; otherwise use a bounded evidence table or markdown comparison
- interactions: detail link; task creation remains conceptual unless a verified host action exists
```
