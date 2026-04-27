export const floridaRegions = [
  "Miami",
  "Fort Myers",
  "Sarasota",
  "Tampa",
  "Orlando",
  "Gainesville",
  "Jacksonville",
  "Tallahassee",
  "Destin"
] as const;

export const equipmentStatuses = ["available", "assigned", "return_in_progress", "in_repair", "retired"] as const;
export const equipmentTypes = ["power_wheelchair", "scooter"] as const;
export const returnStatuses = [
  "requested",
  "scheduled",
  "pickup_pending",
  "in_transit",
  "received",
  "inspected",
  "restocked",
  "closed",
  "cancelled"
] as const;
export const ticketStatuses = ["open", "scheduled", "waiting_parts", "in_progress", "resolved", "closed", "cancelled"] as const;

export type FloridaRegion = (typeof floridaRegions)[number];
export type EquipmentStatus = (typeof equipmentStatuses)[number];
export type EquipmentType = (typeof equipmentTypes)[number];
export type ReturnStatus = (typeof returnStatuses)[number];
export type TicketStatus = (typeof ticketStatuses)[number];

export type Equipment = {
  id: string;
  equipment_type: EquipmentType;
  make: string;
  model: string;
  serial_number: string;
  bought_price: number;
  status: EquipmentStatus;
  region: FloridaRegion;
  added_at: string;
  assigned_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EquipmentPage = {
  items: Equipment[];
  total: number;
  limit: number;
  offset: number;
};

export type Patient = {
  id: string;
  full_name: string;
  date_of_birth: string;
  region: FloridaRegion;
  created_at: string;
  updated_at: string;
};

export type Assignment = {
  id: string;
  equipment_id: string;
  patient_id: string;
  region: FloridaRegion;
  status: "active" | "return_in_progress" | "ended";
  assigned_at: string;
  ended_at: string | null;
  notes: string | null;
  patients?: Pick<Patient, "full_name" | "date_of_birth" | "region"> | null;
  equipment?: Pick<Equipment, "serial_number" | "make" | "model" | "equipment_type" | "status"> | null;
};

export type ReturnRecord = {
  id: string;
  equipment_id: string;
  patient_id: string;
  assignment_id: string | null;
  status: ReturnStatus;
  requested_at: string;
  scheduled_at: string | null;
  received_at: string | null;
  closed_at: string | null;
  pickup_address: string | null;
  notes: string | null;
  patients?: Pick<Patient, "full_name" | "date_of_birth" | "region"> | null;
  equipment?: Pick<Equipment, "serial_number" | "make" | "model" | "equipment_type" | "status"> | null;
};

export type ServiceTicket = {
  id: string;
  ticket_number?: string | null;
  equipment_id: string;
  patient_id: string | null;
  assignment_id: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  status: TicketStatus;
  issue_description: string;
  repair_notes: string | null;
  repair_completed: boolean;
  opened_at: string;
  updated_status_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  patients?: Pick<Patient, "full_name" | "date_of_birth" | "region"> | null;
  equipment?: Pick<Equipment, "serial_number" | "make" | "model" | "equipment_type" | "status"> | null;
  service_ticket_updates?: Array<{ id: string; note: string; status: TicketStatus | null; created_at: string }>;
};

export type DashboardSummary = {
  total_equipment: number;
  available: number;
  assigned: number;
  in_returns_process: number;
  in_repair: number;
  retired: number;
  open_service_tickets: number;
  active_returns: number;
  overdue_returns: number;
  completed_repairs: number;
  tickets_opened_this_month: number;
  equipment_by_region: Array<{ region: FloridaRegion; count: number }>;
  equipment_by_type: Array<{ type: EquipmentType; count: number }>;
  zero_available: Array<{ region: FloridaRegion; type: EquipmentType }>;
  recent_activity: Array<{ id: string; event_type: string; message: string; created_at: string }>;
};

export type DashboardUtilization = {
  active_fleet: number;
  assigned: number;
  available: number;
  in_repair: number;
  active_returns: number;
  utilization_rate: number;
  repair_drag_rate: number;
  return_drag_rate: number;
  open_ticket_equipment: number;
  idle_over_30_days: number;
  top_idle: Array<Pick<Equipment, "id" | "serial_number" | "make" | "model" | "region" | "equipment_type"> & { idle_days: number }>;
  by_region_type: Array<{
    region: FloridaRegion;
    equipment_type: EquipmentType;
    total: number;
    assigned: number;
    available: number;
    in_repair: number;
    return_in_progress: number;
    utilization_rate: number;
  }>;
};

export type DataQualityIssue = {
  id: string;
  kind: "missing_cost" | "assignment_mismatch" | "return_mismatch" | "repair_mismatch";
  severity: NotificationSeverity;
  title: string;
  detail: string;
  region: FloridaRegion | null;
  href: string;
};

export type DataQualityResponse = {
  issues: DataQualityIssue[];
  counts: {
    total: number;
    critical: number;
    warning: number;
    info: number;
  };
  generated_at: string;
};

export type ActivityLog = {
  id: string;
  event_type: string;
  actor_id: string | null;
  equipment_id: string | null;
  patient_id: string | null;
  assignment_id: string | null;
  return_id: string | null;
  service_ticket_id: string | null;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type EquipmentMovementType =
  | "received_into_inventory"
  | "warehouse_to_driver"
  | "driver_to_patient"
  | "patient_to_return"
  | "return_to_warehouse"
  | "warehouse_to_repair"
  | "repair_to_warehouse"
  | "region_transfer"
  | "manual_adjustment"
  | "retired";

export type EquipmentLocationType =
  | "warehouse"
  | "driver"
  | "patient"
  | "repair"
  | "return_in_transit"
  | "retired"
  | "unknown";

export type EquipmentMovement = {
  id: string;
  equipment_id: string;
  movement_type: EquipmentMovementType;
  from_location_type: EquipmentLocationType;
  from_location_label: string | null;
  from_region: FloridaRegion | null;
  to_location_type: EquipmentLocationType;
  to_location_label: string | null;
  to_region: FloridaRegion | null;
  patient_id: string | null;
  assignment_id: string | null;
  return_id: string | null;
  appointment_id: string | null;
  service_ticket_id: string | null;
  moved_at: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  patients?: Pick<Patient, "full_name" | "date_of_birth" | "region"> | null;
  equipment?: Pick<Equipment, "serial_number" | "make" | "model" | "equipment_type" | "status" | "region"> | null;
};

export type MaintenanceTaskStatus = "due" | "scheduled" | "completed" | "skipped" | "cancelled";
export type MaintenanceTaskType =
  | "battery_check"
  | "charger_check"
  | "safety_inspection"
  | "cleaning_sanitization"
  | "tire_brake_check"
  | "annual_pm"
  | "other";

export type PreventiveMaintenanceTask = {
  id: string;
  equipment_id: string;
  service_ticket_id: string | null;
  task_type: MaintenanceTaskType;
  status: MaintenanceTaskStatus;
  priority: "low" | "medium" | "high" | "urgent";
  due_at: string;
  scheduled_at: string | null;
  completed_at: string | null;
  odometer_hours: number | null;
  battery_voltage: number | null;
  notes: string | null;
  completion_notes: string | null;
  created_by: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
  equipment?: Pick<Equipment, "serial_number" | "make" | "model" | "equipment_type" | "status" | "region"> | null;
  service_tickets?: Pick<ServiceTicket, "ticket_number" | "status" | "priority"> | null;
};

export type EquipmentCostEventType =
  | "purchase"
  | "repair_parts"
  | "repair_labor"
  | "transport"
  | "maintenance"
  | "warranty_credit"
  | "adjustment";

export type EquipmentCostEvent = {
  id: string;
  equipment_id: string;
  service_ticket_id: string | null;
  maintenance_task_id: string | null;
  event_type: EquipmentCostEventType;
  amount: number;
  vendor: string | null;
  invoice_number: string | null;
  occurred_at: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  equipment?: Pick<Equipment, "serial_number" | "make" | "model" | "equipment_type" | "status" | "region"> | null;
  service_tickets?: Pick<ServiceTicket, "ticket_number" | "status" | "priority"> | null;
};

export type EquipmentDetailData = {
  equipment: Equipment;
  assignments: Array<Assignment & { patients?: Pick<Patient, "full_name" | "date_of_birth" | "region"> }>;
  returns: Array<ReturnRecord & { patients?: Pick<Patient, "full_name" | "date_of_birth" | "region"> }>;
  service_tickets: Array<ServiceTicket & { service_ticket_updates?: Array<{ id: string; note: string; status: TicketStatus | null; created_at: string }> }>;
  activity: ActivityLog[];
  movements?: EquipmentMovement[];
  maintenance?: PreventiveMaintenanceTask[];
  cost_events?: EquipmentCostEvent[];
  repair_count: number;
};

export type PatientDetailData = {
  patient: Patient;
  assignments: Array<Assignment & { equipment?: Pick<Equipment, "serial_number" | "make" | "model" | "equipment_type" | "status" | "region"> }>;
  returns: Array<ReturnRecord & { equipment?: Pick<Equipment, "serial_number" | "make" | "model" | "equipment_type" | "status" | "region"> }>;
  service_tickets: Array<ServiceTicket & { equipment?: Pick<Equipment, "serial_number" | "make" | "model" | "equipment_type" | "status" | "region"> }>;
  activity: ActivityLog[];
};

export type ReturnInspection = {
  id: string;
  return_id: string;
  equipment_id: string;
  cleaned: boolean;
  sanitized: boolean;
  battery_tested: boolean;
  charger_verified: boolean;
  damage_found: boolean;
  repair_ticket_created: boolean;
  approved_for_restock: boolean;
  notes: string | null;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StaffRole = "admin" | "dispatcher" | "technician" | "viewer";

export type Profile = {
  id: string;
  full_name: string;
  role: StaffRole;
  created_at: string;
  updated_at: string;
};

export type ProfileMe = {
  auth_user: { id: string; email: string | null };
  profile: Profile | null;
  needs_profile: boolean;
  can_bootstrap_admin: boolean;
  access_request: StaffAccessRequest | null;
};

export type StaffAccessRequest = {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  requested_role: StaffRole;
  message: string | null;
  status: "pending" | "approved" | "denied";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AppointmentKind = "delivery" | "pickup" | "service" | "return" | "inspection";
export type AppointmentStatus = "scheduled" | "in_progress" | "completed" | "cancelled" | "no_show";

export type OperationalAppointment = {
  id: string;
  kind: AppointmentKind;
  status: AppointmentStatus;
  region: FloridaRegion;
  scheduled_start: string;
  scheduled_end: string | null;
  patient_id: string | null;
  equipment_id: string | null;
  return_id: string | null;
  service_ticket_id: string | null;
  assigned_to: string | null;
  driver_name: string | null;
  title: string;
  location_note: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  patients?: Pick<Patient, "full_name" | "date_of_birth" | "region"> | null;
  equipment?: Pick<Equipment, "serial_number" | "make" | "model" | "equipment_type" | "status"> | null;
};

export type AvailabilitySummaryItem = {
  region: FloridaRegion;
  equipment_type: EquipmentType;
  available: number;
  total: number;
  minimum_available: number;
  shortage: number;
  threshold_id: string | null;
  notes: string | null;
};

export type AvailabilityTransferRecommendation = {
  equipment_type: EquipmentType;
  from_region: FloridaRegion;
  to_region: FloridaRegion;
  quantity: number;
  source_equipment: Array<Pick<Equipment, "id" | "serial_number" | "make" | "model">>;
  source_available: number;
  source_minimum: number;
  destination_available: number;
  destination_minimum: number;
  destination_shortage: number;
  reason: string;
};

export type AvailabilityProcurementNeed = {
  region: FloridaRegion;
  equipment_type: EquipmentType;
  quantity: number;
  available: number;
  minimum_available: number;
  reason: string;
};

export type AvailabilityRecommendations = {
  transfers: AvailabilityTransferRecommendation[];
  procurement_needs: AvailabilityProcurementNeed[];
  shortage_count: number;
  healthy_count: number;
};

export type SavedView = {
  id: string;
  user_id: string;
  page: "inventory" | "assigned" | "returns" | "service_tickets" | "patients" | "schedule" | "reports";
  name: string;
  filters: Record<string, unknown>;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type DeliverySetupChecklist = {
  id: string;
  appointment_id: string | null;
  assignment_id: string | null;
  equipment_id: string;
  patient_id: string;
  region: FloridaRegion;
  delivered: boolean;
  setup_completed: boolean;
  patient_or_caregiver_instructed: boolean;
  safe_operation_reviewed: boolean;
  troubleshooting_reviewed: boolean;
  cleaning_reviewed: boolean;
  maintenance_reviewed: boolean;
  charger_confirmed: boolean;
  battery_charged: boolean;
  documents_left: boolean;
  signature_name: string | null;
  signature_data_url: string | null;
  signed_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationSeverity = "critical" | "warning" | "info";

export type AttentionNotification = {
  id: string;
  kind:
    | "staff_access"
    | "overdue_return"
    | "return_inspection"
    | "return_restock"
    | "service_ticket"
    | "equipment_repair"
    | "message";
  severity: NotificationSeverity;
  title: string;
  message: string;
  href: string;
  action_label: string;
  created_at: string;
};

export type NotificationsResponse = {
  items: AttentionNotification[];
  counts: {
    total: number;
    critical: number;
    warning: number;
    info: number;
  };
};

export type WorkQueueItem = {
  id: string;
  kind: "return" | "service_ticket" | "repair_exception" | "maintenance";
  severity: NotificationSeverity;
  title: string;
  entity_label: string;
  detail: string;
  href: string;
  age_days: number;
  created_at: string;
};

export type WorkQueueResponse = {
  items: WorkQueueItem[];
  counts: {
    total: number;
    critical: number;
    warning: number;
    info: number;
  };
  generated_at: string;
};

export type GlobalSearchResult = {
  id: string;
  kind: "equipment" | "patient" | "service_ticket" | "return" | "assignment" | "appointment";
  title: string;
  subtitle: string;
  href: string;
  metadata: Record<string, unknown>;
};

export type GlobalSearchResponse = {
  query: string;
  results: GlobalSearchResult[];
};

export type HandoffNoteType = "dispatch" | "driver" | "repair" | "inventory" | "admin";
export type HandoffNoteStatus = "open" | "resolved" | "archived";

export type HandoffNote = {
  id: string;
  note_type: HandoffNoteType;
  status: HandoffNoteStatus;
  priority: "low" | "medium" | "high" | "urgent";
  region: FloridaRegion | null;
  title: string;
  body: string;
  context_label: string | null;
  equipment_id: string | null;
  patient_id: string | null;
  appointment_id: string | null;
  service_ticket_id: string | null;
  created_by: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Pick<Profile, "full_name" | "role"> | null;
  equipment?: Pick<Equipment, "serial_number" | "make" | "model" | "status" | "region"> | null;
  patients?: Pick<Patient, "full_name" | "date_of_birth" | "region"> | null;
};

export type MessageStaffMember = Pick<Profile, "id" | "full_name" | "role"> & {
  is_me: boolean;
};

export type MessageThreadMember = {
  id: string;
  thread_id: string;
  user_id: string;
  last_read_at: string | null;
  created_at: string;
  profile: Pick<Profile, "id" | "full_name" | "role"> | null;
};

export type MessageAttachment = {
  id: string;
  message_id: string;
  bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
};

export type StaffMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sender: Pick<Profile, "id" | "full_name" | "role"> | null;
  attachments: MessageAttachment[];
  is_mine: boolean;
};

export type MessageThread = {
  id: string;
  thread_type: "direct" | "group";
  title: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  members: MessageThreadMember[];
  latest_message: StaffMessage | null;
  unread_count: number;
};
