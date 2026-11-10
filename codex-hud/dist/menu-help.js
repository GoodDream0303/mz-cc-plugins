const text = (en, zh, tw = zh) => [en, zh, tw];
function local(copy, language) { return copy[language === 'en' ? 0 : language === 'zh-Hant' ? 2 : 1]; }
export function menuLanguage(value) { return value === 'zh-Hans' || value === 'zh-Hant' ? value : 'en'; }
const ui = {
    title: text('Codex HUD | 1 Layout  2 Display  3 Git  4 Colors  5 Terminal  6 Preset  7 Startup  v Preview  s Save  q Cancel', 'Codex HUD | 1 布局  2 显示  3 Git  4 颜色  5 终端  6 预设  7 启动  v 预览  s 保存  q 取消', 'Codex HUD | 1 版面  2 顯示  3 Git  4 色彩  5 終端  6 預設  7 啟動  v 預覽  s 儲存  q 取消'),
    select: text('Select an item or command, then Enter (n next, p previous, v preview, s save, q cancel; empty returns): ', '选择选项或命令后按回车（n 下一页，p 上一页，v 预览，s 保存，q 取消；直接回车返回）： ', '選擇選項或命令後按 Enter（n 下一頁，p 上一頁，v 預覽，s 儲存，q 取消；直接 Enter 返回）： '),
    firstPage: text('Already on the first page; use n for the next page.', '已是第一页；输入 n 后按回车进入下一页。', '已是第一頁；輸入 n 後按 Enter 進入下一頁。'),
    lastPage: text('Already on the last page; use p for the previous page.', '已是最后一页；输入 p 后按回车返回上一页。', '已是最後一頁；輸入 p 後按 Enter 返回上一頁。'),
    pageOnly: text('Choose a section before paging; v previews the HUD.', '请先进入分类再翻页；v 用于预览 HUD。', '請先進入分類再翻頁；v 用於預覽 HUD。'),
    example: text('Example', '示例', '範例'), inputExample: text('Input example', '输入示例', '輸入範例'), effect: text('Effect example', '效果示例', '效果範例'),
    current: text('Current value', '当前值', '目前值'), choices: text('Allowed values', '可选值', '可選值'), range: text('Range', '范围', '範圍'),
    newValue: text('new value (Enter to keep)', '新值（回车保持原值）', '新值（Enter 保留原值）'),
    unavailable: text('Unavailable', '不可用'), on: text('On', '开启', '開啟'), off: text('Off', '关闭', '關閉'),
    changed: text('Draft changed; Save to apply, Cancel to discard.', '已修改草稿；保存后生效，取消则放弃修改。', '已修改草稿；儲存後生效，取消則放棄修改。'),
    kept: text('Kept the current value.', '已保留当前值。', '已保留目前值。'),
    saved: text('Saved. Running HUDs reload automatically.', '已保存，运行中的 HUD 会自动加载。', '已儲存，執行中的 HUD 會自動載入。'),
    cancelled: text('Cancelled; no changes saved.', '已取消，未保存修改。', '已取消，未儲存修改。'),
    invalidSelection: text('Select one of the listed items.', '请输入列表中的选项编号。', '請輸入清單中的選項編號。'),
    preset: text('Preset (full / essential / minimal; Enter to keep): ', '预设（full / essential / minimal；回车保持原值）： ', '預設（full / essential / minimal；Enter 保留原值）： '),
    presetHelp: text('full: all available fields; essential: context, quota and session tokens; minimal: context only. Other settings stay unchanged.', 'full：所有可用显示项；essential：上下文、额度和会话 Token；minimal：仅上下文。其它设置不变。', 'full：所有可用顯示項；essential：上下文、額度和會話 Token；minimal：僅上下文。其他設定不變。'),
    invalidPreset: text('Choose full, essential or minimal.', '请输入 full、essential 或 minimal。', '請輸入 full、essential 或 minimal。'),
    invalidValue: text('Invalid value', '输入值无效', '輸入值無效'), outOfRange: text('Value is outside the allowed range', '输入值超出允许范围', '輸入值超出允許範圍'),
    invalidNumber: text('Enter a valid number within the range', '请输入范围内的有效数字', '請輸入範圍內的有效數字'),
    invalidArray: text('Enter a JSON array using the input example', '请按输入示例填写 JSON 数组', '請按輸入範例填寫 JSON 陣列'),
    invalidChoice: text('Choose one of the allowed values', '请输入列出的可选值', '請輸入列出的可選值')
};
export function menuText(language) { return Object.fromEntries(Object.entries(ui).map(([key, value]) => [key, local(value, language)])); }
// These compatibility values have no renderer effect, even though their schema
// accepts them. Keep their saved values, but do not offer them as working controls.
const inactiveOptions = new Set(['display.addedDirsLayout', 'display.authUserLength', 'display.environmentThreshold', 'colors.git', 'colors.usageWarning']);
export function menuOptionAvailable(definition) { return !definition.reason && !inactiveOptions.has(definition.key); }
const catalogue = {};
function add(key, zh, tw, example, en, cn, traditional = cn) { catalogue[key] = { labels: [zh, tw], example, effect: text(en, cn, traditional) }; }
add('language', '语言', '語言', 'zh-Hans', 'zh-Hans: Simplified Chinese menus and HUD labels; user task names stay as written.', 'zh-Hans：菜单和 HUD 标签使用简体中文，任务原文不变。', 'zh-Hans：選單與 HUD 標籤使用簡體中文，任務原文不變。');
add('lineLayout', '行布局', '行版面', 'compact', 'compact: arrange groups continuously; expanded: separate groups. Both wrap to the viewport.', 'compact：各组连续排列；expanded：按组分行。超宽时均会换行。', 'compact：各組連續排列；expanded：按組分行。超寬時均會換行。');
add('showSeparators', '分隔线', '分隔線', true, 'On: separate expanded groups with a line; compact mode adds no separator rows.', '开启：展开布局的组间增加分隔线；紧凑布局不增加分隔行。', '開啟：展開版面的組間增加分隔線；緊湊版面不增加分隔行。');
add('pathLevels', '目录层数', '目錄層數', 2, '2: projects/firmware; full: the complete project path.', '2：projects/firmware；full：完整项目路径。', '2：projects/firmware；full：完整專案路徑。');
add('maxWidth', '最大宽度', '最大寬度', 100, '100: cap width at 100 columns before the margin; 0: follow viewport width.', '100：宽度上限为 100 列，再扣除预留列数；0：跟随窗口宽度。', '100：寬度上限為 100 欄，再扣除預留欄數；0：跟隨視窗寬度。');
add('forceMaxWidth', '强制最大宽度', '強制最大寬度', false, 'Reserved; rendering respects the actual viewport.', '保留项；渲染遵守实际窗口宽度。', '保留項；呈現遵守實際視窗寬度。');
add('elementOrder', '元素顺序', '元素順序', ['project', 'context', 'usage', 'tools', 'todos'], 'Order project, context, quota, tools and todos first; other visible groups follow.', '依次显示项目、上下文、额度、工具、待办；其它可见组随后显示。', '依序顯示專案、上下文、額度、工具、待辦；其他可見組隨後顯示。');
add('projectLineOrder', '首行顺序', '首行順序', ['model', 'project', 'sessionName'], 'Show model, project and session name first when those fields are enabled.', '启用对应显示项后，首行优先显示模型、项目和会话名称。', '啟用對應顯示項後，首行優先顯示模型、專案和會話名稱。');
add('display.mergeGroups', '同行分组', '同行分組', [['context', 'usage']], 'Merge context and quota, wrapping when necessary.', '将上下文和额度合并，超宽时仍会换行。', '將上下文與額度合併，超寬時仍會換行。');
add('display.rightAlign', '靠右元素', '靠右元素', ['usage'], 'Right-align quota in a merged group when enough width is available.', '在合并组内宽度足够时，将额度靠右显示。', '在合併組內寬度足夠時，將額度靠右顯示。');
add('gitStatus.enabled', '显示 Git 信息', '顯示 Git 資訊', true, 'On: git:(main); off: hide Git metadata.', '开启：git:(main)；关闭：隐藏 Git 信息。', '開啟：git:(main)；關閉：隱藏 Git 資訊。');
add('gitStatus.showDirty', '修改标记', '修改標記', true, 'On: git:(main*) when the working tree has changes.', '开启：工作区有修改时显示 git:(main*)。', '開啟：工作區有修改時顯示 git:(main*)。');
add('gitStatus.showAheadBehind', '领先与落后', '領先與落後', true, 'On: git:(main ↑2 ↓1) when tracking counts are available.', '开启：存在跟踪信息时显示 git:(main ↑2 ↓1)。', '開啟：存在追蹤資訊時顯示 git:(main ↑2 ↓1)。');
add('gitStatus.showFileStats', '文件统计', '檔案統計', true, '!2 +1 ?3: modified, added and untracked file counts.', '!2 +1 ?3：分别表示修改、新增和未跟踪文件数。', '!2 +1 ?3：分別表示修改、新增和未追蹤檔案數。');
add('gitStatus.branchOverflow', '长分支名处理', '長分支名稱處理', 'truncate', 'truncate: shorten long branches; wrap: allow wrapping with the content.', 'truncate：截短长分支名；wrap：允许随内容换行。', 'truncate：截短長分支名稱；wrap：允許隨內容換行。');
for (const [key, zh, tw, value] of [['pushWarningThreshold', '未推送警告阈值', '未推送警告門檻', 3], ['pushCriticalThreshold', '未推送严重阈值', '未推送嚴重門檻', 10]])
    add('gitStatus.' + key, zh, tw, value, value + ' ahead commits: change branch color; 0: disable this threshold.', value + '：领先提交达到此数量时改变分支颜色；0：禁用本阈值。', value + '：領先提交達到此數量時改變分支色彩；0：停用此門檻。');
