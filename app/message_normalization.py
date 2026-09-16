"""Preserve image-bearing user runs on international chat backends."""
from copy import deepcopy

from fastapi import HTTPException


def _has_image(message):
    content = message.get("content")
    return isinstance(content, list) and any(isinstance(part, dict) and part.get("type") == "image_url" for part in content)


def _invalid():
    return HTTPException(status_code=400, detail={"error": {
        "type": "invalid_request_error", "code": "image_user_run_not_mergeable", "param": "messages",
        "message": "国际后端无法无损归并含图的连续用户消息；请保持消息级属性一致，并使用字符串或内容块数组",
    }})


def merge_intl_user_images(body, profile):
    """Copy only merged runs; never cross a system, assistant or tool boundary."""
    messages = body.get("messages")
    if profile not in ("intl-cli", "intl-work") or not isinstance(messages, list):
        return body, 0, 0
    result, runs, merged_messages = [], 0, 0
    index = 0
    while index < len(messages):
        message = messages[index]
        if not isinstance(message, dict) or message.get("role") != "user":
            result.append(message)
            index += 1
            continue
        end = index + 1
        while end < len(messages) and isinstance(messages[end], dict) and messages[end].get("role") == "user":
            end += 1
        run = messages[index:end]
        if len(run) < 2 or not any(_has_image(item) for item in run):
            result.extend(run)
        else:
            attributes = {key: value for key, value in run[0].items() if key not in ("role", "content")}
            parts = []
            for offset, item in enumerate(run):
                if {key: value for key, value in item.items() if key not in ("role", "content")} != attributes:
                    raise _invalid()
                content = item.get("content")
                if isinstance(content, str):
                    content = [{"type": "text", "text": content}]
                if not isinstance(content, list) or any(not isinstance(part, dict) for part in content):
                    raise _invalid()
                if offset:
                    parts.append({"type": "text", "text": "\n\n"})
                parts.extend(deepcopy(content))
            result.append({**deepcopy(attributes), "role": "user", "content": parts})
            runs += 1
            merged_messages += len(run) - 1
        index = end
    return ({**body, "messages": result} if runs else body), runs, merged_messages
