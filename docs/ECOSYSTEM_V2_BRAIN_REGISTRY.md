# Ecosystem v2 — Global Brain Registry

> **Single source of truth for Brain ownership.** Before adding intelligence, check this registry.  
> If two Brains would own the same fact, stop and redesign.  
> Constitution: [[ECOSYSTEM_V2]] · Inventory (code map): [[ECOSYSTEM_V2_INVENTORY]] · Events: [[ECOSYSTEM_V2_EVENTS]] · ADR: [[ADR-ECO-001-brain-engine-constitution]] · FYH procurement: [[FYH_PURCHASE_ROADMAP]]

**Statuses:** `PLANNED` · `PARTIAL` · `LIVE` · `DEPRECATED`

**Owner Engine:** Which Engine primarily *feeds* this Brain. Cross-engine Brains list `ecosystem` (no single business owner).

**Reads:** Other Brains’ **public APIs / subscribed events** only — never their databases.

When adding a Brain: append a registry entry here **before** writing code. When retiring one: set Status `DEPRECATED` and point successors — never delete history.

---

## Index

| Brain | Owner Engine | Version | Status |
|-------|--------------|---------|--------|
| Owner Brain | Owner OS / ecosystem | 0.3 | PARTIAL |
| Finance Brain | ecosystem | 0.1 | PLANNED |
| Personal Finance Brain | ecosystem | 0.2 | PARTIAL |
| Customer Brain | ecosystem | 0.1 | PLANNED |
| Investment Brain | ecosystem | 0.1 | PLANNED |
| Health Brain | ecosystem | 1.0 | LIVE (Ecosystem Baseline v1 frozen 2026-08-05) |
| Property Brain | Awesome PG | 0.2 | PARTIAL |
| Room Brain | Awesome PG | 0.1 | PARTIAL |
| Bed Brain | Awesome PG | 1.0 | LIVE |
| Resident Brain | Awesome PG | 0.2 | PARTIAL |
| Electricity Brain | Awesome PG | 0.2 | PARTIAL |
| Operations Brain | Awesome PG | 0.2 | PARTIAL |
| Employee Brain | ecosystem / Workforce | 0.2 | PARTIAL |
| Purchase Brain | FYH Salon | 0.1 | PARTIAL |
| Salon Brain | FYH Salon | 0.1 | PLANNED |
| Vehicle Brain | Automotive Capital | 0.1 | PLANNED |

---

## Employee Brain

- **Brain name:** Employee Brain  
- **Owner Engine:** ecosystem (Workforce Engine; Phase 1 storage in FYH DB)  
- **Owns (SSOT):** Employee profile · engine memberships · ranks/job roles · permissions · schedule · attendance foundation · salary fields · commission pointers · incentives · audit · login identity (mobile)  
- **Reads:** Engine operational events (appointments, sales) for KPIs (future)  
- **Publishes:** `employee.created` · `employee.updated` · `employee.role.changed` · `employee.salary.changed` · `employee.permission.changed` · `employee.login` · `employee.logout` · `employee.deleted` · `employee.schedule.updated` · `employee.attendance.*` · `employee.commission.changed` · `employee.incentive.created` · `employee.finance.contribution` · `employee.appointment.roster_refreshed` · `employee.customer.capacity` · `employee.health.self_check`  
- **Subscribes:** (future) leave · payroll settled  
- **Public API:** `getEmployee` · `listEmployeesForEngine` · `getEmployeeDashboard` · `resolvePermissions` · connectors under `src/workforce/connectors/`  
- **Version:** 0.2  
- **Status:** PARTIAL *(`src/workforce/` — Phases 1–5)*  

*Not Customer Brain. Not Salon `fyh_staff` SSOT. Does not mutate Health Brain (Baseline v1 frozen).*

---

## Owner Brain