const flags = {
    showModel: ['模型', '模型', '[Codex Demo]'], showProject: ['项目', '專案', 'firmware'], showAddedDirs: ['附加目录', '附加目錄', ''],
    showContextBar: ['上下文进度条', '上下文進度條', 'Context: 25%'], showConfigCounts: ['已加载配置数量', '已載入設定數量', ''],
    showCost: ['费用', '費用', ''], showRoutedCost: ['路由费用', '路由費用', ''], showDailyCost: ['每日费用', '每日費用', ''],
    showDuration: ['会话时长', '會話時長', 'Duration 1h 20m'], showSpeed: ['生成速度', '生成速度', ''],
    showTokenBreakdown: ['Token 明细', 'Token 明細', 'in:42k cache:30k out:3k'], showUsage: ['额度', '額度', '5h: 25%'],
    usageBarEnabled: ['额度进度条', '額度進度條', ''], showResetLabel: ['重置标签', '重設標籤', ''], usageCompact: ['紧凑额度', '緊湊額度', ''],
    showModelScopedUsage: ['按模型统计额度', '按模型統計額度', ''], showTools: ['工具活动', '工具活動', '✓ exec_command'], showSkills: ['技能活动', '技能活動', ''],
    showMcp: ['MCP 信息', 'MCP 資訊', 'MCP: configured docs'], showAgents: ['子代理', '子代理', 'Agents: reviewer [running] (gpt-example)'],
    showTodos: ['待办进度', '待辦進度', 'Todo: Verify configuration (0/1)'], showSessionName: ['会话名称', '會話名稱', 'Session: Task name'],
    showAuth: ['订阅类型', '訂閱類型', 'pro'], showAuthUser: ['登录用户', '登入使用者', ''], showCodexVersion: ['Codex 版本', 'Codex 版本', 'Codex 0.166.0'],
    showEffortLevel: ['推理强度', '推理強度', '◕ high'], showMemoryUsage: ['内存占用', '記憶體用量', ''], showPromptCache: ['提示缓存', '提示快取', ''],
    showSessionTokens: ['会话累计 Token', '會話累計 Token', 'Session tokens 130k'], showOutputStyle: ['输出风格', '輸出風格', ''],
    showSessionStartDate: ['会话开始时间', '會話開始時間', 'Started 20m ago'], showLastResponseAt: ['最后响应时间', '最後回應時間', 'Last response 1m ago'],
    showCompactions: ['压缩次数', '壓縮次數', 'Compactions: 2'], showProvider: ['服务商', '服務商', 'openai'], showClockSeconds: ['时间中的秒数', '時間中的秒數', ''], showAdvisor: ['顾问模型', '顧問模型', '']
};
const samples = {
    showContextBar: text('Context: 25%', '上下文：25%'), showDuration: text('Duration 1h 20m', '时长 1h 20m', '時長 1h 20m'),
    showTodos: text('Todo: Verify configuration (0/1)', '待办：Verify configuration (0/1)', '待辦：Verify configuration (0/1)'),
    showSessionName: text('Session: Task name', '会话：Task name', '會話：Task name'), showAgents: text('Agents: reviewer [running] (gpt-example)', '子代理：reviewer [运行中] (gpt-example)', '子代理：reviewer [執行中] (gpt-example)'),
    showSessionTokens: text('Session tokens 130k', '会话 Token 130k', '會話 Token 130k'),
    showSessionStartDate: text('Started 20m ago', '开始 20m前', '開始 20m前'), showLastResponseAt: text('Last response 1m ago', '最后响应 1m前', '最後回應 1m前'),
    showCompactions: text('Compactions: 2', '压缩：2', '壓縮：2'), showMcp: text('MCP: configured docs', 'MCP：配置 docs')
};
for (const [key, [zh, tw, sample]] of Object.entries(flags)) {
    const example = samples[key] ?? text(sample, sample);
    add('display.' + key, zh, tw, true, 'On: ' + example[0] + '; off: hide this field.', '开启示例：' + example[1] + '；关闭后隐藏此项。', '開啟範例：' + example[2] + '；關閉後隱藏此項。');
}
add('display.showUsage', '额度总开关', '額度總開關', true, 'On: show enabled quota windows; off: hide all quota windows. Each window has its own switch.', '开启：显示已启用的额度周期；关闭：隐藏全部额度。各周期另有独立开关。', '開啟：顯示已啟用的額度週期；關閉：隱藏全部額度。各週期另有獨立開關。');
add('display.showFiveHourUsage', '五小时额度', '五小時額度', true, 'On: 5h: 25% when reported; off: hide the 5-hour quota. Requires the quota master switch; windows with missing metadata stay hidden.', '开启：有数据时显示 5h: 25%；关闭：隐藏五小时额度。需启用额度总开关；未提供的周期不占位。', '開啟：有資料時顯示 5h: 25%；關閉：隱藏五小時額度。需啟用額度總開關；未提供的週期不佔位。');
add('display.showSevenDayUsage', '七天额度', '七天額度', true, 'On: 7d: 25% when reported; off: hide the 7-day quota. Requires the quota master switch; windows with missing metadata stay hidden.', '开启：有数据时显示 7d: 25%；关闭：隐藏七天额度。需启用额度总开关；未提供的周期不占位。', '開啟：有資料時顯示 7d: 25%；關閉：隱藏七天額度。需啟用額度總開關；未提供的週期不佔位。');
add('display.usageBarEnabled', '额度进度条', '額度進度條', true, 'On: quota includes a progress bar; off: percentage only. Requires visible, non-compact quota.', '开启：额度带进度条；关闭：仅百分比。需启用额度且关闭紧凑额度。', '開啟：額度帶進度條；關閉：僅百分比。需啟用額度且關閉緊湊額度。');
add('display.usageCompact', '紧凑额度', '緊湊額度', true, 'On: 5h: 25% without the quota bar; off: honor the bar setting.', '开启：5h: 25%，隐藏额度进度条；关闭：遵循进度条设置。', '開啟：5h: 25%，隱藏額度進度條；關閉：遵循進度條設定。');
add('display.showResetLabel', '重置标签', '重設標籤', true, 'On: (resets 20m left); off: (20m left). Requires reset metadata.', '开启：(重置 20m后)；关闭：(20m后)。需有重置时间数据。', '開啟：(重設 20m後)；關閉：(20m後)。需有重設時間資料。');
add('display.showClockSeconds', '时间中的秒数', '時間中的秒數', true, 'Include seconds in absolute timestamps; enable a time field and absolute/both formatting first.', '在绝对时间中显示秒数；需启用时间项并选择 absolute 或 both 格式。', '在絕對時間中顯示秒數；需啟用時間項並選擇 absolute 或 both 格式。');
add('display.contextValue', '上下文数值格式', '上下文數值格式', 'both', 'both: 25% (50k/200k); remaining: 75% remaining.', 'both：25% (50k/200k)；remaining：75% 剩余。', 'both：25% (50k/200k)；remaining：75% 剩餘。');
add('display.usageValue', '额度数值格式', '額度數值格式', 'remaining', 'remaining: 5h: 75% left when 25% has been used.', 'remaining：已用 25% 时显示 5h: 75% 剩余。', 'remaining：已用 25% 時顯示 5h: 75% 剩餘。');
add('display.effortFormat', '推理强度格式', '推理強度格式', 'symbol', 'full: ◕ high; symbol: ◕; text: high. Requires effort display.', 'full：◕ high；symbol：◕；text：high。需启用推理强度显示。', 'full：◕ high；symbol：◕；text：high。需啟用推理強度顯示。');
add('display.modelFormat', '模型名称格式', '模型名稱格式', 'compact', 'full: original name; compact/short: remove the parenthesized context annotation.', 'full：完整名称；compact/short：移除括号内的 context 注释。', 'full：完整名稱；compact/short：移除括號內的 context 註解。');
add('display.timeFormat', '时间格式', '時間格式', 'both', 'relative/elapsed: 20m ago; absolute: local date/time; both/elapsedAndAbsolute: both forms.', 'relative/elapsed：20m前；absolute：本地日期时间；both/elapsedAndAbsolute：同时显示两者。', 'relative/elapsed：20m前；absolute：本地日期時間；both/elapsedAndAbsolute：同時顯示兩者。');
add('display.hourCycle', '时制', '時制', 'h23', 'h23: 00-23; h12: 1-12 with AM/PM. Applies to absolute timestamps.', 'h23：00–23 时；h12：1–12 时及上午/下午。用于绝对时间。', 'h23：00–23 時；h12：1–12 時及上午/下午。用於絕對時間。');
add('display.customLinePosition', '自定义行位置', '自訂行位置', 'first', 'first: before other HUD content; last: after it.', 'first：在其它 HUD 内容之前显示；last：在内容之后显示。', 'first：在其他 HUD 內容之前顯示；last：在內容之後顯示。');
add('display.addedDirsLayout', '附加目录布局', '附加目錄版面', 'inline', 'Preserved only; additional directory data is unavailable.', '保留项；没有附加目录数据。', '保留項；沒有附加目錄資料。');
add('display.toolNameMaxLength', '工具名称最大长度', '工具名稱最大長度', 20, '20: truncate longer tool names; 0: no separate name limit.', '20：截短过长工具名；0：不单独限制名称长度。', '20：截短過長工具名稱；0：不單獨限制名稱長度。');
add('display.toolsMaxVisible', '最多显示工具组数', '最多顯示工具組數', 4, 'Show up to four tool/status groups; active groups first. Counts cover retained recent calls. 0 shows all.', '最多显示 4 个工具与状态分组，执行中优先；次数统计保留的近期调用。0 表示全部。', '最多顯示 4 個工具與狀態分組，執行中優先；次數統計保留的近期呼叫。0 表示全部。');
add('display.agentsMaxVisible', '最多显示代理数', '最多顯示代理數', 3, 'Show three agent rows, active first; keep at most two completions for 60 seconds when end time is known. 0 shows all active rows. Hidden active work gets a +N summary.', '默认显示 3 行代理，执行中优先；有完成时间时保留 60 秒，已结束最多 2 行。0 显示全部活跃代理；隐藏的活跃任务显示 +N。', '預設顯示 3 列代理，執行中優先；有完成時間時保留 60 秒，已結束最多 2 列。0 顯示全部活躍代理；隱藏的活躍工作顯示 +N。');
add('display.authUserLength', '用户名称长度', '使用者名稱長度', 8, 'Preserved only; credentials and account names are not read.', '保留项；不读取认证凭据或账户名称。', '保留項；不讀取認證憑證或帳戶名稱。');
for (const [key, zh, tw, value] of [['contextWarningThreshold', '上下文警告阈值', '上下文警告門檻', 70], ['contextCriticalThreshold', '上下文严重阈值', '上下文嚴重門檻', 85]])
    add('display.' + key, zh, tw, value, value + '%: change context color at or above this used percentage.', value + '%：上下文已用达到此比例时改变颜色。', value + '%：上下文已用達到此比例時改變色彩。');
