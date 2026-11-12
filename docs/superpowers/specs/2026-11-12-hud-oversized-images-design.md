# HUD oversized image results

The user approved fixing the diagnosed HUD warning and stuck tool state. A real
`response_item/custom_tool_call_output` contains four inline images (~2.97 MiB).
The current reader drops the entire record at 2 MiB and retains its warning.

Keep the ordinary JSONL path and its 2 MiB bound. Only on overflow, stream a
bounded projection that removes inline `data:image/` values of `image_url`
properties. Parse the resulting JSON through the existing identity and tool
lifecycle code. Do not retain image bodies, raise the limit, infer completion
from body text, introduce dependencies, or alter other sessions/installations.
This is preferable to raising a finite ceiling or merely hiding the warning:
both alternatives leave legitimate results vulnerable to loss.

The projection must validate discarded JSON string escapes/control characters,
honor chunk/read boundaries, and remain bounded when images cannot be removed.
Ordinary oversized non-image records retain the existing diagnostic. A damaged
record must not change tool/identity state; subsequent records still work.

Acceptance: four-image results finish the right call without a warning; failed
and pending executor headers retain their semantics; later token telemetry and
identity checks survive; incomplete/replaced/malformed logs do not leak state.
Use synthetic data for regressions and metadata-only replay of the diagnosed
real file. No publication, installation, cross-host action, or Codex changes.
