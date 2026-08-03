# Atomic Design Constraints

Use this file when the output needs design handoff constraints, not only high-level card style. Keep constraints scoped to the components used in the proposed card.

Atomic constraints are design intents unless the exact field has been verified for the selected JSON 2.0 component. Do not translate generic visual language into guessed fields or CSS-like syntax.

## Constraint Layers

| Layer | Constraints | Use when |
| --- | --- | --- |
| Typography | text size, text weight, text alignment, line count | hierarchy or mobile readability matters |
| Color | header template, inline text color, tag color, icon color, verified component border/background intent | status, risk, trend, or priority needs visual encoding |
| Spacing | `hr`, verified margin/padding/spacing fields, section grouping, `collapsible_panel` boundary | the card has multiple modules or dense data |
| Data display | table columns, column width priority, data type, sort key, empty state | rows/columns drive comprehension or action |
| Interaction | primary/secondary/destructive button, disabled state, confirm copy | user action changes state |
| Metadata | period, source, update time, owner, audit trail, confidence | data needs trust, traceability, or compliance |
| Responsive | desktop/mobile priority, vertical stacking, folded details | content may be wide or dense |

## Color Policy

Start from neutral. Add color only when a specific semantic job exists.

- `none`: choose when the card is informational, archival, or already clear through structure.
- `header_only`: choose when the whole card has one status, such as pending approval, failed, recovered, or completed.
- `tags_only`: choose when rows or items have multiple statuses.
- `inline_only`: choose when 1 to 3 short fragments need local emphasis.
- `header_plus_tags`: choose for operational dashboards with one overall status and several row/item statuses.
- Avoid `header_plus_tags_plus_inline` unless there is a strong reason; it often becomes visually loud.

## Inline Text Color

Use inline color as micro-emphasis, not as a layout system.

- Use for short semantic fragments: status words, risk words, deltas, abnormal values, target gaps, approval result.
- Prefer one inline color family per sentence or row.
- Pair color with explicit text. Do not rely on color alone.
- Do not color full paragraphs. Use tags, key numbers, or section status instead.
- Do not attempt to customize link text color; links should keep platform behavior.
- Prefer Feishu color enums for consistency. Use RGBA custom colors only when brand or accessibility requirements justify it.
- Omit inline color when bold text, a tag, or the surrounding sentence is sufficient.

Design handoff hints:

- `markdown`: use the documented inline font-color syntax only for short fragments after checking the exact official syntax.
- Plain text component: use `text_color` when the whole text element has one semantic state.
- Tags: use `text_tag` or option tags when the colored item is a status or category.
- Table cells: prefer `options`, `lark_md`, or `markdown` data types for colored/status content instead of coloring a whole row.

Verify the exact text path before naming field syntax. Nested `plain_text`/`lark_md` tags and `markdown` body components have different capabilities.

Recommended mapping:

| Meaning | Inline color intent | Example fragment |
| --- | --- | --- |
| Positive delta, recovered, approved | green | `+12%`, `已恢复`, `已批准` |
| Severe risk, rejected, failed | red | `-18%`, `拒绝`, `断货` |
| Pending, warning, near threshold | orange/yellow | `待审批`, `库存预警` |
| Neutral info, running, analysis | blue/cyan | `分析中`, `执行中` |
| Historical, disabled, secondary | gray | `已归档`, `历史记录` |

## Tags

Use tags for compact classification.

- Status tags: `高风险`, `待审批`, `已完成`, `已过期`.
- Priority tags: `P0`, `P1`, `必读`, `可选`.
- Object tags: `SKU`, `商机`, `权限`, `发布`.
- Keep tag text short. Long explanations belong in `markdown`; secondary metadata belongs in notation-sized `div` or concise `markdown`.
- Use tag color from semantic state. Do not invent decorative tag palettes.

## Typography

- Use larger or stronger text only for the conclusion, card title, or key number.
- Use small or notation-level text for source, update time, audit IDs, limitations, and secondary notes.
- Avoid using multiple text sizes in the same small module.
- If a text block is likely to wrap on mobile, shorten it or split it into label/value rows.

## Spacing And Dividers

- Use dividers between modules with different decisions: summary, metrics, actions, evidence, audit.
- Avoid dividers inside a tightly related metric group.
- For JSON authoring, use verified `collapsible_panel` boundaries for raw evidence, old history, logs, and long rows; otherwise use a detail link or separate detail card.
- If the first screen feels crowded, reduce competing modules before reducing required context.
- Use `hr` when naming the JSON 2.0 divider component. Do not prescribe CSS borders, shadows, gradients, or generic border-radius values.
- Margin, padding, background, border, width, and spacing support must be verified on the selected component; similar field names are not universal.

## Table Constraints

Specify table constraints when rows are central:

- primary_key: row identity such as SKU, customer, approval ID, article title
- visible_columns: columns shown on first screen
- folded_columns: columns moved to detail, note, or source table
- sort_key: risk, delta, priority, amount, update time
- row_limit: default visible row count
- data_type: text, lark_md, markdown, options, number, persons, date
- status_column: field that drives tag or color

Avoid deleting context just to fit width. Prefer vertical stacking, folded columns, or links to source.

## Button And State Constraints

Specify these for action cards:

- primary_action: the intended next action
- secondary_actions: alternatives that do not compete with primary action
- destructive_action: action that requires confirmation
- disabled_state: how the button changes after completion, expiry, or rejection
- confirmation_copy: short copy for irreversible or high-risk actions
- callback_payload_hint: semantic intent fields only; do not specify implementation code or callback schema

## Fallback Constraints

Specify fallback behavior when the chosen component may not render well everywhere:

- long_text_fallback: fold, split, or link to source
- mobile_fallback: vertical stack, reduce visible columns, or show summary row
- unsupported_component_fallback: replace with markdown/list/table
- missing_media_fallback: show text title and source link
- stale_data_fallback: show update time and refresh action

## Design Constraint Output Shape

When useful, add this compact block:

```markdown
design_constraints:
- typography: title=plain_text/heading, body=normal, metadata=notation
- color_policy: header_plus_tags
- color_tokens: header=orange, tag_risk=red
- inline_text_color: omit unless a short delta/status fragment is critical
- tags: risk=red, pending=orange, archive=neutral
- table_columns: visible=[name,status,delta,owner], folded=[id,raw_update_time]
- buttons: primary=approve, secondary=[reject,return], disabled_after=final_state
- responsive_behavior: stack secondary fields on mobile; fold raw evidence
- compatibility: exact fields and enum values require matching JSON 2.0 component verification
```

For deeper button, input, select, and form constraints, use `interaction-parameters.md`.