add('display.usageThreshold', '短周期额度显示阈值', '短週期額度顯示門檻', 20, '20: show quota windows shorter than seven days at 20% used or above; 0: always show.', '20：不足七天的额度周期已用至少 20% 才显示；0：始终显示。', '20：不足七天的額度週期已用至少 20% 才顯示；0：始終顯示。');
add('display.sevenDayThreshold', '长周期额度显示阈值', '長週期額度顯示門檻', 80, '80: show quota windows of at least seven days at 80% used or above; 0: always show. Default: 0.', '80：至少七天的额度周期已用达到 80% 才显示；0：始终显示。默认 0。', '80：至少七天的額度週期已用達到 80% 才顯示；0：始終顯示。預設 0。');
add('display.environmentThreshold', '环境阈值', '環境門檻', 0, 'Preserved only; the renderer does not filter environment metadata by this value.', '保留项；渲染器不按此值筛选环境信息。', '保留項；呈現器不按此值篩選環境資訊。');
add('display.modelOverride', '模型显示名称', '模型顯示名稱', 'Codex Demo', 'Show [Codex Demo] instead of the recorded name; the actual model is unchanged.', '显示 [Codex Demo]，覆盖记录中的名称；实际模型不变。', '顯示 [Codex Demo]，覆蓋記錄中的名稱；實際模型不變。');
add('display.providerName', '服务商显示名称', '服務商顯示名稱', 'My provider', 'Show My provider when provider display is enabled; the actual provider is unchanged.', '启用服务商显示后显示 My provider；实际服务商不变。', '啟用服務商顯示後顯示 My provider；實際服務商不變。');
add('display.customLine', '自定义文本行', '自訂文字行', 'Build ready', 'Display the literal text Build ready; no shell command runs.', '直接显示文字 Build ready；不会执行 shell 命令。', '直接顯示文字 Build ready；不會執行 shell 命令。');
add('display.advisorOverride', '顾问模型名称', '顧問模型名稱', '', 'Preserved only; advisor data is unavailable.', '保留项；顾问模型数据不可用。', '保留項；顧問模型資料不可用。');
for (const [key, zh, tw] of [['externalUsagePath', '外部额度读取路径', '外部額度讀取路徑'], ['externalUsageWritePath', '外部额度写入路径', '外部額度寫入路徑']])
    add('display.' + key, zh, tw, '', 'Preserved only; no external file is read or written.', '仅保留配置；不读取或写入外部文件。', '僅保留設定；不讀取或寫入外部檔案。');
