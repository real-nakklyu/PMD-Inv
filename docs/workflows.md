# Workflow Notes

## Inventory

Inventory records can be created from the Inventory page. Serial numbers support manual entry and mobile camera scanning. Duplicate serials are blocked by the API and the database unique index.

## Assignments

Assignments must start from available equipment. Creating an assignment:

- creates an `assignments` row
- records the assignment timestamp
- marks the equipment `assigned`
- logs `patient_assigned`

Equipment with an active assignment cannot be assigned again.

## Returns

Returns are explicit workflows. An operator starts a return from an active assignment or assigned equipment. The return can then move through the normalized states:

`requested -> scheduled -> pickup_pending -> in_transit -> received -> inspected -> restocked -> closed`

The API rejects invalid jumps. Closing before the unit is received is blocked. Restocking or closing moves equipment back to available and ends the assignment.

## Service Tickets

Service tickets can be opened for any equipment and optionally linked to a patient. Updating a ticket writes a service update note. Completed repairs require repair notes, and repair counts are derived from completed resolved or closed tickets.

## Activity

The Activity page reads `activity_logs`. Important events are recorded for assignment, returns, ticket creation, status changes, and completed repairs.
