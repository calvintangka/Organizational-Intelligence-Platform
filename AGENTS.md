# Repository agent instructions

## OIP source of truth

For OIP product, website, product UI, UX, branding, frontend design, motion, or visual review, read `docs/OIP_CODEX_DESIGN_CONSTITUTION.md` first. It is the authoritative human-reviewed product/design source unless explicitly superseded by a newer approved document. Do not define OIP from generic AI/SaaS assumptions: OIP centers on evidence-backed Organizational Memory and Organizational Intelligence, not ticketing, generic RAG, chatbots, or AI agents themselves.

## Required OIP skills

For substantial OIP design work, use these skills in order:

1. `oip-product-truth` — establish product truth, current/future boundaries, objects, audience, decision, and governance before significant product, UX, IA, positioning, or design decisions.
2. `oip-design-director` — define the design brief and explore, critique, and select multiple materially different directions before major visual implementation.
3. `oip-anti-slop` — review the selected direction before approval; apply the OIP swap test and require product-specific meaning. Gradients, cards, indigo, and animation are not inherently forbidden; judge whether they are intentional and communicate OIP.
4. `oip-visual-qa` — after implementation, run rendered visual inspection, screenshots, critique/fix/compare, responsive review, and accessibility review. A passing build is not sufficient design evidence.

## Product boundaries

- A first-time public-site visitor must understand what OIP does in the first viewport, in plain language; metaphor, manifesto, animation, abstract AI imagery, and vague headlines cannot substitute for product proof.
- Derive design from OIP concepts such as Source, Evidence, Organizational Memory, provenance, scope, validation, trust, Challenges, versions, retrieval, Organizational Intelligence, human governance, agent consumption, and governed action. Do not visualize generic “AI” when product behavior can be shown.
- Organizational Memory is evidence-backed and governed; Source is not automatically accepted Memory; knowledge evolves through outcomes, Challenges, and versions; trust is evidence rather than model confidence; AI may propose, while humans and policy govern authority and action. Agents consume/contribute to shared Memory; organizational learning remains the center.
- Keep current product foundation, product direction, and future vision distinct. Do not present future capabilities as shipped functionality.

## Design workflow and resources

For major frontend/design work:

`Product Truth → Design Direction → Anti-Slop Review → Implementation → Rendered Visual QA`

Use Figma for editable design exploration/source, Codex Browser for rendered inspection and screenshots, and Context7 for current technical documentation. Use Chrome DevTools and Playwright when available; their absence must not block work when the core Figma/Browser workflow is available.

shadcn, Motion Primitives, and Watermelon UI are resources, not OIP design systems, and are `EVALUATE_BEFORE_ADOPTION`. Do not install or adopt them automatically. Use Motion Primitives only for meaningful product behavior. Before adopting Watermelon UI, evaluate its official identity/source, framework compatibility, accessibility, licensing, maintenance, flexibility, dependency/runtime impact, and generic/template risk. External resources must not define OIP’s visual identity.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## OIP change-safety harness

For every bug fix, feature, refactor, or behavior change:

1. Before modifying code, use Graphify to identify the affected symbol/concept, its direct callers, callees, dependencies, and nearby regression probes.
2. Establish the expected blast radius before editing. Do not modify unrelated files merely because they appear in search results.
3. Prefer the smallest repair that fixes the root cause while preserving existing verified behavior.
4. Identify and run the most relevant existing regression probes for the affected behavior and its direct dependencies.
5. After code changes, run `graphify update .` before final verification.
6. Re-check the changed symbol or concept with Graphify and confirm that no unexpected dependency or architectural relationship was introduced.
7. Do not consider the task complete while any targeted regression, affected regression, build, or required verification fails.
8. If a repair creates a new regression, investigate the shared root cause instead of stacking another narrow workaround on top of the previous fix.