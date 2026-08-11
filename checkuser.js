require('dotenv').config(); 
const mongoose = require('mongoose'); 
mongoose.connect(process.env.MONGO_URI).then(async () => { 
  const db = mongoose.connection.db; 
  const user = await db.collection('employees').findOne({ email: 'aloka@gmail.com' }); 
  console.log(JSON.stringify(user, null, 2)); 
  process.exit(); 
}); 
