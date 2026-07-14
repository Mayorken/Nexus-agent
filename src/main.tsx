import { useEffect, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, AlertTriangle, ArrowRight, BarChart3, Bell, Bolt, Bot, Check, ChevronRight, CircleDollarSign, Compass, Copy, Download, ExternalLink, Layers3, LayoutDashboard, LockKeyhole, Megaphone, Menu, Palette, RefreshCw, Rocket, Search, ShieldCheck, Sparkles, WalletCards, X } from 'lucide-react'
import './styles.css'

type View = 'radar' | 'desk' | 'launch' | 'activity'
type Signal = { symbol: string; name: string; instId: string; thesis: string; risk: 'Low' | 'Medium' | 'High'; score: number; liquidity: string; catalyst: string; color: string; price?: number; tokenAddress?: string; onchain?: boolean; logoUrl?: string; rank?: number }
type Ticker = { last: string; open24h: string; high24h: string; low24h: string; volCcy24h: string; ts: string }
type QuoteResult = { inputAmountUsd: number; outputAmount: number; outputSymbol: string; estimatedGasFee: string | null; routeCount: number; priceImpactPercent?: string | number | null; feePercent?: string; feeAmountUsd?: number; quotedAt: string; message?: string }
type TokenAnalysis = { stance: 'WATCH' | 'INVESTIGATE' | 'AVOID'; summary: string; catalysts: string[]; risks: string[]; nextStep: string }
type SafetyFlag = { level: 'pass' | 'warn' | 'risk'; label: string; detail: string }
type SafetyCheck = { checkedAt: string; explorerUrl: string; token: { address: string; name: string; symbol: string; decimals: number; communityRecognized: boolean }; market: { price: number; change24h: number; liquidity: number; volume24h: number; holders: number; marketCap: number; transactions24h: number }; concentration: { top10Percent: number | null; top20Percent: number | null; visibleHolderCount: number }; flags: SafetyFlag[] }
type WatchItem = { tokenAddress: string; symbol: string; name: string; color: string; baselinePrice: number; baselineLiquidity: string; addedAt: string }
type TradeRecord = { id: string; kind: 'demo' | 'approval' | 'swap'; symbol: string; amount: number; createdAt: string; transactionHash?: string; quote?: Pick<QuoteResult, 'outputAmount' | 'outputSymbol' | 'estimatedGasFee' | 'routeCount'> }
type Eip1193Provider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }
type WalletTransaction = { to: string; data: string; gas?: string; gasPrice?: string; maxPriorityFeePerGas?: string; value?: string }
type SwapHandoff = { chainId: string; expiresNote: string; approval: WalletTransaction; swap: WalletTransaction; summary: { inputAmountUsd: number; outputSymbol: string; outputRaw: string; minReceiveRaw: string; routeCount: number; slippagePercent: string; feePercent: string; feeAmountUsd: number; feeRecipient: string }; message?: string }

declare global { interface Window { ethereum?: Eip1193Provider } }

