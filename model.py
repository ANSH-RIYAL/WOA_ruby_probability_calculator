"""Ruby-jackpot probability model for the Wheel of Affluence box ladder.

Reconstructed from ``WoA 2024 + Boxes.xlsx``: every ticket spent opens exactly
one box; the tier of that box depends only on cumulative tickets spent this
event (a one-time ladder across 9 tiers, uncapped past 390 cumulative
tickets); each box independently has a small chance of landing on that
tier's fixed ruby jackpot. See data/ruby_model.json for the source numbers
and the full derivation notes.
"""

import json
from pathlib import Path

import numpy as np

DATA_PATH = Path(__file__).parent / "data" / "ruby_model.json"

with open(DATA_PATH) as f:
    _RAW = json.load(f)

MODEL_META = _RAW["meta"]
TIERS = _RAW["tiers"]  # each: {tier, start, end (or None = unbounded), amount, p}

MAX_TRIALS = 200_000
DEFAULT_TRIALS = 30_000


def boxes_for_tier(tickets: int, tier: dict) -> int:
    end = tier["end"]
    cap = tickets if end is None else min(tickets, end)
    return max(0, cap - tier["start"])


def boxes_all_tiers(tickets: int) -> list[int]:
    return [boxes_for_tier(tickets, t) for t in TIERS]


def exact_mean(tickets: int) -> float:
    boxes = boxes_all_tiers(tickets)
    return sum(b * t["p"] * t["amount"] for b, t in zip(boxes, TIERS))


def simulate(tickets: int, trials: int = DEFAULT_TRIALS, seed: int | None = None) -> np.ndarray:
    """Vectorized Monte Carlo: totals[i] = simulated rubies won in run i."""
    trials = max(1, min(trials, MAX_TRIALS))
    rng = np.random.default_rng(seed)
    boxes = boxes_all_tiers(tickets)
    totals = np.zeros(trials, dtype=np.float64)
    for b, t in zip(boxes, TIERS):
        lam = b * t["p"]
        if lam <= 0:
            continue
        hits = rng.poisson(lam, size=trials)
        totals += hits * t["amount"]
    return totals


def percentile(sorted_totals: np.ndarray, frac: float) -> float:
    idx = int(np.clip(np.floor(frac * len(sorted_totals)), 0, len(sorted_totals) - 1))
    return float(sorted_totals[idx])


def ccdf_at(sorted_totals: np.ndarray, x: float) -> float:
    """P(total >= x)."""
    idx = np.searchsorted(sorted_totals, x, side="left")
    return float(len(sorted_totals) - idx) / len(sorted_totals)


def build_ccdf_curve(sorted_totals: np.ndarray, threshold: float) -> dict:
    """Step-function points for P(total >= x) up to an auto-scaled domain max."""
    unique_vals = np.unique(sorted_totals)
    p97 = percentile(sorted_totals, 0.97)
    domain_max = max(threshold * 1.35, p97 * 1.4, 1000.0)

    points = []
    for v in unique_vals:
        if v > domain_max:
            break
        points.append({"value": float(v), "prob": ccdf_at(sorted_totals, float(v))})

    return {"domain_max": domain_max, "points": points}


def calculate(tickets: int, threshold: float, trials: int = DEFAULT_TRIALS, seed: int | None = None) -> dict:
    tickets = max(0, tickets)
    threshold = max(0.0, threshold)

    boxes = boxes_all_tiers(tickets)
    mean = exact_mean(tickets)
    totals = simulate(tickets, trials, seed)
    totals.sort()

    curve = build_ccdf_curve(totals, threshold)

    return {
        "tickets": tickets,
        "threshold": threshold,
        "trials": len(totals),
        "boxes_per_tier": boxes,
        "expected_rubies": mean,
        "median_rubies": percentile(totals, 0.5),
        "p_any_jackpot": ccdf_at(totals, 1),
        "p_at_least_threshold": ccdf_at(totals, threshold),
        "ccdf": curve,
    }
