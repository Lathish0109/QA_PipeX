import OpenAI from 'openai';
import type {
  AIService,
  AnalyzeFailureInput,
  GenerateBugReportInput,
  GenerateTestCasesInput,
  GeneratedBugContent,
  GeneratedTestCase,
} from './types';
import type { FailureAnalysis } from '@qapipex/shared-types';
import {
  ANALYZE_FAILURE_SCHEMA,
  ANALYZE_FAILURE_SYSTEM_PROMPT,
  GENERATE_BUG_REPORT_SCHEMA,
  GENERATE_BUG_REPORT_SYSTEM_PROMPT,
  GENERATE_TEST_CASES_SCHEMA,
  GENERATE_TEST_CASES_SYSTEM_PROMPT,
  buildBugReportUserPrompt,
  buildFailureAnalysisTextContext,
  buildTestCasesUserPrompt,
  fetchImageAsBase64,
} from './shared';

function extractToolArgs<T>(
  message: OpenAI.Chat.Completions.ChatCompletionMessage,
  toolName: string,
): T {
  const call = message.tool_calls?.find(
    (c): c is OpenAI.Chat.Completions.ChatCompletionMessageToolCall =>
      c.type === 'function' && c.function.name === toolName,
  );
  if (!call) {
    throw new Error(`AI did not call the expected tool "${toolName}".`);
  }
  return JSON.parse(call.function.arguments) as T;
}

/**
 * The only module in the codebase that imports the OpenAI SDK. Everything
 * else depends on the AIService interface in ./types.ts.
 */
export class OpenAIAIService implements AIService {
  private client: OpenAI;
  private model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY must be set (server-side only).');
    }
    this.client = new OpenAI({ apiKey });
    this.model = options?.model ?? 'gpt-4o';
  }

  async generateTestCases(input: GenerateTestCasesInput): Promise<GeneratedTestCase[]> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 4096,
      tools: [
        {
          type: 'function',
          function: {
            name: 'submit_test_cases',
            description: 'Submit the generated structured test cases for the requirement.',
            parameters: GENERATE_TEST_CASES_SCHEMA as unknown as Record<string, unknown>,
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'submit_test_cases' } },
      messages: [
        { role: 'system', content: GENERATE_TEST_CASES_SYSTEM_PROMPT },
        { role: 'user', content: buildTestCasesUserPrompt(input) },
      ],
    });

    const { testCases } = extractToolArgs<{ testCases: GeneratedTestCase[] }>(
      completion.choices[0].message,
      'submit_test_cases',
    );
    return testCases;
  }

  async analyzeFailure(
    input: AnalyzeFailureInput,
  ): Promise<Omit<FailureAnalysis, 'id' | 'testResultId' | 'createdAt'>> {
    const textContext = buildFailureAnalysisTextContext(input);
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: 'text', text: textContext },
    ];

    if (input.evidence.screenshotUrl) {
      const image = await fetchImageAsBase64(input.evidence.screenshotUrl);
      if (image) {
        content.push({
          type: 'image_url',
          image_url: { url: `data:${image.mediaType};base64,${image.data}` },
        });
        content.push({ type: 'text', text: 'The above is the screenshot captured at the moment of failure.' });
      }
    }

    const completion = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 2048,
      tools: [
        {
          type: 'function',
          function: {
            name: 'submit_failure_analysis',
            description: 'Submit the structured analysis of why this test case failed.',
            parameters: ANALYZE_FAILURE_SCHEMA as unknown as Record<string, unknown>,
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'submit_failure_analysis' } },
      messages: [
        { role: 'system', content: ANALYZE_FAILURE_SYSTEM_PROMPT },
        { role: 'user', content },
      ],
    });

    return extractToolArgs<Omit<FailureAnalysis, 'id' | 'testResultId' | 'createdAt'>>(
      completion.choices[0].message,
      'submit_failure_analysis',
    );
  }

  async generateBugReport(input: GenerateBugReportInput): Promise<GeneratedBugContent> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 2048,
      tools: [
        {
          type: 'function',
          function: {
            name: 'submit_bug_report',
            description: 'Submit a structured bug report ready to send to the bug tracker.',
            parameters: GENERATE_BUG_REPORT_SCHEMA as unknown as Record<string, unknown>,
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'submit_bug_report' } },
      messages: [
        { role: 'system', content: GENERATE_BUG_REPORT_SYSTEM_PROMPT },
        { role: 'user', content: buildBugReportUserPrompt(input) },
      ],
    });

    return extractToolArgs<GeneratedBugContent>(completion.choices[0].message, 'submit_bug_report');
  }
}
