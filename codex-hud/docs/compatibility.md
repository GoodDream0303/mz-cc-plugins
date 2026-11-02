# Configuration compatibility

Labels default to English; task/session names are never translated. This interface follows claude-hud 0.8.0. Supported means a setting has a Codex display mapping; data may still be unavailable in a particular session.

| Key | Default | Availability |
|---|---|---|
| language | "en" | Supported |
| lineLayout | "expanded" | Supported |
| showSeparators | false | Supported |
| pathLevels | 1 | Supported |
| maxWidth | 0 | Supported |
| forceMaxWidth | false | Reserved: actual viewport width is always respected |
| elementOrder | ["project","addedDirs","context","usage","promptCache","memory","environment","tools","skills","mcp","agents","todos","sessionTime"] | Supported |
| projectLineOrder | [] | Supported |
| display.mergeGroups | [["context","usage"]] | Supported |
| display.rightAlign | [] | Supported |
| gitStatus.enabled | true | Supported |
| gitStatus.showDirty | true | Supported |
| gitStatus.showAheadBehind | false | Supported |
| gitStatus.showFileStats | false | Supported |
| gitStatus.branchOverflow | "truncate" | Supported |
| gitStatus.pushWarningThreshold | 0 | Supported |
| gitStatus.pushCriticalThreshold | 0 | Supported |
| display.showModel | true | Supported |
| display.showProject | true | Supported |
| display.showAddedDirs | false | Additional work directories are not reported |
| display.showContextBar | true | Supported |
| display.showConfigCounts | false | Loaded configuration counts are not reported |
| display.showCost | false | Authoritative billing data is unavailable |
| display.showRoutedCost | false | Authoritative billing data is unavailable |
| display.showDailyCost | false | Authoritative billing data is unavailable |
| display.showDuration | false | Supported |
| display.showSpeed | false | Reliable generation-only duration is unavailable |
| display.showTokenBreakdown | true | Supported |
| display.showUsage | true | Supported |
| display.usageBarEnabled | true | Supported |
| display.showResetLabel | true | Supported |
| display.usageCompact | false | Supported |
| display.showModelScopedUsage | false | Per-model quota data is unavailable |
| display.showTools | false | Supported |
| display.showSkills | false | Codex does not expose reliable active-Skill events |
| display.showMcp | false | Supported |
| display.showAgents | false | Supported |
| display.showTodos | false | Supported |
| display.showSessionName | false | Supported |
| display.showSessionId | false | Supported |
| display.showAuth | false | Supported |
| display.showAuthUser | false | Authentication credentials are not read |
| display.showCodexVersion | false | Supported |
| display.showEffortLevel | false | Supported |
| display.showMemoryUsage | false | Other-process memory inspection is not supported |
| display.showPromptCache | false | Codex does not expose authoritative cache expiry |
| display.showSessionTokens | false | Supported |
| display.showOutputStyle | false | Claude-specific setting |
| display.showSessionStartDate | false | Supported |
| display.showLastResponseAt | false | Supported |
| display.showCompactions | false | Supported |
| display.showProvider | false | Supported |
| display.showClockSeconds | false | Supported |
| display.showAdvisor | false | Claude-specific feature |
| display.contextValue | "percent" | Supported |
| display.usageValue | "percent" | Supported |
| display.effortFormat | "full" | Supported |
| display.modelFormat | "full" | Supported |
| display.timeFormat | "relative" | Supported |
| display.hourCycle | "auto" | Supported |
| display.customLinePosition | "last" | Supported |
| display.addedDirsLayout | "inline" | Supported |
| display.toolNameMaxLength | 0 | Supported |
| display.toolsMaxVisible | 4 | Supported |
| display.authUserLength | 8 | Supported |
| display.contextWarningThreshold | 70 | Supported |
| display.contextCriticalThreshold | 85 | Supported |
| display.usageThreshold | 0 | Supported |
| display.sevenDayThreshold | 80 | Supported |
| display.environmentThreshold | 0 | Supported |
| display.modelOverride | "" | Supported |
| display.providerName | "" | Supported |
| display.customLine | "" | Supported |
| display.advisorOverride | "" | Claude-specific feature |
| display.externalUsagePath | "" | Preserved only; external path I/O is disabled |
| display.externalUsageWritePath | "" | Preserved only; external path I/O is disabled |
| colors.context | "green" | Supported |
| colors.usage | "brightBlue" | Supported |
| colors.warning | "yellow" | Supported |
| colors.usageWarning | "brightMagenta" | Supported |
| colors.critical | "red" | Supported |
| colors.model | "cyan" | Supported |
| colors.project | "yellow" | Supported |
| colors.git | "magenta" | Supported |
| colors.gitBranch | "cyan" | Supported |
| colors.label | "dim" | Supported |
| colors.custom | 208 | Supported |
| colors.barFilled | "█" | Supported |
| colors.barEmpty | "░" | Supported |
| terminal.paneSize | 0.22 | Supported |
| terminal.refreshMs | 1000 | Supported |
| terminal.margin | 4 | Supported |

## Import-only and unavailable values

showClaudeCodeVersion maps to showCodexVersion. Unknown keys, jjStatus, modelSource, autocompactBuffer, autoCompactWindow, promptCacheTtlSeconds, advisor settings, and external usage settings are retained but do not activate unsupported behavior. No credentials or statusLine commands are imported.

MCP reports user-configured servers and observed calls; it does not claim connectivity. Skills activity, accurate cost, cache expiry, per-model quotas, process memory, and pure-generation speed are unavailable. Context has no Claude-specific autocompact buffer deduction.

forceMaxWidth is retained; viewport width always limits rendering. CLI configuration menus use English; the language setting controls optional HUD translations only.
