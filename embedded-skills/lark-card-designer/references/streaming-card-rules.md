# Streaming Card Rules

Use this file when a Feishu/Lark card will reveal AI-generated text over time, expose meaningful progress for a long-running task, update tool or step state, or transition from a running process to a stable result.

These are scenario overlay rules. Do not create a separate `streaming_card` pattern. Apply them to `progress_card` while work is active, then transition to the appropriate result pattern when work completes.

## Use Streaming Only When It Helps

Use streaming when one or more conditions apply:

- the response takes long enough that visible progress reduces uncertainty
- partial text is useful before the full answer is ready
- multiple tools or steps have meaningful state changes
- the same task should remain in one continuously updated card
- the reader may need to understand a blocker, timeout, or waiting state

Avoid streaming when the result is fast, static, approval-only, or when intermediate progress has no user value. Do not add a typewriter effect only to make a card feel dynamic.

## Update Mode Selection

| Update mode | Design use | Suitable content |
| --- | --- | --- |
| `text_streaming` | Progressive AI or long-text output | One primary verified `markdown` or `div` region, subject to authoring-path support |
| `component_partial_update` | State changes without rebuilding the whole layout | Step status, tool-result summary, chart, feedback state |
| `full_replace` | Major information-architecture transition | Running process to final report or completed result |
| `hybrid` | Text first, then component updates and final replacement | Multi-step agent tasks and AI-assisted workflows |

Prefer the smallest update mode that preserves context and layout stability. Do not repeatedly replace the full card for minor progress changes.

## State Model

Use only states that the reader can understand and that change what the card should show:

```text
queued
-> generating
-> tool_running
-> waiting_for_input
-> finalizing
-> completed

exception states:
failed
stopped
timed_out
blocked
```

For each used state, define the visible label, latest useful result, next expected event, and available action. Do not expose hidden model reasoning or chain-of-thought as a state or progress log.

## Stable Layout

Keep these regions stable during active streaming:

1. Header: task identity, current state, start or update time.
2. Primary streaming region: one main text area with a clear content role.
3. Process summary: recent steps and concise tool-result summaries.
4. Interaction area: stop, retry, provide input, or feedback only when valid for the current state.
5. Metadata: source, update time, duration, limitation, failure, or fallback note when relevant.

Avoid multiple competing streaming text regions. Fold historical steps, raw tool output, and long logs. Reserve stable dimensions or content boundaries so updates do not cause repeated full-card layout jumps.

## Interaction And Finalization

- Keep complex forms, approvals, and irreversible actions out of the active streaming phase.
- Treat active streaming and callback-driven interaction as separate phases in the design handoff.
- When a user action starts a long process, confirm `accepted` before entering the progress or streaming phase. `Accepted` means the input was received, not that the work succeeded.
- Enter a progress or streaming state only after the workflow has actually begun meaningful long-running work; a quick blocker or clarification should transition directly to its appropriate state.
- Close the streaming phase before enabling interactions whose callback changes the card.
- On completion, remove generating language, show a stable summary, and expose final actions or feedback.
- Ensure the final message-preview summary no longer implies that generation is active.
- If the final content is a report, analysis, digest, alert, or approval, transition to that pattern instead of preserving a process-first layout.
- Define `failed`, `stopped`, `timed_out`, and `blocked` states with a retry, fallback, or next-step path.

Streaming controls the generation process, not the final information architecture.

## CardKit-Aware Handoff Constraints

Mention these only as compatibility constraints for the implementation owner:

- text streaming is suited to one verified `markdown` or `div` content region
- builder-based cards may restrict text streaming to the `markdown` component; implementation owners should confirm the selected authoring path and exact CardKit capability
- component-level partial updates can continue for state, chart, action, or feedback changes
- updates must preserve ordering and should not compete with an active user interaction
- delayed updates begin only after the interaction acknowledgement; the implementation owner must satisfy the platform response deadline without blocking on long work
- active streaming uses shared multi-update behavior rather than an exclusive-card model
- active streaming cards cannot be forwarded until the streaming phase is closed
- streaming can time out and must finish in a stable final state
- content volume and client compatibility need a fallback plan

Do not output API payloads, sequence values, callback code, streaming frequency parameters, or production JSON. If exact capability behavior is under review, state the compatibility constraint and hand implementation choices to the implementation owner.

## Conditional Output

When streaming is relevant, append this block to the structured decision:

```markdown
streaming_design:
- use_streaming:
- reason:
- update_mode:
- stable_regions:
- streaming_region:
- state_model:
- progress_visibility:
- interaction_policy:
- final_pattern:
- finalization_behavior:
- timeout_or_failure:
- fallback:
- implementation_constraints:
```

## Red Lines

- Do not stream short content solely for visual effect.
- Do not stream multiple main text regions at the same time.
- Do not expose raw tool logs, hidden reasoning, or chain-of-thought as progress.
- Do not stream unstable tables or charts row by row.
- Do not let progress updates repeatedly reorder the whole card.
- Do not leave the completed card in `generating` or another process-only state.
- Do not omit stopped, failed, timed-out, blocked, retry, and fallback behavior when those states are possible.
- Do not place complex approval or form workflows inside an active streaming phase.
