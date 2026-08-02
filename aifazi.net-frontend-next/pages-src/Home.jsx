'use client'
import { useEffect, lazy, Suspense } from 'react'
import { useLocation } from '@/lib/router-compat'
import Hero from '../components/Hero'
import About from '../components/About'
import PageMeta from '../components/PageMeta'

// Below-fold sections: lazy-load so they don't block initial paint
const Experience     = lazy(() => import('../components/Experience'))
const Skills         = lazy(() => import('../components/Skills'))
const Services       = lazy(() => import('../components/Services'))

const Projects       = lazy(() => import('../components/Projects'))
const Newsletter     = lazy(() => import('../components/Newsletter'))
const Explore        = lazy(() => import('../components/Explore'))
const Contact        = lazy(() => import('../components/Contact'))

export default function Home() {
  const location = useLocation()

  useEffect(() => {
    if (!location.state?.scrollTo) {
      window.scrollTo(0, 0)
      return
    }
    const scrollTo = location.state.scrollTo
    let attempts = 0
    const tryScroll = () => {
      const el = document.getElementById(scrollTo)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (attempts < 10) {
        attempts++
        setTimeout(tryScroll, 150)
      }
    }
    setTimeout(tryScroll, 100)
  }, [location.state])

  return (
    <main>
      <PageMeta url="/" />
      <Hero />
      <About />
      <Suspense fallback={null}>
        <Experience />
        <Skills />
        <Services />

        <Projects />
        <Newsletter />
        <Explore />
        <Contact />
      </Suspense>
    </main>
  )
}
