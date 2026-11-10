import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  CALENDAR_REMINDER_METHODS,
  CalendarAdapterError,
  createCalendarReminderAdapter,
  type CalendarRuntimeExec,
  type ReminderInput,
} from '../src/swytchcode/calendar-reminders.js'

const workspaceId = 'd2719a51-747f-4a37-8a4f-9a7491e12708'
const milestoneId = '9ff117f4-3d78-4998-ae13-2951d47305f3'
const eventId = `vp${createHash('sha256').update(`${workspaceId}\0${milestoneId}`).digest('hex')}`
const marker = `VendorProof managed calendar for workspace ${workspaceId}`
const input: ReminderInput = {
  tenantId: workspaceId,
  workspaceId,
  calendarId: 'test-calendar-id',
  milestoneId,
  reminderHash: 'b'.repeat(64),
  summary: 'Synthetic milestone reminder',
  description: 'A test reminder',
  start: { dateTime: '2026-12-01T09:00:00-05:00', timeZone: 'America/New_York' },
  end: { dateTime: '2026-12-01T09:30:00-05:00', timeZone: 'America/New_York' },
}
const managedCalendar = {
  id: input.calendarId,
  summary: 'VendorProof Reminders',
  description: marker,
}
const ownedProperties = {
  private: {
    vendorproofWorkspaceId: workspaceId,
    vendorproofMilestoneId: milestoneId,
    vendorproofReminderHash: input.reminderHash,
  },
}
const event = {
  id: eventId,
  summary: input.summary,
  description: input.description,
  start: input.start,
  end: input.end,
  extendedProperties: ownedProperties,
}

function fakeExec(
  implementation: (method: string, args: Record<string, unknown>, calls: unknown[][]) => unknown,
  calls: unknown[][] = [],
): CalendarRuntimeExec {
  return async (method, args, options) => {
    calls.push([method, args, options])
    return implementation(method, args as Record<string, unknown>, calls)
  }
}

describe('Google Calendar reminder adapter', () => {
  it('exposes only the narrow app-created calendar method set', () => {
    expect(CALENDAR_REMINDER_METHODS).toEqual([
      'calendar.me.calendarList.list',
      'calendar.calendar.create',
      'calendar.event.get',
      'calendar.event.create',
      'calendar.event.update1',
      'calendar.event.delete',
    ])
  })

  it('finds or creates only the exact workspace-specific managed calendar', async () => {
    let lists = 0
    let creates = 0
    const adapter = createCalendarReminderAdapter(
      fakeExec((method) => {
        if (method === 'calendar.me.calendarList.list') {
          lists += 1
          return lists === 1 ? { items: [] } : { items: [managedCalendar] }
        }
        if (method === 'calendar.calendar.create') {
          creates += 1
          throw new Error('synthetic ambiguous create')
        }
        throw new Error('unexpected method')
      }),
    )
    await expect(adapter.ensureManagedCalendar(workspaceId, workspaceId)).resolves.toEqual({
      id: input.calendarId,
      summary: 'VendorProof Reminders',
    })
    expect(creates).toBe(1)
    expect(lists).toBe(2)
  })

  it('creates a deterministic reminder only in the verified managed calendar with no attendees', async () => {
    const calls: unknown[][] = []
    const adapter = createCalendarReminderAdapter(
      fakeExec((method) => {
        if (method === 'calendar.me.calendarList.list') return { items: [managedCalendar] }
        if (method === 'calendar.event.get') return { items: [] }
        if (method === 'calendar.event.create') return event
        throw new Error('unexpected method')
      }, calls),
    )
    const result = await adapter.createReminder(input)
    expect(result).toMatchObject({
      calendarId: input.calendarId,
      eventId: event.id,
      recovered: false,
    })
    const lookup = calls.find(([method]) => method === 'calendar.event.get')?.[1] as {
      params: Record<string, unknown>
    }
    expect(lookup.params.privateExtendedProperty).toEqual([
      `vendorproofWorkspaceId=${workspaceId}`,
      `vendorproofMilestoneId=${milestoneId}`,
    ])
    const create = calls.find(([method]) => method === 'calendar.event.create')?.[1] as {
      params: Record<string, unknown>
      body: Record<string, unknown>
    }
    expect(create.params).toMatchObject({ calendarId: input.calendarId, sendUpdates: 'none' })
    expect(create.body).toMatchObject({
      id: event.id,
      extendedProperties: ownedProperties,
      start: input.start,
      end: input.end,
    })
    expect(create.body).not.toHaveProperty('attendees')
    expect((calls[0][2] as { tenantId: string }).tenantId).toBe(workspaceId)
  })

  it('recovers an ambiguous event creation through an exact private marker without duplicate creation', async () => {
    const calls: unknown[][] = []
    let listCount = 0
    const adapter = createCalendarReminderAdapter(
      fakeExec((method) => {
        if (method === 'calendar.me.calendarList.list') return { items: [managedCalendar] }
        if (method === 'calendar.event.get') {
          listCount += 1
          return { items: listCount === 1 ? [] : [event] }
        }
        if (method === 'calendar.event.create') throw new Error('lost response')
        throw new Error('unexpected method')
      }, calls),
    )
    await expect(adapter.createReminder(input)).resolves.toMatchObject({
      recovered: true,
      eventId: event.id,
    })
    expect(calls.filter(([method]) => method === 'calendar.event.create')).toHaveLength(1)
  })

  it('refuses to edit or delete events outside the exact workspace/milestone marker', async () => {
    const foreign = {
      ...event,
      extendedProperties: {
        private: {
          ...ownedProperties.private,
          vendorproofWorkspaceId: 'f2719a51-747f-4a37-8a4f-9a7491e12708',
        },
      },
    }
    const calls: unknown[][] = []
    const adapter = createCalendarReminderAdapter(
      fakeExec((method) => {
        if (method === 'calendar.me.calendarList.list') return { items: [managedCalendar] }
        if (method === 'calendar.event.get') return { items: [foreign] }
        return { id: 'should-not-be-used' }
      }, calls),
    )
    await expect(adapter.updateReminder(input)).rejects.toBeInstanceOf(CalendarAdapterError)
    await expect(adapter.deleteReminder(input)).rejects.toBeInstanceOf(CalendarAdapterError)
    expect(
      calls.some(
        ([method]) => method === 'calendar.event.update1' || method === 'calendar.event.delete',
      ),
    ).toBe(false)
  })

  it('fails before provider execution when authenticated workspace identity is invalid', async () => {
    let calls = 0
    const adapter = createCalendarReminderAdapter(async () => {
      calls += 1
      return {}
    })
    await expect(adapter.ensureManagedCalendar('', workspaceId)).rejects.toMatchObject({
      code: 'invalid_input',
    })
    await expect(
      adapter.createReminder({ ...input, workspaceId: 'not-a-uuid' }),
    ).rejects.toMatchObject({ code: 'invalid_input' })
    expect(calls).toBe(0)
  })
})
