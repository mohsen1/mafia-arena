import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

test.describe('Deployment Monitoring', () => {
  test('should have valid deployment monitor workflow', () => {
    const workflowPath = path.join(process.cwd(), '.github/workflows/vercel-deployment-monitor.yml');
    
    // Check if workflow file exists
    expect(fs.existsSync(workflowPath)).toBeTruthy();
    
    // Read and parse the workflow
    const workflowContent = fs.readFileSync(workflowPath, 'utf8');
    const workflow = yaml.load(workflowContent) as any;
    
    // Verify workflow structure
    expect(workflow.name).toBe('Vercel Deployment Monitor');
    expect(workflow.on).toBeDefined();
    expect(workflow.on.push).toBeDefined();
    expect(workflow.on.pull_request).toBeDefined();
    expect(workflow.on.workflow_dispatch).toBeDefined();
    expect(workflow.on.schedule).toBeDefined();
    
    // Verify required environment variables
    expect(workflow.env.VERCEL_TOKEN).toBe('${{ secrets.VERCEL_TOKEN }}');
    expect(workflow.env.VERCEL_ORG_ID).toBe('${{ secrets.VERCEL_ORG_ID }}');
    expect(workflow.env.VERCEL_PROJECT_ID).toBe('${{ secrets.VERCEL_PROJECT_ID }}');
    
    // Verify job structure
    expect(workflow.jobs['monitor-deployment']).toBeDefined();
    const job = workflow.jobs['monitor-deployment'];
    expect(job.steps).toBeDefined();
    expect(job.steps.length).toBeGreaterThan(0);
    
    // Verify critical steps exist
    const stepNames = job.steps.map((step: any) => step.name);
    expect(stepNames).toContain('Check required secrets');
    expect(stepNames).toContain('Get latest deployment status');
    expect(stepNames).toContain('Create GitHub issue for deployment failure');
    expect(stepNames).toContain('Close resolved deployment issues');
  });

  test('should have valid CI build script', () => {
    const scriptPath = path.join(process.cwd(), 'scripts/ci-build.sh');
    
    // Check if script exists
    expect(fs.existsSync(scriptPath)).toBeTruthy();
    
    // Check if script is executable
    const stats = fs.statSync(scriptPath);
    expect(stats.mode & 0o111).toBeTruthy(); // Check for execute permission
    
    // Read script content
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    
    // Verify script has proper shebang
    expect(scriptContent.startsWith('#!/bin/bash')).toBeTruthy();
    
    // Verify script has error handling
    expect(scriptContent).toContain('set -e');
    expect(scriptContent).toContain('handle_error');
    
    // Verify Vercel-specific handling
    expect(scriptContent).toContain('if [ "$VERCEL" = "1" ]');
    expect(scriptContent).toContain('Skipping database operations during build');
    
    // Verify build command
    expect(scriptContent).toContain('pnpm run build');
  });

  test('should have valid Vercel configuration', () => {
    const configPath = path.join(process.cwd(), 'vercel.json');
    
    // Check if config exists
    expect(fs.existsSync(configPath)).toBeTruthy();
    
    // Read and parse config
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    // Verify configuration
    expect(config.buildCommand).toBe('pnpm run build:ci');
    expect(config.env).toBeDefined();
    expect(config.env.NODE_ENV).toBe('production');
    expect(config.build).toBeDefined();
    expect(config.build.env).toBeDefined();
    expect(config.build.env.CI).toBe('true');
  });

  test('should handle deployment failures correctly', () => {
    // This test verifies the failure handling logic
    const workflowPath = path.join(process.cwd(), '.github/workflows/vercel-deployment-monitor.yml');
    const workflowContent = fs.readFileSync(workflowPath, 'utf8');
    
    // Check for failure detection
    expect(workflowContent).toContain('ERROR');
    expect(workflowContent).toContain('FAILED');
    
    // Check for issue creation
    expect(workflowContent).toContain('github.rest.issues.create');
    expect(workflowContent).toContain('deployment-failure');
    expect(workflowContent).toContain('automated');
    
    // Check for issue update logic
    expect(workflowContent).toContain('github.rest.issues.createComment');
    expect(workflowContent).toContain('New Deployment Failure Detected');
    
    // Check for issue closure on success
    expect(workflowContent).toContain('Deployment Resolved');
    expect(workflowContent).toContain('state: \'closed\'');
  });

  test('should include comprehensive error details', () => {
    const workflowPath = path.join(process.cwd(), '.github/workflows/vercel-deployment-monitor.yml');
    const workflowContent = fs.readFileSync(workflowPath, 'utf8');
    
    // Check for detailed error reporting
    expect(workflowContent).toContain('vercel inspect');
    expect(workflowContent).toContain('vercel logs');
    expect(workflowContent).toContain('Deployment Details');
    expect(workflowContent).toContain('Recent Deployment Logs');
    expect(workflowContent).toContain('Possible Causes');
    expect(workflowContent).toContain('Troubleshooting Steps');
  });

  test('should run database checks in non-Vercel environments', () => {
    const scriptPath = path.join(process.cwd(), 'scripts/ci-build.sh');
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    
    // Verify database operations
    expect(scriptContent).toContain('pnpm run check-db');
    expect(scriptContent).toContain('pnpm run db:migrate');
    expect(scriptContent).toContain('pnpm run db:push');
    
    // Verify graceful failure handling
    expect(scriptContent).toContain('Migration failed, but this might be expected');
    expect(scriptContent).toContain('Schema push failed, but continuing with build');
  });

  test('should have proper schedule configuration', () => {
    const workflowPath = path.join(process.cwd(), '.github/workflows/vercel-deployment-monitor.yml');
    const workflowContent = fs.readFileSync(workflowPath, 'utf8');
    const workflow = yaml.load(workflowContent) as any;
    
    // Check schedule exists
    expect(workflow.on.schedule).toBeDefined();
    expect(workflow.on.schedule[0].cron).toBe('0 9 * * *'); // Daily at 9 AM UTC
  });

  test('should validate package.json build scripts', () => {
    const packagePath = path.join(process.cwd(), 'package.json');
    const packageContent = fs.readFileSync(packagePath, 'utf8');
    const packageJson = JSON.parse(packageContent);
    
    // Verify build scripts
    expect(packageJson.scripts['build:ci']).toBe('./scripts/ci-build.sh');
    expect(packageJson.scripts.build).toBeDefined();
    expect(packageJson.scripts['check-db']).toBeDefined();
    expect(packageJson.scripts['db:migrate']).toBeDefined();
    expect(packageJson.scripts['db:push']).toBeDefined();
  });
}); 