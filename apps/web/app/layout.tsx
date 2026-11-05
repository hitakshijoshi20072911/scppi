import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/components/auth-provider'
import { LenisProvider } from '@/components/lenis-provider'

export const metadata: Metadata = {
  title: 'VendorProof — Verified work. Traceable invoices.',
  description: 'Reconcile engineering evidence with approved billing records.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <LenisProvider>
          <AuthProvider>{children}</AuthProvider>
        </LenisProvider>
      </body>
    </html>
  )
}
