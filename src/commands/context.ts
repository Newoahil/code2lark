import fs from "node:fs";
import path from "node:path";
import { getStringOption } from "../args.js";
import { readJsonFile, slugify, writeJson, writeText } from "../fs-utils.js";
import { normalizeHostReceiveMode, type HostReceiveMode, type IntegrationMode } from "../host-mode.js";
import type { RequiredPermissions, ServiceManifest } from "../types.js";

export interface ContextTemplate {
  schema_version: "0.1";
  integration_mode?: IntegrationMode;
  host_receive_mode?: HostReceiveMode;
  purpose: string;
  target_service: {
    name: string;
    base_url: string;
    externally_managed: true;
  };
  feishu_app: {
    provisioning_mode: "existing_app" | "auto_registration_candidate";
    can_provide_existing_app_context: boolean | null;
    allow_auto_registration_attempt: boolean | null;
    app_id: string;
    app_secret: string;
    verification_token: string;
    encrypt_key: string;
    test_chat_id: string;
    public_callback_base_url: string;
  };
  required_permissions: {
    scopes: string[];
    callbacks: string[];
    manual_steps: string[];
  };
  runtime_config: {
    host: string;
    port: number;
    upload_image_to_lark: boolean;
    target_timeout_seconds: number;
    card_action_mode: "sync" | "async";
    feishu_openapi_base_url: string;
    debug_access_token: string;
    allowed_operator_open_ids: string[];
    allow_debug_without_feishu: boolean;
  };
  handoff_request: {
    recipient_hint: string;
    required_values: Array<{
      key: string;
      owner: string;
      required_for_level_2: boolean;
      note: string;
    }>;
    permission_confirmations: Array<{
      item: string;
      reason: string;
      risk?: "low" | "medium" | "high" | "n/a";
      owner?: string;
      security?: string[];
    }>;
    runtime_choices: Array<{
      key: string;
      recommended_value: string;
      note: string;
    }>;
    generated_package_hint: string;
    verification_commands: string[];
    command_sets: Array<{
      name: string;
      cwd_hint: string;
      commands: string[];
    }>;
  };
  readiness_questions: Array<{
    id: string;
    question: string;
    required_for_level_2: boolean;
  }>;
}

export interface ContextReplyTemplate {
  schema_version: "0.1";
  purpose: string;
  generated_package_hint: string;
  target_service: {
    name: string;
    base_url: string;
  };
  responder: {
    name: string;
    role: string;
    contact: string;
  };
  answers: {
    can_provide_existing_app_context: boolean | null;
    can_grant_permissions: boolean | null;
    can_configure_card_callback: boolean | null;
    card_callback_url_configured: boolean | null;
    can_add_bot_to_test_chat: boolean | null;
    can_keep_target_reachable: boolean | null;
  };
  public_values: {
    feishu_app_name: string;
    test_chat_id: string;
    public_callback_base_url: string;
    target_base_url: string;
  };
  secure_secret_channel: string;
  permission_confirmations: Array<{
    item: string;
    status: "unknown" | "confirmed" | "blocked" | "not_needed";
    owner: string;
    note: string;
  }>;
  runtime_choices: Array<{
    key: string;
    accepted: boolean | null;
    selected_value: string;
    note: string;
  }>;
  blocked_by: string[];
  next_local_steps: string[];
  secret_red_lines: string[];
}

export async function contextCommand(args: string[], options: Record<string, string | boolean>): Promise<void> {
  const packageArg = args[0];
  if (!packageArg) {
    throw new Error("Usage: lark-deployer context <analysis-workspace-or-generated-package> [--out <file>] [--mode embedded-adapter|standalone-runtime|self-hosted-runtime] [--host-mode embedded-webhook|embedded-long-connection|hybrid|standalone-runtime]");
  }

  const workspace = path.resolve(packageArg);
  const manifestDir = path.join(workspace, "manifest");
  const service = readJsonFile<ServiceManifest>(path.join(manifestDir, "service_manifest.json"));
  const permissions = readJsonFile<RequiredPermissions>(path.join(manifestDir, "required_permissions.json"));
  const outFile = path.resolve(getStringOption(options, "out", path.join(workspace, "feishu_context.template.json")));
  const markdownFile = outFile.replace(/\.json$/i, ".md");
  const requestFile = contextRequestFilePath(outFile);
  const replyFile = contextReplyFilePath(outFile);
  const replyMarkdownFile = replyFile.replace(/\.json$/i, ".md");
  const integrationMode = normalizeContextIntegrationMode(getStringOption(options, "mode", getStringOption(options, "integration-mode", getStringOption(options, "integrationMode", "standalone-runtime"))));
  const hostReceiveMode = normalizeHostReceiveMode(getStringOption(options, "host-mode", getStringOption(options, "hostMode", "")), integrationMode);
  const template = buildContextTemplate(service, permissions, { integrationMode, hostReceiveMode });

  writeJson(outFile, template);
  writeText(markdownFile, buildContextMarkdown(template));
  writeText(requestFile, buildContextRequestMarkdown(template));
  writeJson(replyFile, buildContextReplyTemplate(template));
  writeText(replyMarkdownFile, buildContextReplyMarkdown(buildContextReplyTemplate(template)));
  console.log(`Context template written to ${outFile}`);
  console.log(`Context checklist written to ${markdownFile}`);
  console.log(`Context request written to ${requestFile}`);
  console.log(`Context reply template written to ${replyFile}`);
}

function normalizeContextIntegrationMode(value: string): IntegrationMode {
  const normalized = value.trim() || "standalone-runtime";
  if (normalized === "embedded" || normalized === "embedded-adapter") return "embedded-adapter";
  if (normalized === "standalone" || normalized === "standalone-runtime") return "standalone-runtime";
  if (normalized === "self-hosted" || normalized === "self-hosted-runtime") return "self-hosted-runtime";
  throw new Error('--mode must be "embedded-adapter", "standalone-runtime", or "self-hosted-runtime".');
}

