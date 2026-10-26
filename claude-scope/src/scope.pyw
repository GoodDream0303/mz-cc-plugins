# -*- coding: utf-8 -*-
"""
claude-scope (tkinter 轻量版)
多会话状态悬浮监视器:
  红=需要你(等待授权/回答)
  蓝=等待后台(agent/workflow运行中)
  绿=思考/执行中(自己busy)
  黄=待机(idle)
无边框 / 置顶 / 半透明(滚轮或滑块调) / 可拖动 / 可缩放(右下角缩放整体,右边缘单独调宽)。
数据源:~/.claude/sessions/<PID>.json 的 status / name 字段
       (status: waiting=等授权/回答 -> 红, idle -> 黄, busy/shell 等其余 -> 绿);
       ~/.claude/jobs/<id>/state.json 检测后台任务。
状态优先级:红 > 蓝 > 绿 > 黄。
窗口配置与日志放 %LOCALAPPDATA%\\claude-scope\\(与 CLI、插件版本目录均无关,升级不丢)。

**安全约束:本程序只读 ~/.claude 文件、只操作自己的窗口与光标,绝不枚举或打开其它进程**
(早期版本用 OpenProcess/Toolhelp 查后台 shell,疑似被 EDR 拦截并连带影响 MCP/Dashboard,已彻底移除)。
设计为极低占用:after() 每秒轮询一次,无忙循环;数据无变化不重绘;无任何持续动画。
"""
import os, re, sys, json, time, ctypes, subprocess
import tkinter as tk
import tkinter.font as tkfont

HOME = os.path.expanduser("~")
SESSIONS_DIR = os.path.join(HOME, ".claude", "sessions")
PROJECTS_DIR = os.path.join(HOME, ".claude", "projects")
JOBS_DIR = os.path.join(HOME, ".claude", "jobs")
# 配置/日志放与 CLI 无关的固定目录:插件目录带版本号(升级即重置),~/.claude 又专属 Claude
RUNTIME_DIR = os.path.join(os.environ.get("LOCALAPPDATA") or HOME, "claude-scope")
CONFIG_PATH = os.path.join(RUNTIME_DIR, "config.json")

POLL_MS = 1000

# 调色板(磷光)
C_KEY   = "#ff00fe"   # 透明色键(圆角与外缘透明)
C_VOID  = "#08160e"
C_BORDER= "#1f5a3c"
C_RUN   = "#45f0a0"   # 绿
C_STBY  = "#ffb347"   # 黄
C_ATTN  = "#ff5a52"   # 红
C_BG    = "#4a9eff"   # 蓝(后台任务)
C_DIM   = "#5f9c80"
C_NAME  = "#cfeede"
C_GRID  = "#10301e"

STATE_WORD = {"run": "RUN", "stby": "STBY", "attn": "ATTN", "bg": "BG"}
STATE_COLOR = {"run": C_RUN, "stby": C_STBY, "attn": C_ATTN, "bg": C_BG}

# 未缩放的基准尺寸(实际尺寸 = 基准 * scale)
HEADER_H, ROW_H, PAD = 24, 22, 8
F_BRAND, F_CH, F_STATE, F_NAME, F_BTN = 9, 7, 7, 9, 7

ERROR_LOG = os.path.join(RUNTIME_DIR, "error.log")

def log_error(prefix=""):
    import traceback
    try:
        os.makedirs(RUNTIME_DIR, exist_ok=True)
        with open(ERROR_LOG, "a", encoding="utf-8") as f:
            f.write("%s [%s]\n%s\n" % (time.strftime("%Y-%m-%d %H:%M:%S"), prefix, traceback.format_exc()))
    except Exception:
        pass


