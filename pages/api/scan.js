import { findAccountsApproachingClosure } from '../../lib/unit-api';
import fs from 'fs';
import path from 'path';

// Store results in serverless-compatible temp directory
const RESULTS_FILE = path.join('/tmp', 'latest-results.json');

// Ensure temp directory exists (not needed for /tmp, but keeping for compatibility)
function ensureDataDir() {
  // /tmp directory always exists in serverless environments
  return;
}

function saveResults(results) {
  ensureDataDir();
  const data = {
    results,
    timestamp: new Date().toISOString(),
    count: results.length
  };
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(data, null, 2));
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    console.log('Manual scan initiated');
    console.log('Environment check:', {
      hasToken: !!process.env.UNIT_API_TOKEN,
      tokenLength: process.env.UNIT_API_TOKEN ? process.env.UNIT_API_TOKEN.length : 0,
      apiUrl: process.env.UNIT_API_URL || 'https://api.s.unit.sh'
    });
    
    // Find accounts approaching closure
    const results = await findAccountsApproachingClosure();
    
    // Save results
    const savedData = saveResults(results);
    
    console.log(`Scan completed. Found ${results.length} accounts requiring attention.`);
    
    res.status(200).json({
      success: true,
      results: results,
      timestamp: savedData.timestamp,
      message: `Found ${results.length} account(s) requiring attention`
    });

  } catch (error) {
    console.error('Scan failed:', error);
    
    // Provide more specific error information
    let userFriendlyMessage = error.message;
    if (error.message.includes('401')) {
      userFriendlyMessage = 'Authentication failed. Please check your UNIT_API_TOKEN.';
    } else if (error.message.includes('403')) {
      userFriendlyMessage = 'Access denied. Please check your API token permissions.';
    } else if (error.message.includes('404')) {
      userFriendlyMessage = 'API endpoint not found. Please check your UNIT_API_URL.';
    }
    
    res.status(500).json({ 
      success: false,
      message: userFriendlyMessage,
      originalError: error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
