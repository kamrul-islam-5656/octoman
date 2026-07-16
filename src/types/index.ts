export type UserRole = "Admin" | "Editor" | "Viewer";

export type WorkspaceRole = "Owner" | "Admin" | "Member";

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type RequestType = "http" | "graphql" | "websocket";

export type RequestBodyMode = "none" | "raw" | "form-data" | "x-www-form-urlencoded";

export type RawBodyLanguage = "json" | "xml" | "html" | "text" | "javascript";

export type RequestAuthType = "none" | "basic" | "bearer" | "api-key" | "inherit";

export type RequestApiKeyTarget = "header" | "query";

export type ThemeMode = "light" | "dark";

/* ------------------------------------------------------------------ */
/*  Common value types                                                */
/* ------------------------------------------------------------------ */

export interface KeyValuePair {
  key: string;
  value: string;
  enabled?: boolean;
  description?: string;
  type?: "text" | "file";
  fileName?: string;
}

export interface QueryParam {
  key: string;
  value: string;
  enabled: boolean;
  description: string;
}

export interface EnvironmentVariable {
  key: string;
  value: string;
}

export interface RequestAuthConfig {
  type: RequestAuthType;
  basic: { username: string; password: string };
  bearerToken: string;
  apiKey: { key: string; value: string; addTo: RequestApiKeyTarget };
}

export interface ExampleResponse {
  name: string;
  status: number;
  headers: KeyValuePair[];
  body: string;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string | null;
  durationMs: number;
}

export interface TimingPhases {
  dns: number;
  tcp: number;
  tls: number;
  ttfb: number;
  download: number;
  total: number;
}

/* ------------------------------------------------------------------ */
/*  DTOs — collections / folders                                      */
/* ------------------------------------------------------------------ */

export interface CollectionDto {
  id: string;
  tenant_id: string;
  workspace_id: string;
  name: string;
  description: string;
  auth: RequestAuthConfig;
  created_by: string;
  sort_order: number;
  published: boolean;
  publish_slug: string;
  createdAt: string;
  updatedAt: string;
}

export type DocumentationFormat = "markdown" | "html";

