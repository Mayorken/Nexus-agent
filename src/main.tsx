import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, AlertTriangle, ArrowRight, BarChart3, Bell, Bolt, Bot, Check, ChevronRight, CircleDollarSign, Compass, Copy, ExternalLink, Layers3, LayoutDashboard, LockKeyhole, Menu, RefreshCw, ShieldCheck, Sparkles, WalletCards, X } from 'lucide-react'
import './styles.css'

type View = 'radar' | 'desk' | 'activity' | 'pricing'
type Signal = { symbol: string; name: string; instId: string; thesis: string; risk: 'Low' | 'Medium' | 'High'; score: number; liquidity: string; catalyst: string; color: string; price?: number; tokenAddress?: string; onchain?: boolean }
type Ticker = { last: string; open24h: string; high24h: string; low24h: string; volCcy24h: string; ts: string }

const signals: Signal[] = [
  { symbol: 'BTC', name: 'Bitcoin', instId: 'BTC-USDT', score: 86, risk: 'Low', liquidity: 'Deep', catalyst: 'Spot momentum', thesis: 'The liquid market benchmark. Use it to set risk appetite before allocating to smaller on-chain opportunities.', color: '#f4a340' },
  { symbol: 'ETH', name: 'Ethereum', instId: 'ETH-USDT', score: 78, risk: 'Low', liquidity: 'Deep', catalyst: 'Ecosystem flows', thesis: 'A high-liquidity ecosystem proxy with broad on-chain activity and a clearer liquidity profile than emerging assets.', color: '#7284de' },
  { symbol: 'SOL', name: 'Solana', instId: 'SOL-USDT', score: 71, risk: 'Medium', liquidity: 'High', catalyst: 'High-beta momentum', thesis: 'A higher-beta market candidate. Position sizing and a pre-set invalidation level matter more here.', color: '#a575d9' },
]

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)

