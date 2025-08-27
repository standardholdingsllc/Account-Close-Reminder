import UnitAPI from '../../lib/unit-api';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const api = new UnitAPI();
    
    // Test basic connection with a simple endpoint
    console.log('Testing Unit API connection...');
    
    // Try to get the first few accounts as a basic connectivity test
    const response = await api.request('/accounts?page[limit]=5');
    
    res.status(200).json({
      success: true,
      message: 'Unit API connection successful',
      accountCount: response.data ? response.data.length : 0,
      sampleResponse: {
        hasData: !!response.data,
        firstAccountId: response.data && response.data[0] ? response.data[0].id : null
      }
    });

  } catch (error) {
    console.error('Unit API connection test failed:', error);
    res.status(500).json({ 
      success: false,
      message: 'Unit API connection failed',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
