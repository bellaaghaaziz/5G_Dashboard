"""
Compatibility wrapper for legacy imports.
Canonical implementation lives in root train_mlflow.py.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

_ROOT_MODULE_PATH = Path(__file__).resolve().parents[1] / "train_mlflow.py"
_spec = importlib.util.spec_from_file_location("_root_train_mlflow", _ROOT_MODULE_PATH)
if _spec is None or _spec.loader is None:
    raise ImportError(f"Could not load root train_mlflow module at {_ROOT_MODULE_PATH}")
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)

run_with_mlflow = _module.run_with_mlflow
