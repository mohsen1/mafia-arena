# Error Handling Test Plan

## Overview

This document outlines how to test the comprehensive error handling system implemented in the werewolf-ai application.

## Testing Strategies

### 1. Manual Testing with React DevTools

React DevTools provides a feature to force components into error states:

1. Install React Developer Tools Chrome extension
2. Open the app in Chrome and open DevTools
3. Navigate to the "Components" tab
4. Select any component in the tree
5. Click the (!) icon to force an error state
6. Verify the error boundary displays correctly

### 2. Testing Different Error Types

#### AI Provider Errors

**Test Authentication Error:**
1. Go to Profile page
2. Add an API key with invalid credentials (e.g., "invalid-key-123")
3. Try to start a game with that provider
4. Verify error message: "Invalid API key for [Provider]. Please check your settings."
5. Verify "Go to Settings" button appears

**Test Rate Limit Error:**
1. Create multiple games rapidly with the same API key
2. Verify error message: "Too many requests. Please wait a moment and try again."
3. Verify "Try Again" button appears and is functional

**Test Model Not Found:**
1. Select a provider and manually enter a non-existent model name
2. Start a game
3. Verify error message: "The AI model "[model]" is not available. Please select a different model."

#### Game Engine Errors

**Test Character Generation Failure:**
1. Start a new game
2. During character generation, force an error using DevTools
3. Verify error message: "Failed to generate characters. Please try again."
4. Verify retry functionality works

**Test Game Not Found:**
1. Navigate to a non-existent game URL (e.g., `/en/game/invalid-game-id`)
2. Verify error message: "Game not found. It may have been deleted."
3. Verify "Start New Game" button appears

#### Network Errors

**Test Connection Error:**
1. Disable network connection
2. Try to perform any action that requires API calls
3. Verify error message: "Network connection error. Please check your internet connection."
4. Re-enable network and verify "Try Again" works

### 3. Error Boundary Testing

**Test Component Tree Isolation:**
1. Force an error in a specific component (e.g., PlayerCard)
2. Verify only that component shows error UI
3. Verify rest of the app remains functional

**Test Error Recovery:**
1. Trigger an error in any component
2. Click "Try Again" or navigate away
3. Verify component recovers properly

### 4. Development vs Production

**Development Mode:**
1. Trigger any error
2. Verify technical error details are shown
3. Verify "Debug Information" section appears with context

**Production Mode:**
1. Build app with `pnpm build`
2. Run production build
3. Trigger errors
4. Verify only user-friendly messages are shown
5. Verify no technical details leak

### 5. API Key Testing

**Test API Key Validation:**
1. Go to Profile > API Keys
2. Click "Test Connection" for each provider
3. Verify success/failure messages
4. Test with both valid and invalid keys

### 6. Error Logging

**Console Verification:**
1. Open browser console
2. Trigger various errors
3. Verify structured error logs appear
4. Check format: `[Context] Error: {details}`

### 7. Accessibility Testing

**Screen Reader Testing:**
1. Use a screen reader
2. Trigger an error
3. Verify error message is announced
4. Verify action buttons are accessible

**Keyboard Navigation:**
1. Trigger an error
2. Use Tab key to navigate
3. Verify all buttons are reachable
4. Verify Enter/Space activate buttons

## Automated Testing

### Unit Tests

```typescript
// Example test for GameError
describe('GameError', () => {
  it('should create error with correct properties', () => {
    const error = GameErrors.aiAuthentication('OpenAI');
    expect(error.code).toBe(ErrorCode.AI_AUTHENTICATION);
    expect(error.userMessage).toContain('Invalid API key');
    expect(error.retryable).toBe(false);
  });
});

// Example test for ErrorBoundary
describe('ErrorBoundary', () => {
  it('should catch and display errors', () => {
    const ThrowError = () => {
      throw new Error('Test error');
    };
    
    const { getByText } = render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );
    
    expect(getByText(/Something went wrong/)).toBeInTheDocument();
  });
});
```

### E2E Tests

```typescript
// Example Playwright test
test('should handle API authentication error gracefully', async ({ page }) => {
  // Navigate to game creation
  await page.goto('/en/new');
  
  // Select provider with invalid key
  await page.selectOption('[data-testid="provider-select"]', 'openai');
  
  // Start game
  await page.click('[data-testid="start-game-button"]');
  
  // Verify error display
  await expect(page.locator('text=Invalid API key')).toBeVisible();
  await expect(page.locator('text=Go to Settings')).toBeVisible();
});
```

## Error Scenarios Checklist

- [ ] AI Authentication Error
- [ ] AI Rate Limit Error
- [ ] AI Timeout Error
- [ ] AI Model Not Found
- [ ] AI Context Length Exceeded
- [ ] AI Safety Filter Triggered
- [ ] Game Not Found
- [ ] Character Generation Failed
- [ ] Database Connection Error
- [ ] Network Connection Error
- [ ] Validation Errors
- [ ] Unauthorized Access
- [ ] Unknown/Unexpected Errors

## Success Criteria

1. **User Experience**
   - Users never see blank pages
   - Error messages are clear and actionable
   - Recovery options are always available

2. **Developer Experience**
   - Errors are properly logged with context
   - Stack traces available in development
   - Easy to debug issues

3. **Reliability**
   - Errors don't cascade
   - App remains functional despite errors
   - Graceful degradation

4. **Performance**
   - Error handling doesn't impact performance
   - No memory leaks from error states
   - Quick recovery times

## Notes

- Always test with both authenticated and unauthenticated users
- Test on different browsers and devices
- Verify translations work for all error messages
- Check that error states don't persist incorrectly
- Ensure sensitive information is never exposed 