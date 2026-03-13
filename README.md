# llm-trace-phoenix-otlp

OpenClaw plugin — sends all LLM input/output traces to [Arize Phoenix](https://phoenix.arize.com/) via **OpenTelemetry OTLP gRPC**.

## How it works

Hooks into `llm_input` and `llm_output` events. On input, opens an OTel span. On output, closes it with response data and token usage. Spans are batched and exported to Phoenix over gRPC.

Project routing uses:
- Resource attribute `openinference.project.name` (primary)
- gRPC metadata header `x-phoenix-project-name` (fallback)

## Configuration

In `openclaw.json`:

```json
{
  "plugins": {
    "allow": ["llm-trace-phoenix-otlp"],
    "entries": {
      "llm-trace-phoenix-otlp": {
        "enabled": true,
        "config": {
          "phoenixGrpcUrl": "http://localhost:4317",
          "projectName": "my-project"
        }
      }
    }
  }
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `phoenixGrpcUrl` | `http://localhost:4317` | Phoenix OTLP gRPC endpoint |
| `projectName` | `openclaw` | Project name shown in Phoenix UI |

## Span attributes

| Attribute | Description |
|-----------|-------------|
| `openinference.span.kind` | Always `LLM` |
| `llm.model_name` | Model identifier |
| `llm.provider` | Provider name |
| `llm.input_messages` | Full message history as JSON |
| `llm.output_messages` | Assistant response as JSON |
| `llm.token_count.prompt` | Input tokens |
| `llm.token_count.completion` | Output tokens |
| `llm.token_count.total` | Total tokens |
| `session.id` | OpenClaw session ID |
| `tag.agent_id` | Agent ID (if applicable) |

## Installation

All methods require enabling the plugin in `openclaw.json`:

```json
{
  "plugins": {
    "allow": ["llm-trace-phoenix-otlp"],
    "entries": {
      "llm-trace-phoenix-otlp": {
        "enabled": true,
        "config": {
          "phoenixGrpcUrl": "http://localhost:4317",
          "projectName": "my-project"
        }
      }
    }
  }
}
```

### Via OpenClaw CLI (recommended)

```bash
openclaw plugins install llm-trace-phoenix-otlp
```

### Direct install (global)

Clone into `~/.openclaw/extensions/` — OpenClaw discovers plugins there automatically:

```bash
cd ~/.openclaw/extensions
git clone https://github.com/ParinLL/llm-trace-phoenix-otlp.git
cd llm-trace-phoenix-otlp && npm install
```

### From local path

```bash
openclaw plugins install ./path/to/llm-trace-phoenix-otlp
```

No build step required — OpenClaw loads TypeScript directly at runtime.

## Development

```bash
npm install
```
