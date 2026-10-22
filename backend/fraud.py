import io
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile
from google.cloud import storage

load_dotenv()

BUCKET_NAME = os.environ["GCS_BUCKET_NAME"]

# Files inside the "models/" folder of the bucket
MODEL_PATH = os.getenv("FRAUD_MODEL_PATH", "models/fraud_model.json")
ENCODER_PATH = os.getenv("FRAUD_ENCODER_PATH", "models/transaction_encoder.joblib")

THRESHOLD = float(os.getenv("FRAUD_THRESHOLD", "0.90"))
MAX_FILE_SIZE = 50 * 1024 * 1024  # 20 MB

NUMERIC_COLUMNS = [
    "step",
    "amount",
    "oldbalanceOrg",
    "newbalanceOrig",
    "oldbalanceDest",
    "newbalanceDest",
]

REQUIRED_COLUMNS = NUMERIC_COLUMNS + ["type"]

model = None
encoder = None
FEATURE_COLUMNS = []

def is_ready() -> bool:
    return model is not None and encoder is not None


# Download one file from GCS into a local path
def _download_blob(client, blob_path: str, local_path: Path) -> None:
    blob = client.bucket(BUCKET_NAME).blob(blob_path)

    print("Bucket:", BUCKET_NAME)
    print("Blob path:", blob_path)

    if not blob.exists(client):
        raise FileNotFoundError(
            f"File not found in GCS: gs://{BUCKET_NAME}/{blob_path}"
        )

    blob.download_to_filename(str(local_path))

    print("Downloaded file size:", local_path.stat().st_size, "bytes")

    if local_path.stat().st_size == 0:
        raise ValueError(f"Downloaded file is empty: {blob_path}")


# Load model and encoder once at startup
@asynccontextmanager
async def lifespan(app: FastAPI):

    global model, encoder, FEATURE_COLUMNS

    client = storage.Client()

    with tempfile.TemporaryDirectory() as temp_dir:
        model_file = Path(temp_dir) / "fraud_model.json"
        encoder_file = Path(temp_dir) / "transaction_encoder.joblib"

        _download_blob(client, MODEL_PATH, model_file)
        _download_blob(client, ENCODER_PATH, encoder_file)

        loaded_model = xgb.XGBClassifier()
        loaded_model.load_model(str(model_file))

        loaded_encoder = joblib.load(encoder_file)

    model = loaded_model
    encoder = loaded_encoder

    # Prefer feature names saved with the trained model.
    saved_features = model.get_booster().feature_names

    if saved_features:
        FEATURE_COLUMNS = list(saved_features)
    else:
        # Fallback: this order must match model training.
        encoded_columns = encoder.get_feature_names_out(["type"]).tolist()
        FEATURE_COLUMNS = NUMERIC_COLUMNS + encoded_columns

    print("Fraud model and encoder loaded successfully.")

    yield


# Read Excel file
async def read_excel_file(file: UploadFile) -> pd.DataFrame:
    if not file.filename or Path(file.filename).suffix.lower() != ".xlsx":
        raise HTTPException(
            status_code=400,
            detail="Please upload an Excel file with .xlsx extension.",
        )

    contents = await file.read()

    if not contents:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is empty.",
        )

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File size exceeds the 20 MB limit.",
        )

    try:
        df = pd.read_excel(
            io.BytesIO(contents),
            engine="openpyxl",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Could not read Excel file: {exc}",
        )

    if df.empty:
        raise HTTPException(
            status_code=400,
            detail="The Excel file contains no transactions.",
        )

    return df


# Validate and select relevant columns
def validate_data(df: pd.DataFrame) -> pd.DataFrame:

    missing_columns = [
        column
        for column in REQUIRED_COLUMNS
        if column not in df.columns
    ]

    if missing_columns:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns: {missing_columns}",
        )

    # Only model input columns are selected.
    features = df[REQUIRED_COLUMNS].copy()

    # Clean whitespace in transaction types.
    if not features["type"].map(lambda value: isinstance(value, str)).all():
        raise HTTPException(
            status_code=400,
            detail="The type column must contain text values.",
        )

    features["type"] = features["type"].str.strip()

    if features["type"].eq("").any():
        raise HTTPException(
            status_code=400,
            detail="The type column contains empty values.",
        )

    # Convert numeric fields and reject invalid values.
    for column in NUMERIC_COLUMNS:
        features[column] = pd.to_numeric(
            features[column],
            errors="coerce",
        )

    if features.isnull().any().any():
        raise HTTPException(
            status_code=400,
            detail="Required columns contain missing or invalid values.",
        )

    if not np.isfinite(
        features[NUMERIC_COLUMNS].to_numpy(dtype=float)
    ).all():
        raise HTTPException(
            status_code=400,
            detail="Numeric columns contain infinite values.",
        )

    return features


# Encode and arrange features
def prepare_file_features(features: pd.DataFrame) -> pd.DataFrame:

    try:
        encoded = encoder.transform(features[["type"]])

        if hasattr(encoded, "toarray"):
            encoded = encoded.toarray()

        encoded_df = pd.DataFrame(
            encoded,
            columns=encoder.get_feature_names_out(["type"]),
            index=features.index,
        )

        model_features = pd.concat(
            [features[NUMERIC_COLUMNS], encoded_df],
            axis=1,
        )

        missing = [
            column
            for column in FEATURE_COLUMNS
            if column not in model_features.columns
        ]

        if missing:
            raise ValueError(f"Missing model features: {missing}")

        # Ensure exactly the feature order used during training.
        return model_features[FEATURE_COLUMNS]

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Feature preparation failed: {exc}",
        )


# Predict all transactions
def predict_transactions(model_features: pd.DataFrame) -> pd.DataFrame:

    try:
        fraud_probabilities = model.predict_proba(model_features)[:, 1]

        predictions = (fraud_probabilities >= THRESHOLD).astype(int)

        confidence = np.where(
            predictions == 1,
            fraud_probabilities,
            1 - fraud_probabilities,
        )

        return pd.DataFrame(
            {
                "prediction": predictions,
                "result": np.where(
                    predictions == 1,
                    "Fraud",
                    "Legitimate",
                ),
                "fraud_probability": fraud_probabilities,
                "confidence": confidence,
                "threshold": THRESHOLD,
            },
            index=model_features.index,
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Model prediction failed: {exc}",
        )


# Calculate summary metrics
def calculate_metrics(predictions: pd.DataFrame) -> dict:

    total = len(predictions)

    fraud_count = int((predictions["prediction"] == 1).sum())

    legitimate_count = total - fraud_count

    return {
        "total_transactions": total,
        "fraud_count": fraud_count,
        "legitimate_count": legitimate_count,
        "fraud_percentage": round(fraud_count / total * 100, 2),
        "threshold": THRESHOLD,
    }