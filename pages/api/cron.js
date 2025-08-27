import { findAccountsApproachingClosure } from '../../lib/unit-api';
import fs from 'fs';
import path from 'path';

// Store results in a simple JSON file
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

// Optional: Send Slack notification if you have a webhook URL
async function sendSlackNotification(results) {
  const slackWebhook = process.env.SLACK_WEBHOOK_URL;
  if (!slackWebhook || results.length === 0) return;

  const message = {
    text: `🚨 Account Close Alert: ${results.length} account(s) approaching closure`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Account Close Alert*\n${results.length} account(s) have been negative for 50+ days and are approaching closure in ~10 days.`
        }
      },
      {
        type: "divider"
      }
    ]
  };

  // Add each account as a block
  results.forEach(account => {
    message.blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${account.customerName}*\n• Customer ID: \`${account.customerId}\`\n• Account ID: \`${account.accountId}\`\n• Balance: $${account.balance}\n• Days Negative: ${account.daysNegative}`
      }
    });
  });

  try {
    const response = await fetch(slackWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      console.error('Failed to send Slack notification:', await response.text());
    } else {
      console.log('Slack notification sent successfully');
    }
  } catch (error) {
    console.error('Error sending Slack notification:', error);
  }
}

export default async function handler(req, res) {
  // Verify this is a cron request (optional security check)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.log('Cron job triggered (scheduled run)');
  }

  try {
    console.log(`Cron job started at ${new Date().toISOString()}`);
    
    // Find accounts approaching closure
    const results = await findAccountsApproachingClosure();
    
    // Save results
    const savedData = saveResults(results);
    
    // Send Slack notification if configured
    await sendSlackNotification(results);
    
    console.log(`Cron job completed. Found ${results.length} accounts requiring attention.`);
    
    res.status(200).json({
      success: true,
      timestamp: savedData.timestamp,
      count: results.length,
      message: `Daily scan completed. Found ${results.length} account(s) requiring attention.`
    });

  } catch (error) {
    console.error('Cron job failed:', error);
    res.status(500).json({ 
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
