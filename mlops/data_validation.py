from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import pandas as pd


@dataclass(frozen=True)
class ValidationResult:
    ok: bool
    rows: int
    cols: int
    missing_required: list[str]
    null_rate_required: dict[str, float]


def validate_dataset(
    parquet_path: str | Path,
    required_columns: Iterable[str],
    *,
    max_null_rate: float = 0.60,
    min_rows: int = 1000,
) -> ValidationResult:
    “””
    Lightweight “MLOps-professor style” data validation:
    - file exists
    - required columns exist
    - dataset has enough rows
    - CORE signal columns aren’t mostly-null (neighbor/load features allowed higher null rate)

    Null-rate tolerance:
      Core radio features (rsrp, rsrq, sinr, cqi, velocity, tx_power): max 10%
      All other features: max_null_rate (default 60%), since neighbor/load columns
      are legitimately null for devices without neighboring cell data.
    “””
    CORE_FEATURES = {“rsrp”, “rsrq”, “sinr”, “cqi”, “velocity”, “tx_power”,
                     “target_is_degrading”, “target_ho_flag”}
    CORE_MAX_NULL = 0.10

    p = Path(parquet_path)
    if not p.exists():
        return ValidationResult(
            ok=False,
            rows=0,
            cols=0,
            missing_required=list(required_columns),
            null_rate_required={},
        )

    df = pd.read_parquet(p)
    missing = [c for c in required_columns if c not in df.columns]
    null_rates: dict[str, float] = {}
    for c in required_columns:
        if c in df.columns:
            null_rates[c] = float(df[c].isna().mean())

    ok = True
    if missing:
        ok = False
    if len(df) < min_rows:
        ok = False
    for col, rate in null_rates.items():
        threshold = CORE_MAX_NULL if col in CORE_FEATURES else max_null_rate
        if rate > threshold:
            ok = False
            break

    return ValidationResult(
        ok=ok,
        rows=int(len(df)),
        cols=int(len(df.columns)),
        missing_required=missing,
        null_rate_required=null_rates,
    )

