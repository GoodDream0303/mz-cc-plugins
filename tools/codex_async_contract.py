"""Compatibility entry for the product attention reducer."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ai-chat-scope" / "src"))
from codex_wait import AsyncAttention
