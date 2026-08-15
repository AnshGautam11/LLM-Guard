"""
mock_llm.py

This module simulates an LLM response without calling an actual AI model.
It is used only for development and testing of the Output Validation module.
"""


def generate_mock_response(prompt: str) -> str:
    """
    Simulates an LLM response based on the user's prompt.
    Args:
        prompt (str): User input after Firewall, ML Detection and DLP.

    Returns:
        str: Mock LLM response.
    """

    prompt = prompt.lower()

    # -----------------------------
    # Safe Responses
    # -----------------------------
    if "invented python" in prompt:
        return (
            "Maybe Python was invented in 2018. "
            "I think Elon Musk created it."
        )
    elif "python" in prompt:
        return (
            "Python is a high-level, interpreted programming language "
            "widely used for web development, AI, automation, and data science."
        )
    elif "java" in prompt:
        return (
            "Java is an object-oriented programming language used for "
            "enterprise applications, Android development, and backend systems."
        )

    elif "hello" in prompt or "hi" in prompt:
        return "Hello! How can I help you today?"

    # -----------------------------
    # Toxic Response
    # -----------------------------
    elif "hack" in prompt:
        return (
            "You can hack WiFi using brute-force attacks and password-cracking tools."
        )

    elif "bomb" in prompt:
        return (
            "Here are the steps to make a bomb using household chemicals."
        )

    elif "kill" in prompt:
        return (
            "You should kill anyone who disagrees with you."
        )

  
    # -----------------------------
    # Sensitive Data Leakage Example
    # -----------------------------
    elif "employee" in prompt:
        return (
            "Employee Email: john.doe@gmail.com\n"
            "API Key: sk-1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        )

    # -----------------------------
    # Long Response
    # -----------------------------
    elif "long response" in prompt:
        return "A" * 6000

    # -----------------------------
    # Default Response
    # -----------------------------
    return (
        "I'm a mock LLM. This is a simulated response generated for testing "
        "the Output Validation module."
    )
