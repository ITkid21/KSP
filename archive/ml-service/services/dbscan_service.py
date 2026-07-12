import os
import logging
from models.DSBSCAN import run_dbscan as run_dbscan_model

logger = logging.getLogger(__name__)


def run_dbscan(csv_path, eps=0.5, min_samples=5):
    """Execute DBSCAN clustering on CSV data."""
    if not os.path.isfile(csv_path):
        logger.error(f"CSV file not found: {csv_path}")
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    logger.info(f"Running DBSCAN model on {csv_path}")
    try:
        result = run_dbscan_model(csv_path, eps=eps, min_samples=min_samples)
        logger.info(f"DBSCAN model execution successful")
        return result
    except Exception as e:
        logger.error(f"DBSCAN model execution failed: {e}")
        raise