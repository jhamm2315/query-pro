/**
 * Shared TypeScript types mirroring the Python Pydantic schemas.
 * Import from here when building additional frontend apps or CLI tools.
 */

export type Dialect = "postgresql" | "tsql" | "mysql" | "sqlite";
export type Confidence = "high" | "medium" | "low";
export type WarningSeverity = "error" | "warning" | "info";

export interface PlannerOutput {
  user_prompt: string;
  cleaned_prompt: string;
  dialect: Dialect;
  query_type: string;
  grain: string;
  tables: string[];
  join_keys: string[];
  joins: string[];
  filters: string[];
  aggregations: string[];
  window_functions: string[];
  group_by: string[];
  order_by: string[];
  patterns: string[];
  output_columns: string[];
  assumptions: string[];
  ambiguities: string[];
  verification_checks: string[];
  optimization_notes: string[];
  confidence_rationale: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  severity: WarningSeverity;
}

export interface ValidateResponse {
  is_valid: boolean;
  parsed_ok: boolean;
  warnings: ValidationWarning[];
  confidence: Confidence;
  confidence_rationale: string;
}

export interface GenerateResponse {
  thread_id: string;
  plan: PlannerOutput;
  sql: string;
  optimized_sql: string | null;
  explanation: string;
  meeting_mode: string;
  validation: ValidateResponse;
  dialect: Dialect;
}

export interface ThreadSummary {
  thread_id: string;
  title: string;
  dialect: Dialect;
  created_at: string;
  updated_at: string;
  turn_count: number;
}

export interface Turn {
  turn_id: string;
  thread_id: string;
  prompt: string;
  sql: string;
  explanation: string;
  meeting_mode: string;
  dialect: Dialect;
  confidence: Confidence;
  created_at: string;
}

export interface ThreadDetail extends ThreadSummary {
  turns: Turn[];
}
