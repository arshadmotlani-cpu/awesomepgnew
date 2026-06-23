# Before screenshots (H10)

No PNG captures were taken before the H10 pass. The **before** state is described in [`../h10-resident-consistency.md`](../h10-resident-consistency.md) (Before → After summary table).

## Representative before behavior

1. **Site header “Profile”** opened `SimpleAccountHub` — dark glass UI with Profile / My Stay / Payments / Invoices tabs, not the resident hub.
2. **Resident hub** required knowing `?section=resident` — most residents never saw the 9-tab shell from the header.
3. **Mobile bottom nav** labeled the room tab “Profile” and omitted Payments.
4. **Payments tab** showed `ResidentPaymentsHub` and repeated full rent/electricity HTML tables below it.
5. **20+ dead components** remained in the repo from abandoned v1/v2 account redesigns.

To reproduce before UI locally: `git checkout 7208a8a~1 -- app/(customer)/account/profile/page.tsx src/components/customer/account/ResidentHubShell.tsx` (not recommended — use git history for reference only).
