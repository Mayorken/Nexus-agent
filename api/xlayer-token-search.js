import crypto from 'node:crypto'

const colors = ['#6f8cff', '#8d72f7', '#4cc9b0', '#f0aa69', '#e47798', '#71a5e5']

function formatUsd(value) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(amount)
}

export default async function handler(request, response) {
  const apiKey = process.env.OKX_WEB3_API_KEY
  const secretKey = process.env.OKX_WEB3_SECRET_KEY
  const passphrase = process.env.OKX_WEB3_PASSPHRASE
  const query = String(request.query.query || '').trim()
  if (!apiKey || !secretKey || !passphrase) return response.status(503).json({ message: 'X Layer connector is not configured' })
  if (query.length < 2 || query.length > 100) return response.status(400).json({ message: 'Enter a token name, symbol, or contract address' })

  const timestamp = new Date().toISOString()
  const requestPath = '/api/v6/dex/market/token/search'
  const params = new URLSearchParams({ chains: '196', search: query, limit: '10' })
  const signature = crypto.createHmac('sha256', secretKey).update(`${timestamp}GET${requestPath}?${params}`).digest('base64')

  try {
    const upstream = await fetch(`https://web3.okx.com${requestPath}?${params}`, { headers: { 'OK-ACCESS-KEY': apiKey, 'OK-ACCESS-SIGN': signature, 'OK-ACCESS-PASSPHRASE': passphrase, 'OK-ACCESS-TIMESTAMP': timestamp } })
    const payload = await upstream.json()
    if (!upstream.ok || payload.code !== '0') return response.status(502).json({ message: payload.msg || 'Token search is unavailable', upstreamCode: payload.code ?? null })
    const results = (payload.data || []).slice(0, 10).map((item, index) => {
      const liquidity = Number(item.liquidity || 0)
      const change = Number(item.change || 0)
      return {
        symbol: item.tokenSymbol || 'TOKEN',
        name: item.tokenName || item.tokenSymbol || 'X Layer token',
        instId: `${item.tokenSymbol || 'TOKEN'} / X Layer`,
        tokenAddress: item.tokenContractAddress,
        price: Number(item.price || 0),
        score: item.tagList?.communityRecognized ? 82 : 68,
        risk: liquidity >= 100000 ? 'Low' : liquidity >= 25000 ? 'Medium' : 'High',
        liquidity: `$${formatUsd(liquidity)} liquidity`,
        catalyst: `${change >= 0 ? '+' : ''}${change.toFixed(2)}% / 24h`,
        thesis: `${formatUsd(item.holders || 0)} holders. Review liquidity, holder concentration, and the route before you trade.`,
        color: colors[index % colors.length],
        onchain: true,
        logoUrl: item.tokenLogoUrl || ''
      }
    })
    return response.status(200).json({ chain: 'X Layer', chainIndex: '196', results })
  } catch {
    return response.status(502).json({ message: 'Unable to reach the OKX token search service' })
  }
}
