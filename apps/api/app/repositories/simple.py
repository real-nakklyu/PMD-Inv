from app.repositories.base import SupabaseRepository


class PatientRepository(SupabaseRepository):
    table_name = "patients"


class AssignmentRepository(SupabaseRepository):
    table_name = "assignments"


class ReturnRepository(SupabaseRepository):
    table_name = "returns"


class ServiceTicketRepository(SupabaseRepository):
    table_name = "service_tickets"


class ActivityRepository(SupabaseRepository):
    table_name = "activity_logs"


class AppointmentRepository(SupabaseRepository):
    table_name = "operational_appointments"


class AvailabilityThresholdRepository(SupabaseRepository):
    table_name = "availability_thresholds"


class SavedViewRepository(SupabaseRepository):
    table_name = "saved_views"


class DeliverySetupChecklistRepository(SupabaseRepository):
    table_name = "delivery_setup_checklists"


class EquipmentMovementRepository(SupabaseRepository):
    table_name = "equipment_movements"


class PreventiveMaintenanceRepository(SupabaseRepository):
    table_name = "preventive_maintenance_tasks"


class EquipmentCostEventRepository(SupabaseRepository):
    table_name = "equipment_cost_events"


class HandoffNoteRepository(SupabaseRepository):
    table_name = "handoff_notes"


class WarehouseInventoryRepository(SupabaseRepository):
    table_name = "warehouse_inventory_profiles"


class WarehouseCycleCountSessionRepository(SupabaseRepository):
    table_name = "warehouse_cycle_count_sessions"


class WarehouseCycleCountItemRepository(SupabaseRepository):
    table_name = "warehouse_cycle_count_items"


class WarehouseRedeployChecklistRepository(SupabaseRepository):
    table_name = "warehouse_redeploy_checklists"