export function buildContextTemplate(
  service: ServiceManifest,
  permissions: RequiredPermissions,
  options: { generatedPackageHint?: string; packageRootCliPath?: string; integrationMode?: IntegrationMode; hostReceiveMode?: HostReceiveMode } = {},
): ContextTemplate {
  const defaultGeneratedPackage = options.generatedPackageHint || `generated\\${slugify(service.service.name)}-lark`;
  const commandPackageArg = quoteCommandArg(defaultGeneratedPackage);
  const packageRootCliPath = options.packageRootCliPath || "..\\..\\dist\\index.js";
  const packageRootCli = quoteCommandArg(packageRootCliPath);
  const embedded = options.integrationMode === "embedded-adapter";
  const selfHosted = options.integrationMode === "self-hosted-runtime";
  const hostReceiveMode = options.hostReceiveMode || (embedded ? "embedded-webhook" : "standalone-runtime");
  const hybrid = hostReceiveMode === "hybrid";
  const hostModeOption = embedded && hostReceiveMode !== "embedded-webhook" ? ` --host-mode ${hostReceiveMode}` : "";
  const selfHostedModeOption = " --mode self-hosted-runtime";
  const projectDoctorCommands = selfHosted
    ? [
        `node dist/index.js doctor ${commandPackageArg}${selfHostedModeOption}`,
        `node dist/index.js doctor ${commandPackageArg}${selfHostedModeOption} --gate`,
      ]
    : embedded
    ? [
        `node dist/index.js doctor ${commandPackageArg} --mode embedded-adapter${hostModeOption}`,
        `node dist/index.js doctor ${commandPackageArg} --mode embedded-adapter${hostModeOption} --gate`,
      ]
    : [
        `node dist/index.js doctor ${commandPackageArg}`,
        `node dist/index.js doctor ${commandPackageArg} --gate`,
        `node dist/index.js doctor ${commandPackageArg} --probe-target --gate`,
      ];
  const packageDoctorCommands = selfHosted
    ? [
        `node ${packageRootCli} doctor .${selfHostedModeOption}`,
        `node ${packageRootCli} doctor .${selfHostedModeOption} --gate`,
      ]
    : embedded
    ? [
        `node ${packageRootCli} doctor . --mode embedded-adapter${hostModeOption}`,
        `node ${packageRootCli} doctor . --mode embedded-adapter${hostModeOption} --gate`,
      ]
    : [
        `node ${packageRootCli} doctor .`,
        `node ${packageRootCli} doctor . --gate`,
        `node ${packageRootCli} doctor . --probe-target --gate`,
      ];
  const movedDoctorCommands = selfHosted
    ? [
        `node $env:LARK_DEPLOYER_CLI doctor .${selfHostedModeOption}`,
        `node $env:LARK_DEPLOYER_CLI doctor .${selfHostedModeOption} --gate`,
      ]
    : embedded
    ? [
        `node $env:LARK_DEPLOYER_CLI doctor . --mode embedded-adapter${hostModeOption}`,
        `node $env:LARK_DEPLOYER_CLI doctor . --mode embedded-adapter${hostModeOption} --gate`,
      ]
    : [
        "node $env:LARK_DEPLOYER_CLI doctor .",
        "node $env:LARK_DEPLOYER_CLI doctor . --gate",
        "node $env:LARK_DEPLOYER_CLI doctor . --probe-target --gate",
      ];
  const projectVerifyCommands = selfHosted
    ? [
        `node dist/index.js verify ${commandPackageArg}${selfHostedModeOption} --strict`,
      ]
    : embedded
    ? [
        `node dist/index.js verify ${commandPackageArg} --mode embedded-adapter${hostModeOption} --strict`,
        `node dist/index.js verify ${commandPackageArg} --mode embedded-adapter${hostModeOption} --host-runtime-url http://127.0.0.1:3978 --simulate`,
      ]
    : [
        `node dist/index.js verify ${commandPackageArg}`,
        `node dist/index.js verify ${commandPackageArg} --runtime-url http://127.0.0.1:3978 --simulate`,
        `node dist/index.js verify ${commandPackageArg} --runtime-url http://127.0.0.1:3978 --level2`,
      ];
  const packageVerifyCommands = selfHosted
    ? [
        `node ${packageRootCli} verify .${selfHostedModeOption} --strict`,
      ]
    : embedded
    ? [
        `node ${packageRootCli} verify . --mode embedded-adapter${hostModeOption} --strict`,
        `node ${packageRootCli} verify . --mode embedded-adapter${hostModeOption} --host-runtime-url http://127.0.0.1:3978 --simulate`,
      ]
    : [
        `node ${packageRootCli} verify .`,
        `node ${packageRootCli} verify . --runtime-url http://127.0.0.1:3978 --simulate`,
        `node ${packageRootCli} verify . --runtime-url http://127.0.0.1:3978 --level2`,
      ];
  const movedVerifyCommands = selfHosted
    ? [
        `node $env:LARK_DEPLOYER_CLI verify .${selfHostedModeOption} --strict`,
      ]
    : embedded
    ? [
        `node $env:LARK_DEPLOYER_CLI verify . --mode embedded-adapter${hostModeOption} --strict`,
        `node $env:LARK_DEPLOYER_CLI verify . --mode embedded-adapter${hostModeOption} --host-runtime-url http://127.0.0.1:3978 --simulate`,
      ]
    : [
        "node $env:LARK_DEPLOYER_CLI verify . --runtime-url http://127.0.0.1:3978 --simulate",
        "node $env:LARK_DEPLOYER_CLI verify . --runtime-url http://127.0.0.1:3978 --level2",
      ];
  const projectEvidenceCommands = embedded || selfHosted ? [] : [`node dist/index.js evidence ${commandPackageArg} --runtime-url http://127.0.0.1:3978 --update-record`];
  const packageEvidenceCommands = embedded || selfHosted ? [] : [`node ${packageRootCli} evidence . --runtime-url http://127.0.0.1:3978 --update-record`];
  const movedEvidenceCommands = embedded || selfHosted ? [] : ["node $env:LARK_DEPLOYER_CLI evidence . --runtime-url http://127.0.0.1:3978 --update-record"];
  const selfHostedProjectSetupCommands = selfHosted ? [
    `cd ${quoteCommandArg(path.join(defaultGeneratedPackage, "feishu-host"))}`,
    "python -m pip install -r requirements.txt",
    "Copy-Item .env.example .env",
    "python local_contract_test.py",
    "python app.py --selfcheck",
  ] : [];
  const selfHostedPackageSetupCommands = selfHosted ? [
    "cd feishu-host",
    "python -m pip install -r requirements.txt",
    "Copy-Item .env.example .env",
    "python local_contract_test.py",
    "python app.py --selfcheck",
  ] : [];
  const selfHostedMovedSetupCommands = selfHosted ? [
    "cd feishu-host",
    "python -m pip install -r requirements.txt",
    "Copy-Item .env.example .env",
    "python local_contract_test.py",
    "python app.py --selfcheck",
  ] : [];
  const projectRootCommands = [
    ...(selfHosted ? [] : [`node dist/index.js init-local ${commandPackageArg} --context --reply`]),
    ...(selfHosted ? [] : [`node dist/index.js configure ${commandPackageArg} --strict --dry-run`, `node dist/index.js configure ${commandPackageArg} --strict`]),
    ...selfHostedProjectSetupCommands,
    `node dist/index.js status ${commandPackageArg}`,
    `node dist/index.js readiness ${commandPackageArg}`,
    ...projectDoctorCommands,
    ...projectVerifyCommands,
    ...projectEvidenceCommands,
    `node dist/index.js handoff ${commandPackageArg}`,
  ];
  const packageRootCommands = [
    ...(selfHosted ? [] : [`node ${packageRootCli} init-local . --context --reply`, `node ${packageRootCli} configure . --strict --dry-run`, `node ${packageRootCli} configure . --strict`]),
    ...selfHostedPackageSetupCommands,
    `node ${packageRootCli} status .`,
    `node ${packageRootCli} readiness .`,
    ...packageDoctorCommands,
    ...packageVerifyCommands,
    ...packageEvidenceCommands,
    `node ${packageRootCli} handoff .`,
  ];
  const movedPackageCommands = [
    "$env:LARK_DEPLOYER_CLI=\"C:\\path\\to\\Lark-deployer\\dist\\index.js\"",
    ...(selfHosted ? [] : ["node $env:LARK_DEPLOYER_CLI init-local . --context --reply", "node $env:LARK_DEPLOYER_CLI configure . --strict --dry-run", "node $env:LARK_DEPLOYER_CLI configure . --strict"]),
    ...selfHostedMovedSetupCommands,
    "node $env:LARK_DEPLOYER_CLI status .",
    "node $env:LARK_DEPLOYER_CLI readiness .",
    ...movedDoctorCommands,
    ...movedVerifyCommands,
    ...movedEvidenceCommands,
    "node $env:LARK_DEPLOYER_CLI handoff .",
  ];

  return {
    schema_version: "0.1",
    integration_mode: options.integrationMode || "standalone-runtime",
    host_receive_mode: hostReceiveMode,
    purpose: "Collect external Feishu/Lark and target-service context required for real Level 2 verification.",
    target_service: {
      name: service.service.name,
      base_url: service.service.base_url,
      externally_managed: true,
    },
    feishu_app: {
      provisioning_mode: "existing_app",
      can_provide_existing_app_context: null,
      allow_auto_registration_attempt: null,
      app_id: "",
      app_secret: "",
      verification_token: "",
      encrypt_key: "",
      test_chat_id: "",
      public_callback_base_url: "",
    },
    required_permissions: {
      scopes: permissions.scopes.map((scope) => scope.scope),
      callbacks: hostReceiveMode === "embedded-long-connection"
        ? ["card.action.trigger via Feishu SDK long connection"]
        : hybrid
          ? [...permissions.callbacks.map((callback) => callback.callback), "card.action.trigger via Feishu SDK long connection"]
        : permissions.callbacks.map((callback) => callback.callback),
      manual_steps: permissions.manual_steps,
    },
    runtime_config: {
      host: "0.0.0.0",
      port: 3978,
      upload_image_to_lark: true,
      target_timeout_seconds: 120,
      card_action_mode: "sync",
      feishu_openapi_base_url: "",
      debug_access_token: "",
      allowed_operator_open_ids: [],
      allow_debug_without_feishu: true,
    },
    handoff_request: {
      recipient_hint: "Feishu app owner, permission admin, or FDE who can configure the test bot.",
      required_values: selfHosted ? [
        { key: "FEISHU_APP_ID", owner: "Feishu app owner", required_for_level_2: true, note: "Application ID for feishu-host/.env." },
        { key: "FEISHU_APP_SECRET", owner: "Feishu app owner", required_for_level_2: true, note: "Application secret for feishu-host/.env. Share through a secure channel only." },
        { key: "FEISHU_CONNECTION_MODE", owner: "FDE", required_for_level_2: true, note: "Must be websocket for self-hosted-runtime." },
        { key: "IMAGE_AGENT_BASE_URL", owner: "Target service owner", required_for_level_2: true, note: `Reachable base URL for ${service.service.name}; Lark-deployer does not start this service.` },
        { key: "FEISHU_ALLOWED_USERS", owner: "FDE or bot tester", required_for_level_2: false, note: "Optional comma-separated Feishu operator open_id allowlist." },
        { key: "IMAGE_AGENT_TIMEOUT_MS", owner: "FDE", required_for_level_2: false, note: "Optional target HTTP timeout in milliseconds; default 120000." },
        { key: "TEST_CHAT_ID", owner: "FDE or bot tester", required_for_level_2: false, note: "Optional chat id for sending the start card in manual Level 2." },
      ] : [
        {
          key: "APP_ID",
          owner: "Feishu app owner",
          required_for_level_2: true,
          note: "Application ID from the Feishu developer console.",
        },
        {
          key: "APP_SECRET",
          owner: "Feishu app owner",
          required_for_level_2: true,
          note: "Application secret. Share through a secure channel; do not paste it into chat history.",
        },
        {
          key: "VERIFICATION_TOKEN",
          owner: "Feishu app owner",
          required_for_level_2: hostReceiveMode !== "embedded-long-connection",
          note: hostReceiveMode === "embedded-long-connection"
            ? "Optional for long-connection hosts; needed only for webhook or hybrid callback verification."
            : "Callback verification token configured for the app.",
        },
        {
          key: "ENCRYPT_KEY",
          owner: "Feishu app owner",
          required_for_level_2: false,
          note: "Only needed when encrypted callbacks are enabled in Feishu.",
        },
        {
          key: "TEST_CHAT_ID",
          owner: "FDE or bot tester",
          required_for_level_2: true,
          note: "Chat receive id where the bot has been added and can send messages.",
        },
        {
          key: "PUBLIC_CALLBACK_BASE_URL",
          owner: "FDE or infrastructure owner",
          required_for_level_2: hostReceiveMode !== "embedded-long-connection",
          note: hostReceiveMode === "embedded-long-connection"
            ? "Optional for long-connection hosts; needed only for webhook or hybrid callback verification."
            : "Public HTTPS base URL that routes to the generated bot runtime or embedded webhook host.",
        },
        {
          key: "IMAGE_AGENT_BASE_URL",
          owner: "Target service owner",
          required_for_level_2: true,
          note: `Reachable base URL for ${service.service.name}; Lark-deployer does not start this service.`,
        },
      ],
      permission_confirmations: [
        ...permissions.scopes.map((scope) => ({
          item: scope.scope,
          reason: scope.reason,
          risk: scope.risk,
          owner: "Feishu permission admin",
          security: [],
        })),
        ...(selfHosted ? [{
          item: "card.action.trigger",
          reason: "The Python feishu-host receives card actions through Feishu SDK long connection.",
          risk: "n/a" as const,
          owner: "Feishu app owner or FDE",
          security: ["long_connection", "FEISHU_CONNECTION_MODE=websocket"],
        }] : permissions.callbacks.map((callback) => ({
          item: callback.callback,
          reason: callback.reason,
          risk: "n/a" as const,
          owner: "Feishu app owner or FDE",
          security: callback.security,
        }))),
      ],
      runtime_choices: selfHosted ? [
        { key: "FEISHU_CONNECTION_MODE", recommended_value: "websocket", note: "Required; self-hosted-runtime uses Feishu SDK long connection." },
        { key: "IMAGE_AGENT_TIMEOUT_MS", recommended_value: "120000", note: "Target HTTP timeout used by service_client.py." },
        { key: "FEISHU_ALLOWED_USERS", recommended_value: "<comma-separated open_id allowlist for real group use>", note: "Optional operator authorization guard." },
        { key: "TEST_CHAT_ID", recommended_value: "<chat id for manual start-card send>", note: "Optional until app.py send-start-card flow is used." },
      ] : [
        {
          key: "CARD_ACTION_MODE",
          recommended_value: "sync",
          note: "Use sync for fast target calls. Use async for slow calls; async requires message update permission.",
        },
        {
          key: "UPLOAD_IMAGE_TO_LARK",
          recommended_value: "1",
          note: "Upload result images to Feishu when credentials and resource-upload permission are available.",
        },
        {
          key: "IMAGE_AGENT_TIMEOUT_MS",
          recommended_value: "120000",
          note: "Target service call and image download timeout. Increase for slow model calls; keep finite so Feishu callbacks return readable failures.",
        },
        {
          key: "DEBUG_ACCESS_TOKEN",
          recommended_value: "<random secret before public exposure>",
          note: "Protect /debug/* endpoints when the runtime is reachable through a public callback URL. If left empty while PUBLIC_CALLBACK_BASE_URL and debug endpoints are enabled, configure generates one.",
        },
        {
          key: "ALLOWED_OPERATOR_OPEN_IDS",
          recommended_value: "<comma-separated open_id allowlist for real group use>",
          note: "Optional runtime authorization guard. When set, only listed Feishu operator open_id values can execute card actions.",
        },
      ],
      generated_package_hint: defaultGeneratedPackage,
      verification_commands: projectRootCommands,
      command_sets: [
        {
          name: "project_root",
          cwd_hint: "Run from the Lark-deployer project root.",
          commands: projectRootCommands,
        },
        {
          name: "generated_package_root",
          cwd_hint: "Run from the generated package root. The CLI path is generated for this package location.",
          commands: packageRootCommands,
        },
        {
          name: "moved_package_root",
          cwd_hint: "Run from the generated package root after it has been copied elsewhere. Set LARK_DEPLOYER_CLI to the absolute path of the built Lark-deployer CLI.",
          commands: movedPackageCommands,
        },
      ],
    },
    readiness_questions: [
      {
        id: "target_service_running",
        question: `Can the bot runtime reach ${service.service.base_url || "<target base URL>"} from its runtime environment?`,
        required_for_level_2: true,
      },
      {
        id: "existing_feishu_app",
        question: "Can the operator provide an existing Feishu custom app APP_ID and APP_SECRET?",
        required_for_level_2: true,
      },
      {
        id: "app_permission_admin",
        question: "Can the operator or app owner apply the required scopes and publish the app version?",
        required_for_level_2: true,
      },
      {
        id: "callback_public_url",
        question: selfHosted
          ? "Can the operator run feishu-host as a Python process with FEISHU_CONNECTION_MODE=websocket and subscribe the Feishu app to card.action.trigger?"
          : hostReceiveMode === "embedded-long-connection"
          ? "Can the operator keep a Feishu SDK long-connection host online and subscribed to card.action.trigger?"
          : hybrid
            ? "Can the operator provide both a public callback base URL for /webhook/card and a Feishu SDK long-connection host subscribed to card.action.trigger?"
          : "Can the operator provide a public callback base URL that points to the generated bot runtime or embedded webhook host, then configure the Feishu card callback URL as <PUBLIC_CALLBACK_BASE_URL>/webhook/card?",
        required_for_level_2: true,
      },
      {
        id: "test_chat",
        question: "Can the bot be added to a test chat and send messages there?",
        required_for_level_2: true,
      },
      {
        id: "auto_registration",
        question: "If no existing app context is available, is the operator allowed to try SDK-assisted app registration later?",
        required_for_level_2: false,
      },
    ],
  };
}

