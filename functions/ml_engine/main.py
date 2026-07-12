import json
import os
import zcatalyst_sdk
from services.dbscan import run_dbscan

def handler(context, basicio):
    # Retrieve argument
    csv_path = basicio.get_argument('csv_path')
    
    if not csv_path:
        basicio.set_status(400)
        basicio.write(json.dumps({
            "success": False,
            "error": {
                "code": "invalid_request",
                "message": "Field 'csv_path' is required and must be provided."
            }
        }))
        return
        
    csv_path = csv_path.strip()
    if not csv_path:
        basicio.set_status(400)
        basicio.write(json.dumps({
            "success": False,
            "error": {
                "code": "invalid_request",
                "message": "Field 'csv_path' must be a non-empty string."
            }
        }))
        return

    # Validate file existence
    if not os.path.exists(csv_path):
        basicio.set_status(404)
        basicio.write(json.dumps({
            "success": False,
            "error": {
                "code": "file_not_found",
                "message": f"CSV file not found at: {csv_path}"
            }
        }))
        return

    try:
        result = run_dbscan(csv_path)
        basicio.write(json.dumps(result))
    except Exception as e:
        basicio.set_status(500)
        basicio.write(json.dumps({
            "success": False,
            "error": {
                "code": "model_execution_failed",
                "message": f"DBSCAN execution failed: {str(e)}"
            }
        }))
