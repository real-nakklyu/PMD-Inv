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

export type EquipmentDetailData = {
  equipment: Equipment;
  assignments: Array<Assignment & { patients?: Pick<Patient, "full_name" | "date_of_birth" | "region"> }>;
  returns: Array<ReturnRecord & { patients?: Pick<Patient, "full_name" | "date_of_birth" | "region"> }>;
  service_tickets: Array<ServiceTicket & { service_ticket_updates?: Array<{ id: string; note: string; status: TicketStatus | null; created_at: string }> }>;
  activity: ActivityLog[];
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

export type NotificationSeverity = "critical" | "warning" | "info";

export type AttentionNotification = {
  id: string;
  kind:
    | "staff_access"
    | "overdue_return"
    | "return_inspection"
    | "return_restock"
    | "service_ticket"
    | "equipment_repair";
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
