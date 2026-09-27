from pathlib import Path

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import model

BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(
    title="Wheel of Affluence Ruby Odds API",
    description="Probability model for the Goodgame Empire Wheel of Affluence ruby jackpot ladder.",
    version="1.0.0",
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/model")
def get_model():
    """The 9-tier box ladder: ticket ranges, jackpot amounts, odds per box."""
    return {"meta": model.MODEL_META, "tiers": model.TIERS}


@app.get("/api/calculate")
def calculate(
    tickets: int = Query(2000, ge=0, le=10_000_000, description="Total affluence tickets spent"),
    threshold: float = Query(500_000, ge=0, description="Ruby threshold for the 'at least X' probability"),
    trials: int = Query(model.DEFAULT_TRIALS, ge=1000, le=model.MAX_TRIALS, description="Monte Carlo trial count"),
    seed: int | None = Query(None, description="Optional RNG seed for reproducible results"),
):
    """Expected rubies, percentiles, and a probability-of-at-least-X curve for a given ticket count."""
    return model.calculate(tickets=tickets, threshold=threshold, trials=trials, seed=seed)
