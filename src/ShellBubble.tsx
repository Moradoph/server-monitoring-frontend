import React, { useState } from 'react'
import XTermShell from './XTermShell'

export default function ShellBubble({ token }: { token?: string }) {
  const [open, setOpen] = useState(false)
  const [reconnectTick, setReconnectTick] = useState(0)

  return (
    <>
      {/* Bubble button */}
      <div className="fixed bottom-6 right-6 z-50">
        <button onClick={() => setOpen(v => !v)} aria-label="Remote shell" className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform duration-200 ${open ? 'scale-95' : 'hover:scale-105'} bg-gradient-to-br from-blue-500 to-indigo-600 text-white`}>🔌</button>
      </div>

      {/* Popup card */}
      <div className={`fixed bottom-24 right-6 z-40 pointer-events-none`}>
        <div className={`${open ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          <div className={`shell-popup-card bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-lg shadow-lg transform transition-all duration-300 origin-bottom-right ${open ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 translate-y-4 scale-95'}`} style={{ width: '740px' }}>
            <div className="flex items-center justify-between p-3 border-b dark:border-gray-800">
              <div className="text-sm font-medium">Remote Shell</div>
              <div className="flex items-center gap-2">
                <button title="Reconnect" className="text-xs text-gray-500 px-2" onClick={() => setReconnectTick(t => t + 1)}>⟳</button>
                <button className="text-xs text-gray-500" onClick={() => { setOpen(false) }}>Close</button>
              </div>
            </div>
            <div className={`p-2`}>
              <XTermShell token={token} open={open} reconnectTick={reconnectTick} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
