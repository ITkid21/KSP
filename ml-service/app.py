from flask import Flask, jsonify
from routes.dbscan import dbscan_bp

app = Flask(__name__)

# Register Blueprints
app.register_blueprint(dbscan_bp)

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "service": "ml-service"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
