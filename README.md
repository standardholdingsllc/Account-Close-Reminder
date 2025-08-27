# Account Close Reminder

A Vercel-hosted monitoring tool that tracks Unit banking accounts with negative balances and alerts when they're approaching the 60-day auto-closure threshold.

## Features

- 🔄 **Daily Automated Scans**: Runs every day at noon EST via Vercel cron
- 🚨 **Early Warning System**: Alerts when accounts have been negative for 50+ days (10-day buffer)
- 🎯 **Manual Scanning**: "Scan Now" button for immediate checks
- 💬 **Slack Integration**: Optional notifications to your team
- 🎨 **Clean Interface**: Shows customer names, IDs, balances, and timeline

## Quick Setup

### 1. Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

Or manually:

```bash
# Clone this repository
git clone <your-repo-url>
cd account-close-reminder

# Install dependencies
npm install

# Set up environment variables (see below)
cp .env.example .env.local

# Deploy to Vercel
vercel
```

### 2. Configure Environment Variables

Set these in your Vercel dashboard or `.env.local`:

```env
# Required: Your Unit API token
UNIT_API_TOKEN=your_unit_api_token_here

# Required: Unit API URL (sandbox or live)
UNIT_API_URL=https://api.s.unit.sh  # Sandbox
# UNIT_API_URL=https://api.unit.co   # Live

# Optional: Slack webhook for notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your/slack/webhook

# Optional: Secret for cron job security
CRON_SECRET=your_random_secret_string
```

### 3. Get Your Unit API Token

1. Log into your Unit Dashboard
2. Go to Developer → API Tokens
3. Create a new token with these permissions:
   - `accounts` (read)
   - `transactions` (read)
   - `customers` (read)
4. Copy the token to your environment variables

## How It Works

### Daily Monitoring
- **Cron Schedule**: Every day at 5:00 PM UTC (12:00 PM EST)
- **Process**:
  1. Fetches all accounts from Unit API
  2. Filters for negative balance accounts
  3. Analyzes transaction history to determine how long each account has been negative
  4. Identifies accounts negative for 50+ days
  5. Stores results and sends notifications

### Account Analysis
The system determines how long an account has been negative by:
1. Getting the current negative balance
2. Fetching recent transaction history
3. Working backwards through transactions to find when balance became negative
4. Calculating days between that date and today

### Alert Threshold
- **50 Days**: System alerts you
- **60 Days**: Unit automatically closes the account
- **10-Day Buffer**: Gives you time to top up accounts and prevent closure

## API Endpoints

### `GET /` 
Main dashboard interface

### `POST /api/scan`
Manually trigger a scan
- Returns: List of accounts requiring attention
- Updates stored results

### `GET /api/get-latest`
Get the latest scan results
- Returns: Cached results from last scan

### `GET /api/cron`
Scheduled endpoint (called by Vercel cron)
- Runs daily scan
- Updates results
- Sends Slack notifications (if configured)

## Slack Integration (Optional)

To receive Slack notifications:

1. Create a Slack webhook:
   - Go to https://api.slack.com/apps
   - Create new app → Incoming Webhooks
   - Copy webhook URL

2. Add to environment variables:
   ```env
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
   ```

3. The system will send notifications when accounts are found during the daily scan

## Development

```bash
# Run locally
npm run dev

# Test API endpoints
curl -X POST http://localhost:3000/api/scan
curl http://localhost:3000/api/get-latest
```

## File Structure

```
account-close-reminder/
├── pages/
│   ├── index.js              # Main dashboard
│   └── api/
│       ├── scan.js           # Manual scan endpoint  
│       ├── cron.js           # Scheduled scan endpoint
│       └── get-latest.js     # Get cached results
├── lib/
│   └── unit-api.js           # Unit API integration
├── data/
│   └── latest-results.json   # Cached scan results
├── vercel.json               # Vercel configuration
└── package.json
```

## Troubleshooting

### Common Issues

**"No accounts found"**
- Check your Unit API token permissions
- Verify you're using the correct API URL (sandbox vs live)
- Ensure your token has `accounts`, `transactions`, and `customers` read permissions

**Cron not running**
- Vercel crons require a Pro plan
- Check the Vercel dashboard → Functions → Crons
- Verify the cron expression in `vercel.json`

**API errors**
- Check Vercel function logs
- Verify environment variables are set
- Test API token with Unit's API directly

### Logs
Check function logs in Vercel dashboard → Functions → View Function Logs

## Security Notes

- API tokens are stored as environment variables (not in code)
- Optional cron secret prevents unauthorized cron triggers
- Customer data is only cached temporarily for UI display
- All API calls use HTTPS

## Unit API Permissions Required

Your API token needs these scopes:
- `accounts:read` - To list accounts and check balances  
- `transactions:read` - To analyze transaction history
- `customers:read` - To get customer names and IDs

## Support

- Unit API Documentation: https://www.unit.co/docs/api/
- Vercel Cron Documentation: https://vercel.com/docs/functions/cron-jobs
- Issues with this tool: Create a GitHub issue
