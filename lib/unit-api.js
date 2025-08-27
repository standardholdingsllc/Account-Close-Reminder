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
        const balanceInCents = parseFloat(account.attributes?.balance || '0');
        if (balanceInCents < 0) {
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

  async getLastTransactionDate(accountId) {
    // Simple approach: get the most recent transaction
    const endpoint = `/transactions?filter[accountId]=${accountId}&page[limit]=1&sort=-createdAt`;
    const response = await this.request(endpoint);
    
    if (response.data && response.data.length > 0) {
      return new Date(response.data[0].attributes.createdAt);
    }
    
    return null; // No transactions found
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
        balance: `$${(parseFloat(targetAccount.attributes?.balance) / 100).toFixed(2)} (${targetAccount.attributes?.balance} cents)`,
        status: targetAccount.attributes?.status,
        customerId: targetAccount.relationships?.customer?.data?.id
      });
    } else {
      console.log(`DEBUG: Target customer ${targetCustomerId} NOT found among ${negativeAccounts.length} negative balance accounts`);
    }

    console.log(`Found ${negativeAccounts.length} accounts with negative balances`);

    // For each negative balance account, check days since last transaction
    for (const account of negativeAccounts) {
      try {
        const accountId = account.id;
        const balanceInCents = parseFloat(account.attributes.balance);
        const balance = balanceInCents / 100; // Convert cents to dollars
        
        console.log(`Checking account ${accountId} with balance $${balance.toFixed(2)} (${balanceInCents} cents)`);
        
        // Get the most recent transaction date
        const lastTransactionDate = await api.getLastTransactionDate(accountId);
        
        if (!lastTransactionDate) {
          console.log(`Account ${accountId}: No transactions found - skipping`);
          continue;
        }

        const daysSinceLastActivity = daysBetween(new Date(), lastTransactionDate);
        
        console.log(`Account ${accountId}: ${daysSinceLastActivity} days since last transaction (${lastTransactionDate.toLocaleDateString()}), balance: $${balance.toFixed(2)}`);

        // Alert if negative balance AND no activity for 50+ days
        if (daysSinceLastActivity >= 50) {
          // Get customer information
          const customer = await api.getCustomer(account.relationships?.customer?.data?.id);
          
          alertAccounts.push({
            accountId: accountId,
            customerId: customer.id,
            customerName: `${customer.attributes?.firstName || ''} ${customer.attributes?.lastName || ''}`.trim() || 'Unknown',
            balance: balance.toFixed(2),
            daysNegative: daysSinceLastActivity,
            negativeSince: lastTransactionDate.toISOString()
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
