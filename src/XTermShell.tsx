import React, { useEffect, useRef } from 'react'
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

  useEffect(() => {
    // initialize only when container is available
    const init = () => {
      if (!containerRef.current) return false
      try {
        const term = new Terminal({ cursorBlink: true, convertEol: true })
        const fit = new FitAddon()
        term.loadAddon(fit)
        term.open(containerRef.current)
        // fit after a tick to allow layout to settle
        requestAnimationFrame(() => {
          try { fit.fit() } catch (e) { /* ignore fit errors */ }
        })
        termRef.current = term
        fitRef.current = fit
        return true
      } catch (err) {
        // If xterm fails to initialize, log and bail
        // (prevents React from crashing with internal xterm errors)
        // eslint-disable-next-line no-console
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
            try { fitRef.current?.fit() } catch (e) { }
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
      try { ws.close() } catch (e) {}
      try { termRef.current?.dispose() } catch (e) {}
      window.removeEventListener('resize', onResize)
      if ((window as any).__xterm_init_raf) cancelAnimationFrame((window as any).__xterm_init_raf)
      try { resizeObsRef.current?.disconnect() } catch (e) { }
    }
  }, [wsUrl, token])

  // re-fit when `open`, `fullscreen` toggles or reconnect requested
  useEffect(() => {
    // wait for popup animation (~300ms) then fit
    const id = setTimeout(() => {
      try { fitRef.current?.fit() } catch (e) { }
    }, 350)
    return () => clearTimeout(id)
  }, [open, reconnectTick])

  return (
    <div 
      ref={containerRef} 
      className="xterm-container bg-gray-900 rounded-sm" 
      style={{ width: '100%', height: '100%', minHeight: '200px' }} 
    />
  )
}

export default XTermShell
