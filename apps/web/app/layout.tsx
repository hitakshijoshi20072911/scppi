import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VendorProof — Verified work. Traceable invoices.',
  description: 'Reconcile engineering evidence with approved billing records.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
