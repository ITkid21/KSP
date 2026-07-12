import os

import pandas as pd
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import StandardScaler


def run_dbscan(csv_path, eps=0.5, min_samples=5):
    if not csv_path or not os.path.isfile(csv_path):
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    data_frame = pd.read_csv(csv_path)
    if data_frame.empty:
        raise ValueError("CSV file is empty.")

    numeric_columns = data_frame.select_dtypes(include=["number"]).columns.tolist()
    if len(numeric_columns) < 2:
        raise ValueError("At least two numeric columns are required for clustering.")

    cleaned_frame = data_frame[numeric_columns].dropna().copy()
    if cleaned_frame.empty:
        raise ValueError("No numeric data is available for clustering.")

    cleaned_frame["__row_index__"] = cleaned_frame.index.astype(int)
    feature_frame = cleaned_frame[numeric_columns]

    scaled_features = StandardScaler().fit_transform(feature_frame)
    model = DBSCAN(eps=eps, min_samples=min_samples)
    labels = model.fit_predict(scaled_features)

    clusters = []
    noise_points = []
    for row_index, label in zip(cleaned_frame["__row_index__"].tolist(), labels.tolist()):
        point = {"row_index": int(row_index)}
        if label == -1:
            noise_points.append(point)
        else:
            while len(clusters) <= label:
                clusters.append([])
            clusters[label].append(point)

    cluster_summaries = [
        {"cluster_id": index, "size": len(points), "points": points}
        for index, points in enumerate(clusters)
    ]

    return {
        "success": True,
        "model": "dbscan",
        "cluster_count": len(cluster_summaries),
        "clusters": cluster_summaries,
        "noise_points": noise_points,
        "total_points": len(cleaned_frame),
        "used_columns": numeric_columns,
    }