const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

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
  const [activityRecords, setActivityRecords] = useState<TradeRecord[]>(() => {
    try { return JSON.parse(window.localStorage.getItem('nexus-alpha-activity') || '[]') as TradeRecord[] }
    catch { return [] }
  })
  const [watchlist, setWatchlist] = useState<WatchItem[]>(() => {
    try { return JSON.parse(window.localStorage.getItem('nexus-alpha-watchlist') || '[]') as WatchItem[] }
    catch { return [] }
  })
  const [browserAlerts, setBrowserAlerts] = useState(() => typeof Notification !== 'undefined' && Notification.permission === 'granted')
  const [walletAddress, setWalletAddress] = useState('')
  const [walletBusy, setWalletBusy] = useState(false)
  const [connectorOpen, setConnectorOpen] = useState(false)
  const [connectorState, setConnectorState] = useState<'idle' | 'checking' | 'ready' | 'missing'>('idle')
  const [radarSignals, setRadarSignals] = useState<Signal[]>(signals)
  const [scanning, setScanning] = useState(false)
  const [toast, setToast] = useState('')
  const [menu, setMenu] = useState(false)
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2400) }
  const recordActivity = (record: TradeRecord) => setActivityRecords(current => [record, ...current].slice(0, 25))
  useEffect(() => { window.localStorage.setItem('nexus-alpha-activity', JSON.stringify(activityRecords)) }, [activityRecords])
  useEffect(() => { window.localStorage.setItem('nexus-alpha-watchlist', JSON.stringify(watchlist)) }, [watchlist])
  const toggleWatch = (signal: Signal) => {
    if (!signal.tokenAddress) { notify('Only X Layer tokens can be added to the watchlist'); return }
    const watched = watchlist.some(item => item.tokenAddress === signal.tokenAddress)
    if (watched) { setWatchlist(current => current.filter(item => item.tokenAddress !== signal.tokenAddress)); notify(`${signal.symbol} removed from watchlist`); return }
    if (watchlist.length >= 8) { notify('Your free watchlist is full. Remove a token to add another.'); return }
    setWatchlist(current => [...current, { tokenAddress: signal.tokenAddress!, symbol: signal.symbol, name: signal.name, color: signal.color, baselinePrice: signal.price || 0, baselineLiquidity: signal.liquidity, addedAt: new Date().toISOString() }])
    notify(`${signal.symbol} added to watchlist`)
  }
  const enableBrowserAlerts = async () => {
    if (typeof Notification === 'undefined') { notify('Browser alerts are not supported here'); return }
    const permission = await Notification.requestPermission()
    setBrowserAlerts(permission === 'granted')
    notify(permission === 'granted' ? 'Browser alerts enabled for Nexus watchlist changes' : 'Browser alerts were not enabled')
  }
  const connectWallet = async () => {
    if (!window.ethereum) { notify('Install or open an EVM wallet such as OKX Wallet to continue'); return }
    setWalletBusy(true)
    try {
      try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xC4' }] }) }
      catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 4902)) throw error
        await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0xC4', chainName: 'X Layer Mainnet', nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 }, rpcUrls: ['https://rpc.xlayer.tech'], blockExplorerUrls: ['https://www.okx.com/web3/explorer/xlayer'] }] })
      }
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[]
      if (!accounts[0]) throw new Error('No wallet account was selected')
      setWalletAddress(accounts[0]); notify(`Wallet connected: ${shortAddress(accounts[0])}`)
    } catch (error) { notify(error instanceof Error ? error.message : 'Wallet connection was cancelled') }
    finally { setWalletBusy(false) }
  }
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
      let movementAlert = ''
      setWatchlist(current => current.map(item => {
        const latest = data.signals!.find(signal => signal.tokenAddress === item.tokenAddress)
        if (!latest?.price || !item.baselinePrice) return item
        const move = ((latest.price - item.baselinePrice) / item.baselinePrice) * 100
        if (!movementAlert && Math.abs(move) >= 5) movementAlert = `${latest.symbol} is ${move >= 0 ? '+' : ''}${move.toFixed(1)}% since your last scan`
        return { ...item, baselinePrice: latest.price, baselineLiquidity: latest.liquidity }
      }))
      if (movementAlert) { notify(`Watch alert: ${movementAlert}`); if (browserAlerts) new Notification('Nexus watch alert', { body: movementAlert }) }
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
  const nav = [[ 'launch', Rocket, 'Launch' ], [ 'radar', Compass, 'Markets' ], [ 'desk', WalletCards, 'Trade' ], [ 'activity', Activity, 'Activity' ]] as const

  return <div className="alpha-app">
    <aside className={menu ? 'alpha-sidebar open' : 'alpha-sidebar'}>
      <div className="alpha-brand"><span><Bolt size={17}/></span> NEXUS <i>ONCHAIN</i><button onClick={() => setMenu(false)}><X size={18}/></button></div>
      <div className="workspace-pill"><span>●</span> X LAYER · PREVIEW</div>
      <nav>{nav.map(([id, Icon, label]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => { setView(id); setMenu(false) }}><Icon size={17}/>{label}</button>)}</nav>
      <div className="sidebar-callout"><ShieldCheck size={19}/><b>Operator-controlled execution</b><p>Quotes, wallet requests and every decision stay visible before you sign.</p></div>
      <div className="profile-row"><div>NX</div><span><b>Nexus workspace</b><small>Research environment</small></span><ChevronRight size={15}/></div>
    </aside>
    <main className="alpha-main">
      <header><button className="menu-button" onClick={() => setMenu(true)}><Menu size={20}/></button><div className="crumb"><span>Workspace</span><ChevronRight size={14}/><b>{view === 'radar' ? 'Alpha radar' : view === 'desk' ? 'Trade desk' : view === 'launch' ? 'Launch lab' : view === 'activity' ? 'Activity' : 'Pricing'}</b></div><div className="header-right"><span className="demo-badge"><ShieldCheck size={14}/> Demo mode</span><button className="refresh" disabled={walletBusy} onClick={() => void connectWallet()}><WalletCards size={15}/>{walletBusy ? 'Connecting…' : walletAddress ? shortAddress(walletAddress) : 'Connect wallet'}</button><button className="refresh" disabled={loading} onClick={() => void refresh()}><RefreshCw className={loading ? 'spinning' : ''} size={15}/> Refresh</button></div></header>
      {view === 'radar' && <Radar selected={selected} select={(signal) => { setSelected(signal); setView('desk'); setTradeStatus('preview') }} signals={radarSignals} tickers={tickers} loading={loading} scanning={scanning} scan={() => void scanXLayer()} onConnect={() => setConnectorOpen(true)} watchlist={watchlist} toggleWatch={toggleWatch} browserAlerts={browserAlerts} enableBrowserAlerts={() => void enableBrowserAlerts()} />}
      {view === 'desk' && <Desk selected={selected} price={price} change={change} amount={amount} setAmount={setAmount} units={units} ticker={currentTicker} status={tradeStatus} setStatus={setTradeStatus} notify={notify} onRecord={recordActivity} walletAddress={walletAddress} connectWallet={connectWallet} />}
      {view === 'launch' && <LaunchLab notify={notify} />}
      {view === 'activity' && <ActivityView records={activityRecords} />}
    </main>
    {connectorOpen && <ConnectorSetup state={connectorState} close={() => setConnectorOpen(false)} check={() => void checkConnector()} />}
    {toast && <div className="alpha-toast"><Check size={16}/>{toast}</div>}
  </div>
}

