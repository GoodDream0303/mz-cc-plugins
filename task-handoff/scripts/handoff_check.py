#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""task-handoff v2 校验脚本(仅标准库,Python 3.8+)。

用法:
  handoff_check.py zero-loss <旧handoff.md> <新handoff.md> <log.md>
  handoff_check.py sections  <handoff.md>
  handoff_check.py index     <handoff_root>
退出码:0 通过;1 有 ERROR;2 用法错误。WARN 不影响退出码。
"""
import os
import re
import sys

SECTIONS = [
    "## 1. 任务目标", "## 2. 背景与约束", "## 3. 当前状态", "## 4. 有效决策",
    "## 5. 改动清单", "## 6. 验证方法", "## 7. 下一步", "## 8. 未决问题",
    "## 9. 关键链接与路径",
]
HEADER = ["序号", "任务名", "状态", "一句话状态", "TaskId", "文件夹", "最近更新"]
# (区名, 期望状态, 序号正则, 文件夹列前缀)
ZONES = [
    ("主表", "🔄进行中", r"^[1-9]\d*$", ""),
    ("## 阻塞", "⬜阻塞", r"^B[1-9]\d*$", ""),
    ("## 已完成", "✅已完成", r"^C[1-9]\d*$", ""),
    ("## 已归档", None, r"^-$", "archive/"),
]
MAX_NAME, MAX_ONELINER = 30, 60


def read_text(path):
    with open(path, encoding="utf-8-sig") as f:
        return f.read().replace("\r\n", "\n").replace("\r", "\n")


def section_prefix(line):
    """返回该行匹配的模板标题,否则 None。允许标题后带说明文字。"""
    s = line.strip()
    for sec in SECTIONS:
        if s.startswith(sec):
            return sec
    return None


def zero_loss(old_path, new_path, log_path):
    """旧文件每一有效行(去首尾空白)必须作为子串出现在新 handoff 或 log 的文本里。
    用子串而非整行比对,因为 log 条目把原文包在 '- [§3] <原文>(原因:...)' 里。"""
    old_lines = read_text(old_path).split("\n")
    new_text = read_text(new_path)
    pool_text = new_text + "\n" + read_text(log_path)
    missing, checked, seen_section = [], 0, False
    for line in old_lines:
        s = line.strip()
        if not s:
            continue
        if s.startswith("## "):
            seen_section = True
            continue
        if s.startswith("# ") or (s.startswith(">") and not seen_section):
            continue
        checked += 1
        if s not in pool_text:
            missing.append(s)
    errors = len(missing)
    old_head = "\n".join(l for l in old_lines if l.startswith(">") or l.startswith("# "))
    for key in ("TaskId:", "> 分支:", "> 关键路径:"):
        m = re.search(re.escape(key) + r"\s*([^|\n]+)", old_head)
        if m:
            val = m.group(1).strip()
            if val and val not in new_text:
                print("ERROR: 头部字段未保留 %s%s" % (key, val))
                errors += 1
    for s in missing:
        print("ERROR: 丢失行: %s" % s)
    print("zero-loss: 检查 %d 行, 丢失 %d" % (checked, len(missing)))
    return 1 if errors else 0


def sections(path):
    heads = [l.strip() for l in read_text(path).split("\n") if l.startswith("## ")]
    errors = 0
    positions = {}
    for i, h in enumerate(heads):
        sec = section_prefix(h)
        if sec is None:
            continue
        if sec in positions:
            print("ERROR: 重复标题 %s" % h)
            errors += 1
            continue
        positions[sec] = i
    for sec in SECTIONS:
        if sec not in positions:
            print("ERROR: 缺少 %s" % sec)
            errors += 1
    order = [positions[s] for s in SECTIONS if s in positions]
    if order != sorted(order):
        print("ERROR: 九节顺序不对")
        errors += 1
    if order:
        last = max(order)
        for i, h in enumerate(heads):
            if section_prefix(h) is None and i < last:
                print("ERROR: 非模板标题出现在 §9 之前: %s" % h)
                errors += 1
    print("sections: %s" % ("通过" if not errors else "%d 个问题" % errors))
    return 1 if errors else 0


def parse_tables(text):
    """返回 [(区名, 表头cells, [(行号, cells)])];主表 = 第一个 '## ' 之前。"""
    zones, cur, header, rows = [], "主表", None, []
    for n, raw in enumerate(text.split("\n"), 1):
        line = raw.strip()
        if line.startswith("## "):
            zones.append((cur, header, rows))
            cur, header, rows = line, None, []
            continue
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if header is None:
            header = cells
            continue
        if all(set(c) <= set("-: ") for c in cells):
            continue  # 分隔行
        rows.append((n, cells))
    zones.append((cur, header, rows))
    return zones


def index_check(root):
    path = os.path.join(root, "INDEX.md")
    if not os.path.isfile(path):
        print("ERROR: 缺少 %s" % path)
        return 1
    counts = {"err": 0, "warn": 0}

    def err(msg):
        counts["err"] += 1
        print("ERROR: " + msg)

    def warn(msg):
        counts["warn"] += 1
        print("WARN: " + msg)

    referenced = set()
    for zone, header, rows in parse_tables(read_text(path)):
        spec = next((z for z in ZONES if z[0] == zone), None)
        if spec is None:
            if header is not None:
                warn("未知分区 %s,未检查" % zone)
            continue
        _, want_status, num_re, prefix = spec
        if header is None:
            if rows:
                err("%s 无表头" % zone)
            continue
        if header != HEADER:
            err("%s 表头应为 %s,实际 %s" % (zone, " | ".join(HEADER), " | ".join(header)))
        expect = 1
        for n, cells in rows:
            if len(cells) != 7:
                err("第 %d 行列数 %d 不是 7(单元格里含 '|'?)" % (n, len(cells)))
                continue
            seq, name, status, oneliner, taskid, folder, updated = cells
            if not re.match(num_re, seq):
                err("第 %d 行序号 '%s' 不符合 %s 规则" % (n, seq, zone))
            elif want_status is not None:
                num = int(re.sub(r"\D", "", seq))
                if num != expect:
                    err("第 %d 行序号 %s 不连续,期望 %d" % (n, seq, expect))
                expect = num + 1
            if want_status is not None and status != want_status:
                err("第 %d 行状态 '%s' 与分区 %s 不符" % (n, status, zone))
            if len(name) > MAX_NAME:
                err("第 %d 行任务名 %d 字 > %d" % (n, len(name), MAX_NAME))
            if len(oneliner) > MAX_ONELINER:
                err("第 %d 行一句话状态 %d 字 > %d" % (n, len(oneliner), MAX_ONELINER))
            if want_status == "⬜阻塞" and oneliner in ("", "无"):
                err("第 %d 行 ⬜ 任务缺阻塞原因" % n)
            if not folder.startswith(prefix) or not folder.endswith("/handoff.md"):
                err("第 %d 行文件夹列 '%s' 应为 %s<文件夹>/handoff.md" % (n, folder, prefix))
            fpath = os.path.join(root, *folder.split("/"))
            if not os.path.isfile(fpath):
                err("第 %d 行孤儿行:找不到 %s" % (n, fpath))
            else:
                folder_dir = os.path.dirname(fpath)
                referenced.add(os.path.normpath(folder_dir))
                if not os.path.isfile(os.path.join(folder_dir, "log.md")):
                    warn("%s 缺 log.md(仍是 v1 格式)" % folder)
    for base in (root, os.path.join(root, "archive")):
        if not os.path.isdir(base):
            continue
        for d in sorted(os.listdir(base)):
            full = os.path.join(base, d)
            if d == "archive" or not os.path.isdir(full):
                continue
            if os.path.isfile(os.path.join(full, "handoff.md")) and os.path.normpath(full) not in referenced:
                err("漏登记:%s 有 handoff.md 但 INDEX 无对应行" % full)
    for dirpath, dirnames, files in os.walk(root):
        dirnames[:] = [d for d in dirnames if d != ".git"]
        for f in files:
            if f.endswith(".bak"):
                warn("残留备份 %s" % os.path.join(dirpath, f))
    print("index: %d ERROR, %d WARN" % (counts["err"], counts["warn"]))
    return 1 if counts["err"] else 0


def main(argv):
    if len(argv) >= 3 and argv[1] == "sections":
        return sections(argv[2])
    if len(argv) >= 3 and argv[1] == "index":
        return index_check(argv[2])
    if len(argv) >= 5 and argv[1] == "zero-loss":
        return zero_loss(argv[2], argv[3], argv[4])
    print(__doc__)
    return 2


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv))
