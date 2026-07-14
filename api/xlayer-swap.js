import crypto from 'node:crypto'

const X_LAYER_USDT = '0x1e4a5963abfd975d8c9021ce480b42188849d41d'
const ADDRESS = /^0x[a-f0-9]{40}$/i

function signedHeaders(secretKey, timestamp, requestPath, params, apiKey, passphrase) {
  const signature = crypto.createHmac('sha256', secretKey).update(`${timestamp}GET${requestPath}?${params}`).digest('base64')
  return { 'OK-ACCESS-KEY': apiKey, 'OK-ACCESS-SIGN': signature, 'OK-ACCESS-PASSPHRASE': passphrase, 'OK-ACCESS-TIMESTAMP': timestamp }
}

async function getOkx(requestPath, params, credentials) {
  const timestamp = new Date().toISOString()
  const upstream = await fetch(`https://web3.okx.com${requestPath}?${params}`, { headers: signedHeaders(credentials.secretKey, timestamp, requestPath, params, credentials.apiKey, credentials.passphrase) })
  const payload = await upstream.json()
  if (!upstream.ok || payload.code !== '0' || !payload.data?.[0]) throw new Error(payload.msg || 'OKX could not prepare this transaction')
  return payload.data[0]
}

export default async function handler(request, response) {
  const apiKey = process.env.OKX_WEB3_API_KEY
  const secretKey = process.env.OKX_WEB3_SECRET_KEY
  const passphrase = process.env.OKX_WEB3_PASSPHRASE
  const feeRecipient = process.env.NEXUS_FEE_RECIPIENT
  const feePercent = process.env.NEXUS_SWAP_FEE_PERCENT
  if (!apiKey || !secretKey || !passphrase) return response.status(503).json({ message: 'X Layer connector is not configured' })

  const tokenAddress = String(request.query.tokenAddress || '').toLowerCase()
  const walletAddress = String(request.query.walletAddress || '')
  const amountUsd = Number(request.query.amount || 0)
  if (!ADDRESS.test(tokenAddress) || !ADDRESS.test(walletAddress) || !Number.isFinite(amountUsd) || amountUsd <= 0 || amountUsd > 10000) return response.status(400).json({ message: 'A valid wallet, X Layer token, and amount between $0 and $10,000 are required' })

  const amount = String(Math.round(amountUsd * 1_000_000))
  const credentials = { apiKey, secretKey, passphrase }
  const swapParams = new URLSearchParams({ chainIndex: '196', amount, fromTokenAddress: X_LAYER_USDT, toTokenAddress: tokenAddress, swapMode: 'exactIn', slippagePercent: '0.5', userWalletAddress: walletAddress, ...(feeRecipient && feePercent ? { feePercent, fromTokenReferrerWalletAddress: feeRecipient } : {}) })
  const approvalParams = new URLSearchParams({ chainIndex: '196', tokenContractAddress: X_LAYER_USDT, approveAmount: amount })

  try {
    const [approval, swap] = await Promise.all([
      getOkx('/api/v6/dex/aggregator/approve-transaction', approvalParams, credentials),
      getOkx('/api/v6/dex/aggregator/swap', swapParams, credentials)
    ])
    const transaction = swap.tx
    if (!transaction?.to || !transaction?.data || !approval.dexContractAddress || !approval.data) throw new Error('OKX returned incomplete transaction data')
    const routerResult = swap.routerResult || {}
    return response.status(200).json({
      chainId: '0xC4',
      expiresNote: 'Quotes and calldata can change with market conditions. Re-prepare before signing if you wait.',
      approval: { to: approval.dexContractAddress, data: approval.data, gas: approval.gasLimit, gasPrice: approval.gasPrice, value: '0x0' },
      swap: { to: transaction.to, data: transaction.data, gas: transaction.gas, gasPrice: transaction.gasPrice, maxPriorityFeePerGas: transaction.maxPriorityFeePerGas, value: transaction.value || '0x0' },
      summary: { inputAmountUsd: amountUsd, outputSymbol: routerResult.toToken?.tokenSymbol || '', outputRaw: String(routerResult.toTokenAmount || ''), minReceiveRaw: String(transaction.minReceiveAmount || ''), routeCount: Array.isArray(routerResult.dexRouterList) ? routerResult.dexRouterList.length : 0, slippagePercent: transaction.slippagePercent || '0.5', feePercent: feeRecipient && feePercent ? feePercent : '0', feeAmountUsd: feeRecipient && feePercent ? Number((amountUsd * Number(feePercent) / 100).toFixed(6)) : 0, feeRecipient: feeRecipient || '' }
    })
  } catch (error) {
    return response.status(502).json({ message: error instanceof Error ? error.message : 'Unable to prepare X Layer transaction' })
  }
}
