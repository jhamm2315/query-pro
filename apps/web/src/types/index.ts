// -----------------------------------------------------------------------
// Mirror of Python Pydantic schemas — keep in sync with apps/api/schemas/
// -----------------------------------------------------------------------

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
  turn_id: string;
  plan: PlannerOutput;
  sql: string;
  optimized_sql: string | null;
  short_explanation: string;   // instant, no-LLM summary
  explanation: string;         // full walk-through, expandable
  meeting_mode: string;
  validation: ValidateResponse;
  dialect: Dialect;
}

export interface ThreadSummary {
  thread_id: string;
  title: string;
  dialect: Dialect;
  category: string;
  created_at: string;
  updated_at: string;
  turn_count: number;
}

// ── Query bank ────────────────────────────────────────────────────────────────
export interface BankQuery {
  id: string;
  name: string;
  description: string;
  use_case: string;
  tags: string[];
  dialect: Dialect;
  sql: string;
}

export interface BankCategory {
  id: string;
  name: string;
  icon: string;
  queries: BankQuery[];
}

export interface QueryBank {
  version: string;
  categories: BankCategory[];
}

// ── SQL review ────────────────────────────────────────────────────────────────
export interface ReviewResult {
  original_sql: string;
  fixed_sql: string;
  has_changes: boolean;
  issues_text: string;
  structural_warnings: string[];
  summary: string;
  dialect: string;
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
  confirmed_assumptions: string[];
  created_at: string;
}

export interface ThreadDetail extends ThreadSummary {
  turns: Turn[];
}

export interface SavedQuery {
  id: string;
  label: string;
  sql: string;
  prompt: string;
  dialect: Dialect;
  created_at: string;
}

export interface MeetingMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export interface MeetingSessionState {
  messages: MeetingMessage[];
  mode: "assumptions" | "chat";
  confirmedAssumptions: string[];
  streaming: boolean;
}