- **Brain name:** Owner Brain  
- **Owner Engine:** Owner OS (`owner.awesomepg.in`) / ecosystem  
- **Owns (SSOT):** Cross-business attention · life KPIs composition · “how is my life doing?” answers · Owner Dashboard projections  
- **Reads:** Personal Finance Brain · Finance Brain · Operations Brain · Health Brain · Investment Brain · (all business Brains via events)  
- **Publishes:** `owner.attention.changed` · `owner.health.scored` (future)  
- **Subscribes:** Finance / Investment / Operations / Health / Customer summary events  
- **Public API:** `getOwnerOsSnapshot()` · `getOwnerLifeDashboard()` · `getNetWorthSummary()` · `getAttentionQueue()` (future) · `askOwner(question)` (future)  
- **Version:** 0.3  
- **Status:** PARTIAL *(`src/owner/` Engine + `src/personalFinance/` Brain)*  

*Owner OS is an independent Engine (separate DB/auth/host). Personal Finance Brain remains at `src/personalFinance/` and is consumed, not duplicated.*

---

## Finance Brain

- **Brain name:** Finance Brain  
- **Owner Engine:** ecosystem  
- **Owns (SSOT):** Ecosystem income · expenses · P&L · cashflow · margins · assets · liabilities · net worth · taxes (agg) · loans (agg) · ROI (agg) · forecasts · recurring revenue · business contribution · financial health  
- **Reads:** Engine money events only (does not own Engine ledger writers)  
- **Publishes:** `finance.net_worth.updated` · `finance.cashflow.updated` · `finance.contribution.updated`  
- **Subscribes:** `rent.paid` · `deposit.*` · `salon.invoice.paid` · `vehicle.sold` · `vehicle.cost.recorded` · future Personal Finance Engine events  
- **Public API:** `getCashflow(range)` · `getBusinessContribution()` · `getNetWorth()` · `explainFinance(ref)`  
- **Version:** 0.1  
- **Status:** PLANNED  

*Engine-local SSOTs (PG RFE, Capital TVI, Salon ledger) are **not** this Brain. Personal Finance Brain currently composes contribution buckets via public getters until this Brain is LIVE.*

---

## Personal Finance Brain

- **Brain name:** Personal Finance Brain  
- **Owner Engine:** ecosystem  
- **Owns (SSOT):** Owner personal income mix · household/personal expenses · emergency fund · liquidity · financial freedom progress · personal projected wealth · explainable life metrics  
- **Reads:** Engine public finance APIs (PG / Salon / Capital) · Employee Workforce finance connector · (future) Finance Brain events  
- **Publishes:** `personal_finance.position.updated` (future)  
- **Subscribes:** Finance / Investment events · future Personal Finance Engine events  
- **Public API:** `getPersonalFinanceSnapshot()` · `explainMetric()` · `getPersonalPosition()` (alias) · `getFreedomProgress()` (via FI %)  
- **Version:** 0.2  
- **Status:** PARTIAL *(`src/personalFinance/`)*  

*Does not mutate Health Brain. Does not duplicate rent / TVI / salon paid-revenue math.*

---

## Customer Brain

- **Brain name:** Customer Brain  
- **Owner Engine:** ecosystem  
- **Owns (SSOT):** Universal person identity · cross-engine LTV · retention · risk · linked roles (resident / salon client / vehicle buyer)  
- **Reads:** Resident / Salon / Vehicle identity link events  
- **Publishes:** `customer.identity.linked` · `customer.ltv.recalculated`  
- **Subscribes:** Check-in/out · salon visit/pay · vehicle buy/sell identity events  
- **Public API:** `getCustomer(id)` · `getLifetimeValue(id)` · `linkIdentity(...)`  
- **Version:** 0.1  
- **Status:** PLANNED  

*Shared-knowledge example: LTV must not be duplicated in PG or Salon Engines.*

---

## Investment Brain

- **Brain name:** Investment Brain  
- **Owner Engine:** ecosystem  
- **Owns (SSOT):** Portfolio view across property · vehicles · securities · crypto · gold · businesses · diversification · portfolio risk  
- **Reads:** Finance Brain · Property Brain · Vehicle Brain  
- **Publishes:** `investment.portfolio.updated` · `investment.roi.updated`  
- **Subscribes:** `vehicle.*` · property ROI events · future market Engines  
- **Public API:** `getPortfolio()` · `getInvestmentRoi(id)`  
- **Version:** 0.1  
- **Status:** PLANNED  

---

## Health Brain

