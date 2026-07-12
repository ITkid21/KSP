import json
import zcatalyst_sdk

def handler(context, basicio):
    response_data = {
        "status": "ready",
        "service": "ml_engine"
    }
    basicio.write(json.dumps(response_data))
