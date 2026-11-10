import { createHash } from 'node:crypto'
import { exec as runtimeExec } from '@swytchcode/runtime'

export const CALENDAR_REMINDER_METHODS = [
  'calendar.me.calendarList.list',
  'calendar.calendar.create',
  'calendar.event.get',
  'calendar.event.create',
  'calendar.event.update1',
  'calendar.event.delete',
] as const

type CalendarMethod = (typeof CALENDAR_REMINDER_METHODS)[number]
type CalendarArgs = {
  body?: Record<string, unknown>
  params?: Record<string, string | number | boolean | string[]>
}
export type CalendarRuntimeExec = (
  canonicalId: CalendarMethod,
  args: CalendarArgs,
  options: { tenantId: string },
) => Promise<unknown>

export type AuthorizedCalendar = {
  id: string
  summary: string
  primary: boolean
  accessRole?: string
  description?: string
}
export type ReminderInput = {
  tenantId: string
  workspaceId: string
  calendarId: string
  milestoneId: string
  reminderHash: string
  summary: string
  description: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
}
export type ReminderResult = { calendarId: string; eventId: string; recovered: boolean }
export type CalendarAdapterErrorCode =
  'invalid_input' | 'provider_failure' | 'calendar_unknown' | 'event_unknown' | 'event_mismatch'
export class CalendarAdapterError extends Error {
  constructor(
    readonly code: CalendarAdapterErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'CalendarAdapterError'
  }
}

const managedSummary = 'VendorProof Reminders'
const markerPrefix = 'VendorProof managed calendar for workspace '
const safeFailure = () =>
  new CalendarAdapterError('provider_failure', 'Google Calendar operation failed')
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
function unwrap(value: unknown): Record<string, unknown> | undefined {
  const object = asRecord(value)
  if (!object) return undefined
  return asRecord(object.data) ?? object
}
function rows(value: unknown, key: string): Record<string, unknown>[] {
  const result = unwrap(value)?.[key]
  return Array.isArray(result)
    ? result.map(asRecord).filter((row): row is Record<string, unknown> => !!row)
    : []
}
function calendar(value: unknown): AuthorizedCalendar | undefined {
  const object = asRecord(value)
  if (!object || !text(object.id) || !text(object.summary)) return undefined
  return {
    id: object.id,
    summary: object.summary,
    primary: object.primary === true,
    ...(typeof object.accessRole === 'string' ? { accessRole: object.accessRole } : {}),
    ...(typeof object.description === 'string' ? { description: object.description } : {}),
  }
}
const workspacePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const eventPattern = /^vp[0-9a-f]{64}$/
const deterministicEventId = (workspaceId: string, milestoneId: string) =>
  `vp${createHash('sha256').update(`${workspaceId}\0${milestoneId}`).digest('hex')}`
const calendarDescription = (workspaceId: string) => `${markerPrefix}${workspaceId}`

function validateTenant(tenantId: string, workspaceId: string) {
  if (!text(tenantId) || tenantId.trim() !== tenantId || !workspacePattern.test(workspaceId)) {
    throw new CalendarAdapterError('invalid_input', 'Invalid authenticated Calendar tenant')
  }
}
function validateReminder(input: ReminderInput) {
  validateTenant(input.tenantId, input.workspaceId)
  if (
    !text(input.calendarId) ||
    !workspacePattern.test(input.milestoneId) ||
    !/^[a-f0-9]{64}$/i.test(input.reminderHash) ||
    !text(input.summary) ||
    input.summary.length > 1024 ||
    typeof input.description !== 'string' ||
    input.description.length > 7000 ||
    !text(input.start?.dateTime) ||
    !text(input.start?.timeZone) ||
    !text(input.end?.dateTime) ||
    !text(input.end?.timeZone) ||
    !Number.isFinite(Date.parse(input.start.dateTime)) ||
    !Number.isFinite(Date.parse(input.end.dateTime)) ||
    Date.parse(input.end.dateTime) <= Date.parse(input.start.dateTime)
  ) {
    throw new CalendarAdapterError('invalid_input', 'Invalid VendorProof reminder input')
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: input.start.timeZone })
    new Intl.DateTimeFormat('en-US', { timeZone: input.end.timeZone })
  } catch {
    throw new CalendarAdapterError('invalid_input', 'Invalid reminder time zone')
  }
}
function plainText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
function markerProperties(workspaceId: string, milestoneId: string, reminderHash: string) {
  return {
    extendedProperties: {
      private: {
        vendorproofWorkspaceId: workspaceId,
        vendorproofMilestoneId: milestoneId,
        vendorproofReminderHash: reminderHash,
      },
    },
  }
}
function eventProperties(value: unknown): Record<string, unknown> | undefined {
  const object = unwrap(value)
  return asRecord(asRecord(object?.extendedProperties)?.private)
}
function eventOwned(
  value: unknown,
  input: Pick<ReminderInput, 'workspaceId' | 'milestoneId'>,
  eventId: string,
): boolean {
  const object = unwrap(value)
  const privateProperties = eventProperties(value)
  return (
    !!object &&
    object.id === eventId &&
    privateProperties?.vendorproofWorkspaceId === input.workspaceId &&
    privateProperties?.vendorproofMilestoneId === input.milestoneId
  )
}
function eventMatchesInput(value: unknown, input: ReminderInput, eventId: string): boolean {
  const object = unwrap(value)
  const privateProperties = eventProperties(value)
  return (
    eventOwned(value, input, eventId) &&
    privateProperties?.vendorproofReminderHash === input.reminderHash &&
    object?.summary === plainText(input.summary) &&
    object?.description === plainText(input.description)
  )
}

