# Interaction Parameters

Use this file when the card is an action surface: approval, confirmation, parameter selection, filtering, feedback, task execution, or any card where the reader changes state.

Do not add controls just because Feishu supports them. Every control must reduce ambiguity, prevent an error, or shorten a required workflow.

All parameter names and state labels in this file are design vocabulary, not Feishu JSON properties or enum values. Map controls only to verified JSON 2.0 components and require the implementation owner to check the matching component document for fields, nesting, callback behavior, and client constraints.

## Interaction Decision Rules

| User need | Prefer | Avoid |
| --- | --- | --- |
| One irreversible or auditable decision | Primary button + confirmation + final locked state | Multiple equal primary buttons |
| Pick one value from known options | Single select | Free text input |
| Pick multiple known values | Multi select | Many checkboxes or many buttons |
| Pick a person | User picker | Plain text user ID |
| Pick date or time | Date/date-time picker | Free text date |
| Provide short reason/comment | Input field | Asking for chat reply |
| Configure several parameters | Form container or grouped controls | Long button rows |
| Choose from many secondary actions | Overflow menu | Crowded visible button row |
| Give lightweight feedback | Small feedback buttons/tags | Full form |

## Button Layout Parameters

Specify button layout when the card has actions.

| Parameter | Guidance |
| --- | --- |
| `primary_action` | The one action the card is mainly asking the reader to take |
| `primary_position` | Put near the decision context or at the bottom action area; do not bury after raw details |
| `secondary_actions` | Keep to 1 to 3 visible actions when possible |
| `overflow_policy` | Move rare, admin, history, or low-frequency actions into overflow |
| `max_visible_buttons` | Prefer 1 primary + up to 2 secondary visible buttons |
| `destructive_action` | Make visually and textually distinct; require confirmation |
| `disabled_after_submit` | Disable or replace action buttons after final state |
| `accepted_state` | Immediately confirm receipt, lock controls, and avoid claiming business success |
| `processing_state` | Use only for meaningful long work; show the real phase and next event |
| `final_state_label` | Replace action area with final state such as `已批准`, `已拒绝`, `已提交` |

Button ordering:

- Approval: `批准` primary; `拒绝` and `退回修改` secondary; `查看详情` low-risk secondary or link.
- Execution: action button first, then detail or cancel.
- Feedback: compact positive/negative/read-later actions after the item or section they affect.
- Refresh: secondary unless the card's primary purpose is live data refresh.

Button text:

- Use verb-object phrases when possible: `批准申请`, `退回修改`, `查看明细`.
- Avoid vague copy: `确定`, `提交`, `处理`.
- Include consequence in confirmation copy, not on the button label.

## Button State Matrix

| State | Primary button | Secondary buttons | Card feedback |
| --- | --- | --- | --- |
| Initial | Enabled | Enabled if relevant | Show required context before actions |
| Accepted/submitting | Disabled or replaced | Disabled | Confirm the interaction was received without claiming business success |
| Processing | Disabled or replaced | Show cancel/detail only when valid | Show the real phase, next event, and whether the reader may leave |
| Success/final | Replaced or disabled | Hidden or disabled | Show final state, actor, time |
| Failed | Re-enable if retry is safe | Show fallback/detail | Show reason and retry path |
| Expired | Disabled | Show view/history only | Show expiry time and next path |
| No permission | Hidden or disabled | Show view/request access | Explain why action is unavailable |

## Input Field Parameters

Specify inputs only when free-form user text is genuinely needed.

| Parameter | Guidance |
| --- | --- |
| `field_name` | Stable semantic field, such as `reject_reason`, `comment`, `budget_note` |
| `label` | User-facing label; short and specific |
| `field_type` | text, multiline text, number-like text, URL-like text, or platform-specific input |
| `required` | Required only when backend/process truly needs it |
| `placeholder` | Show content format, not instructions already visible elsewhere |
| `default_value` | Use only when safe and reversible |
| `helper_text` | Explain constraints or examples |
| `validation` | Length, format, required, allowed characters, or business rule |
| `error_text` | Concrete fix, not generic failure |
| `submit_behavior` | Inline submit, form submit, or button-controlled submit |

