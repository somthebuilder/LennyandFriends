# 🚀 Deployment Guide

This guide covers deploying both the **Python FastAPI backend** and **Next.js frontend** to production.

## Quick Answer

**Yes, you need to deploy them separately:**
- **Backend** → Railway/Render/Fly.io (Python server)
- **Frontend** → Vercel (Next.js) or Railway/Render
- **Database** → Supabase (already hosted, no deployment needed)

**Recommended Setup:**
- Frontend: **Vercel** (free, best for Next.js)
- Backend: **Railway** (easy, $5-10/month)
- Total cost: **~$5-10/month**

## Architecture Overview

```
┌─────────────────┐
│   Next.js       │  → Deploy to Vercel (recommended)
│   Frontend      │     or Railway/Render
└─────────────────┘
        │
        │ API calls
        ▼
┌─────────────────┐
│   FastAPI       │  → Deploy to Railway/Render/Fly.io
│   Backend       │     (needs Python + ML libraries)
└─────────────────┘
        │
        │ Database queries
        ▼
┌─────────────────┐
│   Supabase      │  → Already hosted (no deployment needed)
│   Database      │
└─────────────────┘
```

---

## Option 1: Railway (Recommended - Easiest) 🚂

Railway can host both backend and frontend, making it the simplest option.

### Backend Deployment (Railway)

1. **Install Railway CLI:**
   ```bash
   npm i -g @railway/cli
   railway login
   ```

2. **Create a new project:**
   ```bash
   railway init
   ```

3. **Add environment variables in Railway dashboard:**
   - `GEMINI_API_KEY` (or `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`)
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

4. **Create `railway.json` in project root:**
   ```json
   {
     "$schema": "https://railway.app/railway.schema.json",
     "build": {
       "builder": "NIXPACKS"
     },
     "deploy": {
       "startCommand": "uvicorn src.api.main:app --host 0.0.0.0 --port $PORT",
       "restartPolicyType": "ON_FAILURE",
       "restartPolicyMaxRetries": 10
     }
   }
   ```

5. **Upload knowledge base:**
   - Railway provides persistent storage
   - Upload `knowledge_base/` folder via Railway dashboard or CLI
   - Or use Supabase for vector storage (recommended)

6. **Deploy:**
   ```bash
   railway up
   ```

### Frontend Deployment (Railway)

1. **Navigate to frontend directory:**
   ```bash
   cd frontend
   railway init
   ```

2. **Add environment variables:**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_URL` (your backend URL from Railway)

3. **Create `railway.json` in frontend:**
   ```json
   {
     "$schema": "https://railway.app/railway.schema.json",
     "build": {
       "builder": "NIXPACKS"
     },
     "deploy": {
       "startCommand": "npm start",
       "restartPolicyType": "ON_FAILURE"
     }
   }
   ```

4. **Deploy:**
   ```bash
   railway up
   ```

**Cost:** ~$5-20/month for both services

---

## Option 2: Render (Good Alternative) 🎨

### Backend Deployment (Render)

1. **Go to [render.com](https://render.com)** and create account

2. **Create new Web Service:**
   - Connect your GitHub repo
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn src.api.main:app --host 0.0.0.0 --port $PORT`
   - **Environment:** Python 3

3. **Add environment variables** (same as Railway)

4. **Add persistent disk** for `knowledge_base/` folder:
   - Go to "Disks" tab
   - Mount at `/opt/render/project/src/knowledge_base`

5. **Deploy:** Render auto-deploys on git push

### Frontend Deployment (Render)

1. **Create new Static Site:**
   - Connect GitHub repo
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `frontend/.next`

2. **Add environment variables**

3. **Deploy:** Auto-deploys on push

**Cost:** Free tier available, $7-25/month for production

---

## Option 3: Vercel (Frontend) + Railway/Render (Backend) ⚡

**Best for:** Maximum performance and ease

### Frontend on Vercel (Recommended)

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Deploy:**
   ```bash
   cd frontend
   vercel
   ```