function Radar({ selected, select, signals, tickers, loading, scanning, scan, onConnect, watchlist, toggleWatch, browserAlerts, enableBrowserAlerts }: { selected: Signal; select: (signal: Signal) => void; signals: Signal[]; tickers: Record<string, Ticker>; loading: boolean; scanning: boolean; scan: () => void; onConnect: () => void; watchlist: WatchItem[]; toggleWatch: (signal: Signal) => void; browserAlerts: boolean; enableBrowserAlerts: () => void }) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<Signal[]>([])
  const [searchMessage, setSearchMessage] = useState('')
  const searchTokens = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = query.trim()
    if (value.length < 2) { setSearchMessage('Enter at least two characters, a token symbol, or a contract address.'); return }
    setSearching(true); setSearchMessage(''); setSearchResults([])
    try {
      const response = await fetch(`/api/xlayer-token-search?query=${encodeURIComponent(value)}`)
      const data = await response.json() as { results?: Signal[]; message?: string }
      if (!response.ok) throw new Error(data.message || 'Token search is unavailable')
      const results = data.results || []
      setSearchResults(results)
      setSearchMessage(results.length ? `${results.length} X Layer token${results.length === 1 ? '' : 's'} found.` : 'No X Layer tokens matched that search.')
    } catch (error) { setSearchMessage(error instanceof Error ? error.message : 'Token search is unavailable') }
    finally { setSearching(false) }
  }
  return <section className="alpha-content">
    <div className="radar-hero"><div><p className="overline">NEXUS / X LAYER DISCOVERY</p><h1>See what is moving<br/><em>before you ape.</em></h1><p>Explore the tokens gaining attention on X Layer, see what is driving the momentum, and decide whether the setup is worth your time.</p><div className="live-source"><span/> {loading ? 'Refreshing OKX public market data' : 'Live market data from OKX and X Layer'}</div></div><div className="radar-orb"><div><Compass size={31}/></div></div></div>
    {watchlist.length > 0 && <section className="watchlist-panel"><div className="watchlist-heading"><div><p className="overline">YOUR WATCHLIST</p><b>{watchlist.length} saved X Layer token{watchlist.length === 1 ? '' : 's'}</b><span>Movement is measured since your last X Layer scan.</span></div><div><span className={browserAlerts ? 'alert-state on' : 'alert-state'}><Bell size={13}/>{browserAlerts ? 'Alerts on' : 'Alerts off'}</span>{!browserAlerts && <button onClick={enableBrowserAlerts}>Enable browser alerts</button>}</div></div><div className="watchlist-grid">{watchlist.map(item => { const latest = signals.find(signal => signal.tokenAddress === item.tokenAddress); const move = latest?.price && item.baselinePrice ? ((latest.price - item.baselinePrice) / item.baselinePrice) * 100 : null; return <button className="watch-item" key={item.tokenAddress} onClick={() => latest && select(latest)}><span className="token-mark" style={{background: item.color}}>{item.symbol[0]}</span><span><b>{item.symbol}</b><small>{latest ? money(latest.price || 0) : 'Awaiting scan'}</small></span><em className={move !== null && move < 0 ? 'negative' : 'positive'}>{move === null ? 'NEW' : `${move >= 0 ? '+' : ''}${move.toFixed(2)}%`}</em><ChevronRight size={15}/></button> })}</div></section>}
    <div className="token-search"><div><p className="overline">TOKEN LOOKUP</p><b>Find any X Layer token</b><span>Search by name, ticker, or contract address.</span></div><form onSubmit={searchTokens}><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, ticker, or 0x contract address" aria-label="Search X Layer tokens"/><button type="submit" disabled={searching}>{searching ? 'Searching...' : 'Search'}</button></form></div>
    {searchMessage && <p className="search-message">{searchMessage}</p>}
    {searchResults.length > 0 && <div className="search-results"><div className="section-title"><div><p className="overline">SEARCH RESULTS</p><h2>Pick a token to review.</h2></div><button onClick={() => { setSearchResults([]); setSearchMessage('') }}>Clear results</button></div><div className="signal-grid">{searchResults.map(signal => <SignalCard key={signal.tokenAddress || signal.symbol} signal={signal} ticker={tickers[signal.symbol]} selected={selected.tokenAddress === signal.tokenAddress} onSelect={() => select(signal)} watched={watchlist.some(item => item.tokenAddress === signal.tokenAddress)} onToggleWatch={() => toggleWatch(signal)} />)}</div></div>}
    <div className="connector"><div className="connector-icon"><Layers3 size={20}/></div><div><b>X Layer smart-money signal feed</b><p>Authenticated OKX Signal API scans recent buy-direction flows on X Layer (chain 196).</p></div><span className="online"><span/> Connected</span><button disabled={scanning} onClick={scan}>{scanning ? 'Scanning…' : 'Scan X Layer'} <RefreshCw className={scanning ? 'spinning' : ''} size={14}/></button></div>
    <div className="section-title"><div><p className="overline">X LAYER DISCOVERY</p><h2>Trending tokens right now.</h2></div><span>Signals are research prompts—not investment advice.</span></div>
    <div className="signal-grid">{signals.slice(0, 10).map(signal => <SignalCard key={signal.tokenAddress || signal.symbol} signal={signal} ticker={tickers[signal.symbol]} selected={selected.tokenAddress ? selected.tokenAddress === signal.tokenAddress : selected.symbol === signal.symbol} onSelect={() => select(signal)} watched={watchlist.some(item => item.tokenAddress === signal.tokenAddress)} onToggleWatch={() => toggleWatch(signal)} />)}</div>
    <div className="radar-foot"><AlertTriangle size={17}/><span><b>Safety rule:</b> Nexus surfaces observable data and explains risk. It does not guarantee returns, recommend a trade, or execute without a user review.</span></div>
  </section>
}

function SignalCard({ signal, ticker, selected, onSelect, watched, onToggleWatch }: { signal: Signal; ticker?: Ticker; selected: boolean; onSelect: () => void; watched: boolean; onToggleWatch: () => void }) {
  const price = ticker ? Number(ticker.last) : signal.price ?? (signal.symbol === 'BTC' ? 68429 : signal.symbol === 'ETH' ? 3612 : 174.86)
  const change = ticker ? ((price - Number(ticker.open24h)) / Number(ticker.open24h)) * 100 : 0
  return <article className={selected ? 'signal-card chosen' : 'signal-card'}><div className="signal-top"><span className="token-mark" style={{background: signal.color}}>{signal.symbol[0]}</span><span className="signal-actions"><span className="risk"><i className={signal.risk === 'Low' ? 'low' : ''}/>{signal.risk} risk</span>{signal.onchain && <button className={watched ? 'watch-toggle saved' : 'watch-toggle'} onClick={onToggleWatch} aria-label={watched ? `Remove ${signal.symbol} from watchlist` : `Add ${signal.symbol} to watchlist`}><Bell size={13}/>{watched ? 'Watching' : 'Watch'}</button>}</span></div><div className="signal-name"><h3>{signal.symbol}</h3><span>{signal.name}</span></div><div className="price-line"><b>{money(price)}</b>{ticker ? <span className={change >= 0 ? 'positive' : 'negative'}>{change >= 0 ? '+' : ''}{change.toFixed(2)}%</span> : <span className="positive">Live signal</span>}</div><div className="score"><span>Signal strength</span><b>{signal.score}<small>/100</small></b><div><i style={{width: `${signal.score}%`}}/></div></div><div className="metrics"><span><small>{signal.onchain ? 'Signal flow' : 'Liquidity'}</small>{signal.liquidity}</span><span><small>Catalyst</small>{signal.catalyst}</span></div><p>{signal.thesis}</p><button onClick={onSelect}>Review trade plan <ArrowRight size={15}/></button></article>
}

