import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from google.cloud import storage

load_dotenv()

# Bucket name comes from .env: GCS_BUCKET_NAME=aml_fraud_model_bucket
BUCKET_NAME = os.getenv("GCS_BUCKET_NAME")

# Files inside the "models/" folder of the bucket
AML_MODEL_PATH = os.getenv("AML_MODEL_PATH", "models/aml_xgb_model.json")
AML_ENCODER_PATH = os.getenv("AML_ENCODER_PATH", "models/aml_encoder.joblib")

DEFAULT_THRESHOLD = float(os.getenv("AML_THRESHOLD", "0.50"))

ID_COLS = ["Sender_account", "Receiver_account"]
CAT_COLUMNS = [
    "Payment_currency",
    "Received_currency",
    "Sender_bank_location",
    "Receiver_bank_location",
    "Payment_type",
]

REQUIRED_COLUMNS = ["Date", "Time", "Amount"] + ID_COLS + CAT_COLUMNS

model = None
preprocessor = None
NUM_COLS = []
THRESHOLD = DEFAULT_THRESHOLD


def is_ready() -> bool:
    return model is not None and preprocessor is not None


# Download one file from GCS into a local path
def _download_blob(client, blob_path: str, local_path: Path) -> None:
    if not BUCKET_NAME:
        raise ValueError(
            "GCS_BUCKET_NAME is not set. Add it to your .env file."
        )

    bucket = client.bucket(BUCKET_NAME)
    blob = bucket.blob(blob_path)

    print("Bucket:", BUCKET_NAME)
    print("Blob path:", blob_path)

    if not blob.exists(client):
        raise FileNotFoundError(
            f"File not found in GCS: gs://{BUCKET_NAME}/{blob_path}"
        )

    blob.download_to_filename(str(local_path))

    print("Downloaded file exists:", local_path.is_file())
    print("Downloaded file size:", local_path.stat().st_size, "bytes")

    if local_path.stat().st_size == 0:
        raise ValueError(f"Downloaded file is empty: {blob_path}")


# Work out the numeric columns from the fitted encoder (no bundle anymore)
def _get_num_cols(fitted_preprocessor) -> list:
    # Preferred: the column names the encoder was fitted on
    if hasattr(fitted_preprocessor, "feature_names_in_"):
        return [
            c for c in fitted_preprocessor.feature_names_in_
            if c not in CAT_COLUMNS
        ]

    # Fallback: read them from the ColumnTransformer definition
    if hasattr(fitted_preprocessor, "transformers_"):
        cols = []
        for _, _, selected in fitted_preprocessor.transformers_:
            if isinstance(selected, (list, tuple)):
                cols.extend(c for c in selected if c not in CAT_COLUMNS)
        if cols:
            return cols

    raise ValueError(
        "Could not determine numeric columns from the encoder. "
        "Fit the encoder on a DataFrame so feature_names_in_ is stored."
    )


# Load AML model and preprocessor once at startup
def load_aml_model():
    global model, preprocessor, NUM_COLS, THRESHOLD

    client = storage.Client()

    with tempfile.TemporaryDirectory() as temp_dir:
        model_file = Path(temp_dir) / "aml_xgb_model.json"
        encoder_file = Path(temp_dir) / "aml_encoder.joblib"

        # Download both files from GCS
        _download_blob(client, AML_MODEL_PATH, model_file)
        _download_blob(client, AML_ENCODER_PATH, encoder_file)

        # Load the encoder (joblib) and the XGBoost model (native JSON)
        loaded_preprocessor = joblib.load(encoder_file)

        loaded_model = xgb.XGBClassifier()
        loaded_model.load_model(str(model_file))

    preprocessor = loaded_preprocessor
    model = loaded_model
    NUM_COLS = _get_num_cols(preprocessor)
    THRESHOLD = DEFAULT_THRESHOLD

    print("AML model and preprocessor loaded successfully.")
    print("Numeric columns:", len(NUM_COLS))


# Wrap the existing fraud lifespan so both models load at startup
def with_aml(fraud_lifespan):
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        load_aml_model()
        async with fraud_lifespan(app):
            yield

    return lifespan