function App() {
  const [view, setView] = useState<View>('radar')
  const [selected, setSelected] = useState<Signal>(signals[0])
  const [amount, setAmount] = useState('100')
  const [tickers, setTickers] = useState<Record<string, Ticker>>({})
  const [loading, setLoading] = useState(true)
  const [tradeStatus, setTradeStatus] = useState<'idle' | 'preview' | 'complete'>('idle')
  const [connectorOpen, setConnectorOpen] = useState(false)
  const [connectorState, setConnectorState] = useState<'idle' | 'checking' | 'ready' | 'missing'>('idle')
  const [radarSignals, setRadarSignals] = useState<Signal[]>(signals)
  const [scanning, setScanning] = useState(false)
  const [toast, setToast] = useState('')
  const [menu, setMenu] = useState(false)
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2400) }
  const refresh = async () => {
    setLoading(true)
    try {
      const responses = await Promise.all(signals.map(async signal => {
        const response = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${signal.instId}`)
        const json = await response.json() as { code?: string; data?: Ticker[] }
        if (!response.ok || json.code !== '0' || !json.data?.[0]) throw new Error('Ticker unavailable')
        return [signal.symbol, json.data[0]] as const
      }))
      setTickers(Object.fromEntries(responses))
    } catch { notify('Live market data is unavailable. Showing the demo watchlist.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])
  const scanXLayer = async () => {
    setScanning(true)
    try {
      const response = await fetch('/api/xlayer-radar')
      const data = await response.json() as { signals?: Signal[]; message?: string }
      if (!response.ok || !data.signals?.length) throw new Error(data.message || 'No X Layer signals found')
      setRadarSignals(data.signals)
      setSelected(current => current.onchain ? current : data.signals![0])
    } catch (error) { notify(error instanceof Error ? error.message : 'Unable to scan X Layer') }
    finally { setScanning(false) }
  }
  useEffect(() => { void scanXLayer() }, [])
  const checkConnector = async () => {
    setConnectorState('checking')
    try {
      const response = await fetch('/api/xlayer-status')
      const data = await response.json() as { configured?: boolean; connected?: boolean }
      setConnectorState(response.ok && data.configured && data.connected ? 'ready' : 'missing')
    } catch { setConnectorState('missing') }
  }
  const currentTicker = tickers[selected.symbol]
  const price = currentTicker ? Number(currentTicker.last) : selected.price ?? (selected.symbol === 'BTC' ? 68429 : selected.symbol === 'ETH' ? 3612 : 174.86)
  const change = currentTicker ? ((price - Number(currentTicker.open24h)) / Number(currentTicker.open24h)) * 100 : 0
  const units = Number(amount || 0) / price
  const nav = [[ 'radar', Compass, 'Alpha radar' ], [ 'desk', WalletCards, 'Trade desk' ], [ 'activity', Activity, 'Activity' ], [ 'pricing', CircleDollarSign, 'Pricing' ]] as const

  return <div className="alpha-app">
    <aside className={menu ? 'alpha-sidebar open' : 'alpha-sidebar'}>
      <div className="alpha-brand"><span><Bolt size={17}/></span> NEXUS <i>ALPHA</i><button onClick={() => setMenu(false)}><X size={18}/></button></div>
      <div className="workspace-pill"><span>●</span> DEMO WORKSPACE</div>
      <nav>{nav.map(([id, Icon, label]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => { setView(id); setMenu(false) }}><Icon size={17}/>{label}</button>)}</nav>
      <div className="sidebar-callout"><ShieldCheck size={19}/><b>Execution you control</b><p>Every order is reviewed before it is simulated. No live funds or keys are used.</p></div>
      <div className="profile-row"><div>OA</div><span><b>Alpha operator</b><small>Demo account</small></span><ChevronRight size={15}/></div>
    </aside>
    <main className="alpha-main">
      <header><button className="menu-button" onClick={() => setMenu(true)}><Menu size={20}/></button><div className="crumb"><span>Workspace</span><ChevronRight size={14}/><b>{view === 'radar' ? 'Alpha radar' : view === 'desk' ? 'Trade desk' : view === 'activity' ? 'Activity' : 'Pricing'}</b></div><div className="header-right"><span className="demo-badge"><ShieldCheck size={14}/> Demo mode</span><button className="refresh" disabled={loading} onClick={() => void refresh()}><RefreshCw className={loading ? 'spinning' : ''} size={15}/> Refresh</button></div></header>
      {view === 'radar' && <Radar selected={selected} select={(signal) => { setSelected(signal); setView('desk'); setTradeStatus('preview') }} signals={radarSignals} tickers={tickers} loading={loading} scanning={scanning} scan={() => void scanXLayer()} onConnect={() => setConnectorOpen(true)} />}
      {view === 'desk' && <Desk selected={selected} price={price} change={change} amount={amount} setAmount={setAmount} units={units} ticker={currentTicker} status={tradeStatus} setStatus={setTradeStatus} notify={notify} />}
      {view === 'activity' && <ActivityView status={tradeStatus} selected={selected} amount={amount} />}
      {view === 'pricing' && <Pricing notify={notify} />}
    </main>
    {connectorOpen && <ConnectorSetup state={connectorState} close={() => setConnectorOpen(false)} check={() => void checkConnector()} />}
    {toast && <div className="alpha-toast"><Check size={16}/>{toast}</div>}
  </div>
}

function Radar({ selected, select, signals, tickers, loading, scanning, scan, onConnect }: { selected: Signal; select: (signal: Signal) => void; signals: Signal[]; tickers: Record<string, Ticker>; loading: boolean; scanning: boolean; scan: () => void; onConnect: () => void }) {
  return <section className="alpha-content">
    <div className="radar-hero"><div><p className="overline">NEXUS ALPHA DESK / DISCOVER</p><h1>Find context before<br/><em>you find a trade.</em></h1><p>Rank liquid market opportunities with a transparent signal score, then build an execution plan you control.</p><div className="live-source"><span/> {loading ? 'Refreshing OKX public market data' : 'Market regime powered by live OKX public data'}</div></div><div className="radar-orb"><div><Compass size={31}/></div></div></div>
    <div className="connector"><div className="connector-icon"><Layers3 size={20}/></div><div><b>X Layer smart-money signal feed</b><p>Authenticated OKX Signal API scans recent buy-direction flows on X Layer (chain 196).</p></div><span className="online"><span/> Connected</span><button disabled={scanning} onClick={scan}>{scanning ? 'Scanning…' : 'Scan X Layer'} <RefreshCw className={scanning ? 'spinning' : ''} size={14}/></button></div>
    <div className="section-title"><div><p className="overline">X LAYER SMART-MONEY SIGNALS</p><h2>Live flows worth investigating.</h2></div><span>Scores are research prompts—not investment advice.</span></div>
    <div className="signal-grid">{signals.map(signal => <SignalCard key={signal.tokenAddress || signal.symbol} signal={signal} ticker={tickers[signal.symbol]} selected={selected.tokenAddress ? selected.tokenAddress === signal.tokenAddress : selected.symbol === signal.symbol} onSelect={() => select(signal)} />)}</div>
    <div className="radar-foot"><AlertTriangle size={17}/><span><b>Safety rule:</b> Nexus surfaces observable data and explains risk. It does not guarantee returns, recommend a trade, or execute without a user review.</span></div>
  </section>
}

function SignalCard({ signal, ticker, selected, onSelect }: { signal: Signal; ticker?: Ticker; selected: boolean; onSelect: () => void }) {
  const price = ticker ? Number(ticker.last) : signal.price ?? (signal.symbol === 'BTC' ? 68429 : signal.symbol === 'ETH' ? 3612 : 174.86)
  const change = ticker ? ((price - Number(ticker.open24h)) / Number(ticker.open24h)) * 100 : 0
  return <article className={selected ? 'signal-card chosen' : 'signal-card'}><div className="signal-top"><span className="token-mark" style={{background: signal.color}}>{signal.symbol[0]}</span><span className="risk"><i className={signal.risk === 'Low' ? 'low' : ''}/>{signal.risk} risk</span></div><div className="signal-name"><h3>{signal.symbol}</h3><span>{signal.name}</span></div><div className="price-line"><b>{money(price)}</b>{ticker ? <span className={change >= 0 ? 'positive' : 'negative'}>{change >= 0 ? '+' : ''}{change.toFixed(2)}%</span> : <span className="positive">Live signal</span>}</div><div className="score"><span>Signal strength</span><b>{signal.score}<small>/100</small></b><div><i style={{width: `${signal.score}%`}}/></div></div><div className="metrics"><span><small>Liquidity</small>{signal.liquidity}</span><span><small>Catalyst</small>{signal.catalyst}</span></div><p>{signal.thesis}</p><button onClick={onSelect}>Review trade plan <ArrowRight size={15}/></button></article>
}

function Desk({ selected, price, change, amount, setAmount, units, ticker, status, setStatus, notify }: { selected: Signal; price: number; change: number; amount: string; setAmount: (value: string) => void; units: number; ticker?: Ticker; status: 'idle' | 'preview' | 'complete'; setStatus: (value: 'idle' | 'preview' | 'complete') => void; notify: (value: string) => void }) {
  const [prompt, setPrompt] = useState('Allocate $100 to the selected market candidate')
  const estimatedFee = Math.max(Number(amount || 0) * 0.001, 0.1)
  const simulate = () => { setStatus('complete'); notify('Demo order completed — no funds were moved') }
  return <section className="alpha-content desk-content"><div className="desk-heading"><div><p className="overline">NEXUS ALPHA DESK / REVIEW</p><h1>Trade plan, <em>not blind execution.</em></h1><p>Turn your instruction into a readable order. You retain the final decision.</p></div><span className="guardrail"><LockKeyhole size={16}/> No wallet connected</span></div>
    <div className="desk-grid"><div className="command-panel"><p className="panel-label"><Bot size={15}/> NATURAL-LANGUAGE COMMAND</p><textarea value={prompt} onChange={event => setPrompt(event.target.value)}/><div className="prompt-suggestions"><button onClick={() => setPrompt('Allocate $100 to the selected market candidate')}>Use $100</button><button onClick={() => setPrompt('Build a small demo position with a strict risk review')}>Strict risk review</button></div><button className="build-plan" onClick={() => { setStatus('preview'); notify('Trade plan updated') }}><Sparkles size={17}/> Build trade plan</button><div className="why"><b>Why {selected.symbol} is surfaced</b><p>{selected.thesis}</p></div></div>
      <div className="order-panel"><div className="order-heading"><div><p className="panel-label">EXECUTION PREVIEW</p><h2>Buy {selected.symbol}</h2></div><span className="demo-badge">SIMULATED</span></div><div className="market-row"><span className="token-mark" style={{background:selected.color}}>{selected.symbol[0]}</span><div><b>{selected.instId}</b><small>{money(price)} · <em className={change >= 0 ? 'positive' : 'negative'}>{change >= 0 ? '+' : ''}{change.toFixed(2)}% / 24h</em></small></div><BarChart3 size={19}/></div><label className="amount-field">Amount to allocate <div><span>$</span><input type="number" min="1" max="10000" value={amount} onChange={event => setAmount(event.target.value)}/><b>USDT</b></div></label><div className="order-lines"><span>Estimated quantity <b>{units.toFixed(selected.symbol === 'BTC' ? 6 : 4)} {selected.symbol}</b></span><span>Reference price <b>{money(price)}</b></span><span>Estimated fee <b>{money(estimatedFee)}</b></span>{ticker && <span>24h range <b>{money(Number(ticker.low24h))} – {money(Number(ticker.high24h))}</b></span>}</div><div className="review-warning"><AlertTriangle size={17}/><span><b>Review before confirming.</b> Market price, spread, liquidity and volatility can change before any real trade.</span></div>{status === 'complete' ? <div className="complete-state"><Check size={18}/><span><b>Demo order recorded</b><small>Simulated {money(Number(amount || 0))} buy of {selected.symbol}. No funds moved.</small></span></div> : <button className="simulate-button" onClick={simulate}><ShieldCheck size={17}/> Confirm demo trade</button>}<small className="confirm-note">This prototype does not connect wallets, hold API keys, or submit live orders.</small></div></div>
  </section>
}

function ActivityView({ status, selected, amount }: { status: 'idle' | 'preview' | 'complete'; selected: Signal; amount: string }) { return <section className="alpha-content"><div className="page-heading"><p className="overline">AUDIT TRAIL</p><h1>Every decision is visible.</h1><p>Human-readable records make agent-assisted execution easier to review.</p></div><div className="activity-card">{status === 'complete' ? <><div className="activity-icon"><Check size={18}/></div><div><span className="overline">JUST NOW / DEMO</span><h3>Demo buy order recorded</h3><p>Simulated allocation of {money(Number(amount || 0))} to {selected.symbol}. No funds moved and no wallet was connected.</p></div><span className="activity-status">Complete</span></> : <><div className="activity-icon neutral"><Activity size={18}/></div><div><span className="overline">NO EXECUTIONS YET</span><h3>Your demo trade history will appear here.</h3><p>Open Alpha Radar, select a candidate, and confirm a demo trade to test the full controlled-execution flow.</p></div></>}</div></section> }

function Pricing({ notify }: { notify: (value: string) => void }) { return <section className="alpha-content"><div className="page-heading"><p className="overline">MONETIZATION</p><h1>A service users can pay for.</h1><p>Simple plans turn research, risk review, and controlled execution into a measurable product.</p></div><div className="pricing-grid"><article><span className="overline">EXPLORER</span><h2>Free</h2><p>For users validating the signal quality.</p><ul><li>5 daily market scans</li><li>Trade-plan previews</li><li>Demo execution</li></ul><button onClick={() => notify('Explorer is your current plan')}>Current plan</button></article><article className="pro"><span className="overline">ALPHA PRO</span><h2>$19 <small>/ month</small></h2><p>For active operators who need a recurring research workflow.</p><ul><li>Unlimited scans</li><li>Signal alerts</li><li>Saved audit trail</li><li>Priority X Layer connector</li></ul><button onClick={() => notify('Checkout is the next integration')}>Start Pro <ArrowRight size={15}/></button></article><article><span className="overline">TEAM DESK</span><h2>Custom</h2><p>For communities and research teams.</p><ul><li>Shared workspaces</li><li>Custom risk policies</li><li>Workflow exports</li></ul><button onClick={() => notify('Team plan inquiry saved')}>Talk to us</button></article></div></section> }

function ConnectorSetup({ state, close, check }: { state: 'idle' | 'checking' | 'ready' | 'missing'; close: () => void; check: () => void }) { return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="X Layer connector setup"><div className="connector-modal"><button className="modal-close" onClick={close}><X size={18}/></button><div className="modal-symbol"><Layers3 size={22}/></div><p className="overline">SECURE SERVER-SIDE CONNECTION</p><h2>Activate the X Layer connector.</h2><p>Your OKX Web3 credentials belong in deployment environment variables—not in the browser, source code, or a chat prompt.</p><ol><li>Add <code>OKX_WEB3_API_KEY</code>, <code>OKX_WEB3_SECRET_KEY</code>, and <code>OKX_WEB3_PASSPHRASE</code> to your host.</li><li>Deploy the included <code>/api/xlayer-status.js</code> server route.</li><li>Check the connection. The radar can then be extended with signed X Layer token, liquidity, and quote requests.</li></ol>{state === 'ready' && <div className="connection-state ready"><Check size={16}/><span><b>Connector verified</b><small>Signed API access is available. Next: enable the token scanner.</small></span></div>}{state === 'missing' && <div className="connection-state missing"><AlertTriangle size={16}/><span><b>Credentials or route not found</b><small>Expected locally until the app is deployed with environment variables.</small></span></div>}<button className="connection-button" disabled={state === 'checking'} onClick={check}>{state === 'checking' ? 'Checking secure connection…' : 'Check connection'} <ArrowRight size={15}/></button><a href="https://web3.okx.com/onchainos/dev-docs-v5/dex-api/dex-get-aggregator-supported-chains" target="_blank" rel="noreferrer">Read the OKX DEX API docs <ExternalLink size={13}/></a></div></div> }

createRoot(document.getElementById('root')!).render(<App />)
