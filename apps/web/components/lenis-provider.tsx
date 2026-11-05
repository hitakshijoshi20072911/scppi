'use client'

import { useEffect } from 'react'
import Lenis from 'lenis'

export function LenisProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return
    const lenis = new Lenis({ autoRaf: false, anchors: true, syncTouch: true, lerp: 0.1 })
    let frame = 0
    const raf = (time: number) => {
      lenis.raf(time)
      frame = requestAnimationFrame(raf)
    }
    frame = requestAnimationFrame(raf)
    return () => {
      cancelAnimationFrame(frame)
      lenis.destroy()
    }
  }, [])
  return children
}
