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

  // Improved scroll to bottom function
  const scrollToBottom = useCallback(() => {
    try {
      if (termRef.current) {
        const term = termRef.current as any
        // Use multiple methods to ensure scrolling works
        if (typeof term.scrollToBottom === 'function') {
          term.scrollToBottom()
        }
        if (term.buffer && term.buffer.active) {
          const buffer = term.buffer.active
          if (buffer.baseY !== undefined && buffer.cursorY !== undefined) {
            const targetLine = buffer.baseY + buffer.cursorY
            if (typeof term.scrollToLine === 'function') {
              term.scrollToLine(targetLine)
            }
          }
        }
        // Force scroll to end using viewport
        if (term._core && term._core.viewport) {
          term._core.viewport.scrollToBottom()
        }
      }
    } catch (e) {
      console.warn('Scroll to bottom failed:', e)
    }
  }, [])

  useEffect(() => {
    // Initialize terminal only when container is available
    const init = () => {
      if (!containerRef.current) return false
      try {
        const term = new Terminal({ 
          cursorBlink: true, 
          convertEol: true,
          // Let the fit addon determine optimal size
          scrollback: 5000,
          fontFamily: 'Monaco, Menlo, "DejaVu Sans Mono", "Lucida Console", monospace',
          fontSize: 14,
          lineHeight: 1.2,
          letterSpacing: 0,
          allowTransparency: true,
          disableStdin: false,
          // Enable proper text wrapping
          windowsMode: false,
          macOptionIsMeta: true,
          rightClickSelectsWord: false,
          theme: {
            background: 'rgba(0, 0, 0, 0)',
            foreground: '#2ee400ff',
            cursor: '#2ee400ff',
            selectionBackground: 'rgba(112, 115, 255, 0.3)',
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
        
        // Improved fitting with proper timing
        const doFit = () => {
          try {
            if (containerRef.current && fitRef.current) {
              fitRef.current.fit()
              // Send resize event to the connected shell
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                const { cols, rows } = term
                // Send terminal resize signal (this depends on your backend implementation)
                const resizeMsg = JSON.stringify({ type: 'resize', cols, rows })
                wsRef.current.send(resizeMsg)
              }
            }
          } catch (e) {
            console.warn('Fit failed:', e)
          }
        }
        
        // Initial fit with proper timing
        rafRef.current = requestAnimationFrame(() => {
          doFit()
          // Secondary fit to ensure proper sizing
          addTimeout(doFit, 100)
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
      // Try once more on next animation frame
      const id = requestAnimationFrame(() => init())
      rafRef.current = id
    }

    // Improved resize handling
    const setupResize = () => {
      try {
        if (containerRef.current && fitRef.current) {
          if (resizeObsRef.current) resizeObsRef.current.disconnect()
          
          let resizeTimeout: number | null = null
          const ro = new ResizeObserver(() => {
            // Debounce resize events
            if (resizeTimeout) clearTimeout(resizeTimeout)
            resizeTimeout = setTimeout(() => {
              try {
                if (fitRef.current && termRef.current) {
                  fitRef.current.fit()
                  // Notify backend of resize
                  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    const { cols, rows } = termRef.current
                    const resizeMsg = JSON.stringify({ type: 'resize', cols, rows })
                    wsRef.current.send(resizeMsg)
                  }
                }
              } catch (e) {
                console.warn('Resize fit failed:', e)
              }
            }, 50) as number
          })
          ro.observe(containerRef.current)
          resizeObsRef.current = ro
        }
      } catch (e) {
        console.warn('Setup resize failed:', e)
      }
    }
    setupResize()

    const url = wsUrl || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8000/ws/shell`
    const urlWithToken = token ? `${url}?token=${encodeURIComponent(token)}` : url
    const ws = new WebSocket(urlWithToken)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => {
      hadOpenRef.current = true
      try { 
        termRef.current?.writeln('\x1b[32mConnected to host shell\x1b[0m')
        // Send initial terminal size
        if (termRef.current) {
          const { cols, rows } = termRef.current
          const resizeMsg = JSON.stringify({ type: 'resize', cols, rows })
          ws.send(resizeMsg)
        }
      } catch (e) { 
        console.warn('WebSocket open handling failed:', e)
      }
    }

    ws.onmessage = (ev) => {
      // Receive text output and write to terminal
      let data: string
      if (typeof ev.data === 'string') {
        data = ev.data
      } else if (ev.data instanceof ArrayBuffer) {
        data = new TextDecoder().decode(ev.data)
      } else {
        console.warn('Unexpected message type:', typeof ev.data)
        return
      }
      
      try { 
        writeAndScroll(data)
      } catch (e) { 
        console.warn('Write message failed:', e)
      }
    }

    // Improved write and scroll function
    const writeAndScroll = (data: string) => {
      try {
        if (termRef.current) {
          termRef.current.write(data)
          // Use requestAnimationFrame to ensure write is processed before scrolling
          requestAnimationFrame(() => {
            scrollToBottom()
          })
        }
      } catch (e) {
        console.warn('Write and scroll failed:', e)
      }
    }

    ws.onclose = () => { 
      try { 
        if (hadOpenRef.current && termRef.current) {
          termRef.current.writeln('\r\n\x1b[31mDisconnected\x1b[0m')
          scrollToBottom()
        }
      } catch (e) { 
        console.warn('WebSocket close handling failed:', e)
      } 
    }
    
    ws.onerror = (e) => { 
      try { 
        if (hadOpenRef.current && termRef.current) {
          termRef.current.writeln('\r\n\x1b[31mWebSocket error\x1b[0m')
          scrollToBottom()
        }
      } catch (e) { 
        console.warn('WebSocket error handling failed:', e)
      } 
    }

    // Wire terminal input to websocket
    try {
      termRef.current?.onData((data: string) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(data)
        }
      })
    } catch (e) {
      console.warn('Terminal input wiring failed:', e)
    }

    // Global resize handler
    const onResize = () => { 
      try { 
        if (fitRef.current && termRef.current) {
          fitRef.current.fit()
          // Notify backend of resize
          if (ws && ws.readyState === WebSocket.OPEN) {
            const { cols, rows } = termRef.current
            const resizeMsg = JSON.stringify({ type: 'resize', cols, rows })
            ws.send(resizeMsg)
          }
        }
      } catch (e) {
        console.warn('Global resize failed:', e)
      } 
    }
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
      try { resizeObsRef.current?.disconnect() } catch (e) {}
    }
  }, [wsUrl, token, addTimeout, scrollToBottom])

  // Re-fit when `open` toggles or reconnect requested
  useEffect(() => {
    if (!open) return
    
    // Wait for popup animation then fit multiple times for reliability
    const timeout1 = addTimeout(() => {
      try { 
        if (fitRef.current && termRef.current) {
          fitRef.current.fit()
          // Notify backend of resize
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const { cols, rows } = termRef.current
            const resizeMsg = JSON.stringify({ type: 'resize', cols, rows })
            wsRef.current.send(resizeMsg)
          }
        }
      } catch (e) {
        console.warn('Open fit failed:', e)
      }
    }, 300)
    
    const timeout2 = addTimeout(() => {
      try { 
        if (fitRef.current && termRef.current) {
          fitRef.current.fit()
          scrollToBottom()
        }
      } catch (e) {
        console.warn('Secondary open fit failed:', e)
      }
    }, 450)
    
    return () => {
      clearTimeout(timeout1)
      clearTimeout(timeout2)
    }
  }, [open, reconnectTick, addTimeout, scrollToBottom])

  return (
    <div 
      ref={containerRef} 
      className="xterm-container rounded-sm" 
      style={{ 
        width: '100%', 
        height: '100%', 
        minHeight: '250px',
        padding: '8px',
        boxSizing: 'border-box',
        overflow: 'hidden' // Prevent container scrollbars, let xterm handle scrolling
      }} 
    />
  )
}

export default XTermShell