# TradePro Platform — Deployment Guide

## Architecture

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│                  │       │                  │       │                  │
│   Vercel         │──────▶│   Render         │──────▶│   Supabase       │
│   (Frontend)     │  API  │   (Backend)      │  DB   │   (Database)     │
│   React + Vite   │  +WS  │   Node + Express │       │   PostgreSQL     │
│                  │       │                  │       │                  │
└──────────────────┘       └──────────────────┘       └──────────────────┘
```

---

## Step 1: Deploy Backend on Render

1. Go to [render.com](https://render.com) → **New** → **Web Service**
2. Connect your GitHub repository: `priyanshushikarwal/newTrade`
3. Configure:

| Setting          | Value                  |
|------------------|------------------------|
| **Name**         | tradepro-backend       |
| **Environment**  | Node                   |
| **Build Command**| `npm install`          |
| **Start Command**| `node server/index.js` |
| **Plan**         | Free                   |

4. **Environment Variables** (in Render Dashboard):

| Variable                    | Value                        |
|-----------------------------|------------------------------|
| `SUPABASE_URL`              | Your Supabase project URL    |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service key    |
| `NODE_ENV`                  | `production`                 |
| `PORT`                      | `8080` (Render default)      |

5. Click **Create Web Service** → Wait for deployment
6. **Copy the deployed URL** (e.g., `https://tradepro-backend.onrender.com`)

---

## Step 2: Deploy Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repository: `priyanshushikarwal/newTrade`
3. Configure:

| Setting              | Value            |
|----------------------|------------------|
| **Framework Preset** | Vite             |
| **Build Command**    | `npm run build`  |
| **Output Directory** | `dist`           |

4. **Environment Variables** (in Vercel Dashboard):

| Variable         | Value                                              |
|------------------|----------------------------------------------------|
| `VITE_API_URL`   | `https://tradepro-backend.onrender.com/api`        |

> ⚠️ Note: Include `/api` at the end of the URL!

5. Click **Deploy** → Wait for deployment

---

## Step 3: Verify Everything Works

- [ ] Open your Vercel frontend URL
- [ ] Login works (same as localhost)
- [ ] Signup works (same as localhost)
- [ ] Dashboard loads correctly
- [ ] Wallet operations work
- [ ] Admin panel accessible
- [ ] Real-time price updates via WebSocket
- [ ] QR code upload works
- [ ] No console errors

---

## Important Notes

### 🔒 Security
- `SUPABASE_SERVICE_ROLE_KEY` is **only** set on Render (backend)
- Frontend only uses `VITE_` prefixed variables (safe to expose)
- `.env` file is gitignored — secrets are never committed

### ⏰ Render Free Tier
- Free tier services **sleep after 15 minutes** of inactivity
- First request after sleep takes ~30-60 seconds (cold start)
- Use [UptimeRobot](https://uptimerobot.com) to ping your backend every 14 minutes to prevent sleep

### 🔄 Redeployment
- **Code changes:** Push to GitHub → Both Vercel and Render auto-redeploy
- **Env var changes:** Update in respective platform dashboard → Redeploy manually

### 🐛 Troubleshooting
| Issue | Solution |
|-------|----------|
| Login fails | Check `VITE_API_URL` includes `/api` |
| WebSocket not connecting | Check CORS on backend, ensure Render URL is correct |
| "Service Unavailable" on first load | Render free tier cold start — wait 30s and refresh |
| Build fails on Vercel | Ensure `npm run build` runs `vite build` (no `tsc`) |
