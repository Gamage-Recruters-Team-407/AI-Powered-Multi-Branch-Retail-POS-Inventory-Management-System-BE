import os
from datetime import datetime, timedelta
from flask import Flask, jsonify, request
from flask_cors import CORS
import dns.resolver
from pymongo import MongoClient
from bson.objectid import ObjectId
from collections import Counter
import pandas as pd
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
import pickle

app = Flask(__name__)
CORS(app, supports_credentials=True)

MONGO_URI = os.environ.get('MONGO_URI', 'mongodb+srv://hirunahansindugamage_db_user:OSkevLS6a9tHpm2i@cluster1.gpz0msi.mongodb.net/?appName=Cluster1')
try:
    # Fix DNS resolution timeouts on Windows/local networks
    dns.resolver.default_resolver = dns.resolver.Resolver(configure=False)
    dns.resolver.default_resolver.nameservers = ['8.8.8.8', '1.1.1.1', '8.8.4.4']
    
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
    db = client['retail_pos_db']
    print("Successfully connected to MongoDB.")
except Exception as e:
    print(f"Error connecting to MongoDB: {e}")
    db = None

# Global in-memory ML models
ml_models = {
    'item_similarity_df': None,
    'user_item_matrix': None,
    'product_names': {}
}

def train_model():
    global ml_models
    if db is None:
        print("Cannot train model, no DB connection.")
        return False
        
    try:
        print("Fetching sales data for ML training...")
        sales = list(db.sales.find({"status": "COMPLETED"}, {"customer": 1, "items.product": 1, "items.name": 1, "items.quantity": 1}))
        
        if not sales:
            print("No sales data available to train model.")
            return False
            
        flat_data = []
        product_names = {}
        for sale in sales:
            customer_id = str(sale.get('customer', 'Unknown'))
            if customer_id == 'Unknown':
                continue
            for item in sale.get('items', []):
                prod_id = str(item.get('product'))
                qty = item.get('quantity', 1)
                name = item.get('name', 'Unknown')
                product_names[prod_id] = name
                flat_data.append({
                    'customer_id': customer_id,
                    'product_id': prod_id,
                    'quantity': qty
                })
                
        df = pd.DataFrame(flat_data)
        if df.empty:
            return False
            
        user_item_matrix = df.groupby(['customer_id', 'product_id'])['quantity'].sum().unstack(fill_value=0)
        item_user_matrix = user_item_matrix.T
        similarity_matrix = cosine_similarity(item_user_matrix)
        item_similarity_df = pd.DataFrame(
            similarity_matrix,
            index=item_user_matrix.index,
            columns=item_user_matrix.index
        )
        
        ml_models['item_similarity_df'] = item_similarity_df
        ml_models['user_item_matrix'] = user_item_matrix
        ml_models['product_names'] = product_names
        
        with open('recommendation_model.pkl', 'wb') as f:
            pickle.dump(ml_models, f)
            
        print("ML model successfully trained and cached in memory.")
        return True
    except Exception as e:
        print(f"Error training ML model: {e}")
        return False

@app.route('/predict/retrain', methods=['POST'])
def retrain():
    success = train_model()
    return jsonify({"success": success, "message": "Model retrained." if success else "Failed to retrain."})

def apply_limit(data, limit):
    try:
        limit_val = int(limit)
    except:
        limit_val = 10
    return data[:limit_val]

@app.route('/health', methods=['GET'])
def health():
    try:
        client.admin.command('ping')
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"
        
    return jsonify({
        "status": "healthy",
        "mongodb_status": db_status
    })

@app.route('/predict/sales/top-products', methods=['GET'])
def top_products():
    if db is None: return jsonify([])
    limit = int(request.args.get('limit', 10))
    pipeline = [
        {"$match": {"status": "COMPLETED"}},
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.product", "totalSold": {"$sum": "$items.quantity"}, "name": {"$first": "$items.name"}}},
        {"$sort": {"totalSold": -1}},
        {"$limit": limit},
        {"$project": {"productId": {"$toString": "$_id"}, "name": 1, "totalSold": 1, "_id": 0}}
    ]
    results = list(db.sales.aggregate(pipeline))
    return jsonify(results)

