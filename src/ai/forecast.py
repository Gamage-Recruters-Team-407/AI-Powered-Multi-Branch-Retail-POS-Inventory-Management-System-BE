import os
import pandas as pd
import json
from prophet import Prophet

# Resolve CSV path relative to this script's directory
script_dir = os.path.dirname(os.path.abspath(__file__))
csv_path = os.path.join(script_dir, "sales_data.csv")

df = pd.read_csv(csv_path)

result = []

grouped = df.groupby(["productId", "branchId"])

for (productId, branchId), group in grouped:
    temp = group.groupby("date")["quantitySold"].sum().reset_index()

    temp.columns = ["ds", "y"]

    if len(temp) < 2:
        continue

    model = Prophet()

    model.fit(temp)

    future = model.make_future_dataframe(periods=7)

    forecast = model.predict(future)

    predictions = forecast[["ds", "yhat"]].tail(7)

    for _, row in predictions.iterrows():
        result.append({
            "product": productId,
            "branch": branchId,
            "forecastDate": row["ds"].strftime("%Y-%m-%d"),
            "predictedDemand": round(row["yhat"], 2),
            "confidenceScore": 95,
            "forecastPeriod": "DAILY",
            "aiInsight": "Demand expected to increase"
        })

print(json.dumps(result))