Input rules:

- Prefer select/date/user picker over free text when the valid set is known.
- Keep approval comments optional unless policy requires a reason.
- Require rejection/return reasons when audit quality matters.
- Do not put long writing tasks inside a card; link out or collect a short note.

## Select Parameters

Use selects to reduce ambiguity for known option sets.

| Parameter | Guidance |
| --- | --- |
| `single_or_multi` | Single when the next state accepts one value; multi when filtering or tagging |
| `option_source` | static list, dynamic list, current context, or remote/source table |
| `option_grouping` | Group by project, environment, status, owner, region, or type when list is long |
| `default_selected` | Use only when a safe default exists |
| `placeholder` | State the selection goal: `选择环境`, `选择审批人` |
| `max_visible_options` | Keep initial list short; use search or grouping for long lists |
| `empty_state` | Explain no options and next step |
| `disabled_options` | Show unavailable options only when explanation is useful |
| `change_behavior` | Immediate update, wait for submit, or preview only |

Select rules:

- Use single select for environment, category, priority, and one owner.
- Use multi select for tags, filters, reviewers, or affected modules.
- For user selection, prefer user picker over generic dropdown.
- If selecting changes many downstream fields, use a form layout and submit button.

## Form Layout Parameters

Use a form when the user must provide several related values before one submission.

| Parameter | Guidance |
| --- | --- |
| `field_order` | Put identity/scope first, then parameters, then comment/reason |
| `grouping` | Group by scope, timing, owner, risk, and comment |
| `required_fields` | Keep minimal; mark why required fields are required |
| `review_before_submit` | Use for high-risk, irreversible, or audit-heavy actions |
| `submit_area` | One primary submit, optional cancel/reset |
| `cancel_behavior` | Clear form, close edit mode, or return to read-only state |
| `post_submit_state` | Loading, success, failed retry, final locked card |

Form layout rules:

- Do not mix many visible buttons with a form unless buttons operate on the form.
- Keep form fields close to the object they modify.
- Put audit comments near the final submit action.
- If the form becomes long, split into summary card plus detail form/link.

## Validation And Error States

| State | Design requirement |
| --- | --- |
| Empty required field | Show which field is missing and what format is expected |
| Invalid format | Give an example of valid input |
| Option unavailable | Explain whether it is permission, expired, already used, or no data |
| Submit failed | Preserve user input and show retry path |
| Partial success | Show completed and failed parts separately |
| Permission denied | Avoid destructive-looking failure; explain access path |
| Stale data | Show update time and refresh or reopen path |

## Post-Action Card States

Every action card should describe what the card becomes after interaction.

- `pending`: actions available, required context visible.
- `accepted`: the click, selection, or form submission was received; controls are locked, but business completion is not implied.
- `processing`: meaningful long-running work is active; show a truthful phase, next expected event, and side-effect boundary.
- `completed`: action area replaced by final status and audit fields.
- `rejected`: final state visible, reason shown.
- `returned`: next owner and required revision visible.
- `failed`: error reason and retry/fallback visible.
- `blocked`: blocker, owner, and recovery path visible.
- `needs_input`: required input and resume action visible.
- `cancelled`: cancellation result and any completed side effects visible.
- `already_processed`: repeated action resolves to the stable existing outcome instead of starting another progress state.
- `expired`: action disabled, history/detail still accessible.

## Action Acceptance And Long-Running Callback States

Separate interaction acceptance from business completion whenever a click can trigger planning, external reads, approval routing, batch work, or another long-running task.

Use this state model as a design overlay:

```text
pending
-> accepted
-> processing
-> completed | failed | blocked | needs_input | cancelled | already_processed
```

Fast actions may move from `accepted` directly to a terminal state. Do not invent a progress state when the operation completes quickly or is blocked before meaningful work begins.

State semantics:

