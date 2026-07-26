# Financial Truth — KPI Reconciliation

Generated: 2026-07-26T10:54:32.364Z
SSOT: Capital Reset Rebuild investment math
Month window: 2026-07-01 → 2026-07-31
Post-reset clean portfolio: YES

## Active Capital

Formula: Σ current_investment_paise on open inventory (not Me stakes)

| Vehicle | Current Investment (stored) | Current Investment (recomputed) |
|---|---:|---:|
| 2021 MG hector  | ₹0 | ₹0 |
| 2022 Tata Harrier half half  | ₹0 | ₹0 |
| 2021 MG Hector 9291 | ₹0 | ₹0 |
| 2012 Fiat lenia | ₹0 | ₹0 |
| 2021 Tata harrier | ₹0 | ₹0 |
| **Sum** | **₹0** | **₹0** |

- sumActiveCapitalPaise: ₹0
- sumMyActiveInvestedCapitalPaise (alias): ₹0
- Overview Active Capital: ₹0
- Reports activeCapitalPaise: ₹0

## Lifetime Profit (entitled)

Formula: Σ my_share_paise (status ≠ cancelled, share not null) + Σ manual my_share

| Vehicle | My Profit |
|---|---:|
| **Sum** | **₹0** |

- Overview Lifetime Profit: ₹0
- Reports profitEarnedPaise: ₹0

## Monthly Profit (2026-07)

| Vehicle / Manual | My Profit |
|---|---:|
| **Sum** | **₹0** |

- Overview periodProfitPaise: ₹0
- Reports monthlyProfitPaise: ₹0

## ROI (My portfolio)

- Numerator (My Lifetime Profit): ₹0
- Denominator base: ₹0
- myCapitalAll (sumMyInvestedCapitalPaise): ₹0
- sold Current Investment sum: ₹0
- Computed myRoiBps: 0 (0.0%)
- Overview roiBps: 0

## Vehicles in Stock

| Vehicle | Status |
|---|---|
| 2021 MG hector  | ready |
| 2022 Tata Harrier half half  | ready |
| 2021 MG Hector 9291 | ready |
| 2012 Fiat lenia | ready |
| 2021 Tata harrier | ready |
| **Count** | **5** |

- countOpenInventory: 5
- Overview activeVehicles: 5
- Reports assetsInStock: 5
- Vehicles page total: 5

## Vehicles Sold

Definition: status in (sold, settled) — not Me-stake filtered

| Vehicle | Status | Current Investment |
|---|---|---:|
| **Count** | | **0** |

- Overview shared.vehiclesSold: 0
- Overview business.vehiclesSold: 0
- Overview mine.vehiclesSold (legacy field): 0
- Reports assetsSold: 0

## Legacy KPIs (must stay zero)

- Reports capitalOutstandingPaise: ₹0

## Financial child tables

- ac_seller_payments: 0
- ac_vehicle_costs: 0
- ac_manual_profits: 0
