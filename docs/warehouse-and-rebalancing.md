# Warehouse Mode And Rebalancing

PMDInv adds warehouse operations at `/warehouse` and upgraded availability intelligence at `/availability`.

## Migration

Run this SQL in Supabase SQL Editor before using the full warehouse controls:

```sql
supabase/014_warehouse_mode.sql
```

The app deploys safely before the migration is installed. Until the migration is run, `/warehouse` shows a fallback view of available inventory and displays a migration notice.

## Warehouse Mode

Warehouse Mode supports:

- bulk receiving by scanned or pasted serial numbers
- bin and shelf location tracking
- condition grading
- readiness status tracking
- cycle counts by region/bin/shelf
- redeploy checklist approval
- movement ledger entries for received units
- audit activity for warehouse receiving, cycle counts, and redeploy checklist completion

Condition grades:

- `new`
- `ready`
- `good`
- `fair`
- `needs_repair`
- `hold`
- `retired`

Readiness statuses:

- `ready`
- `needs_cleaning`
- `needs_battery`
- `needs_repair`
- `hold`
- `retired`

## Advanced Availability / Rebalancing

Availability now considers:

- ready available units
- warehouse hold / not-ready units
- idle available units over 30 days
- threshold shortages
- 30-day assignment demand as a simple forecast signal
- exact equipment recommendations for transfers
- bin/shelf and idle-day details when warehouse profiles exist

Transfer recommendations only use ready-for-redeploy equipment when warehouse readiness data is available.

## Operator Notes

- Use bulk receiving when equipment physically enters a warehouse or store location.
- Use cycle count after scanning all items in a region/bin/shelf area.
- Use redeploy checklist before making returned or repaired equipment available again.
- Use availability transfer links to open the exact equipment item with movement fields prefilled.
