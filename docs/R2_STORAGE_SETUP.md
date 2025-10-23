# Cloudflare R2 Storage Setup Guide - Edge Functions Version

This guide explains how to set up Cloudflare R2 for photo uploads in the external aligner portal using **Supabase Edge Functions**.

## Architecture Overview

```
Frontend → Supabase Edge Functions → Cloudflare R2
                ↓
         Supabase Database
```

This standalone app is **completely independent** from your Node.js server. All photo operations go through Supabase Edge Functions.

## Why This Architecture?

- **Serverless**: No backend server needed
- **Secure**: R2 credentials never exposed to frontend
- **Cost-effective**: $0 egress fees from R2
- **Scalable**: Edge Functions run globally on Cloudflare's network
- **Professional**: Industry-standard approach

## Why Cloudflare R2?

- **Pay-as-you-go**: No minimum fees
- **$0 egress**: Free downloads forever
- **Cheap storage**: $0.015/GB per month
- **S3-compatible**: Works with AWS SDK
- **Expected cost**: ~$0.04-0.10/month for typical usage

---

## Setup Steps

### 1. Create Cloudflare Account

1. Go to https://dash.cloudflare.com/sign-up
2. Sign up for a free account
3. Verify your email

### 2. Enable R2

1. Log into Cloudflare Dashboard
2. Navigate to **R2** in the sidebar
3. Click **"Purchase R2 Plan"**
4. Accept the pricing (pay-as-you-go, no monthly minimum)

### 3. Create R2 Bucket

1. In R2 dashboard, click **"Create Bucket"**
2. Bucket name: `aligner-portal-files`
3. Location: Choose closest to your users (e.g., `APAC`, `ENAM`, `WNAM`)
4. Click **"Create Bucket"**

### 4. Generate API Tokens

1. In R2 dashboard, click **"Manage R2 API Tokens"**
2. Click **"Create API Token"**
3. Token name: `aligner-portal-edge-functions`
4. Permissions:
   - ✅ Object Read & Write
5. TTL: Set to "Forever" (or custom expiry)
6. Click **"Create API Token"**

7. **IMPORTANT**: Copy these values immediately:
   - **Access Key ID**
   - **Secret Access Key**

### 5. Get Your R2 Account ID

1. In Cloudflare dashboard, go to any R2 page
2. Your Account ID is in the URL: `https://dash.cloudflare.com/{ACCOUNT_ID}/r2`

---

## Configure Supabase Edge Functions

### Step 1: Set R2 Secrets in Supabase

Add the R2 credentials as secrets in your Supabase project.

**Via Supabase Dashboard:**

1. Go to https://supabase.com/dashboard/project/zrrifrxmqjboyxyylmwa
2. Navigate to **Settings** → **Edge Functions**
3. Scroll to **Secrets** section
4. Add these secrets:

```
R2_ACCOUNT_ID=7b7dc96500bc4e067a41fa6492e52a83
R2_ACCESS_KEY_ID=006720cd537ae2fe06d33d843e791525
R2_SECRET_ACCESS_KEY=0b7e63014bc8482e8e6bf8fb6d29d180104d9872a8438ba4c593705a84883a03
R2_BUCKET_NAME=aligner-portal-files
```

### Step 2: Verify Edge Functions Are Deployed

The following Edge Functions have been deployed:

1. **aligner-photo-upload-url** - Generates presigned R2 upload URLs
2. **aligner-photo-save-metadata** - Saves photo metadata to database
3. **aligner-photo-delete** - Deletes photos from R2 and database

---

## Edge Function URLs

Your Edge Functions are accessible at:

```
https://zrrifrxmqjboyxyylmwa.supabase.co/functions/v1/aligner-photo-upload-url
https://zrrifrxmqjboyxyylmwa.supabase.co/functions/v1/aligner-photo-save-metadata
https://zrrifrxmqjboyxyylmwa.supabase.co/functions/v1/aligner-photo-delete
```

---

## Testing the Setup

### 1. Verify Secrets Are Set

Go to Supabase Dashboard → Settings → Edge Functions → Secrets and ensure all 4 secrets are listed.

### 2. Test Upload Flow

1. Start dev server:
   ```bash
   cd aligner-portal-external
   npm run dev
   ```

2. Log into the portal: `http://localhost:5173?email=doctor@example.com`

3. Navigate to a case and expand an aligner set

4. Click "Add Photo" and upload a test image

5. Verify:
   - ✅ Upload progress shows
   - ✅ Photo appears in the grid
   - ✅ Clicking thumbnail opens fullscreen view
   - ✅ Delete button works

---

## File Structure in R2

```
aligner-portal-files/
├── doctors/
│   ├── 1/              # Doctor ID 1
│   │   └── sets/
│   │       ├── 123/    # Set ID 123
│   │       │   ├── 1704067200000-patient-smile.jpg
│   │       │   └── 1704067250000-xray.png
│   │       └── 456/    # Set ID 456
│   │           └── 1704067300000-teeth.jpg
```

---

## Cost Estimation

### Real-World Example
**50 doctors, 10 photos each/month (5MB per photo):**
- Storage: 2.5GB × $0.015 = **$0.04/month**
- Downloads: **$0** (free egress)
- Edge Functions: **$0** (within free tier)
- **Total: ~$0.04/month**

---

## Security

- ✅ Presigned URLs expire after 1 hour (upload) / 7 days (view)
- ✅ Doctors can only upload/delete their own photos
- ✅ R2 credentials stored securely in Supabase secrets
- ✅ File validation (type, size) before upload
- ✅ Row-Level Security enforced in database

---

## Troubleshooting

### "R2 credentials not configured"
- Go to Supabase Dashboard → Settings → Edge Functions → Secrets
- Ensure all 4 secrets are set

### "Failed to generate upload URL"
- Verify R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are correct
- Check R2 API token has "Object Read & Write" permissions

### "Upload failed"
- Check file size (max 10MB)
- Verify file type is an image
- Check browser console for errors

### "Failed to load photos"
- Verify `aligner_set_photos` table exists in Supabase
- Check table schema matches requirements

---

## Database Schema

```sql
CREATE TABLE aligner_set_photos (
  photo_id BIGSERIAL PRIMARY KEY,
  aligner_set_id INTEGER NOT NULL REFERENCES aligner_sets(aligner_set_id),
  doctor_id INTEGER NOT NULL REFERENCES aligner_doctors(dr_id),
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  file_key TEXT NOT NULL,
  view_url TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aligner_set_photos_set_id ON aligner_set_photos(aligner_set_id);
CREATE INDEX idx_aligner_set_photos_doctor_id ON aligner_set_photos(doctor_id);
```

---

## Support

- **Cloudflare R2**: https://community.cloudflare.com/
- **Supabase Edge Functions**: https://supabase.com/docs/guides/functions
