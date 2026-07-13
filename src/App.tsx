import { useState } from 'react'
import { AppLayout } from './components/layout/AppLayout'
import { DashboardPage } from './pages/Dashboard'
import { PerformanceTTFTPage } from './pages/PerformanceTTFT'
import { CompatibilityPage } from './pages/Compatibility'
import { EngineeringPage } from './pages/Engineering'
import { PerformanceOTPSPage } from './pages/PerformanceOTPS'
import { AccuracyPage } from './pages/Accuracy'
import { AboutPage } from './pages/About'
import type { SuiteId } from './types'

function renderPage(active: SuiteId) {
  switch (active) {
    case 'dashboard':
      return <DashboardPage />
    case 'performance':
      return <PerformanceTTFTPage />
    case 'engineering':
      return <EngineeringPage />
    case 'compatibility':
      return <CompatibilityPage />
    case 'otps':
      return <PerformanceOTPSPage />
    case 'accuracy':
      return <AccuracyPage />
    case 'about':
      return <AboutPage />
    default:
      return <DashboardPage />
  }
}

export default function App() {
  const [active, setActive] = useState<SuiteId>('dashboard')
  return (
    <AppLayout active={active} onNavigate={setActive}>
      {renderPage(active)}
    </AppLayout>
  )
}
