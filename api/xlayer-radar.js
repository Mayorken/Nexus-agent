import crypto from 'node:crypto'

const colors = ['#8ecb57', '#d2a75d', '#8b9ce8', '#d37caa', '#6fc7bf', '#d98363']

function scoreSignal(signal) {
  const amount = Number(signal.amountUsd || 0)
  const wallets = Number(signal.triggerWalletCount || 0)
  const holders = Number(signal.token?.holders || 0)
  const concentration = Number(signal.token?.top10HolderPercent || 100)
  return Math.min(99, Math.max(1, Math.round(
    30 + Math.min(28, Math.log10(Math.max(amount, 1)) * 7) +
    Math.min(22, wallets * 4) + Math.min(12, Math.log10(Math.max(holders, 1)) * 3) -
    Math.min(20, Math.max(0, concentration - 35) * 0.35)
  )))
}

function formatUsd(value) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(amount)
}

export default async function handler(_request, response) {
  const apiKey = process.env.OKX_WEB3_API_KEY
  const secretKey = process.env.OKX_WEB3_SECRET_KEY
  const passphrase = process.env.OKX_WEB3_PASSPHRASE
  if (!apiKey || !secretKey || !passphrase) return response.status(503).json({ message: 'X Layer connector is not configured' })

  const timestamp = new Date().toISOString()
  const requestPath = '/api/v6/dex/market/signal/list'
  const body = JSON.stringify({ chainIndex: '196', limit: '12' })
  const signature = crypto.createHmac('sha256', secretKey).update(`${timestamp}POST${requestPath}${body}`).digest('base64')

  try {
    const upstream = await fetch(`https://web3.okx.com${requestPath}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'OK-ACCESS-KEY': apiKey, 'OK-ACCESS-SIGN': signature, 'OK-ACCESS-PASSPHRASE': passphrase, 'OK-ACCESS-TIMESTAMP': timestamp }, body })
    const payload = await upstream.json()
    if (!upstream.ok || payload.code !== '0') return response.status(502).json({ message: payload.msg || 'Unable to load X Layer signals', upstreamCode: payload.code ?? null, upstreamStatus: upstream.status })

    const seen = new Set()
    const signals = (payload.data || []).filter(item => item.token?.tokenAddress && !seen.has(item.token.tokenAddress) && seen.add(item.token.tokenAddress)).slice(0, 6).map((item, index) => {
      const score = scoreSignal(item)
      const concentration = Number(item.token?.top10HolderPercent || 100)
      return {
        symbol: item.token.symbol || 'UNKNOWN', name: item.token.name || 'Unknown token', instId: `${item.token.symbol || 'TOKEN'} · X Layer`, tokenAddress: item.token.tokenAddress,
        price: Number(item.price || 0), score, risk: concentration <= 45 ? 'Medium' : 'High', liquidity: `$${formatUsd(item.amountUsd)} flow`, catalyst: `${item.triggerWalletCount || 0} tracked wallets`,
        thesis: `${item.walletType || 'Tracked'} wallets triggered a recent buy signal. ${item.token.holders || 0} holders; top-10 concentration ${concentration.toFixed(1)}%.`, color: colors[index % colors.length], onchain: true,
        timestamp: item.timestamp
      }
    })
    return response.status(200).json({ chain: 'X Layer', chainIndex: '196', updatedAt: timestamp, signals })
  } catch {
    return response.status(502).json({ message: 'Unable to reach OKX Signal API' })
  }
}