- **Brain name:** Health Brain  
- **Owner Engine:** ecosystem  
- **Owns (SSOT):** Production Guardian · deployment score · regression incidents · critical-path monitors (login, booking, payments, uploads, APIs)  
- **Reads:** Engine health probes · cert / stability outputs (as events)  
- **Publishes:** `health.incident.opened` · `health.incident.resolved` · `deployment.score.recorded`  
- **Subscribes:** Probe failures · deploy completions · cert failures  
- **Public API:** `getSystemHealth()` · `getDeploymentScore()` · `listIncidents()`  
- **Version:** 1.0  
- **Status:** LIVE *(Ecosystem Baseline v1 frozen 2026-08-05 — Health Score = 100 gate; integrity + repair engine + durable history)*  

---

## Property Brain

- **Brain name:** Property Brain  
- **Owner Engine:** Awesome PG  
- **Owns (SSOT):** Per-property occupancy · revenue · expenses (property-scoped) · electricity rollup · maintenance · bookings rollup · forecast · property ROI · property health  
- **Reads:** Room Brain · Bed Brain · Electricity Brain · Finance Brain (contribution events)  
- **Publishes:** `property.index.rebuilt` · `property.kpi.updated`  
- **Subscribes:** Room/bed/electricity/rent/deposit property-scoped events  
- **Public API:** `loadPropertyIndex(pgId)` · `getPropertyKpis(pgId)` · `getPropertyHealth(pgId)`  
- **Version:** 0.2  
- **Status:** PARTIAL *(Room OS PropertyProjector / `property-os/v1`)*  

---

## Room Brain

- **Brain name:** Room Brain  
- **Owner Engine:** Awesome PG  
- **Owns (SSOT):** Occupancy (room) · room revenue · electricity timeline · maintenance · cleaning · room timeline · profitability · predicted vacancy  
- **Reads:** Resident Brain · Bed Brain · Electricity Brain · Finance Brain (room-scoped events)  
- **Publishes:** `room.occupied` · `room.vacated` · `room.electricity.generated` · `room.health.updated`  
- **Subscribes:** `resident.checked_in` · `resident.checked_out` · bed assignment · meter/bill events  
- **Public API:** `getRoomState(roomId)` · `getRoomRevenue(roomId)` · `getRoomHealth(roomId)`  
- **Version:** 0.1  
- **Status:** PARTIAL *(composed today; not a first-class module)*  

---

## Bed Brain

- **Brain name:** Bed Brain  
- **Owner Engine:** Awesome PG  
- **Owns (SSOT):** Bed availability · current resident pointer · future booking · notice · bed revenue slice · cleaning · utilisation · BookingContext value object  
- **Reads:** Occupancy ledgers via Engine writers’ projections · Resident Brain pointers  
- **Publishes:** `bed.occupied` · `bed.vacated` · `bed.notice.set` (via Room OS rebuild chain)  
- **Subscribes:** Booking / reservation / vacating / notice Engine events  
- **Public API:** `loadBed(bedId)` / `buildBedBrainSnapshot` · `getBedUtilisation(bedId)`  
- **Version:** 1.0  
- **Status:** LIVE *(`src/roomOs/engines/occupancy/`, `room-os/v1/loadBed`)*  

---

## Resident Brain

- **Brain name:** Resident Brain  
- **Owner Engine:** Awesome PG  
- **Owns (SSOT):** Per-resident stay intelligence · payments/invoices view · electricity · extensions · complaints · KYC status · behaviour · communication history · resident LTV (PG-scoped until Customer Brain) · risk  
- **Reads:** Finance events (PG) · Electricity Brain · Bed Brain · Customer Brain (when live)  
- **Publishes:** `resident.checked_in` · `resident.checked_out` · `resident.payment.recorded` · `resident.risk.updated`  
- **Subscribes:** Rent/deposit/electricity/KYC/extension Engine events  
- **Public API:** `getResidentSummary(customerId)` · `getBookingFinancialSummary(bookingId)` *(today via RFE bridge)*  
- **Version:** 0.2  
- **Status:** PARTIAL  

*Cross-engine LTV migrates to Customer Brain; Resident Brain keeps stay-scoped facts.*

---

## Electricity Brain