const colors = { context: ['上下文颜色', '上下文色彩'], usage: ['额度颜色', '額度色彩'], warning: ['警告颜色', '警告色彩'], usageWarning: ['额度警告颜色', '額度警告色彩'], critical: ['严重告警颜色', '嚴重警示色彩'], model: ['模型颜色', '模型色彩'], project: ['项目颜色', '專案色彩'], git: ['Git 颜色', 'Git 色彩'], gitBranch: ['分支颜色', '分支色彩'], label: ['标签颜色', '標籤色彩'], custom: ['自定义行颜色', '自訂行色彩'] };
for (const [key, [zh, tw]] of Object.entries(colors))
    add('colors.' + key, zh, tw, '#66ccff', 'Light blue; also accepts named colors or ANSI indices 0-255.', '浅蓝色；也支持预设颜色名或 0–255 的 ANSI 色号。', '淺藍色；也支援預設色彩名稱或 0–255 的 ANSI 色號。');
add('colors.active', '活跃条目文字颜色', '活躍項目文字色彩', '#f2f2f2', 'Bright text for current tools and starting/running agents; background and font weight stay unchanged.', '当前工具及启动中、运行中代理的明亮文字；背景和字重不变。', '目前工具及啟動中、執行中代理的明亮文字；背景與字重不變。');
add('colors.inactive', '近期及非活跃条目文字颜色', '近期及非活躍項目文字色彩', '#9a9a9a', 'Gray text for recent tools and inactive agents; tool failures retain the critical color.', '近期工具及非活跃代理的灰色文字；工具失败保留严重告警颜色。', '近期工具及非活躍代理的灰色文字；工具失敗保留嚴重警示色彩。');
add('colors.git', 'Git 颜色', 'Git 色彩', '#66ccff', 'Preserved setting; the current branch renderer uses colors.gitBranch.', '保留项；当前分支显示使用 colors.gitBranch。', '保留項；目前分支顯示使用 colors.gitBranch。');
add('colors.usageWarning', '额度警告颜色', '額度警告色彩', '#66ccff', 'Preserved setting; quota currently uses usage or critical colors.', '保留项；当前额度使用 usage 或 critical 颜色。', '保留項；目前額度使用 usage 或 critical 色彩。');
add('colors.barFilled', '进度条填充字符', '進度條填滿字元', '█', 'At 30%, repeat this character three times in a ten-step bar.', '30% 时，十格进度条中使用 3 个此字符。', '30% 時，十格進度條中使用 3 個此字元。');
add('colors.barEmpty', '进度条空白字符', '進度條空白字元', '░', 'At 30%, repeat this character seven times in a ten-step bar.', '30% 时，十格进度条中使用 7 个此字符。', '30% 時，十格進度條中使用 7 個此字元。');
add('terminal.paneSize', '备用面板比例', '備用面板比例', 0.3, '0.3: use about 30% height when initial rows is 0, or cap content fitting. Fixed initial rows ignore this ratio.', '0.3：初始行数为 0 时使用约 30% 高度，或限制内容适配的高度。固定初始行数不受此比例限制。', '0.3：初始列數為 0 時使用約 30% 高度，或限制內容適配的高度。固定初始列數不受此比例限制。');
add('terminal.initialRows', '初始可见行数', '初始可見列數', 6, '6: create a HUD with six visible inner rows; short panes reduce this to preserve Codex space. 0: use the fallback ratio. Content fitting takes priority when enabled. Applies only at creation; later manual resizing is preserved.', '6：创建时 HUD 内部可见 6 行；窗口过矮时缩小以保留 Codex 空间。0：使用备用面板比例。启用内容适配时优先适配内容。仅在创建时使用，之后保留手动拖动尺寸。', '6：建立時 HUD 內部可見 6 列；視窗過矮時縮小以保留 Codex 空間。0：使用備用面板比例。啟用內容適配時優先適配內容。僅在建立時使用，之後保留手動拖曳尺寸。');
add('terminal.autoHeight', '初始高度适应内容', '初始高度配合內容', true, 'On: fit content at creation within the ratio cap instead of using initial rows. Off by default: create six visible rows. Later manual resizing is preserved.', '开启：创建时在比例上限内适应内容，优先于初始行数。默认关闭：创建时可见 6 行。之后保留手动拖动尺寸。', '開啟：建立時在比例上限內配合內容，優先於初始列數。預設關閉：建立時可見 6 列。之後保留手動拖曳尺寸。');
add('terminal.dynamicHeight', '持续高度适应内容', '持續高度配合內容', true, 'On: 3 visible content rows use 3 HUD rows and 6 use 6, within the ratio cap and ten source rows. Growth waits one stable refresh; shrink waits at least two seconds. Manual sizes are fitted again while on. Off: preserve fixed/manual height.', '开启：3 行内容占 3 行，6 行占 6 行；受比例上限限制并保留主区 10 行。增高等待一个稳定刷新周期，缩小至少等待 2 秒；开启时手动拖动后会重新适配。关闭：保留固定或手动高度。', '開啟：3 列內容占 3 列，6 列占 6 列；受比例上限限制並保留主區 10 列。增高等待一個穩定更新週期，縮小至少等待 2 秒；開啟時手動拖曳後會重新配合。關閉：保留固定或手動高度。');
add('terminal.refreshMs', '刷新间隔（毫秒）', '重新整理間隔（毫秒）', 2000, '2000: refresh telemetry every two seconds.', '2000：每 2 秒刷新一次显示数据。', '2000：每 2 秒重新整理一次顯示資料。');
add('terminal.margin', '预留列数', '預留欄數', 4, 'Reserve four columns when computing content width.', '计算内容宽度时预留 4 列。', '計算內容寬度時預留 4 欄。');
add('startup.enabled', '旧版自动启动', '舊版自動啟動', false, 'Keep false while old 0.3.4 sessions exist; use exact-host auto start instead.', '仍有旧版 0.3.4 会话时保持 false；使用精确宿主自动启动。', '仍有舊版 0.3.4 會話時保持 false；使用精確宿主自動啟動。');
add('startup.window', '旧版目标窗口', '舊版目標視窗', 'last', 'Compatibility only; attachment uses the verified source pane.', '仅用于兼容；附着使用已验证的来源面板。', '僅用於相容；附著使用已驗證的來源面板。');
add('host.psmuxPath', '便携 psmux 路径', '可攜式 psmux 路徑', 'C:/tools/psmux/psmux.exe', 'Use an existing verified portable executable at this absolute path; no installation is performed.', '使用此绝对路径下已存在并核验的便携程序；设置路径不会安装程序。', '使用此絕對路徑下已存在並核驗的可攜式程式；設定路徑不會安裝程式。');
add('host.autoStart', '精确宿主自动启动', '精確宿主自動啟動', 'enabled', 'enabled: exact-host startup on; disabled: off; inherit: follow the legacy enabled preference.', 'enabled：启用精确宿主启动；disabled：关闭；inherit：遵循旧版 enabled 偏好。', 'enabled：啟用精確宿主啟動；disabled：關閉；inherit：遵循舊版 enabled 偏好。');
add('host.runtime', 'Codex 运行方式', 'Codex 執行方式', 'cli', 'cli: ordinary startup; localAppServer: opt into an isolated local server on the next start for live MCP status.', 'cli：普通启动；localAppServer：下次启动使用独立本机服务，提供实时 MCP 状态。', 'cli：一般啟動；localAppServer：下次啟動使用獨立本機服務，提供即時 MCP 狀態。');
const reasons = {
    forceMaxWidth: text('Rendering respects actual viewport width.', '渲染遵守实际窗口宽度。', '呈現遵守實際視窗寬度。'),
    'display.showSkills': text('Reliable active-Skill events are unavailable.', '没有可靠的活跃技能事件。', '沒有可靠的活躍技能事件。'),
    'display.showMemoryUsage': text('Other-process memory inspection is unsupported.', '不支持读取其它进程的内存。', '不支援讀取其他處理程序的記憶體。'),
    'display.showPromptCache': text('Authoritative cache expiry is unavailable.', '没有权威的缓存到期数据。', '沒有權威的快取到期資料。'),
    'display.showSpeed': text('Reliable generation-only duration is unavailable.', '没有可靠的纯生成时长数据。', '沒有可靠的純生成時長資料。'),
    'display.showAuthUser': text('Credentials and account names are not read.', '不读取认证凭据或账户名称。', '不讀取認證憑證或帳戶名稱。'),
    'display.showOutputStyle': text('Claude-specific setting.', 'Claude 专属设置。', 'Claude 專屬設定。'),
    'display.showAdvisor': text('Claude-specific feature.', 'Claude 专属功能。', 'Claude 專屬功能。'),
    'display.showModelScopedUsage': text('Per-model quota data is unavailable.', '没有按模型区分的额度数据。', '沒有按模型區分的額度資料。'),
    'display.showAddedDirs': text('Additional directories are not reported.', '未提供附加目录数据。', '未提供附加目錄資料。'),
    'display.showConfigCounts': text('Loaded configuration counts are not reported.', '未提供已加载配置的数量。', '未提供已載入設定的數量。'),
    'startup.enabled': text('Legacy compatibility only; use exact-host auto start.', '旧版兼容项；使用精确宿主自动启动。', '舊版相容項；使用精確宿主自動啟動。'),
    'startup.window': text('Legacy compatibility only; use the verified source pane.', '旧版兼容项；使用已验证的来源面板。', '舊版相容項；使用已驗證的來源面板。')
};
for (const key of ['showCost', 'showRoutedCost', 'showDailyCost'])
    reasons['display.' + key] = text('Authoritative billing data is unavailable.', '没有权威的计费数据。', '沒有權威的計費資料。');
