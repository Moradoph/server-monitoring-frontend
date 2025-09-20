import React, { useEffect, useRef, useCallback } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

interface XTermShellProps {
  wsUrl?: string
  token?: string
  open?: boolean
  reconnectTick?: number
}

const XTermShell: React.FC<XTermShellProps> = ({ 
  wsUrl, 
  token, 
  open = true, 
  reconnectTick 
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const hadOpenRef = useRef(false)
  const resizeObsRef = useRef<ResizeObserver | null>(null)
  const timeoutsRef = useRef<Set<number>>(new Set())
  const rafRef = useRef<number | null>(null)
  
  // Helper to clear all timeouts
  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(timeout => clearTimeout(timeout))
    timeoutsRef.current.clear()
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])
  
  // Helper to add timeout with cleanup tracking
  const addTimeout = useCallback((callback: () => void, delay: number) => {
    const timeout = setTimeout(() => {
      timeoutsRef.current.delete(timeout)
      callback()
    }, delay) as number
    timeoutsRef.current.add(timeout)
    return timeout
  }, [])

  useEffect(() => {
    // initialize only when container is available
    const init = () => {
      if (!containerRef.current) return false
      try {
        const term = new Terminal({ 
          cursorBlink: true, 
          convertEol: true,
          cols: 90,      // Increased from 80 to better fit in 700px width
          rows: 28,      // Increased from 24 to better fit in 450px height
          scrollback: 1000,
          fontFamily: 'Monaco, Menlo, "DejaVu Sans Mono", "Lucida Console", monospace',
          fontSize: 14,
          lineHeight: 1.2,
          letterSpacing: 0,
          allowTransparency: true,
          theme: {
            background: 'rgba(0, 0, 0, 0)',
            foreground: '#2ee400ff',
            cursor: '#2ee400ff',
            selectionBackground: 'rgba(112, 115, 255, 1)',
            black: '#000000ff',
            brightBlack: '#808080',
            red: '#ff6c6b',
            brightRed: '#ff6c6b',
            green: '#98be65',
            brightGreen: '#98be65',
            yellow: '#ecbe7b',
            brightYellow: '#ecbe7b',
            blue: '#51afef',
            brightBlue: '#51afef',
            magenta: '#c678dd',
            brightMagenta: '#c678dd',
            cyan: '#46d9ff',
            brightCyan: '#46d9ff',
            white: '#bbc2cf',
            brightWhite: '#ffffff'
          }
        })
        const fit = new FitAddon()
        term.loadAddon(fit)
        term.open(containerRef.current)
        
        // Ensure proper fitting after container is rendered
        rafRef.current = requestAnimationFrame(() => {
          try { 
            fit.fit()
            // Give a moment for the DOM to update after fit
            addTimeout(() => {
              try {
                fit.fit()
                // Ensure terminal takes up the full available space
                const { cols, rows } = term
                term.resize(Math.max(cols, 50), Math.max(rows, 15))
              } catch (e) { /* ignore resize errors */ }
            }, 50) // Reduced from 100ms
          } catch (e) { /* ignore fit errors */ }
        })
        
        termRef.current = term
        fitRef.current = fit
        return true
      } catch (err) {
        console.error('Failed to initialize xterm:', err)
        return false
      }
    }

    if (!init()) {
      // try once more on next animation frame
      const id = requestAnimationFrame(() => init())
      ;(window as any).__xterm_init_raf = id
    }

    // ensure fit is called when the container resizes or when opened/fullscreen changes
    const setupResize = () => {
      try {
        if (containerRef.current && fitRef.current) {
          if (resizeObsRef.current) resizeObsRef.current.disconnect()
          const ro = new ResizeObserver(() => {
            // Debounce the resize to avoid excessive calls
            addTimeout(() => {
              try { 
                if (fitRef.current && termRef.current) {
                  fitRef.current.fit()
                  // Ensure minimum reasonable size after resize
                  const { cols, rows } = termRef.current
                  termRef.current.resize(Math.max(cols, 50), Math.max(rows, 15))
                }
              } catch (e) { }
            }, 30) // Reduced from 50ms for smoother experience
          })
          ro.observe(containerRef.current)
          resizeObsRef.current = ro
        }
      } catch (e) { }
    }
    setupResize()

    const url = wsUrl || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8000/ws/shell`
    const urlWithToken = token ? `${url}?token=${encodeURIComponent(token)}` : url
    const ws = new WebSocket(urlWithToken)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => {
      hadOpenRef.current = true
      try { termRef.current?.writeln('\x1b[32mConnected to host shell\x1b[0m') } catch (e) { }
    }

    ws.onmessage = (ev) => {
      // receive text output and write to terminal
      const data = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data)
      try { termRef.current?.write(data) } catch (e) { }
    }

  ws.onclose = () => { try { if (hadOpenRef.current) termRef.current?.writeln('\r\n\x1b[31mDisconnected\x1b[0m') } catch (e) { } }
  ws.onerror = (e) => { try { if (hadOpenRef.current) termRef.current?.writeln('\r\n\x1b[31mWebSocket error\x1b[0m') } catch (e) { } }

    // wire terminal input to websocket
    // wire terminal input to websocket
    try {
      termRef.current?.onData((data: string) => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(data)
      })
    } catch (e) { }

  const onResize = () => { try { fitRef.current?.fit() } catch (e) { } }
  window.addEventListener('resize', onResize)

    return () => {
      clearAllTimeouts()
      try { wsRef.current?.close() } catch (e) {}
      try { termRef.current?.dispose() } catch (e) {}
      window.removeEventListener('resize', onResize)
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      try { resizeObsRef.current?.disconnect() } catch (e) { }
    }
  }, [wsUrl, token])

  // re-fit when `open`, `fullscreen` toggles or reconnect requested
  useEffect(() => {
    if (!open) return
    
    // wait for popup animation (~300ms) then fit multiple times for reliability
    const timeout1 = addTimeout(() => {
      try { fitRef.current?.fit() } catch (e) { }
    }, 300) // Reduced from 350ms
    
    const timeout2 = addTimeout(() => {
      try { 
        if (fitRef.current && termRef.current) {
          fitRef.current.fit()
          // Final resize to ensure proper sizing
          const { cols, rows } = termRef.current
          termRef.current.resize(Math.max(cols, 50), Math.max(rows, 15))
        }
      } catch (e) { }
    }, 450) // Reduced from 500ms
    
    return () => {
      clearTimeout(timeout1)
      clearTimeout(timeout2)
    }
  }, [open, reconnectTick, addTimeout])

  return (
    <div 
      ref={containerRef} 
      className="xterm-container rounded-sm" 
      style={{ 
        width: '100%', 
        height: '100%', 
        minHeight: '250px',
        padding: '8px',
        boxSizing: 'border-box'
      }} 
    />
  )
}

export default XTermShell
