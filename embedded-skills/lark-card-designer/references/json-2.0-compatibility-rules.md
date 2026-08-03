# Feishu Card JSON 2.0 Compatibility Rules

Use this file before selecting components, layout details, or style parameters for any design that may be implemented with Feishu Card JSON 2.0. Compatibility is a mandatory design feasibility gate, even though this skill does not generate production JSON.

## Compatibility Contract

- Target Feishu Card JSON 2.0 unless the user explicitly asks to review a legacy card.
- Treat JSON 2.0 as strict: unsupported properties produce errors instead of being ignored.
- Never invent component tags, fields, enum values, Markdown extensions, HTML tags, or CSS properties.
- If exact support has not been verified in the matching official component document, classify it as `needs_official_verification` and provide a conservative fallback.
- Keep design concepts separate from platform tags. Terms such as KPI group, button row, progress bar, funnel, metadata note, step list, and article group describe intent; they are not valid `tag` values by themselves.
- Do not present pseudo-JSON as implementation-ready. Use a conceptual component map for design handoff.
- A valid component tag is necessary but not sufficient. The implementation owner must also verify fields, enum values, nesting, client version, authoring path, resource requirements, and interaction behavior.

## JSON 2.0 Global Structure

When checking an implementation handoff, the real top-level shape is:

```text
card
  schema = 2.0
  config
  card_link
  header
  body
    elements
```

Compatibility rules:

- `schema` must be `2.0` when JSON 2.0 is intended.
- Body components belong under `body.elements`, not root `elements`.
- `header` is a top-level card object, not a body component tag.
- JSON 2.0 supports at most 200 elements/components per card.
- JSON 2.0 requires Feishu/Lark client 7.20 or later; older clients show an upgrade fallback for card content.
- JSON 2.0 currently uses shared-card behavior; do not design around an exclusive per-recipient card state without separate verification.

Do not emit this as production JSON. It is a structure check for the implementation owner.

## Official Body Component Tags

Use only these names as body component tags unless a newer official document is checked during the task.

### Containers

- `column_set`
- `form`
- `interactive_container`
- `collapsible_panel`

### Display

- `div`
- `markdown`
- `img`
- `img_combination`
- `person`
- `person_list`
- `chart`
- `table`
- `hr`

### Interactive

- `input`
- `button`
- `overflow`
- `select_static`
- `multi_select_static`
- `select_person`
- `multi_select_person`
- `date_picker`
- `picker_time`
- `picker_datetime`
- `select_img`
- `checker`

### Conditional Newer Component

- `audio`: official JSON 2.0 component, but JSON-only, client 7.49+, OPUS resource dependent, incompatible with forwarding, and subject to additional send constraints. Use only after reading the audio component document and specifying a text/link fallback.

Nested tags such as `column`, `plain_text`, `lark_md`, `text_tag`, `standard_icon`, `custom_icon`, and `fallback_text` are not interchangeable body components. Use them only in the parent field documented for the selected component.

## Authoring-Path Differences

- The recycling container is visual-builder-only. Do not represent it as a JSON component tag.
- `collapsible_panel`, `select_img`, and `checker` support JSON but not the visual builder.
- `audio` supports JSON but not the visual builder and has additional client and forwarding constraints.
- If the authoring path is unknown, mark these components `conditional` and provide a fallback that works without them.

## Deprecated Or Conceptual Names

Never use these as JSON 2.0 body tags:

- `note`: deprecated in JSON 2.0. Map a metadata note to `div` with notation-sized neutral text, or to concise `markdown`.
- `action`: deprecated in JSON 2.0. Use individual `button` components or `overflow` for secondary actions.
- `collapsible`: use `collapsible_panel` for JSON authoring, or summary plus detail link when the visual builder is required.
- `button_group`: conceptual only. Map to `column_set` + `column` + `button`, or use `overflow` for low-priority actions.
- `form_optional`: conceptual only. Use `form` only when actual input submission is required.
- `chart_or_markdown`, `chart_or_table`, `markdown_or_rich_text`, `markdown_or_note`, `markdown_or_step_list`, `column_set_or_table`, and any other `_or_` tag: choose one real component after evaluating the data shape.
- KPI block, KPI column, step list, progress bar, bullet chart, funnel chart, card footer, and metadata note: conceptual patterns that must map to real components.

