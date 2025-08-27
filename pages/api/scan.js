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

// Send professional Slack notification to accounting team
async function sendSlackNotification(results, isManual = false) {
  const slackWebhook = process.env.SLACK_WEBHOOK_URL;
  if (!slackWebhook) {
    console.log('No Slack webhook configured - skipping notification');
    return;
  }

  // Only send notifications when accounts need attention
  if (results.length === 0) {
    console.log('No accounts requiring attention - skipping Slack notification');
    return;
  }

  // Calculate total negative amount
  const totalNegative = results.reduce((sum, account) => sum + Math.abs(parseFloat(account.balance)), 0);

  const message = {
    text: `🚨 URGENT: ${results.length} accounts will be closed soon`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🚨 Account Close Alert - Action Required"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${results.length} account(s)* will be closed soon - dormant with negative balances for 50+ days.\n\n*Total Amount at Risk:* $${totalNegative.toFixed(2)}`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:rotating_light: *Accounts will be closed soon (${results.length} accounts)*`
        }
      }
    ]
  };

  // Add each account
  results.forEach(account => {
    message.blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${account.customerName}*\n:warning: Balance: *$${account.balance}* | Days Inactive: *${account.daysNegative}*\n:bust_in_silhouette: Customer ID: \`${account.customerId}\` | :bank: Account ID: \`${account.accountId}\``
      }
    });
  });

  // Add footer with timing info
  const scanType = isManual ? "Manual scan" : "Daily automated scan";
  message.blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `${scanType} completed at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST | <https://account-close-reminder.vercel.app|View Dashboard>`
      }
    ]
  });

  await sendSlackMessage(slackWebhook, message);
}

// Helper function to send Slack message
async function sendSlackMessage(webhookUrl, message) {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      console.error('Failed to send Slack notification:', await response.text());
    } else {
      console.log('Slack notification sent successfully to accounting team');
    }
  } catch (error) {
    console.error('Error sending Slack notification:', error);
  }
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
    
    // Send Slack notification for manual scans (but only if results found)
    if (results.length > 0) {
      await sendSlackNotification(results, true);
    }
    
    console.log(`Scan completed. Found ${results.length} accounts requiring attention.`);
    
    res.status(200).json({
      success: true,
      results: results,
      timestamp: savedData.timestamp,
      message: `Found ${results.length} account(s) requiring attention`,
      slackNotified: results.length > 0 ? 'Accounting team notified via Slack' : 'No Slack notification sent (no accounts found)'
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