- **Brain name:** Electricity Brain  
- **Owner Engine:** Awesome PG  
- **Owns (SSOT):** Meter continuity · consumption projections · predictions · abnormality · shared bill allocation intelligence · usage forecasts  
- **Reads:** Room Brain · Property Brain  
- **Publishes:** `electricity.reading.recorded` · `electricity.bill.projected` · `electricity.anomaly.detected`  
- **Subscribes:** Meter log / bill generate Engine events  
- **Public API:** `loadRoomShared(roomId)` · `getMeterContinuity(...)` · `getUsageForecast(...)`  
- **Version:** 0.2  
- **Status:** PARTIAL *(`src/roomOs/engines/electricity/` + Engine writers)*  

---

## Operations Brain

- **Brain name:** Operations Brain  
- **Owner Engine:** Awesome PG *(becomes ecosystem when Salon/Capital ops join)*  
- **Owns (SSOT):** Pending approvals · refunds · move-outs · extensions · collections queue · KYC queue · tasks · SLA · escalations  
- **Reads:** Property / Resident / Finance / Health attention signals  
- **Publishes:** `operations.task.opened` · `operations.task.resolved` · `operations.sla.breached`  
- **Subscribes:** Proof submitted · KYC · vacating · refund · health incident events  
- **Public API:** `getWorkQueue(pgId)` · `getAttentionItems()`  
- **Version:** 0.2  
- **Status:** PARTIAL *(WorkQueue / Ops Centre; flag-gated)*  

---

## Purchase Brain

- **Brain name:** Purchase Brain  
- **Owner Engine:** FYH Salon  
- **Owns (SSOT):** Purchase records · vendor payables · purchase explain · outstanding-by-vendor projections  
- **Reads:** Vendor master (`fyh_vendors`) · Product catalog · Stock movement ledger (read-only)  
- **Publishes:** `salon.purchase.recorded` · `salon.vendor.payable.opened` *(stub → Owner OS / Finance Brain)*  
- **Subscribes:** (future) `salon.vendor.payment.allocated`  
- **Public API:** `listPurchases` · `getPurchase` · `getVendorOutstanding` · `explainPurchase`  
- **Version:** 0.1  
- **Status:** PARTIAL *(Phase 2 — see [[FYH_PURCHASE_ROADMAP]])*  

*Purchase Engine writes; Purchase Brain projects. Legacy PO/GRN tables are DEPRECATED.*

---

## Salon Brain

- **Brain name:** Salon Brain  
- **Owner Engine:** FYH Salon  
- **Owns (SSOT):** Retention · commission intelligence · stylist performance · salon revenue projections · inventory health · membership health · appointment trends  
- **Reads:** Customer Brain · Finance Brain · Employee Brain (roster)  
- **Publishes:** `salon.performance.updated` · `salon.membership.health.updated`  
- **Subscribes:** `salon.invoice.paid` · appointment / commission Engine events  
- **Public API:** `getSalonPerformance()` · `getStylistScore(id)` · `getMembershipHealth()`  
- **Version:** 0.1  
- **Status:** PLANNED *(intelligence still inside Salon Engine)*  

---

## Vehicle Brain

- **Brain name:** Vehicle Brain  
- **Owner Engine:** Automotive Capital  
- **Owns (SSOT):** Per-vehicle purchase · repair · holding cost · expected profit · vehicle ROI · timeline · investment linkage  
- **Reads:** Finance Brain · Investment Brain · Customer Brain (buyer)  
- **Publishes:** `vehicle.state.updated` · `vehicle.roi.updated`  
- **Subscribes:** `vehicle.purchased` · `vehicle.sold` · `vehicle.cost.recorded`  
- **Public API:** `getVehicleState(id)` · `getHoldingCost(id)` · `getExpectedProfit(id)`  
- **Version:** 0.1  
- **Status:** PLANNED *(intelligence still inside Capital Engine)*  

---

## Registry maintenance rules

1. **One owner for each fact** — if a new feature’s SSOT is unclear, update this registry before coding.  
2. **Shared-knowledge** that multiple Engines need → ecosystem Brain (`Customer`, `Finance`, …), not Engine-local copy.  
3. **Code paths** for LIVE/PARTIAL Brains are listed in [[ECOSYSTEM_V2_INVENTORY]]; this registry owns *responsibility*, inventory owns *location*.  
4. **Version bump** when public API or ownership changes.  
5. **Never delete** entries — deprecate and supersede.
