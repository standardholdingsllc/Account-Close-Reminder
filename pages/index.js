import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function Home() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastScan, setLastScan] = useState(null);

  // Load initial data on component mount
  useEffect(() => {
    fetchLatestResults();
  }, []);

  const fetchLatestResults = async () => {
    try {
      const response = await fetch('/api/get-latest');
      if (response.ok) {
        const data = await response.json();
        setResults(data.results);
        setLastScan(data.timestamp);
      }
    } catch (error) {
      console.error('Failed to fetch latest results:', error);
    }
  };

  const handleScanNow = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/scan', { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        setResults(data.results);
        setLastScan(new Date().toISOString());
      } else {
        const error = await response.json();
        alert(`Error: ${error.message}`);
      }
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <Head>
        <title>Account Close Reminder</title>
        <meta name="description" content="Monitor negative balance accounts approaching closure" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <h1>Account Close Reminder</h1>
        <p>Monitoring accounts with negative balances for 50+ days</p>

        <div className="controls">
          <button 
            onClick={handleScanNow} 
            disabled={loading}
            className="scan-button"
          >
            {loading ? 'Scanning...' : 'Scan Now'}
          </button>
          {lastScan && (
            <p className="last-scan">
              Last scan: {new Date(lastScan).toLocaleString()}
            </p>
          )}
        </div>

        <div className="results">
          {results === null ? (
            <div className="loading">Loading...</div>
          ) : results.length === 0 ? (
            <div className="success">
              <span className="checkmark">✅</span>
              <h2>All Clear!</h2>
              <p>No accounts have been negative for 50+ days</p>
            </div>
          ) : (
            <div className="alerts">
              <h2>⚠️ Accounts Requiring Attention ({results.length})</h2>
              <div className="account-list">
                {results.map((account, index) => (
                  <div key={index} className="account-card">
                    <div className="account-header">
                      <h3>{account.customerName}</h3>
                      <span className="days-badge">{account.daysNegative} days</span>
                    </div>
                    <div className="account-details">
                      <p><strong>Customer ID:</strong> {account.customerId}</p>
                      <p><strong>Account ID:</strong> {account.accountId}</p>
                      <p><strong>Current Balance:</strong> ${account.balance}</p>
                      <p><strong>Negative Since:</strong> {new Date(account.negativeSince).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <style jsx>{`
        .container {
          min-height: 100vh;
          padding: 2rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif;
        }

        main {
          max-width: 1200px;
          margin: 0 auto;
          background: white;
          border-radius: 12px;
          padding: 2rem;
          box-shadow: 0 20px 40px rgba(0,0,0,0.1);
        }

        h1 {
          color: #333;
          text-align: center;
          margin-bottom: 0.5rem;
          font-size: 2.5rem;
        }

        p {
          text-align: center;
          color: #666;
          margin-bottom: 2rem;
        }

        .controls {
          text-align: center;
          margin-bottom: 2rem;
        }

        .scan-button {
          background: #4CAF50;
          color: white;
          border: none;
          padding: 12px 24px;
          font-size: 16px;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.3s ease;
        }

        .scan-button:hover:not(:disabled) {
          background: #45a049;
        }

        .scan-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .last-scan {
          margin-top: 1rem;
          font-size: 0.9rem;
          color: #888;
        }

        .loading {
          text-align: center;
          color: #666;
          font-size: 1.1rem;
        }

        .success {
          text-align: center;
          padding: 3rem;
        }

        .checkmark {
          font-size: 4rem;
          display: block;
          margin-bottom: 1rem;
        }

        .success h2 {
          color: #4CAF50;
          margin-bottom: 1rem;
        }

        .alerts h2 {
          color: #ff6b6b;
          margin-bottom: 1.5rem;
        }

        .account-list {
          display: grid;
          gap: 1rem;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
        }

        .account-card {
          border: 2px solid #ff6b6b;
          border-radius: 8px;
          padding: 1.5rem;
          background: #fff5f5;
        }

        .account-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .account-header h3 {
          margin: 0;
          color: #333;
        }

        .days-badge {
          background: #ff6b6b;
          color: white;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.9rem;
          font-weight: bold;
        }

        .account-details p {
          margin: 0.5rem 0;
          text-align: left;
          font-size: 0.95rem;
        }

        @media (max-width: 768px) {
          .container {
            padding: 1rem;
          }
          
          .account-list {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
