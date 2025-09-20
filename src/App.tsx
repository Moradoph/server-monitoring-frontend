import React, { useEffect, useState } from 'react'
import { Menu, Moon, Sun, Play, Pause, ChevronLeft, ChevronRight, User, Cpu, HardDrive, Network, Activity } from 'lucide-react'
import ShellBubble from './ShellBubble'
import { Button } from './components/ui/button'
import { Separator } from './components/ui/separator'
import { cn } from './lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu'

function formatBytes(n: number) {
  if (!n && n !== 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let val = Math.abs(n)
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }
  return (n < 0 ? '-' : '') + val.toFixed(2) + ' ' + units[i]
}

function formatBits(n: number) {
  if (!n && n !== 0) return '-'
  // convert bytes to bits
  const bits = n * 8
  // reuse formatBytes for scaling, then replace unit
  return formatBytes(bits).replace('B', 'b')
}

type Metrics = {
  cpu_percent?: number
  ram_percent?: number
  disk_percent?: number
  memory?: any
  swap?: any
  disks?: Array<any>
  per_core?: Array<number>
  load_avg?: { '1'?: number; '5'?: number; '15'?: number }
  temps?: Record<string, Array<number>>
  processes?: Array<any>
  uptime?: {
    seconds: number
    formatted: string
    boot_time: number
  }
}

function Bar({ label, percent }: { label: string; percent?: number }) {
  const val = typeof percent === 'number' ? percent : Number(percent || 0)
  const p = Number.isFinite(val) ? Math.max(0, Math.min(100, val)) : 0
  return (
    <div className="mb-3">
      <div className="flex justify-between mb-1">
        <span className="text-sm">{label}</span>
        <span className="text-sm">{p.toFixed(1)}%</span>
      </div>
      <div className="progress-bar">
        <div className="fill bg-gradient-to-r from-green-400 to-green-600" style={{ width: `${p}%` }} />
      </div>
    </div>
  )
}

