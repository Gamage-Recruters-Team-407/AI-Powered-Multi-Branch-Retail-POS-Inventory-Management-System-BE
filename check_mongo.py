import os
from pymongo import MongoClient
import dns.resolver

dns.resolver.default_resolver = dns.resolver.Resolver(configure=False)
dns.resolver.default_resolver.nameservers = ['8.8.8.8', '1.1.1.1', '8.8.4.4']

MONGO_URI = 'mongodb+srv://hirunahansindugamage_db_user:OSkevLS6a9tHpm2i@cluster1.gpz0msi.mongodb.net/?appName=Cluster1'
client = MongoClient(MONGO_URI)
db = client['retail_pos_db']

inv_count = db.inventories.count_documents({})
print(f"Total inventories: {inv_count}")

prod_count = db.products.count_documents({})
print(f"Total products: {prod_count}")

ls_pipeline = [
    {"$lookup": {"from": "products", "localField": "product", "foreignField": "_id", "as": "pd"}},
    {"$unwind": "$pd"},
    {"$match": {"$expr": {"$lte": ["$quantity", "$pd.reorderLevel"]}}},
    {"$count": "count"}
]
ls_agg = list(db.inventories.aggregate(ls_pipeline))
print(f"Low stock count (lte query): {ls_agg}")

ls_manual = list(db.inventories.aggregate([
    {"$lookup": {"from": "products", "localField": "product", "foreignField": "_id", "as": "pd"}},
    {"$unwind": "$pd"},
    {"$project": {"qty": "$quantity", "rl": "$pd.reorderLevel", "name": "$pd.name"}}
]))

missing_rl = 0
true_low = 0
for doc in ls_manual:
    rl = doc.get("rl")
    qty = doc.get("qty", 0)
    if rl is None:
        missing_rl += 1
    elif isinstance(rl, (int, float)) and qty <= rl:
        true_low += 1

print(f"Missing reorderLevel: {missing_rl}")
print(f"True low stock: {true_low}")
