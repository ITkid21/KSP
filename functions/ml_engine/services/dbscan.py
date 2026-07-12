import os
import time
import pandas as pd
from models.DSBSCAN import run_dbscan as run_dbscan_model

def run_dbscan(csv_path):
    if not csv_path or not os.path.exists(csv_path):
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    start_time = time.time()
    
    # Load DataFrame to map indices back to crime_id and other fields
    df = pd.read_csv(csv_path)
    
    # Run the underlying DBSCAN clustering model (using standard parameters eps=0.5, min_samples=5)
    model_result = run_dbscan_model(csv_path, eps=0.5, min_samples=5)
    
    clusters_out = []
    hotspots_out = []
    
    # Process clustered points
    # model_result['clusters'] is a list of:
    # {"cluster_id": index, "size": len(points), "points": [{"row_index": int}, ...]}
    for cluster_data in model_result.get('clusters', []):
        cluster_id = cluster_data['cluster_id']
        points = cluster_data['points']
        
        cluster_rows = []
        for p in points:
            idx = p['row_index']
            if 0 <= idx < len(df):
                row = df.iloc[idx]
                crime_id = str(row.get('crime_id', ''))
                
                clusters_out.append({
                    "crime_id": crime_id,
                    "cluster_label": int(cluster_id)
                })
                cluster_rows.append(row)
            
        # Compute centroid, crime_types count, and date_range for hotspots
        if cluster_rows:
            cluster_df = pd.DataFrame(cluster_rows)
            
            # Find column names case-insensitively
            lat_col = next((c for c in cluster_df.columns if c.lower() == 'latitude'), 'latitude')
            lng_col = next((c for c in cluster_df.columns if c.lower() == 'longitude'), 'longitude')
            crime_type_col = next((c for c in cluster_df.columns if c.lower() == 'crime_type'), 'crime_type')
            date_col = next((c for c in cluster_df.columns if c.lower() == 'incident_date'), 'incident_date')
            
            centroid_lat = float(cluster_df[lat_col].mean()) if lat_col in cluster_df.columns else 0.0
            centroid_lng = float(cluster_df[lng_col].mean()) if lng_col in cluster_df.columns else 0.0
            crime_count = len(cluster_df)
            
            crime_types = {}
            if crime_type_col in cluster_df.columns:
                type_counts = cluster_df[crime_type_col].value_counts().to_dict()
                crime_types = {str(k): int(v) for k, v in type_counts.items()}
                
            date_range = ""
            if date_col in cluster_df.columns:
                valid_dates = cluster_df[date_col].dropna().astype(str).str.strip()
                valid_dates = valid_dates[valid_dates != '']
                if not valid_dates.empty:
                    min_date = valid_dates.min()
                    max_date = valid_dates.max()
                    date_range = f"{min_date} to {max_date}"
                    
            hotspots_out.append({
                "cluster_id": int(cluster_id),
                "centroid_latitude": centroid_lat,
                "centroid_longitude": centroid_lng,
                "crime_count": crime_count,
                "crime_types": crime_types,
                "date_range": date_range
            })
            
    # Process noise points (cluster_label = -1)
    noise_points_count = 0
    for p in model_result.get('noise_points', []):
        idx = p['row_index']
        if 0 <= idx < len(df):
            row = df.iloc[idx]
            crime_id = str(row.get('crime_id', ''))
            clusters_out.append({
                "crime_id": crime_id,
                "cluster_label": -1
            })
            noise_points_count += 1
        
    runtime = time.time() - start_time
    total_clusters = len(hotspots_out)
    
    metrics_out = {
        "total_clusters": total_clusters,
        "noise_points": noise_points_count,
        "runtime_seconds": runtime,
        "number_of_clusters": total_clusters,
        "noise_count": noise_points_count
    }
    
    return {
        "clusters": clusters_out,
        "hotspots": hotspots_out,
        "metrics": metrics_out
    }
