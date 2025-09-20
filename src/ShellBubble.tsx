import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from './components/ui/button'
import { Card, CardContent } from './components/ui/card'
import { Separator } from './components/ui/separator'
import { Terminal, X, RotateCcw, Move } from 'lucide-react'
import { cn } from './lib/utils'
import XTermShell from './XTermShell'

interface ShellBubbleProps {
  token: string
}

interface Position {
  x: number
  y: number
}

const ShellBubble: React.FC<ShellBubbleProps> = ({ token }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [showShell, setShowShell] = useState(false)
  const [position, setPosition] = useState<Position>({ x: window.innerWidth - 80, y: window.innerHeight - 80 }) // Start bottom-right
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 })
  const [initialPosition, setInitialPosition] = useState<Position>({ x: 0, y: 0 })
  
  const bubbleRef = useRef<HTMLDivElement>(null)

  const toggleShell = useCallback((e: React.MouseEvent) => {
    if (isDragging) return // Don't toggle if we just finished dragging
    
    if (!isOpen) {
      setIsOpen(true)
      setShowShell(true)
    } else {
      setIsOpen(false)
      setShowShell(false)
    }
  }, [isDragging, isOpen])

  const handleReconnect = useCallback(() => {
    setShowShell(false)
    setTimeout(() => setShowShell(true), 100)
  }, [])

  const handleClose = useCallback(() => {
    setIsOpen(false)
    setShowShell(false)
  }, [])

  const constrainPosition = useCallback((pos: Position): Position => {
    const bubbleSize = 56 // h-14 w-14 = 56px
    const margin = 16
    
    const maxX = window.innerWidth - bubbleSize - margin
    const maxY = window.innerHeight - bubbleSize - margin
    
    return {
      x: Math.max(margin, Math.min(pos.x, maxX)),
      y: Math.max(margin, Math.min(pos.y, maxY))
    }
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    setInitialPosition(position)
    
    // Prevent the button click from firing
    document.body.style.userSelect = 'none'
  }, [position])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return
    
    e.preventDefault()
    
    const deltaX = e.clientX - dragStart.x
    const deltaY = e.clientY - dragStart.y
    
    const newPosition = {
      x: initialPosition.x + deltaX,
      y: initialPosition.y + deltaY
    }
    
    setPosition(constrainPosition(newPosition))
  }, [isDragging, dragStart, initialPosition, constrainPosition])

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (!isDragging) return
    
    setIsDragging(false)
    document.body.style.userSelect = ''
    
    // Small delay to prevent click event from firing after drag
    setTimeout(() => {
      // This allows the click handler to work normally again
    }, 100)
  }, [isDragging])

  // Setup global mouse events
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove, { passive: false })
      document.addEventListener('mouseup', handleMouseUp, { passive: false })
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => constrainPosition(prev))
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [constrainPosition])

  // Calculate popup position
  const getPopupPosition = useCallback(() => {
    const popupWidth = 600
    const popupHeight = 400
    const bubbleSize = 56
    const gap = 16
    
    let popupX = position.x
    let popupY = position.y - popupHeight - gap
    
    // Adjust if popup would go off screen
    if (popupX + popupWidth > window.innerWidth - 16) {
      popupX = window.innerWidth - popupWidth - 16
    }
    if (popupX < 16) {
      popupX = 16
    }
    
    if (popupY < 16) {
      popupY = position.y + bubbleSize + gap
    }
    
    return { x: popupX, y: popupY }
  }, [position])

  const popupPosition = getPopupPosition()

  return (
    <>
      {/* Floating Shell Button */}
      <div
        ref={bubbleRef}
        className={cn(
          "fixed z-50 select-none",
          isDragging ? "cursor-grabbing" : "cursor-grab"
        )}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          transition: isDragging ? 'none' : 'all 0.2s ease-out',
          transform: isDragging ? 'scale(1.05)' : 'scale(1)',
        }}
        onMouseDown={handleMouseDown}
      >
        <Button
          onClick={toggleShell}
          size="icon"
          className={cn(
            "h-14 w-14 rounded-full shadow-lg transition-all duration-200",
            "bg-primary hover:bg-primary/90 text-primary-foreground",
            "border border-border/20 backdrop-blur-sm",
            isDragging && "shadow-2xl ring-2 ring-primary/50 scale-105"
          )}
          aria-label="Toggle remote shell"
        >
          {isDragging ? <Move className="h-6 w-6" /> : <Terminal className="h-6 w-6" />}
        </Button>
      </div>

      {/* Shell Popup */}
      {isOpen && (
        <div 
          className="fixed z-40"
          style={{
            left: `${popupPosition.x}px`,
            top: `${popupPosition.y}px`,
            transition: 'all 0.3s ease-out',
          }}
        >
          <Card className={cn(
            "w-[600px] h-[400px] shadow-2xl border border-border/40",
            "backdrop-blur-md bg-background/95 transition-all duration-300",
            "animate-in slide-in-from-bottom-2 fade-in-0"
          )}>
            <div className="flex items-center justify-between p-3 border-b border-border/40">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Remote Shell</span>
                {isDragging && (
                  <span className="text-xs text-muted-foreground animate-pulse">
                    Dragging...
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReconnect}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  title="Reconnect"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
                
                <Separator orientation="vertical" className="h-4 mx-1" />
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  title="Close"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
            
            <CardContent className="p-0 h-[calc(100%-49px)]">
              <div className="h-full w-full">
                {showShell && (
                  <XTermShell 
                    token={token}
                    open={isOpen}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}

export default ShellBubble