from pathlib import Path
import sys


def test_training_manager_status_shape():
    repo_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(repo_root / "mlops"))
    sys.path.insert(0, str(repo_root))

    from mlops.src.training_manager import get_training_status  # type: ignore

    s = get_training_status()
    assert isinstance(s, dict)
    for k in ["status", "step", "progress", "error"]:
        assert k in s