# Validate and clean the raw AML columns
def validate_data(df: pd.DataFrame) -> pd.DataFrame:

    df = df.copy()
    df.columns = df.columns.astype(str).str.strip()

    missing_columns = [
        column
        for column in REQUIRED_COLUMNS
        if column not in df.columns
    ]

    if missing_columns:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required AML columns: {missing_columns}",
        )

    data = df[REQUIRED_COLUMNS].reset_index(drop=True)

    if data[["Date", "Time"] + ID_COLS].isnull().any().any():
        raise HTTPException(
            status_code=400,
            detail="Date, Time and account columns contain missing values.",
        )

    # Same cleaning as training: missing amount -> median, negatives -> 0.
    data["Amount"] = pd.to_numeric(data["Amount"], errors="coerce")
    data["Amount"] = data["Amount"].fillna(data["Amount"].median())
    data["Amount"] = data["Amount"].fillna(0).clip(lower=0)

    if not np.isfinite(data["Amount"].to_numpy(dtype=float)).all():
        raise HTTPException(
            status_code=400,
            detail="The Amount column contains infinite values.",
        )

    for column in CAT_COLUMNS:
        values = data[column].astype(str).str.strip()
        values = values.mask(data[column].isnull() | values.eq(""), "Unknown")
        data[column] = values

    for column in ID_COLS:
        data[column] = data[column].astype(str).str.strip()

    return data


def _parse_timestamp(date: pd.Series, time: pd.Series) -> pd.Series:
    # Excel may hand back dates/times as datetime objects, so parse them separately.
    day = pd.to_datetime(date, errors="coerce").dt.normalize()
    clock = pd.to_datetime(time.astype(str), errors="coerce")
    return day + (clock - clock.dt.normalize())


# Account-behaviour features, mirroring the training engineer_features()
def engineer_features(df: pd.DataFrame) -> pd.DataFrame:

    ts = _parse_timestamp(df["Date"], df["Time"])

    if ts.isnull().all():
        raise ValueError("Date and Time columns could not be parsed.")

    ts = ts.fillna(ts.median())

    df["hour"] = ts.dt.hour.astype("int8")
    df["day_of_week"] = ts.dt.dayofweek.astype("int8")
    df["month"] = ts.dt.month.astype("int8")
    df["is_weekend"] = (df["day_of_week"] >= 5).astype("int8")
    df["is_night"] = ((df["hour"] < 6) | (df["hour"] >= 22)).astype("int8")
    time_h = ((ts - ts.min()).dt.total_seconds() / 3600).astype("float32")
    df["day_idx"] = (time_h // 24).astype("int32")

    df["same_currency"] = (
        df["Payment_currency"] == df["Received_currency"]
    ).astype("int8")
    df["same_country"] = (
        df["Sender_bank_location"] == df["Receiver_bank_location"]
    ).astype("int8")

    # Velocity: hours since the sender's previous transaction
    tmp = pd.DataFrame(
        {"s": df["Sender_account"].values, "t": time_h.values},
        index=df.index,
    )
    gap = tmp.sort_values(["s", "t"]).groupby("s")["t"].diff().reindex(df.index)
    df["first_txn"] = gap.isna().astype("int8")
    df["sender_gap_h"] = gap.fillna(0).astype("float32")

    # Sender behaviour
    g = df.groupby("Sender_account")
    snd = g["Amount"].agg(
        snd_count="size", snd_sum="sum", snd_mean="mean", snd_std="std", snd_max="max"
    )
    snd["snd_unique_rcv"] = g["Receiver_account"].nunique()
    df = df.join(snd, on="Sender_account")

    # Receiver behaviour
    g = df.groupby("Receiver_account")
    rcv = g["Amount"].agg(rcv_count="size", rcv_sum="sum", rcv_mean="mean")
    rcv["rcv_unique_snd"] = g["Sender_account"].nunique()
    df = df.join(rcv, on="Receiver_account")

    # Layering: receiver forwards what it receives
    df["rcv_out_total"] = df["Receiver_account"].map(snd["snd_sum"]).fillna(0)
    hi = np.maximum(df["rcv_sum"], df["rcv_out_total"]).replace(0, np.nan)
    df["rcv_pass_ratio"] = (
        np.minimum(df["rcv_sum"], df["rcv_out_total"]) / hi
    ).fillna(0)

    # Pair / burst behaviour
    df["pair_count"] = df.groupby(ID_COLS)["Amount"].transform("size")
    df["snd_day_count"] = df.groupby(["Sender_account", "day_idx"])["Amount"].transform("size")
    df["rcv_day_count"] = df.groupby(["Receiver_account", "day_idx"])["Amount"].transform("size")

    # Amount vs the sender's own history
    df["amt_vs_snd_mean"] = df["Amount"] / (df["snd_mean"] + 1e-9)
    df["amt_zscore"] = (
        (df["Amount"] - df["snd_mean"]) / (df["snd_std"].fillna(0) + 1)
    ).clip(-10, 10)

    # Round-tripping (A->B and B->A)
    edges = df[ID_COLS].drop_duplicates()
    rev = edges.rename(
        columns={"Sender_account": "Receiver_account", "Receiver_account": "Sender_account"}
    )
    rt = edges.merge(rev, on=ID_COLS)
    rt["is_roundtrip"] = np.int8(1)
    df = df.merge(rt, on=ID_COLS, how="left")
    df["is_roundtrip"] = df["is_roundtrip"].fillna(0).astype("int8")

    # log1p on skewed columns (raw columns replaced)
    for column in [
        "Amount", "sender_gap_h", "snd_count", "snd_sum", "snd_mean", "snd_std",
        "snd_max", "snd_unique_rcv", "rcv_count", "rcv_sum", "rcv_mean",
        "rcv_unique_snd", "rcv_out_total", "pair_count", "snd_day_count",
        "rcv_day_count", "amt_vs_snd_mean",
    ]:
        df["log_" + column] = np.log1p(df[column].fillna(0).clip(lower=0)).astype("float32")
        df.drop(columns=column, inplace=True)

    return df.reset_index(drop=True)


# Engineer, select and encode features in the order used during training
def prepare_file_features(data: pd.DataFrame) -> np.ndarray:

    try:
        features = engineer_features(data.copy())

        missing = [
            column
            for column in NUM_COLS + CAT_COLUMNS
            if column not in features.columns
        ]

        if missing:
            raise ValueError(f"Missing model features: {missing}")

        model_features = features[NUM_COLS + CAT_COLUMNS].copy()
        model_features[NUM_COLS] = (
            model_features[NUM_COLS]
            .astype("float32")
            .replace([np.inf, -np.inf], np.nan)
        )

        return preprocessor.transform(model_features).astype(np.float32)

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"AML feature preparation failed: {exc}",
        )