function Desk({ selected, price, change, amount, setAmount, units, ticker, status, setStatus, notify, onRecord, walletAddress, connectWallet }: { selected: Signal; price: number; change: number; amount: string; setAmount: (value: string) => void; units: number; ticker?: Ticker; status: 'idle' | 'preview' | 'complete'; setStatus: (value: 'idle' | 'preview' | 'complete') => void; notify: (value: string) => void; onRecord: (record: TradeRecord) => void; walletAddress: string; connectWallet: () => Promise<void> }) {
  const [prompt, setPrompt] = useState('Allocate $100 to the selected market candidate')
  const [quote, setQuote] = useState<QuoteResult | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [quoteError, setQuoteError] = useState('')
  const [handoff, setHandoff] = useState<SwapHandoff | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [submitting, setSubmitting] = useState<'approval' | 'swap' | null>(null)
  const [handoffError, setHandoffError] = useState('')
  const [approvalHash, setApprovalHash] = useState('')
  const [approvalReady, setApprovalReady] = useState(false)
  const [swapHash, setSwapHash] = useState('')
  const [analysis, setAnalysis] = useState<TokenAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [analysisMode, setAnalysisMode] = useState<'ai' | 'rules' | null>(null)
  const [safety, setSafety] = useState<SafetyCheck | null>(null)
  const [safetyLoading, setSafetyLoading] = useState(false)
  const [safetyError, setSafetyError] = useState('')
  const estimatedFee = Math.max(Number(amount || 0) * 0.001, 0.1)
  useEffect(() => { setQuote(null); setQuoteError(''); setHandoff(null); setHandoffError(''); setApprovalHash(''); setApprovalReady(false); setSwapHash(''); setAnalysis(null); setAnalysisError(''); setAnalysisMode(null); setSafety(null); setSafetyError('') }, [selected.tokenAddress, amount])
  const getQuote = async () => {
    if (!selected.tokenAddress) return
    setQuoting(true); setQuoteError(''); setQuote(null)
    try {
      const response = await fetch(`/api/xlayer-quote?tokenAddress=${encodeURIComponent(selected.tokenAddress)}&amount=${encodeURIComponent(amount)}`)
      const data = await response.json() as QuoteResult
      if (!response.ok) throw new Error(data.message || 'Quote unavailable')
      setQuote(data)
    } catch (error) { setQuoteError(error instanceof Error ? error.message : 'Quote unavailable') }
    finally { setQuoting(false) }
  }
  const analyzeToken = async () => {
    if (!selected.tokenAddress) { notify('Select an X Layer token before asking Nexus for analysis'); return }
    setAnalyzing(true); setAnalysis(null); setAnalysisError('')
    try {
      const response = await fetch('/api/xlayer-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, token: { symbol: selected.symbol, name: selected.name, address: selected.tokenAddress, rank: selected.rank, price, change, risk: selected.risk, liquidity: selected.liquidity, catalyst: selected.catalyst, thesis: selected.thesis, quote: quote ? { outputAmount: quote.outputAmount, outputSymbol: quote.outputSymbol, routeCount: quote.routeCount, priceImpactPercent: quote.priceImpactPercent, estimatedGasFee: quote.estimatedGasFee } : null } }) })
      const data = await response.json() as { analysis?: TokenAnalysis; mode?: 'ai' | 'rules'; message?: string }
      if (!response.ok || !data.analysis) throw new Error(data.message || 'Nexus could not analyze this token')
      setAnalysis(data.analysis); setAnalysisMode(data.mode === 'ai' ? 'ai' : 'rules'); setStatus('preview')
    } catch (error) { setAnalysisError(error instanceof Error ? error.message : 'Nexus could not analyze this token') }
    finally { setAnalyzing(false) }
  }
  const runSafetyCheck = async () => {
    if (!selected.tokenAddress) { notify('Select an X Layer token before running a safety check'); return }
    setSafetyLoading(true); setSafety(null); setSafetyError('')
    try {
      const response = await fetch(`/api/xlayer-safety?tokenAddress=${encodeURIComponent(selected.tokenAddress)}`)
      const data = await response.json() as SafetyCheck & { message?: string }
      if (!response.ok || !data.flags) throw new Error(data.message || 'Safety check unavailable')
      setSafety(data)
    } catch (error) { setSafetyError(error instanceof Error ? error.message : 'Safety check unavailable') }
    finally { setSafetyLoading(false) }
  }
  const simulate = () => {
    if (selected.onchain && !quote) { notify('Review a live quote before simulating this trade'); return }
    onRecord({ id: crypto.randomUUID(), kind: 'demo', symbol: selected.symbol, amount: Number(amount || 0), createdAt: new Date().toISOString(), quote: quote ? { outputAmount: quote.outputAmount, outputSymbol: quote.outputSymbol, estimatedGasFee: quote.estimatedGasFee, routeCount: quote.routeCount } : undefined })
    setStatus('complete'); notify('Demo order completed — no funds were moved')
  }
  const prepareHandoff = async () => {
    if (!walletAddress) { await connectWallet(); return }
    if (!selected.tokenAddress || !quote) { notify('Review a live quote before preparing a wallet transaction'); return }
    setPreparing(true); setHandoffError(''); setHandoff(null); setApprovalHash(''); setApprovalReady(false); setSwapHash('')
    try {
      const response = await fetch(`/api/xlayer-swap?tokenAddress=${encodeURIComponent(selected.tokenAddress)}&amount=${encodeURIComponent(amount)}&walletAddress=${encodeURIComponent(walletAddress)}`)
      const data = await response.json() as SwapHandoff
      if (!response.ok) throw new Error(data.message || 'Transaction preparation failed')
      setHandoff(data)
    } catch (error) { setHandoffError(error instanceof Error ? error.message : 'Transaction preparation failed') }
    finally { setPreparing(false) }
  }
  const waitForApproval = async (hash: string) => {
    if (!window.ethereum) return
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise(resolve => window.setTimeout(resolve, 3000))
      const receipt = await window.ethereum.request({ method: 'eth_getTransactionReceipt', params: [hash] }) as { status?: string } | null
      if (!receipt) continue
      if (receipt.status === '0x1') { setApprovalReady(true); notify('Approval confirmed. You can now sign the swap.'); return }
      setHandoffError('The approval transaction did not succeed. Prepare a new transaction before continuing.'); return
    }
    setHandoffError('Approval is still pending. Keep this page open and wait for X Layer confirmation before signing the swap.')
  }
  const submitTransaction = async (kind: 'approval' | 'swap') => {
    if (!window.ethereum || !handoff) { notify('Connect your wallet before signing'); return }
    setSubmitting(kind); setHandoffError('')
    try {
      const transaction = kind === 'approval' ? handoff.approval : handoff.swap
      const params = { from: walletAddress, to: transaction.to, data: transaction.data, value: transaction.value || '0x0', ...(transaction.gas ? { gas: `0x${BigInt(transaction.gas).toString(16)}` } : {}), ...(transaction.gasPrice ? { gasPrice: `0x${BigInt(transaction.gasPrice).toString(16)}` } : transaction.maxPriorityFeePerGas ? { maxPriorityFeePerGas: `0x${BigInt(transaction.maxPriorityFeePerGas).toString(16)}` } : {}) }
      const hash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [params] }) as string
      if (kind === 'approval') { setApprovalHash(hash); onRecord({ id: crypto.randomUUID(), kind: 'approval', symbol: selected.symbol, amount: Number(amount || 0), createdAt: new Date().toISOString(), transactionHash: hash }); notify('Approval submitted. Waiting for X Layer confirmation.'); void waitForApproval(hash) }
      else { setSwapHash(hash); onRecord({ id: crypto.randomUUID(), kind: 'swap', symbol: selected.symbol, amount: Number(amount || 0), createdAt: new Date().toISOString(), transactionHash: hash, quote: quote ? { outputAmount: quote.outputAmount, outputSymbol: quote.outputSymbol, estimatedGasFee: quote.estimatedGasFee, routeCount: quote.routeCount } : undefined }); notify('Swap submitted to X Layer. Track it in your wallet or explorer.') }
    } catch (error) { setHandoffError(error instanceof Error ? error.message : 'Wallet signature was cancelled') }
    finally { setSubmitting(null) }
  }
  return <section className="alpha-content desk-content"><div className="desk-heading"><div><p className="overline">NEXUS ALPHA DESK / REVIEW</p><h1>Trade plan, <em>not blind execution.</em></h1><p>Turn your instruction into a readable order. You retain the final decision.</p></div><span className="guardrail"><LockKeyhole size={16}/> No wallet connected</span></div>
    <div className="desk-grid"><div className="command-panel"><p className="panel-label"><Bot size={15}/> ASK NEXUS</p><textarea value={prompt} onChange={event => setPrompt(event.target.value)}/><div className="prompt-suggestions"><button onClick={() => setPrompt('What should I verify before I touch this token?')}>Risk checks</button><button onClick={() => setPrompt('Summarize the setup and tell me what would change the thesis.')}>Thesis check</button></div><button className="build-plan" disabled={analyzing} onClick={() => void analyzeToken()}><Sparkles size={17}/>{analyzing ? 'Nexus is analyzing...' : 'Analyze with Nexus'}</button>{analysisError && <div className="analysis-error"><AlertTriangle size={14}/>{analysisError}</div>}{analysis && <article className="ai-analysis"><div className="analysis-top"><span className="panel-label"><Bot size={15}/> {analysisMode === 'ai' ? 'NEXUS AI ANALYSIS' : 'NEXUS RESEARCH BRIEF'}</span><b className={`stance ${analysis.stance.toLowerCase()}`}>{analysis.stance}</b></div><p>{analysis.summary}</p><div className="analysis-columns"><div><small>CATALYSTS</small><ul>{analysis.catalysts.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div><div><small>RISKS</small><ul>{analysis.risks.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div></div><div className="analysis-next"><small>NEXT STEP</small><b>{analysis.nextStep}</b></div><em>{analysisMode === 'ai' ? 'AI research support only.' : 'Free rules-based research brief.'} Review the underlying data before any wallet action.</em></article>}<button className="safety-button" disabled={safetyLoading} onClick={() => void runSafetyCheck()}><ShieldCheck size={16}/>{safetyLoading ? 'Checking live data...' : 'Run Safety Check'}</button>{safetyError && <div className="analysis-error"><AlertTriangle size={14}/>{safetyError}</div>}{safety && <article className="safety-check"><div className="safety-top"><span className="panel-label"><ShieldCheck size={15}/> LIVE SAFETY CHECK</span><a href={safety.explorerUrl} target="_blank" rel="noreferrer">Explorer <ExternalLink size={12}/></a></div><div className="contract-line"><code>{shortAddress(safety.token.address)}</code><button onClick={() => void navigator.clipboard.writeText(safety.token.address).then(() => notify('Contract address copied')).catch(() => notify('Unable to copy contract address'))}><Copy size={13}/> Copy CA</button></div><div className="safety-stats"><span><small>LIQUIDITY</small><b>{money(safety.market.liquidity)}</b></span><span><small>24H VOLUME</small><b>{money(safety.market.volume24h)}</b></span><span><small>TOP 10</small><b>{safety.concentration.top10Percent === null ? 'N/A' : `${safety.concentration.top10Percent}%`}</b></span><span><small>HOLDERS</small><b>{safety.market.holders.toLocaleString()}</b></span></div><div className="safety-flags">{safety.flags.map(flag => <div className={`safety-flag ${flag.level}`} key={flag.label}>{flag.level === 'pass' ? <Check size={14}/> : <AlertTriangle size={14}/>}<span><b>{flag.label}</b><small>{flag.detail}</small></span></div>)}</div><em>Data comes from OKX market endpoints. This is not a contract audit or investment recommendation.</em></article>}<div className="why"><b>Why {selected.symbol} is surfaced</b><p>{selected.thesis}</p></div></div>
      <div className="order-panel"><div className="order-heading"><div><p className="panel-label">EXECUTION PREVIEW</p><h2>Buy {selected.symbol}</h2></div><span className="demo-badge">SIMULATED</span></div><div className="market-row"><span className="token-mark" style={{background:selected.color}}>{selected.symbol[0]}</span><div><b>{selected.instId}</b><small>{money(price)} · <em className={change >= 0 ? 'positive' : 'negative'}>{change >= 0 ? '+' : ''}{change.toFixed(2)}% / 24h</em></small></div><BarChart3 size={19}/></div><label className="amount-field">Amount to allocate <div><span>$</span><input type="number" min="1" max="10000" value={amount} onChange={event => setAmount(event.target.value)}/><b>USDT</b></div></label><div className="order-lines"><span>Estimated quantity <b>{units.toFixed(selected.symbol === 'BTC' ? 6 : 4)} {selected.symbol}</b></span><span>Reference price <b>{money(price)}</b></span><span>Estimated fee <b>{money(estimatedFee)}</b></span>{ticker && <span>24h range <b>{money(Number(ticker.low24h))} – {money(Number(ticker.high24h))}</b></span>}</div><div className="review-warning"><AlertTriangle size={17}/><span><b>Review before confirming.</b> Market price, spread, liquidity and volatility can change before any real trade.</span></div>{status === 'complete' ? <div className="complete-state"><Check size={18}/><span><b>Demo order recorded</b><small>Simulated {money(Number(amount || 0))} buy of {selected.symbol}. No funds moved.</small></span></div> : <button className="simulate-button" onClick={simulate}><ShieldCheck size={17}/> Confirm demo trade</button>}<small className="confirm-note">This prototype does not connect wallets, hold API keys, or submit live orders.</small></div></div>
    {selected.onchain && <div className="quote-review"><div><p className="overline">LIVE QUOTE / OKX DEX</p><h3>Check the route before demo execution.</h3><p>Quotes are read-only and use X Layer USDT as the input token.</p></div><button className="quote-button" disabled={quoting} onClick={() => void getQuote()}><RefreshCw className={quoting ? 'spinning' : ''} size={15}/>{quoting ? 'Getting live quote…' : 'Get live X Layer quote'}</button>{quote && <div className="quote-result"><b>{quote.outputAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })} {quote.outputSymbol || selected.symbol}</b><span>{quote.routeCount} route(s) · Gas estimate: {quote.estimatedGasFee || 'unavailable'} base units</span></div>}{quoteError && <div className="quote-error"><AlertTriangle size={14}/>{quoteError}</div>}</div>}
    {selected.onchain && <div className="wallet-handoff"><div><p className="overline">OPTIONAL LIVE HANDOFF</p><h3>Sign in your wallet, only after review.</h3><p>Preparing a handoff never sends a transaction. Approval and swap each require a separate wallet confirmation.</p></div>{!walletAddress ? <button className="wallet-button" onClick={() => void connectWallet()}><WalletCards size={15}/> Connect X Layer wallet</button> : <button className="wallet-button" disabled={preparing || !quote} onClick={() => void prepareHandoff()}><WalletCards size={15}/>{preparing ? 'Preparing transaction…' : 'Prepare wallet transaction'}</button>}{walletAddress && <span className="wallet-address">{shortAddress(walletAddress)} / X Layer</span>}{handoff && <div className="handoff-steps"><div><span>1</span><b>Approve exact {money(handoff.summary.inputAmountUsd)} USDT</b><small>Approval is a separate on-chain permission for this amount.</small><button disabled={submitting !== null || Boolean(approvalHash)} onClick={() => void submitTransaction('approval')}>{approvalHash ? 'Waiting for confirmation…' : submitting === 'approval' ? 'Awaiting wallet…' : 'Approve in wallet'}</button></div><div><span>2</span><b>Sign the X Layer swap</b><small>{handoff.summary.routeCount} route(s) · {handoff.summary.slippagePercent}% maximum slippage.</small><button disabled={submitting !== null || !approvalReady || Boolean(swapHash)} onClick={() => void submitTransaction('swap')}>{swapHash ? 'Swap submitted' : submitting === 'swap' ? 'Awaiting wallet…' : approvalReady ? 'Sign swap in wallet' : 'Await approval confirmation'}</button></div><p>{handoff.expiresNote}</p></div>}{handoffError && <div className="quote-error"><AlertTriangle size={14}/>{handoffError}</div>}</div>}
    {quote && Number(quote.feePercent || 0) > 0 && <div className="fee-disclosure"><CircleDollarSign size={16}/><span><b>Nexus service fee: {quote.feePercent}% ({money(quote.feeAmountUsd || 0)})</b><small>Included in the USDT input amount and shown before any wallet signature.</small></span></div>}
  </section>
}

