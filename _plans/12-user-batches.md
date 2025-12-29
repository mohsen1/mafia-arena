# Implementation Plan: User Batch Creation & Management

## Overview

Enable non-admin users to create and manage batch game runs using their own API keys. This democratizes access to batch processing while maintaining safety through strict limits and enforced user key requirements.

Currently, batch creation is admin-only via `/api/admin/batches` protected by `adminAuthMiddleware`. Users can store API keys but cannot use them for batch games. This plan outlines how to safely expose batch functionality to authenticated users.

## Research Summary

Key findings from codebase analysis:

### Current Architecture
- **Admin batch routes**: `src/worker/routes/admin.ts` - all batch endpoints protected by `adminAuthMiddleware`
- **Batch service**: `src/worker/batch/service.ts` - `createBatch()`, `processBatchMessage()`, `MAX_BATCH_SIZE` (10,000)
- **User keys system**: `src/worker/routes/keys.ts` - users can store encrypted API keys, `getUserApiKeys()` function available
- **Workflow support**: `MafiaWorkflow.ts` accepts `encryptedUserKeys` param but batch system doesn't pass it

### The Gap
The `BatchConfig` and `GameQueueMessage` types do not carry user key information. When `processBatchMessage` splits a batch into individual games, it doesn't inject user keys into each game message.

### Safety Concerns
1. **Cost risk**: Users could drain system keys if not forced to use their own
2. **Resource abuse**: Large batches could flood queues
3. **Rate limiting**: Only basic IP-based rate limit exists (1 batch per 5 mins)

### Files Explored
| File | Purpose |
|------|---------|
| `src/worker/routes/admin.ts` | Current admin-only batch routes |
| `src/worker/batch/service.ts` | Batch creation and processing logic |
| `src/worker/routes/keys.ts` | User API key management, `getUserApiKeys()` |
| `src/worker/types.ts` | `BatchConfig`, `GameQueueMessage` types |
| `src/worker/workflows/MafiaWorkflow.ts` | Supports `encryptedUserKeys` param |
| `frontend/app/routes/admin/batches/new.tsx` | Admin batch creation UI |
| `frontend/app/routes/admin/batches/index.tsx` | Admin batch list UI |

### Existing Patterns to Follow
- Session-based auth via `getSession()` from `routes/auth.ts`
- User key retrieval via `getUserApiKeys()` from `routes/keys.ts`
- Encrypted key passing via `encryptedUserKeys` in workflow params

## Approach Selection

### Option A: Parallel User Routes (Chosen)
**Description:** Create separate `/api/batches` routes for users alongside existing `/api/admin/batches` admin routes.

**Pros:**
- Clean separation of admin vs user functionality
- Can apply different limits/validation per route set
- No risk of breaking existing admin functionality
- Gradual rollout possible

**Cons:**
- Some code duplication between admin and user batch routes
- Two code paths to maintain

**Effort:** Medium

### Option B: Unified Routes with Role-Based Logic
**Description:** Modify existing admin routes to check user role and apply different limits/rules.

**Pros:**
- Single code path
- DRY principle

**Cons:**
- Complex conditional logic
- Risk of breaking admin functionality
- Harder to reason about permissions

**Effort:** Medium-High

### Chosen Approach: Option A

**Reasoning:** Clean separation provides better security, easier maintenance, and allows different configurations per user type. Admin routes remain untouched, reducing risk. User routes can have stricter limits without affecting admin workflows.

## Implementation Steps

### Phase 1: Backend Infrastructure

---

### Step 1.1: Update Types for User Key Propagation

**File(s):** `src/worker/types.ts`

**Description:**
Add `userId` and `encryptedUserKeys` fields to `BatchConfig` and `GameQueueMessage` types to enable passing user credentials through the queue system.

