import type { ReturnStatus } from "@/src/types/domain";

export const returnTransitions: Record<ReturnStatus, ReturnStatus[]> = {
  requested: ["scheduled", "pickup_pending", "cancelled"],
  scheduled: ["pickup_pending", "in_transit", "cancelled"],
  pickup_pending: ["in_transit", "cancelled"],
  in_transit: ["received", "cancelled"],
  received: ["inspected"],
  inspected: ["restocked", "closed"],
  restocked: ["closed"],
  closed: [],
  cancelled: [],
};
