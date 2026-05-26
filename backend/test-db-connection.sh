#!/bin/bash
# Test MongoDB Connection

echo "Testing MongoDB Atlas connection..."
echo "MONGODB_URI: $MONGODB_URI"

node -e "
const mongoose = require('mongoose');
const mongoUri = '$MONGODB_URI';

if (!mongoUri) {
  console.error('❌ MONGODB_URI is not set');
  process.exit(1);
}

mongoose.connect(mongoUri)
  .then(() => {
    console.log('✅ MongoDB connection successful');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });
" 2>&1