export function buildContextMarkdown(template: ContextTemplate): string {
  const embedded = contextTemplateUsesEmbeddedAdapter(template);
  const selfHosted = template.integration_mode === "self-hosted-runtime";
  const longConnection = template.host_receive_mode === "embedded-long-connection";
  const hybrid = template.host_receive_mode === "hybrid";
  const requiredRows = template.handoff_request.required_values
    .map((item) => `| ${item.key} | ${item.owner} | ${item.required_for_level_2 ? "yes" : "optional"} | ${item.note} |`)
    .join("\n");
  const confirmationRows = template.handoff_request.permission_confirmations
    .map((item) => `| ${item.item} | ${item.reason} |`)
    .join("\n");
  const runtimeRows = template.handoff_request.runtime_choices
    .map((item) => `| ${item.key} | ${item.recommended_value} | ${item.note} |`)
    .join("\n");
  const runtimeConfigRows = [
    ["HOST", template.runtime_config.host, "Runtime HTTP bind host."],
    ["PORT", String(template.runtime_config.port), "Runtime HTTP port."],
    ["UPLOAD_IMAGE_TO_LARK", template.runtime_config.upload_image_to_lark ? "1" : "0", "Upload result images to Feishu when possible."],
    ["IMAGE_AGENT_TIMEOUT_MS", String(template.runtime_config.target_timeout_seconds * 1000), "Target call and image download timeout in milliseconds."],
    ["CARD_ACTION_MODE", template.runtime_config.card_action_mode, "sync waits for the target call; async patches the original card later."],
    ["FEISHU_OPENAPI_BASE_URL", template.runtime_config.feishu_openapi_base_url || "<default Feishu OpenAPI>", "Override only for local mocks or special environments."],
    ["DEBUG_ACCESS_TOKEN", template.runtime_config.debug_access_token ? "<provided>" : "<empty>", "Optional token required for /debug/* endpoints when set. Do not paste the real value into chat."],
    ["ALLOWED_OPERATOR_OPEN_IDS", template.runtime_config.allowed_operator_open_ids.length ? `${template.runtime_config.allowed_operator_open_ids.length} configured` : "<empty>", "Optional comma-separated operator open_id allowlist for card actions."],
    ["ALLOW_DEBUG_WITHOUT_FEISHU", template.runtime_config.allow_debug_without_feishu ? "1" : "0", "Allow local debug endpoints before real Feishu credentials are filled."],
  ].map((item) => `| ${item[0]} | ${item[1]} | ${item[2]} |`).join("\n");
  const commandSections = template.handoff_request.command_sets
    .map((set) => `### ${humanizeCommandSetName(set.name)}

${set.cwd_hint}

${set.commands.map((command) => `\`\`\`powershell\n${command}\n\`\`\``).join("\n\n")}`)
    .join("\n\n");
  const manualSteps = longConnection
    ? [
        "Enable bot capability in the Feishu developer console.",
        "Apply message send, optional message update, and resource upload scopes.",
        "Keep the Feishu SDK long connection online and subscribe to card.action.trigger.",
        "Publish the app version after permission or event-subscription changes.",
        "Add the bot to the test chat and confirm it can send messages.",
      ]
    : hybrid
      ? [
          ...template.required_permissions.manual_steps,
          "Keep the Feishu SDK long connection online and subscribe to card.action.trigger.",
        ]
    : template.required_permissions.manual_steps;
  const feishuAppValueRows = selfHosted
    ? [
        "FEISHU_APP_ID",
        "FEISHU_APP_SECRET",
        "FEISHU_CONNECTION_MODE=websocket",
        "IMAGE_AGENT_BASE_URL",
        "optional FEISHU_ALLOWED_USERS",
        "IMAGE_AGENT_TIMEOUT_MS",
        "optional TEST_CHAT_ID",
      ]
    : longConnection
    ? [
        "APP_ID",
        "APP_SECRET",
        "TEST_CHAT_ID",
        "IMAGE_AGENT_BASE_URL or equivalent target base URL in the host config",
        "Long-connection host/gateway lifecycle owner",
      ]
    : hybrid
      ? [
          "APP_ID",
          "APP_SECRET",
          "VERIFICATION_TOKEN",
          "ENCRYPT_KEY, if encrypted callbacks are enabled",
          "TEST_CHAT_ID",
          "PUBLIC_CALLBACK_BASE_URL",
          "Long-connection host/gateway lifecycle owner",
        ]
    : [
        "APP_ID",
        "APP_SECRET",
        "VERIFICATION_TOKEN",
        "ENCRYPT_KEY, if encrypted callbacks are enabled",
        "TEST_CHAT_ID",
        "PUBLIC_CALLBACK_BASE_URL",
      ];

  return `# Feishu Context Template