# ---------------- 鼠标坐标(自有窗口缩放用,不触碰其它进程) ----------------
class _POINT(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

def cursor_pos():
    # 用 Win32 取绝对屏幕坐标:Tk 的 e.x_root 在无边框窗缩放时会漂移,不可靠
    p = _POINT()
    ctypes.windll.user32.GetCursorPos(ctypes.byref(p))
    return p.x, p.y


# ---------------- 标题回退(仅当 sessions.json 无 name 时) ----------------
_title_cache = {}  # sid -> (path, mtime, title)

def _enc_cwd(cwd):
    # 与 Claude Code 一致:所有非字母数字字符都换成 "-"(如 AI_Skill_Repo -> AI-Skill-Repo)
    return re.sub(r"[^A-Za-z0-9]", "-", cwd or "")

def fallback_title(sid, cwd):
    path = os.path.join(PROJECTS_DIR, _enc_cwd(cwd), sid + ".jsonl")
    if not os.path.exists(path):
        try:
            path = next((p for d in os.listdir(PROJECTS_DIR)
                         for p in [os.path.join(PROJECTS_DIR, d, sid + ".jsonl")]
                         if os.path.exists(p)), None)
        except OSError:
            path = None
    if not path:
        return None
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        return None
    c = _title_cache.get(sid)
    if c and c[0] == path and c[1] == mtime:
        return c[2]
    ai_title = last_prompt = None
    try:
        with open(path, "rb") as f:           # 只读末尾 64KB:最新标题/提问都在文件尾
            f.seek(0, 2)
            size = f.tell()
            f.seek(max(0, size - 65536))
            lines = f.read().decode("utf-8", "replace").split("\n")
        for l in reversed(lines):
            if not l:
                continue
            if '"ai-title"' not in l and (last_prompt is not None or '"last-prompt"' not in l):
                continue
            try:
                o = json.loads(l)
            except ValueError:
                continue
            if o.get("type") == "ai-title" and o.get("aiTitle", "").strip():
                ai_title = o["aiTitle"].strip()
                break
            if last_prompt is None and o.get("type") == "last-prompt" and o.get("lastPrompt", "").strip():
                last_prompt = " ".join(o["lastPrompt"].split())
    except OSError:
        pass
    title = ai_title or last_prompt
    _title_cache[sid] = (path, mtime, title)
    return title


# ---------------- 后台任务(agent/workflow) ----------------
def read_bg_jobs():
    """
    返回 dict: sessionId -> {"name": ..., "state": ..., "tempo": ...}
    """
    jobs = {}
    try:
        job_ids = os.listdir(JOBS_DIR)
    except OSError:
        return jobs
    for jid in job_ids:
        if jid == "pins.json":
            continue
        state_file = os.path.join(JOBS_DIR, jid, "state.json")
        if not os.path.exists(state_file):
            continue
        try:
            with open(state_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            sid = data.get("sessionId")
            if not sid:
                continue
            state = data.get("state", "")
            tempo = data.get("tempo", "")
            name = data.get("name", "")
            # 只记录运行中的后台任务,排除终态(done/failed/cancelled等)
            if state in ("working", "pending", "starting") and tempo not in ("idle", "done"):
                jobs[sid] = {"name": name, "state": state, "tempo": tempo}
        except (OSError, ValueError):
            pass
    return jobs


def _is_converted_interactive(bg_info):
    """判断一个 bg 会话是否为「转换态交互会话」(左键切走的),而非纯后台任务。
    判据:bgIsolation 字段存在 或 respawnFlags 含 --reply-on-resume。
    """
    if not bg_info:
        return False
    # 优先用 bgIsolation:转换态有此键(值"none"),纯--bg任务无此键
    if "bgIsolation" in bg_info:
        return True
    # 备用判据:respawnFlags 含 --reply-on-resume
    flags = bg_info.get("respawnFlags", [])
    return "--reply-on-resume" in flags


# ---------------- 标签消歧 ----------------
def segs_of(cwd):
    return [x for x in (cwd or "").replace("\\", "/").rstrip("/").split("/") if x and not x.endswith(":")]

def assign_labels(items):
    MAXD = 2
    segs = [segs_of(s["cwd"]) for s in items]
    depth = [1] * len(items)

    def make(i):
        seg = segs[i]
        if not seg:
            return "pid:%d" % items[i]["pid"]
        return "/".join(seg[max(0, len(seg) - depth[i]):])

    for _ in range(MAXD):
        labels = [make(i) for i in range(len(items))]
        groups = {}
        for i, l in enumerate(labels):
            groups.setdefault(l, []).append(i)
        any_ext = False
        for ids in groups.values():
            if len(ids) < 2 or len({items[i]["cwd"] for i in ids}) < 2:
                continue
            for i in ids:
                if depth[i] < min(len(segs[i]), MAXD):
                    depth[i] += 1
                    any_ext = True
        if not any_ext:
            break
    labels = [make(i) for i in range(len(items))]
    cnt = {}
    for l in labels:
        cnt[l] = cnt.get(l, 0) + 1
    for i, s in enumerate(items):
        s["label"] = labels[i] + (" #%d" % s["pid"] if cnt[labels[i]] > 1 else "")


# ---------------- 采集会话 ----------------
_session_cache = {}  # filename -> 上次成功解析的 json(用于读到半截写入时沿用上一帧)

def read_sessions():
    bg_jobs = read_bg_jobs()
    out = []
    try:
        files = os.listdir(SESSIONS_DIR)
    except OSError:
        return out
    for fn in files:
        if not fn.endswith(".json"):
            continue
        try:
            with open(os.path.join(SESSIONS_DIR, fn), "r", encoding="utf-8") as f:
                data = json.load(f)
            _session_cache[fn] = data
        except (OSError, ValueError):
            data = _session_cache.get(fn)   # 文件正被写入而解析失败 -> 用上次的好数据,避免闪烁
            if data is None:
                continue
        if data.get("spare") or data.get("parkedJobId"):   # 预热备用进程 / 已把会话移到后台的窗口,均不显示
            continue
        kind = data.get("kind")
        sid = data.get("sessionId") or fn[:-5]
        # Claude Code 写入的 status: busy / waiting(等授权或回答) / idle / shell 等
        status = data.get("status") or "idle"

        # 状态优先级: 红(waiting) > 蓝(纯后台任务) > 绿(busy/shell 等) > 黄(idle)
        # 转换态交互会话(左键切走的)按普通会话显示(绿/黄),蓝灯只给纯后台任务
        bg_info = None
        if status == "waiting":
            state = "attn"
        elif kind == "bg":
            # 读 jobs/<id>/state.json 获取完整字段,用于判别转换态
            job_id = data.get("jobId")
            full_bg_info = None
            if job_id:
                try:
                    job_state_path = os.path.join(JOBS_DIR, job_id, "state.json")
                    with open(job_state_path, "r", encoding="utf-8") as jf:
                        full_bg_info = json.load(jf)
                except (OSError, ValueError):
                    pass
            # 判别:转换态当普通会话(绿/黄),纯后台任务才显示蓝灯
            if full_bg_info and _is_converted_interactive(full_bg_info):
                # 转换态交互会话 → 按 status 显示绿/黄
                state = "stby" if status == "idle" else "run"
            else:
                # 纯后台任务 → 蓝灯
                state = "bg"
                bg_info = bg_jobs.get(sid, {"name": data.get("name", ""), "state": status, "tempo": ""})
        elif status == "idle":
            state = "stby"
        else:
            state = "run"

        out.append({"id": sid, "pid": data.get("pid") or 0, "cwd": data.get("cwd") or "",
                    "name": data.get("name") or "", "name_src": data.get("nameSource"),
                    "state": state, "bg_info": bg_info,
                    "started": data.get("startedAt") or 0, "label": ""})

    assign_labels(out)
    for s in out:
        # name 由 /rename、--name 等指定(nameSource 非 derived/auto)时最优先;否则优先用 transcript
        # 的 ai-title(可含中文):自动 name 是 ASCII slug,中文标题会退化成"目录名-编号"占位串。
        # 路径名(assign_labels)兜底。
        if s["name"] and s["name_src"] not in (None, "derived", "auto"):
            title = s["name"]
        else:
            title = fallback_title(s["id"], s["cwd"]) or s["name"]
        if title:
            s["label"] = title

    out.sort(key=lambda s: (s["started"], s["pid"]))   # 稳定顺序,行不随状态跳动

    # 去重:同一个 sessionId 只保留最新的一条(解决缓存导致的重复显示)
    seen = {}
    for s in out:
        sid = s["id"]
        # 保留 started 时间更晚的(更新的会话),或第一次出现的
        if sid not in seen or s["started"] >= seen[sid]["started"]:
            seen[sid] = s
    out = list(seen.values())
    out.sort(key=lambda s: (s["started"], s["pid"]))   # 去重后重新排序

    return out


# ---------------- GUI ----------------
class Scope:
    def __init__(self, root):
        self.root = root
        self.cfg = self.load_cfg()
        self.W = max(160, int(self.cfg.get("width", self.cfg.get("base_w", 340))))  # 宽度独立(像素)
        self.s = min(3.0, max(0.6, float(self.cfg.get("scale", 1.0))))              # 大小独立(字号/行高)
        self.X = int(self.cfg.get("x", 80))
        self.Y = int(self.cfg.get("y", 80))
        self.opacity = float(self.cfg.get("opacity", 0.92))
        self.pinned = bool(self.cfg.get("pinned", True))
        self.hdr = round(HEADER_H * self.s)
        self.H = round((HEADER_H + ROW_H + 8) * self.s)
        self.sessions = []
        self._sig = None
        self._clamp_pos()

        root.overrideredirect(True)
        root.config(bg=C_KEY)
        root.attributes("-topmost", self.pinned)
        root.attributes("-alpha", self.opacity)
        try:
            root.attributes("-transparentcolor", C_KEY)
        except tk.TclError:
            pass
        root.geometry("%dx%d+%d+%d" % (self.W, self.H, self.X, self.Y))

        self.cv = tk.Canvas(root, bg=C_KEY, highlightthickness=0, bd=0)
        self.cv.pack(fill="both", expand=True)

        self.f_brand = tkfont.Font(family="Consolas", weight="bold")
        self.f_ch    = tkfont.Font(family="Consolas")
        self.f_state = tkfont.Font(family="Consolas", weight="bold")
        self.f_name  = tkfont.Font(family="Microsoft YaHei UI")
        self.f_btn   = tkfont.Font(family="Consolas", weight="bold")
        self.apply_scale()

        self.pin_bbox = self.x_bbox = self.grip_bbox = (0, 0, 0, 0)
        self.op_track = None
        self._drag = None
        self.tooltip = None
        self.tooltip_label = None

        self.cv.bind("<ButtonPress-1>", self.on_press)
        self.cv.bind("<B1-Motion>", self.on_drag)
        self.cv.bind("<ButtonRelease-1>", self.on_release)
        self.cv.bind("<Motion>", self.on_motion)
        self.cv.bind("<Leave>", self.on_leave)
        self.cv.bind("<Button-3>", self.show_menu)   # 右键菜单
        root.bind("<MouseWheel>", self.on_wheel)

        self.menu = tk.Menu(root, tearoff=0, bd=0, relief="flat",
                            bg="#0c1c12", fg="#cfeede",
                            activebackground="#1f5a3c", activeforeground="#eafff5",
                            font=("Microsoft YaHei UI", 9))
        self.menu.add_command(label="置顶", command=self.toggle_pin)
        self.menu.add_command(label="重启", command=self.restart)
        self.menu.add_command(label="重置大小/位置", command=self.reset_geom)
        self.menu.add_separator()
        self.menu.add_command(label="退出", command=self.quit_app)

        self.poll()

    # ---- 右键菜单 / 窗口控制 ----
    def show_menu(self, e):
        self.menu.entryconfigure(0, label=("取消置顶" if self.pinned else "置顶"))
        try:
            self.menu.tk_popup(int(e.x_root), int(e.y_root))
        finally:
            self.menu.grab_release()

    def toggle_pin(self):
        self.pinned = not self.pinned
        self.root.attributes("-topmost", self.pinned)
        self.save_cfg(); self.draw()

    def quit_app(self):
        self.save_cfg(); self.root.destroy()

    def reset_geom(self):
        self.W, self.s = 340, 1.0
        self.apply_scale()
        self.X, self.Y = 80, 80
        self._clamp_pos()
        self.root.geometry("+%d+%d" % (self.X, self.Y))
        self._sig = None; self.draw(); self.save_cfg()

    def restart(self):
        self.save_cfg()
        try:
            subprocess.Popen([sys.executable, os.path.abspath(__file__)],
                             close_fds=True, creationflags=0x00000008)
        except Exception:
            log_error("restart")
        self.root.after(150, self.root.destroy)

    def apply_scale(self):
        s = self.s
        self.f_brand.configure(size=max(7, round(F_BRAND * s)))
        self.f_ch.configure(size=max(6, round(F_CH * s)))
        self.f_state.configure(size=max(6, round(F_STATE * s)))
        self.f_name.configure(size=max(7, round(F_NAME * s)))
        self.f_btn.configure(size=max(6, round(F_BTN * s)))

    def _clamp_pos(self):
        try:
            gsm = ctypes.windll.user32.GetSystemMetrics
            vx, vy, vw, vh = gsm(76), gsm(77), gsm(78), gsm(79)  # 虚拟桌面 X/Y/CX/CY
            self.X = min(max(self.X, vx), vx + vw - 80)
            self.Y = min(max(self.Y, vy), vy + vh - 40)
        except Exception:
            pass

    # ---- 配置 ----
    def load_cfg(self):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return {}

    def save_cfg(self):
        try:
            os.makedirs(RUNTIME_DIR, exist_ok=True)
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump({"x": self.X, "y": self.Y, "width": self.W,
                           "scale": round(self.s, 3), "opacity": round(self.opacity, 3),
                           "pinned": self.pinned}, f, ensure_ascii=False, indent=2)
        except OSError:
            pass

    # ---- 轮询 ----
    def poll(self):
        try:
            sessions = read_sessions()
            sig = tuple((s["id"], s["state"], s["label"], s.get("bg_info")) for s in sessions) + (self.W, round(self.s, 2))
            if sig != self._sig:
                self._sig = sig
                self.sessions = sessions
                self.draw()
        except Exception:
            log_error("poll")   # 记录但不中断:下一轮继续
        finally:
            self.root.after(POLL_MS, self.poll)

    # ---- 绘制 ----
    def round_rect(self, x1, y1, x2, y2, r, **kw):
        pts = [x1 + r, y1, x2 - r, y1, x2, y1, x2, y1 + r, x2, y2 - r, x2, y2,
               x2 - r, y2, x1 + r, y2, x1, y2, x1, y2 - r, x1, y1 + r, x1, y1]
        return self.cv.create_polygon(pts, smooth=True, **kw)

    def draw_led(self, cx, cy, color, s):
        r1, r2 = max(5, round(7 * s)), max(3, round(4 * s))
        self.cv.create_oval(cx - r1, cy - r1, cx + r1, cy + r1, fill=color, outline="", stipple="gray25")
        self.cv.create_oval(cx - r2, cy - r2, cx + r2, cy + r2, fill=color, outline="")

    def fit_text(self, text, maxpx):
        if maxpx <= 0:
            return ""
        if self.f_name.measure(text) <= maxpx:
            return text
        while text and self.f_name.measure(text + "…") > maxpx:
            text = text[:-1]
        return text + "…"

    def draw(self):
        s = self.s
        hdr = self.hdr = max(16, round(HEADER_H * s))
        row = max(14, round(ROW_H * s))
        pad = max(4, round(PAD * s))
        sp = round(8 * s)
        n = max(1, len(self.sessions))
        self.W = max(160, self.W)        # 宽度独立于缩放
        self.H = hdr + n * row + sp
        W, H = self.W, self.H
        self.root.geometry("%dx%d" % (W, H))
        cv = self.cv
        cv.delete("all")

        self.round_rect(1, 1, W - 1, H - 1, max(6, round(11 * s)), fill=C_VOID, outline=C_BORDER, width=1)

        step = max(14, round(22 * s))
        for gx in range(step, W, step):
            cv.create_line(gx, hdr, gx, H - 4, fill=C_GRID)
        for gy in range(hdr + step // 2, H - 4, step):
            cv.create_line(6, gy, W - 6, gy, fill=C_GRID)

        cy0 = hdr // 2
        cv.create_text(pad, cy0, anchor="w", text="CLAUDE·SCOPE", fill=C_RUN, font=self.f_brand)
        bx = self.f_brand.measure("CLAUDE·SCOPE") + pad + round(8 * s)
        rd = max(2, round(3 * s))
        cv.create_oval(bx - rd, cy0 - rd, bx + rd, cy0 + rd, fill=C_RUN, outline="")

        # 退出 ✕
        xc = W - pad - round(4 * s)
        self.x_bbox = (xc - round(9 * s), 0, xc + round(9 * s), hdr)
        cv.create_text(xc, cy0, anchor="e", text="✕", fill=C_DIM, font=self.f_btn)
        # PIN
        pin_r = W - pad - round(26 * s)
        pl, pr = pin_r - round(24 * s), pin_r + round(6 * s)
        self.pin_bbox = (pl, 2, pr, hdr - 2)
        if self.pinned:
            self.round_rect(pl, 4, pr, hdr - 4, max(3, round(4 * s)), fill=C_RUN, outline="")
            cv.create_text((pl + pr) // 2, cy0, text="PIN", fill=C_VOID, font=self.f_btn)
        else:
            self.round_rect(pl, 4, pr, hdr - 4, max(3, round(4 * s)), fill="", outline=C_BORDER)
            cv.create_text((pl + pr) // 2, cy0, text="PIN", fill=C_DIM, font=self.f_btn)

        # 透明度滑块
        self.op_track = None
        if W >= round(250 * s):
            tx2 = pl - round(12 * s)
            tx1 = tx2 - round(44 * s)
            cv.create_line(tx1, cy0, tx2, cy0, fill=C_DIM)
            kx = tx1 + (self.opacity - 0.2) / 0.8 * (tx2 - tx1)
            kr = max(3, round(4 * s))
            cv.create_oval(kx - kr, cy0 - kr, kx + kr, cy0 + kr, fill=C_RUN, outline="")
            self.op_track = (tx1, tx2)

        cv.create_line(6, hdr, W - 6, hdr, fill=C_BORDER)

        if not self.sessions:
            cv.create_text(W // 2, hdr + row // 2, text="— 无活动会话 —", fill=C_DIM, font=self.f_ch)
            self.grip_bbox = (W - round(16 * s), H - round(16 * s), W, H)
            self._draw_grip(W, H, s)
            self._present()
            return

        name_x = pad + round(38 * s)
        name_max = (W - pad - round(40 * s) - round(6 * s)) - name_x
        led_x = pad + round(26 * s)
        self.row_bboxes = []  # 记录每行的区域,用于悬停检测
        for i, ss in enumerate(self.sessions):
            cy = hdr + row * i + row // 2
            col = STATE_COLOR[ss["state"]]
            cv.create_text(pad, cy, anchor="w", text="CH%d" % (i + 1), fill=C_DIM, font=self.f_ch)
            self.draw_led(led_x, cy, col, s)
            label = self.fit_text(ss["label"] or "(无标题)", name_max)
            nm = C_NAME if ss["state"] != "stby" else "#9ec4b3"
            cv.create_text(name_x, cy, anchor="w", text=label, fill=nm, font=self.f_name)
            cv.create_text(W - pad, cy, anchor="e", text=STATE_WORD[ss["state"]], fill=col, font=self.f_state)
            # 记录行区域
            y1 = hdr + row * i
            y2 = y1 + row
            self.row_bboxes.append((0, y1, W, y2, i))

        self.grip_bbox = (W - round(16 * s), H - round(16 * s), W, H)
        self._draw_grip(W, H, s)
        self._present()

    def _draw_grip(self, W, H, s):
        gx, gy = W - round(4 * s), H - round(4 * s)
        for off in (0, round(4 * s), round(8 * s)):
            self.cv.create_line(gx - off, gy, gx, gy - off, fill=C_DIM)

    def _present(self):
        # 强制分层窗重新合成:修复 -transparentcolor 窗"内容变了不点不刷新"的毛病
        if getattr(self, "_presenting", False):   # 防重入,避免 update_idletasks 嵌套触发 Tcl panic
            return
        self._presenting = True
        try:
            self.root.update_idletasks()
            u = ctypes.windll.user32
            hwnd = u.GetAncestor(self.root.winfo_id(), 2) or self.root.winfo_id()
            u.RedrawWindow(hwnd, None, None, 0x0185)
        except Exception:
            pass
        finally:
            self._presenting = False

    # ---- 交互 ----
    def _in(self, bbox, x, y):
        return bbox[0] <= x <= bbox[2] and bbox[1] <= y <= bbox[3]

    def _in_track(self, x, y):
        if not self.op_track:
            return False
        tx1, tx2 = self.op_track
        return tx1 - 7 <= x <= tx2 + 7 and 0 <= y <= self.hdr

    def _zone(self, x, y):
        # 右下角=自由缩放(宽+大小);右边缘=只调宽;下边缘=只调大小
        corner = max(16, round(16 * self.s))
        edge = max(8, round(8 * self.s))
        if x >= self.W - corner and y >= self.H - corner:
            return "size"
        if x >= self.W - edge and y > self.hdr:
            return "width"
        if y >= self.H - edge:
            return "vsize"
        return None

    def _get_row_at(self, x, y):
        """返回鼠标下的行索引,无则 None"""
        if not hasattr(self, 'row_bboxes'):
            return None
        for x1, y1, x2, y2, idx in self.row_bboxes:
            if x1 <= x <= x2 and y1 <= y <= y2:
                return idx
        return None

    def show_tooltip(self, x, y, text):
        """在鼠标位置显示 tooltip(内容不变时只移动,不重建窗口)"""
        if not text:
            self.hide_tooltip()
            return
        if not self.tooltip or self.tooltip_label.cget("text") != text:
            self.hide_tooltip()
            self.tooltip = tk.Toplevel(self.root)
            self.tooltip.overrideredirect(True)
            self.tooltip.attributes("-topmost", True)
            try:
                self.tooltip.attributes("-transparentcolor", C_KEY)
            except tk.TclError:
                pass
            self.tooltip_label = tk.Label(self.tooltip, text=text,
                                          bg="#1a2f22", fg="#cfeede",
                                          font=("Microsoft YaHei UI", 8),
                                          bd=1, relief="solid", padx=6, pady=3)
            self.tooltip_label.pack()
        # 定位到鼠标右下方
        cx, cy = cursor_pos()
        self.tooltip.geometry("+%d+%d" % (cx + 12, cy + 12))

    def hide_tooltip(self):
        """隐藏 tooltip"""
        if self.tooltip:
            try:
                self.tooltip.destroy()
            except Exception:
                pass
            self.tooltip = None
            self.tooltip_label = None

    def on_motion(self, e):
        z = self._zone(e.x, e.y)
        if z == "size":
            self.cv.config(cursor="size_nw_se")
        elif z == "width":
            self.cv.config(cursor="size_we")
        elif z == "vsize":
            self.cv.config(cursor="size_ns")
        elif self._in_track(e.x, e.y) or self._in(self.pin_bbox, e.x, e.y) or self._in(self.x_bbox, e.x, e.y):
            self.cv.config(cursor="hand2")
            self.hide_tooltip()
        else:
            self.cv.config(cursor="fleur")
            # 检测是否悬停在某一行上
            row_idx = self._get_row_at(e.x, e.y)
            if row_idx is not None and row_idx < len(self.sessions):
                ss = self.sessions[row_idx]
                # 只有蓝灯(后台任务)才显示 tooltip
                if ss["state"] == "bg" and ss.get("bg_info"):
                    bg = ss["bg_info"]
                    tip_text = "后台任务: %s\n状态: %s" % (bg.get("name", "(无名称)"), bg.get("state", "未知"))
                    if bg.get("tempo"):
                        tip_text += "\n节奏: %s" % bg["tempo"]
                    self.show_tooltip(e.x, e.y, tip_text)
                else:
                    self.hide_tooltip()
            else:
                self.hide_tooltip()

    def on_leave(self, e):
        """鼠标离开窗口时隐藏 tooltip"""
        self.hide_tooltip()

    def on_press(self, e):
        if self._in(self.x_bbox, e.x, e.y):
            self.quit_app(); return
        if self._in(self.pin_bbox, e.x, e.y):
            self.toggle_pin(); return
        if self._in_track(e.x, e.y):
            mode = "opacity"
        else:
            mode = self._zone(e.x, e.y) or "move"
        cx, cy = cursor_pos()
        self._drag = {"mode": mode, "cx": cx, "cy": cy,
                      "ox": self.root.winfo_x(), "oy": self.root.winfo_y(),
                      "w": self.W, "s": self.s}
        if mode == "opacity":
            self.set_opacity_from_x(e.x)

    def on_drag(self, e):
        d = self._drag
        if not d:
            return
        m = d["mode"]
        if m == "opacity":
            self.set_opacity_from_x(e.x)
            return
        cx, cy = cursor_pos()
        dx, dy = cx - d["cx"], cy - d["cy"]
        if m == "move":
            self.X, self.Y = d["ox"] + dx, d["oy"] + dy
            self.root.geometry("+%d+%d" % (self.X, self.Y))
        else:
            if m in ("size", "width"):
                self.W = max(160, round(d["w"] + dx))
            if m in ("size", "vsize"):
                self.s = min(3.0, max(0.6, round(d["s"] + dy / 200.0, 3)))
                self.apply_scale()
            self._sig = None; self.draw()

    def on_release(self, e):
        if self._drag:
            self._drag = None
            self.save_cfg()   # 拖动结束后持久化位置/宽度/缩放

    def set_opacity_from_x(self, x):
        if not self.op_track:
            return
        tx1, tx2 = self.op_track
        frac = max(0.0, min(1.0, (x - tx1) / max(1, tx2 - tx1)))
        self.opacity = round(0.2 + frac * 0.8, 2)
        self.root.attributes("-alpha", self.opacity)
        self._sig = None; self.draw()

    def on_wheel(self, e):
        self.opacity = max(0.2, min(1.0, round(self.opacity + (0.04 if e.delta > 0 else -0.04), 2)))
        self.root.attributes("-alpha", self.opacity)
        self._sig = None; self.draw(); self.save_cfg()


def configure_winapi():
    # 仅声明自有窗口/光标相关的 user32 调用类型(不碰任何其它进程)
    from ctypes import wintypes as wt
    u = ctypes.windll.user32
    u.GetCursorPos.argtypes = [ctypes.POINTER(_POINT)]
    u.GetSystemMetrics.argtypes = [ctypes.c_int]
    u.GetSystemMetrics.restype = ctypes.c_int
    u.GetAncestor.restype = wt.HWND
    u.GetAncestor.argtypes = [wt.HWND, wt.UINT]
    u.RedrawWindow.argtypes = [wt.HWND, ctypes.c_void_p, wt.HANDLE, wt.UINT]


def main():
    os.makedirs(RUNTIME_DIR, exist_ok=True)
    try:
        import faulthandler
        faulthandler.enable(file=open(os.path.join(RUNTIME_DIR, "fault.log"), "a", buffering=1))
    except Exception:
        pass
    try:
        configure_winapi()
    except Exception:
        log_error("winapi")
    sys.excepthook = lambda *a: log_error("excepthook")
    root = tk.Tk()
    root.report_callback_exception = lambda *a: log_error("tk-callback")
    root.title("claude-scope")
    Scope(root)
    root.mainloop()


if __name__ == "__main__":
    main()
