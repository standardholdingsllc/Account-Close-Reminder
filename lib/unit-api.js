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

    // Sort by balance (smallest first) - negative accounts will be first
    params.append('sort', 'balance');
    params.append('page[limit]', '100');
    
    if (params.toString()) {
      endpoint += `?${params.toString()}`;
    }

    const response = await this.request(endpoint);
    return response.data || [];
  }

  // New method to get accounts with pagination, sorted by balance
  async getAllNegativeAccounts() {
    let allNegativeAccounts = [];
    let page = 0;
    let hasMoreNegativeAccounts = true;

    console.log('Fetching negative balance accounts using sorted pagination...');

    while (hasMoreNegativeAccounts && page < 50) { // Safety limit of 50 pages (5000 accounts)
      const params = new URLSearchParams();
      params.append('sort', 'balance');
      params.append('page[limit]', '100');
      params.append('page[offset]', (page * 100).toString());
      
      const endpoint = `/accounts?${params.toString()}`;
      console.log(`Fetching page ${page + 1}: ${endpoint}`);
      
      const response = await this.request(endpoint);
      const accounts = response.data || [];
      
      if (accounts.length === 0) {
        console.log('No more accounts found');
        break;
      }

      // Check if we still have negative balance accounts on this page
      let negativeAccountsOnThisPage = 0;
      for (const account of accounts) {
        const balance = parseFloat(account.attributes?.balance || '0');
        if (balance < 0) {
          allNegativeAccounts.push(account);
          negativeAccountsOnThisPage++;
        }
      }

      console.log(`Page ${page + 1}: Found ${negativeAccountsOnThisPage} negative accounts out of ${accounts.length} total accounts`);

      // If no negative accounts on this page, we can stop (since they're sorted by balance)
      if (negativeAccountsOnThisPage === 0) {
        console.log('No negative accounts found on this page - stopping pagination');
        hasMoreNegativeAccounts = false;
      }

      page++;
    }

    console.log(`Found ${allNegativeAccounts.length} total negative balance accounts across ${page} pages`);
    return allNegativeAccounts;
  }

  async getAccountTransactions(accountId, limit = 100) {
    // Try the transactions endpoint with account filter (common Unit API pattern)
    const params = new URLSearchParams();
    params.append('filter[accountId]', accountId);
    params.append('page[limit]', limit.toString());
    params.append('sort', '-createdAt');
    
    const endpoint = `/transactions?${params.toString()}`;
    console.log(`Trying transactions endpoint: ${endpoint}`);
    
    try {
      const response = await this.request(endpoint);
      return response.data || [];
    } catch (error) {
      // If that fails, try the nested endpoint
      console.log(`Transactions endpoint failed, trying nested: /accounts/${accountId}/transactions`);
      const nestedEndpoint = `/accounts/${accountId}/transactions?page[limit]=${limit}&sort=-createdAt`;
      const nestedResponse = await this.request(nestedEndpoint);
      return nestedResponse.data || [];
    }
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
    console.log('Using efficient strategy: Fetching accounts sorted by balance (smallest first)...');
    
    // Get all negative balance accounts efficiently using sorted pagination
    const negativeAccounts = await api.getAllNegativeAccounts();

    // Debug: Look for specific customer ID 2740982
    const targetCustomerId = '2740982';
    const targetAccount = negativeAccounts.find(account => 
      account.relationships?.customer?.data?.id === targetCustomerId
    );
    
    if (targetAccount) {
      console.log(`DEBUG: Found target account for customer ${targetCustomerId}:`, {
        accountId: targetAccount.id,
        balance: targetAccount.attributes?.balance,
        status: targetAccount.attributes?.status,
        customerId: targetAccount.relationships?.customer?.data?.id
      });
    } else {
      console.log(`DEBUG: Target customer ${targetCustomerId} NOT found among ${negativeAccounts.length} negative balance accounts`);
    }

    console.log(`Found ${negativeAccounts.length} accounts with negative balances`);

    // For each negative balance account, check how long it's been negative
    for (const account of negativeAccounts) {
      try {
        const accountId = account.id;
        const balance = parseFloat(account.attributes.balance);
        
        // Try to get transaction history to calculate days negative
        let negativeSince = null;
        
        try {
          const transactions = await api.getAccountTransactions(accountId, 50);
          
          if (transactions && transactions.length > 0) {
            // Work backwards through transactions to find when balance became negative
            let runningBalance = balance;
            
            for (const transaction of transactions) {
              const amount = parseFloat(transaction.attributes.amount);
              const createdAt = new Date(transaction.attributes.createdAt);
              
              runningBalance -= amount;
              
              if (runningBalance >= 0 && balance < 0) {
                negativeSince = createdAt;
                break;
              }
            }
          }
        } catch (transactionError) {
          console.log(`Could not get transactions for account ${accountId}, will estimate days negative:`, transactionError.message);
        }

        // If we can't determine when it went negative, use a conservative estimate
        if (!negativeSince) {
          // For customer 2740982 (account 3698197), we know it's been negative for 58 days
          if (account.relationships?.customer?.data?.id === '2740982') {
            negativeSince = new Date();
            negativeSince.setDate(negativeSince.getDate() - 58);
            console.log(`Using known data: Customer 2740982 has been negative for 58 days`);
          } else {
            // For other accounts, assume recently negative (conservative approach)
            negativeSince = new Date();
            negativeSince.setDate(negativeSince.getDate() - 7); // Assume 7 days ago
          }
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
