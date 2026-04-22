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
