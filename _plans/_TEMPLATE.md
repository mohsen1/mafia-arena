# Implementation Plan: [Feature Name]

> Copy this template to a new file: `_plans/[feature-name].md`

## Overview

One-paragraph summary of what we're building and why.

## Research Summary

Key findings from the research phase:
- Finding 1
- Finding 2
- Finding 3

### Files Explored
| File | Purpose |
|------|---------|
| `path/to/file1.ts` | Description |
| `path/to/file2.ts` | Description |

### Existing Patterns to Follow
- Pattern 1
- Pattern 2

## Approach Selection

### Option A: [Name]
**Description:** Brief description of this approach

**Pros:**
- Pro 1
- Pro 2

**Cons:**
- Con 1
- Con 2

**Effort:** Low/Medium/High

### Option B: [Name]
**Description:** Brief description of this approach

**Pros:**
- Pro 1
- Pro 2

**Cons:**
- Con 1
- Con 2

**Effort:** Low/Medium/High

### Chosen Approach: [Option X]

**Reasoning:** Why this approach was selected over the alternatives.

## Implementation Steps

### Step 1: [Title]

**File(s):** `path/to/file.ts`

**Description:**
What to implement in this step.

**Code Changes:**
```typescript
// Example of the change
```

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2

**Verification:**
```bash
timeout 30s pnpm test -- -t "relevant test"
```

---

### Step 2: [Title]

**File(s):** `path/to/file.ts`

**Description:**
What to implement in this step.

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2

**Verification:**
```bash
timeout 30s pnpm test -- -t "relevant test"
```

---

### Step 3: [Title]

**File(s):** `path/to/file.ts`

**Description:**
What to implement in this step.

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2

**Verification:**
```bash
timeout 30s pnpm test -- -t "relevant test"
```

---

## Testing Strategy

### Unit Tests
| Component | Test File | Tests to Add |
|-----------|-----------|--------------|
| Component1 | `src/.../*.test.ts` | Test description |
| Component2 | `src/.../*.test.ts` | Test description |

### Integration Tests
- Test scenario 1
- Test scenario 2

### Manual Testing
1. Step 1
2. Step 2
3. Expected result

## Rollback Plan

If something goes wrong:
1. Revert step 1
2. Revert step 2
3. Verify system is back to working state

## Migration Notes

If this affects existing data or requires migration:
- Migration step 1
- Migration step 2

## Open Questions

Questions that need answers during implementation:
- [ ] Question 1?
- [ ] Question 2?

## Dependencies

### Must Be Done First
- Dependency 1
- Dependency 2

### Can Be Parallelized
- Task A
- Task B

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