This file is for collecting external context before real Feishu Level 2 verification.

## Target Service

- Name: ${template.target_service.name}
- Base URL: ${template.target_service.base_url || "<not provided>"}
- Managed by Lark-deployer: false

## Questions

${template.readiness_questions.map((item) => `- [ ] ${item.question}`).join("\n")}

## Copy/Paste Request

Send this section to: ${template.handoff_request.recipient_hint}

Please provide the following values and confirmations for the generated Lark-deployer package. Secrets should be shared through a secure channel, not pasted into normal chat.${longConnection ? " This package uses long connection delivery, so card actions arrive through the Feishu SDK `card.action.trigger` subscription instead of a webhook-only callback route." : ""}

Generated package path hint: \`${template.handoff_request.generated_package_hint}\`

Do not leave placeholder strings such as \`<APP_ID>\`, \`{{VERIFICATION_TOKEN}}\`, or \`\${TEST_CHAT_ID}\` in the filled context. \`configure --strict --dry-run\` treats placeholder-shaped values as missing.

### Required Values

| Key | Expected owner | Required for Level 2 | Note |
| --- | --- | --- | --- |
${requiredRows}

### Permission and Callback Confirmations

| Item | Why it is needed |
| --- | --- |
${confirmationRows}

### Runtime Choices

| Key | Recommended value | Note |
| --- | --- | --- |
${runtimeRows}

## Feishu App Values

${selfHosted ? "Fill these in `feishu-host/.env` after copying `feishu-host/.env.example`:" : embedded ? "Fill these in `feishu_context.template.json` or the existing host service's secret/config system:" : "Fill these in `feishu_context.template.json` or generated `bot-runtime/.env`:"}

${feishuAppValueRows.map((item) => `- ${item}`).join("\n")}

## Runtime Config Values

${selfHosted ? "These values document the Python feishu-host runtime contract:" : embedded ? "These values document the existing host service runtime contract for adapter integration:" : "These values are read from `runtime_config` when `configure` writes `bot-runtime/.env`:"}

| Env key | Current value | Note |
| --- | --- | --- |
${runtimeConfigRows}

## Required Scopes

${template.required_permissions.scopes.map((scope) => `- ${scope}`).join("\n")}

## Required Callbacks

${template.required_permissions.callbacks.map((callback) => `- ${callback}`).join("\n")}

## Manual Steps

${manualSteps.map((step) => `- [ ] ${step}`).join("\n")}

## Verification Commands

${commandSections}
`;
}

