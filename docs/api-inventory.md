# VendorProof API Inventory

**Purpose:** Method-verification register for Swytchcode provider integrations.

**Status:** No provider is currently past catalogue-level evidence.

---

## Verification Levels

1. **Catalogue mention** - Provider appears in Swytchcode catalogue
2. **Registry search confirmed** - `swy search` returns the provider
3. **Integration download successful** - `swy get` succeeded
4. **Method present in Wrekenfile** - Method appears in generated Wrekenfile
5. **Canonical ID and schemas verified** - Canonical ID, input schema, and output schema read from Wrekenfile
6. **Method enabled** - `swy add method` succeeded
7. **Provider authentication connected** - `swy auth connect` succeeded with test/sandbox account
8. **Sandbox execution verified** - `swy exec` succeeded in sandbox mode with test data

A provider only counts at the highest rung actually reached.

---

## Provider Matrix

| Provider | Business purpose | Verification level | Canonical ID | Input schema | Output schema | Authentication | Test evidence |
|---|---|---|---|---|---|---|---|
| GitHub | PR and commit evidence (read) | Rung 5 (Canonical IDs and schemas verified) | github.pull.get, github.pull.commits.get | See Wrekenfile | See Wrekenfile | oauth2 | Not yet (no auth connected) |
| Stripe | Draft invoice (write) | Rung 5 (Canonical IDs and schemas verified) | stripe.invoice.create, stripe.invoice.get | See Wrekenfile | See Wrekenfile | api_key | Not yet (no auth connected) |
| Google Drive | Private copy of audit report (write) | None | - | - | - | - | - |
| Slack | Approval-needed notification (write) | Catalogue mention only | - | - | - | - | - |
| Linear | Ticket scope (read) | None | - | - | - | - | - |
| QuickBooks Online | Alternative invoicing | None | - | - | - | - | - |
| Harvest / Toggl / Clockify | Time evidence | None | - | - | - | - | - |

---

## Provider Details

### GitHub

**Purpose:** Read pull requests, commits, and work evidence.

**Verification level:** Rung 5 (Canonical IDs and schemas verified)

**Integration version:** GitHub@1.1.4

**Wrekenfile path:** `.swytchcode/integrations/GitHub/github/1.1.4/wrekenfile.yaml`

**Evidence copy:** `docs/evidence/swytchcode/github/wrekenfile.yaml`

**Verified canonical IDs:**
- `github.pull.get` - List pull requests for a repository
- `github.pull.commits.get` - List commits for a specific pull request
- `github.pull.get1` - Get details for a specific pull request
- `github.commit.get2` - Get a specific commit by owner, repo, and ref

**Input schema:** See Wrekenfile (large file, full schema not displayed here)

**Output schema:** See Wrekenfile (large file, full schema not displayed here)

**Read/write:** Read

**Authentication:** oauth2 (GitHub OAuth2)

**Sandbox/test support:** GitHub does not have a separate sandbox mode; uses test repositories

**Operations needed (descriptive, not method names):**
- List PRs for a repo with pagination
- Read one PR
- Read its commits

**Risk:** Repo content and private code metadata; import only title, state, author, timestamps, URL

**Failure behaviour:** Partial run (R8); retry reads; never fall through to direct calls

**Status:** Canonical IDs and schemas verified. Authentication not yet connected. Sandbox execution not yet verified.

---

### Stripe

**Purpose:** Draft invoice creation in test mode.

**Verification level:** Rung 5 (Canonical IDs and schemas verified)

**Integration version:** Stripe@2026-06-24.dahlia

**Wrekenfile path:** `.swytchcode/integrations/Stripe/stripe/2026-06-24.dahlia/wrekenfile.yaml`

**Evidence copy:** `docs/evidence/swytchcode/stripe/wrekenfile.yaml`

**Verified canonical IDs:**
- `stripe.invoice.create` - Create a draft invoice for a customer
- `stripe.invoice.get` - Get an invoice by its ID
- `stripe.invoice.list` - Get a list of invoices, optionally filtered by customer or date
- `stripe.invoiceitem.create` - Add an item to an invoice or the next invoice for a customer
- `stripe.invoiceitem.get` - Get a specific invoice item by its ID
- `stripe.invoiceitem.list` - Retrieve a list of invoice items
- `stripe.customer.create1` - Create a customer
- `stripe.customer.get` - Retrieve a customer

**Input schema:** See Wrekenfile (large file, full schema not displayed here)

**Output schema:** See Wrekenfile (large file, full schema not displayed here)

**Read/write:** Write plus read

**Authentication:** api_key (Stripe API key)

**Sandbox/test support:** Stripe has test mode with test keys (sk_test_ prefix)

