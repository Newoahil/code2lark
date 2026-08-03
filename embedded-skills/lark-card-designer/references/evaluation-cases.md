# Evaluation Cases

Use this file to check whether the skill is producing stable design decisions. These are golden behavior cases, not user-facing examples and not production test fixtures.

For each case, compare the output against expected pattern, key data, component choices, and red lines. A good output may use different wording, but it must preserve the design decision.

## Case Matrix

| Case | Input signal | Expected pattern | Must include | Fail if |
| --- | --- | --- | --- | --- |
| Weekly operations report | Weekly KPI, trend, risks, owners | `ops_dashboard_card` | period, status, 3 to 5 KPI, trend, top risk, owner/action, source/update time | raw rows appear before conclusion; more than 6 flat KPI compete |
| Operational anomaly reminder | Daily operations, product group, sameSkuGroup, mapping gaps, fallback, or anomaly triage | `ops_dashboard_card`, `analysis_card`, or `alert_card` depending on depth | primary subject, reader first question, data freshness/confidence when relevant, trend or baseline, prioritized object, evidence strength, suggested next step or verification action | source-by-source dump leads; weak attribution is stated as fact; low confidence is hidden; static value is used as trend without baseline |
| Relative contribution analysis | Object performance within a total market, catalog, channel, or portfolio | `ops_dashboard_card` or `analysis_card` | contribution/share or rank, explicit denominator/scope, compatible period/grain, missing-value semantics, evidence boundary for stage gaps | raw scale answers a relative-position question; denominator is hidden; 1d/7d/30d windows are drawn as a continuous trend; missing is treated as zero |
| Executive sales report | Revenue, target, forecast gap, region split | `executive_summary_card` | target completion, forecast gap, risk, biggest movement, period, source | opportunity rows dominate first screen |
| Product/SKU operations | SKU rows, inventory, sales, conversion, refund | `ops_dashboard_card` | scope, health, anomaly, Top/Bottom SKU, bounded SKU table, unit | product images dominate metrics; unbounded SKU table |
| Article/blog digest | Titles, links, sources, summaries | `digest_card` | topic, collection time, must-read/optional/archive, source, link, priority | full articles pasted; summaries lack source |
| Procurement approval | Applicant, object, amount, reason, impact, deadline | `action_approval_card` | object, applicant, current state, amount/scope, risk, deadline, approve/reject/return, audit fields | treated as report; action buried or no final state |
| Long-running card action | Button, form, approval, clarification, or execution action starts planning, external reads, or batch work | original action pattern with acceptance/progress state overlay | accepted versus completed semantics, locked controls, truthful processing phase when needed, side-effect boundary, visible duplicate-action feedback, complete terminal states, safe-to-leave guidance when relevant | accepted state claims success; duplicate click is silent or starts another progress card; processing has no terminal state; clarification selection is described as executed; callback code or payloads are emitted |
| Metric retrospective | KPI drop, baseline, cause hypothesis, actions | `analysis_card` | conclusion, impact, baseline, evidence, cause confidence, action owner/deadline | cause stated without evidence; raw logs first |
| Incident alert | Severity, impacted object, cause, mitigation | `alert_card` unless action is required | status, impact, cause, mitigation, update time, action link if needed | decorative urgency; vague "something is wrong" wording |
| Long-running task | Current step, partial results, logs | `progress_card` | current state, step, blocker/next update, latest result, folded logs, explicit final pattern | many separate result cards; logs dominate first screen; final card stays process-first |
| Streaming AI response | Progressive answer, tool steps, feedback after completion | `progress_card` with streaming overlay, then result pattern | reason for streaming, update mode, one primary streaming region, stable regions, exception states, interaction transition, finalization and fallback | short content streams for effect; multiple text regions compete; hidden reasoning or raw logs are exposed; active streaming contains complex approval/form interaction |
| Real-client preview review | Feishu desktop/mobile screenshots, preview version, rendered interaction states, or visual acceptance request | existing scenario pattern plus `preview_review` overlay | version, evidence reviewed, observed issues versus inferred risks, responsive behavior, interaction safety, prioritized revisions, verdict, acceptance criteria | JSON or source is treated as visual proof; implementation/send/deployment steps are produced; IDs or credentials are repeated; no version or viewport is identified |
| JSON 2.0 feasibility handoff | Any design expected to become Feishu Card JSON 2.0 | original scenario pattern plus mandatory feasibility gate | target schema, authoring path, exact official component tags, conceptual mappings, conditions, fallbacks, implementation verification | invented/deprecated tag; pseudo schema; root elements; guessed field/style; compatibility claimed without exact verification |
| Visual-builder handoff | Card must be authored in the visual builder | original scenario pattern with authoring-path constraints | only builder-supported capabilities or explicit fallback; unsupported JSON-only components remain conditional | `collapsible_panel`, `select_img`, `checker`, or `audio` is prescribed as directly available in the visual builder |
| Chart recommendation | Trend, composition, funnel, or target-gap visual | original scenario pattern with conditional chart | business question, chart type intent, compatible data grain, `chart_spec` verification requirement, non-chart fallback | chart is called sendable or compatible from the `chart` tag alone; fabricated VChart fields or no fallback |

