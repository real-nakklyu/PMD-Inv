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