3. **Add environment variables in Vercel dashboard:**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_URL` (your backend URL)

4. **Auto-deploy:** Connect GitHub for automatic deployments

**Cost:** Free for personal projects, $20/month for team

### Backend on Railway/Render
Follow Option 1 or 2 for backend deployment.

---

## Option 4: Fly.io (Good for ML Workloads) 🪰

Fly.io is excellent for Python apps with ML libraries.

### Backend Deployment (Fly.io)

1. **Install Fly CLI:**
   ```bash
   curl -L https://fly.io/install.sh | sh
   fly auth login
   ```

2. **Create `Dockerfile` in project root:**
   ```dockerfile
   FROM python:3.11-slim

   WORKDIR /app

   # Install system dependencies
   RUN apt-get update && apt-get install -y \
       build-essential \
       && rm -rf /var/lib/apt/lists/*

   # Copy requirements
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt

   # Copy application
   COPY . .

   # Expose port
   EXPOSE 8080

   # Run server
   CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8080"]
   ```

3. **Create `fly.toml`:**
   ```toml
   app = "your-app-name"
   primary_region = "iad"

   [build]

   [http_service]
     internal_port = 8080
     force_https = true
     auto_stop_machines = true
     auto_start_machines = true
     min_machines_running = 0
     processes = ["app"]

   [[vm]]
     memory_mb = 2048
     cpu_kind = "shared"
     cpus = 1
   ```

4. **Deploy:**
   ```bash
   fly launch
   fly secrets set GEMINI_API_KEY=your_key
   fly secrets set SUPABASE_URL=your_url
   # ... add all env vars
   ```

5. **Mount volume for knowledge base:**
   ```bash
   fly volumes create knowledge_base --size 10
   fly mount volume knowledge_base /app/knowledge_base
   ```

**Cost:** ~$5-15/month

---

## Environment Variables Checklist

### Backend (.env)
```bash
# LLM API Keys (at least one)
GEMINI_API_KEY=your_key
OPENAI_API_KEY=your_key
ANTHROPIC_API_KEY=your_key

# Supabase
SUPABASE_URL=https://rhzpjvuutpjtdsbnskdy.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# Optional
PORT=8000
```

### Frontend (.env.local)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://rhzpjvuutpjtdsbnskdy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_API_URL=https://your-backend-url.railway.app
```

---

## Knowledge Base Deployment

You have two options:

### Option A: Upload Files (Simple)
1. Upload `knowledge_base/` folder to your hosting platform
2. Mount as persistent volume/disk
3. Backend reads from local files

### Option B: Use Supabase (Recommended)
1. Knowledge base is already in Supabase
2. Backend reads from Supabase instead of files
3. No file upload needed
4. Update `src/api/main.py` to load from Supabase

---

## Step-by-Step: Railway (Easiest)

### 1. Deploy Backend

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Link to existing project (or create new)
railway link

# Add environment variables
railway variables set GEMINI_API_KEY=your_key
railway variables set SUPABASE_URL=https://rhzpjvuutpjtdsbnskdy.supabase.co
railway variables set SUPABASE_SERVICE_ROLE_KEY=your_key

# Deploy
railway up
```

### 2. Deploy Frontend

```bash
cd frontend

# Initialize Railway project
railway init

# Add environment variables
railway variables set NEXT_PUBLIC_SUPABASE_URL=https://rhzpjvuutpjtdsbnskdy.supabase.co
railway variables set NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
railway variables set NEXT_PUBLIC_API_URL=https://your-backend.railway.app

# Deploy
railway up
```

### 3. Update Frontend API Calls

Update `frontend/lib/utils.ts` or wherever you make API calls:

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
```

---

## Step-by-Step: Vercel + Railway

### 1. Deploy Backend to Railway
Follow Railway steps above.

### 2. Deploy Frontend to Vercel

```bash
cd frontend

# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add environment variables in Vercel dashboard:
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY  
# - NEXT_PUBLIC_API_URL (your Railway backend URL)
```

---

## Post-Deployment Checklist

- [ ] Backend is accessible at public URL
- [ ] Frontend can reach backend (CORS configured)
- [ ] Environment variables set correctly
- [ ] Knowledge base accessible (files or Supabase)
- [ ] Supabase connection working
- [ ] Test API endpoints
- [ ] Test frontend → backend communication
- [ ] Set up custom domain (optional)

---

## Troubleshooting

### Backend won't start
- Check logs: `railway logs` or Render dashboard
- Verify Python version (3.9+)
- Check if all dependencies installed
- Verify environment variables

### Frontend can't reach backend
- Check `NEXT_PUBLIC_API_URL` is correct
- Verify CORS is enabled in backend
- Check backend is running and accessible

### Knowledge base not found
- Verify files uploaded to persistent storage
- Or switch to Supabase storage
- Check file paths in code

### ML libraries fail to install
- Use platforms that support system dependencies (Railway, Render, Fly.io)
- Avoid serverless platforms (Lambda, Cloud Functions)

---

## Cost Comparison

| Platform | Backend | Frontend | Total/Month |
|----------|---------|----------|-------------|
| Railway | $5-10 | $5-10 | $10-20 |
| Render | $7-15 | Free | $7-15 |
| Vercel + Railway | $5-10 | Free | $5-10 |
| Fly.io | $5-15 | N/A | $5-15 |

---

## Recommended Setup

**For Production:**
- **Frontend:** Vercel (free, excellent Next.js support)
- **Backend:** Railway (easy, good Python support)
- **Database:** Supabase (already hosted)

**Total Cost:** ~$5-10/month

---

## Next Steps

1. Choose your deployment platform
2. Deploy backend first
3. Get backend URL
4. Deploy frontend with backend URL
5. Test everything
6. Set up custom domain (optional)

Need help? Check platform-specific docs or open an issue!

