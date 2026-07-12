import os
import logging
from flask import Blueprint, jsonify, request
from services.dbscan_service import run_dbscan

logger = logging.getLogger(__name__)

dbscan_bp = Blueprint("dbscan", __name__, url_prefix="/api/dbscan")


@dbscan_bp.route("/health", methods=["GET"])
def dbscan_health():
    logger.info("DBSCAN health check requested")
    return jsonify({"status": "ok", "service": "dbscan"}), 200


@dbscan_bp.route("/run", methods=["POST"])
def run_dbscan_endpoint():
    logger.info("DBSCAN run endpoint called")
    
    data = request.get_json(silent=True) or {}
    csv_path = data.get("csv_path")

    if not isinstance(csv_path, str) or not csv_path.strip():
        logger.warning("Invalid csv_path provided")
        return jsonify(
            {
                "success": False,
                "error": {
                    "code": "invalid_request",
                    "message": "Field 'csv_path' must be a non-empty string.",
                },
            }
        ), 400

    resolved_path = csv_path.strip()
    if not os.path.isabs(resolved_path):
        resolved_path = os.path.abspath(os.path.join(os.getcwd(), resolved_path))

    logger.info(f"Processing CSV: {resolved_path}")

    params = data.get("params", {})
    if not isinstance(params, dict):
        logger.warning("Invalid params object provided")
        return jsonify(
            {
                "success": False,
                "error": {
                    "code": "invalid_request",
                    "message": "Field 'params' must be an object when provided.",
                },
            }
        ), 400

    eps = params.get("eps", 0.5)
    min_samples = params.get("min_samples", 5)
    logger.info(f"DBSCAN params: eps={eps}, min_samples={min_samples}")

    try:
        logger.info(f"Running DBSCAN on {resolved_path}")
        result = run_dbscan(resolved_path, eps=eps, min_samples=min_samples)
        logger.info(f"DBSCAN completed successfully: {result.get('cluster_count')} clusters")
        return jsonify(result), 200
    except FileNotFoundError as exc:
        logger.error(f"File not found: {exc}")
        return jsonify(
            {
                "success": False,
                "error": {"code": "file_not_found", "message": str(exc)},
            }
        ), 404
    except ValueError as exc:
        logger.error(f"Invalid input: {exc}")
        return jsonify(
            {
                "success": False,
                "error": {"code": "invalid_input", "message": str(exc)},
            }
        ), 400
    except Exception as exc:
        logger.exception(f"Unexpected error in DBSCAN: {exc}")
        return jsonify(
            {
                "success": False,
                "error": {"code": "model_execution_failed", "message": "DBSCAN execution failed."},
            }
        ), 500