reasons['display.advisorOverride'] = reasons['display.showAdvisor'];
for (const key of ['externalUsagePath', 'externalUsageWritePath'])
    reasons['display.' + key] = text('Preserved only; external path I/O is disabled.', '仅保留配置；已禁用外部路径读写。', '僅保留設定；已停用外部路徑讀寫。');
const choices = {
    cli: text('Ordinary CLI', '普通 CLI', '一般 CLI'), localAppServer: text('Local App Server (experimental)', '本机 App Server（实验性）', '本機 App Server（實驗性）'),
    en: text('English', '英文', '英文'), 'zh-Hans': text('Simplified Chinese', '简体中文', '簡體中文'), 'zh-Hant': text('Traditional Chinese', '繁体中文', '繁體中文'),
    expanded: text('Separate groups', '按组分行', '按組分行'), compact: text('Compact format', '紧凑格式', '緊湊格式'), full: text('Full value or path', '完整值或完整路径', '完整值或完整路徑'), short: text('Short model name', '简短模型名', '簡短模型名稱'),
    truncate: text('Truncate', '截短', '截短'), wrap: text('Wrap', '换行', '換行'), percent: text('Used percentage', '已用百分比', '已用百分比'), tokens: text('Token counts', 'Token 数量', 'Token 數量'), remaining: text('Remaining amount', '剩余量', '剩餘量'), both: text('Both formats', '同时显示两种格式', '同時顯示兩種格式'),
    symbol: text('Symbol only', '仅符号', '僅符號'), text: text('Text only', '仅文本', '僅文字'), relative: text('Relative time', '相对时间', '相對時間'), absolute: text('Absolute time', '绝对时间', '絕對時間'), elapsed: text('Relative time', '相对时间', '相對時間'), elapsedAndAbsolute: text('Relative and absolute', '相对和绝对时间', '相對和絕對時間'),
    auto: text('Locale default', '跟随地区默认值', '跟隨地區預設值'), h11: text('12-hour, 0-11', '12 小时制（0–11）', '12 小時制（0–11）'), h12: text('12-hour, 1-12', '12 小时制（1–12）', '12 小時制（1–12）'), h23: text('24-hour, 0-23', '24 小时制（0–23）', '24 小時制（0–23）'), h24: text('24-hour, 1-24', '24 小时制（1–24）', '24 小時制（1–24）'),
    first: text('Before other content', '其它内容之前', '其他內容之前'), last: text('After other content', '其它内容之后', '其他內容之後'), inline: text('Same line', '同一行', '同一行'), line: text('Separate line', '独立行', '獨立行'),
    inherit: text('Follow legacy preference', '遵循旧版偏好', '遵循舊版偏好'), enabled: text('Enable exact-host startup', '启用精确宿主启动', '啟用精確宿主啟動'), disabled: text('Disable exact-host startup', '关闭精确宿主启动', '關閉精確宿主啟動')
};
const contextualChoices = {
    pathLevels: { full: text('Complete project path', '完整项目路径', '完整專案路徑') },
    'display.effortFormat': { full: text('Symbol and text', '符号和文本', '符號和文字') },
    'display.modelFormat': { full: text('Complete model name', '完整模型名', '完整模型名稱'), compact: text('Model name without context annotation', '移除 context 注释的模型名', '移除 context 註解的模型名稱'), short: text('Model name without context annotation', '移除 context 注释的模型名', '移除 context 註解的模型名稱') },
    'display.contextValue': { both: text('Percentage and token counts', '百分比和 Token 数量', '百分比和 Token 數量') },
    'display.timeFormat': { both: text('Relative and absolute time', '相对和绝对时间', '相對和絕對時間') }
};
export function optionHelp(definition, language) {
    const entry = catalogue[definition.key];
    if (!entry)
        throw new Error('Missing menu help: ' + definition.key);
    const reason = definition.reason ? local(reasons[definition.key] ?? text(definition.reason, '此项没有可靠的数据源或当前不支持。', '此項沒有可靠的資料來源或目前不支援。'), language) : undefined;
    return { label: language === 'en' ? definition.label : entry.labels[language === 'zh-Hant' ? 1 : 0], example: reason && definition.kind === 'boolean' ? false : entry.example, effect: reason ?? local(entry.effect, language), unavailable: reason,
        choices: (definition.choices ?? []).map(value => ({ value, label: typeof value === 'number' ? local(text(value + ' path level(s)', value + ' 层目录', value + ' 層目錄'), language) : local(contextualChoices[definition.key]?.[String(value)] ?? choices[String(value)], language) })) };
}