**Code Changes:**
```typescript
// In BatchConfig interface
export interface BatchConfig {
  name?: string;
  totalGames: number;
  gameConfig: {
    // ... existing fields
  };
  useBatchAPI?: boolean;
  // NEW: User context for non-admin batches
  userId?: string;
  encryptedUserKeys?: EncryptedUserKeys;
}

// In GameQueueMessage interface
export interface GameQueueMessage {
  gameId: string;
  config: GameConfig;
  traceId: string;
  batchId?: string;
  // NEW: User keys for the game
  encryptedUserKeys?: EncryptedUserKeys;
}

// NEW: Type for encrypted keys
export interface EncryptedUserKeys {
  [provider: string]: {
    encrypted: string;
    iv: string;
  };
}
```

**Acceptance Criteria:**
- [ ] Types compile without errors
- [ ] Existing code still works (fields are optional)

**Verification:**
```bash
timeout 30s pnpm typecheck
```

---

### Step 1.2: Update Batch Service to Propagate User Keys

**File(s):** `src/worker/batch/service.ts`

**Description:**
Modify `createBatch()` to store user context and `processBatchMessage()` to inject user keys into each game message.

**Code Changes:**
```typescript
// In createBatch() - store userId in batch record
const batchRecord = {
  // ... existing fields
  created_by: config.userId || 'admin',
};

// In processBatchMessage() - pass keys to game messages
const gameMessage: GameQueueMessage = {
  gameId,
  config: gameConfig,
  traceId,
  batchId: batch.id,
  // NEW: Forward user keys from batch config
  encryptedUserKeys: batchConfig.encryptedUserKeys,
};
```

**Acceptance Criteria:**
- [ ] User keys are stored with batch
- [ ] User keys are forwarded to each game message
- [ ] Admin batches still work without user keys

**Verification:**
```bash
timeout 60s pnpm test -- --grep "batch"
```

---

### Step 1.3: Create User Batch Routes

**File(s):** `src/worker/routes/batches.ts` (new file)

**Description:**
Create new routes for user batch management with appropriate limits and key validation.

**Code Changes:**
```typescript
/**
 * User Batch API routes (authenticated users with their own keys).
 */
import { Hono } from 'hono';
import type { Env, BatchConfig } from '../types.js';
import { getSession } from './auth.js';
import { getUserApiKeys, PROVIDER_TO_ENV_KEY } from './keys.js';
import { createBatch, getBatch, listBatches, cancelBatch, estimateCost } from '../batch/index.js';
import { Errors } from '../utils/index.js';

const batches = new Hono<{ Bindings: Env }>();

// User batch limits (much stricter than admin)
const USER_MAX_BATCH_SIZE = 50;
const USER_MAX_ACTIVE_BATCHES = 3;
const USER_RATE_LIMIT_MINUTES = 10;

// Session auth middleware
batches.use('*', async (c, next) => {
  const session = await getSession(c.req.raw, c.env);
  if (!session) {
    throw Errors.Unauthorized('Authentication required');
  }
  c.set('session', session);
  return next();
});

/**
 * POST /api/batches - Create a user batch.
 * REQUIRES: User must have API keys for all providers used.
 */
batches.post('/', async (c) => {
  const session = c.get('session');
  const userId = session.userId;
  
  // ... validation
  
  // CRITICAL: Fetch and validate user has required API keys
  const userKeys = await getUserApiKeys(userId, undefined, c.env);
  if (userKeys.size === 0) {
    throw Errors.BadRequest('You must add API keys before creating batches. Go to Account → API Keys.');
  }
  
  // Encrypt keys for queue transport
  const encryptedUserKeys = await encryptUserKeysForQueue(userKeys, c.env);
  
  // Create batch with user context
  const batchConfig: BatchConfig = {
    // ... config
    userId,
    encryptedUserKeys,
  };
  
  const result = await createBatch(c.env, batchConfig);
  return c.json({ success: true, batchId: result.batchId });
});

// GET /api/batches - List user's batches only
// GET /api/batches/:id - Get user's batch details
// POST /api/batches/:id/cancel - Cancel user's batch
// POST /api/estimate - Cost estimate (no auth needed?)

export default batches;
```

**Acceptance Criteria:**
- [ ] Users can only see their own batches
- [ ] Batch creation requires valid API keys
- [ ] User batches limited to 50 games max
- [ ] Rate limiting: 1 batch per 10 minutes per user

**Verification:**
```bash
timeout 60s pnpm test -- --grep "user batch"
```

