const mongoose = require('mongoose');

async function run() {
    await mongoose.connect('mongodb+srv://hirunahansindugamage_db_user:OSkevLS6a9tHpm2i@cluster1.gpz0msi.mongodb.net/retail_pos_db?retryWrites=true&w=majority');
    
    const invCount = await mongoose.connection.db.collection('inventories').countDocuments();
    const prodCount = await mongoose.connection.db.collection('products').countDocuments();
    console.log('Total Inventories:', invCount);
    console.log('Total Products:', prodCount);
    
    const lsCount = await mongoose.connection.db.collection('inventories').aggregate([
        { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'pd' } },
        { $unwind: '$pd' },
        { $match: { $expr: { $lte: ['$quantity', '$pd.reorderLevel'] } } },
        { $count: 'count' }
    ]).toArray();
    console.log('Low Stock from Mongo (lte query):', lsCount);
    
    const lsManual = await mongoose.connection.db.collection('inventories').aggregate([
        { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'pd' } },
        { $unwind: '$pd' },
        { $project: { qty: '$quantity', rl: '$pd.reorderLevel' } }
    ]).toArray();
    
    let realLowStock = 0;
    let nullReorderLevel = 0;
    for (let i of lsManual) {
        if (i.rl == null) nullReorderLevel++;
        else if (i.qty <= i.rl) realLowStock++;
    }
    console.log('Manual check low stock (where rl != null):', realLowStock);
    console.log('Products where reorderLevel is null/undefined:', nullReorderLevel);
    
    process.exit();
}

run().catch(console.error);