@app.route('/predict/inventory/low-stock', methods=['GET'])
def low_stock():
    if db is None: return jsonify([])
    limit = int(request.args.get('limit', 10))
    pipeline = [
        {"$lookup": {
            "from": "products",
            "localField": "product",
            "foreignField": "_id",
            "as": "product_details"
        }},
        {"$unwind": "$product_details"},
        {"$lookup": {
            "from": "branches",
            "localField": "branch",
            "foreignField": "_id",
            "as": "branch_details"
        }},
        {"$unwind": {"path": "$branch_details", "preserveNullAndEmptyArrays": True}},
        {"$project": {
            "productId": {"$toString": "$product"},
            "branchId": {"$toString": "$branch"},
            "name": "$product_details.name",
            "branchName": {"$ifNull": ["$branch_details.name", "Main Branch"]},
            "currentStock": "$quantity",
            "reorderLevel": "$product_details.reorderLevel",
            "isLow": {"$lte": ["$quantity", "$product_details.reorderLevel"]}
        }},
        {"$match": {"isLow": True}},
        {"$sort": {"currentStock": 1}},
        {"$limit": limit}
    ]
    results = list(db.inventories.aggregate(pipeline))
    for r in results:
        r.pop('_id', None)
        r.pop('isLow', None)
    return jsonify(results)

@app.route('/predict/cross-sell/<product_id>', methods=['GET'])
def cross_sell(product_id):
    if db is None: return jsonify([])
    limit = int(request.args.get('limit', 10))
    
    item_sim_df = ml_models.get('item_similarity_df')
    prod_names = ml_models.get('product_names', {})
    
    pid_str = str(product_id)
    if item_sim_df is not None and pid_str in item_sim_df.columns:
        try:
            # Get similar items, drop self
            similar = item_sim_df[pid_str].drop(pid_str, errors='ignore')
            similar = similar.sort_values(ascending=False).head(limit)
            
            if not similar.empty:
                results = []
                for pid, score in similar.items():
                    if score > 0:
                        results.append({
                            "productId": pid,
                            "name": prod_names.get(pid, "Unknown Product"),
                            "count": round(float(score * 100), 2)
                        })
                return jsonify(results)
        except Exception as e:
            print(f"ML cross-sell err: {e}")

    # Fallback to MongoDB aggregation
    try:
        pid = ObjectId(product_id)
    except:
        pid = product_id

    pipeline = [
        {"$match": {"items.product": pid, "status": "COMPLETED"}},
        {"$unwind": "$items"},
        {"$match": {"items.product": {"$ne": pid}}},
        {"$group": {"_id": "$items.product", "count": {"$sum": 1}, "name": {"$first": "$items.name"}}},
        {"$sort": {"count": -1}},
        {"$limit": limit},
        {"$project": {"productId": {"$toString": "$_id"}, "name": 1, "count": 1, "_id": 0}}
    ]
    results = list(db.sales.aggregate(pipeline))
    return jsonify(results)

@app.route('/predict/trending', methods=['GET'])
def trending():
    if db is None: return jsonify([])
    limit = int(request.args.get('limit', 10))
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    pipeline = [
        {"$match": {"createdAt": {"$gte": seven_days_ago}, "status": "COMPLETED"}},
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.product", "totalSold": {"$sum": "$items.quantity"}, "name": {"$first": "$items.name"}}},
        {"$sort": {"totalSold": -1}},
        {"$limit": limit},
        {"$project": {"productId": {"$toString": "$_id"}, "name": 1, "totalSold": 1, "_id": 0}}
    ]
    results = list(db.sales.aggregate(pipeline))
    return jsonify(results)

