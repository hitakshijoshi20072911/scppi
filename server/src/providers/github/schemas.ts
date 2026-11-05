import { z } from 'zod'

// Inputs mirror the declared fields and types for these canonical IDs in the downloaded
// GitHub@1.1.4 Wrekenfile, with tighter operational bounds for safe paging and storage.
const owner = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_.-]+$/)
const repo = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_.-]+$/)
const page = z.number().int().min(1).max(100).optional()
const perPage = z.number().int().min(1).max(100).optional()

export const githubPullGetInputSchema = z
  .object({
    owner,
    repo,
    state: z.enum(['open', 'closed', 'all']).optional(),
    head: z.string().max(300).optional(),
    base: z.string().max(300).optional(),
    sort: z.enum(['created', 'updated', 'popularity', 'long-running']).optional(),
    direction: z.enum(['asc', 'desc']).optional(),
    per_page: perPage,
    page,
  })
  .strict()

export const githubPullGet1InputSchema = z
  .object({ owner, repo, pull_number: z.number().int().positive() })
  .strict()

export const githubPullCommitsGetInputSchema = z
  .object({ owner, repo, pull_number: z.number().int().positive(), per_page: perPage, page })
  .strict()

export const githubCommitGet2InputSchema = z
  .object({ owner, repo, page, per_page: perPage, ref: z.string().min(1).max(256) })
  .strict()

const githubUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value)
    return (
      url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password
    )
  })

const githubPullRequestListItemSchema = z.object({
  id: z.number().int().nonnegative(),
  html_url: githubUrl,
  state: z.enum(['open', 'closed']),
  title: z.string().trim().min(1).max(500),
  user: z.object({ login: z.string().min(1).max(100) }),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  closed_at: z.iso.datetime().nullable(),
  merged_at: z.iso.datetime().nullable(),
  base: z
    .object({ repo: z.object({ id: z.number().int().nonnegative() }).passthrough() })
    .passthrough()
    .optional(),
})

/**
 * The Wrekenfile declares github.pull.get as an array of pull_request_simple
 * objects. Zod strips unrelated provider fields; only approved work metadata is retained.
 */
export const githubPullGetOutputSchema = z.array(githubPullRequestListItemSchema)

export const githubPullRequestMetadataSchema = z
  .object({
    externalId: z.string().min(1).max(200),
    type: z.literal('pull_request'),
    title: z.string().trim().min(1).max(500),
    state: z.enum(['open', 'closed']),
    author: z.string().min(1).max(100),
    url: githubUrl,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    closedAt: z.iso.datetime().nullable(),
    mergedAt: z.iso.datetime().nullable(),
    repositoryExternalId: z.string().max(200).optional(),
  })
  .strict()

const gitUserSchema = z
  .object({
    name: z.string().max(300).nullable().optional(),
    email: z.string().max(320).nullable().optional(),
    date: z.iso.datetime().nullable().optional(),
  })
  .passthrough()

const commitSchema = z.object({
  url: z.string().url(),
  sha: z.string().trim().min(1).max(200),
  html_url: githubUrl,
  commit: z
    .object({
      author: gitUserSchema.nullable(),
      committer: gitUserSchema.nullable(),
      message: z.string().trim().min(1).max(10000),
    })
    .passthrough(),
  author: z
    .object({ login: z.string().trim().min(1).max(100) })
    .passthrough()
    .nullable(),
  committer: z
    .object({ login: z.string().trim().min(1).max(100) })
    .passthrough()
    .nullable(),
})

export const githubPullCommitsGetOutputSchema = z.array(commitSchema)

export const githubCommitMetadataSchema = z
  .object({
    externalId: z.string().min(1).max(200),
    type: z.literal('commit'),
    title: z.string().trim().min(1).max(500),
    state: z.literal('committed'),
    author: z.string().trim().min(1).max(320),
    url: githubUrl,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    relatedPullRequestId: z.string().min(1).max(200),
  })
  .strict()

export type GithubPullGetInput = z.infer<typeof githubPullGetInputSchema>
export type GithubPullRequestMetadata = z.infer<typeof githubPullRequestMetadataSchema>
export type GithubCommitMetadata = z.infer<typeof githubCommitMetadataSchema>