function LaunchLab({ notify }: { notify: (value: string) => void }) {
  const [name, setName] = useState('Moon Scout')
  const [symbol, setSymbol] = useState('SCOUT')
  const [supply, setSupply] = useState('1000000000')
  const [liquidity, setLiquidity] = useState('5000')
  const [creatorAllocation, setCreatorAllocation] = useState('10')
  const [launchGoal, setLaunchGoal] = useState('Build an early X Layer community around useful on-chain discovery.')
  const [visualStyle, setVisualStyle] = useState<'Signal core' | 'Street poster' | 'Clean protocol' | 'Retro arcade'>('Signal core')
  const [planned, setPlanned] = useState(false)
  const liquidityUsd = Math.max(0, Number(liquidity || 0))
  const creatorPercent = Math.max(0, Number(creatorAllocation || 0))
  const score = Math.max(22, Math.min(95, Math.round(48 + Math.min(30, liquidityUsd / 250) - Math.max(0, creatorPercent - 10) * 1.7)))
  const risk = liquidityUsd < 2500 || creatorPercent > 20 ? 'High' : liquidityUsd < 5000 || creatorPercent > 15 ? 'Medium' : 'Lower'
  const valuationModel = liquidityUsd * 12
  const styleKit = {
    'Signal core': { palette: ['#75a7ff', '#8b75ff', '#65dfbd'], line: 'A sharp signal mark for people who move with the chain, not the timeline.', angle: 'Signal before noise' },
    'Street poster': { palette: ['#ff875b', '#fa5fbf', '#ffd35f'], line: 'A loud, collectible rally cry designed for fast community recognition.', angle: 'The chain has eyes' },
    'Clean protocol': { palette: ['#73dfc4', '#55a7ff', '#d5e2ff'], line: 'A calm, credible identity that makes the token feel intentional from day one.', angle: 'Simple tools. Clear signal.' },
    'Retro arcade': { palette: ['#b887ff', '#6ce6ff', '#f6ed75'], line: 'A playful, high-energy identity with a repeatable visual language for posts.', angle: 'Press start on-chain' },
  }[visualStyle]
  const displayName = name.trim() || 'Untitled token'
  const displaySymbol = symbol.trim() || 'TOKEN'
  const initials = displaySymbol.slice(0, 2)
  const launchPlan = () => { setPlanned(true); notify('Launch Studio brief generated — planning and branding only') }
  const copyBrief = async () => {
    const brief = `${displayName} ($${displaySymbol})\nGoal: ${launchGoal}\nStyle: ${visualStyle}\nPositioning: ${styleKit.line}\nLaunch angle: ${styleKit.angle}\nGuardrails: publish disclosures, define liquidity policy, and never imply guaranteed returns.`
    try { await navigator.clipboard.writeText(brief); notify('Brand brief copied') } catch { notify('Could not copy the brief in this browser') }
  }
  const copyLaunchPost = async () => {
    const post = `${displayName} ($${displaySymbol}) is taking shape on X Layer.\n\n${styleKit.angle}.\n\n${launchGoal}\n\nBefore anything goes live: clear token info, visible liquidity policy, and transparent risk disclosures.\n\n#XLayer #Onchain`
    try { await navigator.clipboard.writeText(post); notify('Launch post copied') } catch { notify('Could not copy the post in this browser') }
  }
  const downloadLogo = () => {
    const safeName = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'nexus-token'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${styleKit.palette[0]}"/><stop offset="1" stop-color="${styleKit.palette[1]}"/></linearGradient><radialGradient id="r" cx="30%" cy="20%" r="70%"><stop stop-color="${styleKit.palette[2]}" stop-opacity=".95"/><stop offset="1" stop-color="${styleKit.palette[2]}" stop-opacity="0"/></radialGradient></defs><rect width="1024" height="1024" rx="180" fill="url(#g)"/><rect width="1024" height="1024" rx="180" fill="url(#r)"/><circle cx="780" cy="230" r="205" fill="none" stroke="white" stroke-opacity=".26" stroke-width="12"/><circle cx="270" cy="780" r="270" fill="none" stroke="white" stroke-opacity=".2" stroke-width="12"/><rect x="265" y="365" width="494" height="294" rx="62" fill="#0d1530" fill-opacity=".3" stroke="white" stroke-opacity=".66" stroke-width="9"/><text x="512" y="557" text-anchor="middle" fill="white" font-family="Arial, Helvetica, sans-serif" font-size="210" font-weight="800" letter-spacing="-18">${initials}</text><circle cx="310" cy="274" r="25" fill="white"/><circle cx="700" cy="736" r="18" fill="white" fill-opacity=".65"/></svg>`
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const link = document.createElement('a'); link.href = url; link.download = `${safeName}-logo.svg`; link.click(); URL.revokeObjectURL(url)
    notify('Logo SVG downloaded')
  }
  return <section className="alpha-content launch-content"><div className="desk-heading"><div><p className="overline">NEXUS LAUNCH STUDIO</p><h1>Plan the launch.<br/><em>Give it a face.</em></h1><p>Turn a token idea into a clear launch brief, a visual direction, and community-ready messaging before you put anything on-chain.</p></div><span className="guardrail"><ShieldCheck size={16}/> Planning · branding · no deployment</span></div><div className="launch-grid"><div className="launch-form"><p className="panel-label"><Rocket size={15}/> TOKEN BRIEF</p><div className="launch-inputs"><label>Token name<input value={name} maxLength={32} onChange={event => setName(event.target.value)}/></label><label>Ticker<input value={symbol} maxLength={10} onChange={event => setSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}/></label><label className="launch-wide">Launch goal<textarea value={launchGoal} maxLength={220} onChange={event => setLaunchGoal(event.target.value)} placeholder="What should the community rally around?"/></label><label>Visual style<select value={visualStyle} onChange={event => setVisualStyle(event.target.value as typeof visualStyle)}>{['Signal core', 'Street poster', 'Clean protocol', 'Retro arcade'].map(style => <option key={style}>{style}</option>)}</select></label><label>Fixed supply<input type="number" min="1" value={supply} onChange={event => setSupply(event.target.value)}/></label><label>Initial liquidity (USDT)<input type="number" min="0" value={liquidity} onChange={event => setLiquidity(event.target.value)}/></label><label>Creator allocation (%)<input type="number" min="0" max="100" value={creatorAllocation} onChange={event => setCreatorAllocation(event.target.value)}/></label></div><div className="launch-prompt"><Sparkles size={16}/><span><b>Brand direction:</b> {styleKit.line}</span></div><button className="build-plan" onClick={launchPlan}><Sparkles size={17}/> Generate launch studio brief</button><small>Nexus creates planning and branding concepts. It does not deploy a token, create liquidity, collect funds, or promise performance.</small></div><div className="launch-report"><div className="launch-token"><span className="token-mark" style={{background:`linear-gradient(135deg, ${styleKit.palette[0]}, ${styleKit.palette[1]})`}}>{initials[0]}</span><div><p className="panel-label">X LAYER TOKEN PLAN</p><h2>{displayName} <small>${displaySymbol}</small></h2></div><span className={risk === 'Lower' ? 'launch-risk good' : 'launch-risk'}>{risk} risk</span></div><div className="launch-score"><div><span>Launch readiness</span><b>{score}<small>/100</small></b></div><i><em style={{width:`${score}%`}}/></i><p>A simple score based on liquidity and creator allocation. Not financial advice.</p></div><div className="launch-metrics"><span><small>Liquidity budget</small><b>{money(liquidityUsd)}</b></span><span><small>Planning valuation band</small><b>{money(valuationModel)}</b></span><span><small>Creator allocation</small><b>{creatorPercent.toFixed(0)}%</b></span></div><div className="risk-checks"><p className="panel-label"><AlertTriangle size={15}/> RISK CHECKS</p><span className={liquidityUsd >= 5000 ? 'pass' : 'warn'}>{liquidityUsd >= 5000 ? <Check size={14}/> : <AlertTriangle size={14}/>} {liquidityUsd >= 5000 ? 'Initial liquidity meets the $5,000 planning threshold.' : 'Consider deeper starting liquidity before any public launch.'}</span><span className={creatorPercent <= 15 ? 'pass' : 'warn'}>{creatorPercent <= 15 ? <Check size={14}/> : <AlertTriangle size={14}/>} {creatorPercent <= 15 ? 'Creator allocation is within the 15% planning guardrail.' : 'Creator allocation is above the 15% planning guardrail.'}</span><span className="warn"><AlertTriangle size={14}/> Publish clear risk disclosures and obtain legal advice before any public token issuance.</span></div></div></div>{planned && <section className="studio-output"><div className="studio-heading"><div><p className="overline">GENERATED LAUNCH STUDIO BRIEF</p><h2>{displayName} brand kit</h2></div><div className="studio-actions"><button onClick={() => void copyLaunchPost()}><Megaphone size={14}/> Copy launch post</button><button onClick={() => void copyBrief()}><Copy size={14}/> Copy brief</button></div></div><div className="studio-grid"><article className="brand-card"><div className="logo-concept" style={{background:`radial-gradient(circle at 30% 20%, ${styleKit.palette[2]}, transparent 34%), linear-gradient(135deg, ${styleKit.palette[0]}, ${styleKit.palette[1]})`}}><span>{initials}</span><i/><i/><i/></div><p className="panel-label"><Palette size={14}/> LOGO CONCEPT</p><h3>{visualStyle}</h3><p>Use this mark as a starting direction for the token avatar, social headers, and launch graphics. Palette: {styleKit.palette.join(' · ')}.</p><button className="logo-download" onClick={downloadLogo}><Download size={13}/> Download logo SVG</button></article><article className="brand-card"><p className="panel-label"><Megaphone size={14}/> POSITIONING</p><h3>{styleKit.angle}</h3><p>{launchGoal || 'Set a community-first launch goal before publishing.'}</p><div className="message-chip">“{displayName}: {styleKit.angle.toLowerCase()}.”</div></article><article className="brand-card"><p className="panel-label"><Rocket size={14}/> ROLLOUT CHECKLIST</p><ol className="rollout-list"><li>Publish the token story, allocation, and risks.</li><li>Set a visible liquidity and wallet-policy plan.</li><li>Release the logo, avatar, and first community post.</li><li>Move to Markets after launch to monitor real flows.</li></ol></article></div></section>}</section>
}

function ActivityView({ records }: { records: TradeRecord[] }) {
  const detail = (record: TradeRecord) => record.kind === 'demo'
    ? `Simulated allocation of ${money(record.amount)} to ${record.symbol}. No funds moved.`
    : `${record.kind === 'approval' ? 'Exact USDT approval' : 'Swap'} handoff submitted for ${money(record.amount)} of ${record.symbol}.`
  const title = (record: TradeRecord) => record.kind === 'demo' ? 'Demo buy order recorded' : record.kind === 'approval' ? 'Wallet approval submitted' : 'X Layer swap submitted'
  return <section className="alpha-content"><div className="page-heading"><p className="overline">AUDIT TRAIL</p><h1>Every decision is visible.</h1><p>Records are saved in this browser so the operator can return to a transparent decision history.</p></div>{records.length ? <div className="activity-list">{records.map(record => <article className="activity-card" key={record.id}><div className={record.kind === 'demo' ? 'activity-icon' : 'activity-icon live'}>{record.kind === 'demo' ? <Check size={18}/> : <WalletCards size={18}/>}</div><div><span className="overline">{new Date(record.createdAt).toLocaleString()} / {record.kind.toUpperCase()}</span><h3>{title(record)}</h3><p>{detail(record)}</p>{record.quote && <div className="audit-quote"><span>Live quote reviewed</span><b>{record.quote.outputAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })} {record.quote.outputSymbol} · {record.quote.routeCount} route(s)</b></div>}{record.transactionHash && <a className="tx-link" href={`https://www.okx.com/web3/explorer/xlayer/tx/${record.transactionHash}`} target="_blank" rel="noreferrer">View submitted transaction {shortAddress(record.transactionHash)} <ExternalLink size={12}/></a>}</div><span className="activity-status">{record.kind === 'demo' ? 'Demo' : 'Submitted'}</span></article>)}</div> : <div className="activity-card"><div className="activity-icon neutral"><Activity size={18}/></div><div><span className="overline">NO EXECUTIONS YET</span><h3>Your decision history will appear here.</h3><p>Open Alpha Radar, select a candidate, review a live quote, then record a demo trade or prepare a wallet handoff.</p></div></div>}</section>
}