@app.route('/predict/analytics', methods=['GET'])
def analytics():
    if db is None: 
        return jsonify({
            "kpis": {"totalRevenue": 0, "totalOrders": 0, "averageOrderValue": 0, "lowStockCount": 0, "topProduct": "N/A"},
            "insights": ["No database connection available."]
        })
        
    try:
        period = request.args.get('period', 'current')
        
        # Date filters: current = last 30 days, previous = 30-60 days ago
        now = datetime.utcnow()
        if period == 'previous':
            date_from = now - timedelta(days=60)
            date_to = now - timedelta(days=30)
        else:
            date_from = now - timedelta(days=30)
            date_to = now
        
        date_match = {"createdAt": {"$gte": date_from, "$lte": date_to}, "status": "COMPLETED"}
        
        sales_pipeline = [
            {"$match": date_match},
            {"$group": {
                "_id": None,
                "totalRevenue": {"$sum": "$totalAmount"},
                "totalOrders": {"$sum": 1}
            }}
        ]
        sales_agg = list(db.sales.aggregate(sales_pipeline))
        total_rev = sales_agg[0]["totalRevenue"] if sales_agg else 0
        total_ord = sales_agg[0]["totalOrders"] if sales_agg else 0
        avg_ord = round(total_rev / total_ord, 2) if total_ord > 0 else 0
        
        top_prod_pipeline = [
            {"$match": date_match},
            {"$unwind": "$items"},
            {"$group": {"_id": "$items.name", "count": {"$sum": "$items.quantity"}}},
            {"$sort": {"count": -1}},
            {"$limit": 1}
        ]
        top_prod_agg = list(db.sales.aggregate(top_prod_pipeline))
        top_prod = top_prod_agg[0]["_id"] if top_prod_agg else "N/A"
        
        ls_pipeline = [
            {"$lookup": {"from": "products", "localField": "product", "foreignField": "_id", "as": "pd"}},
            {"$unwind": "$pd"},
            {"$match": {"$expr": {"$lte": ["$quantity", "$pd.reorderLevel"]}}},
            {"$count": "count"}
        ]
        ls_agg = list(db.inventories.aggregate(ls_pipeline))
        ls_count = ls_agg[0]["count"] if ls_agg else 0
        
        insights = [
            f"Revenue reached Rs {total_rev:,.2f} across {total_ord} orders in the last 30 days.",
            f"{top_prod} is currently your best-selling product.",
            f"There are {ls_count} low stock alerts across all branches."
        ]
        
        return jsonify({
            "kpis": {
                "totalRevenue": total_rev,
                "totalOrders": total_ord,
                "averageOrderValue": avg_ord,
                "lowStockCount": ls_count,
                "topProduct": top_prod
            },
            "insights": insights
        })
    except Exception as e:
        return jsonify({
            "kpis": {"totalRevenue": 0, "totalOrders": 0, "averageOrderValue": 0, "lowStockCount": 0, "topProduct": "Error"},
            "insights": [f"Error generating insights: {str(e)}"]
        })

@app.route('/predict/customers/behavior', methods=['GET'])
def customer_behavior():
    if db is None: return jsonify([])
    customer_id = request.args.get('customerId')
    match_stage = {"customer": {"$ne": None}, "status": "COMPLETED"}
    if customer_id:
        try:
            match_stage["customer"] = ObjectId(customer_id)
        except:
            pass
            
    pipeline = [
        {"$match": match_stage},
        {"$unwind": "$items"},
        {"$lookup": {
            "from": "customers",
            "localField": "customer",
            "foreignField": "_id",
            "as": "customer_details"
        }},
        {"$unwind": {"path": "$customer_details", "preserveNullAndEmptyArrays": False}},
        {"$group": {
            "_id": "$customer",
            "firstName": {"$first": "$customer_details.firstName"},
            "lastName": {"$first": "$customer_details.lastName"},
            "email": {"$first": "$customer_details.email"},
            "phone": {"$first": "$customer_details.phone"},
            "totalSpent": {"$sum": "$totalAmount"},
            "purchaseCount": {"$sum": 1},
            "products": {"$push": "$items.name"}
        }},
        {"$limit": 50}
    ]
    results = list(db.sales.aggregate(pipeline))
    formatted = []
    for r in results:
        top_products = [item[0] for item in Counter(r.get("products", [])).most_common(3)]
        fname = r.get("firstName") or ""
        lname = r.get("lastName") or ""
        email = r.get("email") or ""
        phone = r.get("phone") or ""
        
        cname = f"{fname} {lname}".strip()
        if not cname:
            cname = email if email else (phone if phone else "Unknown Customer")
            
        formatted.append({
            "customerId": str(r["_id"]),
            "customerName": cname,
            "totalSpent": r.get("totalSpent", 0),
            "purchaseCount": r.get("purchaseCount", 0),
            "topProducts": top_products
        })
    return jsonify(formatted)

