# Users and Use Cases

**Status:** Product specification<br>
**Version:** 1.0

## 1. Primary Users

### Solo operator

A business owner, freelancer, accountant, buyer, or analyst working alone with recurring spreadsheets and documents. They need fast setup, safe defaults, clear findings, and no mandatory organization administration.

Key jobs:

- Compare files or documents without rebuilding a spreadsheet.
- Watch a folder and repeat a known process.
- Audit important data before sending or using it.
- Ask questions without uploading sensitive originals.

### Operations team

A small team capturing, validating, reconciling, and reporting operational data across locations or customers.

Key jobs:

- Standardize how records are captured and reviewed.
- Assign exceptions and approvals.
- See which jobs are waiting, failed, or complete.
- Preserve an audit trail across people and devices.

### Procurement and finance reviewer

A buyer, bookkeeper, finance manager, or business owner responsible for quotes, contracts, invoices, rates, and approvals.

Key jobs:

- Compare suppliers using consistent criteria.
- Check invoices against source agreements.
- Explain a finding with defensible evidence.
- Approve or reject high-impact conclusions.

### Analyst or consultant

A person who prepares recurring analyses, migrations, dashboards, or reports for internal stakeholders or clients.

Key jobs:

- Reuse definitions and templates across periods.
- Prepare data without fragile scripts.
- Generate consistent reports with review history.
- Keep each client or project isolated.

### Field operator

A worker or supervisor capturing information through Android while connectivity may be unreliable.

Key jobs:

- Complete a guided form quickly.
- Attach photographs, signatures, voice, or codes.
- Continue offline and synchronize safely later.
- Correct uncertain extraction without re-entering everything.

### Developer or software company

A technical team embedding import and validation workflows into its own product.

Key jobs:

- Define a target schema and receive normalized records.
- Avoid building file mapping and row-level error UX.
- Test with a local gateway before production.
- Observe webhooks, usage, versions, and tenant boundaries.

## 2. Organizational Model

A new user begins with a personal organization and workspace so solo use does not require administrative setup. The hierarchy is:

`User -> Organization -> Workspace -> Project`

- **Organization** owns billing, members, global policies, and verified domains.
- **Workspace** is the primary security, data, retention, and execution boundary.
- **Project** groups related artifacts, rules, jobs, and reports without creating another tenant. A customer-facing Client is a project with `kind = CLIENT`, not a separate domain object.
- **Device** belongs to a user; each organization enrollment has its own identity/key and may receive grants for one or more workspaces in that organization.

## 3. Core Jobs-to-be-Done

| Situation | Job | Desired outcome |
|---|---|---|
| A file arrives | “Help me understand and route this without deciding every field first.” | Classified artifact with suggested next actions and evidence. |
| Work repeats weekly | “Run the same checked process without rebuilding it.” | Versioned recipe with monitored execution and exceptions. |
| A conclusion matters | “Show me where this number or warning came from.” | Direct source reference and reproducible processing version. |
| Data is sensitive | “Let me benefit without uploading the original.” | Local execution with controlled derived synchronization. |
| Data is messy | “Help me map and correct it without hiding invalid records.” | Confirmed mapping, row-level findings, and recoverable import. |
| A team must act | “Put uncertainty and risk in front of the correct person.” | Assignment, approval, notifications, and audit history. |
| Connectivity fails | “Let me continue and reconcile safely later.” | Durable offline queue with visible sync state. |
| Requirements change | “Let me update a rule without corrupting historical results.” | Versioned rule and explicit reprocessing decision. |

## 4. Canonical End-to-End Use Cases

### Local recurring file workflow

1. User installs and registers Desktop.
2. User grants access to one folder and chooses Hybrid mode.
3. A file appears and becomes an immutable artifact.
4. A recipe classifies and processes the file locally.
5. A low-confidence field is sent to review without uploading the entire original.
6. User approves from Android.
7. Desktop produces an output copy and synchronizes the approved result and audit record.

### Cloud collaborative workflow

1. An Analyst uploads documents into a client project on Web.
2. DataBreeze runs an approved cloud processor.
3. Findings retain page, table, cell, or row references.
4. An Approver reviews consequential exceptions.
5. A versioned report is published and access is logged.

### Android field workflow

1. An Operator downloads a form assignment.
2. The device captures fields, images, a barcode, and a signature offline.
3. Local validation finds a missing required field.
4. The completed record is queued and later synchronizes idempotently.
5. Web supervisors review exceptions and monitor completion.

### Embedded workflow

1. A developer defines a target schema and allowed transformations.
2. Its user opens the branded importer inside the developer’s product.
3. DataBreeze maps, validates, and previews a supplied file.
4. The user confirms the import.
5. The developer receives signed webhooks and normalized records with error details.

## 5. Experience Requirements

- Vietnamese copy is complete, natural, and primary; English is not allowed to become a partial fallback.
- Technical concepts are explained in business language with deeper detail available on demand.
- Solo users see a simple workspace; organization controls appear as the team grows.
- Every empty state has one useful next action.
- Errors state what happened, what was preserved, and what the user can do next.
- Accessibility targets WCAG 2.2 AA on Web and equivalent platform accessibility expectations on Desktop and Android.
- Status never relies on color alone.
- Keyboard, screen-reader, reduced-motion, and scalable-text behavior is tested.
- Dates, currency, decimal separators, phone numbers, names, and addresses support Vietnamese conventions without assuming all data is Vietnamese.

## 6. Role Expectations

| Role | Typical capability |
|---|---|
| Owner | Ownership transfer, billing, deletion, recovery, and all policy controls. |
| Admin | Members, devices, integrations, retention, and workspace configuration. |
| Analyst | Schemas, datasets, rules, analyses, recipes, and reports. |
| Operator | Capture, run allowed recipes, and resolve routine assigned exceptions. |
| Approver | Review and approve actions or publications within assigned policy scope. |
| Viewer | Read explicitly published or shared results. |

Roles provide defaults. Fine-grained capabilities and project assignments narrow access; they never broaden it beyond workspace policy.

## 7. Adoption Sequence

Onboarding should lead to a first useful workflow, not a tour of all modules:

1. Select a goal such as watch a folder, audit a spreadsheet, compare quotes, or capture operations.
2. Choose a data mode with a plain-language explanation.
3. Connect only the device, folder, or cloud source needed for that goal.
4. Run a guided sample or real job.
5. Review evidence and approve the first result.
6. Save the workflow as a reusable recipe when repetition is valuable.
