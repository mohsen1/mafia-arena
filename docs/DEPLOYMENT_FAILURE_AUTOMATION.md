# Deployment Failure Automation

This document describes the automated systems in place to handle deployment failures for Werewolf AI.

## Overview

The deployment failure automation consists of:

1. **Vercel Deployment Monitor** - Monitors deployment status and creates issues
2. **Deployment Failure Notifier** - Responds to deployment status webhooks
3. **Deployment Recovery Script** - Diagnoses and helps fix common issues
4. **CI Build Script** - Handles build process with proper error handling

## Components

### 1. Vercel Deployment Monitor

**File:** `.github/workflows/vercel-deployment-monitor.yml`

**Features:**
- Runs on push to main, PRs, and daily schedule
- Checks latest deployment status using Vercel CLI
- Creates GitHub issues for failures
- Updates existing issues with new failures
- Automatically closes issues when deployments succeed

**Required Secrets:**
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

### 2. Deployment Failure Notifier

**File:** `.github/workflows/deployment-failure-notifier.yml`

**Features:**
- Triggered by GitHub deployment status webhooks
- Analyzes failure patterns and categorizes issues
- Creates detailed issue reports with:
  - Failure category (database, build, memory, timeout)
  - Priority level
  - Suggested fixes
  - Troubleshooting steps
  - Recovery instructions

**Categories:**
- **Database**: Issues with DATABASE_URL or connections
- **Build**: TypeScript or compilation errors
- **Memory**: Heap or memory limit issues
- **Timeout**: Build process taking too long
- **Unknown**: Other unclassified errors

### 3. Deployment Recovery Script

**File:** `scripts/deployment-recovery.sh`

**Usage:**
```bash
# Full diagnostic check including build
pnpm run deploy:check

# Quick check without building
pnpm run deploy:recover

# Complete deployment diagnostics
pnpm run deploy:diagnose
```

**Checks:**
1. Prerequisites (Node.js, pnpm)
2. Environment variables
3. Dependencies installation
4. TypeScript compilation
5. Linting
6. Database connectivity
7. Build process
8. Common fixes and suggestions

### 4. CI Build Script

**File:** `scripts/ci-build.sh`

**Features:**
- Detects Vercel environment and skips database operations
- Handles errors gracefully
- Provides clear error messages
- Continues build even if migrations fail

## Automated Issue Creation

When a deployment fails, the system creates a GitHub issue with:

### Issue Title Format
```
🚨 Deployment Failure [category] - environment
```

### Issue Content
- Deployment details (ID, URL, commit, author)
- Error message and category
- Suggested fixes
- Quick action links
- Troubleshooting checklist
- Recovery steps

### Labels Applied
- `deployment-failure`
- `automated`
- Category label (e.g., `database`, `build`)
- Priority label (e.g., `priority:high`)

## Common Deployment Failures

### 1. Database Connection Errors

**Symptoms:**
- "DATABASE_URL environment variable is missing"
- "Failed to connect to the database"
- Connection timeout errors

**Automated Response:**
- Issue created with database category
- High priority assigned
- Suggested fixes include checking DATABASE_URL format

**Manual Recovery:**
```bash
# Check database connectivity
pnpm run check-db

# Verify DATABASE_URL format
echo $DATABASE_URL | grep -q "sslmode=require"
```

### 2. Build Errors

**Symptoms:**
- TypeScript compilation errors
- Module not found errors
- Syntax errors

**Automated Response:**
- Issue created with build category
- High priority assigned
- Links to failing commit

**Manual Recovery:**
```bash
# Check TypeScript
pnpm tsc

# Check linting
pnpm lint

# Test build locally
pnpm run build:ci
```

### 3. Memory Issues

**Symptoms:**
- "JavaScript heap out of memory"
- Build process killed

**Automated Response:**
- Issue created with memory category
- Medium priority assigned
- Suggests contacting Vercel support

**Manual Recovery:**
- Contact Vercel support for memory limit increase
- Optimize build process
- Use `NODE_OPTIONS=--max-old-space-size=4096`

### 4. Timeout Issues

**Symptoms:**
- Build exceeds time limit
- Deployment timeout

**Automated Response:**
- Issue created with timeout category
- Medium priority assigned

**Manual Recovery:**
- Optimize build process
- Check for slow dependencies
- Consider build caching

## Setting Up Automation

### 1. GitHub Repository Secrets

Add these secrets to your repository:

```bash
# Get from Vercel dashboard
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

### 2. Enable GitHub Actions

Ensure Actions are enabled in your repository settings.

### 3. Configure Webhooks

The deployment status webhook is automatically configured when you connect Vercel to GitHub.

## Manual Intervention

### Running Recovery Script Locally

```bash
# Clone the repository
git clone https://github.com/mohsen1/werewolf-ai.git
cd werewolf-ai

# Install dependencies
pnpm install

# Run recovery script
./scripts/deployment-recovery.sh
```

### Clearing Vercel Cache

1. Go to Vercel Dashboard
2. Select your project
3. Go to Settings > General
4. Click "Clear Build Cache"
5. Trigger a new deployment

### Force Redeployment

```bash
# Using Vercel CLI
vercel --prod --force

# Or from GitHub
# Push an empty commit
git commit --allow-empty -m "Force redeployment"
git push
```

## Monitoring and Alerts

### Daily Health Checks

The Vercel Deployment Monitor runs daily at 9 AM UTC to check deployment health.

### Real-time Notifications

Deployment failures trigger immediate issue creation, which sends notifications to:
- Repository watchers
- Issue assignees
- Team members subscribed to deployment-failure label

### Status Page

Check deployment status at:
- Vercel Dashboard: https://vercel.com/[your-org]/[your-project]
- GitHub Actions: https://github.com/[your-org]/[your-repo]/actions

## Best Practices

1. **Always test locally first**
   ```bash
   pnpm run deploy:check
   ```

2. **Monitor environment variables**
   - Keep them in sync between local and Vercel
   - Use different values for preview/production

3. **Review automated issues**
   - Check for patterns in failures
   - Update automation rules based on new failure types

4. **Keep dependencies updated**
   - Regular updates prevent compatibility issues
   - Test updates in preview deployments first

5. **Use preview deployments**
   - Test changes before merging to main
   - Catch issues early

## Troubleshooting Automation

### Workflow Not Triggering

1. Check workflow syntax:
   ```bash
   # Validate YAML
   yamllint .github/workflows/*.yml
   ```

2. Check permissions:
   - Repository settings > Actions > General
   - Ensure workflows have write permissions

3. Check secrets:
   - All required secrets must be set
   - Secrets are case-sensitive

### Issues Not Being Created

1. Check GitHub API limits
2. Verify issue creation permissions
3. Check for existing open issues (automation avoids duplicates)

### False Positives

If the automation creates issues for non-failures:
1. Check deployment status detection logic
2. Verify Vercel API responses
3. Update failure pattern matching

## Contributing to Automation

To improve the deployment failure automation:

1. **Add new failure patterns**
   - Edit failure analysis in workflows
   - Add new categories and priorities

2. **Enhance recovery script**
   - Add new diagnostic checks
   - Improve fix suggestions

3. **Update documentation**
   - Document new failure types
   - Add recovery procedures

## Support

For help with deployment failures:

1. Check automated issues for similar problems
2. Run the recovery script
3. Review this documentation
4. Open a new issue if needed
5. Contact Vercel support for platform issues 