export function buildContextRequestMarkdown(template: ContextTemplate): string {
  const embedded = contextTemplateUsesEmbeddedAdapter(template);
  const selfHosted = template.integration_mode === "self-hosted-runtime";
  const longConnection = template.host_receive_mode === "embedded-long-connection";
  const hybrid = template.host_receive_mode === "hybrid";
  const requiredRows = template.handoff_request.required_values
    .map((item) => {
      const handling = secretValueKeys.has(item.key)
        ? "Confirm availability here; send the actual value through a secure secret channel."
        : "Can be shared in the filled context file or deployment notes.";
      return `| ${item.key} | ${item.owner} | ${item.required_for_level_2 ? "yes" : "optional"} | ${handling} | ${item.note} |`;
    })
    .join("\n");
  const permissionRows = template.handoff_request.permission_confirmations
    .map((item) => {
      const security = item.security?.length ? item.security.join(", ") : "n/a";
      return `| ${item.item} | ${item.owner || "Feishu app owner"} | ${item.risk || "n/a"} | ${security} | ${item.reason} |`;
    })
    .join("\n");
  const runtimeRows = template.handoff_request.runtime_choices
    .map((item) => `| ${item.key} | ${item.recommended_value} | ${item.note} |`)
    .join("\n");
  const setupRows = selfHosted ? [
    "Can provide or create a Feishu custom app for this test.",
    "Can enable bot capability and add the bot to the test chat if TEST_CHAT_ID is used.",
    "Can grant or request the listed scopes, then publish the app version.",
    "Can enable long connection and subscribe to card.action.trigger.",
    `Can keep ${template.target_service.name} reachable from feishu-host during local contract and Level 2 verification.`,
  ].map((item) => `- [ ] ${item}`).join("\n") : [
    "Can provide or create a Feishu custom app for this test.",
    "Can enable bot capability and add the bot to the test chat.",
    "Can grant or request the listed scopes, then publish the app version.",
    longConnection ? "Can keep the Feishu SDK long connection online and subscribed to card.action.trigger." : hybrid ? "Can configure the Feishu card callback URL as `<PUBLIC_CALLBACK_BASE_URL>/webhook/card` and keep the SDK long connection subscribed to card.action.trigger." : "Can configure the Feishu card callback URL as `<PUBLIC_CALLBACK_BASE_URL>/webhook/card` and set the verification token.",
    longConnection ? "Can provide host deployment details for the long-connection gateway/sidecar." : hybrid ? "Can provide both the public HTTPS callback base URL and long-connection gateway/sidecar owner." : embedded ? "Can provide a public HTTPS callback base URL that routes to the existing Feishu SDK host." : "Can provide a public HTTPS callback base URL that routes to the bot runtime.",
    embedded ? `Can keep ${template.target_service.name} reachable from the existing host during Level 2 verification.` : `Can keep ${template.target_service.name} reachable from the bot runtime during Level 2 verification.`,
  ].map((item) => `- [ ] ${item}`).join("\n");

  return `# Feishu Context Request

Use this file as the owner-facing request before real Level 2 verification.

## Target

- Service: ${template.target_service.name}
- Current target base URL: ${template.target_service.base_url || "<to be confirmed>"}
- Generated package hint: \`${template.handoff_request.generated_package_hint}\`
- Lark-deployer owns build, verification, and handoff artifacts only; the target service stays externally managed.

## Request

Please confirm whether you can provide or configure the values, permissions, callback, and test chat below. Do not paste real secrets into normal chat or shared Markdown; use a secure secret channel for secret values.
${selfHosted ? "When filling `feishu-host/.env`, replace placeholder strings completely. `verify --mode self-hosted-runtime --strict` checks generated specs, Python compilation, the local contract test, and app.py --selfcheck." : embedded ? "When filling `feishu_context.local.json` or the existing host service's secret/config system, replace placeholder strings completely; adapter verification treats values like `<APP_ID>`, `{{VERIFICATION_TOKEN}}`, and `${TEST_CHAT_ID}` as missing." : "When filling `feishu_context.local.json` or `bot-runtime/.env`, replace placeholder strings completely; `configure --strict --dry-run` treats values like `<APP_ID>`, `{{VERIFICATION_TOKEN}}`, and `${TEST_CHAT_ID}` as missing."}

## Required Values

| Key | Expected owner | Required for Level 2 | Handling | Note |
| --- | --- | --- | --- | --- |
${requiredRows}

## Permissions And Callbacks

| Item | Expected owner | Risk | Security | Why it is needed |
| --- | --- | --- | --- | --- |
${permissionRows}

## Runtime Choices To Confirm

| Key | Recommended value | Note |
| --- | --- | --- |
${runtimeRows}

## Setup Confirmations

${setupRows}

## Suggested Reply Without Secrets

\`\`\`text
can_provide_existing_app_context: yes/no
can_grant_permissions: yes/no
${selfHosted ? "long_connection_enabled: yes/no\ncard_action_trigger_subscribed: yes/no" : `can_configure_card_callback: yes/no\n${longConnection ? "long_connection_online: yes/no" : hybrid ? "card_callback_url_configured: <PUBLIC_CALLBACK_BASE_URL>/webhook/card yes/no\nlong_connection_online: yes/no" : "card_callback_url_configured: <PUBLIC_CALLBACK_BASE_URL>/webhook/card yes/no"}`}
can_add_bot_to_test_chat: yes/no
secure_secret_channel: ${selfHosted || longConnection ? "<how app secret will be shared>" : "<how APP_SECRET / VERIFICATION_TOKEN / ENCRYPT_KEY will be shared>"}
target_base_url: <reachable URL or owner>
${selfHosted ? "feishu_host_owner: <owner or deployment note>" : longConnection ? "long_connection_gateway_owner: <owner or deployment note>" : hybrid ? "public_callback_base_url: <HTTPS URL or tunnel owner>\nlong_connection_gateway_owner: <owner or deployment note>" : "public_callback_base_url: <HTTPS URL or tunnel owner>"}
test_chat_id_available: yes/no
blocked_by: <missing owner, permission, network, or policy constraint>
\`\`\`

${selfHosted ? "After the non-secret answers are confirmed, fill `feishu-host/.env`, run `python feishu-host/local_contract_test.py`, run `python feishu-host/app.py --selfcheck`, then run `verify --mode self-hosted-runtime --strict`." : embedded ? `After the non-secret answers are confirmed, mount the adapter in the existing Feishu SDK host, then run \`verify --mode embedded-adapter${longConnection ? " --host-mode embedded-long-connection" : ""} --host-runtime-url <host_runtime_url> --simulate\` and record real Feishu evidence in \`level2_verification_record.md\`.` : "After the non-secret answers are confirmed, fill `feishu_context.local.json` or `bot-runtime/.env` locally and run `configure`, `verify --level2`, and `evidence --update-record`."}
`;
}

function contextTemplateUsesEmbeddedAdapter(template: ContextTemplate): boolean {
  return template.handoff_request.command_sets.some((set) => (
    set.commands.some((command) => command.includes("--mode embedded-adapter"))
  ));
}

export function buildContextReplyTemplate(template: ContextTemplate): ContextReplyTemplate {
  const embedded = contextTemplateUsesEmbeddedAdapter(template);
  const selfHosted = template.integration_mode === "self-hosted-runtime";
  const longConnection = template.host_receive_mode === "embedded-long-connection";
  const hybrid = template.host_receive_mode === "hybrid";
  const hostModeOption = template.host_receive_mode && template.host_receive_mode !== "embedded-webhook" && template.host_receive_mode !== "standalone-runtime"
    ? ` --host-mode ${template.host_receive_mode}`
    : "";
  return {
    schema_version: "0.1",
    purpose: selfHosted ? "Record non-secret Feishu/Lark owner answers before filling feishu-host/.env and running self-hosted verification." : "Record non-secret Feishu/Lark owner answers before filling local credentials and running configure --strict --dry-run.",
    generated_package_hint: template.handoff_request.generated_package_hint,
    target_service: {
      name: template.target_service.name,
      base_url: template.target_service.base_url,
    },
    responder: {
      name: "",
      role: "",
      contact: "",
    },
    answers: {
      can_provide_existing_app_context: null,
      can_grant_permissions: null,
      can_configure_card_callback: null,
      card_callback_url_configured: null,
      can_add_bot_to_test_chat: null,
      can_keep_target_reachable: null,
    },
    public_values: {
      feishu_app_name: "",
      test_chat_id: "",
      public_callback_base_url: "",
      target_base_url: template.target_service.base_url || "",
    },
    secure_secret_channel: "",
    permission_confirmations: template.handoff_request.permission_confirmations.map((item) => ({
      item: item.item,
      status: "unknown",
      owner: item.owner || "Feishu app owner",
      note: item.reason,
    })),
    runtime_choices: template.handoff_request.runtime_choices.map((item) => ({
      key: item.key,
      accepted: null,
      selected_value: item.recommended_value,
      note: item.note,
    })),
    blocked_by: [],
    next_local_steps: selfHosted
      ? [
          "Copy feishu-host/.env.example to feishu-host/.env and fill FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_CONNECTION_MODE=websocket, IMAGE_AGENT_BASE_URL, and optional FEISHU_ALLOWED_USERS/IMAGE_AGENT_TIMEOUT_MS/TEST_CHAT_ID.",
          "Run python -m pip install -r feishu-host/requirements.txt.",
          "Run python feishu-host/local_contract_test.py.",
          "Run python feishu-host/app.py --selfcheck.",
          "Run verify --mode self-hosted-runtime --strict, then record real Feishu evidence in level2_verification_record.md when available.",
        ]
      : embedded
      ? [
          "Run init-local --context --reply, or copy feishu_context.template.json to feishu_context.local.json manually.",
          longConnection
            ? "Fill APP_ID, APP_SECRET, TEST_CHAT_ID, and target base URL in the existing long-connection host service's secret/config system. Do not put secrets in this reply template."
            : hybrid
              ? "Fill APP_ID, APP_SECRET, VERIFICATION_TOKEN, TEST_CHAT_ID, PUBLIC_CALLBACK_BASE_URL, long-connection gateway owner, and target base URL in the existing host service's secret/config system. Do not put secrets in this reply template."
            : "Fill APP_ID, APP_SECRET, VERIFICATION_TOKEN, TEST_CHAT_ID, PUBLIC_CALLBACK_BASE_URL, and target base URL in the existing host service's secret/config system. Do not put secrets in this reply template.",
          "Mount the generated adapter in the existing Feishu SDK host.",
          `Run verify --mode embedded-adapter${hostModeOption} --host-runtime-url <host_runtime_url> --simulate, then record real Feishu evidence in level2_verification_record.md.`,
        ]
      : [
          "Run init-local --context --reply, or copy feishu_context.template.json to feishu_context.local.json manually.",
          "Fill APP_ID, APP_SECRET, VERIFICATION_TOKEN, TEST_CHAT_ID, PUBLIC_CALLBACK_BASE_URL, and target base URL locally. Do not put secrets in this reply template.",
          "Run configure --strict --dry-run and review configure_report.md before writing bot-runtime/.env.",
          "Run configure --strict, start the generated bot runtime, then run verify --level2.",
        ],
    secret_red_lines: [
      selfHosted ? "Do not paste FEISHU_APP_SECRET into this reply template." : "Do not paste APP_SECRET, VERIFICATION_TOKEN, ENCRYPT_KEY, or DEBUG_ACCESS_TOKEN into this reply template.",
      "Share secrets only through the secure_secret_channel named here.",
      "Do not replace empty secret fields in shared Markdown with real secret values.",
    ],
  };
}

export function buildContextReplyMarkdown(reply: ContextReplyTemplate): string {
  const answers = Object.entries(reply.answers)
    .map(([key, value]) => `| ${key} | ${value === null ? "unknown" : value ? "yes" : "no"} |`)
    .join("\n");
  const publicRows = Object.entries(reply.public_values)
    .map(([key, value]) => `| ${key} | ${value || "<empty>"} |`)
    .join("\n");
  const permissionRows = reply.permission_confirmations
    .map((item) => `| ${item.item} | ${item.status} | ${item.owner} | ${escapeMarkdownTableCell(item.note)} |`)
    .join("\n");
  const runtimeRows = reply.runtime_choices
    .map((item) => `| ${item.key} | ${item.accepted === null ? "unknown" : item.accepted ? "yes" : "no"} | ${item.selected_value || "<empty>"} | ${escapeMarkdownTableCell(item.note)} |`)
    .join("\n");
  const blockedBy = reply.blocked_by.length ? reply.blocked_by.map((item) => `- ${item}`).join("\n") : "- none";
  const nextSteps = reply.next_local_steps.map((item) => `- [ ] ${item}`).join("\n");
  const redLines = reply.secret_red_lines.map((item) => `- ${item}`).join("\n");

  return `# Feishu Context Reply Template

