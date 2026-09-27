"""Wheel of Affluence box-ladder probability model.

Reconstructed from ``WoA 2024 + Boxes.xlsx``: every ticket spent opens
exactly one box; the tier of that box depends only on cumulative tickets
spent this event (a one-time ladder across 9 tiers, uncapped past 390
cumulative tickets); each box independently has a small chance of landing
on that tier's fixed reward slot. The ladder is shared by every reward
type; only the per-tier odds and amounts differ. See
data/reward_models.json for the source numbers and derivation notes.
"""

import json
from pathlib import Path

import numpy as np

DATA_PATH = Path(__file__).parent / "data" / "reward_models.json"

with open(DATA_PATH) as f:
    _RAW = json.load(f)

LADDER = _RAW["ladder"]["tiers"]  # each: {tier, start, end (None = unbounded)}
REWARDS = _RAW["rewards"]  # name -> {meta, per_tier: [{p, amount}, ...]}

MAX_TRIALS = 200_000
DEFAULT_TRIALS = 30_000


def boxes_for_tier(tickets: int, tier: dict) -> int:
    end = tier["end"]
    cap = tickets if end is None else min(tickets, end)
    return max(0, cap - tier["start"])


def boxes_all_tiers(tickets: int) -> list[int]:
    return [boxes_for_tier(tickets, t) for t in LADDER]


def _per_tier(reward: str) -> list[dict]:
    if reward not in REWARDS:
        raise KeyError(f"Unknown reward type: {reward!r}. Known: {list(REWARDS)}")
    return REWARDS[reward]["per_tier"]


def exact_mean(tickets: int, reward: str = "rubies") -> float:
    boxes = boxes_all_tiers(tickets)
    per_tier = _per_tier(reward)
    return sum(b * rt["p"] * rt["amount"] for b, rt in zip(boxes, per_tier))


def simulate(tickets: int, reward: str = "rubies", trials: int = DEFAULT_TRIALS, seed: int | None = None) -> np.ndarray:
    """Vectorized Monte Carlo: totals[i] = simulated reward amount won in run i."""
    trials = max(1, min(trials, MAX_TRIALS))
    rng = np.random.default_rng(seed)
    boxes = boxes_all_tiers(tickets)
    per_tier = _per_tier(reward)
    totals = np.zeros(trials, dtype=np.float64)
    for b, rt in zip(boxes, per_tier):
        lam = b * rt["p"]
        if lam <= 0:
            continue
        hits = rng.poisson(lam, size=trials)
        totals += hits * rt["amount"]
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


def build_pmf(sorted_totals: np.ndarray, max_individual: int = 8) -> list[dict]:
    """PMF bars in ascending outcome order: the smallest reachable totals shown
    individually, with everything above the largest of those folded into one
    trailing '> cutoff' bar. Unlike a top-N-by-probability selection, this stays
    contiguous and monotonic, so the tail bucket's threshold (and how much
    probability sits above it) visibly shifts as the ticket count changes."""
    vals, counts = np.unique(sorted_totals, return_counts=True)
    probs = counts / len(sorted_totals)

    if len(vals) <= max_individual:
        return [{"value": float(v), "prob": float(p), "tail_from": None} for v, p in zip(vals, probs)]

    bars = [{"value": float(vals[i]), "prob": float(probs[i]), "tail_from": None} for i in range(max_individual)]
    cutoff = float(vals[max_individual - 1])
    shown_prob = float(probs[:max_individual].sum())
    rest_prob = max(0.0, 1.0 - shown_prob)
    bars.append({"value": None, "prob": rest_prob, "tail_from": cutoff})
    return bars


def calculate(tickets: int, threshold: float, reward: str = "rubies",
              trials: int = DEFAULT_TRIALS, seed: int | None = None) -> dict:
    tickets = max(0, tickets)
    threshold = max(0.0, threshold)

    boxes = boxes_all_tiers(tickets)
    mean = exact_mean(tickets, reward)
    totals = simulate(tickets, reward, trials, seed)
    totals.sort()

    return {
        "tickets": tickets,
        "threshold": threshold,
        "reward": reward,
        "trials": len(totals),
        "boxes_per_tier": boxes,
        "expected_rubies": mean,
        "median_rubies": percentile(totals, 0.5),
        "p_any_jackpot": ccdf_at(totals, 1),
        "p_at_least_threshold": ccdf_at(totals, threshold),
        "ccdf": build_ccdf_curve(totals, threshold),
        "pmf": build_pmf(totals),
    }


def confidence_intervals(tickets: int, trials: int = DEFAULT_TRIALS, seed: int | None = None) -> dict:
    tickets = max(0, tickets)
    boxes = boxes_all_tiers(tickets)
    out = {}
    for name, spec in REWARDS.items():
        totals = simulate(tickets, name, trials, seed)
        totals.sort()
        out[name] = {
            "label": spec["meta"]["label"],
            "unit": spec["meta"]["unit"],
            "expected": exact_mean(tickets, name),
            "median": percentile(totals, 0.5),
            "ci_low": percentile(totals, 0.025),
            "ci_high": percentile(totals, 0.975),
        }
    return {"tickets": tickets, "trials": trials, "boxes_per_tier": boxes, "rewards": out}