- `accepted` means only that the interaction was received. Use copy such as `Selection received; continuing analysis` or `Request accepted; this card will update when processing finishes`.
- `processing` must name a truthful phase rather than only saying `Please wait`. Show trustworthy completed/total progress when known; otherwise name the activity without a false percentage.
- every `accepted` or `processing` state must lead to a visible terminal state or a `needs_input` state.
- show whether the reader may leave and expect the card to update when the workflow is long enough for that guidance to matter.
- state what has and has not produced side effects. Before confirmation, say that no execution occurs without the click when this is a consequential workflow. After acceptance, do not imply that side effects have happened unless they actually have.

Duplicate-action behavior:

- never turn a repeated click into silence; show `already_processed`, the current processing state, or the stable terminal result.
- do not start a second progress transition for a duplicate event.
- keep the visible outcome consistent with the original action: completed, cancelled, failed, blocked, or still processing.

Clarification-card behavior:

- treat a selection as input for continued understanding or planning, not proof that the selected business action has executed.
- after selection, use an accepted state such as `Selection received; continuing to interpret the request`.
- the next visible state may be another clarification card, an approval card, a result card, or a blocker. Do not promise a result that still depends on planning or approval.

Implementation-owner constraints for the design handoff:

- acknowledge the interaction within the platform response deadline; long work must not block acknowledgement.
- perform delayed card updates only after acknowledgement has completed.
- preserve idempotency and suppress duplicate progress transitions while returning visible duplicate-action feedback.
- avoid card-update or streaming conflicts while an interaction is active.

State these as compatibility or acceptance constraints only. Do not produce queue architecture, event keys, UUID generation, callback payloads, HTTP handling, SDK code, API calls, or sender/update scripts.

## Active Streaming Interaction

Use these rules when the same card is still receiving streaming or repeated component updates:

- Treat generation and callback-driven interaction as separate phases.
- If streaming or long-running work starts from a user action, show `accepted` before process progress; acceptance is not a success result and is not itself a streaming phase.
- During active streaming, expose only low-ambiguity controls such as stop or provide required input when the workflow supports them.
- Do not place approval, destructive confirmation, or a multi-field form inside the active streaming phase.
- Close the streaming phase before enabling feedback, approval, or other interactions whose callback changes the card.
- After completion, replace process controls with final actions, feedback, or audit state.
- For `failed`, `stopped`, `timed_out`, or `blocked`, preserve the latest useful result and show retry, fallback, or detail access when valid.

Specify this transition when relevant:

```text
active_streaming -> finalizing -> streaming_closed -> final_interaction_enabled
```

## Mobile Behavior

- Prefer one full-width primary button when the action is critical.
- Move secondary actions to overflow or below primary action.
- Avoid horizontal rows of many small buttons.
- Stack form fields vertically.
- Keep labels short; move helper text below fields.
- Fold advanced fields unless they are required.

## Interaction Output Shape

When useful, add this compact block:

```markdown
interaction_parameters:
- button_layout:
  - primary_action: approve_request
  - visible_buttons: [approve, reject, return]
  - overflow_actions: [view_history, copy_link]
  - destructive_confirm: reject
  - disabled_after_submit: true
- input_parameters:
  - reject_reason: required_on_reject, multiline, max_length=200
  - approval_comment: optional, max_length=100
- select_parameters:
  - environment: single_select, required, options=[prod, staging], default=staging
  - reviewers: multi_user_picker, optional
- form_layout:
  - field_order: [environment, reviewers, approval_comment]
  - submit_area: primary_submit + cancel
  - post_submit_state: accepted -> processing -> final_locked
- action_state_model:
  - acceptance_copy: request received; processing will continue
  - terminal_states: [completed, failed, blocked, needs_input, cancelled, already_processed]
  - duplicate_action_feedback: show current or final stable state
  - side_effect_boundary: no execution before confirmation; accepted does not imply completion
  - safe_to_leave: state when the card will update without the reader waiting
- validation_states:
  - missing_required: show field-level error
  - stale_data: show refresh action
```
