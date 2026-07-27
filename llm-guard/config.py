import os
from dataclasses import dataclass
from dotenv import load_dotenv

from pathlib import Path
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

@dataclass
class LLMConfig:
    provider: str
    base_url: str
    api_key: str
    model: str
    timeout: int = 30

SUPPORTED_PROVIDERS = {
    "openai": LLMConfig(
        provider="openai",
        base_url="https://api.openai.com/v1/chat/completions",
        api_key=os.getenv("OPENAI_API_KEY", ""),
        model="gpt-4o-mini",
    ),
    "echo_test": LLMConfig(
        provider="echo_test",
        base_url="https://postman-echo.com/post",
        api_key="",
        model="test",
    ),
}

ACTIVE_PROVIDER = os.getenv("LLM_PROVIDER", "echo_test")

def get_active_llm_config() -> LLMConfig:
    if ACTIVE_PROVIDER not in SUPPORTED_PROVIDERS:
        raise ValueError(f"Unknown LLM provider: {ACTIVE_PROVIDER}")
    return SUPPORTED_PROVIDERS[ACTIVE_PROVIDER]

FIREWALL_SETTINGS = {
    "max_prompt_length": 4000,
    "block_threshold": 0.7,
    "log_blocked_prompts": True,
}