# Canon

This folder contains the authoritative conceptual source of truth for the Organizational Intelligence Platform.

The canon defines the company's philosophy, product identity, decision rules, required platform capabilities, shared domain language, behavioral workflows, and cognitive model. Together, these documents establish what the company is building and the constraints that future product, architecture, AI, data, research, strategy, MVP, and roadmap work must respect.

## Canon Documents

| Document | Primary Question |
| --- | --- |
| [00_FOUNDERS_THESIS.md](./00_FOUNDERS_THESIS.md) | Why should this company exist? |
| [01_PRODUCT_VISION.md](./01_PRODUCT_VISION.md) | What product must exist? |
| [02_PRODUCT_PRINCIPLES.md](./02_PRODUCT_PRINCIPLES.md) | How should product decisions be made? |
| [03_PRODUCT_CAPABILITY_MODEL.md](./03_PRODUCT_CAPABILITY_MODEL.md) | What abilities must the platform possess? |
| [04_PRODUCT_DOMAIN_MODEL.md](./04_PRODUCT_DOMAIN_MODEL.md) | What concepts exist in the platform universe? |
| [05_PRODUCT_WORKFLOW_MODEL.md](./05_PRODUCT_WORKFLOW_MODEL.md) | How do those concepts behave over time? |
| [06_AI_COGNITIVE_MODEL.md](./06_AI_COGNITIVE_MODEL.md) | How should intelligence think inside the platform? |

## Why the Canon Should Rarely Change

Canon documents are durable premises, not ordinary working documents. They should not change in response to a single customer request, implementation constraint, short-term priority, or market fashion. If they changed frequently, downstream decisions would rest on unstable assumptions and the canon could not function as an authoritative source of truth.

Rare change does not mean permanent immutability. A canonical document may change when the company has learned something important enough to revise a core belief, product commitment, decision rule, required capability, domain concept, workflow, or cognitive principle. Any such change should be deliberate, explicit, and reviewed for its effect on every dependent document.

## Dependency Rule

> Every future design document must explicitly state which canon documents it derives from. Future documents may extend the canon but must never contradict it.

Future documents may make the canon more specific for a user, Domain, system, experiment, release, or time horizon. They may define implementation and sequencing choices that the canon intentionally leaves open. They must preserve the canon's meaning and constraints.

If downstream work appears to conflict with the canon, the conflict must be made explicit. The default response is to revise the downstream proposal. If the company genuinely intends to change a canonical commitment, the relevant canon document should be reviewed first and all dependent work reconsidered.

These seven documents together define the platform's conceptual identity. Later documents should become more specific as they move away from this folder, but they should not become less aligned.

## Canon Governance

[CANON_GOVERNANCE.md](./CANON_GOVERNANCE.md) defines the current Canon version, Semantic Versioning policy, compatibility rules, change process, integrity rules, and traceability requirements for future documents.

Current Canon Version: `v1.0.0`
