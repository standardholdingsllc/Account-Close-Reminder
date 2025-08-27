// Unit API integration utilities

const UNIT_API_BASE = process.env.UNIT_API_URL || 'https://api.s.unit.sh';

class UnitAPI {
  constructor() {
    this.baseURL = UNIT_API_BASE;
    this.token = process.env.UNIT_API_TOKEN;
    
    if (!this.token) {
      throw new Error('UNIT_API_TOKEN environment variable is required');
    }
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/vnd.api+json',
        ...options.headers
      },
      ...options
    };

    console.log(`Making request to: ${url}`);
    console.log(`Using token: ${this.token ? this.token.substring(0, 20) + '...' : 'NOT SET'}`);
    
    try {
      const response = await fetch(url, config);
      
      console.log(`Response status: ${response.status}`);
      console.log(`Response headers:`, Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Unit API Error Response: ${errorText}`);
        throw new Error(`Unit API Error (${response.status}): ${errorText}`);
      }

      const responseText = await response.text();
      console.log(`Raw response: ${responseText.substring(0, 500)}...`);
      
      if (!responseText.trim()) {
        throw new Error('Empty response from Unit API');
      }

      try {
        return JSON.parse(responseText);
      } catch (jsonError) {
        console.error('Failed to parse JSON:', jsonError);
        console.error('Response text:', responseText);
        throw new Error(`Invalid JSON response from Unit API: ${jsonError.message}`);
      }
    } catch (error) {
      console.error('Unit API request failed:', error);
      throw error;
    }
  }

  async getAccounts(filters = {}) {
    let endpoint = '/accounts';
    const params = new URLSearchParams();

    // Add pagination - get more accounts to ensure we don't miss any
    params.append('page[limit]', '100');
    
    // Note: Unit API might not support direct balance filtering
    // We'll filter negative balances in the application code instead
    
    if (params.toString()) {
      endpoint += `?${params.toString()}`;
    }

    const response = await this.request(endpoint);
    return response.data || [];
  }

  async getAccountTransactions(accountId, limit = 100) {
    const endpoint = `/accounts/${accountId}/transactions?page[limit]=${limit}&sort=-createdAt`;
    const response = await this.request(endpoint);
    return response.data || [];
  }

  async getCustomer(customerId) {
    const endpoint = `/customers/${customerId}`;
    const response = await this.request(endpoint);
    return response.data;
  }
}

// Helper function to calculate days between dates
function daysBetween(date1, date2) {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round(Math.abs((date1 - date2) / oneDay));
}

// Main function to find accounts approaching closure
export async function findAccountsApproachingClosure() {
  const api = new UnitAPI();
  const alertAccounts = [];

  try {
    console.log('Fetching accounts with potential negative balances...');
    
    // Get all accounts (we'll filter for negative balances)
    const accounts = await api.getAccounts();
    console.log(`Found ${accounts.length} total accounts`);

    const negativeAccounts = accounts.filter(account => {
      const balance = parseFloat(account.attributes?.balance || '0');
      return balance < 0;
    });

    console.log(`Found ${negativeAccounts.length} accounts with negative balances`);

    // For each negative balance account, check how long it's been negative
    for (const account of negativeAccounts) {
      try {
        const accountId = account.id;
        const balance = parseFloat(account.attributes.balance);
        
        // Get recent transactions to find when balance went negative
        const transactions = await api.getAccountTransactions(accountId, 50);
        
        // Find the date when the account went negative
        let negativeSince = null;
        let runningBalance = balance;
        
        // Work backwards through transactions to find when balance became negative
        for (const transaction of transactions) {
          const amount = parseFloat(transaction.attributes.amount);
          const createdAt = new Date(transaction.attributes.createdAt);
          
          runningBalance -= amount;
          
          if (runningBalance >= 0 && balance < 0) {
            negativeSince = createdAt;
            break;
          }
        }

        // If we can't determine when it went negative, assume it was recent
        if (!negativeSince) {
          negativeSince = new Date();
          negativeSince.setDate(negativeSince.getDate() - 1);
        }

        const daysNegative = daysBetween(new Date(), negativeSince);
        
        console.log(`Account ${accountId}: ${daysNegative} days negative, balance: $${balance}`);

        // Alert if negative for 50+ days
        if (daysNegative >= 50) {
          // Get customer information
          const customer = await api.getCustomer(account.relationships?.customer?.data?.id);
          
          alertAccounts.push({
            accountId: accountId,
            customerId: customer.id,
            customerName: `${customer.attributes?.firstName || ''} ${customer.attributes?.lastName || ''}`.trim() || 'Unknown',
            balance: balance.toFixed(2),
            daysNegative: daysNegative,
            negativeSince: negativeSince.toISOString()
          });
        }
      } catch (error) {
        console.error(`Error processing account ${account.id}:`, error);
        // Continue with other accounts
      }
    }

    console.log(`Found ${alertAccounts.length} accounts requiring attention`);
    return alertAccounts;

  } catch (error) {
    console.error('Error in findAccountsApproachingClosure:', error);
    throw error;
  }
}

export default UnitAPI;
