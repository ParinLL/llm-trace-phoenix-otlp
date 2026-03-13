/**
 * llm-trace-phoenix-otlp
 * OpenClaw plugin: intercepts llm_input / llm_output hooks and forwards
 * traces to Arize Phoenix using standard OpenTelemetry OTLP gRPC.
 */

import type {
  OpenClawPluginApi,
} from "openclaw/plugin-sdk";
import { trace, SpanStatusCode, SpanKind, type Span } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { Metadata } from "@grpc/grpc-js";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

// ── Types ────────────────────────────────────────────────────────────────────

interface PluginConfig {
  phoenixGrpcUrl?: string;
  projectName?: string;
}

// ── In-memory store for pending LLM inputs (keyed by runId) ─────────────────

const pendingInputs = new Map<string, Span>();

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildMessages(
  systemPrompt: string | undefined,
  history: unknown[],
  userPrompt: string
): string {
  const msgs: Array<{ role: string; content: string }> = [];
  if (systemPrompt) msgs.push({ role: "system", content: systemPrompt });
  for (const m of history as Array<Record<string, unknown>>) {
    const role = typeof m.role === "string" ? m.role : "user";
    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "");
    msgs.push({ role, content });
  }
  msgs.push({ role: "user", content: userPrompt });
  return JSON.stringify(msgs);
}

// ── Plugin entry point ────────────────────────────────────────────────────────

export default function plugin(api: OpenClawPluginApi): void {
  const cfg = (api.pluginConfig ?? {}) as PluginConfig;
  const phoenixGrpcUrl = cfg.phoenixGrpcUrl ?? "http://localhost:4317";
  const projectName = cfg.projectName ?? "openclaw";

  api.logger.info(`[phoenix-otlp] tracing via gRPC → ${phoenixGrpcUrl} (project: ${projectName})`);

  // gRPC metadata: some Phoenix versions use this header for project routing
  const metadata = new Metadata();
  metadata.add("x-phoenix-project-name", projectName);

  const exporter = new OTLPTraceExporter({
    url: phoenixGrpcUrl,
    metadata,
  });

  const sdk = new NodeSDK({
    // Resource-level project name: primary mechanism for OTLP gRPC project routing in Phoenix
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: projectName,
      "openinference.project.name": projectName,
      "project.name": projectName,
    }),
    traceExporter: exporter,
  });

  sdk.start();

  const tracer = trace.getTracer("openclaw-llm-tracer");

  api.on("llm_input", (event: any, _ctx: any) => {
    const spanName = `${event.provider}/${event.model}`;
    const span = tracer.startSpan(spanName, {
      kind: SpanKind.CLIENT,
      attributes: {
        "openinference.span.kind": "LLM",
        "llm.model_name": event.model,
        "llm.provider": event.provider,
        "session.id": event.sessionId,
      },
    });

    if (_ctx.agentId) span.setAttribute("tag.agent_id", _ctx.agentId);

    const inputMessages = buildMessages(event.systemPrompt, event.historyMessages, event.prompt);
    span.setAttribute("input.value", inputMessages);
    span.setAttribute("llm.input_messages", inputMessages);

    pendingInputs.set(event.runId, span);
  });

  api.on("llm_output", (event: any, _ctx: any) => {
    const span = pendingInputs.get(event.runId);
    if (!span) return;
    pendingInputs.delete(event.runId);
    try {
      const outputText = event.assistantTexts.join("\n");
      const outputMessages = JSON.stringify(
        event.assistantTexts.map((t: string) => ({ role: "assistant", content: t }))
      );
      span.setAttribute("output.value", outputText);
      span.setAttribute("llm.output_messages", outputMessages);
      if (event.usage?.input != null) span.setAttribute("llm.token_count.prompt", event.usage.input);
      if (event.usage?.output != null) span.setAttribute("llm.token_count.completion", event.usage.output);
      if (event.usage?.total != null) span.setAttribute("llm.token_count.total", event.usage.total);
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      api.logger.warn(`[phoenix-otlp] trace error: ${err}`);
    } finally {
      span.end();
    }
  });
}
