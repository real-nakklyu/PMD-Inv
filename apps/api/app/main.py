from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import activity, assignments, corrections, costs, cron, dashboard, equipment, handoff, health, maintenance, messages, movements, notifications, operations, patients, profiles, returns, search, service_tickets, warehouse
from app.core.settings import get_settings

settings = get_settings()

app = FastAPI(
    title="PMDInv API",
    version="0.1.0",
    description="Operational API for Florida DME inventory, assignments, returns, and repairs.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(profiles.router)
app.include_router(dashboard.router)
app.include_router(notifications.router)
app.include_router(messages.router)
app.include_router(corrections.router)
app.include_router(maintenance.router)
app.include_router(movements.router)
app.include_router(costs.router)
app.include_router(operations.router)
app.include_router(warehouse.router)
app.include_router(activity.router)
app.include_router(cron.router)
app.include_router(equipment.router)
app.include_router(handoff.router)
app.include_router(patients.router)
app.include_router(assignments.router)
app.include_router(returns.router)
app.include_router(search.router)
app.include_router(service_tickets.router)
