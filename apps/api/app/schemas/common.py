from typing import Literal

florida_regions = [
    "Miami",
    "Fort Myers",
    "Sarasota",
    "Tampa",
    "Orlando",
    "Gainesville",
    "Jacksonville",
    "Tallahassee",
    "Destin",
]

FloridaRegion = Literal[
    "Miami",
    "Fort Myers",
    "Sarasota",
    "Tampa",
    "Orlando",
    "Gainesville",
    "Jacksonville",
    "Tallahassee",
    "Destin",
]

EquipmentType = Literal["power_wheelchair", "scooter"]
EquipmentStatus = Literal["available", "assigned", "return_in_progress", "in_repair", "retired"]
AssignmentStatus = Literal["active", "return_in_progress", "ended"]
ReturnStatus = Literal[
    "requested",
    "scheduled",
    "pickup_pending",
    "in_transit",
    "received",
    "inspected",
    "restocked",
    "closed",
    "cancelled",
]
ServiceTicketStatus = Literal[
    "open",
    "scheduled",
    "waiting_parts",
    "in_progress",
    "resolved",
    "closed",
    "cancelled",
]
ServicePriority = Literal["low", "medium", "high", "urgent"]