@app.route('/predict/personalized/<customer_id>', methods=['GET'])
def personalized(customer_id):
    if db is None: return jsonify([])
    limit = int(request.args.get('limit', 10))
    
    item_sim_df = ml_models.get('item_similarity_df')
    user_item = ml_models.get('user_item_matrix')
    prod_names = ml_models.get('product_names', {})
    
    if item_sim_df is not None and user_item is not None:
        try:
            cid = str(customer_id)
            if cid in user_item.index:
                user_purchases = user_item.loc[cid]
                already_bought = user_purchases[user_purchases > 0].index
                
                scores = pd.Series(dtype=float)
                for item_id in already_bought:
                    sims = item_sim_df[item_id] * user_purchases[item_id]
                    scores = scores.add(sims, fill_value=0)
                
                scores = scores.drop(already_bought, errors='ignore')
                scores = scores.sort_values(ascending=False).head(limit)
                
                if not scores.empty:
                    results = []
                    for pid, score in scores.items():
                        if score > 0:
                            results.append({
                                "productId": pid,
                                "name": prod_names.get(pid, "Unknown Product"),
                                "score": round(float(score), 2)
                            })
                    if len(results) > 0:
                        return jsonify(results)
        except Exception as e:
            print(f"ML personalized err: {e}")
            
    # Fallback to the old logic
    try:
        cid = ObjectId(customer_id)
    except:
        cid = customer_id
        
    pipeline = [
        {"$match": {"customer": cid, "status": "COMPLETED"}},
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.product", "score": {"$sum": "$items.quantity"}, "name": {"$first": "$items.name"}}},
        {"$sort": {"score": -1}},
        {"$limit": limit},
        {"$project": {"productId": {"$toString": "$_id"}, "name": 1, "score": 1, "_id": 0}}
    ]
    results = list(db.sales.aggregate(pipeline))
    return jsonify(results)

@app.route('/predict/decisions', methods=['GET'])
def decisions():
    if db is None: return jsonify([])
    actions = []
    
    ls_pipeline = [
        {"$lookup": {
            "from": "products",
            "localField": "product",
            "foreignField": "_id",
            "as": "product_details"
        }},
        {"$unwind": "$product_details"},
        {"$lookup": {
            "from": "branches",
            "localField": "branch",
            "foreignField": "_id",
            "as": "branch_details"
        }},
        {"$unwind": {"path": "$branch_details", "preserveNullAndEmptyArrays": True}},
        {"$project": {
            "productId": {"$toString": "$product"},
            "branchId": {"$toString": "$branch"},
            "productName": "$product_details.name",
            "branchName": {"$ifNull": ["$branch_details.name", "Main Branch"]},
            "currentStock": "$quantity",
            "reorderLevel": "$product_details.reorderLevel",
            "isLow": {"$lte": ["$quantity", "$product_details.reorderLevel"]}
        }},
        {"$match": {"isLow": True}},
        {"$sort": {"currentStock": 1}},
        {"$limit": 15}
    ]
    ls_res = list(db.inventories.aggregate(ls_pipeline))
    for item in ls_res:
        reorder_lvl = item.get("reorderLevel") or 10
        actions.append({
            "id": f"action_ls_{item['productId']}_{item.get('branchId', 'all')}",
            "type": "LOW_STOCK",
            "urgency": "critical" if item.get("currentStock", 0) <= 0 else "warning",
            "productId": item["productId"],
            "branchId": item.get("branchId"),
            "productName": item["productName"],
            "branchName": item.get("branchName"),
            "currentStock": item["currentStock"],
            "reorderLevel": reorder_lvl,
            "suggestedQuantity": max(reorder_lvl * 2, 50),
            "description": f"Current stock at {item.get('branchName')} is {item['currentStock']}. Minimum threshold is {reorder_lvl}. Recommend restocking {max(reorder_lvl * 2, 50)} immediately.",
            "actionText": "Restock Now",
            "action": "restock"
        })
        
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    tr_pipeline = [
        {"$match": {"createdAt": {"$gte": seven_days_ago}, "status": "COMPLETED"}},
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.product", "totalSold": {"$sum": "$items.quantity"}, "name": {"$first": "$items.name"}, "revenue": {"$sum": "$items.lineTotal"}}},
        {"$sort": {"totalSold": -1}},
        {"$limit": 3}
    ]
    tr_res = list(db.sales.aggregate(tr_pipeline))
    for item in tr_res:
        actions.append({
            "id": f"action_tr_{str(item['_id'])}",
            "type": "TRENDING",
            "urgency": "info",
            "productId": str(item["_id"]),
            "productName": item["name"],
            "growth": 150, 
            "description": f"{item['name']} sales are surging. Consider a bundle offer.",
            "actionText": "Send Offer",
            "action": "send_offer"
        })
        
    return jsonify(actions)

if __name__ == '__main__':
    train_model()
    app.run(host='0.0.0.0', port=5001, debug=True)
