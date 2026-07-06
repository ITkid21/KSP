import os
import json
import subprocess
import sys

# Path to the compiled Python model
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DBSCAN_MODEL_PATH = os.path.join(PROJECT_ROOT, 'ml', 'models', 'DBSCAN_model-main', '__pycache__', 'DSBSCAN.cpython-314.pyc')

def run_dbscan(csv_path):
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"CSV file not found: {csv_path}")
    
    if not os.path.exists(DBSCAN_MODEL_PATH):
        raise FileNotFoundError(f"DBSCAN model not found at {DBSCAN_MODEL_PATH}")

    # Call the model via subprocess (CLI contract: python DSBSCAN.pyc <csv_path> [eps_km] [min_samples])
    try:
        result = subprocess.run(
            [sys.executable, DBSCAN_MODEL_PATH, csv_path, "1.0", "3"],
            capture_output=True,
            text=True,
            check=True
        )
        return json.loads(result.stdout.strip())
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr.strip() if e.stderr else str(e)
        raise RuntimeError(f"DBSCAN execution failed: {error_msg}")
    except json.JSONDecodeError:
        raise RuntimeError(f"DBSCAN output is not valid JSON. Stdout: {result.stdout}")
