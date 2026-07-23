import os
from pymongo import MongoClient
import dns.resolver

dns.resolver.default_resolver = dns.resolver.Resolver(configure=False)
dns.resolver.default_resolver.nameservers = ['8.8.8.8', '1.1.1.1', '8.8.4.4']

MONGO_URI = 'mongodb+srv://hirunahansindugamage_db_user:OSkevLS6a9tHpm2i@cluster1.gpz0msi.mongodb.net/?appName=Cluster1'
client = MongoClient(MONGO_URI)
db = client['retail_pos_db']

ls_pipeline = [
    {"$group": {"_id": "$product", "totalQuantity": {"$sum": "$quantity"}}},
    {"$lookup": {"from": "products", "localField": "_id", "foreignField": "_id", "as": "pd"}},
    {"$unwind": "$pd"},
    {"$match": {"$expr": {"$lte": ["$totalQuantity", "$pd.reorderLevel"]}}},
    {"$count": "count"}
]
ls_agg = list(db.inventories.aggregate(ls_pipeline))
print(f"Grouped Low stock count: {ls_agg}")
