export const CLASSIFICATION_LIMITS = {
  itemId: 128,
  title: 500,
  body: 4_000,
  rules: 100,
  keywordsPerRule: 32,
  totalKeywords: 1_000,
  keyword: 80,
  category: 64,
} as const

export interface WorkItemText {
  id: string
  title: string
  body?: string
}

export interface ScopeKeywordRule {
  id: string
  category: string
  keywords: readonly string[]
}

export type ClassificationOutcome = 'rule_matched' | 'needs_review'

export type ClassificationReason =
  | 'matched_unique_scope'
  | 'no_matching_rule'
  | 'ambiguous_scope'
  | 'untrusted_content'
  | 'invalid_input'
  | 'invalid_rules'

/** This deliberately contains no approval state, amount, currency, or time fields. */
export interface ClassificationResult {
  outcome: ClassificationOutcome
  category: string | null
  ruleId: string | null
  reason: ClassificationReason
}

const SAFE_IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/
const SAFE_CATEGORY = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u
const INSTRUCTION_LIKE_CONTENT =
  /(?:ignore|disregard|forget)\s+(?:(?:all|any|the)\s+)?(?:the\s+)?(?:previous|prior|above|earlier)\s+(?:system\s+|developer\s+)?instructions?\b|\b(?:system|developer)\s+prompt\b|\b(?:reveal|show|print|repeat)\s+(?:the\s+)?(?:system\s+|developer\s+)?prompt\b|\b(?:execute|run)\s+(?:this|the following)\s+(?:command|code|instructions?)\b|\bprompt\s+injection\b|\bjailbreak\b|<\|(?:system|assistant|developer|im_start|im_end)\|>/iu

const INVALID_INPUT: ClassificationResult = {
  outcome: 'needs_review',
  category: null,
  ruleId: null,
  reason: 'invalid_input',
}

const INVALID_RULES: ClassificationResult = {
  outcome: 'needs_review',
  category: null,
  ruleId: null,
  reason: 'invalid_rules',
}

function hasExactKeys(value: object, allowed: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key))
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    !CONTROL_CHARACTERS.test(value)
  )
}

function isValidItem(item: unknown): item is WorkItemText {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) return false
  const candidate = item as Record<string, unknown>
  const keys = Object.keys(candidate)
  if (
    !(keys.length === 2 || (keys.length === 3 && keys.includes('body'))) ||
    !keys.includes('id') ||
    !keys.includes('title')
  ) {
    return false
  }
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    candidate.id.length <= CLASSIFICATION_LIMITS.itemId &&
    SAFE_IDENTIFIER.test(candidate.id) &&
    isBoundedText(candidate.title, CLASSIFICATION_LIMITS.title) &&
    (candidate.body === undefined ||
      (typeof candidate.body === 'string' &&
        candidate.body.length <= CLASSIFICATION_LIMITS.body &&
        !CONTROL_CHARACTERS.test(candidate.body)))
  )
}

function normalizeTokens(value: string): string[] {
  return (
    value
      .normalize('NFKC')
      .toLocaleLowerCase('en-US')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  )
}

function phraseMatches(
  contentTokens: readonly string[],
  keywordTokens: readonly string[],
): boolean {
  if (keywordTokens.length === 0 || keywordTokens.length > contentTokens.length) return false
  for (let start = 0; start <= contentTokens.length - keywordTokens.length; start += 1) {
    if (keywordTokens.every((token, offset) => contentTokens[start + offset] === token)) return true
  }
  return false
}

function validateRules(rules: unknown): rules is readonly ScopeKeywordRule[] {
  if (!Array.isArray(rules) || rules.length === 0 || rules.length > CLASSIFICATION_LIMITS.rules) {
    return false
  }

  const ruleIds = new Set<string>()
  let totalKeywords = 0
  for (const rawRule of rules) {
    if (typeof rawRule !== 'object' || rawRule === null || Array.isArray(rawRule)) return false
    const rule = rawRule as Record<string, unknown>
    if (!hasExactKeys(rule, ['id', 'category', 'keywords'])) return false
    if (
      !isBoundedText(rule.id, CLASSIFICATION_LIMITS.itemId) ||
      !SAFE_IDENTIFIER.test(rule.id) ||
      ruleIds.has(rule.id) ||
      !isBoundedText(rule.category, CLASSIFICATION_LIMITS.category) ||
      !SAFE_CATEGORY.test(rule.category) ||
      !Array.isArray(rule.keywords) ||
      rule.keywords.length === 0 ||
      rule.keywords.length > CLASSIFICATION_LIMITS.keywordsPerRule
    ) {
      return false
    }
    ruleIds.add(rule.id)
    totalKeywords += rule.keywords.length
    if (totalKeywords > CLASSIFICATION_LIMITS.totalKeywords) return false

    const seenKeywords = new Set<string>()
    for (const keyword of rule.keywords) {
      if (
        !isBoundedText(keyword, CLASSIFICATION_LIMITS.keyword) ||
        INSTRUCTION_LIKE_CONTENT.test(keyword)
      ) {
        return false
      }
      const normalized = normalizeTokens(keyword).join(' ')
      if (normalized.length === 0 || seenKeywords.has(normalized)) return false
      seenKeywords.add(normalized)
    }
  }
  return true
}

function needsReview(reason: ClassificationReason): ClassificationResult {
  return { outcome: 'needs_review', category: null, ruleId: null, reason }
}

/**
 * Deterministically matches bounded, plain-text evidence against bounded scope keywords.
 * Evidence is never interpreted as instructions and all untrusted/ambiguous cases fail closed.
 */
export function classifyWorkItem(item: unknown, rules: unknown): ClassificationResult {
  if (!isValidItem(item)) return INVALID_INPUT
  if (!validateRules(rules)) return INVALID_RULES

  const content = `${item.title}\n${item.body ?? ''}`
  if (INSTRUCTION_LIKE_CONTENT.test(content)) return needsReview('untrusted_content')
  const contentTokens = normalizeTokens(content)
  const matches: { ruleId: string; category: string }[] = []

  for (const rule of rules) {
    const matched = rule.keywords.some((keyword) =>
      phraseMatches(contentTokens, normalizeTokens(keyword)),
    )
    if (matched) matches.push({ ruleId: rule.id, category: rule.category })
  }

  if (matches.length === 0) return needsReview('no_matching_rule')
  const categories = new Set(matches.map((match) => match.category))
  if (categories.size !== 1) return needsReview('ambiguous_scope')

  matches.sort((left, right) => left.ruleId.localeCompare(right.ruleId, 'en'))
  const selected = matches[0]
  if (selected === undefined) return needsReview('no_matching_rule')
  return {
    outcome: 'rule_matched',
    category: selected.category,
    ruleId: selected.ruleId,
    reason: 'matched_unique_scope',
  }
}
