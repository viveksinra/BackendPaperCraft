/**
 * One-time script to fix stale MongoDB indexes on the templates collection.
 * Run with: node scripts/fix-template-indexes.js
 * 
 * This drops the old companyId_1_name_1 index that was causing duplicate key errors.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';

async function fixIndexes() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.\n');

  const db = mongoose.connection.db;
  const collection = db.collection('templates');

  // List current indexes
  console.log('Current indexes on templates collection:');
  const indexes = await collection.indexes();
  indexes.forEach((idx, i) => {
    console.log(`  ${i + 1}. ${idx.name}: ${JSON.stringify(idx.key)}`);
  });
  console.log('');

  // Drop stale indexes
  const staleIndexNames = ['companyId_1_name_1', 'slug_1', 'name_1'];
  
  for (const indexName of staleIndexNames) {
    const exists = indexes.some(idx => idx.name === indexName);
    if (exists) {
      console.log(`Dropping stale index: ${indexName}...`);
      try {
        await collection.dropIndex(indexName);
        console.log(`  ✓ Dropped ${indexName}`);
      } catch (err) {
        console.log(`  ✗ Error dropping ${indexName}: ${err.message}`);
      }
    }
  }

  // Sync with schema-defined indexes
  console.log('\nSyncing indexes with schema...');
  const Template = require('../Models/Template');
  await Template.syncIndexes();
  console.log('  ✓ Indexes synced');

  // Show final state
  console.log('\nFinal indexes on templates collection:');
  const finalIndexes = await collection.indexes();
  finalIndexes.forEach((idx, i) => {
    console.log(`  ${i + 1}. ${idx.name}: ${JSON.stringify(idx.key)}`);
  });

  console.log('\n✅ Done!');
  process.exit(0);
}

fixIndexes().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});