---

### Step 1.4: Register User Batch Routes

**File(s):** `src/worker/index.ts`

**Description:**
Mount the new user batch routes alongside existing admin routes.

**Code Changes:**
```typescript
import batches from './routes/batches.js';

// Mount user batch routes
app.route('/api/batches', batches);

// Existing admin routes remain unchanged
app.route('/api/admin', admin);
```

**Acceptance Criteria:**
- [ ] `/api/batches` endpoints accessible to authenticated users
- [ ] `/api/admin/batches` endpoints still admin-only

**Verification:**
```bash
timeout 30s pnpm typecheck
```

---

### Phase 2: Frontend Components

---

### Step 2.1: Create Shared Batch Components

**File(s):** `frontend/app/components/batch/` (new directory)

**Description:**
Extract reusable batch UI components from admin pages to enable sharing between admin and user batch interfaces.

**Files to create:**
- `BatchList.tsx` - Table/list of batches with progress
- `BatchProgress.tsx` - Progress bar component
- `BatchCard.tsx` - Single batch card with status
- `BatchEstimate.tsx` - Cost estimate display
- `NewBatchForm.tsx` - Batch creation form

**Code Changes:**
```typescript
// frontend/app/components/batch/BatchList.tsx
interface BatchListProps {
  batches: Batch[];
  isAdmin?: boolean;
  onCancel?: (batchId: string) => void;
}

export function BatchList({ batches, isAdmin, onCancel }: BatchListProps) {
  return (
    <div className="space-y-4">
      {batches.map(batch => (
        <BatchCard 
          key={batch.id} 
          batch={batch} 
          isAdmin={isAdmin}
          onCancel={onCancel}
        />
      ))}
    </div>
  );
}
```

**Acceptance Criteria:**
- [ ] Components work for both admin and user contexts
- [ ] Admin-only actions (like system pause) only shown for admins
- [ ] Styling consistent with existing UI

**Verification:**
```bash
cd frontend && timeout 30s pnpm typecheck
```

---

### Step 2.2: Create User Batches Page

**File(s):** `frontend/app/routes/batches/index.tsx` (new file)

**Description:**
Create a public batches page for authenticated users to view and manage their batches.

**Code Changes:**
```typescript
// frontend/app/routes/batches/index.tsx
import { useAuth } from "~/contexts/auth";
import { BatchList } from "~/components/batch/BatchList";

export default function UserBatches() {
  const { authenticated, loading } = useAuth();
  
  if (!authenticated) {
    return <LoginPrompt />;
  }
  
  // Fetch from /api/batches (user's batches only)
  // ...
  
  return (
    <div>
      <h1>My Batches</h1>
      <Link to="/batches/new">Create New Batch</Link>
      <BatchList batches={batches} onCancel={handleCancel} />
    </div>
  );
}
```

**Acceptance Criteria:**
- [ ] Page requires authentication
- [ ] Shows only user's own batches
- [ ] Links to batch creation

**Verification:**
```bash
cd frontend && timeout 30s pnpm typecheck
```

---

### Step 2.3: Create User Batch Creation Page

**File(s):** `frontend/app/routes/batches/new.tsx` (new file)

**Description:**
Batch creation page for users with appropriate limits displayed.

**Code Changes:**
```typescript
// frontend/app/routes/batches/new.tsx
export default function NewUserBatch() {
  const { userKeys } = useUserKeys();
  
  // Check if user has keys
  if (!userKeys || userKeys.length === 0) {
    return (
      <div>
        <h1>API Keys Required</h1>
        <p>You need to add API keys before creating batches.</p>
        <Link to="/account">Go to Account Settings</Link>
      </div>
    );
  }
  
  return (
    <NewBatchForm 
      maxGames={50}  // User limit
      isAdmin={false}
      userKeys={userKeys}
    />
  );
}
```

**Acceptance Criteria:**
- [ ] Requires API keys to be set up
- [ ] Shows user-specific limits (50 games max)
- [ ] Model selection limited to models compatible with user's keys
- [ ] Clear cost estimate before submission

**Verification:**
```bash
cd frontend && timeout 30s pnpm build
```

