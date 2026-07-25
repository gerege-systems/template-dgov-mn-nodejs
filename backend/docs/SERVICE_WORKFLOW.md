# Public service registry and request workflow

How services are registered and how citizen requests are decided. Covers
migration 44 (request workflow), 45 (registry), 47 (unification), 48 (permission
cleanup).

## 1. Single source of truth: the registry

**`registry_services` is the master record** for a service (a CPSV-AP service
passport). `gov_services` is its **operational projection** — the citizen portal
and the request workflow run on that table.

```
registry_services  ──(publish)──▶  gov_services  ◀── gov_applications
   (passport, master)               (projection)      (citizen requests)
        │
        └── registry_service_evidences ──▶ documents demanded from the citizen
```

**Rule:** never edit `gov_services` by hand. Edit the passport and publish —
`ProjectToGov` reconciles the operational catalogue with the passport. The link
is `gov_services.registry_service_id` (UNIQUE).

| Action | Effect |
|---|---|
| Publish passport | `gov_services` row created/updated, `enabled=true` |
| Archive passport | `enabled=false`, `lifecycle='withdrawn'` (row is NOT deleted) |
| Flip evidence to `from_citizen=false` | The citizen-facing document list shrinks |

Archiving does not delete the row because `gov_applications.service_id` points at
it; deleting would sever the citizen's request history.

## 2. International coding

| Field | Standard | Example |
|---|---|---|
| `code` | ISO 3166 + COFOG-derived | `MN-0133-002` |
| `cofog_code` | UN COFOG 1999 | `01.3.3` |
| `main_activity` | EU main-activity authority table | `gen-pub` |
| `sdg_code` | SDG (EU 2018/1724) Annex II procedure | `S1` |
| `processing_time` | ISO 8601 duration (`cv:processingTime`) | `P7D` |
| `output_type` | CPSV-AP Output vocabulary (`cpsv:produces`) | `Declaration` |
| `assurance_level` | eIDAS (Reg. 910/2014 Art. 8) | `substantial` |
| `registry_life_events.eu_code` | EU life/business event code list | `RES`, `STBU` |

**Caution:** CPSV-AP's "COFOG main activity Authority Table" is **not** COFOG —
it is the EU procurement main-activity list. Real UN COFOG is therefore kept
separately in `cofog_code`.

The SDG Annex II codes `R1`–`X6` do not appear in the regulation text; they are a
SEMIC code-list layer. Populate `sdg_code` only on a genuine match.

## 3. Two paths: auto and manual

`registry_services.fulfilment` determines what the citizen should expect.

### `auto` — fulfilled immediately

Attestations and extracts read straight out of a register. No human involved: the
application, the reference document and the notification are created in **one
transaction** and the status goes directly to `completed`. It never enters the
officer queue.

### `manual` — decided by an officer

The application is created as `registered`, an SLA deadline is stamped, and it
enters the queue. The citizen gets an acknowledgement-of-receipt notification.

This split follows EU 2018/1724 Art. 6(2): where the output is not delivered
immediately the user must get an automatic acknowledgement of receipt (b) and an
electronic notification of completion (d); where it is delivered immediately the
acknowledgement is unnecessary.

### The legal gate on automation

`fulfilment='auto'` is only accepted when `has_discretion` and `has_assessment`
are **both false**. This mirrors German VwVfG §35a: a fully automated
administrative act requires that (1) a statute permits it, (2) there is no
discretion (*Ermessen*), and (3) there is no assessment latitude on the
precondition side (*Beurteilungsspielraum*). The usecase layer enforces it; as a
second line of defence `applyAuto` diverts a flagged service to manual review.

## 4. State machine

```
submitted ──▶ registered ──▶ in_review ──▶ approved ──▶ completed
                  │              │  ▲
                  │              ▼  │
                  │        info_required       (clock STOPS)
                  │              │
                  └──────────────┴──▶ rejected / cancelled / expired
```

Allowed transitions live in `domain.govTransitions` and are checked by
`domain.GovCanTransition`. The repository re-enforces the same rule as a SQL
`WHERE status IN (…)` guard — that layer exists to kill races (two officers
clicking Approve at once); zero rows affected yields `apperror.Conflict`.

**`approved` vs `completed`:** if the output is a document it is issued with the
decision and the case goes straight to `completed`. If the output is a **physical
object** (ID card, certificate) the case waits at `approved` until an officer
records delivery via `complete`.

The **result vocabulary** (`result`) is separate from status: `granted`,
`refused`, `withdrawn`, `not_admissible`, `processed`. This follows the Dutch ZGW
principle — standardise the outcome vocabulary, leave the progress vocabulary
local.

## 5. SLA and clock suspension

`due_at` is stamped **once**, at creation. Recomputing it on read would let the
deadline drift and hide breaches.

Moving to `info_required` stamps `suspended_at` and **stops the SLA clock**. When
the citizen supplies the information, `due_at` is pushed out by the suspended
duration, so a slow citizen never registers as an agency breach (the model used
by Dutch Awb 4:15).

A background worker (`SLASweep`, every 60s) does two things:

1. **Breach marking** — sets the `sla_breached` latch and notifies the citizen
   once. Suspended applications are **skipped**.
2. **Tacit approval** — for services with `tacit_approval=true` whose deadline
   passed, grants the application and flags `tacit=true`. The citizen is told
   explicitly that the decision was automatic.

> Tacit approval derives from EU practice (Services Directive 2006/123/EC
> Art. 13(4)) but has **no direct force in Mongolia**. The legal basis must be
> confirmed per service under Mongolian law; the default is `false`.

`SLASweep` runs outside any HTTP request, so the context carries no identity —
and RLS blocks every row when identity is absent. The sweep therefore sets the
system role explicitly via `rls.WithService(ctx)`.

## 6. Permissions and RLS

| Permission | Who | What |
|---|---|---|
| `gov.review` | manager (id=3) | Review and decide citizen requests |
| `registry.view` / `registry.manage` | admin | Passports, evidence, publishing |

**The `officer` RLS role.** An officer must see other citizens' applications, so
the `service|admin|user` vocabulary does not fit. The `OfficerRLSContext`
middleware sets `app.user_role='officer'` on `/gov/officer/*` routes **only**.

Least privilege: officer policies exist on `gov_applications`,
`gov_references`, `gov_notifications` and `gov_application_events` — and nowhere
else. `users`, `gov_payments` and `gov_appointments` have **no** officer policy,
and because RLS policies are permissive (OR) the officer sees zero rows there
(fail-closed). An officer cannot reach a citizen's payments, appointments or
account record.

The middleware must **not** be mounted globally — that would strip a manager of
access to their own profile.

## 7. Audit trail

Every transition is appended to `gov_application_events`: who, when, from which
status to which, and on what grounds. The citizen can **read** their own history
(`WITH CHECK (false)` — they cannot write); officers see all of it.

A rejection **must** carry a reason — the usecase rejects an empty decision note.
The citizen has to know the grounds in order to contest them.

## 8. Adding a service

1. Create a passport at `/admin/registry/services` (starts as a draft).
2. Link evidence. Mark anything already held in KHUR as `from_citizen=false`,
   otherwise it is a once-only violation and the service cannot be published at
   the proactivity level it claims.
3. Set the operational config: `fulfilment`, `sla_hours`, `output_type`,
   `output_ref_type` (if it issues a reference document), `assurance_level`.
4. Publish → it projects into `gov_services` and citizens can apply.

You never need to — and must not — insert into the operational catalogue by hand.
