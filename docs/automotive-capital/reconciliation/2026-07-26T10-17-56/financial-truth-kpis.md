# Financial Truth — KPI Reconciliation

Generated: 2026-07-26T10:18:10.463Z
Month window: 2026-07-01 → 2026-07-31

## Active Capital

Formula: Σ Me invested_paise on open inventory

| Vehicle | Me Stake |
|---|---:|
| 2022 Tata Harrier half half  | ₹6,83,000 |
| 2021 MG Hector 9291 | ₹9,60,000 |
| 2012 Fiat lenia | ₹1,30,000 |
| 2021 Tata harrier | ₹10,90,000 |
| **Sum** | **₹28,63,000** |

- sumMyActiveInvestedCapitalPaise: ₹28,63,000
- Overview Active Capital: ₹28,63,000
- Reports activeCapitalPaise: ₹28,63,000

## Lifetime Profit (entitled)

Formula: Σ my_share_paise (status ≠ cancelled, share not null) + Σ manual my_share

| Vehicle | My Profit |
|---|---:|
| 2021 MG hector  | ₹55,695 |
| 2024 Acceptance S5-Fleet-1 ACCEPTANCE_1785059176137 | ₹20,000 |
| 2021 Tata Harrier | ₹80,000 |
| 2024 Acceptance S5-Fleet-2 ACCEPTANCE_1785059176137 | ₹40,000 |
| 2020 MG Hector Plus | ₹80,000 |
| 2022 Tata Harrier | ₹80,000 |
| 2023 Tata Harrier | ₹80,000 |
| 2022 MG Astor | ₹80,000 |
| 2021 MG Hector | ₹80,000 |
| 2024 Acceptance S4-Sell ACCEPTANCE_1785059176137 | ₹50,000 |
| manual:new (2026-07-26) | ₹1,00,000 |
| **Sum** | **₹7,45,695** |

- Overview Lifetime Profit: ₹7,45,695
- Reports profitEarnedPaise: ₹7,45,695

## Monthly Profit (2026-07)

| Vehicle / Manual | My Profit |
|---|---:|
| 2021 MG hector  (sale set) | ₹55,695 |
| 2024 Acceptance S5-Fleet-1 ACCEPTANCE_1785059176137 (sale set) | ₹20,000 |
| 2024 Acceptance S5-Fleet-2 ACCEPTANCE_1785059176137 (sale set) | ₹40,000 |
| 2024 Acceptance S4-Sell ACCEPTANCE_1785059176137 (sale set) | ₹50,000 |
| manual:new (2026-07-26) | ₹1,00,000 |
| **Sum** | **₹2,65,695** |

- Overview periodProfitPaise: ₹2,65,695
- Reports monthlyProfitPaise: ₹2,65,695

## ROI (My portfolio)

- Numerator (My Lifetime Profit): ₹7,45,695
- Denominator (Me stakes non-cancelled, fallback sold TVI): ₹74,40,000
- myCapitalAll (sumMyInvestedCapitalPaise): ₹74,40,000
- sold TVI sum: ₹80,27,000
- Computed myRoiBps: 1002 (10.0%)
- Overview roiBps: 1002

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

## Vehicles Sold (Dashboard mine SSOT)

Definition: status in (sold, settled) AND Me invested_paise > 0

| Vehicle | Status | Me Stake |
|---|---|---:|
| 2021 MG hector  | sold | ₹4,77,000 |
| 2024 Acceptance S5-Fleet-1 ACCEPTANCE_1785059176137 | settled | ₹1,00,000 |
| 2021 Tata Harrier | settled | ₹5,50,000 |
| 2024 Acceptance S5-Fleet-2 ACCEPTANCE_1785059176137 | settled | ₹2,00,000 |
| 2020 MG Hector Plus | settled | ₹5,50,000 |
| 2022 Tata Harrier | settled | ₹5,50,000 |
| 2023 Tata Harrier | settled | ₹5,50,000 |
| 2022 MG Astor | settled | ₹5,50,000 |
| 2021 MG Hector | settled | ₹5,50,000 |
| 2024 Acceptance S4-Sell ACCEPTANCE_1785059176137 | settled | ₹5,00,000 |
| **Count** | | **10** |

- Overview soldVehicles: undefined
- Reports assetsSold: 10
- Business sold/settled (all): 10
