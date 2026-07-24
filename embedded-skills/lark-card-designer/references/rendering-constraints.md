# Rendering Constraints

Use this file to keep designs compatible with Feishu/Lark card realities. It is a design constraint file, not an API manual.

## Basis

- Default to Feishu card JSON 2.0-style structure for new designs.
- Use structure sketches only to show hierarchy and component intent.
- Do not claim structure sketches are production-sendable or implementation-ready.
- Mention JSON 1.0 only when reviewing older cards or compatibility.
- Use CardKit concepts when the design needs card entity lifecycle, partial update, streaming text updates, template variables, or reusable card content.

## Structure Sketch Boundary

A structure sketch may include:

- `config` placeholders
- `header` with title and status color intent
- `elements` showing markdown, column set, table, chart, buttons, notes, or collapsible sections
- comments or placeholder values explaining intent

A structure sketch must not include:

- credentials, tokens, webhook URLs, app IDs, secrets
- complete send-message envelope
- callback handler implementation
- production validation guarantees
- field-level implementation schemas
- generated business IDs pretending to be real

Always label sketches: "Design handoff sketch only, not production-sendable Feishu JSON."

## Markdown And Rich Text

- Use Markdown/rich text for conclusions, short descriptions, and grouped bullets.
- Avoid Markdown pipe tables for structured data; prefer native table.
- Keep paragraphs short. Long explanations should be folded or linked.
- Use links for details that do not need to be read inside the card.
- For inline colored text, use rich text or `lark_md` color syntax only for short semantic fragments.
- For whole plain text elements, use `text_color` only when the entire element has one semantic state.
- Use `text_tag` or table option tags when the colored content is a status/category, not prose.
- Link text color should follow platform behavior; do not design custom link colors.

## Color Implementation Notes

- Feishu card color fields support official color enums; some fields also support configured RGBA custom colors.
- Do not specify a color field when the design does not need semantic color.
- Rich text / Markdown can express inline colored text with font color syntax.
- Plain text components can use `text_color` when `tag` is `plain_text`.
- Table columns can carry status through option tags or markdown-capable data types.
- Icons can carry color, but icon color should reinforce state instead of adding decoration.
- Custom RGBA colors require style configuration and should be treated as implementation detail, not default design output.

## Tables

- Prefer native table for rows/columns.
- Bound the first-screen row count.
- Include units, period, sorting, and status fields.
- Split very wide tables by priority or link to the source table.

## Charts

- Recommend chart type and intent, not full chart JSON by default.
- Explain why chart beats KPI/table for this case.
- Avoid decorative charts without a decision question.

## Images And Media

- Use image components only when visual recognition matters.
- Do not rely on images for critical text.
- Note that downstream delivery may need image upload or an `image_key`.

## Interactions

- Buttons should map to explicit user intent: approve, reject, return, view, refresh, feedback.
- Select/input/form components are for parameters, not decoration.
- For approval and destructive actions, specify confirmation and post-action lock state.
- For feedback loops, define how feedback changes future triage, even if implementation is out of scope.

## Streaming And Partial Updates

- Use one primary plain-text or rich-text region for typewriter-style output.
- Use component-level updates for steps, charts, button state, or feedback rather than streaming unstable structured content.
- Keep update ordering and active-interaction conflicts visible as implementation handoff constraints.
- Treat shared multi-update behavior, timeout, forwarding restrictions, final closure, content limits, and client fallback as compatibility concerns.
- Do not include sequence values, API payloads, callback code, or streaming parameter tuning in normal design output.
- Read `streaming-card-rules.md` for the full design decision and state-transition model.

## Long Content

- First screen should answer the user's question.
- Fold raw data, logs, appendices, old history, and extended evidence.
- If content exceeds a single readable card, recommend splitting into summary card plus detail card or link.

## Official Docs

When exact syntax or field constraints matter, consult `docs/INDEX.md` and the matching raw official document. Default design work should not load all raw docs.