## Review Procedure

1. Identify which case is closest to the user input.
2. Check that `card_pattern.name` matches the expected pattern or has a clear justified alternative.
3. Check that `key_data_rules.must_show` includes the required trust fields: period, source, unit, owner, deadline, or audit trail when relevant.
4. Check that `component_plan.data_display` matches the data shape: conceptual KPI groups map to verified components, bounded rows use `table`, charts stay conditional until `chart_spec` validation, and folded evidence has an authoring-path fallback.
5. Check that `visual_rules.color_policy` starts neutral and adds color only for status, risk, priority, trend, or action focus.
6. For operational analytics, check that the card is organized by decision or action priority rather than data-source order, and that low-confidence conclusions remain visibly uncertain.
7. For relative contribution or position analysis, check denominator, scope, time grain, and missing-value semantics.
8. For streaming, check the reason, update mode, one primary streaming region, active-to-final interaction transition, exception states, and final result pattern.
9. For real-client preview review, check that findings are tied to a version and evidence, observed issues are separated from inferred risks, sample data is anonymized, interactions are non-production, and the verdict does not imply deployment approval.
10. Check that action cards include button layout, disabled/accepted/processing/final states, and audit feedback.
11. For long-running actions, check that acceptance does not claim completion, duplicate clicks receive a visible stable state, side-effect boundaries are clear, and every processing state has a terminal or needs-input path.
12. Check that implementation constraints remain handoff requirements and do not turn into callback payloads, HTTP handling, queue design, API calls, or code.
13. Check that `feasibility_check` separates `official_components`, `conditional_components`, `conceptual_only_patterns`, and `unsupported_or_unverified_requests`.
14. Check every implementation-facing body component against the exact JSON 2.0 whitelist. Nested tags may appear only as nested mappings, never as generic `body.elements` components.
15. Check that authoring-path restrictions are explicit. JSON-only and visual-builder-only capabilities must not be transferred across authoring paths without a fallback.
16. Check that `structure_sketch` is labeled as a design handoff component map only, not production-sendable Feishu JSON, and that it contains no JSON-looking envelope.
17. Check that `design_red_lines` names the main failure modes for this scenario, not generic advice only.

## JSON 2.0 Hard Failures

Fail the output immediately when any item below is present in an implementation-facing recommendation:

- An invented or deprecated body tag such as `note`, `action`, `collapsible`, `button_group`, `form_optional`, or any `_or_` combination.
- A pseudo-schema such as `schema: json_2_0_like` or a structure that places body components under root `elements` instead of `body.elements`.
- Arbitrary CSS-like properties, generic style objects, HTML layout, gradients, shadows, fonts, flex/grid declarations, or unverified fields/enums presented as Feishu support.
- A component or feature is declared supported without checking its exact official document when fields, nesting, authoring path, client version, resources, forwarding, or interaction behavior matter.
- A nested tag such as `column`, `plain_text`, `lark_md`, `text_tag`, `standard_icon`, `custom_icon`, or `fallback_text` is used as a generic body component.
- `chart` is declared implementation-compatible without requiring validation of its VChart `chart_spec` and providing a non-chart fallback.
- A JSON-only component is prescribed for a visual-builder implementation, or a visual-builder-only capability is represented as a JSON tag.
- A conditional or unsupported/unverified request has no conservative fallback.
- The handoff claims production sendability, successful validation, or API acceptance without a real implementation-side validation and send/render test.

Allowed occurrences of invalid names are limited to explicit warnings, negative examples, and compatibility tests that clearly say never to use them.

## Common Regression Signals

- Every dataset becomes a table-first dashboard.
- Every card receives a strong color theme.
- Approval cards omit final locked state.
- Long-running actions confuse accepted with completed, hide duplicate-click feedback, or remain permanently processing.
- Clarification cards describe a selected option as already executed instead of continuing understanding or planning.
- Digests lose source attribution.
- Reports omit period, unit, source, or baseline.
- Operational analytics cards show many metrics but no primary subject, priority order, confidence, or next-step judgment.
- Relative-position cards use raw values without denominator, scope, or a valid comparison grain.
- Streaming cards expose logs or reasoning, keep several regions moving, or never transition to a stable final pattern.
- Preview reviews trust code instead of rendered evidence, omit mobile or state coverage when relevant, or drift into sender scripts and deployment instructions.
- Long evidence is not folded.
- Conceptual labels look like component tags or are placed in JSON-looking structures.
- Authoring-path restrictions are absent, so JSON-only components leak into visual-builder designs.
- A valid component tag is treated as proof that all fields, nesting, or chart specs are valid.
- The output claims to generate production-ready JSON, field-level schemas, callback contracts, or implementation code.
