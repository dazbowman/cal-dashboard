# Cloudflare Access Setup Guide

The dashboard is now live at https://cal-client.com but needs authentication protection.

## Setup Steps (via Cloudflare Dashboard)

1. **Log in to Cloudflare**: https://dash.cloudflare.com
   - Email: cal.ops.bowman@gmail.com
   - Password: (in credentials file)

2. **Navigate to Zero Trust**: 
   - Click on "Zero Trust" in the left sidebar
   - Or go to: https://one.dash.cloudflare.com

3. **Create Access Application**:
   - Go to Access → Applications → Add an application
   - Select "Self-hosted"
   - Configure:
     - Application name: `Cal Dashboard`
     - Session Duration: 24 hours (or preference)
     - Application domain: `cal-client.com`
     - Also add: `dashboard.cal-client.com`

4. **Create Access Policy**:
   - Policy name: `Email Allowlist`
   - Action: Allow
   - Add a rule:
     - Selector: `Emails`
     - Value: `cal.ops.bowman@gmail.com`
   - (Add more emails as needed)

5. **Authentication Method**:
   - Enable "One-time PIN" (email-based authentication)
   - This sends a code to allowed emails

6. **Save and Test**:
   - Visit https://cal-client.com
   - You should see Cloudflare Access login
   - Enter your email, receive PIN, enter PIN
   - Dashboard loads after authentication

## Alternative: API Setup

If you have a Cloudflare API token, update `/home/dbowman/.openclaw/credentials/cloudflare.json`:

```json
{
  "email": "cal.ops.bowman@gmail.com",
  "api_token": "YOUR_API_TOKEN_HERE",
  "zone_id": "YOUR_ZONE_ID",
  "account_id": "YOUR_ACCOUNT_ID"
}
```

Then the dashboard can be configured to manage Access programmatically.

## Current Status

✅ Dashboard running at https://cal-client.com
✅ Cloudflare tunnel active
⏳ Access authentication pending manual setup
