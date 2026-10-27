<!-- audience: dev — CLI contract skeleton (shared/formats/contracts.md). Only the commands this change adds or changes. -->
# CLI: {command}

## Synopsis
`{command} <subcommand> [<arg>] [--flag <value>] [--json]`

## Arguments and options
| name | type | default | meaning |
|---|---|---|---|
| `<arg>` | {type} | required | {meaning} |
| `--flag` | {type} | {default} | {meaning} |

## Input
{stdin / files read, encoding; "none"}

## Output
{stdout format (text and --json shape, schema: contracts/<name>.schema.json); stderr: diagnostics only}

## Exit codes
| code | meaning |
|---|---|
| 0 | success |
| 1 | {domain failure, e.g. validation failed} |
| 2 | usage error (bad arguments) |

## Compatibility
{stable flags/fields; what may change; deprecation path}
