import crypto from 'node:crypto'

function signedHeaders(apiKey, secretKey, passphrase, timestamp, method, requestPath, body = '') {
  const signature = crypto.createHmac('sha256', secretKey).update(`${timestamp}${method}${requestPath}${body}`).digest('base64')
  return { 'Content-Type': 'application/json', 'OK-ACCESS-KEY': apiKey, 'OK-ACCESS-SIGN': signature, 'OK-ACCESS-PASSPHRASE': passphrase, 'OK-ACCESS-TIMESTAMP': timestamp }
}

function percentage(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : null
}

export default async function handler(request, response) {
  const apiKey = process.env.OKX_WEB3_API_KEY
  const secretKey = process.env.OKX_WEB3_SECRET_KEY
  const passphrase = process.env.OKX_WEB3_PASSPHRASE
  const tokenAddress = String(request.query.tokenAddress || '').toLowerCase()
  if (!apiKey || !secretKey || !passphrase) return response.status(503).json({ message: 'X Layer connector is not configured' })
  if (!/^0x[a-f0-9]{40}$/.test(tokenAddress)) return response.status(400).json({ message: 'A valid X Layer token address is required' })

  const timestamp = new Date().toISOString()
  const tokenRequest = [{ chainIndex: '196', tokenContractAddress: tokenAddress }]
  const tokenBody = JSON.stringify(tokenRequest)
  const basicPath = '/api/v6/dex/market/token/basic-info'
  const pricePath = '/api/v6/dex/market/price-info'
  const holderParams = new URLSearchParams({ chainIndex: '196', tokenContractAddress: tokenAddress })
  const holderPath = `/api/v6/dex/market/token/holder?${holderParams}`

  try {
    const [basicResponse, marketResponse, holderResponse] = await Promise.all([
      fetch(`https://web3.okx.com${basicPath}`, { method: 'POST', headers: signedHeaders(apiKey, secretKey, passphrase, timestamp, 'POST', basicPath, tokenBody), body: tokenBody }),
      fetch(`https://web3.okx.com${pricePath}`, { method: 'POST', headers: signedHeaders(apiKey, secretKey, passphrase, timestamp, 'POST', pricePath, tokenBody), body: tokenBody }),
      fetch(`https://web3.okx.com${holderPath}`, { headers: signedHeaders(apiKey, secretKey, passphrase, timestamp, 'GET', holderPath) })
    ])
    const [basicPayload, marketPayload, holderPayload] = await Promise.all([basicResponse.json(), marketResponse.json(), holderResponse.json()])
    if (!basicResponse.ok || basicPayload.code !== '0' || !basicPayload.data?.[0]) return response.status(502).json({ message: basicPayload.msg || 'Token identity could not be verified by OKX' })
    if (!marketResponse.ok || marketPayload.code !== '0' || !marketPayload.data?.[0]) return response.status(502).json({ message: marketPayload.msg || 'Token market data is unavailable' })

    const basic = basicPayload.data[0]
    const market = marketPayload.data[0]
    const holderList = holderResponse.ok && holderPayload.code === '0' ? holderPayload.data || [] : []
    const supply = Number(market.circSupply || 0)
    const amounts = holderList.map(holder => Number(holder.holdAmount || 0)).filter(Number.isFinite)
    const top10Percent = supply > 0 ? percentage(amounts.slice(0, 10).reduce((sum, amount) => sum + amount, 0) / supply * 100) : null
    const top20Percent = supply > 0 ? percentage(amounts.reduce((sum, amount) => sum + amount, 0) / supply * 100) : null
    const liquidity = Number(market.liquidity || 0)
    const change24h = Number(market.priceChange24H || 0)
    const recognized = Boolean(basic.tagList?.communityRecognized)
    const flags = [
      { level: 'pass', label: 'Contract identity', detail: `${basic.tokenName || basic.tokenSymbol || 'Token'} is indexed by OKX on X Layer.` },
      { level: liquidity >= 50000 ? 'pass' : liquidity >= 10000 ? 'warn' : 'risk', label: 'Liquidity depth', detail: liquidity >= 50000 ? 'At least $50K of reported token-pool liquidity.' : liquidity >= 10000 ? 'Reported liquidity is below the $50K review threshold.' : 'Reported liquidity is below the $10K review threshold.' },
      { level: top10Percent === null ? 'warn' : top10Percent <= 50 ? 'pass' : 'risk', label: 'Holder concentration', detail: top10Percent === null ? 'Top-holder concentration could not be calculated from the available supply data.' : `Top 10 visible holders represent ${top10Percent}% of reported circulating supply.` },
      { level: Math.abs(change24h) <= 20 ? 'pass' : 'warn', label: '24-hour volatility', detail: `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}% over 24 hours.` },
      { level: recognized ? 'pass' : 'warn', label: 'Recognition tag', detail: recognized ? 'OKX reports a community-recognized tag.' : 'No OKX community-recognized tag was returned.' },
      { level: 'warn', label: 'Not assessed', detail: 'This check does not verify ownership controls, proxy patterns, taxes, or a third-party contract audit.' }
    ]
    return response.status(200).json({
      checkedAt: timestamp,
      explorerUrl: `https://www.okx.com/web3/explorer/xlayer/token/${tokenAddress}`,
      token: { address: tokenAddress, name: basic.tokenName || '', symbol: basic.tokenSymbol || '', decimals: Number(basic.decimal || 0), communityRecognized: recognized },
      market: { price: Number(market.price || 0), change24h, liquidity, volume24h: Number(market.volume24H || 0), holders: Number(market.holders || 0), marketCap: Number(market.marketCap || 0), transactions24h: Number(market.txs24H || 0) },
      concentration: { top10Percent, top20Percent, visibleHolderCount: holderList.length },
      flags
    })
  } catch {
    return response.status(502).json({ message: 'Unable to complete the X Layer safety check' })
  }
}