export default function App() {
  const [metrics, setMetrics] = useState<Metrics>({})
  const [filter, setFilter] = useState('')
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try { return localStorage.getItem('darkMode') === '1' } catch { return false }
  })
  const [network, setNetwork] = useState({ recvRate: 0, sentRate: 0, totalRecv: 0, totalSent: 0 })
  const [netHistory, setNetHistory] = useState<Array<{ r: number; s: number }>>([])
  const [netHover, setNetHover] = useState<null | { x: number; y: number; idx: number; r: number; s: number; timestamp: number }>(null)
  const prevNetRef = React.useRef<{ recv?: number; sent?: number; ts?: number }>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('sidebarCollapsed') === '1' } catch { return false }
  })
  const [paused, setPaused] = useState(false)
  const pausedRef = React.useRef<boolean>(false)
  const rootStateClass = paused ? 'state-paused' : 'state-running'
  const [headerHeight, setHeaderHeight] = useState<number>(64)
  const [cardColumns, setCardColumns] = useState<number>(() => {
    try { return Number(localStorage.getItem('cardColumns') || '2') } catch { return 2 }
  })

  useEffect(() => {
    try { localStorage.setItem('cardColumns', String(cardColumns)) } catch { }
  }, [cardColumns])

  useEffect(() => {
    try { document.documentElement.classList.toggle('dark', darkMode) } catch { }
    try { localStorage.setItem('darkMode', darkMode ? '1' : '0') } catch { }
  }, [darkMode])

  useEffect(() => {
    try { localStorage.setItem('sidebarCollapsed', sidebarCollapsed ? '1' : '0') } catch { }
  }, [sidebarCollapsed])

  useEffect(() => {
    const measure = () => {
      const header = document.querySelector('header') as HTMLElement | null
      // use bounding rect height for precision, subtract 1px to avoid tiny gap
      const raw = header ? header.getBoundingClientRect().height : 64
      const h = Math.max(0, Math.round(raw) - 1)
      setHeaderHeight(h)
    }
    measure()
    window.addEventListener('resize', measure)
    const headerEl = document.querySelector('header')
    const obs = headerEl ? new MutationObserver(measure) : null
    if (obs && headerEl) obs.observe(headerEl, { childList: true, attributes: true, subtree: true })
    return () => {
      window.removeEventListener('resize', measure)
      if (obs) obs.disconnect()
    }
  }, [])

  useEffect(() => {
    const url = ((import.meta as any).env?.VITE_WS_URL || '') || `ws://${location.hostname}:8000/ws`
    const ws = new WebSocket(url)
    let isConnected = false
    
    ws.onopen = () => {
      isConnected = true
    }
    
    ws.onmessage = (ev) => {
      if (!isConnected) return // Ignore messages if not properly connected
      
      try {
        const data = JSON.parse(ev.data)
        if (!pausedRef.current) {
          setMetrics(data)

          // network rates: compute from cumulative counters
          const recv = data.net_bytes_recv || 0
          const sent = data.net_bytes_sent || 0
          const ts = data.timestamp || Date.now() / 1000
          const prev = prevNetRef.current
          if (prev && typeof prev.recv === 'number' && typeof prev.sent === 'number' && prev.ts) {
            const dt = Math.max(0.001, ts - prev.ts)
            const recvRate = Math.max(0, (recv - prev.recv) / dt)
            const sentRate = Math.max(0, (sent - prev.sent) / dt)
            setNetwork({ recvRate, sentRate, totalRecv: recv, totalSent: sent })
            setNetHistory(h => {
              const next = [...h.slice(-59)] // Keep only last 59 entries
              next.push({ r: recvRate, s: sentRate })
              return next
            })
          } else {
            setNetwork({ recvRate: 0, sentRate: 0, totalRecv: recv, totalSent: sent })
            setNetHistory(h => {
              const next = [...h.slice(-59)]
              next.push({ r: 0, s: 0 })
              return next
            })
          }
          prevNetRef.current = { recv, sent, ts }
        }
      } catch (e) {
        // ignore parsing errors
      }
    }
    
    ws.onclose = () => {
      isConnected = false
    }
    
    ws.onerror = () => {
      isConnected = false
    }
    
    return () => {
      isConnected = false
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
    }
  }, [])

  const cpuPercent = metrics.cpu_percent || 0

  const barColor = cpuPercent > 90 ? 'bg-red-600' : cpuPercent > 75 ? 'bg-orange-500' : 'bg-green-500'

  const filteredProcs = (metrics.processes || []).filter((p: any) => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return (p.name || '').toLowerCase().includes(q) || (p.cmd || '').toLowerCase().includes(q) || String(p.pid).includes(q)
  })

  // Pagination for processes
  const [procPage, setProcPage] = useState(0)
  const pageSize = 20
  const processLimit = 400

  // apply processLimit to the filtered list, then paginate that
  const pagedProcs = filteredProcs.slice(0, processLimit)
  const totalProcs = pagedProcs.length
  const totalPages = Math.max(1, Math.ceil(Math.max(0, totalProcs) / pageSize))
  const displayedProcs = pagedProcs.slice(procPage * pageSize, Math.min((procPage + 1) * pageSize, totalProcs))

  // clamp page when filtered list or page count changes
  useEffect(() => {
    if (procPage >= totalPages) setProcPage(Math.max(0, totalPages - 1))
  }, [totalPages])

  // process detail modal
  const [selectedProc, setSelectedProc] = useState<any | null>(null)
  const [modalVisible, setModalVisible] = useState(false)

  // disable background scrolling while modal is open
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    const prevPadding = document.body.style.paddingRight
    function getScrollbarWidth() {
      return window.innerWidth - document.documentElement.clientWidth
    }
    if (selectedProc) {
      const sb = getScrollbarWidth()
      if (sb > 0) document.body.style.paddingRight = `${sb}px`
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = prevOverflow
      document.body.style.paddingRight = prevPadding
    }
    return () => {
      document.body.style.overflow = prevOverflow
      document.body.style.paddingRight = prevPadding
    }
  }, [selectedProc])

  // toggle modalVisible to drive CSS transitions
  useEffect(() => {
    let t: any = null
    if (selectedProc) {
      // wait a tick so DOM has overlay/panel before adding show
      t = setTimeout(() => setModalVisible(true), 10)
    } else {
      // animate out then hide
      setModalVisible(false)
    }
    return () => { if (t) clearTimeout(t) }
  }, [selectedProc])

  // compute RAM percent robustly: prefer metrics.memory.percent, fallback to used/total
  const ramPercent = (metrics.memory && typeof metrics.memory.percent === 'number')
    ? metrics.memory.percent
    : (metrics.memory && metrics.memory.total ? (metrics.memory.used / metrics.memory.total) * 100 : (metrics.ram_percent || 0))

  function Header() {
    return (
      <header className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/40 px-4 py-3 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSidebarOpen(v => !v)}
            aria-label="Toggle menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          
          <div className="ml-2 text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
            Server Monitor
          </div>

          <Button
            variant="outline"
            size="sm"
            className={`hidden md:flex transition-transform duration-300 ${sidebarCollapsed ? 'rotate-180' : ''}`}
            onClick={() => setSidebarCollapsed(s => !s)}
            title="Toggle sidebar"
          >
            {"<"}
          </Button>

        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDarkMode(d => !d)}
            title="Toggle theme"
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          
          <Button
            variant={paused ? "destructive" : "default"}
            size="sm"
            className="transition-all duration-200"
            onClick={() => {
              setPaused(prev => {
                const next = !prev
                pausedRef.current = next
                if (!next) {
                  prevNetRef.current = {}
                }
                return next
              })
            }}
            aria-pressed={paused}
          >
            {paused ? (
              <><Play className="h-4 w-4 mr-1" />Resume</>
            ) : (
              <><Pause className="h-4 w-4 mr-1" />Pause</>
            )}
          </Button>
          
          <Separator orientation="vertical" className="h-6" />
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">Admin</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                Profile Settings
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                Preferences
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled className="text-destructive">
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    )
  }

  function Sidebar() {
    const nav = [
      { key: 'overview', label: 'CPU', icon: Cpu },
      { key: 'disks', label: 'Memory & Storage', icon: HardDrive },
      { key: 'network', label: 'Network', icon: Network },
      { key: 'processes', label: 'Processes', icon: Activity },
    ]
    
    const curHash = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : ''
    
    const scrollToSection = (key: string) => (e: React.MouseEvent) => {
      e.preventDefault()
      const el = document.getElementById(key)
      if (el) {
        const extra = 12
        const top = Math.max(0, el.getBoundingClientRect().top + window.pageYOffset - headerHeight - extra)
        window.scrollTo({ top, behavior: 'smooth' })
        try {
          history.replaceState(null, '', `#${key}`)
        } catch (_) {
          // ignore
        }
      }
    }

    return (
      <aside
        className={cn(
          "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-r border-border/40 p-4 space-y-2 transition-all duration-300 ease-in-out",
          "sticky self-start z-30 overflow-hidden",
          sidebarOpen ? "block" : "hidden md:block",
          sidebarCollapsed ? "sidebar-collapsed w-0 opacity-0 pointer-events-none" : "sidebar-expanded w-64 opacity-100"
        )}
        style={{ 
          top: `${headerHeight}px`, 
          height: `calc(100vh - ${headerHeight}px)`,
          transform: sidebarCollapsed ? 'translateX(-100%)' : 'translateX(0)'
        }}
      >
        <nav className="flex flex-col gap-1">
          {nav.map(item => {
            const Icon = item.icon
            const isActive = curHash === item.key
            return (
              <Button
                key={item.key}
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "justify-start gap-3 h-11 px-3 transition-all duration-200",
                  isActive && "bg-accent text-accent-foreground font-semibold shadow-sm",
                  "hover:bg-accent/80 hover:text-accent-foreground"
                )}
                onClick={scrollToSection(item.key)}
                asChild
              >
                <a href={`#${item.key}`}>
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className={cn(
                    "sidebar-label transition-all duration-200",
                    sidebarCollapsed ? "opacity-0 translate-x-2 w-0" : "opacity-100 translate-x-0"
                  )}>
                    {item.label}
                  </span>
                </a>
              </Button>
            )
          })}
        </nav>
        
        {!sidebarCollapsed && (
          <div className="mt-8 p-3 rounded-lg bg-muted/20 border border-border/40">
            <div className="text-xs font-medium text-muted-foreground mb-2">System Status</div>
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Uptime</span>
                <span className="font-medium">{metrics.uptime?.formatted || 'Loading...'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Load</span>
                <span className="font-medium">{metrics.load_avg ? `${metrics.load_avg['1']?.toFixed(1)}` : '-'}</span>
              </div>
            </div>
          </div>
        )}
      </aside>
    )
  }

  function WaveformDual({ data, topoColor = 'rgba(34,197,94,0.95)', bottomColor = 'rgba(220,38,38,0.95)' }: { data: Array<{ r: number; s: number }>; topoColor?: string; bottomColor?: string }) {
    const ref = React.useRef<HTMLCanvasElement | null>(null)
    const wrapRef = React.useRef<HTMLDivElement | null>(null)
    const animationRef = React.useRef<number | null>(null)
    const previousDataRef = React.useRef<Array<{ r: number; s: number }>>([])
    const [isAnimating, setIsAnimating] = React.useState(false)

    useEffect(() => {
      const cvs = ref.current
      if (!cvs) return

      const ctx = cvs.getContext('2d')!
      const DPR = window.devicePixelRatio || 1
      const w = cvs.clientWidth
      const h = cvs.clientHeight
      cvs.width = Math.floor(w * DPR)
      cvs.height = Math.floor(h * DPR)
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)

      // Animation function
      const animate = (progress: number = 1) => {
        ctx.clearRect(0, 0, w, h)
        
        // Add subtle grid background
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
        ctx.lineWidth = 1
        for (let i = 1; i < 4; i++) {
          const y = (h / 4) * i
          ctx.beginPath()
          ctx.moveTo(0, y)
          ctx.lineTo(w, y)
          ctx.stroke()
        }
        
        if (!data || data.length === 0) return

        // convert samples to Mbps for consistent units
        const conv = data.map(d => ({ r: (d.r * 8) / 1e6, s: (d.s * 8) / 1e6 }))
        const prevConv = previousDataRef.current.length > 0 ? previousDataRef.current.map(d => ({ r: (d.r * 8) / 1e6, s: (d.s * 8) / 1e6 })) : conv
        
        // compute a stable max across buffer (avoid tiny values)
        let maxVal = 1
        for (const d of conv) if (d) maxVal = Math.max(maxVal, d.r, d.s)

        const len = conv.length
        const barW = Math.max(1, w / Math.max(1, len))
        const centerY = h / 2

        for (let i = 0; i < len; i++) {
          const x = i * barW
          const sample = conv[i] || { r: 0, s: 0 }
          const prevSample = prevConv[i] || sample
          
          // Interpolate between previous and current values for smooth animation
          const currentR = prevSample.r + (sample.r - prevSample.r) * progress
          const currentS = prevSample.s + (sample.s - prevSample.s) * progress
          
          const rNorm = Math.min(1, currentR / maxVal)
          const sNorm = Math.min(1, currentS / maxVal)
          const rH = rNorm * (h / 2)
          const sH = sNorm * (h / 2)

          // Add glow effect for active bars
          if (rH > 2 || sH > 2) {
            ctx.shadowBlur = 8
            ctx.shadowColor = topoColor
          } else {
            ctx.shadowBlur = 0
          }

          // top bar (recv) with gradient
          const topGradient = ctx.createLinearGradient(0, centerY - rH, 0, centerY)
          topGradient.addColorStop(0, topoColor)
          topGradient.addColorStop(1, topoColor.replace('0.95', '0.7'))
          ctx.fillStyle = topGradient
          ctx.fillRect(x + barW * 0.1, centerY - rH, Math.max(1, barW * 0.6), rH)

          // Reset shadow for bottom bar
          if (sH > 2) {
            ctx.shadowColor = bottomColor
          } else {
            ctx.shadowBlur = 0
          }

          // bottom bar (sent) with gradient
          const bottomGradient = ctx.createLinearGradient(0, centerY, 0, centerY + sH)
          bottomGradient.addColorStop(0, bottomColor)
          bottomGradient.addColorStop(1, bottomColor.replace('0.95', '0.7'))
          ctx.fillStyle = bottomGradient
          ctx.fillRect(x + barW * 0.1, centerY, Math.max(1, barW * 0.6), sH)
        }
        
        // Reset shadow
        ctx.shadowBlur = 0

        // Add center line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, centerY)
        ctx.lineTo(w, centerY)
        ctx.stroke()
      }

      // Start animation if data has changed
      if (JSON.stringify(data) !== JSON.stringify(previousDataRef.current)) {
        setIsAnimating(true)
        let startTime: number | null = null
        const duration = 300 // ms

        const animateFrame = (timestamp: number) => {
          if (!startTime) startTime = timestamp
          const elapsed = timestamp - startTime
          const progress = Math.min(elapsed / duration, 1)
          
          animate(progress)
          
          if (progress < 1) {
            animationRef.current = requestAnimationFrame(animateFrame)
          } else {
            setIsAnimating(false)
            previousDataRef.current = [...data]
          }
        }

        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current)
        }
        animationRef.current = requestAnimationFrame(animateFrame)
      } else {
        animate(1)
      }

      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current)
        }
      }
    }, [data, topoColor, bottomColor])

    // Enhanced mouse handlers for better tooltip
    useEffect(() => {
      const cvs = ref.current
      const wrap = wrapRef.current
      if (!cvs || !wrap) return

      const onMove = (e: MouseEvent) => {
        const rect = cvs.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        
        // if outside bounds, clear hover
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
          setNetHover(null)
          return
        }
        
        const len = data.length || 1
        const idx = Math.floor((x / rect.width) * len)
        const clamped = Math.max(0, Math.min(len - 1, idx))
        const sample = data[clamped] || { r: 0, s: 0 }
        
        // Enhanced tooltip positioning - avoid edges
        const wrapRect = wrap.getBoundingClientRect()
        let tooltipX = rect.left - wrapRect.left + x + 12
        let tooltipY = rect.top - wrapRect.top + y - 60
        
        // Adjust if tooltip would go off screen
        if (tooltipX > wrapRect.width - 200) tooltipX = x - 180
        if (tooltipY < 0) tooltipY = y + 12
        
        setNetHover({ 
          x: tooltipX, 
          y: tooltipY, 
          idx: clamped, 
          r: (sample.r * 8) / 1e6, 
          s: (sample.s * 8) / 1e6,
          timestamp: Date.now() - (len - 1 - clamped) * 1000 // Approximate timestamp
        })
      }

      const onLeave = () => setNetHover(null)

      // window fallback: if mouse moves but not over canvas, clear hover
      const onWindowMove = (e: MouseEvent) => {
        const rect = cvs.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) setNetHover(null)
      }

      cvs.addEventListener('mousemove', onMove)
      cvs.addEventListener('mouseleave', onLeave)
      wrap.addEventListener('mouseleave', onLeave)
      window.addEventListener('mousemove', onWindowMove)

      return () => {
        cvs.removeEventListener('mousemove', onMove)
        cvs.removeEventListener('mouseleave', onLeave)
        wrap.removeEventListener('mouseleave', onLeave)
        window.removeEventListener('mousemove', onWindowMove)
      }
    }, [data])

    return (
      <div className="relative" ref={wrapRef}>
        <canvas 
          ref={ref} 
          className={cn(
            "w-full h-20 rounded-md transition-all duration-200",
            isAnimating && "opacity-90"
          )}
        />
        {netHover && (
          <div 
            style={{ 
              position: 'absolute', 
              left: netHover.x, 
              top: netHover.y, 
              zIndex: 60,
              transform: 'scale(1)',
              opacity: 1,
            }} 
            className={cn(
              "pointer-events-none backdrop-blur-md rounded-lg shadow-xl border transition-all duration-200 ease-out animate-in fade-in-0 zoom-in-95",
              "bg-background/95 border-border/40 p-3 text-sm"
            )}
          >
            <div className="flex items-center gap-2 font-medium text-foreground mb-1">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
              Sample #{netHover.idx + 1}
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(99, 88, 248, 0.95)' }}></div>
                  <span className="text-muted-foreground">Download:</span>
                </div>
                <span className="font-mono font-medium text-blue-400">{netHover.r.toFixed(2)} Mbps</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(252, 76, 199, 0.95)' }}></div>
                  <span className="text-muted-foreground">Upload:</span>
                </div>
                <span className="font-mono font-medium text-pink-400">{netHover.s.toFixed(2)} Mbps</span>
              </div>
              <div className="border-t border-border/40 pt-1 mt-2">
                <span className="text-muted-foreground text-xs">
                  {new Date(netHover.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`${darkMode ? 'dark' : ''} min-h-screen`} style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <Header />
      <div className="flex">
        <Sidebar />
        <main className={cn(
          "flex-1 p-6 transition-all duration-300 ease-in-out"
        )}>
          <div className={cn(
            "max-w-6xl mx-auto transition-all duration-300 ease-in-out"
          )}>
            <ShellBubble token={'a-strong-secret'} />
            <div id="overview" className="space-y-4">
              <section id="cpu" className="card border dark:border-gray-800">
                <h1 className="text-lg font-semibold mb-2">CPU</h1>
                <div className="flex items-center">
                  <div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">CPU Total</div>
                    <div className="text-2xl font-semibold">{cpuPercent.toFixed(1)}%</div>
                  </div>
                  <div className="ml-auto text-sm text-gray-600 dark:text-gray-300">Load: {metrics.load_avg ? `${metrics.load_avg['1']?.toFixed(2)} ${metrics.load_avg['5']?.toFixed(2)} ${metrics.load_avg['15']?.toFixed(2)}` : '-'}</div>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">CPU</span>
                    <span className="text-sm">{cpuPercent.toFixed(1)}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className={`fill ${barColor === 'bg-red-600' ? 'bg-gradient-to-r from-red-500 to-red-700' : barColor === 'bg-orange-500' ? 'bg-gradient-to-r from-orange-400 to-orange-600' : 'bg-gradient-to-r from-green-400 to-green-600'}`} style={{ width: `${Math.max(0, Math.min(100, cpuPercent))}%` }} />
                  </div>
                </div>
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Per-Core Usage</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {(metrics.per_core || []).map((pc: any, idx: number) => (
                      <div key={idx} className="p-2 border dark:border-gray-800 rounded">
                        <div className="flex justify-between items-baseline">
                          <div className="text-sm font-medium">Core {idx}</div>
                          <div className="text-sm text-gray-600 dark:text-gray-300">{pc.toFixed(1)}%</div>
                        </div>
                        <div className="progress-bar mt-2">
                          <div className={`fill bg-gradient-to-r from-blue-400 to-blue-600`} style={{ width: `${Math.max(0, Math.min(100, pc))}%` }} />
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Temp: {metrics.temps && Object.values(metrics.temps)[idx] ? `${Object.values(metrics.temps)[idx][0]}°C` : '-'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section id="disks" className="card border dark:border-gray-800">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <h4 className="text-lg font-semibold mb-2">Memory</h4>
                    <Bar label="RAM" percent={ramPercent} />
                    <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                      <div>Total: {metrics.memory ? (metrics.memory.total / (1024 ** 3)).toFixed(2) + ' GB' : '-'}</div>
                      <div>Available: {metrics.memory ? (metrics.memory.available / (1024 ** 3)).toFixed(2) + ' GB' : '-'}</div>
                    </div>

                    <div className="mt-3">
                      <Bar label="Swap" percent={metrics.swap ? metrics.swap.percent : undefined} />
                      <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                        <div>Total: {metrics.swap ? (metrics.swap.total / (1024 ** 3)).toFixed(2) + ' GB' : '-'}</div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold mb-2">Disks</h4>
                    <div className="overflow-x-auto table-zebra">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-100 dark:bg-gray-800 text-left">
                          <tr>
                            <th className="px-3 py-2">Device</th>
                            <th className="px-3 py-2">Mount</th>
                            <th className="px-3 py-2">Type</th>
                            <th className="px-3 py-2">Total</th>
                            <th className="px-3 py-2">Used</th>
                            <th className="px-3 py-2">Free</th>
                            <th className="px-3 py-2">%</th>
                            <th className="px-3 py-2">Usage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(metrics.disks || []).map((d: any) => (
                            <tr key={d.mountpoint} className="border-t dark:border-t-gray-800">
                              <td className="px-3 py-1 align-center">{d.device}</td>
                              <td className="px-3 py-1 align-center">{d.mountpoint}</td>
                              <td className="px-3 py-1 align-center">{d.fstype}</td>
                              <td className="px-3 py-1 align-center">{(d.total / (1024 ** 3)).toFixed(2)} GB</td>
                              <td className="px-3 py-1 align-center">{(d.used / (1024 ** 3)).toFixed(2)} GB</td>
                              <td className="px-3 py-1 align-center">{(d.free / (1024 ** 3)).toFixed(2)} GB</td>
                              <td className="px-3 py-1 align-center">{d.percent}%</td>
                              <td className="px-3 py-1 align-center w-48">
                                <div className="progress-bar h-3 rounded bg-gray-200">
                                  <div className="fill bg-gradient-to-r from-purple-400 to-purple-600 h-3" style={{ width: `${Math.max(0, Math.min(100, d.percent || 0))}%` }} />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </section>

              <section id="network" className="card border dark:border-gray-800 grid grid-cols-7 items-center justify-between">
                <div className="flex-1 col-span-2">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-lg font-semibold">Network</h4>
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <div>Download: {formatBytes(network.recvRate)}/s ({formatBits(network.recvRate)}/s)</div>
                    <div>Upload: {formatBytes(network.sentRate)}/s ({formatBits(network.sentRate)}/s)</div>
                    <div>Total Download: {formatBytes(network.totalRecv)}</div>
                    <div>Total Upload: {formatBytes(network.totalSent)}</div>
                  </div>
                </div>
                <div className="ml-4 col-span-5">
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      <span className="mr-3">Now: {(network.recvRate * 8 / 1e6).toFixed(2)}↓ / {(network.sentRate * 8 / 1e6).toFixed(2)}↑ Mbps</span>
                      <span>Peak: {(() => {
                        let peak = 0
                        for (const s of netHistory) {
                          peak = Math.max(peak, (s.r * 8) / 1e6, (s.s * 8) / 1e6)
                        }
                        return peak.toFixed(2) + ' Mbps'
                      })()}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-3 h-3 rounded-sm" style={{ background: 'rgba(99, 88, 248, 0.95)' }}></span>
                      <span>Down</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-3 h-3 rounded-sm" style={{ background: 'rgba(252, 76, 199, 0.95)' }}></span>
                      <span>Up</span>
                    </div>

                  </div>
                  <div className="mt-2 w-full">
                    <WaveformDual data={netHistory} topoColor="rgba(99, 88, 248, 0.95)" bottomColor="rgba(252, 76, 199, 0.95)" />
                  </div>
                </div>
              </section>
            </div>

            <section id="processes" className="mt-6">
              <div className="overflow-auto card border dark:border-gray-800">
                <h2 className="text-lg font-semibold mb-2">Processes</h2>
                <div className="mb-2 flex items-center gap-2">
                  <input value={filter} onChange={e => { setFilter(e.target.value); setProcPage(0) }} className="rounded px-2 py-1 text-sm border bg-white text-gray-900 placeholder-gray-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400 border-gray-300 dark:border-gray-700" placeholder="Filter by name, cmd or pid" />
                  <div className="text-xs text-gray dark:text-gray-400">Showing {Math.min(filteredProcs.length, processLimit)} / {(metrics.processes || []).length}</div>
                </div>
                <table className="w-full text-sm table-zebra table-fixed">
                  <colgroup>
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '36%' }} />
                  </colgroup>
                  <thead className="bg-gray-100 dark:bg-gray-800 text-left">
                    <tr>
                      <th className="px-3 py-2 whitespace-nowrap">PID</th>
                      <th className="px-3 py-2 whitespace-nowrap">Name</th>
                      <th className="px-3 py-2 whitespace-nowrap">CPU %</th>
                      <th className="px-3 py-2 whitespace-nowrap">MEM %</th>
                      <th className="px-3 py-2 whitespace-nowrap">RSS</th>
                      <th className="px-3 py-2 whitespace-nowrap">User</th>
                      <th className="px-3 py-2 whitespace-nowrap">Cmd</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedProcs.map((p: any) => (
                      <tr key={p.pid} className="border-t dark:border-t-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer" onClick={() => setSelectedProc(p)}>
                        <td className="px-3 py-1 align-top whitespace-nowrap text-xs">{p.pid}</td>
                        <td className="px-3 py-1 align-top whitespace-nowrap overflow-hidden truncate" title={p.name}>{p.name}</td>
                        <td className="px-3 py-1 align-top whitespace-nowrap">{p.cpu_percent?.toFixed?.(1) ?? p.cpu_percent}</td>
                        <td className="px-3 py-1 align-top whitespace-nowrap">{p.mem_percent?.toFixed?.(1) ?? p.mem_percent}</td>
                        <td className="px-3 py-1 align-top whitespace-nowrap text-xs">{p.rss}</td>
                        <td className="px-3 py-1 align-top whitespace-nowrap overflow-hidden truncate" title={p.user}>{p.user}</td>
                        <td className="px-3 py-1 align-top whitespace-nowrap overflow-hidden truncate" title={p.cmd}>{p.cmd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <div className="text-xs text-gray-600 dark:text-gray-300">Showing {displayedProcs.length} of {totalProcs} (filtered {filteredProcs.length})</div>
                <div className="flex items-center gap-2">
                  <button className="px-2 py-1 border dark:border-gray-800 rounded text-sm" onClick={() => setProcPage(p => Math.max(0, p - 1))} disabled={procPage === 0}>Prev</button>
                  <div className="text-xs text-gray-600 dark:text-gray-300">Page {procPage + 1} / {totalPages}</div>
                  <button className="px-2 py-1 border dark:border-gray-800 rounded text-sm" onClick={() => setProcPage(p => Math.min(totalPages - 1, p + 1))} disabled={procPage >= totalPages - 1}>Next</button>
                </div>
              </div>

              {/* modal for process details */}
              {selectedProc && (
                <div className="fixed inset-0 z-40">
                  <div className={`fixed inset-0 bg-black modal-overlay ${modalVisible ? 'show' : ''}`} onClick={() => setSelectedProc(null)} />
                  <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
                    <div className={`border dark:border-gray-800 bg-white dark:bg-gray-950 rounded shadow p-4 z-50 w-11/12 max-w-2xl pointer-events-auto modal-panel ${modalVisible ? 'show' : ''}`} style={{ maxHeight: '80vh', overflow: 'auto', color: 'var(--text)' }}>
                      <div className="flex items-start justify-between">
                        <h3 className="text-lg font-semibold">Process {selectedProc.pid} - {selectedProc.name}</h3>
                        <button className="text-sm text-gray-500" onClick={() => setSelectedProc(null)}>Close</button>
                      </div>
                      <div className="mt-3 text-sm">
                        <pre className="whitespace-pre-wrap break-words text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded">{JSON.stringify(selectedProc, null, 2)}</pre>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}
