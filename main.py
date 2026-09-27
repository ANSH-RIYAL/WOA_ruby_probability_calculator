from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import model

BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(
    title="Wheel of Affluence Ruby Odds API",
    description="Probability model for the Goodgame Empire Wheel of Affluence box-ladder rewards.",
    version="2.0.0",
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/confidence", include_in_schema=False)
def confidence_page():
    return FileResponse(STATIC_DIR / "confidence.html")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/model")
def get_model():
    """The shared 9-tier box ladder plus each reward type's odds/amounts and derivation notes."""
    return {"ladder": model.LADDER, "rewards": model.REWARDS}


@app.get("/api/calculate")
def calculate(
    tickets: int = Query(2000, ge=0, le=10_000_000, description="Total affluence tickets spent"),
    threshold: float = Query(500_000, ge=0, description="Reward threshold for the 'at least X' probability"),
    reward: str = Query("rubies", description="Reward type: 'rubies' or 'construction_tokens'"),
    trials: int = Query(model.DEFAULT_TRIALS, ge=1000, le=model.MAX_TRIALS, description="Monte Carlo trial count"),
    seed: int | None = Query(None, description="Optional RNG seed for reproducible results"),
):
    """Expected reward, percentiles, a probability-of-at-least-X curve, and a PMF for a given ticket count."""
    if reward not in model.REWARDS:
        raise HTTPException(status_code=400, detail=f"Unknown reward '{reward}'. Choose from: {list(model.REWARDS)}")
    return model.calculate(tickets=tickets, threshold=threshold, reward=reward, trials=trials, seed=seed)


@app.get("/api/confidence")
def confidence(
    tickets: int = Query(2000, ge=0, le=10_000_000, description="Total affluence tickets spent"),
    trials: int = Query(model.DEFAULT_TRIALS, ge=1000, le=model.MAX_TRIALS, description="Monte Carlo trial count"),
    seed: int | None = Query(None, description="Optional RNG seed for reproducible results"),
):
    """95% confidence interval (2.5th-97.5th percentile) for every reward type at once."""
    return model.confidence_intervals(tickets=tickets, trials=trials, seed=seed)