**Idempotency mechanism:** Stripe supports idempotency keys (to be verified in execution)

**Operations needed (descriptive, not method names):**
- Find or create customer
- Create invoice items
- Create a draft invoice
- Read it back
- Find by metadata

**Risk:** Real money object, even in test mode

**Failure behaviour:** Unknown outcome stops in `draft_unknown`; never resend

**Status:** Canonical IDs and schemas verified. Authentication not yet connected. Sandbox execution not yet verified. Idempotency mechanism to be verified during execution.

---

### Google Drive

**Purpose:** Private copy of audit report.

**Verification level:** None

**Operations needed (descriptive, not method names):**
- Upload a file to a folder

**Read/write:** Write

**Risk:** Wrong permissions expose client work

**Failure behaviour:** Non-blocking; database copy remains authoritative

**Status:** Future milestone (Milestone 6); needs verification

---

### Slack

**Purpose:** Notify that approval is needed.

**Verification level:** Catalogue mention only

**Operations needed (descriptive, not method names):**
- Post a message to a channel

**Read/write:** Write

**Risk:** Leaks client names if the message is careless

**Failure behaviour:** Non-blocking; failure recorded, run unaffected

**Status:** Future milestone (Milestone 7); needs verification

---

### Linear

**Purpose:** Additional ticket scope information.

**Verification level:** None

**Operations needed (descriptive, not method names):**
- List issues for a team or project

**Read/write:** Read

**Risk:** Client ticket text is untrusted

**Failure behaviour:** Optional; fall back to GitHub Issues; else manual work items

**Status:** Optional; needs verification

---

### QuickBooks Online

**Purpose:** Alternative invoicing provider.

**Verification level:** None

**Operations needed (descriptive, not method names):**
- Same as Stripe (create draft, read back, find by metadata)

**Read/write:** Write plus read

**Risk:** Touches accounting records

**Failure behaviour:** Used only if Stripe fails rung 8 for the four required methods

**Status:** Fallback; needs verification only if Stripe fails

---

### Time Trackers (Harvest / Toggl / Clockify)

**Purpose:** Time evidence.

**Verification level:** None

**Operations needed (descriptive, not method names):**
- List time entries

**Read/write:** Read

**Risk:** Deferred

**Failure behaviour:** Not built in release one; manual time entries used instead

**Status:** Deferred; manual time entries in release one

---

## Financial Provider Selection Rule

Choose the first provider, in the order Stripe then QuickBooks Online, that reaches rung 8 for all of:

- Create a draft invoice with line items
- Read the invoice back with status and total
- Send or record a stable identifier so the draft can be found later
- An idempotency mechanism if one exists

**Stripe is preferred** because it is evidenced in the catalogue and has a test mode. That preference is not a verification.

If neither passes, the documented blocker is a manual invoice export, with the approval and audit trail unchanged.

---

## Method Verification Procedure

Run at Milestone 2, one provider at a time. Commands come from the CLI README and must be confirmed with `swy --help` on CLI 2.25.1 before use.

1. Re-read the primary pages on docs.swytchcode.com that could not be opened in the architecture session. Record exact findings in `docs/verified-facts.md` with URL and date.
2. **Rung 1:** Catalogue mention at swytchcode.com/apis. Record the screenshot or text.
3. **Rung 2:** `swy search` for the provider. Record the real output as [CLI].
4. **Rung 3:** `swy get` for the provider. Confirm `tooling.json` is unchanged afterwards, as documented.
5. **Rung 4:** `swy list` and `swy info` to see the methods actually present. Delete any planned operation that is not present.
6. **Rung 5:** Read each needed method's canonical ID, input schema and output schema from the Wrekenfile. Copy them verbatim into this document.
7. **Rung 6:** `swy add` for only the minimum methods needed, then `swy check`.
8. **Rung 7:** Connect the sandbox or test account with `swy auth connect`, then `swy auth status`.
9. **Rung 8:** `swy exec` with `--dry-run`, then a real call against sandbox data, then record the output.
10. Only then generate the Zod schemas and add the ID to the executor allowlist.

A provider counts at the highest rung actually reached, and nothing above it may be claimed.

---

## Important Notes

- **Do not invent canonical IDs.** All canonical IDs in this table must come from actual downloaded Wrekenfiles.
- **Do not invent schemas.** Input and output schemas must be copied verbatim from Wrekenfiles.
- **Do not assume provider availability.** A provider may not exist in the Swytchcode registry.
- **Do not assume method existence.** A provider may not have the exact method needed.
- **Direct provider calls are forbidden.** All provider calls must go through Swytchcode.
- **No production calls during development.** All verification must use sandbox or test accounts.

---

**Document status:** Initial inventory created. Verification pending at Milestone 2.
