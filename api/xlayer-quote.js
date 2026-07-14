import crypto from 'node:crypto'

const X_LAYER_USDT = '0x1e4a5963abfd975d8c9021ce480b42188849d41d'

function formatUnits(raw, decimals) {
  const value = String(raw || '0')
  const padded = value.padStart(decimals + 1, '0')
  const whole = padded.slice(0, -decimals)
  const fraction = padded.slice(-decimals).replace(/0+$/, '').slice(0, 6)
  return Number(`${whole}.${fraction || '0'}`)
}

export default async function handler(request, response) {
  const apiKey = process.env.OKX_WEB3_API_KEY
  const secretKey = process.env.OKX_WEB3_SECRET_KEY
  const passphrase = process.env.OKX_WEB3_PASSPHRASE
  if (!apiKey || !secretKey || !passphrase) return response.status(503).json({ message: 'X Layer connector is not configured' })

  const tokenAddress = String(request.query.tokenAddress || '').toLowerCase()
  const amountUsd = Number(request.query.amount || 0)
  if (!/^0x[a-f0-9]{40}$/.test(tokenAddress) || !Number.isFinite(amountUsd) || amountUsd <= 0 || amountUsd > 10000) return response.status(400).json({ message: 'A valid X Layer token address and an amount between $0 and $10,000 are required' })

  const amount = String(Math.round(amountUsd * 1_000_000))
  const params = new URLSearchParams({ chainIndex: '196', amount, fromTokenAddress: X_LAYER_USDT, toTokenAddress: tokenAddress, swapMode: 'exactIn' })
  const requestPath = '/api/v6/dex/aggregator/quote'
  const timestamp = new Date().toISOString()
  const signature = crypto.createHmac('sha256', secretKey).update(`${timestamp}GET${requestPath}?${params}`).digest('base64')

  try {
    const upstream = await fetch(`https://web3.okx.com${requestPath}?${params}`, { headers: { 'OK-ACCESS-KEY': apiKey, 'OK-ACCESS-SIGN': signature, 'OK-ACCESS-PASSPHRASE': passphrase, 'OK-ACCESS-TIMESTAMP': timestamp } })
    const payload = await upstream.json()
    if (!upstream.ok || payload.code !== '0' || !payload.data?.[0]) return response.status(502).json({ message: payload.msg || 'No executable X Layer quote is available for this token', upstreamCode: payload.code ?? null })

    const quote = payload.data[0].routerResult || payload.data[0]
    const toToken = quote.toToken || payload.data[0].toToken || {}
    const decimals = Number(toToken.decimal ?? toToken.decimals ?? 18)
    const outputRaw = quote.toTokenAmount ?? quote.outputAmount ?? payload.data[0].toTokenAmount
    return response.status(200).json({
      inputAmountUsd: amountUsd,
      outputAmount: formatUnits(outputRaw, decimals),
      outputRaw: String(outputRaw || '0'),
      outputDecimals: decimals,
      outputSymbol: toToken.tokenSymbol || toToken.symbol || '',
      priceImpactPercent: quote.priceImpactPercentage ?? quote.priceImpact ?? null,
      estimatedGasFee: quote.estimateGasFee ?? quote.gasFee ?? null,
      routeCount: Array.isArray(quote.dexRouterList) ? quote.dexRouterList.length : 0,
      quotedAt: timestamp
    })
  } catch {
    return response.status(502).json({ message: 'Unable to reach OKX quote service' })
  }
}
