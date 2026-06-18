import os
from datetime import datetime, timedelta
from flask import Flask, jsonify, request
from flask_cors import CORS
import dns.resolver
from pymongo import MongoClient
from bson.objectid import ObjectId
from collections import Counter

app = Flask(__name__)
CORS(app)

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
        {"$project": {
            "productId": {"$toString": "$product"},
            "name": "$product_details.name",
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
    try:
        pid = ObjectId(product_id)
    except:
        pid = product_id

    pipeline = [
        {"$match": {"items.product": pid}},
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
        {"$match": {"createdAt": {"$gte": seven_days_ago}}},
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
        sales_pipeline = [
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
            f"Revenue reached ${total_rev:,.2f} across {total_ord} orders.",
            f"{top_prod} is currently your best-selling product.",
            f"There are {ls_count} items running low on stock."
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
    match_stage = {"customer": {"$ne": None}}
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
    try:
        cid = ObjectId(customer_id)
    except:
        cid = customer_id
        
    pipeline = [
        {"$match": {"customer": cid}},
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
        {"$project": {
            "productId": {"$toString": "$product"},
            "productName": "$product_details.name",
            "currentStock": "$quantity",
            "reorderLevel": "$product_details.reorderLevel",
            "isLow": {"$lte": ["$quantity", "$product_details.reorderLevel"]}
        }},
        {"$match": {"isLow": True}},
        {"$sort": {"currentStock": 1}},
        {"$limit": 1}
    ]
    ls_res = list(db.inventories.aggregate(ls_pipeline))
    if ls_res:
        item = ls_res[0]
        reorder_lvl = item.get("reorderLevel") or 10
        actions.append({
            "id": f"action_ls_{item['productId']}",
            "type": "LOW_STOCK",
            "urgency": "critical",
            "productId": item["productId"],
            "productName": item["productName"],
            "currentStock": item["currentStock"],
            "reorderLevel": reorder_lvl,
            "suggestedQuantity": max(reorder_lvl * 2, 50),
            "action": "create_po"
        })
        
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    tr_pipeline = [
        {"$match": {"createdAt": {"$gte": seven_days_ago}}},
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.product", "totalSold": {"$sum": "$items.quantity"}, "name": {"$first": "$items.name"}}},
        {"$sort": {"totalSold": -1}},
        {"$limit": 1}
    ]
    tr_res = list(db.sales.aggregate(tr_pipeline))
    if tr_res:
        item = tr_res[0]
        actions.append({
            "id": f"action_tr_{str(item['_id'])}",
            "type": "TRENDING",
            "urgency": "warning",
            "productId": str(item["_id"]),
            "productName": item["name"],
            "growth": 150, 
            "description": f"{item['name']} sales are surging. Consider a bundle offer.",
            "actionText": "Send Offer",
            "action": "send_offer"
        })
        
    return jsonify(actions)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