# Predict all transactions
def predict_transactions(encoded: np.ndarray) -> pd.DataFrame:

    try:
        probabilities = model.predict_proba(encoded)[:, 1]

        predictions = (probabilities >= THRESHOLD).astype(int)

        confidence = np.where(
            predictions == 1,
            probabilities,
            1 - probabilities,
        )

        return pd.DataFrame(
            {
                "aml_prediction": predictions,
                "aml_result": np.where(
                    predictions == 1,
                    "Suspicious",
                    "Normal",
                ),
                "aml_probability": probabilities,
                "aml_confidence": confidence,
                "aml_threshold": THRESHOLD,
            }
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"AML model prediction failed: {exc}",
        )


# Calculate summary metrics
def calculate_metrics(predictions: pd.DataFrame) -> dict:

    total = len(predictions)

    aml_count = int((predictions["aml_prediction"] == 1).sum())

    return {
        "total_transactions": total,
        "aml_count": aml_count,
        "normal_count": total - aml_count,
        "aml_percentage": round(aml_count / total * 100, 2),
        "threshold": THRESHOLD,
    }

# True when the uploaded file already contains every model feature (handout format)
def has_precomputed_features(df: pd.DataFrame) -> bool:
    return all(column in df.columns for column in NUM_COLS + CAT_COLUMNS)


# Use the precomputed feature columns directly (no feature engineering)
def prepare_precomputed_features(df: pd.DataFrame) -> np.ndarray:

    try:
        model_features = df[NUM_COLS + CAT_COLUMNS].copy()

        for column in NUM_COLS:
            model_features[column] = pd.to_numeric(
                model_features[column], errors="coerce"
            )

        model_features[NUM_COLS] = (
            model_features[NUM_COLS]
            .astype("float32")
            .replace([np.inf, -np.inf], np.nan)
        )

        for column in CAT_COLUMNS:
            values = model_features[column].astype(str).str.strip()
            model_features[column] = values.mask(
                model_features[column].isnull() | values.eq(""), "Unknown"
            )

        return preprocessor.transform(model_features).astype(np.float32)

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"AML feature preparation failed: {exc}",
        )

# Full AML pipeline on the uploaded dataframe
# Full AML pipeline on the uploaded dataframe
def analyze(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:

    df = df.copy()
    df.columns = df.columns.astype(str).str.strip()

    if has_precomputed_features(df):
        # Handout format: features already computed from full account history
        encoded = prepare_precomputed_features(df)
    else:
        # Raw format: Date, Time, Amount, accounts, categoricals
        data = validate_data(df)
        encoded = prepare_file_features(data)

    predictions = predict_transactions(encoded)

    return predictions, calculate_metrics(predictions)