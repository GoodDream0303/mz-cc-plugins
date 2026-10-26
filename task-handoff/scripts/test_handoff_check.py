# -*- coding: utf-8 -*-
import contextlib
import io
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import handoff_check as hc  # noqa: E402

V2 = r"""# 甲 | TaskId:123 | 分类:x
> 状态:🔄进行中
> 创建:2026-01-01   最近更新:2026-01-02
> 分支:feature_1
> 关键路径:E:\p
> 落盘记录:2026-01-02 session s1

## 1. 任务目标
目标A
## 2. 背景与约束
无
## 3. 当前状态
状态B
## 4. 有效决策
决策C
## 5. 改动清单
无
## 6. 验证方法
无
## 7. 下一步
下一步D
## 8. 未决问题
无
## 9. 关键链接与路径
E:\p
"""

INDEX_OK = """# 总账

| 序号 | 任务名 | 状态 | 一句话状态 | TaskId | 文件夹 | 最近更新 |
|------|--------|------|------------|--------|--------|----------|
| 1 | 任务甲 | 🔄进行中 | 进行中 | 无 | 任务甲_20260101/handoff.md | 2026-01-02 |
| 2 | 任务乙 | 🔄进行中 | 进行中 | 12 | 任务乙（全角）_20260101/handoff.md | 2026-01-02 |

## 阻塞

| 序号 | 任务名 | 状态 | 一句话状态 | TaskId | 文件夹 | 最近更新 |
|------|--------|------|------------|--------|--------|----------|
| B1 | 任务丙 | ⬜阻塞 | 等硬件到货 | 无 | 任务丙_20260101/handoff.md | 2026-01-02 |

## 已完成

| 序号 | 任务名 | 状态 | 一句话状态 | TaskId | 文件夹 | 最近更新 |
|------|--------|------|------------|--------|--------|----------|
| C1 | 任务丁 | ✅已完成 | 完成 | 无 | 任务丁_20260101/handoff.md | 2026-01-02 |

## 已归档

| 序号 | 任务名 | 状态 | 一句话状态 | TaskId | 文件夹 | 最近更新 |
|------|--------|------|------------|--------|--------|----------|
| - | 任务戊 | ✅已完成 | 归档 | 无 | archive/任务戊_20260101/handoff.md | 2026-01-02 |
"""


def w(path, text, newline="\n"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline=newline) as f:
        f.write(text)


def run(fn, *args):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = fn(*args)
    return code, buf.getvalue()


def make_root(tmp, index=INDEX_OK, with_log=True):
    w(os.path.join(tmp, "INDEX.md"), index)
    for d in ("任务甲_20260101", "任务乙（全角）_20260101", "任务丙_20260101",
              "任务丁_20260101", os.path.join("archive", "任务戊_20260101")):
        w(os.path.join(tmp, d, "handoff.md"), V2)
        if with_log:
            w(os.path.join(tmp, d, "log.md"), "# 日志\n")
    return tmp


class ZeroLoss(unittest.TestCase):
    def test_pass_when_all_lines_present(self):
        with tempfile.TemporaryDirectory() as t:
            old = os.path.join(t, "old.md")
            new = os.path.join(t, "new.md")
            log = os.path.join(t, "log.md")
            w(old, V2.replace("状态B", "状态B\n已完成的事X"))
            w(new, V2)
            w(log, "# 日志\n## 2026-01-03  session s2\n- 从 handoff 搬出:\n  - [§3] 已完成的事X(原因:已完成)\n")
            code, out = run(hc.zero_loss, old, new, log)
            self.assertEqual(code, 0, out)

    def test_reports_missing_line(self):
        with tempfile.TemporaryDirectory() as t:
            old = os.path.join(t, "old.md")
            new = os.path.join(t, "new.md")
            log = os.path.join(t, "log.md")
            w(old, V2.replace("状态B", "状态B\n被弄丢的一行"))
            w(new, V2)
            w(log, "# 日志\n")
            code, out = run(hc.zero_loss, old, new, log)
            self.assertEqual(code, 1)
            self.assertIn("丢失行: 被弄丢的一行", out)

    def test_tolerates_crlf_and_trailing_space(self):
        with tempfile.TemporaryDirectory() as t:
            old = os.path.join(t, "old.md")
            new = os.path.join(t, "new.md")
            log = os.path.join(t, "log.md")
            w(old, V2.replace("状态B", "状态B   "), newline="\r\n")
            w(new, V2)
            w(log, "# 日志\n")
            code, out = run(hc.zero_loss, old, new, log)
            self.assertEqual(code, 0, out)

    def test_header_values_must_survive(self):
        with tempfile.TemporaryDirectory() as t:
            old = os.path.join(t, "old.md")
            new = os.path.join(t, "new.md")
            log = os.path.join(t, "log.md")
            w(old, V2)
            w(new, V2.replace("> 分支:feature_1", "> 分支:无"))
            w(log, "# 日志\n")
            code, out = run(hc.zero_loss, old, new, log)
            self.assertEqual(code, 1)
            self.assertIn("头部字段未保留 > 分支:feature_1", out)


