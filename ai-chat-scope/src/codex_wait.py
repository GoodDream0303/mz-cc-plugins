"""Metadata-only attention tracking, verified against CLI async-question records.

This tracks whether the session awaits a user message, not whether each answer
semantically resolves an individual question. No question or answer text is kept.
"""
from collections import deque


class AsyncAttention:
    def __init__(self):
        self.waiting = False
        self._turn = None
        self._cancelled = deque(maxlen=64)
        self._questions = deque(maxlen=512)
        self._inputs = deque(maxlen=512)

    def apply(self, record):
        if record.get("type") != "event_msg":
            return
        payload = record.get("payload")
        if not isinstance(payload, dict):
            return
        kind = payload.get("type")
        turn = payload.get("turn_id")
        if kind == "task_started":
            if isinstance(turn, str):
                self._turn = turn
            return
        if turn is not None and self._turn is not None and turn != self._turn:
            return
        if kind == "turn_aborted":
            self.waiting = False
            if isinstance(turn, str):
                self._cancelled.append(turn)
            return
        if kind != "item_completed" or turn in self._cancelled:
            return
        item = payload.get("item")
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            return
        identity = (turn, item["id"])
        if item.get("type") == "UserMessage" or (
            item.get("type") == "SteeringUserMessage" and item.get("status") == "accepted"
        ):
            if identity not in self._inputs:
                self._inputs.append(identity)
                self.waiting = False
        elif item.get("type") == "AgentMessage":
            questions = item.get("questions")
            if (isinstance(questions, list)
                    and any(isinstance(q, dict) and isinstance(q.get("title"), str) for q in questions)
                    and identity not in self._questions):
                self._questions.append(identity)
                self.waiting = True
