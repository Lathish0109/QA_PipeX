import { GoogleGenerativeAI, SchemaType, type FunctionDeclarationSchema } from '@google/generative-ai';
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

/**
 * Gemini's function-declaration schema uses an uppercase SchemaType enum
 * (OBJECT, STRING, ARRAY, ...) instead of plain JSON Schema's lowercase
 * "type" strings — convert the shared plain-JSON-Schema objects to it.
 */
function toGeminiSchema(schema: unknown): FunctionDeclarationSchema {
  const TYPE_MAP: Record<string, SchemaType> = {
    object: SchemaType.OBJECT,
    string: SchemaType.STRING,
    array: SchemaType.ARRAY,
    number: SchemaType.NUMBER,
    integer: SchemaType.INTEGER,
    boolean: SchemaType.BOOLEAN,
  };

  function convert(node: unknown): unknown {
    if (node === null || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(convert);

    const obj = node as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'type' && typeof value === 'string') {
        result[key] = TYPE_MAP[value] ?? value;
      } else {
        result[key] = convert(value);
      }
    }
    return result;
  }

  return convert(schema) as FunctionDeclarationSchema;
}

/**
 * The only module in the codebase that imports the Gemini SDK. Everything
 * else depends on the AIService interface in ./types.ts.
 */
export class GeminiAIService implements AIService {
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY must be set (server-side only).');
    }
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = options?.model ?? 'gemini-3.8-flash';
  }

  private getModel(toolName: string, description: string, schema: unknown, systemInstruction: string) {
    return this.client.getGenerativeModel({
      model: this.model,
      systemInstruction,
      tools: [
        {
          functionDeclarations: [{ name: toolName, description, parameters: toGeminiSchema(schema) }],
        },
      ],
      toolConfig: { functionCallingConfig: { mode: 'ANY' as never, allowedFunctionNames: [toolName] } },
    });
  }

  async generateTestCases(input: GenerateTestCasesInput): Promise<GeneratedTestCase[]> {
    const model = this.getModel(
      'submit_test_cases',
      'Submit the generated structured test cases for the requirement.',
      GENERATE_TEST_CASES_SCHEMA,
      GENERATE_TEST_CASES_SYSTEM_PROMPT,
    );

    const result = await model.generateContent(buildTestCasesUserPrompt(input));
    const call = result.response.functionCalls()?.[0];
    if (!call) throw new Error('AI did not call the expected tool "submit_test_cases".');
    const { testCases } = call.args as { testCases: GeneratedTestCase[] };
    return testCases;
  }

  async analyzeFailure(
    input: AnalyzeFailureInput,
  ): Promise<Omit<FailureAnalysis, 'id' | 'testResultId' | 'createdAt'>> {
    const model = this.getModel(
      'submit_failure_analysis',
      'Submit the structured analysis of why this test case failed.',
      ANALYZE_FAILURE_SCHEMA,
      ANALYZE_FAILURE_SYSTEM_PROMPT,
    );

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: buildFailureAnalysisTextContext(input) },
    ];
    if (input.evidence.screenshotUrl) {
      const image = await fetchImageAsBase64(input.evidence.screenshotUrl);
      if (image) {
        parts.push({ inlineData: { mimeType: image.mediaType, data: image.data } });
        parts.push({ text: 'The above is the screenshot captured at the moment of failure.' });
      }
    }

    const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
    const call = result.response.functionCalls()?.[0];
    if (!call) throw new Error('AI did not call the expected tool "submit_failure_analysis".');
    return call.args as Omit<FailureAnalysis, 'id' | 'testResultId' | 'createdAt'>;
  }

  async generateBugReport(input: GenerateBugReportInput): Promise<GeneratedBugContent> {
    const model = this.getModel(
      'submit_bug_report',
      'Submit a structured bug report ready to send to the bug tracker.',
      GENERATE_BUG_REPORT_SCHEMA,
      GENERATE_BUG_REPORT_SYSTEM_PROMPT,
    );

    const result = await model.generateContent(buildBugReportUserPrompt(input));
    const call = result.response.functionCalls()?.[0];
    if (!call) throw new Error('AI did not call the expected tool "submit_bug_report".');
    return call.args as GeneratedBugContent;
  }
}
