import os
from typing import Any

try:
    import anthropic  # optional dependency
    _HAS_SDK = True
except ImportError:
    _HAS_SDK = False


def explain(diagnosis: dict[str, Any], recovery_probability: float, policy_decision: dict[str, Any]) -> dict[str, Any]:
    api_key = os.environ.get("ANTHROPIC_API_KEY")

    template_text = (
        f"Diagnosis: {diagnosis['cause']} (confidence {diagnosis['confidence']*100:.0f}%). "
        f"Recovery probability estimated at {recovery_probability*100:.0f}%. "
        f"Recommended action: {diagnosis['recommended_action']}. "
        f"Policy engine decision: {'ALLOWED' if policy_decision.get('allowed') else 'BLOCKED'} "
        f"({policy_decision.get('reason', 'n/a')})."
    )

    if not api_key or not _HAS_SDK:
        return {
            "narration": template_text,
            "source": "template_fallback",
            "note": "ANTHROPIC_API_KEY not configured in this environment - "
                    "using a deterministic template built from the same evidence "
                    "an LLM call would narrate. No LLM call was made.",
        }

    try:
        client = anthropic.Anthropic(api_key=api_key)
        prompt = (
            "You are explaining a revenue-recovery decision to a fintech operations "
            "analyst. Do NOT change the recommended action or confidence - only explain "
            "it clearly in 2-3 sentences, using this data:\n"
            f"Cause: {diagnosis['cause']}\n"
            f"Evidence: {diagnosis['evidence']}\n"
            f"Recovery probability: {recovery_probability}\n"
            f"Recommended action: {diagnosis['recommended_action']}\n"
            f"Policy decision: {policy_decision}\n"
        )
        resp = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        return {"narration": text.strip() or template_text, "source": "llm", "note": "Generated via Anthropic API."}
    except Exception as e: 
        return {
            "narration": template_text,
            "source": "template_fallback",
            "note": f"LLM call failed ({e}); used deterministic template instead.",
        }
