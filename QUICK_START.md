# 🚀 Quick Start Guide - Step by Step

Follow these steps **exactly** to get your free aligner portal up and running.

---

## ✅ Step 1: Set Up Supabase (5 minutes)

### 1.1 Create Account
1. Open https://supabase.com in your browser
2. Click **"Start your project"**
3. Sign up with your email
4. Check email and verify

### 1.2 Create Project
1. Click **"New Project"**
2. Fill in:
   - **Organization**: Create new → "Shwan Orthodontics"
   - **Name**: `shwan-aligner-portal`
   - **Database Password**: Create strong password (**SAVE THIS!**)
   - **Region**: Europe West (Frankfurt, Germany) - closest to Iraq
   - **Plan**: FREE
3. Click **"Create new project"**
4. Wait 2-3 minutes for setup

### 1.3 Copy Your Credentials
1. In Supabase dashboard, click **Settings** (gear icon) → **API**
2. Copy these three values:

```
Project URL: https://xxxxxxxxxxxxx.supabase.co
anon public: eyJhbGciOiJI...  (starts with eyJ)
service_role: eyJhbGciOiJI...  (starts with eyJ - DIFFERENT from anon)
```

**⚠️ IMPORTANT**: Save these in a safe place!

---

## ✅ Step 2: Create Database Tables (2 minutes)

### 2.1 Run SQL Script
1. In Supabase, click **SQL Editor** in left sidebar
2. Click **"New query"**
3. On your computer, open this file:
   ```
   /home/administrator/projects/ShwNodApp/migrations/postgresql/01_create_aligner_tables.sql
   ```
4. Copy ALL the content
5. Paste into Supabase SQL Editor
6. Click **"Run"** (bottom right corner)
7. You should see: **"Success. No rows returned"** ✅

### 2.2 Verify Tables
1. Click **"Table Editor"** in left sidebar
2. You should see 5 tables:
   - `aligner_doctors`
   - `aligner_sets`
   - `aligner_batches`
   - `aligner_notes`
   - `aligner_set_payments`

---

## ✅ Step 3: Configure Your Main Server (5 minutes)

### 3.1 Add Supabase Credentials to .env

1. Open `.env` file in your main project:
   ```bash
   nano /home/administrator/projects/ShwNodApp/.env
   ```

2. Add these lines at the end:
   ```bash
   # Supabase Configuration
   SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
   SUPABASE_ANON_KEY=eyJhbGc...  # Paste your anon key
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # Paste your service_role key
   ```

3. Save and close (Ctrl+X, Y, Enter)

### 3.2 Install Supabase Package

```bash
cd /home/administrator/projects/ShwNodApp
npm install @supabase/supabase-js
```

---

## ✅ Step 4: Run Initial Data Migration (5 minutes)

This copies all existing aligner data from your SQL Server to Supabase.

```bash
cd /home/administrator/projects/ShwNodApp
node services/sync/initial-migration.js
```

**Expected output:**
```
🚀 Starting Initial Migration: SQL Server → PostgreSQL
================================================
✅ Connected to Supabase

📋 Migrating AlignerDoctors...
✅ Migrated 5 doctors

📋 Migrating Aligner Sets...
✅ Migrated 47 aligner sets

📋 Migrating Aligner Batches...
✅ Migrated 123 batches

📋 Migrating Aligner Notes...
✅ Migrated 89 notes

✅ MIGRATION COMPLETED SUCCESSFULLY!
```

**❌ If you see errors:**
- Check your SQL Server is running
- Check Supabase credentials in .env
- Make sure database tables were created (Step 2)

---

## ✅ Step 5: Set Up External Portal App (5 minutes)

### 5.1 Install Dependencies

```bash
cd /home/administrator/projects/ShwNodApp/aligner-portal-external
npm install
```

### 5.2 Create .env File

```bash
cd /home/administrator/projects/ShwNodApp/aligner-portal-external
cp .env.example .env
nano .env
```

Add your Supabase credentials:

