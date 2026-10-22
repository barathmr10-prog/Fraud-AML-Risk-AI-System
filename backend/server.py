import json
import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
import aml
import fraud
from fraud import (
    calculate_metrics,
    lifespan,
    predict_transactions,
    prepare_file_features,
    read_excel_file,
    validate_data,
)

app = FastAPI(lifespan=aml.with_aml(lifespan))


# Health endpoint
@app.get("/health")
def health():
    return {
        "status": "healthy" if fraud.is_ready() and aml.is_ready() else "not_ready",
        "model_loaded": fraud.model is not None,
        "encoder_loaded": fraud.encoder is not None,
        "aml_loaded": aml.is_ready(),
    }


# Main file prediction endpoint
@app.post("/predict")
async def predict_file(file: UploadFile = File(...)):
    try:
        if not fraud.is_ready():
            raise HTTPException(
                status_code=503,
                detail="The fraud model is not ready.",
            )

        if not aml.is_ready():
            raise HTTPException(
                status_code=503,
                detail="The AML model is not ready.",
            )

        # Read uploaded file.
        df = await read_excel_file(file)

        # Validate input and select model columns.
        features = validate_data(df)

        # Encode data and match training feature order.
        model_features = prepare_file_features(features)

        # Predict all rows.
        predictions = predict_transactions(model_features)

        print(predictions)

        # Preserve original columns and append predictions.
        results = pd.concat(
            [df.reset_index(drop=True), predictions.reset_index(drop=True)],
            axis=1,
        )

        # Calculate summary metrics.
        metrics = calculate_metrics(predictions)

        print(metrics)

        # Convert results into JSON-safe Python objects.
        transaction_records = json.loads(
            results.to_json(
                orient="records",
                double_precision=10,
            )
        )

        # AML model: clean, engineer, encode, predict and summarise.
        aml_predictions, aml_metrics = aml.analyze(df)

        aml_results = pd.concat(
            [df.reset_index(drop=True), aml_predictions.reset_index(drop=True)],
            axis=1,
        )
        print(aml_results)

        aml_records = json.loads(
            aml_results.to_json(
                orient="records",
                double_precision=10,
            )
        )

        return {
            "filename": file.filename,
            "metrics": metrics,
            "transactions": transaction_records,
            "aml": {
                "metrics": aml_metrics,
                "transactions": aml_records,
            },
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {exc}",
        )

    finally:
        await file.close()