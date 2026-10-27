# CLI: shop-admin orders
## Synopsis
`shop-admin orders list [--state <state>] [--json]`
## Arguments and options
| name | type | default | meaning |
|---|---|---|---|
| --state | placed\|paid\|… | all | filter by state |
## Output
Text table; with `--json` an array of `order.schema.json` objects on stdout.
## Exit codes
| code | meaning |
|---|---|
| 0 | ok |
| 1 | no orders matched |
| 2 | usage error |
