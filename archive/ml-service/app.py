import os
import logging
from flask import Flask, jsonify
from flask_cors import CORS

# Configure logging — use StreamHandler so output is unbuffered and captured by Catalyst
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)


def create_app():
    """Flask application factory."""
    app = Flask(__name__)

    # Enable CORS for all routes
    CORS(app, resources={r"/*": {"origins": "*"}})

    # Register blueprints
    try:
        from routes.dbscan import dbscan_bp
        app.register_blueprint(dbscan_bp)
        logger.info("DBSCAN blueprint registered successfully")
    except ImportError as e:
        logger.error(f"Failed to import dbscan blueprint: {e}")
        raise

    # ── Health check endpoint ─────────────────────────────────────────────────
    @app.route("/health")
    def health():
        return jsonify({
            "status": "ok",
            "service": "ml-service",
            "version": "1.0.0"
        }), 200

    # ── Root endpoint ─────────────────────────────────────────────────────────
    @app.route("/")
    def index():
        return jsonify({
            "service": "ml-service",
            "version": "1.0.0",
            "endpoints": {
                "health": "/health",
                "dbscan_health": "/api/dbscan/health",
                "api": "/api/dbscan/run"
            }
        }), 200

    # ── Error handlers ────────────────────────────────────────────────────────
    @app.errorhandler(404)
    def not_found(error):
        logger.warning(f"404 Not Found: {error}")
        return jsonify({
            "success": False,
            "error": {"code": "not_found", "message": "Endpoint not found"}
        }), 404

    @app.errorhandler(500)
    def internal_error(error):
        logger.error(f"500 Internal Server Error: {error}")
        return jsonify({
            "success": False,
            "error": {"code": "internal_error", "message": "Internal server error"}
        }), 500

    logger.info("Flask app created successfully")
    return app


app = create_app()

if __name__ == "__main__":
    # This block runs only when app.py is invoked directly (not via run.py).
    # In production/Catalyst, run.py is the entry point and it reads
    # X_ZOHO_CATALYST_LISTEN_PORT before calling app.run().
    port = int(os.environ.get("X_ZOHO_CATALYST_LISTEN_PORT", 9000))
    logger.info(f"Starting Flask directly on 0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)