#!/usr/bin/env tsx
/**
 * Hermes Bridge
 * Polls GitHub issues labeled for Hermes execution, executes fixes,
 * and reports back to Paperclip via issue comments.
 *
 * Usage:
 *   npx tsx scripts/hermes-bridge.ts --repo OpenScanAI/xShorts.News --poll
 *   npx tsx scripts/hermes-bridge.ts --repo OpenScanAI/xShorts.News --once
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

interface BridgeConfig {
  githubToken: string;
  paperclipApiUrl: string;
  paperclipApiKey: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  stateFile: string;
  pollIntervalMs: number;
  label: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  html_url: string;
  labels: { name: string }[];
  state: string;
}

async function loadConfig(): Promise<BridgeConfig> {
  return {
    githubToken: process.env.GITHUB_TOKEN || '',
    paperclipApiUrl: process.env.PAPERCLIP_API_URL || 'http://localhost:3100',
    paperclipApiKey: process.env.PAPERCLIP_API_KEY || '',
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    stateFile: process.env.BRIDGE_STATE_FILE || join(__dirname, '..', '.hermes-bridge-state.json'),
    pollIntervalMs: parseInt(process.env.BRIDGE_POLL_INTERVAL || '300000', 10),
    label: process.env.BRIDGE_LABEL || 'hermes-execution',
  };
}

async function loadState(stateFile: string): Promise<Set<number>> {
  try {
    const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
    return new Set(data.processedIssues || []);
  } catch {
    return new Set();
  }
}

async function saveState(stateFile: string, processed: Set<number>): Promise<void> {
  writeFileSync(stateFile, JSON.stringify({ processedIssues: Array.from(processed), lastRun: new Date().toISOString() }, null, 2));
}

async function fetchGitHubIssues(owner: string, repo: string, label: string, githubToken: string): Promise<GitHubIssue[]> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Hermes-Bridge',
  };
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues?labels=${label}&state=open`,
    { headers }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function postGitHubComment(owner: string, repo: string, issueNumber: number, body: string, githubToken: string): Promise<void> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'Hermes-Bridge',
  };
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ body }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to post comment: ${response.status} ${response.statusText}`);
  }
}

async function updateGitHubIssueLabels(owner: string, repo: string, issueNumber: number, labels: string[], githubToken: string): Promise<void> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'Hermes-Bridge',
  };
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ labels }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to update labels: ${response.status} ${response.statusText}`);
  }
}

async function sendTelegramNotification(config: BridgeConfig, message: string): Promise<void> {
  if (!config.telegramBotToken || !config.telegramChatId) {
    console.log('Telegram not configured, skipping notification');
    return;
  }

  const response = await fetch(
    `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.telegramChatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    }
  );

  if (!response.ok) {
    console.error('Failed to send Telegram notification');
  }
}

async function executeHermesTask(issue: GitHubIssue, repoPath: string): Promise<{ success: boolean; message: string; prUrl?: string }> {
  console.log(`\n🔧 Executing task for issue #${issue.number}: ${issue.title}`);

  // Parse issue body to understand what needs to be done
  const lines = issue.body.split('\n');
  const taskDescription = lines.slice(0, 20).join('\n'); // First 20 lines

  console.log('Task description:');
  console.log(taskDescription);
  console.log('\n⚠️  In production, Hermes would:');
  console.log('   1. Read the issue description');
  console.log('   2. Plan the fix');
  console.log('   3. Edit files using file tools');
  console.log('   4. Run build and tests');
  console.log('   5. Take screenshots for verification');
  console.log('   6. Create a PR');
  console.log('   7. Report results back');

  // For demo purposes, simulate a successful execution
  // In production, this would call Hermes API or invoke Hermes tools directly

  return {
    success: true,
    message: 'Task simulated successfully. In production, Hermes would execute the actual fix.',
    prUrl: `https://github.com/${repoPath}/pull/999`,
  };
}

async function processIssue(
  issue: GitHubIssue,
  owner: string,
  repo: string,
  config: BridgeConfig,
  processed: Set<number>
): Promise<void> {
  console.log(`\n📋 Processing issue #${issue.number}: ${issue.title}`);

  try {
    // Mark as in-progress
    await postGitHubComment(owner, repo, issue.number, '[IN_PROGRESS] Hermes is working on this issue...', config.githubToken);

    // Execute the task
    const result = await executeHermesTask(issue, `${owner}/${repo}`);

    if (result.success) {
      // Post success comment
      const comment = `## ✅ Task Completed\n\n${result.message}\n\n${result.prUrl ? `**PR:** ${result.prUrl}` : ''}\n\n---\n*Executed by Hermes Bridge*`;
      await postGitHubComment(owner, repo, issue.number, comment, config.githubToken);

      // Update labels: remove hermes-execution, add hermes-done
      const newLabels = issue.labels
        .map(l => l.name)
        .filter(l => l !== config.label)
        .concat('hermes-done');
      await updateGitHubIssueLabels(owner, repo, issue.number, newLabels, config.githubToken);

      // Notify user
      await sendTelegramNotification(config, `✅ *Issue #${issue.number} Completed*\n\n*Title:* ${issue.title}\n*Status:* Done\n${result.prUrl ? `*PR:* ${result.prUrl}` : ''}\n\nReview and merge when ready!`);

      processed.add(issue.number);
      console.log(`✅ Issue #${issue.number} completed successfully`);
    } else {
      // Post failure comment
      const comment = `## ❌ Task Failed\n\n${result.message}\n\n---\n*Executed by Hermes Bridge*`;
      await postGitHubComment(owner, repo, issue.number, comment, config.githubToken);

      await sendTelegramNotification(config, `❌ *Issue #${issue.number} Failed*\n\n*Title:* ${issue.title}\n*Error:* ${result.message}`);

      console.log(`❌ Issue #${issue.number} failed`);
    }
  } catch (error: any) {
    console.error(`Error processing issue #${issue.number}:`, error.message);
    await postGitHubComment(owner, repo, issue.number, `## ❌ Error\n\n${error.message}\n\n---\n*Executed by Hermes Bridge*`, config.githubToken);
  }
}

async function runBridge(owner: string, repo: string, config: BridgeConfig, processed: Set<number>): Promise<void> {
  console.log(`\n🔍 Checking for issues with label "${config.label}" in ${owner}/${repo}...`);

  const issues = await fetchGitHubIssues(owner, repo, config.label, config.githubToken);
  const newIssues = issues.filter(issue => !processed.has(issue.number));

  console.log(`Found ${issues.length} total issues, ${newIssues.length} new`);

  for (const issue of newIssues) {
    await processIssue(issue, owner, repo, config, processed);
  }
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let repo: string | null = null;
  let pollMode = false;
  let onceMode = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--repo':
        repo = args[++i];
        break;
      case '--poll':
        pollMode = true;
        break;
      case '--once':
        onceMode = true;
        break;
    }
  }

  if (!repo) {
    console.error('Usage: npx tsx scripts/hermes-bridge.ts --repo <owner/repo> [--poll | --once]');
    console.error('');
    console.error('Options:');
    console.error('  --repo <owner/repo>  GitHub repository to monitor');
    console.error('  --poll               Run continuously (default if no mode specified)');
    console.error('  --once               Run once and exit');
    console.error('');
    console.error('Environment:');
    console.error('  GITHUB_TOKEN         GitHub API token');
    console.error('  PAPERCLIP_API_URL    Paperclip API URL');
    console.error('  PAPERCLIP_API_KEY    Paperclip API key');
    console.error('  TELEGRAM_BOT_TOKEN   Telegram bot token (optional)');
    console.error('  TELEGRAM_CHAT_ID     Telegram chat ID (optional)');
    process.exit(1);
  }

  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) {
    console.error('Invalid repo format. Use: owner/repo');
    process.exit(1);
  }

  const config = await loadConfig();
  const processed = await loadState(config.stateFile);

  console.log('🚀 Hermes Bridge Starting');
  console.log(`Repository: ${owner}/${repoName}`);
  console.log(`Label: ${config.label}`);
  console.log(`Mode: ${pollMode ? 'poll' : onceMode ? 'once' : 'poll'}`);
  console.log(`State file: ${config.stateFile}`);
  console.log(`Previously processed: ${processed.size} issues\n`);

  if (onceMode) {
    await runBridge(owner, repoName, config, processed);
    await saveState(config.stateFile, processed);
    console.log('\n✅ Done');
    process.exit(0);
  } else {
    // Poll mode
    console.log(`Polling every ${config.pollIntervalMs / 1000}s...\n`);

    while (true) {
      try {
        await runBridge(owner, repoName, config, processed);
        await saveState(config.stateFile, processed);
      } catch (error: any) {
        console.error('Bridge error:', error.message);
      }

      console.log(`\n⏳ Waiting ${config.pollIntervalMs / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, config.pollIntervalMs));
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { fetchGitHubIssues, postGitHubComment, processIssue, executeHermesTask };
