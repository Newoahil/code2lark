export type JsonObject = Record<string, unknown>;

export type ManifestSchemaVersion = "0.2";

export interface ServiceManifest {
  schema_version: ManifestSchemaVersion;
  generated_at: string;
  service: {
    name: string;
    target_path: string;
    type: "http_api" | "cli";
    detected_frameworks: string[];
    runtime_mode: "external_service";
    managed_by_lark_deployer: false;
    base_url: string;
    healthcheck: {
      method: "GET";
      path: string;
      status: "available" | "unavailable" | "not_checked";
      detail: string;
    };
    start_hints: string[];
  };
  source_scan: {
    analysis_strategy: "http_api_python_image_agent_web" | "generic_http_api" | "generic_cli";
    files_checked: string[];
    endpoints: Array<{ method: string; path: string }>;
    endpoint_coverage?: Array<{
      method: string;
      path: string;
      status: "supported" | "supporting" | "discovered_not_generated";
      capability_id?: string;
      reason: string;
    }>;
    notes: string[];
    secret_findings?: Array<{
      file: string;
      line: number;
      kind: string;
      action: string;
    }>;
  };
}

export interface CapabilityMap {
  schema_version: ManifestSchemaVersion;
  service_name: string;
  target_profile: "image-agent-web" | "generic-http-api" | "generic-cli";
  capabilities: Capability[];
}

export interface Capability {
  id: string;
  name: string;
  kind: "image_generation" | "action" | "query" | "artifact_generation" | "long_task";
  risk: "read_only" | "write" | "destructive";
  source: {
    type: "http";
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;
    content_type: string;
  };
  input_schema: JsonObject;
  output_schema: JsonObject;
  artifacts: Array<{
    name: string;
    type: "image" | "json" | "text" | "structured_data" | "file" | "url";
    source_field: string;
    delivery: "lark_image" | "card_text" | "card_json" | "audit";
  }>;
  timeout_seconds: number;
}

export interface InteractionContract {
  schema_version: ManifestSchemaVersion;
  channel: "lark";
  service_name: string;
  supported_triggers: Array<"card_action" | "http_request" | "scheduled_poll" | "manual_review">;
  supported_result_modes: Array<"interactive_card" | "structured_result" | "artifact" | "state_update">;
  interactions: Array<{
    id: string;
    capability_id: string;
    action_id: string;
    trigger: "card_action" | "http_request" | "scheduled_poll" | "manual_review";
    input_mode: "preset_card_action" | "feedback_card_action" | "batch_form_action" | "batch_status_action" | "form_action" | "button_action";
    result_mode: "interactive_card" | "structured_result" | "artifact" | "state_update";
    states: string[];
    audit_fields: string[];
    error_handling: string[];
  }>;
}

export interface RequiredPermissions {
  schema_version: ManifestSchemaVersion;
  app: {
    type: "custom_app";
    bot_required: true;
    availability_recommendation: string;
  };
  context_requirements: string[];
  token_strategy: {
    default: "tenant_access_token";
    user_access_token_required: false;
  };
  scopes: Array<{
    scope: string;
    identity: "tenant";
    required_by: string[];
    reason: string;
    risk: "low" | "medium" | "high";
  }>;
  events: unknown[];
  callbacks: Array<{
    callback: string;
    required_by: string[];
    reason: string;
    security: string[];
  }>;
  manual_steps: string[];
  review_flags: string[];
}