class Sections(unittest.TestCase):
    def test_pass(self):
        with tempfile.TemporaryDirectory() as t:
            p = os.path.join(t, "h.md")
            w(p, V2.replace("## 7. 下一步", "## 7. 下一步(新会话第一件事)"))
            code, out = run(hc.sections, p)
            self.assertEqual(code, 0, out)

    def test_duplicate_and_appendix(self):
        with tempfile.TemporaryDirectory() as t:
            p = os.path.join(t, "h.md")
            w(p, V2 + "\n## 10. 待用户确认项\n内容\n")
            code, out = run(hc.sections, p)
            self.assertEqual(code, 0, out)  # 附录在 §9 之后允许
            w(p, V2.replace("## 8. 未决问题\n无\n", "## 8. 未决问题\n无\n## 8. 未决问题\n又一次\n"))
            code, out = run(hc.sections, p)
            self.assertEqual(code, 1)
            self.assertIn("重复标题", out)

    def test_appendix_before_section9_is_error(self):
        with tempfile.TemporaryDirectory() as t:
            p = os.path.join(t, "h.md")
            w(p, V2.replace("## 9. 关键链接与路径", "## 架构速览\n图\n## 9. 关键链接与路径"))
            code, out = run(hc.sections, p)
            self.assertEqual(code, 1)
            self.assertIn("非模板标题出现在 §9 之前", out)

    def test_v1_heading_reported_missing(self):
        with tempfile.TemporaryDirectory() as t:
            p = os.path.join(t, "h.md")
            w(p, V2.replace("## 3. 当前状态", "## 3. 当前进度"))
            code, out = run(hc.sections, p)
            self.assertEqual(code, 1)
            self.assertIn("缺少 ## 3. 当前状态", out)


class Index(unittest.TestCase):
    def test_pass_with_unicode_folders(self):
        with tempfile.TemporaryDirectory() as t:
            make_root(t)
            code, out = run(hc.index_check, t)
            self.assertEqual(code, 0, out)
            self.assertNotIn("WARN:", out)

    def test_blocked_row_without_reason(self):
        with tempfile.TemporaryDirectory() as t:
            make_root(t, INDEX_OK.replace("| B1 | 任务丙 | ⬜阻塞 | 等硬件到货 |", "| B1 | 任务丙 | ⬜阻塞 | 无 |"))
            code, out = run(hc.index_check, t)
            self.assertEqual(code, 1)
            self.assertIn("缺阻塞原因", out)

    def test_numbering_gap(self):
        with tempfile.TemporaryDirectory() as t:
            make_root(t, INDEX_OK.replace("| 2 | 任务乙 |", "| 3 | 任务乙 |"))
            code, out = run(hc.index_check, t)
            self.assertEqual(code, 1)
            self.assertIn("不连续", out)

    def test_pipe_in_cell(self):
        with tempfile.TemporaryDirectory() as t:
            make_root(t, INDEX_OK.replace("| 等硬件到货 |", "| 等硬件|到货 |"))
            code, out = run(hc.index_check, t)
            self.assertEqual(code, 1)
            self.assertIn("列数", out)

    def test_orphan_and_unregistered(self):
        with tempfile.TemporaryDirectory() as t:
            make_root(t)
            os.rename(os.path.join(t, "任务甲_20260101"), os.path.join(t, "没登记_20260101"))
            code, out = run(hc.index_check, t)
            self.assertEqual(code, 1)
            self.assertIn("孤儿行", out)
            self.assertIn("漏登记", out)

    def test_bak_and_missing_log_are_warnings(self):
        with tempfile.TemporaryDirectory() as t:
            make_root(t, with_log=False)
            w(os.path.join(t, "任务甲_20260101", "handoff.bak"), "x")
            code, out = run(hc.index_check, t)
            self.assertEqual(code, 0, out)
            self.assertIn("WARN: 残留备份", out)
            self.assertIn("WARN: 任务甲_20260101/handoff.md 缺 log.md", out)

    def test_status_zone_mismatch_and_length(self):
        with tempfile.TemporaryDirectory() as t:
            bad = INDEX_OK.replace("| 1 | 任务甲 | 🔄进行中 | 进行中 |", "| 1 | " + "名" * 31 + " | ✅已完成 | " + "长" * 61 + " |")
            make_root(t, bad)
            code, out = run(hc.index_check, t)
            self.assertEqual(code, 1)
            self.assertIn("与分区 主表 不符", out)
            self.assertIn("任务名 31 字 > 30", out)
            self.assertIn("一句话状态 61 字 > 60", out)


if __name__ == "__main__":
    unittest.main()
