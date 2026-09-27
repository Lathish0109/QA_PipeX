import type {
  BugPayload,
  FailureAnalysis,
  TestCase,
  TestResult,
} from '@qapipex/shared-types';

export interface GeneratedTestCase {
  title: string;
  description: string;
  type: TestCase['type'];
  steps: TestCase['steps'];
  expectedResult: string;
}

export interface GenerateTestCasesInput {
  requirementText: string;
  baseUrl: string;
  /** Labels of credentials stored for this project (e.g. "Primary test account") —
   * never the credential values themselves. Lets the AI emit a `login` step
   * referencing one by name when the requirement implies an authenticated flow. */
  availableCredentialLabels?: string[];
}

export interface AnalyzeFailureInput {
  testCase: TestCase;
  testResult: TestResult;
  evidence: {
    screenshotUrl?: string;
    traceUrl?: string;
    consoleLogUrl?: string;
  };
}

export interface GenerateBugReportInput {
  failureAnalysis: FailureAnalysis;
  testCase: TestCase;
}

/**
 * The creative/summarization fields an LLM can responsibly produce. The
 * caller (which has DB access) fills in the structural fields — source,
 * sourceRefs, evidenceLinks — since those are deterministic IDs/paths, not
 * something an AI should be inventing.
 */
export type GeneratedBugContent = Pick<
  BugPayload,
  'title' | 'description' | 'severity' | 'priority' | 'stepsToReproduce' | 'expectedResult' | 'actualResult'
>;

/**
 * Provider-agnostic AI abstraction. Nothing outside this package should
 * import an LLM SDK directly — swap the implementation here to change
 * providers without touching the rest of the app.
 */
export interface AIService {
  generateTestCases(input: GenerateTestCasesInput): Promise<GeneratedTestCase[]>;
  analyzeFailure(input: AnalyzeFailureInput): Promise<Omit<FailureAnalysis, 'id' | 'testResultId' | 'createdAt'>>;
  generateBugReport(input: GenerateBugReportInput): Promise<GeneratedBugContent>;
}
