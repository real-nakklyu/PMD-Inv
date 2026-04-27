# Admin Data Correction Center

PMDInv includes an admin-only correction console at `/corrections`.

Use it for controlled fixes when operational history is correct enough to preserve, but the current record state needs repair. It is intentionally separate from normal workflow pages so day-to-day dispatch, service, and inventory screens stay simple.

## Available Corrections

- End an active assignment and set the equipment to `available`, `return_in_progress`, `in_repair`, or `retired`.
- Correct an equipment region and optionally sync the active assignment or active patient region.
- Retire equipment without hard-deleting workflow history.
- Restore retired or archived equipment to `available` or `in_repair`.
- Reconcile equipment from the latest movement ledger entry.
- Merge duplicate patients by moving related assignments, returns, service tickets, appointments, handoffs, delivery checklists, movement rows, and activity history to the target patient.

## Audit Behavior

Every correction writes an `activity_logs` row with:

- the acting admin
- affected equipment, patient, or assignment IDs
- a human-readable message
- a correction type
- the admin note
- before/after change metadata where available

This keeps corrections visible in the normal Activity feed and in equipment/patient timelines.

## Safety Notes

- Only `admin` users can call correction APIs.
- Patient merges archive the duplicate source patient instead of hard-deleting it.
- Retiring equipment ends active assignments but preserves assignment history.
- Region correction creates a movement ledger entry when the movement table is available.
- Normal patient search excludes archived/merged patients.