---

### Step 2.4: Add Navigation Links

**File(s):** `frontend/app/components/Header.tsx`

**Description:**
Add "My Batches" link to the navigation for authenticated users.

**Code Changes:**
```typescript
// In Header.tsx navigation items
{authenticated && (
  <Link to="/batches" className="...">
    My Batches
  </Link>
)}
```

**Acceptance Criteria:**
- [ ] Link visible only when authenticated
- [ ] Links to `/batches` page

---

### Phase 3: Safety & Limits

---

### Step 3.1: Implement User-Specific Rate Limiting

**File(s):** `src/worker/middleware/rateLimit.ts`

**Description:**
Add user-based rate limiting for batch creation (1 per 10 minutes per user).

**Code Changes:**
```typescript
export async function userBatchRateLimitMiddleware(c: Context, next: Next) {
  const session = c.get('session');
  if (!session) {
    throw Errors.Unauthorized();
  }
  
  const key = `user_batch_limit:${session.userId}`;
  const lastCreate = await c.env.RATE_LIMIT.get(key);
  
  if (lastCreate) {
    const elapsed = Date.now() - parseInt(lastCreate, 10);
    const remaining = USER_RATE_LIMIT_MS - elapsed;
    if (remaining > 0) {
      throw Errors.TooManyRequests(`Please wait ${Math.ceil(remaining / 60000)} minutes`);
    }
  }
  
  await next();
  
  // Update rate limit timestamp after successful creation
  await c.env.RATE_LIMIT.put(key, Date.now().toString(), {
    expirationTtl: USER_RATE_LIMIT_SECONDS,
  });
}
```

**Acceptance Criteria:**
- [ ] Users limited to 1 batch per 10 minutes
- [ ] Clear error message with time remaining
- [ ] Admins bypass this limit

---

### Step 3.2: Validate User Has Required Provider Keys

**File(s):** `src/worker/routes/batches.ts`

**Description:**
Before creating a batch, validate that the user has API keys for all providers needed by selected models.

**Code Changes:**
```typescript
async function validateUserKeysForModels(
  userId: string,
  modelIds: string[],
  env: Env
): Promise<void> {
  // Get required providers from model IDs
  const requiredProviders = new Set<string>();
  for (const modelId of modelIds) {
    const provider = modelId.split('/')[0]; // e.g., "anthropic/claude-3" -> "anthropic"
    requiredProviders.add(provider);
  }
  
  // Get user's keys
  const userKeys = await getUserApiKeys(userId, undefined, env);
  
  // Check for missing providers
  const missing = [...requiredProviders].filter(p => !userKeys.has(p));
  
  if (missing.length > 0) {
    throw Errors.BadRequest(
      `Missing API keys for: ${missing.join(', ')}. Please add them in Account → API Keys.`
    );
  }
}
```

**Acceptance Criteria:**
- [ ] Batch creation fails with clear message if keys are missing
- [ ] All required provider keys must be present

---

### Step 3.3: Enforce Active Batch Limit

**File(s):** `src/worker/routes/batches.ts`

**Description:**
Limit users to 3 active (queued/processing) batches at a time.

**Code Changes:**
```typescript
async function checkActiveBatchLimit(userId: string, env: Env): Promise<void> {
  const db = createDb(env.DB);
  
  const activeBatches = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.created_by, userId),
        inArray(schema.batches.status, ['queued', 'processing'])
      )
    );
  
  const count = activeBatches[0]?.count ?? 0;
  
  if (count >= USER_MAX_ACTIVE_BATCHES) {
    throw Errors.BadRequest(
      `You have ${count} active batches. Please wait for them to complete (max ${USER_MAX_ACTIVE_BATCHES}).`
    );
  }
}
```

**Acceptance Criteria:**
- [ ] Users limited to 3 active batches
- [ ] Clear error message when limit reached
- [ ] Completed/cancelled batches don't count

---

### Phase 4: Testing & Verification

---

### Step 4.1: Add Unit Tests for User Batch Routes

**File(s):** `src/worker/routes/batches.test.ts` (new file)

