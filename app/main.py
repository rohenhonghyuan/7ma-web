from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse
from .scheduler import scheduler_manager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    scheduler_manager.start()
    yield
    # Shutdown
    scheduler_manager.shutdown()

app = FastAPI(
    title="7ma-web API",
    description="An unofficial web API for 7mate.",
    version="0.1.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, you should restrict this to your frontend's domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from .routers import auth, user, car, order, tasks, periodic
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(user.router, prefix="/api/user", tags=["User"])
app.include_router(car.router, prefix="/api/cars", tags=["Car"])
app.include_router(order.router, prefix="/api/orders", tags=["Order & Actions"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["Background Tasks"])
app.include_router(periodic.router, prefix="/api/periodic", tags=["Periodic Tasks"])

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    """Serve the frontend for any path that is not an API endpoint."""
    return FileResponse('app/static/index.html')
