import type { FailureAnalysis } from '@qapipex/shared-types';
import type { GeneratedBugContent, GeneratedTestCase } from './types';

export const TEST_CASE_TYPES = ['positive', 'negative', 'edge', 'validation'] as const;
export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export const GENERATE_TEST_CASES_SYSTEM_PROMPT =
  'You are a senior QA engineer generating structured Playwright-executable test cases from a plain-language requirement. ' +
  'Cover positive, negative, edge, and validation scenarios. Steps must be concrete UI actions ' +
  '(navigate, click, fill, select, check, uncheck, assert) a Playwright script could follow directly. ' +
  'If the requirement needs an authenticated session and a credential label is provided in the prompt, ' +
  'you may emit a step with action "login" and target set to that exact credential label (e.g. ' +
  '{"action":"login","target":"Primary test account"}) as the step that establishes the session — never invent ' +
  'a username or password, and never put one in any step\'s target or value. ' +
  'Never include real credentials or secrets in any step.';

export const ANALYZE_FAILURE_SYSTEM_PROMPT =
  'You are a QA failure analyst. You must strictly separate what the evidence confirms from what you are ' +
  'guessing. "actualBehavior" must only state what the error message, screenshot, or console log directly ' +
  'show — never speculate there. Put any speculation only in "rootCauseHypothesis", and lower ' +
  '"confidenceLevel" whenever the evidence is thin (e.g. only an error message, no screenshot). ' +
  'Never state a root cause as if it were confirmed fact.';

export const GENERATE_BUG_REPORT_SYSTEM_PROMPT =
  'You are drafting a bug report for a bug tracker from a QA failure analysis. Be concise and factual. ' +
  'If the root cause is only a hypothesis, phrase the description accordingly (e.g. "likely caused by...") ' +
  'rather than stating it as fact.';

/** Plain JSON Schema (draft-07-ish) — every provider adapts this to its own SDK's tool/function format. */
export const GENERATE_TEST_CASES_SCHEMA = {
  type: 'object',
  properties: {
    testCases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          type: { type: 'string', enum: TEST_CASE_TYPES as unknown as string[] },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string' },
                target: { type: 'string' },
                value: { type: 'string' },
              },
              required: ['action'],
            },
          },
          expectedResult: { type: 'string' },
        },
        required: ['title', 'description', 'type', 'steps', 'expectedResult'],
      },
    },
  },
  required: ['testCases'],
} as const;

export const ANALYZE_FAILURE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'One or two sentence summary of the failure.' },
    expectedBehavior: { type: 'string' },
    actualBehavior: {
      type: 'string',
      description:
        'What actually happened, strictly grounded in the evidence provided (error message, screenshot, console log).',
    },
    rootCauseHypothesis: {
      type: 'string',
      description:
        'A plausible root cause. This is always a hypothesis, never a confirmed fact, even if it seems obvious — omit if there is not enough evidence to even guess.',
    },
    confidenceLevel: { type: 'string', enum: CONFIDENCE_LEVELS as unknown as string[] },
    errorCategory: {
      type: 'string',
      description:
        'Short category, e.g. "selector not found", "network timeout", "assertion mismatch", "navigation failure".',
    },
    suggestedSeverity: { type: 'string', enum: SEVERITIES as unknown as string[] },
    suggestedPriority: { type: 'string', enum: PRIORITIES as unknown as string[] },
    reproductionSteps: {
      type: 'array',
      items: { type: 'string' },
      description: 'Concrete steps a human could follow to reproduce this, derived from the test case steps.',
    },
  },
  required: [
    'summary',
    'expectedBehavior',
    'actualBehavior',
    'confidenceLevel',
    'errorCategory',
    'suggestedSeverity',
    'suggestedPriority',
    'reproductionSteps',
  ],
} as const;

export const GENERATE_BUG_REPORT_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: 'Concise bug title, e.g. "[Checkout] Promo code field rejects valid codes".',
    },
    description: { type: 'string' },
    severity: { type: 'string', enum: SEVERITIES as unknown as string[] },
    priority: { type: 'string', enum: PRIORITIES as unknown as string[] },
    stepsToReproduce: { type: 'array', items: { type: 'string' } },
    expectedResult: { type: 'string' },
    actualResult: { type: 'string' },
  },
  required: [
    'title',
    'description',
    'severity',
    'priority',
    'stepsToReproduce',
    'expectedResult',
    'actualResult',
  ],
} as const;

export type GenerateTestCasesToolOutput = { testCases: GeneratedTestCase[] };
export type AnalyzeFailureToolOutput = Omit<FailureAnalysis, 'id' | 'testResultId' | 'createdAt'>;
export type GenerateBugReportToolOutput = GeneratedBugContent;

export function buildTestCasesUserPrompt(input: {
  baseUrl: string;
  requirementText: string;
  availableCredentialLabels?: string[];
}): string {
  const credentialsLine =
    input.availableCredentialLabels && input.availableCredentialLabels.length > 0
      ? `\n\nAvailable credential labels for a "login" step (use the exact label, never the underlying username/password): ${input.availableCredentialLabels.join(', ')}`
      : '';
  return `Target site: ${input.baseUrl}\n\nRequirement:\n${input.requirementText}${credentialsLine}`;
}

export function buildFailureAnalysisTextContext(input: {
  testCase: { title: string; description: string; steps: unknown; expectedResult: string };
  testResult: { status: string; durationMs: number; errorMessage?: string };
}): string {
  return [
    `Test case: ${input.testCase.title}`,
    `Description: ${input.testCase.description}`,
    `Steps: ${JSON.stringify(input.testCase.steps)}`,
    `Expected result: ${input.testCase.expectedResult}`,
    '',
    `Actual status: ${input.testResult.status}`,
    `Duration: ${input.testResult.durationMs}ms`,
    `Error message: ${input.testResult.errorMessage ?? '(none captured)'}`,
  ].join('\n');
}

export function buildBugReportUserPrompt(input: {
  testCase: { title: string };
  failureAnalysis: {
    summary: string;
    expectedBehavior: string;
    actualBehavior: string;
    rootCauseHypothesis?: string;
    errorCategory: string;
    confidenceLevel: string;
    suggestedSeverity: string;
    suggestedPriority: string;
  };
}): string {
  return [
    `Test case: ${input.testCase.title}`,
    `Failure summary: ${input.failureAnalysis.summary}`,
    `Expected behavior: ${input.failureAnalysis.expectedBehavior}`,
    `Actual behavior: ${input.failureAnalysis.actualBehavior}`,
    input.failureAnalysis.rootCauseHypothesis
      ? `Root cause hypothesis (unconfirmed): ${input.failureAnalysis.rootCauseHypothesis}`
      : '',
    `Error category: ${input.failureAnalysis.errorCategory}`,
    `Confidence: ${input.failureAnalysis.confidenceLevel}`,
    `Suggested severity: ${input.failureAnalysis.suggestedSeverity}`,
    `Suggested priority: ${input.failureAnalysis.suggestedPriority}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function fetchImageAsBase64(
  url: string,
): Promise<{ data: string; mediaType: 'image/png' | 'image/jpeg' } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'image/png';
    const mediaType =
      contentType.includes('jpeg') || contentType.includes('jpg') ? 'image/jpeg' : 'image/png';
    const buffer = Buffer.from(await res.arrayBuffer());
    return { data: buffer.toString('base64'), mediaType };
  } catch {
    return null;
  }
}
