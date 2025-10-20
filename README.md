# Shwan Aligner Portal - External Hosting Version

This is a **standalone version** of the Aligner Portal designed for external hosting on Cloudflare Pages.

## 🎯 What's Different from the Main App?

- **Completely separate codebase** - won't affect your local version
- **Connects directly to Supabase** (PostgreSQL) instead of your Express API
- **Static build** - deploys to Cloudflare Pages (100% FREE)
- **Two-way sync** - keeps data synchronized with your SQL Server

---

## 📦 Quick Start

### 1. Install Dependencies

```bash
cd aligner-portal-external
npm install
```

### 2. Configure Environment

Create `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Run Development Server

```bash
npm run dev
```

Open http://localhost:5173

### 4. Build for Production

```bash
npm run build
```

This creates a `dist/` folder ready for deployment.

---

## 🚀 Deploy to Cloudflare Pages

### Option 1: GitHub (Automatic Deployments)

1. Push this folder to a GitHub repository
2. Go to Cloudflare Pages dashboard
3. Click "Create a project" → "Connect to Git"
4. Select your repository
5. Build settings:
   - **Framework**: Vite
   - **Build command**: `npm run build`
   - **Build output**: `dist`
   - **Root directory**: `aligner-portal-external`
6. Add environment variables in Cloudflare Pages settings
7. Deploy!

### Option 2: Direct Upload

1. Run `npm run build`
2. Go to Cloudflare Pages
3. Click "Upload assets"
4. Drag the `dist/` folder
5. Deploy!

---

## 🔄 Sync with SQL Server

The sync service runs on your **main server** (not this app).

See `/docs/MIGRATION_GUIDE.md` for complete setup instructions.

**Quick summary:**
1. Initial migration copies all data to Supabase
2. Scheduled sync (every 15 min) keeps Supabase updated
3. Webhooks sync doctor edits back to SQL Server immediately

---

## 🧪 Testing

### Test Locally with Dev Doctor Email

```bash
# In .env
VITE_DEV_DOCTOR_EMAIL=doctor@example.com

# Then access:
http://localhost:5173?email=doctor@example.com
```

### Test Production Build

```bash
npm run build
npm run preview
```

---

## 📁 Project Structure

```
aligner-portal-external/
├── src/
│   ├── components/
│   │   └── AlignerPortal.jsx    # Main portal component
│   ├── lib/
│   │   └── supabase.js          # Supabase client
│   ├── App.jsx                   # Root component
│   ├── main.jsx                  # Entry point
│   └── styles.css                # Portal styles
├── index.html                    # HTML template
├── vite.config.js                # Build configuration
├── package.json
└── .env                          # Environment variables
```

---

## 🔒 Security

- ✅ Cloudflare Access handles authentication
- ✅ Supabase Row-Level Security protects data
- ✅ ANON key is safe for frontend use
- ❌ NEVER expose SERVICE_ROLE key in frontend

---

## 🆘 Troubleshooting

### "Failed to connect to Supabase"
- Check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`
- Ensure Supabase project is running

### "Doctor not found"
- Ensure doctor email exists in `aligner_doctors` table
- Check Cloudflare Access is configured with doctor's email

### "No data showing"
- Run initial migration: `node ../services/sync/initial-migration.js`
- Check sync status: `curl http://your-server/api/sync/status`

---

## 💰 Costs

- **Cloudflare Pages**: FREE (unlimited bandwidth)
- **Supabase**: FREE (500MB database)
- **Total**: $0/month

---

## 📞 Support

See the main migration guide: `/docs/MIGRATION_GUIDE.md`
