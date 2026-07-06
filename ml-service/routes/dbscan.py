from flask import Blueprint, request, jsonify
import os
from services.dbscan_service import run_dbscan

dbscan_bp = Blueprint('dbscan', __name__, url_prefix='/api/dbscan')

@dbscan_bp.route('/run', methods=['POST'])
def run_dbscan_endpoint():
    data = request.get_json()
    
    if not data or 'csv_path' not in data:
        return jsonify({"error": "Missing 'csv_path' in request body"}), 400
        
    csv_path = data['csv_path']
    
    if not os.path.exists(csv_path):
        return jsonify({"error": f"File not found: {csv_path}"}), 404
        
    try:
        result = run_dbscan(csv_path)
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
