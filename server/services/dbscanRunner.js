'use strict';

/**
 * dbscanRunner.js — HTTP Client to ML Service
 */

class DbscanRunner {
  
  /**
   * Generic HTTP POST client to ML Service
   */
  static async _post(endpoint, payload, timeoutMs = 30000) {
    const baseUrl = (process.env.ML_SERVICE_URL || 'http://localhost:5001').trim();
    const url = new URL(endpoint, baseUrl).href;
    console.log('[DEBUG] Requesting URL:', url);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      const text = await response.text();
      
      if (!response.ok) {
        throw new Error(`ML Service Error HTTP ${response.status}: ${text}`);
      }
      
      try {
        return JSON.parse(text);
      } catch (err) {
        throw new Error(`Invalid JSON from ML service. Status: ${response.status}. Body: ${text.substring(0, 200)}`);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`Request to ML service timed out after ${timeoutMs}ms`);
      }
      throw new Error(`ML service offline or connection failed: ${err.message}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Run DBSCAN clustering on the CSV at the given path.
   *
   * @param {string} [csvPath] - Absolute path to the temporary CSV file
   * @returns {Promise<Object>}
   */
  static async run(csvPath) {
    if (!csvPath) {
       console.log('[DBSCAN CLIENT] run() called without CSV path (predictions route). Returning empty stub.');
       return { clusters: [], hotspots: [], metrics: { total_clusters: 0, noise_points: 0, runtime_seconds: 0, number_of_clusters: 0, noise_count: 0 } };
    }

    console.log(`[DBSCAN CLIENT] Sending request to ML Service for CSV: ${csvPath}`);
    const start = Date.now();
    
    try {
      const response = await this._post('/api/dbscan/run', { csv_path: csvPath });
      const elapsed = Date.now() - start;
      console.log(`[DBSCAN CLIENT] Response received. Completed in ${elapsed} ms.`);
      return response;
    } catch (error) {
      const elapsed = Date.now() - start;
      console.error(`[DBSCAN CLIENT] Failed after ${elapsed} ms. Error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = DbscanRunner;
