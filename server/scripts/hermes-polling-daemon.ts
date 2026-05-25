#!/usr/bin/env tsx
/**
 * Hermes Polling Daemon - Simplified
 * Auto-detects NEW todo + unassigned issues and triggers CTO run
 */

import { setTimeout } from 'timers/promises';

const PAPERCLIP_URL = process.env.PAPERCLIP_URL || 'http://localhost:3100';
const COMPANY_ID = process.env.COMPANY_ID || '84db1d00-c7ff-46a3-98b9-a50a041bd9a5';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '30000'); // 30 seconds

interface Issue {
  id: string;
  identifier: string;
  title: string;
  status: string;
  assignee_id?: string;
}

async function fetchIssues(): Promise<Issue[]> {
  const res = await fetch(`${PAPERCLIP_URL}/api/companies/${COMPANY_ID}/issues`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function triggerCTO(issueId: string): Promise<void> {
  console.log(`[${new Date().toISOString()}] Triggering CTO for issue ${issueId}`);
  
  // Assign CTO
  const assignRes = await fetch(`${PAPERCLIP_URL}/api/issues/${issueId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assigneeAgentId: 'ed6ba1d6-06b6-4c17-a664-71a7db4dcada' })
  });
  
  if (!assignRes.ok) {
    console.error(`Failed to assign: HTTP ${assignRes.status}`);
    return;
  }
  
  // Start run
  const res = await fetch(`${PAPERCLIP_URL}/api/issues/${issueId}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  
  if (!res.ok) {
    console.error(`Failed to trigger run: HTTP ${res.status}`);
    return;
  }
  
  console.log(`[${new Date().toISOString()}] CTO run started for ${issueId}`);
}

async function fetchRuns(issueId: string): Promise<any[]> {
  try {
    const res = await fetch(`${PAPERCLIP_URL}/api/issues/${issueId}/runs`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function validateTaskCompletion(issue: Issue): Promise<boolean> {
  // Extract expected count from title/description
  const expectedMatch = issue.title.match(/import\s+(\d+)\s+agents?/i) || 
                        issue.title.match(/(\d+)\s+agents?/i);
  const expectedCount = expectedMatch ? parseInt(expectedMatch[1]) : null;
  
  // Check if issue is about agent import
  if (issue.title.toLowerCase().includes('import') && issue.title.toLowerCase().includes('agent')) {
    const runs = await fetchRuns(issue.id);
    const lastRun = runs[runs.length - 1];
    
    if (lastRun && lastRun.output) {
      const output = lastRun.output.toLowerCase();
      
      // Extract actual count from output
      const actualMatch = output.match(/(\d+)\s+agents?\s+imported/) || 
                          output.match(/imported\s+(\d+)\s+agents?/) ||
                          output.match(/(\d+)\s+agents?\s+added/);
      const actualCount = actualMatch ? parseInt(actualMatch[1]) : null;
      
      console.log(`Validation: expected=${expectedCount}, actual=${actualCount}`);
      
      // If we have both expected and actual, compare them
      if (expectedCount && actualCount) {
        return actualCount >= expectedCount * 0.8; // Allow 80% threshold
      }
      
      // Fallback: check for success keywords
      return output.includes('success') || output.includes('complete') || output.includes('imported');
    }
    
    return false;
  }
  
  // For other tasks, check if output contains success indicators
  const runs = await fetchRuns(issue.id);
  const lastRun = runs[runs.length - 1];
  
  if (lastRun && lastRun.output) {
    const output = lastRun.output.toLowerCase();
    return output.includes('success') || output.includes('complete') || output.includes('done');
  }
  
  return false;
}

async function markDone(issueId: string): Promise<void> {
  console.log(`[${new Date().toISOString()}] Marking done: ${issueId}`);
  
  const res = await fetch(`${PAPERCLIP_URL}/api/issues/${issueId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'done' })
  });
  
  if (!res.ok) {
    console.error(`Failed to mark done: HTTP ${res.status}`);
    return;
  }
  
  console.log(`[${new Date().toISOString()}] Marked done: ${issueId}`);
}

async function poll() {
  try {
    const issues = await fetchIssues();
    
    for (const issue of issues) {
      // Case 1: New todo + unassigned → Auto-trigger
      if (issue.status === 'todo' && !issue.assignee_id) {
        console.log(`Found new issue ${issue.identifier}: ${issue.title}`);
        await triggerCTO(issue.id);
      }
      
      // Case 2: in_progress with successful run → Auto-mark done (with validation)
      if (issue.status === 'in_progress' && issue.assignee_id) {
        const runs = await fetchRuns(issue.id);
        const lastRun = runs[runs.length - 1];
        
        if (lastRun && lastRun.status === 'succeeded') {
          // Validate: Check if task actually completed
          const isValid = await validateTaskCompletion(issue);
          
          if (isValid) {
            console.log(`Auto-marking done: ${issue.identifier}`);
            await markDone(issue.id);
          } else {
            console.log(`Task not complete, skipping: ${issue.identifier}`);
          }
        }
      }
      
      // Case 3: blocked with successful run → Don't mark done (manual intervention needed)
      if (issue.status === 'blocked' && issue.assignee_id) {
        console.log(`Issue blocked, manual intervention needed: ${issue.identifier}`);
      }
    }
  } catch (err) {
    console.error('Poll error:', err);
  }
}

async function main() {
  console.log('Hermes Polling Daemon started');
  console.log(`Watching: ${PAPERCLIP_URL}/api/companies/${COMPANY_ID}/issues`);
  console.log(`Trigger: todo + unassigned only`);
  console.log(`Interval: ${POLL_INTERVAL}ms`);
  
  while (true) {
    await poll();
    await setTimeout(POLL_INTERVAL);
  }
}

main().catch(console.error);