function ConnectorSetup({ state, close, check }: { state: 'idle' | 'checking' | 'ready' | 'missing'; close: () => void; check: () => void }) { return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="X Layer connector setup"><div className="connector-modal"><button className="modal-close" onClick={close}><X size={18}/></button><div className="modal-symbol"><Layers3 size={22}/></div><p className="overline">SECURE SERVER-SIDE CONNECTION</p><h2>Activate the X Layer connector.</h2><p>Your OKX Web3 credentials belong in deployment environment variables—not in the browser, source code, or a chat prompt.</p><ol><li>Add <code>OKX_WEB3_API_KEY</code>, <code>OKX_WEB3_SECRET_KEY</code>, and <code>OKX_WEB3_PASSPHRASE</code> to your host.</li><li>Deploy the included <code>/api/xlayer-status.js</code> server route.</li><li>Check the connection. The radar can then be extended with signed X Layer token, liquidity, and quote requests.</li></ol>{state === 'ready' && <div className="connection-state ready"><Check size={16}/><span><b>Connector verified</b><small>Signed API access is available. Next: enable the token scanner.</small></span></div>}{state === 'missing' && <div className="connection-state missing"><AlertTriangle size={16}/><span><b>Credentials or route not found</b><small>Expected locally until the app is deployed with environment variables.</small></span></div>}<button className="connection-button" disabled={state === 'checking'} onClick={check}>{state === 'checking' ? 'Checking secure connection…' : 'Check connection'} <ArrowRight size={15}/></button><a href="https://web3.okx.com/onchainos/dev-docs-v5/dex-api/dex-get-aggregator-supported-chains" target="_blank" rel="noreferrer">Read the OKX DEX API docs <ExternalLink size={13}/></a></div></div> }

createRoot(document.getElementById('root')!).render(<App />)
