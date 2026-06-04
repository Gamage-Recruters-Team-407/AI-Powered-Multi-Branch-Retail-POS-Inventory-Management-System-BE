import os
import pickle
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

MODEL_PATH = 'recommendation_model.pkl'

# Try loading the model gracefully
model_data = {}
if os.path.exists(MODEL_PATH):
    try:
        with open(MODEL_PATH, 'rb') as f:
            model_data = pickle.load(f)
        print(f"Successfully loaded {MODEL_PATH}")
    except Exception as e:
        print(f"Failed to load {MODEL_PATH}: {e}")
else:
    print(f"⚠️ Warning: {MODEL_PATH} not found. Please place it in this directory.")

def apply_limit(data, limit):
    try:
        limit_val = int(limit)
    except:
        limit_val = 10
    return data[:limit_val]

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "healthy",
        "model_loaded": bool(model_data)
    })

@app.route('/predict/sales/top-products', methods=['GET'])
def top_products():
    limit = request.args.get('limit', 10)
    popular = model_data.get('popular_products', {})
    names = model_data.get('product_names', {})
    
    results = [
        {"productId": pid, "name": names.get(pid, f"Product {pid}"), "totalSold": sold}
        for pid, sold in popular.items()
    ]
    results = sorted(results, key=lambda x: x['totalSold'], reverse=True)
    return jsonify(apply_limit(results, limit))

@app.route('/predict/inventory/low-stock', methods=['GET'])
def low_stock():
    limit = request.args.get('limit', 10)
    inventory = model_data.get('inventory_data', [])
    return jsonify(apply_limit(inventory, limit))

@app.route('/predict/cross-sell/<product_id>', methods=['GET'])
def cross_sell(product_id):
    limit = request.args.get('limit', 10)
    pairs = model_data.get('cross_sell_pairs', {})
    names = model_data.get('product_names', {})
    
    results = []
    for (p1, p2), count in pairs.items():
        if p1 == product_id:
            results.append({"productId": p2, "name": names.get(p2, f"Product {p2}"), "count": count})
        elif p2 == product_id:
            results.append({"productId": p1, "name": names.get(p1, f"Product {p1}"), "count": count})
            
    results = sorted(results, key=lambda x: x['count'], reverse=True)
    return jsonify(apply_limit(results, limit))

@app.route('/predict/trending', methods=['GET'])
def trending():
    limit = request.args.get('limit', 10)
    trending_data = model_data.get('trending_products', [])
    names = model_data.get('product_names', {})
    
    results = []
    for item in trending_data:
        # Create a new dict so we don't mutate the original data
        new_item = dict(item)
        pid = new_item.get('productId')
        new_item['name'] = names.get(pid, f"Product {pid}")
        results.append(new_item)
        
    return jsonify(apply_limit(results, limit))

@app.route('/predict/analytics', methods=['GET'])
def analytics():
    analytics_data = model_data.get('conversational_analytics', {})
    return jsonify(analytics_data)

@app.route('/predict/customers/behavior', methods=['GET'])
def customer_behavior():
    customer_id = request.args.get('customerId')
    behavior = model_data.get('customer_behavior', [])
    if customer_id:
        filtered = [c for c in behavior if c.get('customerId') == customer_id]
        return jsonify(filtered)
    return jsonify(behavior)

@app.route('/predict/personalized/<customer_id>', methods=['GET'])
def personalized(customer_id):
    limit = request.args.get('limit', 10)
    pers = model_data.get('personalized_recommendations', [])
    
    customer_recs = next((c.get('recommendations', []) for c in pers if c.get('customerId') == customer_id), [])
    return jsonify(apply_limit(customer_recs, limit))

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
