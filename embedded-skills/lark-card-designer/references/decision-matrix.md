# Decision Matrix

Use this file to choose the card pattern from data type, intent, and audience. Favor deterministic selection over prompt-style freeform design.

## Card Pattern Vocabulary

| Pattern | Primary use | First-screen promise |
| --- | --- | --- |
| `executive_summary_card` | Management reporting, key risk, decision summary | Result, risk, decision point, 3 to 5 KPI |
| `ops_dashboard_card` | Business operations, daily/weekly tracking, product/sales operations | KPI, trend, anomaly, owner/action |
| `action_approval_card` | Approval, confirmation, frontline execution | Object, risk, deadline, primary action |
| `analysis_card` | Retrospective, diagnosis, root cause, evidence chain | Conclusion, evidence, comparison, next action |
| `digest_card` | Blog/article/news/knowledge aggregation | Priority, topic, summary, source, feedback |
| `alert_card` | Incident, warning, short notification | Status, impacted object, cause, action link |
| `progress_card` | Long-running process, streaming update, task tracking | Current state, step, blocker, next update |

## Primary Selection Rules

1. If the user must approve, reject, confirm, choose, or execute, choose `action_approval_card`.
2. If the input is a retrospective, diagnosis, root cause analysis, or evidence-backed explanation, choose `analysis_card`.
3. If the input is article/blog/news/research aggregation, choose `digest_card`.
4. If the input is KPI/time-series reporting and the audience is management, choose `executive_summary_card`.
5. If the input is KPI/time-series reporting and the audience is operations, choose `ops_dashboard_card`.
6. If the input is short incident or notification data with one clear status, choose `alert_card`.
7. If the card will be updated repeatedly for one task, choose `progress_card`, then add a final-result pattern when complete.

## Data Type To Pattern

| Data type | Default pattern | Common audience adaptation |
| --- | --- | --- |
| Scalar KPI | `executive_summary_card` or `ops_dashboard_card` | Management gets conclusion first; operations gets trend and owner |
| Time series | `ops_dashboard_card` | Management gets only key deltas; analysis gets evidence and baseline |
| Detail rows/table | `ops_dashboard_card` | Frontline gets actionable rows; analysis gets evidence table folded |
| Top-N ranking | `ops_dashboard_card` or `digest_card` | Product/sales uses table; knowledge uses list with source |
| Document/article list | `digest_card` | Add triage: must read, optional, archive |
| Approval/process object | `action_approval_card` | Add state machine and audit fields |
| Alert/status | `alert_card` | Escalate to `action_approval_card` if user action is required |
| Long-running task | `progress_card` | Separate process state from final result |

## Intent To Pattern

| Intent | Pattern | Design focus |
| --- | --- | --- |
| Report | `executive_summary_card` or `ops_dashboard_card` | Conclusion and key changes |
| Diagnose | `analysis_card` | Evidence, baseline, cause |
| Decide | `action_approval_card` | Tradeoff, risk, clear button |
| Execute | `action_approval_card` | Object, owner, deadline, state |
| Warn | `alert_card` | Severity, impact, mitigation |
| Preserve knowledge | `digest_card` | Summary, source, tags |
| Track progress | `progress_card` | Current step, status, next update |

## Audience Tie-Breakers

| Ambiguity | Prefer | Reason |
| --- | --- | --- |
| KPI report could be management or operations | Infer operations unless user asks for decision/executive summary | Operations needs more working detail by default |
| Sales data could be management or frontline | Infer management for target completion; infer frontline for customer/opportunity rows | Different first-screen action |
| Product data could be operations or analysis | Infer operations for SKU/inventory; infer analysis for cause/comparison | Product rows usually imply action |
| Article list could be digest or report | Infer digest unless business KPI is attached | Source and triage matter most |
| Approval could be report or action | Prefer action | The button state is the design center |

## Ask One Question When

- The audience is unknown and choosing it changes first-screen content.
- Approval risk is high but action permissions or final state are unclear.
- The input mixes many scenarios and no dominant intent is visible.
- The user asks for a review but does not provide the existing card, JSON, screenshot, or component description.

Ask only the variable that changes structure. Example: "这张卡主要给管理层看结论，还是给一线处理人直接操作？"
