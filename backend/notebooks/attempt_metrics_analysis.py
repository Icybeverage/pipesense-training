import json
from pathlib import Path

import marimo
import pandas as pd

app = marimo.App(width="medium")


@app.cell
def _():
    data_path = Path("../review/attempt_metrics.jsonl")
    return (data_path,)


@app.cell
def _(data_path):
    records = []
    if data_path.exists():
        for line in data_path.read_text().splitlines():
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            # Only keep anonymized fields and avoid introducing synthetic values.
            records.append(
                {
                    "attempt_number": row.get("attempt_number"),
                    "score": row.get("score"),
                    "previous_score": row.get("previous_score"),
                    "primary_issue": row.get("primary_issue"),
                    "elapsed_seconds": row.get("elapsed_seconds"),
                }
            )
    df = pd.DataFrame(records)
    df
    return (df,)


@app.cell
def _(df):
    if df.empty:
        summary = "No attempt metrics found at ../review/attempt_metrics.jsonl"
    else:
        summary = {
            "attempts": int(df.shape[0]),
            "avg_score": float(df["score"].mean()),
            "improvement_rate": float((df["score"] > df["previous_score"]).mean()),
        }
    summary
    return


if __name__ == "__main__":
    app.run()
