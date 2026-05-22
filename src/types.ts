export interface Checklist {
  id: number;
  title: string;
  version: string;
  source_type: string;
  raw_content: string;
  task_count: number;
  status: 'uploaded' | 'parsed' | 'normalized';
  created_at: string;
  updated_at: string;
}

export interface TaskApplicability {
  id: number;
  task_id: number;
  applies_to_all: boolean;
  applies_to_ecommerce: boolean;
  applies_to_services: boolean;
  applies_to_local: boolean;
  applies_to_blog: boolean;
  applies_to_ymyl: boolean;
  requires_catalog: boolean;
  requires_filters: boolean;
  requires_multilingual: boolean;
  requires_migration: boolean;
  requires_local_business: boolean;
  exclude_if_no_blog: boolean;
  exclude_if_no_ecommerce: boolean;
  exclude_if_no_multilingual: boolean;
  exclude_if_no_local_seo: boolean;
}

export interface Task {
  id: number;
  checklist_id: number;
  section: string;
  raw_task: string;
  priority: 'critical' | 'important' | 'optional' | string;
  default_month: number;
  work_block: string;
  work_type: string;
  process_text: string;
  result_text: string;
  artifact_type: string;
  contract_text: string;
  client_text: string;
  internal_text: string;
  acceptance_criteria: string;
  responsible_role: string;
  repeatability: string;
  status: 'raw' | 'normalized';
  created_at: string;
  updated_at: string;
  applicability?: TaskApplicability;
}

export interface Project {
  id: number;
  name: string;
  site_url: string;
  site_type: 'ecommerce' | 'services' | 'blog' | 'local_business' | string;
  niche: string;
  geography: string;
  budget_level: 'basic' | 'standard' | 'premium' | string; // базовый / стандарт / расширенный
  duration_months: number;
  has_catalog: boolean;
  has_blog: boolean;
  has_filters: boolean;
  has_ecommerce: boolean;
  has_local_seo: boolean;
  has_multilingual: boolean;
  has_ymyl: boolean;
  has_migration: boolean;
  created_at: string;
  updated_at: string;
}

export interface LLMProvider {
  id: number;
  provider_name: 'OpenAI' | 'OpenRouter' | 'Anthropic' | 'Gemini' | string;
  api_endpoint: string;
  api_key_encrypted: string; // Plaintext or masked in the response
  default_model: string;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GeneratedScope {
  id: number;
  project_id: number;
  checklist_id: number;
  month: number;
  output_mode: 'contract' | 'client' | 'internal' | 'all' | string;
  generated_json: any; // Follows JSON Schema of generated scope
  contract_text?: string;
  client_text?: string;
  internal_checklist?: string;
  reviewer_notes?: string;
  status: 'draft' | 'reviewed' | 'saved' | string;
  version: number;
  created_at: string;
  updated_at: string;
}

// Result structure of scope generation matching specs
export interface ScopeWorkBlock {
  block_title: string;
  process: string;
  result: string;
  artifact: string;
  checklist_ids: number[];
  contract_text: string;
  client_text: string;
  internal_tasks: string[];
  acceptance_criteria: string;
  responsible_role: string;
}

export interface GeneratedScopeResult {
  month: number;
  month_title: string;
  summary: string;
  work_blocks: ScopeWorkBlock[];
  month_outputs: string[];
}

export interface ReviewerReport {
  errors: string[];
  missing_tasks_idsOrTitles: string[];
  extra_tasks_idsOrTitles: string[];
  revised_scope: GeneratedScopeResult;
}
