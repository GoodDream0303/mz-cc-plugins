# Friendly tool action labels

The user approved localized action names for the existing HUD tool rows.

| Tool | English | Simplified Chinese | Traditional Chinese |
| --- | --- | --- | --- |
| exec_command | Run command | 执行命令 | 執行命令 |
| exec | Run script | 运行脚本 | 執行腳本 |
| followup_task | Follow up on task | 跟进子任务 | 跟進子任務 |
| request_user_input_async | Ask user | 向你提问 | 向你提問 |
| clock.sleep | Wait | 短暂等待 | 短暫等待 |

Approaches considered: localized action names, category counts, and current-only
activity. The user chose action names and approved the English wording above.
Use the existing `language` setting. Keep current/recent sections, status symbols,
raw-name grouping, counts, limits and expiry behavior. Keep raw tool metadata for
diagnostics; unknown names remain sanitized original names. Apply the existing
name-length limit after translation. Recognize only the five known tools and
their actual core namespaces, never unrelated MCP or third-party suffix matches.
Only rendering changes; terminal input, clipboard and startup behavior stay at
the 0.7.2 baseline. No dependencies or configuration options are added.
