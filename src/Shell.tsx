import React, { useEffect, useRef, useState } from 'react'

export default function Shell({ wsUrl, token }: { wsUrl?: string; token?: string }) {
  const [connected, setConnected] = useState(false)
  const [output, setOutput] = useState('')
  const [input, setInput] = useState('')
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const url = wsUrl || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8000/ws/shell`
    const urlWithToken = token ? `${url}?token=${encodeURIComponent(token)}` : url
    const ws = new WebSocket(urlWithToken)
    wsRef.current = ws
    ws.onopen = () => setConnected(true)
    ws.onmessage = (ev) => setOutput(o => o + ev.data)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)
    return () => {
      try { ws.close() } catch (e) { }
    }
  }, [wsUrl, token])

  const send = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    // we send raw input bytes; append newline if desired
    wsRef.current.send(input + '\n')
    setInput('')
  }

  return (
    <div className="p-3 border rounded bg-black text-white font-mono text-sm">
      <div className="mb-2 text-xs">Shell: {connected ? 'connected' : 'disconnected'}</div>
      <div className="h-48 overflow-auto mb-2 whitespace-pre-wrap" style={{ whiteSpace: 'pre-wrap' }}>{output || 'No output yet'}</div>
      <div className="flex gap-2">
        <input className="flex-1 p-2 bg-gray-900 text-white border rounded" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { send() } }} />
        <button className="px-3 py-2 bg-green-600 rounded" onClick={send}>Send</button>
      </div>
    </div>
  )
}
