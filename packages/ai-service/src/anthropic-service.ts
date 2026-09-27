import Anthropic from '@anthropic-ai/sdk';
import type {
  AIService,
  AnalyzeFailureInput,
  GenerateBugReportInput,
  GenerateTestCasesInput,
  GeneratedBugContent,
  GeneratedTestCase,
} from './types';
import type { FailureAnalysis } from '@obsidian/shared-types';
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

function extractToolInput<T>(message: Anthropic.Message, toolName: string): T {
  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === toolName,
  );
  if (!toolUse) {
    throw new Error(`AI did not call the expected tool "${toolName}".`);
  }
  return toolUse.input as T;
}

/**
 * The only module in the codebase that imports the Anthropic SDK. Everything
 * else depends on the AIService interface in ./types.ts.
 */
export class AnthropicAIService implements AIService {
  private client: Anthropic;
  private model: string;

  constructor(options?: { apiKey?: string; model?: string; workspaceId?: string }) {
    const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY must be set (server-side only).');
    }
    // Some Console setups issue API keys that aren't bound to a default
    // workspace — Anthropic then requires this header on every request.
    const workspaceId = options?.workspaceId ?? process.env.ANTHROPIC_WORKSPACE_ID;
    this.client = new Anthropic({
      apiKey,
      defaultHeaders: workspaceId ? { 'anthropic-workspace-id': workspaceId } : undefined,
    });
    this.model = options?.model ?? 'claude-sonnet-5';
  }

  async generateTestCases(input: GenerateTestCasesInput): Promise<GeneratedTestCase[]> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      tools: [
        {
          name: 'submit_test_cases',
          description: 'Submit the generated structured test cases for the requirement.',
          input_schema: GENERATE_TEST_CASES_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_test_cases' },
      system: GENERATE_TEST_CASES_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildTestCasesUserPrompt(input) }],
    });

    const { testCases } = extractToolInput<{ testCases: GeneratedTestCase[] }>(message, 'submit_test_cases');
    return testCases;
  }

  async analyzeFailure(
    input: AnalyzeFailureInput,
  ): Promise<Omit<FailureAnalysis, 'id' | 'testResultId' | 'createdAt'>> {
    const textContext = buildFailureAnalysisTextContext(input);
    const content: Anthropic.MessageParam['content'] = [{ type: 'text', text: textContext }];

    if (input.evidence.screenshotUrl) {
      const image = await fetchImageAsBase64(input.evidence.screenshotUrl);
      if (image) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: image.mediaType, data: image.data },
        });
        content.push({ type: 'text', text: 'The above is the screenshot captured at the moment of failure.' });
      }
    }

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      tools: [
        {
          name: 'submit_failure_analysis',
          description: 'Submit the structured analysis of why this test case failed.',
          input_schema: ANALYZE_FAILURE_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_failure_analysis' },
      system: ANALYZE_FAILURE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    });

    return extractToolInput<Omit<FailureAnalysis, 'id' | 'testResultId' | 'createdAt'>>(
      message,
      'submit_failure_analysis',
    );
  }

  async generateBugReport(input: GenerateBugReportInput): Promise<GeneratedBugContent> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      tools: [
        {
          name: 'submit_bug_report',
          description: 'Submit a structured bug report ready to send to the bug tracker.',
          input_schema: GENERATE_BUG_REPORT_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_bug_report' },
      system: GENERATE_BUG_REPORT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildBugReportUserPrompt(input) }],
    });

    return extractToolInput<GeneratedBugContent>(message, 'submit_bug_report');
  }
}
