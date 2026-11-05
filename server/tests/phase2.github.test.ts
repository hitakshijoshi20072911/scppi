import { describe, expect, it, vi } from 'vitest'
import {
  createSwytchcodeExecutor,
  SwytchcodeExecutorError,
  VERIFIED_GITHUB_READ_METHOD_IDS,
  unavailableExecutor,
  type SwytchcodeExecutor,
  type SwytchcodeTransport,
} from '../src/swytchcode/executor.js'
import { GithubAdapter, GithubAdapterError } from '../src/providers/github/adapter.js'
import type { ValidatedSwytchcodeExecutionRequest } from '../src/swytchcode/executor.js'

const identity = { workspaceId: 'workspace-authenticated-1' }

function validInput(methodId: (typeof VERIFIED_GITHUB_READ_METHOD_IDS)[number]) {
  switch (methodId) {
    case 'github.pull.get':
      return { owner: 'octocat', repo: 'Hello-World', per_page: 5, page: 1 }
    case 'github.pull.get1':
      return { owner: 'octocat', repo: 'Hello-World', pull_number: 1 }
    case 'github.pull.commits.get':
      return { owner: 'octocat', repo: 'Hello-World', pull_number: 1, per_page: 5, page: 1 }
    case 'github.commit.get2':
      return { owner: 'octocat', repo: 'Hello-World', ref: 'main', page: 1, per_page: 5 }
  }
}

function pullRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    html_url: 'https://github.com/octocat/Hello-World/pull/42',
    state: 'closed',
    title: 'A small feature',
    user: { login: 'octocat', id: 1 },
    created_at: '2026-10-01T12:00:00Z',
    updated_at: '2026-10-02T12:00:00Z',
    closed_at: '2026-10-02T12:00:00Z',
    merged_at: '2026-10-02T12:00:00Z',
    body: 'Client-authored text that must not escape the adapter',
    diff_url: 'https://github.com/octocat/Hello-World/pull/42.diff',
    comments: [{ body: 'secret comment' }],
    files: [{ filename: 'private/source.ts', patch: '+ secret code' }],
    ...overrides,
  }
}

function transportMock(
  execute: (request: ValidatedSwytchcodeExecutionRequest) => Promise<unknown> = async () => [],
) {
  const transport: SwytchcodeTransport = { execute: vi.fn(execute) }
  return { transport, execute: vi.mocked(transport.execute) }
}

