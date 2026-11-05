'use client'

import { useEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)

export function LenisProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return
    const lenis = new Lenis({ autoRaf: false, anchors: true, syncTouch: true, lerp: 0.085 })
    const tick = (time: number) => lenis.raf(time * 1000)
    lenis.on('scroll', ScrollTrigger.update)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    return () => {
      gsap.ticker.remove(tick)
      lenis.off('scroll', ScrollTrigger.update)
      lenis.destroy()
    }
  }, [])
  return children
}
