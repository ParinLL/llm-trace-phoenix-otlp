# llm-trace-phoenix-otlp

OpenClaw plugin — sends all LLM input/output traces to [Arize Phoenix](https://phoenix.arize.com/) via **OpenTelemetry OTLP gRPC**.

> Inspired by and rewritten from [pingshian0131/openclaw-plugin-llm-trace-phoenix](https://github.com/pingshian0131/openclaw-plugin-llm-trace-phoenix).

## How it works

Hooks into `llm_input` and `llm_output` events. On input, opens an OTel span. On output, closes it with response data and token usage. Spans are batched and exported to Phoenix over gRPC.

Project routing uses:
- Resource attribute `openinference.project.name` (primary)
- gRPC metadata header `x-phoenix-project-name` (fallback)

## Prerequisites — Running Phoenix

This plugin requires a running [Arize Phoenix](https://github.com/Arize-ai/phoenix) instance that accepts OTLP gRPC traces on port `4317`.

The simplest way is Docker Compose with a Postgres backend:

```yaml
# compose.yaml
services:
  phoenix:
    image: arizephoenix/phoenix:latest
    depends_on:
      - db
    ports:
      - 6006:6006   # Phoenix UI
      - 4317:4317   # OTLP gRPC
      - 4318:4318   # OTLP HTTP
    environment:
      - PHOENIX_SQL_DATABASE_URL=postgresql://postgres:<password>@db:5432/postgres

  db:
    image: postgres:16
    restart: always
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=<password>
      - POSTGRES_DB=postgres
    volumes:
      - database_data:/var/lib/postgresql/data

volumes:
  database_data:
    driver: local
```

```bash
docker compose up -d
```

Phoenix UI will be available at `http://localhost:6006`. The default `phoenixGrpcUrl` of `http://localhost:4317` matches this setup.

## Installation

```bash
openclaw plugins install llm-trace-phoenix-otlp
```

Then enable the plugin in `openclaw.json`:

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

### Direct install

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

After installing or updating the plugin, restart the gateway to apply changes:

```bash
openclaw gateway restart
```

## Configuration

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
| `input.value` | Full message history as JSON |
| `llm.input_messages` | Full message history as JSON (alias) |
| `output.value` | Assistant response text |
| `llm.output_messages` | Assistant response as JSON (alias) |
| `llm.token_count.prompt` | Input tokens |
| `llm.token_count.completion` | Output tokens |
| `llm.token_count.total` | Total tokens |
| `session.id` | OpenClaw session ID |
| `tag.agent_id` | Agent ID (if applicable) |

## Development

```bash
npm install
```