```bash
VITE_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc... # Paste your ANON key (NOT service_role!)
```

Save and close.

### 5.3 Test Locally

```bash
npm run dev
```

Open in browser: http://localhost:5173?email=doctor@example.com

(Replace with a real doctor email from your database)

**✅ If it works:** You'll see the portal with cases!
**❌ If blank:** Check browser console (F12) for errors

---

## ✅ Step 6: Deploy to Cloudflare Pages (10 minutes)

### 6.1 Build the App

```bash
cd /home/administrator/projects/ShwNodApp/aligner-portal-external
npm run build
```

You should see a `dist/` folder created.

### 6.2 Create Cloudflare Account

1. Go to https://dash.cloudflare.com
2. Sign up (free)
3. Verify email

### 6.3 Deploy to Pages

1. In Cloudflare dashboard, click **"Pages"** in left sidebar
2. Click **"Create a project"**
3. Click **"Upload assets"**
4. Drag and drop the `dist/` folder
5. Project name: `shwan-aligner-portal`
6. Click **"Deploy site"**
7. Wait 1-2 minutes

### 6.4 Add Environment Variables

1. In your Pages project, click **"Settings"** → **"Environment variables"**
2. Click **"Add variable"** for **Production**:
   - Variable name: `VITE_SUPABASE_URL`
   - Value: `https://xxxxxxxxxxxxx.supabase.co`
3. Click **"Add variable"** again:
   - Variable name: `VITE_SUPABASE_ANON_KEY`
   - Value: `eyJhbGc...` (your anon key)
4. Click **"Save"**

### 6.5 Redeploy

1. Go to **"Deployments"** tab
2. Click **"Retry deployment"** (to pick up env variables)

### 6.6 Get Your URL

You'll get a URL like: `https://shwan-aligner-portal.pages.dev`

**✅ Test it!** Open the URL in browser.

---

## ✅ Step 7: Set Up Cloudflare Access (Authentication) (10 minutes)

### 7.1 Enable Zero Trust

1. In Cloudflare dashboard, click **"Zero Trust"** in left sidebar
2. If prompted, set up organization name: "Shwan Orthodontics"
3. Choose **"Free"** plan

### 7.2 Create Access Application

1. Go to **"Access"** → **"Applications"**
2. Click **"Add an application"**
3. Select **"Self-hosted"**
4. Fill in:
   - **Application name**: Shwan Aligner Portal
   - **Session Duration**: 24 hours
   - **Application domain**:
     - Type: `shwan-aligner-portal.pages.dev`
     - Path: Leave blank (protects entire site)
5. Click **"Next"**

### 7.3 Create Access Policy

1. **Policy name**: Authorized Doctors Only
2. **Action**: Allow
3. **Configure rules**:
   - Rule type: **"Include"**
   - Selector: **"Emails"**
   - Value: Enter doctor email (e.g., `dr.smith@example.com`)
   - Click **"Add"** to add more emails
4. Add all authorized doctor emails
5. Click **"Next"**
6. **CORS Settings**: Leave as default
7. Click **"Add application"**

### 7.4 Test Authentication

1. Open `https://shwan-aligner-portal.pages.dev`
2. You should see Cloudflare login page
3. Enter an authorized doctor email
4. Check email for OTP code
5. Enter code
6. You should see the portal! ✅

---

## ✅ Step 8: Set Up Two-Way Sync (5 minutes)

### 8.1 Add Sync Routes to Your Server

1. Open `/home/administrator/projects/ShwNodApp/index.js`
2. Add these lines BEFORE `app.listen(...)`:

```javascript
// Import sync modules
import syncWebhookRouter from './routes/sync-webhook.js';
import syncScheduler from './services/sync/sync-scheduler.js';

// Add sync webhook route
app.use(syncWebhookRouter);
```

3. Add this AFTER `app.listen(...)`:

```javascript
// Start periodic sync (SQL Server → PostgreSQL)
syncScheduler.start();
console.log('✅ Sync scheduler started');
```

