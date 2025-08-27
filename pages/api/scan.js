import { findAccountsApproachingClosure } from '../../lib/unit-api';
import fs from 'fs';
import path from 'path';

// Store results in a simple JSON file (in production, you'd use a database)
const RESULTS_FILE = path.join(process.cwd(), 'data', 'latest-results.json');

// Ensure data directory exists
function ensureDataDir() {
  const dataDir = path.dirname(RESULTS_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
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
    res.status(500).json({ 
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
