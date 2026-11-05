import { z } from 'zod'
import type { ExecutorIdentity, SwytchcodeExecutor } from '../../swytchcode/executor.js'
import {
  githubPullGetInputSchema,
  githubPullGetOutputSchema,
  githubPullRequestMetadataSchema,
  type GithubPullRequestMetadata,
} from './schemas.js'

const listPullRequestsInputSchema = z
  .object({
    owner: z.string().trim().min(1).max(100),
    repo: z.string().trim().min(1).max(100),
    state: z.enum(['open', 'closed', 'all']).default('all'),
    perPage: z.number().int().min(1).max(100).default(100),
    maxPages: z.number().int().min(1).max(100).default(10),
  })
  .strict()

export type ListGithubPullRequestsInput = z.input<typeof listPullRequestsInputSchema>
export interface ListGithubPullRequestsResult {
  readonly items: GithubPullRequestMetadata[]
  /** False only when the configured page bound was reached on a full page. */
  readonly complete: boolean
}

export type GithubAdapterErrorCode = 'INVALID_ADAPTER_INPUT' | 'INVALID_PROVIDER_RESPONSE'

export class GithubAdapterError extends Error {
  constructor(
    readonly code: GithubAdapterErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'GithubAdapterError'
  }
}

function parseAdapterInput(input: unknown) {
  const parsed = listPullRequestsInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new GithubAdapterError('INVALID_ADAPTER_INPUT', 'Pull request list input is invalid')
  }
  return parsed.data
}

function metadataFromProvider(value: unknown): GithubPullRequestMetadata {
  const parsed = githubPullGetOutputSchema.element.safeParse(value)
  if (!parsed.success) {
    throw new GithubAdapterError(
      'INVALID_PROVIDER_RESPONSE',
      'GitHub returned a pull request that does not match the verified response schema',
    )
  }
  const metadata = githubPullRequestMetadataSchema.safeParse({
    externalId: String(parsed.data.id),
    type: 'pull_request',
    title: parsed.data.title,
    state: parsed.data.state,
    author: parsed.data.user.login,
    url: parsed.data.html_url,
    createdAt: parsed.data.created_at,
    updatedAt: parsed.data.updated_at,
    closedAt: parsed.data.closed_at,
    mergedAt: parsed.data.merged_at,
  })
  if (!metadata.success) {
    throw new GithubAdapterError(
      'INVALID_PROVIDER_RESPONSE',
      'GitHub pull request metadata is invalid',
    )
  }
  return metadata.data
}

export class GithubAdapter {
  constructor(private readonly executor: SwytchcodeExecutor) {}

  async listPullRequests(
    identity: ExecutorIdentity,
    input: ListGithubPullRequestsInput,
  ): Promise<ListGithubPullRequestsResult> {
    const parsed = parseAdapterInput(input)
    const items: GithubPullRequestMetadata[] = []

    for (let page = 1; page <= parsed.maxPages; page += 1) {
      const requestInput = githubPullGetInputSchema.parse({
        owner: parsed.owner,
        repo: parsed.repo,
        state: parsed.state,
        per_page: parsed.perPage,
        page,
      })
      let response: unknown
      try {
        response = await this.executor.execute({
          methodId: 'github.pull.get',
          input: requestInput,
          identity,
        })
      } catch {
        // Do not relay arbitrary executor/provider text or payloads to callers.
        throw new GithubAdapterError(
          'INVALID_PROVIDER_RESPONSE',
          'GitHub read could not be completed',
        )
      }

      if (!Array.isArray(response) || response.length > parsed.perPage) {
        throw new GithubAdapterError(
          'INVALID_PROVIDER_RESPONSE',
          'GitHub returned an invalid pull request page',
        )
      }
      const pageResult = githubPullGetOutputSchema.safeParse(response)
      if (!pageResult.success) {
        throw new GithubAdapterError(
          'INVALID_PROVIDER_RESPONSE',
          'GitHub returned an invalid pull request page',
        )
      }
      for (const pullRequest of pageResult.data) {
        items.push(metadataFromProvider(pullRequest))
      }
      if (pageResult.data.length < parsed.perPage) {
        return { items, complete: true }
      }
    }

    return { items, complete: false }
  }
}
