# LSLJ Family Hub

A unified family operations app combining:
- **Finance Planner** — Monarch-style dashboard with PocketSmith-style calendar forecasting, connected to real bank accounts via Plaid
- **Home HQ** — Family project planner with Gantt timeline, budget tracking, contractor management, and photo/file attachments

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite |
| Charts | Chart.js / react-chartjs-2 |
| Bank connection | Plaid (react-plaid-link) |
| Hosting | Netlify (static + Functions) |
| Server-side token storage | Netlify Blob Storage |
| DNS / CDN | Cloudflare (point to Netlify) |
| CI/CD | GitHub → Netlify auto-deploy |

---

## Prerequisites

1. **Plaid developer account** — [dashboard.plaid.com](https://dashboard.plaid.com/signup) (free)
2. **Netlify account** — [app.netlify.com](https://app.netlify.com) (already have)
3. **GitHub account** — (already have)
4. **Cloudflare account** — (already have, for DNS)

---

## Step 1: Get Plaid API Keys

1. Sign in at [dashboard.plaid.com](https://dashboard.plaid.com)
2. Go to **Team Settings → Keys**
3. Copy your **Client ID** and **Sandbox Secret**
4. Start with `PLAID_ENV=sandbox` — sandbox lets you test with fake bank credentials:
   - Username: `user_good`
   - Password: `pass_good`
5. When ready for real accounts, apply for **Development** access (free, up to 100 live accounts, typically approved same day)

---

## Step 2: Set Up the GitHub Repo

```bash
cd lslj-family-hub
git init
git add .
git commit -m "Initial commit — LSLJ Family Hub"
git branch -M main

# Create a new repo at github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/lslj-family-hub.git
git push -u origin main
```

---

## Step 3: Deploy to Netlify

### Connect GitHub → Netlify

1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**
2. Select GitHub → choose `lslj-family-hub`
3. Build settings are auto-detected from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`

### Add Environment Variables

In Netlify: **Site configuration → Environment variables → Add variable**

| Variable | Value |
|----------|-------|
| `PLAID_CLIENT_ID` | Your Plaid client ID |
| `PLAID_SECRET` | Your Plaid sandbox secret |
| `PLAID_ENV` | `sandbox` (or `development` for live accounts) |

### Deploy

Netlify will auto-deploy every time you push to `main`. Force a deploy now:

```bash
git commit --allow-empty -m "trigger deploy"
git push
```

Your app will be live at `https://your-site-name.netlify.app`

---

## Step 4: Custom Domain via Cloudflare

1. In **Netlify**: Site configuration → Domain management → Add custom domain → enter your domain
2. Netlify gives you a DNS target (e.g., `your-site.netlify.app`)
3. In **Cloudflare**: Go to your domain → DNS → Add record:
   - Type: `CNAME`
   - Name: `@` (or `hub`, `finance`, etc.)
   - Target: your Netlify URL
   - Proxy: **Off** (grey cloud) — Netlify handles SSL
4. Back in Netlify: Verify domain → it provisions SSL automatically

---

## Step 5: Local Development

```bash
# Install dependencies
npm install

# Install Netlify CLI globally (run functions locally)
npm install -g netlify-cli

# Copy env file and fill in your keys
cp .env.example .env
# Edit .env with your Plaid keys

# Start everything (Vite dev server + Netlify Functions)
netlify dev
```

Open `http://localhost:8888`

> **Note:** `netlify dev` runs both the Vite dev server AND the serverless functions locally. The Plaid functions live at `http://localhost:8888/.netlify/functions/plaid-*`

---

## Going Live with Real Bank Accounts

When ready to test with real accounts:

1. In Plaid dashboard, apply for **Development** access
2. Once approved, get your **Development Secret**
3. Update Netlify env vars:
   - `PLAID_SECRET` → your Development secret
   - `PLAID_ENV` → `development`
4. Redeploy

For production (distributing to others), you'd need Plaid Production approval — but for personal use, Development is permanent and free.

---

## Project Structure

```
lslj-family-hub/
├── src/
│   ├── App.jsx                    # App shell, module switching
│   ├── App.css                    # Global styles
│   ├── main.jsx                   # React entry point
│   ├── finance/
│   │   ├── FinancePlanner.jsx     # Finance module (dashboard, calendar, transactions)
│   │   ├── PlaidConnect.jsx       # Plaid Link UI + sync logic
│   │   └── projection.js          # Balance projection engine
│   └── homehq/
│       └── HomeHQ.jsx             # Home project planner (all views)
├── netlify/
│   └── functions/
│       ├── plaid-create-link-token.js   # Creates Plaid Link session
│       ├── plaid-exchange-token.js      # Exchanges public→access token
│       ├── plaid-accounts.js            # Fetches live account balances
│       ├── plaid-transactions.js        # Fetches recent transactions
│       └── plaid-disconnect.js          # Revokes a bank connection
├── netlify.toml                   # Build + redirect config
├── vite.config.js
└── package.json
```

---

## Security Notes

- The Plaid `access_token` is stored **server-side only** in Netlify Blob Storage — it never touches the browser
- The browser only ever receives clean account names and balances
- All Plaid API calls go through Netlify Functions (server-side), never directly from the browser
- Your `PLAID_SECRET` is an environment variable in Netlify, never in the frontend code

---

## Upgrading to a Database (Optional)

For multiple users or more durable storage, replace Netlify Blob Storage with:
- **Supabase** (Postgres, free tier) — easiest upgrade path
- **PlanetScale** (MySQL, serverless)
- **Upstash** (Redis, great for simple key-value)

The Netlify Functions are already isolated, so swapping the storage layer is a one-file change per function.
