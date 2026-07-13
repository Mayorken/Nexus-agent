import crypto from 'node:crypto'

// Vercel serverless function. Keep the credentials in your deployment's
// environment settings; never expose them through VITE_* variables.
export default async function handler(_request, response) {
  const apiKey = process.env.OKX_WEB3_API_KEY
  const secretKey = process.env.OKX_WEB3_SECRET_KEY
  const passphrase = process.env.OKX_WEB3_PASSPHRASE

  if (!apiKey || !secretKey || !passphrase) {
    return response.status(200).json({ configured: false, connected: false })
  }

  const timestamp = new Date().toISOString()
  const requestPath = '/api/v6/dex/aggregator/supported/chain'
  const signature = crypto.createHmac('sha256', secretKey).update(`${timestamp}GET${requestPath}`).digest('base64')

  try {
    const upstream = await fetch(`https://web3.okx.com${requestPath}`, {
      headers: {
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-PASSPHRASE': passphrase,
        'OK-ACCESS-TIMESTAMP': timestamp
      }
    })
    const body = await upstream.json()
    const connected = upstream.ok && body.code === '0'
    return response.status(connected ? 200 : 502).json({
      configured: true,
      connected,
      upstreamStatus: upstream.status,
      upstreamCode: body.code ?? null,
      upstreamMessage: typeof body.msg === 'string' ? body.msg : 'No message returned'
    })
  } catch {
    return response.status(502).json({ configured: true, connected: false, upstreamMessage: 'Unable to reach OKX DEX API' })
  }
}
