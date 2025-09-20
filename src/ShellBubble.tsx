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
  const [isOpening, setIsOpening] = useState(false)
  const [position, setPosition] = useState<Position>({ x: window.innerWidth - 80, y: window.innerHeight - 80 }) // Start bottom-right
  const [isDragging, setIsDragging] = useState(false)
  const [hasDragged, setHasDragged] = useState(false)
  
  const bubbleRef = useRef<HTMLDivElement>(null)
  const openTimeoutRef = useRef<number | null>(null)
  const terminalOpenedRef = useRef(false)
  const dragThreshold = 5 // pixels to start drag

  const toggleShell = useCallback((e: React.MouseEvent) => {
    if (hasDragged) return // Don't toggle if we just finished dragging
    
    if (!isOpen) {
      // Start opening with swoosh animation
      setIsOpen(true)
      setShowShell(true)
      setIsOpening(true)
      // Reset terminal opened flag and start 5s timeout
      terminalOpenedRef.current = false
      if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current)
      openTimeoutRef.current = window.setTimeout(() => {
        // If terminal hasn't opened, move bubble to bottom-right
        if (!terminalOpenedRef.current) {
          setPosition({ x: window.innerWidth - 80, y: window.innerHeight - 80 })
        }
      }, 5000)
      // Clear opening after animation time
      setTimeout(() => setIsOpening(false), 360)
    } else {
      setIsOpen(false)
      setShowShell(false)
    }
  }, [hasDragged, isOpen])

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
    
    const startX = e.clientX
    const startY = e.clientY
    let hasDraggedLocal = false
    let isDraggingLocal = false
    
    const rect = bubbleRef.current?.getBoundingClientRect()
    if (!rect) return
    
    const handleTempMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX
      const deltaY = e.clientY - startY
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
      
      // Start dragging only after threshold
      if (!isDraggingLocal && distance > dragThreshold) {
        isDraggingLocal = true
        hasDraggedLocal = true
        setIsDragging(true)
        setHasDragged(true)
        document.body.style.userSelect = 'none'
      }
      
      if (isDraggingLocal) {
        e.preventDefault()
        
        const newPosition = {
          x: position.x + deltaX,
          y: position.y + deltaY
        }
        
        setPosition(constrainPosition(newPosition))
      }
    }
    
    const handleTempMouseUp = () => {
      setIsDragging(false)
      document.body.style.userSelect = ''
      
      // Reset drag flag after a delay to prevent accidental clicks
      if (hasDraggedLocal) {
        setTimeout(() => {
          setHasDragged(false)
        }, 150)
      }
      
      // Remove temporary listeners immediately
      document.removeEventListener('mousemove', handleTempMouseMove)
      document.removeEventListener('mouseup', handleTempMouseUp)
    }
    
    // Add temporary listeners
    document.addEventListener('mousemove', handleTempMouseMove, { passive: false })
    document.addEventListener('mouseup', handleTempMouseUp, { passive: false })
  }, [position, constrainPosition, dragThreshold])

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => constrainPosition(prev))
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [constrainPosition])

  // Cleanup open timeout when component unmounts or when shell is closed
  useEffect(() => {
    return () => {
      if (openTimeoutRef.current) {
        clearTimeout(openTimeoutRef.current)
        openTimeoutRef.current = null
      }
    }
  }, [])

  // Calculate popup position
  const getPopupPosition = useCallback(() => {
    const popupWidth = 700  // Increased from 600px
    const popupHeight = 450 // Increased from 400px
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

  // Compute opening transform so the popup appears to originate from the bubble
  const getOpeningTransform = useCallback(() => {
    try {
      const bubbleRect = bubbleRef.current?.getBoundingClientRect()
      if (!bubbleRect) return 'translateY(14px) scale(0.98)'

      const popupX = popupPosition.x
      const popupY = popupPosition.y

      // center points
      const bubbleCenterX = bubbleRect.left + bubbleRect.width / 2
      const bubbleCenterY = bubbleRect.top + bubbleRect.height / 2

      const offsetX = bubbleCenterX - (popupX + 350) // popup half-width approx
      const offsetY = bubbleCenterY - (popupY + 24) // small vertical offset

      return `translate(${offsetX}px, ${offsetY}px) scale(0.9)`
    } catch (e) {
      return 'translateY(14px) scale(0.98)'
    }
  }, [popupPosition])

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
          transition: isDragging ? 'none' : 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: isDragging ? 'scale(1.02) translateZ(0)' : 'scale(1) translateZ(0)',
          willChange: isDragging ? 'transform, left, top' : 'auto',
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
          className={cn('fixed z-40', isOpening && 'swoosh-opening')}
          style={{
            // Use transform-only movement when dragging to avoid layout reflow
            left: `${popupPosition.x}px`,
            top: `${popupPosition.y}px`,
            transition: isDragging ? 'none' : 'opacity 220ms ease-out, transform 220ms ease-out',
            willChange: isDragging ? 'transform' : 'auto',
            transform: isOpening ? getOpeningTransform() : undefined
          }}
        >
          <Card className={cn(
            "w-[700px] h-[450px] shadow-2xl border border-border/40",
            // Avoid triggering reflow on child layout; only animate opacity/transform
            "backdrop-blur-md bg-background/95 transition-opacity duration-300",
            "animate-in slide-in-from-bottom-2 fade-in-0",
            // hint to browser to optimize rendering of this element
            isDragging ? 'will-change-transform' : ''
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
              
              <div className="flex items-center gap-1 ">
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
              <div className="h-full w-full ">
                {showShell && (
                  <XTermShell 
                    token={token}
                    open={isOpen}
                    onOpen={() => {
                      terminalOpenedRef.current = true
                      if (openTimeoutRef.current) { clearTimeout(openTimeoutRef.current); openTimeoutRef.current = null }
                    }}
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