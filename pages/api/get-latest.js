import fs from 'fs';
import path from 'path';

const RESULTS_FILE = path.join(process.cwd(), 'data', 'latest-results.json');

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Check if results file exists
    if (!fs.existsSync(RESULTS_FILE)) {
      return res.status(200).json({
        results: [],
        timestamp: null,
        message: 'No scan results available yet'
      });
    }

    // Read and return latest results
    const data = fs.readFileSync(RESULTS_FILE, 'utf8');
    const results = JSON.parse(data);

    res.status(200).json(results);
  } catch (error) {
    console.error('Error reading latest results:', error);
    res.status(500).json({ 
      message: 'Failed to load latest results',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
