import importlib.util
from pathlib import Path
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "tools/codex_async_contract.py"


def event(kind, turn="turn-1", item=None):
    payload = {"type": kind, "turn_id": turn}
    if item is not None:
        payload["item"] = item
    return {"type": "event_msg", "payload": payload}


def question(identity="question-1", turn="turn-1"):
    return event("item_completed", turn, {
        "type": "AgentMessage", "id": identity, "delivery": "async",
        "questions": [{"title": "SECRET_QUESTION", "options": ["SECRET_OPTION"]}],
    })


class AsyncContractTests(unittest.TestCase):
    def state(self):
        self.assertTrue(SCRIPT.exists(), "Async attention contract is not implemented")
        spec = importlib.util.spec_from_file_location("async_contract", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.AsyncAttention()

    def test_posted_question_waits_even_after_turn_completed(self):
        state = self.state()
        state.apply(event("task_started"))
        state.apply(question())
        state.apply(event("task_complete"))
        self.assertTrue(state.waiting)
        self.assertNotIn("SECRET", repr(vars(state)))

    def test_actual_user_input_clears_attention_in_same_turn(self):
        state = self.state()
        state.apply(event("task_started"))
        state.apply(question())
        state.apply(event("item_completed", item={"type": "UserMessage", "id": "answer-1"}))
        self.assertFalse(state.waiting)

    def test_late_previous_turn_user_input_cannot_clear_new_question(self):
        state = self.state()
        state.apply(event("task_started"))
        state.apply(event("task_started", "turn-2"))
        state.apply(question(turn="turn-2"))
        state.apply(event("item_completed", "turn-1", {"type": "UserMessage", "id": "old-answer"}))
        self.assertTrue(state.waiting)

    def test_rejected_steering_does_not_clear_but_accepted_input_does(self):
        state = self.state()
        state.apply(event("task_started"))
        state.apply(question())
        state.apply(event("item_completed", item={"type": "SteeringUserMessage", "id": "reply-1", "status": "rejected"}))
        self.assertTrue(state.waiting)
        state.apply(event("item_completed", item={"type": "SteeringUserMessage", "id": "reply-2", "status": "accepted"}))
        self.assertFalse(state.waiting)

    def test_duplicate_old_input_does_not_clear_later_question(self):
        state = self.state()
        state.apply(event("task_started"))
        message = event("item_completed", item={"type": "UserMessage", "id": "old-input"})
        state.apply(message)
        state.apply(question())
        state.apply(message)
        self.assertTrue(state.waiting)

    def test_cancel_clears_attention_and_delayed_question_stays_cancelled(self):
        state = self.state()
        state.apply(event("task_started"))
        state.apply(event("turn_aborted"))
        state.apply(question())
        self.assertFalse(state.waiting)


if __name__ == "__main__":
    unittest.main()
