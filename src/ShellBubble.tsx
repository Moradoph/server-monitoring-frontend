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
  const [position, setPosition] = useState<Position>({ x: 24, y: 24 }) // Default: bottom-6 right-6
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 })
  
  const bubbleRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const toggleShell = () => {
    if (!isOpen) {
      setIsOpen(true)
      setShowShell(true)
    } else {
      setIsOpen(false)
      setShowShell(false)
    }
  }

  const handleReconnect = () => {
    // Force remount of XTermShell to trigger reconnection
    setShowShell(false)
    setTimeout(() => setShowShell(true), 100)
  }

  const handleClose = () => {
    setIsOpen(false)
    setShowShell(false)
  }

  const constrainPosition = useCallback((pos: Position): Position => {
    if (!containerRef.current) return pos

    const container = containerRef.current.getBoundingClientRect()
    const bubbleSize = 56 // 14 * 4 (h-14 w-14)
    const popupWidth = 600
    const popupHeight = 400

    const maxX = container.width - bubbleSize - 24 // 24px margin
    const maxY = container.height - bubbleSize - 24
    
    let constrainedX = Math.max(24, Math.min(pos.x, maxX))
    let constrainedY = Math.max(24, Math.min(pos.y, maxY))

    // If popup is open, ensure it doesn't go off-screen
    if (isOpen) {
      // Adjust for popup positioning
      const popupRight = constrainedX + popupWidth
      const popupBottom = constrainedY + popupHeight + 80 // bubble height + gap

      if (popupRight > container.width - 24) {
        constrainedX = container.width - popupWidth - 24
      }
      
      if (popupBottom > container.height - 24) {
        constrainedY = container.height - popupHeight - 80 - 24
      }
    }

    return { x: constrainedX, y: constrainedY }
  }, [isOpen])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!bubbleRef.current) return
    
    e.preventDefault()
    e.stopPropagation()
    
    setIsDragging(true)
    
    const rect = bubbleRef.current.getBoundingClientRect()
    const containerRect = containerRef.current?.getBoundingClientRect()
    
    if (containerRect) {
      const offsetX = e.clientX - rect.left
      const offsetY = e.clientY - rect.top
      setDragOffset({ x: offsetX, y: offsetY })
    }
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return
    
    e.preventDefault()
    
    const containerRect = containerRef.current.getBoundingClientRect()
    const newX = e.clientX - containerRect.left - dragOffset.x
    const newY = e.clientY - containerRect.top - dragOffset.y
    
    const constrainedPos = constrainPosition({ x: newX, y: newY })
    setPosition(constrainedPos)
  }, [isDragging, dragOffset, constrainPosition])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Setup drag event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Get the main content container on mount
  useEffect(() => {
    const mainElement = document.querySelector('main')
    if (mainElement && containerRef.current !== mainElement) {
      (containerRef as React.MutableRefObject<HTMLElement | null>).current = mainElement
    }
  }, [])

  // Recalculate position when popup opens/closes
  useEffect(() => {
    const constrainedPos = constrainPosition(position)
    if (constrainedPos.x !== position.x || constrainedPos.y !== position.y) {
      setPosition(constrainedPos)
    }
  }, [isOpen, position, constrainPosition])

  return (
    <>
      {/* Floating Shell Button */}
      <div
        ref={bubbleRef}
        className={cn(
          "fixed z-50 transition-all duration-200 ease-in-out",
          isDragging ? "scale-110 cursor-grabbing" : "cursor-grab hover:scale-105"
        )}
        style={{
          right: `${position.x}px`,
          bottom: `${position.y}px`,
        }}
        onMouseDown={handleMouseDown}
      >
        <Button
          onClick={toggleShell}
          size="icon"
          className={cn(
            "h-14 w-14 rounded-full shadow-lg transition-all duration-300",
            "bg-primary hover:bg-primary/90 text-primary-foreground",
            "border border-border/20 backdrop-blur-sm",
            isDragging && "shadow-2xl ring-2 ring-primary/50"
          )}
          aria-label="Toggle remote shell"
        >
          {isDragging ? <Move className="h-6 w-6" /> : <Terminal className="h-6 w-6" />}
        </Button>
      </div>

      {/* Shell Popup */}
      {isOpen && (
        <div 
          ref={popupRef}
          className="fixed z-40 transition-all duration-300 ease-in-out"
          style={{
            right: `${position.x}px`,
            bottom: `${position.y + 80}px`, // 80px = bubble height + gap
            transform: isOpen ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(10px)',
            opacity: isOpen ? 1 : 0,
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
                <span className="text-xs text-muted-foreground">
                  {isDragging ? "Dragging..." : "Drag the button to move"}
                </span>
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