import { chromium, type Browser, type Page } from 'playwright';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestStep, WorkerRunRequest, WorkerRunResponse, WorkerTestCaseResult } from '@qapipex/shared-types';
import { uploadEvidence } from './supabase.js';
import { getCredential } from './credentials.js';

const STEP_TIMEOUT_MS = 10_000;

// Best-effort selector fallbacks for a generic login form — sites vary, and
// AI-generated test steps reference a credential by label, not a selector,
// since they never see the actual username/password.
const USERNAME_FIELD_SELECTORS = [
  'input[type="email"]',
  'input[autocomplete="username"]',
  'input[name="email"]',
  'input[name="username"]',
  '#email',
  '#username',
];
const PASSWORD_FIELD_SELECTORS = ['input[type="password"]', 'input[autocomplete="current-password"]'];
const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'button:has-text("Sign in")',
  'button:has-text("Log in")',
  'button:has-text("Login")',
];

async function fillFirstMatch(page: Page, selectors: string[], value: string): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.isVisible({ timeout: 1000 })) {
        await locator.fill(value, { timeout: STEP_TIMEOUT_MS });
        return true;
      }
    } catch {
      // try the next candidate selector
    }
  }
  return false;
}

async function clickFirstMatch(page: Page, selectors: string[]): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.isVisible({ timeout: 1000 })) {
        await locator.click({ timeout: STEP_TIMEOUT_MS });
        return true;
      }
    } catch {
      // try the next candidate selector
    }
  }
  return false;
}

async function performLogin(page: Page, projectId: string, credentialLabel: string): Promise<void> {
  const credential = await getCredential(projectId, credentialLabel);
  if (!credential) {
    throw new Error(`No stored credential found for label "${credentialLabel}" on this project.`);
  }

  const filledUsername = await fillFirstMatch(page, USERNAME_FIELD_SELECTORS, credential.username);
  if (!filledUsername) {
    throw new Error('login step could not find a username/email field on the page.');
  }
  const filledPassword = await fillFirstMatch(page, PASSWORD_FIELD_SELECTORS, credential.password);
  if (!filledPassword) {
    throw new Error('login step could not find a password field on the page.');
  }
  const submitted = await clickFirstMatch(page, SUBMIT_SELECTORS);
  if (!submitted) {
    throw new Error('login step could not find a submit button on the page.');
  }
}

const ANSI_ESCAPE_PATTERN = /\x1b\[[0-9;]*m/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_PATTERN, '');
}

function resolveUrl(baseUrl: string, target: string | undefined): string {
  if (!target) return baseUrl;
  if (/^https?:\/\//.test(target)) return target;
  return new URL(target, baseUrl).toString();
}

async function runStep(page: Page, baseUrl: string, projectId: string, step: TestStep): Promise<void> {
  switch (step.action) {
    case 'navigate':
    case 'goto':
      await page.goto(resolveUrl(baseUrl, step.target), { timeout: STEP_TIMEOUT_MS });
      return;
    case 'login': {
      if (!step.target) throw new Error('login step is missing a credential label as its target');
      await performLogin(page, projectId, step.target);
      return;
    }
    case 'click':
      await page.click(step.target ?? '', { timeout: STEP_TIMEOUT_MS });
      return;
    case 'dblclick':
      await page.dblclick(step.target ?? '', { timeout: STEP_TIMEOUT_MS });
      return;
    case 'fill':
      await page.fill(step.target ?? '', step.value ?? '', { timeout: STEP_TIMEOUT_MS });
      return;
    case 'select':
      await page.selectOption(step.target ?? '', step.value ?? '', { timeout: STEP_TIMEOUT_MS });
      return;
    case 'check':
      await page.check(step.target ?? '', { timeout: STEP_TIMEOUT_MS });
      return;
    case 'uncheck':
      await page.uncheck(step.target ?? '', { timeout: STEP_TIMEOUT_MS });
      return;
    case 'assert': {
      if (!step.target) throw new Error('assert step is missing a target selector');
      const locator = page.locator(step.target);
      await locator.first().waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS });
      if (step.value) {
        const text = (await locator.first().textContent()) ?? '';
        if (!text.includes(step.value)) {
          throw new Error(`Expected "${step.target}" to contain "${step.value}", got "${text.trim()}"`);
        }
      }
      return;
    }
    default:
      throw new Error(`Unsupported step action: "${step.action}"`);
  }
}

async function executeTestCase(
  browser: Browser,
  baseUrl: string,
  projectId: string,
  testCase: WorkerRunRequest['testCases'][number],
  evidencePrefix: string,
): Promise<WorkerTestCaseResult> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleLogs: string[] = [];
  page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => consoleLogs.push(`[pageerror] ${String(err)}`));

  await context.tracing.start({ screenshots: true, snapshots: true });
  const startedAt = Date.now();

  try {
    for (const step of testCase.steps) {
      await runStep(page, baseUrl, projectId, step);
    }
    await context.tracing.stop();
    await context.close();
    return {
      testCaseId: testCase.id,
      status: 'passed',
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const errorMessage = stripAnsi(err instanceof Error ? err.message : String(err));

    const screenshotBuffer = await page.screenshot().catch(() => null);
    const tempTracePath = join(tmpdir(), `trace-${testCase.id}-${Date.now()}.zip`);
    await context.tracing.stop({ path: tempTracePath }).catch(() => {});
    await context.close();

    let screenshotPath: string | undefined;
    let tracePath: string | undefined;
    let consoleLogPath: string | undefined;

    if (screenshotBuffer) {
      screenshotPath = await uploadEvidence(
        `${evidencePrefix}/${testCase.id}/screenshot.png`,
        screenshotBuffer,
        'image/png',
      ).catch(() => undefined);
    }
    try {
      const traceBuffer = await readFile(tempTracePath);
      tracePath = await uploadEvidence(
        `${evidencePrefix}/${testCase.id}/trace.zip`,
        traceBuffer,
        'application/zip',
      );
    } catch {
      // trace capture failing shouldn't fail the whole result — the error
      // message and screenshot are still useful on their own.
    } finally {
      await unlink(tempTracePath).catch(() => {});
    }
    if (consoleLogs.length > 0) {
      consoleLogPath = await uploadEvidence(
        `${evidencePrefix}/${testCase.id}/console.log`,
        Buffer.from(consoleLogs.join('\n'), 'utf-8'),
        'text/plain',
      ).catch(() => undefined);
    }

    return {
      testCaseId: testCase.id,
      status: 'failed',
      durationMs,
      errorMessage,
      screenshotPath,
      tracePath,
      consoleLogPath,
    };
  }
}

export async function runTestSuite(request: WorkerRunRequest): Promise<WorkerRunResponse> {
  const browser = await chromium.launch();
  const evidencePrefix = `${request.projectId}/${request.testRunId}`;
  const results: WorkerTestCaseResult[] = [];

  try {
    for (const testCase of request.testCases) {
      const result = await executeTestCase(browser, request.baseUrl, request.projectId, testCase, evidencePrefix);
      results.push(result);
    }
  } finally {
    await browser.close();
  }

  const passedCount = results.filter((r) => r.status === 'passed').length;
  const runStatus =
    passedCount === results.length ? 'passed' : passedCount === 0 ? 'failed' : 'partial';

  return { runStatus, results };
}
