import json
import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from main import read_excel_file, validate_data, prepare_file_features, predict_transactions, calculate_metrics, lifespan, model,encoder


app = FastAPI(lifespan=lifespan)

#Health endpoint
@app.get("/health")
def health():
    return {
        "status": "healthy" if model is not None and encoder is not None else "not_ready",
        "model_loaded": model is not None,
        "encoder_loaded": encoder is not None,
    }

#Main file prediction endpoint
@app.post("/predict")
async def predict_file(file: UploadFile = File(...)):
    try:
        if model is None or encoder is None:
            raise HTTPException(
                status_code=503,
                detail="The model is not ready.",
            )

        # Read uploaded file.
        df = await read_excel_file(file)

        # Validate input and select model columns.
        features = validate_data(df)

        # Encode data and match training feature order.
        model_features = prepare_file_features(features)

        # Predict all rows.
        predictions = predict_transactions(model_features)

        # Preserve original columns and append predictions.
        results = pd.concat(
            [df.reset_index(drop=True), predictions.reset_index(drop=True)],
            axis=1,
        )

        # Calculate summary metrics.
        metrics = calculate_metrics(predictions)

        # Convert results into JSON-safe Python objects.
        transaction_records = json.loads(
            results.to_json(
                orient="records",
                double_precision=10,
            )
        )

        return {
            "filename": file.filename,
            "metrics": metrics,
            "transactions": transaction_records,
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
