# PM Execution Contract (R1 + R2)

## Scope
- Included in this execution window:
  - R1 Safety Foundation
  - R2 Modern Rules: Redirect, Cache, Configuration
  - Legacy Page Rules kept operational with deprecation metadata
- Excluded:
  - WAF Custom Rules
  - Rate Limiting Rules UI/CRUD
  - HSTS editor
  - Trace/Log Explorer integration
  - Auto rollback

## Query Params Contract (Frontend)
- Allowed state params:
  - zone
  - kind
  - tab
  - modal
  - edit
  - job
  - change
- Forbidden in URL:
  - token
  - secrets
  - raw form drafts containing credentials
  - before/after snapshots

## Error Envelope Contract (Backend -> Frontend)
All API errors should normalize to:

```json
{
  "code": "string",
  "detail": "string",
  "retryable": false,
  "retryAfter": 0,
  "requiredPermission": "string or null",
  "planRequirement": "string or null",
  "cf": {
    "status": 0,
    "errors": [
      { "code": 0, "message": "string" }
    ]
  }
}
```

Notes:
- `retryAfter` is in seconds.
- `requiredPermission` and `planRequirement` are optional hints.
- `cf` can be null for non-Cloudflare failures.

## Capability Response Contract
`GET /api/cf/capabilities` returns:

```json
{
  "token": {
    "valid": true,
    "authType": "apiToken",
    "accountId": "string"
  },
  "zone": {
    "id": "string",
    "plan": "free"
  },
  "features": {
    "dns": {
      "state": "available",
      "requiredPermission": "DNS Write",
      "reason": null
    },
    "cachePurge": {
      "state": "forbidden",
      "requiredPermission": "Cache Purge",
      "reason": "missing permission"
    }
  }
}
```

Feature states:
- available
- forbidden
- plan_limited
- unavailable
- unknown

## Change History Contract
Core entities:
- ChangeSet
- ChangeItem

`GET /api/changes/:id` (shape):

```json
{
  "id": "string",
  "ownerId": "string",
  "accountId": "string",
  "zoneId": "string",
  "action": "dns.update",
  "status": "done",
  "reversible": true,
  "jobId": "string or null",
  "items": [
    {
      "resourceType": "dns_record",
      "resourceId": "string",
      "before": {},
      "after": {},
      "status": "done",
      "error": null
    }
  ]
}
```

Rollback endpoints:
- `POST /api/changes/:id/rollback-preview`
- `POST /api/changes/:id/rollback`

## Modern Rules CRUD Contract (R2)
Base path:
- `/api/rules/:zoneId/:kind`

Where `kind` is one of:
- redirect
- cache
- configuration

Operations:
- `GET /api/rules/:zoneId/:kind`
- `POST /api/rules/:zoneId/:kind`
- `PUT /api/rules/:zoneId/:kind/:ruleId`
- `DELETE /api/rules/:zoneId/:kind/:ruleId`
- `POST /api/rules/:zoneId/:kind/reorder`

List response includes:
- rules
- quota
- warnings

Rule minimum shape:

```json
{
  "id": "string",
  "enabled": true,
  "description": "string",
  "expression": "string",
  "action": "string",
  "actionParameters": {},
  "position": 1,
  "version": "string"
}
```

## Legacy Page Rules Policy
- Existing endpoints remain operational.
- Responses should include deprecation metadata.
- Frontend must render as Legacy Page Rules, not primary Rules feature.

## Baseline Verification Checklist (must pass before feature merge)
- Frontend:
  - npm run build
  - npm test -- --run
- Backend:
  - npm test -- --run
  - npx tsc --noEmit

## Security Constraints
- No token or credential in logs, audit metadata, URL params, snapshots.
- All change and rollback endpoints must enforce owner/account scoping.
- Destructive operations require explicit confirmation signals at UI level.
