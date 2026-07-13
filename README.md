# Nexus Alpha Desk

An AI-assisted research and demo-execution workflow for the OKX.AI Genesis Hackathon.

## Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

The app uses public OKX market data for the market-regime watchlist. The X Layer connector is intentionally unavailable locally until a signed server-side API route is deployed.

## Enable the X Layer connector

1. Deploy this repository to Vercel (the `api/xlayer-status.js` file is a serverless route).
2. Copy `.env.example` values into the deployment environment settings.
3. Set `OKX_WEB3_API_KEY`, `OKX_WEB3_SECRET_KEY`, and `OKX_WEB3_PASSPHRASE` there.
4. Deploy, open the Alpha Radar connector card, and choose **Check connection**.

Do not put these credentials in the frontend or use `VITE_` prefixes. They are used only by the server route to sign an OKX Onchain OS DEX API V6 request.