## Style And Field Guardrails

- Do not use HTML/CSS layout or styling concepts as card fields: no arbitrary `display`, flexbox, grid, class names, selectors, box shadows, gradients, arbitrary fonts, or free-form border-radius properties.
- Do not assume a shared style object works on every component. Verify each proposed field in that component's official JSON 2.0 document.
- Express unverified visual treatment as intent, such as `compact neutral metadata` or `single semantic risk accent`, rather than guessed field syntax.
- Margin, padding, spacing, border, background, width, color, typography, and responsive fields are component-specific even when names look similar.
- Custom color and custom text-size tokens require card-level style configuration and component support. Prefer official enums and native defaults.
- Inline colored text is supported only through documented text/Markdown paths. Do not infer that links, full rows, or arbitrary nested text accept custom colors.
- A `chart` tag does not guarantee a valid chart. The implementation owner must validate the VChart `chart_spec`; the design output should recommend chart type and decision intent, not fabricate the spec.
- Container nesting is component-specific. Verify the selected parent document instead of assuming every child is valid everywhere.

## Conservative Fallbacks

Use the first fallback that preserves the reader's decision:

| Design need | Preferred verified mapping | Conservative fallback |
| --- | --- | --- |
| KPI group | `column_set` containing `column` + `div` or `markdown` | vertically stacked `div` or `markdown` metrics |
| Metadata note | notation-sized neutral `div` | concise `markdown` |
| Button row | `column_set` containing `button` components | one primary `button`; move secondary links into `overflow` or text links |
| Folded details | `collapsible_panel` for JSON authoring | summary plus detail link or separate detail card |
| Trend/composition/funnel | verified `chart` with validated spec | KPI + delta, bounded `table`, or staged `markdown` list |
| Structured rows | bounded `table` | compact `markdown` list when table support is unsuitable |
| Rich layout | verified `column_set` | vertical stack |
| Unsupported media | verified `img`, `img_combination`, or conditional `audio` | title, description, and source link |
| Unverified interaction | verified `button`, select, input, or form component | read-only content plus explicit detail link or external action path |

## Required Feasibility Output

Every design handoff that may become JSON 2.0 must include:

```markdown
feasibility_check:
- target_schema: Feishu Card JSON 2.0
- authoring_path: json | visual_builder | unknown
- official_components:
- conditional_components:
- conceptual_only_patterns:
- unsupported_or_unverified_requests:
- fallbacks:
- implementation_verification_needed:
```

Classification meanings:

- `official_components`: exact component tags verified in the official JSON 2.0 component set.
- `conditional_components`: official components with client, authoring-path, resource, chart-spec, nesting, forwarding, or interaction constraints.
- `conceptual_only_patterns`: design vocabulary that must be mapped to real components and must never appear as a `tag`.
- `unsupported_or_unverified_requests`: capabilities that are deprecated, unknown, or not checked against the exact official document.
- `implementation_verification_needed`: fields, enum values, nesting, VChart specs, resource keys, callback behavior, client coverage, or real-render behavior that remain the implementation owner's responsibility.

## Compatibility Fail Conditions

Fail the design handoff when any of these occur:

- an invented or deprecated name is presented as a JSON 2.0 `tag`
- pseudo-JSON uses `schema: json_2_0_like`
- body components are shown under root `elements`
- a component is called compatible only because its conceptual name sounds plausible
- arbitrary CSS-like styles or unverified fields are prescribed
- a conditional component has no stated condition or fallback
- exact field syntax is asserted without checking the matching official document
- the design claims sendability, validation success, or production compatibility without implementation verification

## Official Local Sources

For exact checks, read only the relevant files under `docs/raw/`:

- `feishu-cards__card-json-v2-structure.md`
- `feishu-cards__card-json-v2-breaking-changes-release-notes.md`
- `feishu-cards__card-json-v2-components__component-json-v2-overview.md`
- the matching component document for every conditional or field-level claim
