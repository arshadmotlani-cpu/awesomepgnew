# Salon Software — Product & Brand Terminology

**Single source of truth** for how we name the company, product, and reference salon in architecture docs and System Map visuals.  
**Does not** require renaming code, database tables, routes, or legacy filenames (`FYHAIR-*`, `fyh_*`, `hair`, `foryourhair`).

| Label | Correct term | Meaning |
|-------|----------------|---------|
| **COMPANY** | **For Your Technologies** | The technology company (monorepo / FYTECH ecosystem label) |
| **PRODUCT** | **Salon Software** | The software we build and will sell or provide to many salon customers |
| **REFERENCE CUSTOMER / SALON** | **FYHAIR** | A real salon business (For Your Hair) — first tenant and reference implementation |

## Two implementations (do not conflate)

| Phrase | Meaning |
|--------|---------|
| **FYHAIR existing implementation** | What runs today for the FYHAIR org on the Hair host and Hair DB (`fyh_*`, `wf_*`) |
| **Salon Software target SaaS product** | Multi-tenant architecture: many **organizations** on one product, with strict isolation |

## Target architecture hierarchy

```text
For Your Technologies
    ↓
Salon Software
    ↓
Organization
    ↓
Location(s)
    ↓
Users / Roles / Permissions
    ↓
Salon configuration
    ↓
Salon operational data
```

## Multi-tenant mental model (correct)

```text
For Your Technologies
        ↓
Salon Software
        ↓
┌───────────────┬───────────────┬───────────────┐
│ FYHAIR        │ Salon B       │ Salon C       │
│ Reference     │ Future tenant │ Future tenant │
│ salon         │               │               │
└───────────────┴───────────────┴───────────────┘
```

**Wrong:** treating FYHAIR as the product name or drawing “FYHAIR → Salon A / B / C” as if FYHAIR were the SaaS platform.

## Legacy identifiers (still valid in code)

- Paths: `src/hair`, `app/(hair)/fyh`, `foryourhair`
- Tables: `fyh_*`, `wf_*`
- Flags: `FYH_SAAS_TENANT`, `HAIR_DATABASE_URL`
- Marketing URLs may still say SOFT / For Your Hair — that is **salon brand**, not the product name.

## Related docs

- [`FYHAIR-CORE-PRODUCT-MODEL.md`](./FYHAIR-CORE-PRODUCT-MODEL.md)
- [`FYHAIR-SALON-BRAIN.md`](./FYHAIR-SALON-BRAIN.md) — product brain (filename is historical)
- Interactive map: `/system-map` on Hair host
