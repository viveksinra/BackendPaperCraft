/**
 * Test script for CSV Upload functionality
 * 
 * This script demonstrates how to test the CSV upload functionality
 * either by calling the service directly or by hitting the API endpoint.
 */

const csvUploadService = require('../services/csvUploadService');
const path = require('path');

/**
 * Test the CSV upload service directly
 */
async function testCsvUploadService() {
  console.log('=== Testing CSV Upload Service ===');
  
  try {
    const result = await csvUploadService.uploadCurriculumData();
    
    if (result.success) {
      console.log('✅ CSV Upload Success:', result.message);
      console.log('📊 Details:', result.details);
    } else {
      console.log('❌ CSV Upload Failed:', result.message);
      console.log('🔍 Error:', result.error);
    }
  } catch (error) {
    console.error('💥 Unexpected error:', error.message);
  }
}

/**
 * Test individual CSV parsing functionality
 */
async function testCsvParsing() {
  console.log('\n=== Testing CSV Parsing ===');
  
  try {
    const csvFilePath = path.join(__dirname, '..', 'PPT Matching for english curriculum - Main.csv');
    const fs = require('fs');
    
    if (!fs.existsSync(csvFilePath)) {
      console.log('❌ CSV file not found at:', csvFilePath);
      return;
    }
    
    const csvContent = fs.readFileSync(csvFilePath, 'utf8');
    const csvRows = csvUploadService.parseCsv(csvContent);
    
    console.log(`✅ Parsed ${csvRows.length} rows from CSV`);
    
    // Show first row mapping
    if (csvRows.length > 0) {
      console.log('\n📝 Sample row mapping:');
      const mappedRow = csvUploadService.mapCsvRowToPdfSchema(csvRows[0]);
      console.log('Original CSV row:', csvRows[0]['Topic Title']);
      console.log('Mapped PDF data:', {
        name: mappedRow.name,
        url: mappedRow.url,
        gender: mappedRow.gender,
        ageRange: mappedRow.ageRange,
        englishLevel: mappedRow.englishLevel,
        objective: mappedRow.objective,
        interest: mappedRow.interest,
        focus: mappedRow.focus
      });
    }
    
  } catch (error) {
    console.error('💥 Error testing CSV parsing:', error.message);
  }
}

/**
 * Show API endpoint information
 */
function showApiInfo() {
  console.log('\n=== API Endpoint Information ===');
  console.log('🌐 Endpoint: GET /api/v1/pdf/upload-csv-curriculum');
  console.log('📄 Description: Upload curriculum data from CSV file');
  console.log('🔑 Access: Public (Admin)');
  console.log('');
  console.log('📝 Example usage:');
  console.log('curl -X GET http://localhost:8000/api/v1/pdf/upload-csv-curriculum');
  console.log('');
  console.log('✅ Success Response:');
  console.log(JSON.stringify({
    message: "CSV upload completed. X successful, Y failed out of Z total records.",
    variant: "success",
    myData: {
      total: 125,
      successful: 120,
      failed: 5,
      errors: []
    }
  }, null, 2));
  console.log('');
  console.log('❌ Error Response:');
  console.log(JSON.stringify({
    message: "Failed to upload CSV: Error details",
    variant: "error",
    myData: { error: "Error message" }
  }, null, 2));
}

/**
 * Main test function
 */
async function runTests() {
  console.log('🚀 Starting CSV Upload Tests...\n');
  
  // Test CSV parsing first
  await testCsvParsing();
  
  // Show API information
  showApiInfo();
  
  // Uncomment the line below to test actual upload (only run this once!)
  // await testCsvUploadService();
  
  console.log('\n✨ Test completed!');
  console.log('');
  console.log('💡 To actually upload the CSV data, uncomment the testCsvUploadService() call above');
  console.log('   or hit the API endpoint: GET /api/v1/pdf/upload-csv-curriculum');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testCsvUploadService,
  testCsvParsing,
  showApiInfo,
  runTests
};