export function createCalendarReminderAdapter(
  exec: CalendarRuntimeExec = runtimeExec as CalendarRuntimeExec,
) {
  const call = async (
    method: CalendarMethod,
    args: CalendarArgs,
    tenantId: string,
  ): Promise<unknown> => {
    try {
      return await exec(method, args, { tenantId })
    } catch {
      throw safeFailure()
    }
  }

  async function listCalendars(tenantId: string): Promise<AuthorizedCalendar[]> {
    const result: AuthorizedCalendar[] = []
    let pageToken: string | undefined
    for (let page = 0; page < 5; page += 1) {
      const params: CalendarArgs['params'] = { maxResults: 250 }
      if (pageToken) params.pageToken = pageToken
      const response = await call('calendar.me.calendarList.list', { params }, tenantId)
      result.push(
        ...rows(response, 'items')
          .map(calendar)
          .filter((row): row is AuthorizedCalendar => !!row),
      )
      const next = unwrap(response)?.nextPageToken
      if (!text(next)) return result
      pageToken = next
    }
    if (pageToken)
      throw new CalendarAdapterError(
        'provider_failure',
        'Calendar list is too large to verify safely',
      )
    return result
  }

  async function requireManagedCalendar(tenantId: string, workspaceId: string, calendarId: string) {
    const matching = (await listCalendars(tenantId)).filter(
      (item) =>
        item.id === calendarId &&
        item.summary === managedSummary &&
        item.description === calendarDescription(workspaceId),
    )
    if (matching.length !== 1) {
      throw new CalendarAdapterError(
        'calendar_unknown',
        'The VendorProof-managed calendar could not be verified',
      )
    }
  }

  async function findOwnedEvent(
    input: Pick<ReminderInput, 'tenantId' | 'workspaceId' | 'calendarId' | 'milestoneId'>,
  ): Promise<Record<string, unknown> | undefined> {
    const response = await call(
      'calendar.event.get',
      {
        params: {
          calendarId: input.calendarId,
          maxResults: 2,
          privateExtendedProperty: [
            `vendorproofWorkspaceId=${input.workspaceId}`,
            `vendorproofMilestoneId=${input.milestoneId}`,
          ],
        },
      },
      input.tenantId,
    )
    const matches = rows(response, 'items')
    if (matches.length > 1) {
      throw new CalendarAdapterError(
        'event_mismatch',
        'Multiple matching VendorProof reminders require review',
      )
    }
    if (matches.length === 0) return undefined
    const expectedId = deterministicEventId(input.workspaceId, input.milestoneId)
    const event = matches[0]
    if (!eventOwned(event, input, expectedId)) {
      throw new CalendarAdapterError(
        'event_mismatch',
        'Calendar event is not the matching VendorProof reminder',
      )
    }
    return event
  }

  function eventBody(input: ReminderInput, eventId: string) {
    return {
      id: eventId,
      summary: plainText(input.summary),
      description: plainText(input.description),
      start: input.start,
      end: input.end,
      ...markerProperties(input.workspaceId, input.milestoneId, input.reminderHash),
    }
  }

  async function updateExistingReminder(
    input: ReminderInput,
    eventId: string,
  ): Promise<ReminderResult> {
    try {
      const updated = await call(
        'calendar.event.update1',
        { params: { calendarId: input.calendarId, eventId }, body: eventBody(input, eventId) },
        input.tenantId,
      )
      if (eventMatchesInput(updated, input, eventId)) {
        return { calendarId: input.calendarId, eventId, recovered: false }
      }
    } catch {
      // Resolve only by an exact workspace/milestone marker and current content hash.
    }
    try {
      const after = await findOwnedEvent(input)
      if (after && eventMatchesInput(after, input, eventId)) {
        return { calendarId: input.calendarId, eventId, recovered: true }
      }
    } catch {
      // Fail closed; the caller must reconcile the unknown write.
    }
    throw new CalendarAdapterError(
      'event_unknown',
      'Reminder update outcome is unknown; reconcile before retrying',
    )
  }

  return {
    async listAuthorizedCalendars(tenantId: string): Promise<AuthorizedCalendar[]> {
      if (!text(tenantId) || tenantId.trim() !== tenantId) {
        throw new CalendarAdapterError('invalid_input', 'Invalid authenticated Calendar tenant')
      }
      return listCalendars(tenantId)
    },

    async ensureManagedCalendar(
      tenantId: string,
      workspaceId: string,
    ): Promise<{ id: string; summary: string }> {
      validateTenant(tenantId, workspaceId)
      const description = calendarDescription(workspaceId)
      const existing = (await listCalendars(tenantId)).filter(
        (item) => item.summary === managedSummary && item.description === description,
      )
      if (existing.length > 1) {
        throw new CalendarAdapterError(
          'calendar_unknown',
          'Multiple matching VendorProof calendars require review',
        )
      }
      if (existing.length === 1) return { id: existing[0].id, summary: managedSummary }

      try {
        const created = await call(
          'calendar.calendar.create',
          { body: { summary: managedSummary, description } },
          tenantId,
        )
        const object = unwrap(created)
        if (
          text(object?.id) &&
          object.summary === managedSummary &&
          object.description === description
        ) {
          return { id: object.id, summary: managedSummary }
        }
      } catch {
        // Creation may have succeeded even if the response was lost. Resolve only by the
        // exact workspace-specific marker; never blindly create a second calendar.
      }
      try {
        const after = (await listCalendars(tenantId)).filter(
          (item) => item.summary === managedSummary && item.description === description,
        )
        if (after.length === 1) return { id: after[0].id, summary: managedSummary }
      } catch {
        // Do not expose the provider response or guess whether a write completed.
      }
      throw new CalendarAdapterError(
        'calendar_unknown',
        'Calendar creation outcome is unknown; reconcile before retrying',
      )
    },

    async createReminder(input: ReminderInput): Promise<ReminderResult> {
      validateReminder(input)
      await requireManagedCalendar(input.tenantId, input.workspaceId, input.calendarId)
      const eventId = deterministicEventId(input.workspaceId, input.milestoneId)
      const existing = await findOwnedEvent(input)
      if (existing) {
        if (eventMatchesInput(existing, input, eventId)) {
          return { calendarId: input.calendarId, eventId, recovered: true }
        }
        return updateExistingReminder(input, eventId)
      }
      try {
        const created = await call(
          'calendar.event.create',
          {
            params: { calendarId: input.calendarId, sendUpdates: 'none' },
            body: eventBody(input, eventId),
          },
          input.tenantId,
        )
        if (eventMatchesInput(created, input, eventId)) {
          return { calendarId: input.calendarId, eventId, recovered: false }
        }
      } catch {
        // Resolve an uncertain result through an exact private-property query.
      }
      try {
        const after = await findOwnedEvent(input)
        if (after && eventMatchesInput(after, input, eventId)) {
          return { calendarId: input.calendarId, eventId, recovered: true }
        }
      } catch {
        // Fail closed; the caller must record the operation as unknown.
      }
      throw new CalendarAdapterError(
        'event_unknown',
        'Reminder creation outcome is unknown; reconcile before retrying',
      )
    },

    async updateReminder(input: ReminderInput): Promise<ReminderResult> {
      validateReminder(input)
      await requireManagedCalendar(input.tenantId, input.workspaceId, input.calendarId)
      const eventId = deterministicEventId(input.workspaceId, input.milestoneId)
      const existing = await findOwnedEvent(input)
      if (!existing)
        throw new CalendarAdapterError('event_unknown', 'VendorProof reminder was not found')
      if (eventMatchesInput(existing, input, eventId)) {
        return { calendarId: input.calendarId, eventId, recovered: true }
      }
      return updateExistingReminder(input, eventId)
    },

    async deleteReminder(
      input: Pick<ReminderInput, 'tenantId' | 'workspaceId' | 'calendarId' | 'milestoneId'>,
    ): Promise<void> {
      validateTenant(input.tenantId, input.workspaceId)
      if (!text(input.calendarId) || !workspacePattern.test(input.milestoneId)) {
        throw new CalendarAdapterError('invalid_input', 'Invalid VendorProof reminder identity')
      }
      await requireManagedCalendar(input.tenantId, input.workspaceId, input.calendarId)
      const eventId = deterministicEventId(input.workspaceId, input.milestoneId)
      if (!eventPattern.test(eventId))
        throw new CalendarAdapterError('invalid_input', 'Invalid reminder ID')
      const existing = await findOwnedEvent(input)
      if (!existing) return
      try {
        await call(
          'calendar.event.delete',
          { params: { calendarId: input.calendarId, eventId, sendUpdates: 'none' } },
          input.tenantId,
        )
      } catch {
        try {
          if (await findOwnedEvent(input)) {
            throw new CalendarAdapterError(
              'event_unknown',
              'Reminder deletion outcome is unknown; reconcile before retrying',
            )
          }
        } catch (error) {
          if (error instanceof CalendarAdapterError && error.code === 'event_unknown') throw error
          throw new CalendarAdapterError(
            'event_unknown',
            'Reminder deletion outcome is unknown; reconcile before retrying',
          )
        }
      }
    },
  }
}

export const calendarReminderAdapter = createCalendarReminderAdapter()
