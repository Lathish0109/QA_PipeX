// Hand-written table row types matching packages/db/migrations/0001_init.sql.
// Regenerate/replace with `supabase gen types typescript` once the CLI is
// connected to the qkmjvgaiuzofvwntxlrg project, if preferred.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; display_name: string | null; created_at: string };
        Insert: { id: string; display_name?: string | null };
        Update: { display_name?: string | null };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          name: string;
          base_url: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: { id?: string; name: string; base_url: string; created_by?: string | null; created_at?: string };
        Update: { name?: string; base_url?: string; created_by?: string | null };
        Relationships: [];
      };
      project_credentials: {
        Row: {
          id: string;
          project_id: string;
          label: string;
          username: string;
          encrypted_password: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          label: string;
          username: string;
          encrypted_password: string;
          created_at?: string;
        };
        Update: { label?: string; username?: string; encrypted_password?: string };
        Relationships: [];
      };
      requirements: {
        Row: {
          id: string;
          project_id: string;
          text: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: { id?: string; project_id: string; text: string; created_by?: string | null; created_at?: string };
        Update: { text?: string };
        Relationships: [];
      };
      test_cases: {
        Row: {
          id: string;
          project_id: string;
          requirement_id: string;
          title: string;
          description: string | null;
          type: 'positive' | 'negative' | 'edge' | 'validation';
          steps: Json;
          expected_result: string;
          status: 'draft' | 'approved' | 'rejected';
          generated_by: 'ai' | 'human';
          approved_by: string | null;
          approved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          requirement_id: string;
          title: string;
          description?: string | null;
          type: 'positive' | 'negative' | 'edge' | 'validation';
          steps: Json;
          expected_result: string;
          status?: 'draft' | 'approved' | 'rejected';
          generated_by?: 'ai' | 'human';
          approved_by?: string | null;
          approved_at?: string | null;
        };
        Update: {
          title?: string;
          description?: string | null;
          type?: 'positive' | 'negative' | 'edge' | 'validation';
          steps?: Json;
          expected_result?: string;
          status?: 'draft' | 'approved' | 'rejected';
          approved_by?: string | null;
          approved_at?: string | null;
        };
        Relationships: [];
      };
      test_runs: {
        Row: {
          id: string;
          project_id: string;
          triggered_by: string | null;
          status: 'queued' | 'running' | 'passed' | 'failed' | 'partial' | 'error';
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          triggered_by?: string | null;
          status?: 'queued' | 'running' | 'passed' | 'failed' | 'partial' | 'error';
          started_at?: string | null;
          completed_at?: string | null;
        };
        Update: {
          status?: 'queued' | 'running' | 'passed' | 'failed' | 'partial' | 'error';
          started_at?: string | null;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      test_results: {
        Row: {
          id: string;
          test_run_id: string;
          test_case_id: string;
          status: 'passed' | 'failed' | 'skipped' | 'error';
          duration_ms: number | null;
          error_message: string | null;
          screenshot_url: string | null;
          trace_url: string | null;
          console_log_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          test_run_id: string;
          test_case_id: string;
          status: 'passed' | 'failed' | 'skipped' | 'error';
          duration_ms?: number | null;
          error_message?: string | null;
          screenshot_url?: string | null;
          trace_url?: string | null;
          console_log_url?: string | null;
        };
        Update: {
          status?: 'passed' | 'failed' | 'skipped' | 'error';
          duration_ms?: number | null;
          error_message?: string | null;
          screenshot_url?: string | null;
          trace_url?: string | null;
          console_log_url?: string | null;
        };
        Relationships: [];
      };
      failure_analyses: {
        Row: {
          id: string;
          test_result_id: string;
          summary: string;
          expected_behavior: string;
          actual_behavior: string;
          root_cause_hypothesis: string | null;
          confidence_level: 'low' | 'medium' | 'high' | null;
          error_category: string | null;
          suggested_severity: string | null;
          suggested_priority: string | null;
          reproduction_steps: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          test_result_id: string;
          summary: string;
          expected_behavior: string;
          actual_behavior: string;
          root_cause_hypothesis?: string | null;
          confidence_level?: 'low' | 'medium' | 'high' | null;
          error_category?: string | null;
          suggested_severity?: string | null;
          suggested_priority?: string | null;
          reproduction_steps?: Json;
        };
        Update: Partial<{
          summary: string;
          expected_behavior: string;
          actual_behavior: string;
          root_cause_hypothesis: string | null;
          confidence_level: 'low' | 'medium' | 'high' | null;
          error_category: string | null;
          suggested_severity: string | null;
          suggested_priority: string | null;
          reproduction_steps: Json;
        }>;
        Relationships: [];
      };
      bug_references: {
        Row: {
          id: string;
          failure_analysis_id: string;
          external_bug_id: string;
          external_bug_url: string | null;
          cached_status: string | null;
          last_synced_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          failure_analysis_id: string;
          external_bug_id: string;
          external_bug_url?: string | null;
          cached_status?: string | null;
          last_synced_at?: string | null;
        };
        Update: Partial<{
          external_bug_id: string;
          external_bug_url: string | null;
          cached_status: string | null;
          last_synced_at: string | null;
        }>;
        Relationships: [];
      };
      app_settings: {
        Row: {
          key: string;
          value: Json;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: { key: string; value: Json; updated_by?: string | null };
        Update: Partial<{ value: Json; updated_by: string | null }>;
        Relationships: [];
      };
      ai_provider_keys: {
        Row: {
          provider: 'anthropic' | 'openai' | 'gemini';
          encrypted_key: string;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          provider: 'anthropic' | 'openai' | 'gemini';
          encrypted_key: string;
          updated_by?: string | null;
        };
        Update: Partial<{ encrypted_key: string; updated_by: string | null }>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