export interface CollectionDocumentationDto {
  id: string;
  collection_id: string;
  format: DocumentationFormat;
  project_description: string;
  content: string;
  generated_by: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiSettingsDto {
  enabled: boolean;
  hasApiKey: boolean;
  maskedApiKey: string | null;
  model: string | null;
}

export interface AiModelDto {
  id: string;
}

export interface AiUsageSnapshotDto {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestsLimit: string | null;
  requestsRemaining: string | null;
  requestsReset: string | null;
  tokensLimit: string | null;
  tokensRemaining: string | null;
  tokensReset: string | null;
  updatedAt: string;
}

export interface DocumentationFolderDto {
  id: string;
  tenant_id: string;
  workspace_id: string;
  collection_id: string | null;
  parent_id: string | null;
  name: string;
  description: string;
  auth: RequestAuthConfig;
  created_by: string;
  sort_order: number;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  DTOs — requests                                                   */
/* ------------------------------------------------------------------ */

export interface RequestDto {
  id: string;
  tenant_id: string;
  workspace_id: string;
  collection_id: string | null;
  folder_id: string | null;
  created_by: string;
  name: string;
  description: string;
  request_type: RequestType;
  method: HttpMethod;
  url: string;
  query_params: QueryParam[];
  headers: KeyValuePair[];
  body_mode: RequestBodyMode;
  body_raw: string;
  body_raw_language: RawBodyLanguage;
  body_form: KeyValuePair[];
  auth: RequestAuthConfig;
  body: string;
  pre_request_script: string;
  test_script: string;
  graphql_query: string;
  graphql_variables: string;
  examples: ExampleResponse[];
  sort_order: number;
  last_used_at: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  DTOs — environments                                               */
/* ------------------------------------------------------------------ */

export interface EnvironmentDto {
  id: string;
  tenant_id: string;
  workspace_id: string;
  collection_id: string;
  name: string;
  is_default: boolean;
  variables: EnvironmentVariable[];
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  DTOs — history                                                    */
/* ------------------------------------------------------------------ */

export interface HistoryDto {
  id: string;
  tenant_id: string;
  workspace_id: string;
  user_id: string;
  collection_id: string | null;
  folder_id: string | null;
  request_id: string | null;
  method: HttpMethod;
  url: string;
  headers: KeyValuePair[];
  body_mode: RequestBodyMode;
  body_raw: string;
  body_form: KeyValuePair[];
  auth: RequestAuthConfig;
  body: string;
  environment_name: string | null;
  response_status: number | null;
  response_headers: KeyValuePair[];
  response_body: unknown;
  duration_ms: number;
  error_code: string | null;
  error?: string | null;
  test_results: TestResult[];
  timing: TimingPhases | null;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  DTOs — execution                                                  */
/* ------------------------------------------------------------------ */

export interface ExecuteResponseDto {
  ok: boolean;
  status: number;
  headers: KeyValuePair[];
  body: unknown;
  durationMs: number;
  historyId: string;
  errorCode?: string | null;
  error?: string | null;
  testResults: TestResult[];
  timing: TimingPhases | null;
}

/* ------------------------------------------------------------------ */
/*  DTOs — organization & users                                       */
/* ------------------------------------------------------------------ */

export interface OrganizationDto {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceDto {
  id: string;
  tenant_id: string;
  name: string;
  is_default: boolean;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
}

export type InvitationStatus = "Pending" | "Accepted" | "Rejected" | "Expired";
export type InvitationRole = "Admin" | "Member";

export interface InvitationDto {
  id: string;
  tenant_id: string;
  workspace_id: string;
  email: string;
  role: InvitationRole;
  status: InvitationStatus;
  invited_by: string;
  expires_at: string;
  createdAt: string;
  updatedAt: string;
  inviteUrl?: string;
}

export interface WorkspaceMemberDto {
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  status: "Active";
  joined_at: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserDto {
  id: string;
  tenant_id: string;
  organization_id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  DTOs — mock server                                                */
/* ------------------------------------------------------------------ */

export interface MockEndpointDto {
  id: string;
  method: HttpMethod;
  path: string;
  response_status: number;
  response_headers: KeyValuePair[];
  response_body: string;
  delay_ms: number;
  enabled: boolean;
}

export interface MockServerDto {
  id: string;
  tenant_id: string;
  name: string;
  collection_id: string | null;
  endpoints: MockEndpointDto[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  DTOs — monitor                                                    */
/* ------------------------------------------------------------------ */

export type MonitorSchedule = "5m" | "15m" | "30m" | "1h" | "6h" | "12h" | "24h";

export interface MonitorAlertConfig {
  email: string;
  webhook_url: string;
  on_failure: boolean;
  on_recovery: boolean;
}

export interface MonitorDto {
  id: string;
  tenant_id: string;
  name: string;
  collection_id: string;
  environment_id: string | null;
  schedule: MonitorSchedule;
  active: boolean;
  alert_config: MonitorAlertConfig;
  last_run_at: string | null;
  next_run_at: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MonitorRunDto {
  id: string;
  monitor_id: string;
  tenant_id: string;
  total: number;
  passed: number;
  failed: number;
  avg_duration_ms: number;
  status: "success" | "partial" | "failure";
  started_at: string;
  completed_at: string;
  results: MonitorRunResultItem[];
}

export interface MonitorRunResultItem {
  request_name: string;
  method: HttpMethod;
  url: string;
  status: number | null;
  duration_ms: number;
  passed: boolean;
  error?: string | null;
  test_results: TestResult[];
}

/* ------------------------------------------------------------------ */
/*  DTOs — collection runner                                          */
/* ------------------------------------------------------------------ */

export interface RunResultDto {
  id: string;
  tenant_id: string;
  collection_id: string;
  environment_id: string | null;
  total: number;
  passed: number;
  failed: number;
  iterations: number;
  delay_ms: number;
  status: "running" | "completed" | "stopped";
  results: RunResultItem[];
  started_at: string;
  completed_at: string | null;
  createdAt: string;
}

export interface RunResultItem {
  iteration: number;
  request_id: string;
  request_name: string;
  method: HttpMethod;
  url: string;
  status: number | null;
  duration_ms: number;
  passed: boolean;
  error?: string | null;
  test_results: TestResult[];
}

/* ------------------------------------------------------------------ */
/*  UI State types (used across workspace components)                 */
/* ------------------------------------------------------------------ */

export type SettingsTab = "organization" | "users";
export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

/* ------------------------------------------------------------------ */
/*  Workspace initial data shape                                      */
/* ------------------------------------------------------------------ */

export interface WorkspaceInitialData {
  collections: CollectionDto[];
  requests: RequestDto[];
  environments: EnvironmentDto[];
  history: HistoryDto[];
  folders: DocumentationFolderDto[];
  users: AdminUserDto[];
  organization: OrganizationDto | null;
  workspaces: WorkspaceDto[];
  activeWorkspaceId: string;
}