**Description:**
Test user batch creation, limits, and key validation.

**Tests to add:**
- Create batch succeeds with valid keys
- Create batch fails without keys
- Create batch fails with missing provider key
- Rate limiting enforced
- Active batch limit enforced
- Users can only see their own batches
- Users can only cancel their own batches

**Verification:**
```bash
timeout 60s pnpm test -- --grep "user batch"
```

---

### Step 4.2: Add E2E Tests

**File(s):** `e2e/ui/batches.spec.ts` (new file)

**Description:**
End-to-end tests for user batch creation flow.

**Tests to add:**
- Unauthenticated user sees login prompt
- User without keys sees key setup prompt
- User with keys can create batch
- User sees their batches only
- Batch creation respects limits

**Verification:**
```bash
timeout 120s pnpm e2e
```

---

## Testing Strategy

### Unit Tests
| Component | Test File | Tests to Add |
|-----------|-----------|--------------|
| User batch routes | `src/worker/routes/batches.test.ts` | Auth, limits, key validation |
| Batch service | `src/worker/batch/service.test.ts` | User key propagation |
| Rate limiting | `src/worker/middleware/rateLimit.test.ts` | User batch limits |

### Integration Tests
- Full batch creation flow with mock keys
- Batch processing with user keys injected

### Manual Testing
1. Create user account and add API keys
2. Create batch with 10 games
3. Watch batch progress in UI
4. Verify games use user's API keys
5. Test rate limiting by creating batches rapidly
6. Verify batch limit with 3 active batches

## Rollback Plan

If something goes wrong:

1. Disable user batch routes by removing from `index.ts`
2. Hide "My Batches" link in Header
3. Admin batch functionality remains unchanged
4. User keys remain available for future use

## Migration Notes

No database migrations needed - reuses existing:
- `batches` table (has `created_by` column)
- `user_api_keys` table
- `games` table

## Open Questions

- [ ] Should users see estimated wait time based on queue depth?
- [ ] Should we show real-time batch cost updates using user's actual key rates?
- [ ] Do we need email notifications when batches complete?
- [ ] Should we add a "pause my batch" feature or only cancel?

## Dependencies

### Must Be Done First
1. Verify user API key system works reliably
2. Ensure encryption works for queue transport

### Can Be Parallelized
- Backend routes (Step 1.3) and Frontend components (Step 2.1) can be done in parallel
- Tests can be written alongside implementation

## Final Verification Checklist

```bash
# Run full verification suite
timeout 60s pnpm typecheck && \
timeout 30s pnpm lint && \
timeout 60s pnpm test
```

- [ ] All tests pass
- [ ] Type check passes
- [ ] Lint passes
- [ ] Manual testing completed
- [ ] Documentation updated (if needed)
- [ ] Ready for commit

## Summary of Changes

### New Files
| File | Purpose |
|------|---------|
| `src/worker/routes/batches.ts` | User batch API routes |
| `frontend/app/routes/batches/index.tsx` | User batch list page |
| `frontend/app/routes/batches/new.tsx` | User batch creation page |
| `frontend/app/routes/batches/$id.tsx` | User batch detail page |
| `frontend/app/components/batch/BatchList.tsx` | Shared batch list component |
| `frontend/app/components/batch/BatchCard.tsx` | Shared batch card component |
| `frontend/app/components/batch/NewBatchForm.tsx` | Shared batch creation form |

### Modified Files
| File | Changes |
|------|---------|
| `src/worker/types.ts` | Add `encryptedUserKeys` to types |
| `src/worker/batch/service.ts` | Propagate user keys through queue |
| `src/worker/index.ts` | Mount user batch routes |
| `src/worker/middleware/rateLimit.ts` | Add user batch rate limiting |
| `frontend/app/components/Header.tsx` | Add "My Batches" link |

### User Limits vs Admin

| Limit | Users | Admins |
|-------|-------|--------|
| Max games per batch | 50 | 10,000 |
| Max active batches | 3 | Unlimited |
| Rate limit | 1 per 10 min | 1 per 5 min |
| API keys required | Yes (own keys) | No (system keys) |
| Can pause system | No | Yes |

