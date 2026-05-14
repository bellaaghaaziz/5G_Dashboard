"""
One-shot patcher: applies the v10 time-gap-aware handover label to cell 33
of 5G_Handover_Pipeline_v9.ipynb.

Run from the repo root:
    python scripts/patch_handover_label.py

A real LTE/5G handover (X2/Xn) completes in <1s. The previous label flagged
ANY change in physical_cellid as a handover, which silently mislabelled idle-
mode cell reselections and reconnect-after-signal-loss events (gaps of
minutes to hours) as handovers — exactly the issue raised in review.
"""

import io
import json
from pathlib import Path

NB_PATH = Path("5G_Handover_Pipeline_v9.ipynb")

OLD_BLOCK = (
    "# ── Handover detection ───────────────────────────\n"
    "if 'physical_cellid' in df_master.columns:\n"
    "    df_master['prev_cell'] = df_master.groupby('scenario')['physical_cellid'].shift(1)\n"
    "    df_master['is_ho'] = (\n"
    "        (df_master['physical_cellid'] != df_master['prev_cell'])\n"
    "        & df_master['prev_cell'].notna()\n"
    "    ).astype(int)\n"
    "    df_master.drop(columns=['prev_cell'], inplace=True)\n"
    "else:\n"
    "    df_master['is_ho'] = 0\n"
)

NEW_BLOCK = (
    "# ── Handover detection (v10: time-gap threshold) ─────────────────────────────────────────────\n"
    "# A real LTE/5G handover (X2/Xn) completes in <1s. Anything with more than\n"
    "# HANDOVER_MAX_GAP_S between consecutive samples on the same device is treated\n"
    "# as a reconnection (idle-mode cell reselection or signal loss + re-attach),\n"
    "# NOT as a handover. Without this filter the label silently includes events\n"
    "# where the user came back online hours later on a different cell.\n"
    "HANDOVER_MAX_GAP_S = 10.0\n"
    "\n"
    "if 'physical_cellid' in df_master.columns:\n"
    "    df_master['prev_cell'] = df_master.groupby('scenario')['physical_cellid'].shift(1)\n"
    "    _ts_gap = df_master.groupby('scenario')['ts_num'].diff()\n"
    "    _cell_changed = (\n"
    "        (df_master['physical_cellid'] != df_master['prev_cell'])\n"
    "        & df_master['prev_cell'].notna()\n"
    "    )\n"
    "    df_master['is_ho'] = (\n"
    "        _cell_changed & (_ts_gap <= HANDOVER_MAX_GAP_S)\n"
    "    ).astype(int)\n"
    "    df_master['is_reconnection'] = (\n"
    "        _cell_changed & (_ts_gap >  HANDOVER_MAX_GAP_S)\n"
    "    ).astype(int)\n"
    "\n"
    "    _naive = int(_cell_changed.sum())\n"
    "    _real  = int(df_master['is_ho'].sum())\n"
    "    _rec   = int(df_master['is_reconnection'].sum())\n"
    "    print('\\nHandover label diagnostics:')\n"
    "    print(f'  Naive (any cell change):                    {_naive:,}')\n"
    "    print(f'  Real handovers (gap <= {HANDOVER_MAX_GAP_S:.0f}s):           '\n"
    "          f'{_real:,}  ({_real/max(_naive,1)*100:.1f}% of naive)')\n"
    "    print(f'  Reconnections (gap >  {HANDOVER_MAX_GAP_S:.0f}s, dropped):  '\n"
    "          f'{_rec:,}  ({_rec/max(_naive,1)*100:.1f}% of naive)')\n"
    "    df_master.drop(columns=['prev_cell'], inplace=True)\n"
    "else:\n"
    "    df_master['is_ho'] = 0\n"
    "    df_master['is_reconnection'] = 0\n"
)


