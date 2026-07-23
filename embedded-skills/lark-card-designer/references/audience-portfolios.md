# Audience Portfolios

Use this file to adapt one data set into different card styles. The audience changes the first screen, density, components, and action model.

## Management

- Goal: decide whether the business is healthy, risky, or needs intervention.
- First screen: one-sentence conclusion, 3 to 5 KPI, top risk, decision point.
- Density: low to medium. Hide raw details behind collapsible panels or links.
- Components: header, short markdown, KPI columns, small trend/chart, risk note, optional action button.
- Must include: period, scope, unit, source/update time when metrics are used.
- Avoid: long tables, implementation logs, full row-level evidence on the first screen.

## Business Operations

- Goal: understand performance, anomalies, owners, and next actions.
- First screen: KPI health, trend/change, anomaly list, owner/action.
- Density: medium. More rows are acceptable if bounded.
- Components: KPI columns, chart, Top-N table, native table, collapsible detail, refresh/detail button.
- Must include: owner, due date or follow-up path for operational issues.
- Avoid: management-only abstraction that hides the object needing work.

## Frontline Execution

- Goal: know what to do now and avoid mistakes.
- First screen: object, action, deadline, risk, enabled primary button.
- Density: low. Make the action area visually and structurally obvious.
- Components: action/approval layout, button, select/input/form, status note, audit footer.
- Must include: object identity, requester/owner, deadline, current state, consequences.
- Avoid: burying the action after long analysis; asking the user to copy text instead of using controls.

## Retrospective Analysis

- Goal: explain what happened, why, impact, and what changes next.
- First screen: conclusion, evidence baseline, impact summary, next action.
- Density: medium to high, but evidence should be staged.
- Components: markdown conclusion, comparison chart, evidence table, collapsible raw data, action table.
- Must include: baseline, period, data source, confidence or limitation when relevant.
- Avoid: decorative charts without a question; conclusions without evidence.

## Knowledge Or News

- Goal: decide what to read, keep, forward, or ignore.
- First screen: topic, priority, must-read items, why it matters.
- Density: medium. Each item should be short and source-backed.
- Components: categorized list, rich text/markdown, tags, link buttons, optional image, feedback buttons.
- Must include: title, source, publish time or collection time, summary, priority.
- Avoid: pasting full article bodies or losing source attribution.

## Fallback Audience Inference

- Daily or weekly report without audience: infer business operations.
- Approval, confirmation, release, purchase, permission: infer frontline execution.
- "老板", "管理层", "汇报", "决策": infer management.
- "复盘", "原因", "为什么", "证据": infer retrospective analysis.
- "文章", "blog", "资讯", "研究": infer knowledge or news.
