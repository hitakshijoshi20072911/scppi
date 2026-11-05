export const demoSteps = [
  {
    title: 'Connect repository',
    kicker: 'Demo simulation',
    detail:
      'A fictional workspace authorizes northstar/atlas-platform through the Swytchcode-shaped integration boundary.',
    metric: 'Tenant context resolved',
  },
  {
    title: 'Retrieve evidence',
    kicker: 'Fictional GitHub read',
    detail:
      'Four sample pull requests and six associated commits are retrieved for the selected period.',
    metric: '4 pull requests · 6 commits',
  },
  {
    title: 'Map to project',
    kicker: 'Project relationship',
    detail: 'The repository is mapped to Atlas Platform for Northstar Studio.',
    metric: '1 project mapping',
  },
  {
    title: 'Apply scope rules',
    kicker: 'Deterministic classification',
    detail:
      'Rules separate delivery, reliability, documentation, and out-of-scope activity without inventing time.',
    metric: '3 matched · 1 review',
  },
  {
    title: 'Match billing records',
    kicker: 'Human evidence',
    detail:
      'Approved time and an accepted fixed-price milestone are compared with the imported evidence.',
    metric: '2 approved records',
  },
  {
    title: 'Review exceptions',
    kicker: 'Human review',
    detail: 'Timezone conversion remains ambiguous and is held for a person to decide.',
    metric: '1 needs review',
  },
  {
    title: 'Reconciliation result',
    kicker: 'Traceable summary',
    detail:
      'The result keeps source references, classifications, and approval provenance together.',
    metric: 'No invoice created',
  },
] as const
export const demoPullRequests = [
  {
    title: 'Add webhook retry handling',
    state: 'merged',
    author: 'Maya Chen',
    commits: 2,
    category: 'Reliability',
  },
  {
    title: 'Improve authentication validation',
    state: 'merged',
    author: 'Ishan Rao',
    commits: 2,
    category: 'Delivery',
  },
  {
    title: 'Fix timezone conversion',
    state: 'open',
    author: 'Maya Chen',
    commits: 1,
    category: 'Needs review',
  },
  {
    title: 'Update integration documentation',
    state: 'merged',
    author: 'Noah Patel',
    commits: 1,
    category: 'Documentation',
  },
] as const
export const demoRecords = [
  { label: 'Approved time entry', value: '3h 30m', note: 'Human-entered · reviewed by Jordan Lee' },
  {
    label: 'Accepted milestone',
    value: '$1,800 USD',
    note: 'Explicit fixed-price value · accepted',
  },
  { label: 'Excluded activity', value: '1 item', note: 'Outside contract scope' },
]
