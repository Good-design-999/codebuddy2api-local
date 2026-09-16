"""Derive a shared international catalog without changing account-owned source caches."""
from copy import deepcopy
import math
import re


INTERNATIONAL = frozenset(("intl-cli", "intl-work"))
_AUTOMATIC = frozenset(("auto", "default-model"))


class SharedModel(dict):
    """Retain source variants outside JSON data so upstream fields cannot forge provenance."""

    def __init__(self, values, sources):
        super().__init__(values)
        self.catalog_sources = tuple(sources)


def _rate(value):
    if not isinstance(value, str):
        return None
    match = re.fullmatch(r"x\s*([0-9]+(?:\.[0-9]+)?)\s*(?:credits?)?", value.strip(), re.IGNORECASE)
    if not match:
        return None
    number = float(match.group(1))
    return number if math.isfinite(number) else None


def _flag(values, *, restrictive=False):
    if any(value is restrictive for value in values):
        return restrictive
    if all(type(value) is bool for value in values):
        return not restrictive
    return None


def _common_model(sources):
    models = [model for _, model in sources]
    result = deepcopy(models[0])
    for field in ("supportsImages", "supportsToolCall", "supportsReasoning", "canDisableThinking",
                  "supportsExtra", "disabledMultimodal", "onlyReasoning"):
        value = _flag([model.get(field) for model in models],
                      restrictive=field in ("disabledMultimodal", "onlyReasoning"))
        if value is None:
            result.pop(field, None)
        else:
            result[field] = value
    for field in ("maxInputTokens", "maxOutputTokens", "maxAllowedSize"):
        values = [model.get(field) for model in models]
        if all(type(value) is int and value > 0 for value in values):
            result[field] = min(values)
        else:
            result.pop(field, None)
    rates = [_rate(model.get("credits")) for model in models]
    if None in rates:
        result.pop("credits", None)
    else:
        result["credits"] = models[max(range(len(rates)), key=rates.__getitem__)]["credits"]
    reasons = [model.get("reasoning") if isinstance(model.get("reasoning"), dict) else {} for model in models]
    reasoning = {}
    disable = _flag([item.get("canDisableThinking") for item in reasons])
    if disable is not None:
        reasoning["canDisableThinking"] = disable
    efforts = [item.get("supportedEfforts") for item in reasons]
    if all(isinstance(values, list) and all(isinstance(value, str) for value in values) for values in efforts):
        reasoning["supportedEfforts"] = list(dict.fromkeys(value for value in efforts[0]
                                                          if all(value in values for values in efforts)))
    for field in ("defaultEffort", "effort", "summary"):
        values = [item.get(field) for item in reasons]
        if values[0] is not None and all(value == values[0] for value in values):
            reasoning[field] = values[0]
    if reasoning:
        result["reasoning"] = reasoning
    else:
        result.pop("reasoning", None)
    for field in ("isDefault", "relatedModels", "contextWindow", "temperature", "top_p", "top_k",
                  "repetition_penalty", "name", "vendor", "description", "descriptionZh",
                  "descriptionEn", "tags", "iconUrl"):
        values = [model.get(field) for model in models]
        if field == "isDefault" or any(value != values[0] for value in values):
            result.pop(field, None)
    return SharedModel(result, sources)


def share_models(native, profile, sources, *, model_id=None):
    """Prefer native IDs, inherit missing international IDs, and preserve readiness and auto routing."""
    if profile not in INTERNATIONAL or native is None:
        return native
    result = {}
    for model in native:
        if isinstance(model, dict) and model.get("id") and (model_id is None or model["id"] == model_id):
            result.setdefault(model["id"], model)
    shared = {}
    for source_profile, models in sources:
        if source_profile not in INTERNATIONAL:
            continue
        for model in models or []:
            name = model.get("id")
            if (not name or name in result or name in _AUTOMATIC or model.get("disabled")
                    or (model_id is not None and name != model_id) or model.get("supportsToolCall") is not True):
                continue
            variants = shared.setdefault(name, [])
            record = (source_profile, model)
            if record not in variants:
                variants.append(record)
    for name in sorted(shared):
        result[name] = _common_model(shared[name])
    return list(result.values())
