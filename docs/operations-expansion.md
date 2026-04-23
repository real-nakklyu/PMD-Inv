# PMDInv Operations Expansion

This expansion adds professional operations features for daily Florida DME workflows.

## New Modules

### Schedule

The Schedule page coordinates:

- deliveries
- pickups
- service calls
- return appointments
- restock inspections

Appointments can be linked to a patient and equipment record. Operators can filter by Florida region and update appointment status directly from the board.

### Availability Rules

The Availability page lets admins define minimum on-hand targets by region and equipment type.

This avoids noisy "zero available" alerts in regions where zero units may be normal, while still highlighting real shortages where the business expects stock.

### Saved Views

Inventory users can save commonly used filter combinations such as:

- Tampa available scooters
- In-repair power wheelchairs
- Jacksonville assigned units

Saved views are user-specific.

### QR Equipment Labels

Equipment detail pages now include printable QR labels. The QR code opens the equipment record directly, making field lookups faster than typing serial numbers.

### Attachments

The app already supports Supabase Storage attachments. This expansion widens supported use cases:

- service ticket photos and documents
- equipment damage photos
- return pickup documents
- delivery/setup documentation

## Database Migration

Run this migration in Supabase SQL Editor before using the new modules:

```sql
supabase/004_operations_expansion.sql
supabase/005_delivery_labels_audit.sql
```

It creates:

- `operational_appointments`
- `availability_thresholds`
- `saved_views`
- `delivery_setup_checklists`
- RLS policies for each new table
- activity event types for appointment, threshold, patient-edit, and delivery/setup changes

## Delivery / Setup Checklist

Delivery appointments can capture setup documentation with:

- equipment delivered
- setup completed
- patient/caregiver instruction
- safe operation review
- troubleshooting review
- cleaning and maintenance review
- charger and battery checks
- documents left with patient
- signer name
- browser-drawn signature

The signature is stored with the checklist record as a data URL. For higher-volume production use, this can later be moved to Supabase Storage as an image file while keeping the same checklist table.

## Batch QR Labels

The QR Labels page supports filtered batch printing by:

- region
- equipment type
- equipment status
- serial/make/model search

Each printed label includes the QR code, serial number, make/model, region, type, and status.

## Before / After Audit Diffs

Activity logs now support `metadata.changes`, shaped as:

```json
{
  "changes": {
    "status": {
      "before": "open",
      "after": "closed"
    }
  }
}
```

The Activity page and equipment/patient timelines render these diffs for easier operational review.

## Roles

- `admin`: manage thresholds, appointments, saved views, and all existing workflows
- `dispatcher`: manage appointments, assignments, returns, and saved views
- `technician`: manage service appointments and service workflows
- `viewer`: read-only access

## Operational Notes

- Return workflow status rules remain strict because physical custody steps matter.
- Service ticket status changes remain flexible because repair administration often needs direct correction.
- Availability thresholds are intentionally configurable so normal business shortages do not look like visual errors.

## Future Enhancements

- driver/staff assignment calendars
- route grouping by region
- signature capture for delivery/setup
- QR label batch printing
- Sentry or Vercel Observability for production error monitoring