4. Save the file

### 8.2 Restart Your Server

```bash
# Stop current server (Ctrl+C if running)
node index.js
```

You should see:
```
🚀 Starting sync scheduler (every 15 minutes)
✅ Sync scheduler started
```

### 8.3 Configure Supabase Webhooks

This syncs doctor edits back to SQL Server.

**Option A: If your server has public IP/domain**

1. In Supabase, go to **"Database"** → **"Webhooks"**
2. Click **"Create a new hook"**
3. **For Notes:**
   - Name: `sync-notes-to-sqlserver`
   - Table: `aligner_notes`
   - Events: ☑ Insert
   - Type: HTTP Request
   - Method: POST
   - URL: `http://your-server-ip:3000/api/sync/webhook`
   - Click **"Create webhook"**

4. **For Batch Days:**
   - Name: `sync-batch-days`
   - Table: `aligner_batches`
   - Events: ☑ Update
   - Type: HTTP Request
   - Method: POST
   - URL: `http://your-server-ip:3000/api/sync/webhook`
   - Click **"Create webhook"**

**Option B: If testing locally (use ngrok)**

```bash
# Install ngrok if not installed
# Download from https://ngrok.com

# Run ngrok
ngrok http 3000

# Use the ngrok URL (e.g., https://abc123.ngrok.io/api/sync/webhook)
```

---

## ✅ Step 9: Test Everything! (5 minutes)

### 9.1 Test Portal Access
1. Go to your Cloudflare Pages URL
2. Log in with authorized doctor email
3. Verify you can see cases ✅

### 9.2 Test Adding a Note
1. Select a case
2. Expand a set
3. Click **"Add Note"**
4. Type a test message
5. Click **"Send Note"**
6. **Check SQL Server** - note should appear instantly! ✅

### 9.3 Test Updating Days
1. In a batch, click edit icon next to "Days"
2. Change the value
3. Click **"Save"**
4. **Check SQL Server** - days should update! ✅

### 9.4 Test Sync from SQL Server
1. In your clinic system, add a new aligner set
2. Wait 15 minutes (or trigger manual sync)
3. Refresh portal - new set should appear! ✅

**Manual sync trigger:**
```bash
curl -X POST http://localhost:3000/api/sync/trigger
```

---

## 🎉 Congratulations!

You now have a **100% FREE** cloud-hosted aligner portal!

### What You've Built:
- ✅ Portal hosted on Cloudflare Pages (unlimited bandwidth)
- ✅ PostgreSQL database on Supabase (500MB free)
- ✅ Secure authentication with Cloudflare Access
- ✅ Two-way sync with your SQL Server
- ✅ Real-time updates when doctors edit

### Costs:
- **$0/month** 🎉

---

## 📊 Monitor Your Setup

### Check Sync Status
```bash
curl http://localhost:3000/api/sync/status
```

### Supabase Dashboard
- Monitor database usage
- View logs
- Check webhook deliveries

### Cloudflare Pages
- View deployment history
- Monitor bandwidth (unlimited!)
- Check Access logs

---

## 🆘 Troubleshooting

### Portal shows "Doctor not found"
1. Check doctor email is in `aligner_doctors` table
2. Check Cloudflare Access has that email authorized
3. Check email matches exactly (lowercase)

### Sync not working
1. Check server logs for errors
2. Run manual sync: `curl -X POST http://localhost:3000/api/sync/trigger`
3. Check Supabase webhook logs

### No data in portal
1. Did initial migration run successfully?
2. Check Supabase Table Editor - is data there?
3. Check browser console (F12) for errors

---

## 📞 Next Steps

1. ✅ Test with all doctors
2. ✅ Add custom domain (optional)
3. ✅ Run both portals in parallel for 1-2 weeks
4. ✅ Monitor sync for any issues
5. ✅ Gradually migrate all doctors to new portal

---

**Questions?** Check `/docs/MIGRATION_GUIDE.md` for detailed documentation.

**Good luck!** 🚀