Use this safe reply template to record non-secret owner answers. Copy it to \`feishu_context.reply.local.json\` or \`feishu_context.reply.local.md\` before filling local-only details.

- Generated package hint: \`${reply.generated_package_hint}\`
- Target service: ${reply.target_service.name}
- Target base URL: ${reply.target_service.base_url || "<to be confirmed>"}
- Responder: ${reply.responder.name || "<name>"} (${reply.responder.role || "<role>"})
- Secure secret channel: ${reply.secure_secret_channel || "<required before APP_SECRET / VERIFICATION_TOKEN are shared>"}

## Answers

| Question | Answer |
| --- | --- |
${answers}

## Public Values

| Key | Value |
| --- | --- |
${publicRows}

## Permission Confirmations

| Item | Status | Owner | Note |
| --- | --- | --- | --- |
${permissionRows}

## Runtime Choices

| Key | Accepted | Selected value | Note |
| --- | --- | --- | --- |
${runtimeRows}

## Blocked By

${blockedBy}

## Next Local Steps

${nextSteps}

## Secret Red Lines

${redLines}
`;
}

const secretValueKeys = new Set(["APP_SECRET", "FEISHU_APP_SECRET", "VERIFICATION_TOKEN", "ENCRYPT_KEY"]);

function contextRequestFilePath(outFile: string): string {
  if (/\.template\.json$/i.test(outFile)) {
    return outFile.replace(/\.template\.json$/i, ".request.md");
  }
  return outFile.replace(/\.json$/i, ".request.md");
}

function contextReplyFilePath(outFile: string): string {
  if (/\.template\.json$/i.test(outFile)) {
    return outFile.replace(/\.template\.json$/i, ".reply.template.json");
  }
  return outFile.replace(/\.json$/i, ".reply.template.json");
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function humanizeCommandSetName(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function quoteCommandArg(value: string): string {
  if (!value) return "\"\"";
  if (/[\s"'#]/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}
