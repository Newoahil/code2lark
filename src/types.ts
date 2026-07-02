export type JsonObject = Record<string, unknown>;

export interface ServiceManifest {
  schema_version: "0.1";
  generated_at: string;
  service: {
    name: string;
    target_path: string;
    type: "http_api";
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
  schema_version: "0.1";
  service_name: string;
  capabilities: Capability[];
}

export interface Capability {
  id: string;
  name: string;
  kind: "image_generation";
  risk: "read_only" | "write" | "destructive";
  source: {
    type: "http";
    method: "POST";
    path: string;
    content_type: string;
  };
  input_schema: JsonObject;
  output_schema: JsonObject;
  artifacts: Array<{
    name: string;
    type: "image" | "json" | "text";
    source_field: string;
    delivery: "lark_image" | "card_text" | "audit";
  }>;
  timeout_seconds: number;
}

export interface InteractionContract {
  schema_version: "0.1";
  channel: "lark";
  service_name: string;
  interactions: Array<{
    id: string;
    capability_id: string;
    trigger: "card_action";
    input_mode: "preset_card_action" | "feedback_card_action" | "batch_form_action" | "batch_status_action";
    result_mode: "interactive_card";
    states: string[];
    audit_fields: string[];
    error_handling: string[];
  }>;
}

export interface RequiredPermissions {
  schema_version: "0.1";
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
