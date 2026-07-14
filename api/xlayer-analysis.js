const analysisSchema = {
  type: 'object',
  properties: {
    stance: { type: 'string', enum: ['WATCH', 'INVESTIGATE', 'AVOID'] },
    summary: { type: 'string' },
    catalysts: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    nextStep: { type: 'string' }
  },
  required: ['stance', 'summary', 'catalysts', 'risks', 'nextStep'],
  additionalProperties: false
}

function extractText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text
    }
  }
  return ''
}

function freeResearchBrief(token) {
  const rank = Number(token.rank || 0)
  const change = Number(token.change || 0)
  const risk = String(token.risk || 'High')
  const hasQuote = Boolean(token.quote)
  const highRisk = risk === 'High'
  const extremeMove = Math.abs(change) >= 25
  const stance = highRisk && extremeMove ? 'AVOID' : highRisk || extremeMove ? 'WATCH' : 'INVESTIGATE'
  const rankText = rank ? `It is currently ranked #${rank} on the live X Layer volume board.` : 'It was selected from the live X Layer token search.'
  const catalysts = [
    rank ? `Live ranking: #${rank} by X Layer 24-hour trading volume.` : 'The token is discoverable through the live X Layer token index.',
    `${change >= 0 ? '+' : ''}${change.toFixed(2)}% observed 24-hour price movement.`,
    String(token.catalyst || 'No additional market catalyst was returned by the data source.')
  ]
  const risks = [
    `Current liquidity signal: ${String(token.liquidity || 'not available')}.`,
    highRisk ? 'The market board flags this as higher risk; verify contract ownership, holders, and liquidity before any wallet action.' : 'The market board does not remove the need to check holder concentration, contract permissions, and liquidity depth.',
    extremeMove ? 'The 24-hour move is large, so price impact and reversal risk may be elevated.' : 'This brief does not include a contract audit, social verification, or smart-wallet attribution.'
  ]
  return {
    stance,
    summary: `${token.symbol} is being reviewed from observable X Layer market data. ${rankText} This is a rules-based research brief, not a price prediction or trade recommendation.`,
    catalysts,
    risks,
    nextStep: hasQuote ? 'Compare the quote route and price impact with the displayed liquidity, then decide whether more contract and holder checks are needed.' : 'Get a live quote next, then inspect the route, price impact, contract address, and holder concentration before considering any trade.'
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ message: 'Use POST for token analysis' })
  const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : request.body || {}
  const token = body.token || {}
  const prompt = String(body.prompt || '').trim().slice(0, 500)
  const symbol = String(token.symbol || '').trim().slice(0, 24)
  const address = String(token.address || '').trim().toLowerCase()
  if (!symbol || !/^0x[a-f0-9]{40}$/.test(address)) return response.status(400).json({ message: 'A valid X Layer token is required for analysis' })

  const marketContext = {
    token: { symbol, name: String(token.name || '').slice(0, 80), address, rank: Number(token.rank || 0) || null },
    observedMarketData: {
      priceUsd: Number(token.price || 0), change24hPercent: Number(token.change || 0), risk: String(token.risk || ''), liquidity: String(token.liquidity || '').slice(0, 80), catalyst: String(token.catalyst || '').slice(0, 100), thesis: String(token.thesis || '').slice(0, 600), quote: token.quote || null
    },
    operatorQuestion: prompt || 'How should I investigate this token before deciding whether to trade it?'
  }
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return response.status(200).json({ analysis: freeResearchBrief(token), mode: 'rules', generatedAt: new Date().toISOString() })

  const instructions = 'You are Nexus, a cautious X Layer token research copilot. Analyze only the observed market data supplied by the application. Do not invent holders, social sentiment, contract audits, wallet activity, prices, price targets, or news. Do not recommend buying or selling, promise returns, or use certainty. Give concise, practical research guidance. WATCH means insufficient context; INVESTIGATE means observable interest but checks remain; AVOID means the supplied facts themselves show a material concern. Mention uncertainty whenever data is missing.'
  try {
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: process.env.NEXUS_AI_MODEL || 'gpt-5.4-mini', instructions, input: JSON.stringify(marketContext), max_output_tokens: 700, text: { format: { type: 'json_schema', name: 'token_analysis', strict: true, schema: analysisSchema } } })
    })
    const payload = await upstream.json()
    if (!upstream.ok) {
      if (upstream.status === 429 || payload.error?.code === 'insufficient_quota') return response.status(200).json({ analysis: freeResearchBrief(token), mode: 'rules', generatedAt: new Date().toISOString() })
      return response.status(502).json({ message: payload.error?.message || 'AI analysis request failed' })
    }
    const text = extractText(payload)
    if (!text) return response.status(502).json({ message: 'AI analysis returned no readable result' })
    return response.status(200).json({ analysis: JSON.parse(text), mode: 'ai', model: payload.model || process.env.NEXUS_AI_MODEL || 'gpt-5.4-mini', generatedAt: new Date().toISOString() })
  } catch {
    return response.status(200).json({ analysis: freeResearchBrief(token), mode: 'rules', generatedAt: new Date().toISOString() })
  }
}