def main() -> None:
    with io.open(NB_PATH, encoding="utf-8") as f:
        nb = json.load(f)

    cell = nb["cells"][33]
    src = "".join(cell["source"])

    if "HANDOVER_MAX_GAP_S" in src:
        print("Already patched — nothing to do.")
        return

    # Match on the unique signature lines that are stable across notebook
    # versions (the bordered comment glyph chars vary in length).
    anchor_old = (
        "    df_master['is_ho'] = (\n"
        "        (df_master['physical_cellid'] != df_master['prev_cell'])\n"
        "        & df_master['prev_cell'].notna()\n"
        "    ).astype(int)\n"
        "    df_master.drop(columns=['prev_cell'], inplace=True)\n"
        "else:\n"
        "    df_master['is_ho'] = 0\n"
    )
    anchor_new = (
        "    _ts_gap = df_master.groupby('scenario')['ts_num'].diff()\n"
        "    _cell_changed = (\n"
        "        (df_master['physical_cellid'] != df_master['prev_cell'])\n"
        "        & df_master['prev_cell'].notna()\n"
        "    )\n"
        "    df_master['is_ho'] = (\n"
        "        _cell_changed & (_ts_gap <= HANDOVER_MAX_GAP_S)\n"
        "    ).astype(int)\n"
        "    df_master['is_reconnection'] = (\n"
        "        _cell_changed & (_ts_gap >  HANDOVER_MAX_GAP_S)\n"
        "    ).astype(int)\n"
        "\n"
        "    _naive = int(_cell_changed.sum())\n"
        "    _real  = int(df_master['is_ho'].sum())\n"
        "    _rec   = int(df_master['is_reconnection'].sum())\n"
        "    print('\\nHandover label diagnostics:')\n"
        "    print(f'  Naive (any cell change):                    {_naive:,}')\n"
        "    print(f'  Real handovers (gap <= {HANDOVER_MAX_GAP_S:.0f}s):           '\n"
        "          f'{_real:,}  ({_real/max(_naive,1)*100:.1f}% of naive)')\n"
        "    print(f'  Reconnections (gap >  {HANDOVER_MAX_GAP_S:.0f}s, dropped):  '\n"
        "          f'{_rec:,}  ({_rec/max(_naive,1)*100:.1f}% of naive)')\n"
        "    df_master.drop(columns=['prev_cell'], inplace=True)\n"
        "else:\n"
        "    df_master['is_ho'] = 0\n"
        "    df_master['is_reconnection'] = 0\n"
    )

    if anchor_old not in src:
        raise RuntimeError(
            "Could not find the original handover-detection block in cell 33. "
            "Has the notebook been modified? Aborting to avoid corrupting it."
        )

    # Insert HANDOVER_MAX_GAP_S constant declaration just above the if-block
    new_src = src.replace(
        anchor_old,
        "HANDOVER_MAX_GAP_S = 10.0  # max sample gap to count as a real handover\n"
        + anchor_new
    )

    # Move the HANDOVER_MAX_GAP_S declaration above the `if` so it's evaluated
    # on the else path too. We do this by inserting it in front of the
    # `if 'physical_cellid' in df_master.columns:` line.
    new_src = new_src.replace(
        "HANDOVER_MAX_GAP_S = 10.0  # max sample gap to count as a real handover\n",
        "",
    )
    new_src = new_src.replace(
        "if 'physical_cellid' in df_master.columns:\n    df_master['prev_cell'] = df_master.groupby('scenario')['physical_cellid'].shift(1)\n",
        "HANDOVER_MAX_GAP_S = 10.0  # max sample gap to count as a real handover (3GPP X2/Xn finishes in <1s)\n"
        "if 'physical_cellid' in df_master.columns:\n"
        "    df_master['prev_cell'] = df_master.groupby('scenario')['physical_cellid'].shift(1)\n",
    )
    cell["source"] = new_src.splitlines(keepends=True)
    cell["outputs"] = []
    cell["execution_count"] = None

    with io.open(NB_PATH, "w", encoding="utf-8") as f:
        json.dump(nb, f, indent=1, ensure_ascii=False)

    print(f"Patched cell 33 of {NB_PATH}")


if __name__ == "__main__":
    main()