describe('guarded Swytchcode executor', () => {
  it('permits exactly the four verified read IDs and passes authenticated workspace separately', async () => {
    const { transport, execute } = transportMock()
    const executor = createSwytchcodeExecutor(transport)

    for (const methodId of VERIFIED_GITHUB_READ_METHOD_IDS) {
      await executor.execute({ methodId, input: validInput(methodId), identity })
    }

    expect(execute).toHaveBeenCalledTimes(4)
    for (const [index, methodId] of VERIFIED_GITHUB_READ_METHOD_IDS.entries()) {
      const call = execute.mock.calls[index]?.[0]
      expect(call?.methodId).toBe(methodId)
      expect(call?.identity).toEqual(identity)
      expect(call?.input).not.toHaveProperty('workspaceId')
      expect(call?.correlationId).toMatch(/^[a-f0-9]{64}$/)
    }
  })

  it('rejects guessed, write, and unverified method IDs before transport invocation', async () => {
    const { transport, execute } = transportMock()
    const executor = createSwytchcodeExecutor(transport)

    await expect(
      executor.execute({
        methodId: 'github.pull.create' as never,
        input: { owner: 'octocat', repo: 'Hello-World' },
        identity,
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_METHOD' })
    expect(execute).not.toHaveBeenCalled()
  })

  it('returns a safe typed error for a malformed runtime request object', async () => {
    const executor = createSwytchcodeExecutor()
    await expect(executor.execute(null as never)).rejects.toMatchObject({
      code: 'INVALID_EXECUTOR_INPUT',
      correlationId: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
  })

  it('rejects extra/unbounded body fields, including caller-supplied workspace identity', async () => {
    const { transport, execute } = transportMock()
    const executor = createSwytchcodeExecutor(transport)

    await expect(
      executor.execute({
        methodId: 'github.pull.get',
        input: { owner: 'octocat', repo: 'Hello-World', workspaceId: 'attacker-workspace' },
        identity,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_EXECUTOR_INPUT' })
    await expect(
      executor.execute({
        methodId: 'github.pull.get',
        input: { owner: 'x'.repeat(513), repo: 'Hello-World' },
        identity,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_EXECUTOR_INPUT' })
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects missing runtime identity and never accepts workspace identity from provider input', async () => {
    const { transport, execute } = transportMock()
    const executor = createSwytchcodeExecutor(transport)

    await expect(
      executor.execute({
        methodId: 'github.pull.get',
        input: { owner: 'octocat', repo: 'Hello-World' },
        identity: { workspaceId: '' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_EXECUTOR_IDENTITY' })
    expect(execute).not.toHaveBeenCalled()
  })

  it('returns only a SHA-256 correlation and redacts secret-like request keys from hash material', async () => {
    const { transport, execute } = transportMock()
    const executor = createSwytchcodeExecutor(transport)
    const first = await executor.execute({
      methodId: 'github.pull.get',
      input: { owner: 'octocat', repo: 'Hello-World' },
      identity,
    })
    void first
    const correlationId = execute.mock.calls[0]?.[0].correlationId
    expect(correlationId).toMatch(/^[a-f0-9]{64}$/)

    const invalid = await executor
      .execute({
        methodId: 'github.pull.get',
        input: { owner: 'octocat', repo: 'Hello-World', access_token: 'do-not-leak' },
        identity,
      })
      .catch((error: unknown) => error)
    expect(invalid).toBeInstanceOf(SwytchcodeExecutorError)
    expect((invalid as Error).message).not.toContain('do-not-leak')
    expect(invalid).toMatchObject({ correlationId: expect.stringMatching(/^[a-f0-9]{64}$/) })
    const sameShapeDifferentSecret = await executor
      .execute({
        methodId: 'github.pull.get',
        input: { owner: 'octocat', repo: 'Hello-World', access_token: 'another-private-value' },
        identity,
      })
      .catch((error: unknown) => error)
    expect((sameShapeDifferentSecret as SwytchcodeExecutorError).correlationId).toBe(
      (invalid as SwytchcodeExecutorError).correlationId,
    )
  })

  it('fails explicitly when the default runtime is unavailable', async () => {
    await expect(
      unavailableExecutor.execute({
        methodId: 'github.pull.get',
        input: { owner: 'octocat', repo: 'Hello-World' },
        identity,
      }),
    ).rejects.toMatchObject({ code: 'EXECUTOR_UNAVAILABLE' })
  })
})

describe('GitHub pull request adapter', () => {
  it('paginates using only github.pull.get and returns metadata without body, diff, comments, or code', async () => {
    const calls: ValidatedSwytchcodeExecutionRequest[] = []
    const mockExecutor: SwytchcodeExecutor = {
      execute: vi.fn(async (request) => {
        calls.push(request as ValidatedSwytchcodeExecutionRequest)
        return request.input.page === 1
          ? [pullRequest(), pullRequest({ id: 43, title: 'Another feature' })]
          : [
              pullRequest({
                id: 44,
                title: 'Last feature',
                state: 'open',
                closed_at: null,
                merged_at: null,
              }),
            ]
      }),
    }
    const adapter = new GithubAdapter(mockExecutor)

    const result = await adapter.listPullRequests(identity, {
      owner: 'octocat',
      repo: 'Hello-World',
      perPage: 2,
      maxPages: 5,
    })

    expect(result.complete).toBe(true)
    expect(result.items).toHaveLength(3)
    expect(result.items[0]).toEqual({
      externalId: '42',
      type: 'pull_request',
      title: 'A small feature',
      state: 'closed',
      author: 'octocat',
      url: 'https://github.com/octocat/Hello-World/pull/42',
      createdAt: '2026-10-01T12:00:00Z',
      updatedAt: '2026-10-02T12:00:00Z',
      closedAt: '2026-10-02T12:00:00Z',
      mergedAt: '2026-10-02T12:00:00Z',
    })
    expect(result.items[0]).not.toHaveProperty('body')
    expect(result.items[0]).not.toHaveProperty('comments')
    expect(result.items[0]).not.toHaveProperty('files')
    expect(calls).toHaveLength(2)
    expect(calls.map((call) => call.methodId)).toEqual(['github.pull.get', 'github.pull.get'])
    expect(calls.map((call) => call.input)).toEqual([
      { owner: 'octocat', repo: 'Hello-World', state: 'all', per_page: 2, page: 1 },
      { owner: 'octocat', repo: 'Hello-World', state: 'all', per_page: 2, page: 2 },
    ])
    expect(calls.every((call) => call.identity.workspaceId === identity.workspaceId)).toBe(true)
  })

  it('rejects invalid provider responses with a safe typed error', async () => {
    const mockExecutor: SwytchcodeExecutor = {
      execute: vi.fn(async () => [{ id: 'not-an-int', body: 'sensitive client text' }]),
    }
    const adapter = new GithubAdapter(mockExecutor)

    await expect(
      adapter.listPullRequests(identity, { owner: 'octocat', repo: 'Hello-World' }),
    ).rejects.toMatchObject({
      name: 'GithubAdapterError',
      code: 'INVALID_PROVIDER_RESPONSE',
      message: 'GitHub returned an invalid pull request page',
    })
  })

  it('rejects malformed metadata and does not relay arbitrary executor failure text', async () => {
    const badMetadata: SwytchcodeExecutor = {
      execute: vi.fn(async () => [pullRequest({ user: { login: 17 } })]),
    }
    const badPageAdapter = new GithubAdapter(badMetadata)
    await expect(
      badPageAdapter.listPullRequests(identity, { owner: 'octocat', repo: 'Hello-World' }),
    ).rejects.toBeInstanceOf(GithubAdapterError)

    const throwingExecutor: SwytchcodeExecutor = {
      execute: vi.fn(async () => {
        throw new Error('private provider body text')
      }),
    }
    await expect(
      new GithubAdapter(throwingExecutor).listPullRequests(identity, {
        owner: 'octocat',
        repo: 'Hello-World',
      }),
    ).rejects.toMatchObject({ message: 'GitHub read could not be completed' })
  })

  it('marks the result incomplete when the bounded pagination limit is reached', async () => {
    const fullPageExecutor: SwytchcodeExecutor = {
      execute: vi.fn(async () => [pullRequest()]),
    }
    const result = await new GithubAdapter(fullPageExecutor).listPullRequests(identity, {
      owner: 'octocat',
      repo: 'Hello-World',
      perPage: 1,
      maxPages: 1,
    })
    expect(result).toMatchObject({ complete: false, items: [{ externalId: '42' }] })
  })

  it('rejects adapter input outside bounded pagination settings', async () => {
    const executor: SwytchcodeExecutor = { execute: vi.fn(async () => []) }
    await expect(
      new GithubAdapter(executor).listPullRequests(identity, {
        owner: 'octocat',
        repo: 'Hello-World',
        perPage: 101,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ADAPTER_INPUT' })
    expect(executor.execute).not.toHaveBeenCalled()
  })
})
