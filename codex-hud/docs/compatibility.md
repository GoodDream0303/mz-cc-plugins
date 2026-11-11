# Configuration compatibility

Native Codex statusline is unchanged. Model, effort, project and session-name fields default off. Exact-host automatic opening requires the one-time PowerShell entry and a configured portable psmux backend. The source bootstrap opens a waiting HUD; native SessionStart binds main-conversation data. Existing intentional false startup settings are preserved.

| Key | Default | Availability |
|---|---|---|
| language | "en" | Supported |
| lineLayout | "expanded" | Supported |
| showSeparators | false | Supported |
| pathLevels | 1 | Supported |
| maxWidth | 0 | Supported |
| forceMaxWidth | false | Reserved: rendering always respects the actual viewport width |
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
| display.showModel | false | Supported |
| display.showProject | false | Supported |
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
| display.showAgents | false | Supported |
| display.showTodos | false | Supported |
| display.showSessionName | false | Supported |
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
| colors.heading | "#bac2ce" | Current, Recent, Agents and Todo heading foreground |
| colors.custom | 208 | Supported |
| colors.barFilled | "█" | Supported |
| colors.barEmpty | "░" | Supported |
| terminal.paneSize | 0.22 | Supported |
| terminal.refreshMs | 1000 | Supported |
| terminal.margin | 4 | Supported |
| startup.enabled | true | Legacy preference; inherited only when host.autoStart is inherit |
| startup.window | "last" | Legacy value preserved; never used to route a real HUD |
| host.psmuxPath | "" | Absolute path to verified portable psmux 3.4.0 build 20aa1d7 |
| host.autoStart | "inherit" | inherit / enabled / disabled; explicit 0.4 override keeps legacy startup paused |

Unknown imported fields are retained without executing behavior. Legacy showSessionId is ignored. Claude-only billing/cache/Advisor/output-style values remain unavailable. Legacy MCP display/runtime settings are ignored; dedicated MCP presentation and live connection queries have been removed.
