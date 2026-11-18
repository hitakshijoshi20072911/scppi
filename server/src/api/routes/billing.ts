import type { FastifyInstance, FastifyReply } from 'fastify'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { exec as runtimeExec } from '@swytchcode/runtime'
import { authenticate, withDbContext } from '../../modules/core.js'

const invoiceIdParam = z.object({ invoiceId: z.string().uuid() }).strict()

function fail(reply: FastifyReply, statusCode: number, code: string, message: string): never {
  return reply.status(statusCode).send({ statusCode, code, error: 'Error', message }) as never
}
function ok(reply: FastifyReply, data: unknown, status = 200) {
  return reply.status(status).send({ data })
}
function unwrap(value: unknown): Record<string, unknown> {
  const obj = value as Record<string, unknown> | null
  const data = obj && typeof obj === 'object' ? (obj.data as Record<string, unknown>) : undefined
  return (data && typeof data === 'object' ? data : obj) as Record<string, unknown>
}

async function clientInvoiceForUser(invoiceId: string, userId: string) {
  const memberships = await withDbContext(
    { userId },
    (tx) =>
      tx`select workspace_id, client_id, role from client_membership where user_id = ${userId} and status = 'active'`,
  )
  for (const m of memberships) {
    const rows = await withDbContext(
      { userId, workspaceId: m.workspace_id },
      (tx) =>
        tx`select * from client_invoice where workspace_id = ${m.workspace_id} and client_id = ${m.client_id} and id = ${invoiceId}`,
    )
    if (rows.length) return { invoice: rows[0], membership: m }
  }
  return undefined
}

export function registerBillingRoutes(app: FastifyInstance) {
  // Client starts a Stripe-hosted test checkout for an issued invoice.
  app.post('/api/v1/portal/invoices/:invoiceId/checkout', async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth) return fail(reply, 401, 'UNAUTHENTICATED', 'Authentication required')
    const { invoiceId } = invoiceIdParam.parse(request.params)
    const found = await clientInvoiceForUser(invoiceId, auth.userId)
    if (!found) return fail(reply, 404, 'NOT_FOUND', 'Invoice not found')
    const { invoice, membership } = found
    if (invoice.status === 'paid')
      return fail(reply, 409, 'ALREADY_PAID', 'Invoice is already paid')
    if (!['issued', 'open', 'overdue'].includes(String(invoice.status)))
      return fail(reply, 409, 'INVALID_STATE', 'Invoice cannot be paid in its current state')

    const user = await withDbContext(
      { userId: auth.userId },
      (tx) => tx`select email from app_user where id = ${auth.userId}`,
    )
    const lines = Array.isArray((invoice.snapshot as Record<string, unknown>)?.lines)
      ? ((invoice.snapshot as Record<string, unknown>).lines as Record<string, unknown>[])
      : []
    const totalMinor = Number(invoice.total_minor)
    const currency = String(invoice.currency).toLowerCase()
    const description = `VendorProof invoice ${invoice.invoice_number}`
    const lineItemsList =
      lines.length > 0
        ? lines.slice(0, 100).map((line) => ({
            quantity: 1,
            price_data: {
              currency,
              unit_amount: Number(line.amount_minor ?? line.amountMinor ?? 0),
              product_data: { name: String(line.description ?? 'Invoice line') },
            },
          }))
        : [
            {
              quantity: 1,
              price_data: {
                currency,
                unit_amount: totalMinor,
                product_data: { name: description },
              },
            },
          ]
    const lineItems = Object.fromEntries(lineItemsList.map((item, index) => [String(index), item]))

    let session: Record<string, unknown>
    try {
      const result = await runtimeExec(
        'stripe.session.create1',
        {
          body: {
            mode: 'payment',
            line_items: lineItems,
            success_url: `${process.env.PUBLIC_APP_URL ?? 'http://localhost:3001'}/portal?paid=1`,
            cancel_url: `${process.env.PUBLIC_APP_URL ?? 'http://localhost:3001'}/portal`,
            customer_email: user[0]?.email,
            metadata: {
              vendorproof_invoice_id: String(invoice.id),
              vendorproof_workspace_id: String(membership.workspace_id),
              vendorproof_client_id: String(membership.client_id),
              test_mode: 'true',
            },
          },
        },
        { tenantId: String(membership.workspace_id), timeoutMs: 60000 },
      )
      session = unwrap(result)
    } catch {
      return fail(reply, 502, 'CHECKOUT_FAILED', 'Stripe checkout session could not be created')
    }
    const sessionId = typeof session.id === 'string' ? session.id : undefined
    const url = typeof session.url === 'string' ? session.url : undefined
    if (!sessionId || !url)
      return fail(reply, 502, 'CHECKOUT_FAILED', 'Stripe returned an invalid checkout session')

    await withDbContext(
      { userId: auth.userId, workspaceId: String(membership.workspace_id) },
      async (tx) => {
        await tx`update client_invoice set stripe_checkout_session_id = ${sessionId}, updated_at = now() where id = ${invoiceId}`
        await tx`insert into client_invoice_event (workspace_id, client_id, client_invoice_id, event_type, actor_user_id, party, detail) values (${membership.workspace_id}, ${membership.client_id}, ${invoiceId}, 'checkout_created', ${auth.userId}, 'client', ${JSON.stringify({ sessionId, url })})`
      },
    )
    return ok(reply, { url, sessionId })
  })

  // Client verifies payment via a real Stripe session read; never trusts the browser.
  app.post('/api/v1/portal/invoices/:invoiceId/verify-payment', async (request, reply) => {
    const auth = await authenticate(request)
    if (!auth) return fail(reply, 401, 'UNAUTHENTICATED', 'Authentication required')
    const { invoiceId } = invoiceIdParam.parse(request.params)
    const found = await clientInvoiceForUser(invoiceId, auth.userId)
    if (!found) return fail(reply, 404, 'NOT_FOUND', 'Invoice not found')
    const { invoice, membership } = found
    const sessionId = invoice.stripe_checkout_session_id as string | null
    if (!sessionId)
      return fail(reply, 409, 'NO_CHECKOUT', 'No checkout session exists for this invoice')
    if (invoice.status === 'paid') return ok(reply, { status: 'paid' })

    let session: Record<string, unknown>
    try {
      const result = await runtimeExec(
        'stripe.session.get',
        { params: { session: sessionId } },
        { tenantId: String(membership.workspace_id), timeoutMs: 60000 },
      )
      session = unwrap(result)
    } catch {
      return fail(reply, 502, 'VERIFY_FAILED', 'Stripe session could not be verified')
    }
    const paymentStatus = session.payment_status
    const status = session.status
    if (paymentStatus !== 'paid' && status !== 'complete') {
      return ok(reply, { status: 'unpaid', paymentStatus, checkoutStatus: status })
    }

    const paidAt = new Date()
    await withDbContext(
      { userId: auth.userId, workspaceId: String(membership.workspace_id) },
      async (tx) => {
        await tx`update client_invoice set status = 'paid', paid_at = ${paidAt}, stripe_invoice_id = coalesce(stripe_invoice_id, ${typeof session.invoice === 'string' ? session.invoice : null}), updated_at = now() where id = ${invoiceId} and status <> 'paid'`
        await tx`insert into client_invoice_event (workspace_id, client_id, client_invoice_id, event_type, actor_user_id, party, detail) values (${membership.workspace_id}, ${membership.client_id}, ${invoiceId}, 'paid', ${auth.userId}, 'system', ${JSON.stringify({ sessionId, paymentStatus })})`
      },
    )
    return ok(reply, { status: 'paid', paidAt })
  })
}
