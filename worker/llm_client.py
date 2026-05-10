"""
Unified LLM client with agentic tool-use loop.

Supports: anthropic | openai | google | ollama
Modelled on the Claude Code agentic pattern:
  model outputs tool_calls → executor runs them → results fed back → repeat.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Any, Callable

# ---------------------------------------------------------------------------
# System prompt (coding-engineer persona, mirrors Claude Code style)
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are Mneme, an expert autonomous software engineer. You have been given a
coding task. Work step by step, using the available tools to read, understand,
and modify the repository. Follow the approved implementation plan precisely.

Rules:
- Always read a file before editing it.
- Keep changes minimal and focused on the task objective.
- After making changes, run the available test commands to verify correctness.
- Call `task_complete` with a brief summary once the work is done.
- If you are blocked and cannot proceed, call `task_complete` with
  status="blocked" and explain why.
- Never delete files unless explicitly required by the plan.
- Do not commit or push — the human reviewer will do that after approval.
"""

# ---------------------------------------------------------------------------
# Tool schema (shared across all providers via conversion helpers)
# ---------------------------------------------------------------------------

TOOLS: list[dict[str, Any]] = [
    {
        "name": "read_file",
        "description": "Read the contents of a file in the repository.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Relative path to the file within the repo."},
            },
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": "Write (create or overwrite) a file in the repository.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Relative path to the file within the repo."},
                "content": {"type": "string", "description": "Full file content to write."},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "list_directory",
        "description": "List files and directories at a path.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Relative path to list (use '.' for root)."},
            },
            "required": ["path"],
        },
    },
    {
        "name": "search_files",
        "description": "Search for a text pattern across files in the repo (grep-style).",
        "parameters": {
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "Text or regex pattern to search for."},
                "glob": {"type": "string", "description": "File glob to restrict search, e.g. '*.py'. Optional."},
            },
            "required": ["pattern"],
        },
    },
    {
        "name": "bash",
        "description": (
            "Run a shell command in the repository directory. "
            "Only safe commands are allowed: test runners (pytest, npm test, etc.), "
            "linters, formatters, and read-only git commands."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Shell command to run."},
            },
            "required": ["command"],
        },
    },
    {
        "name": "task_complete",
        "description": "Signal that the task is finished or blocked.",
        "parameters": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["done", "blocked"],
                    "description": "'done' if work is complete, 'blocked' if you cannot proceed.",
                },
                "summary": {"type": "string", "description": "Brief summary of what was done or why blocked."},
            },
            "required": ["status", "summary"],
        },
    },
]

# Commands allowed for the bash tool
_BASH_ALLOWLIST_RE = re.compile(
    r"^(pytest|python -m pytest|npm test|npm run test|pnpm test|yarn test"
    r"|npm run lint|eslint|pylint|flake8|ruff|black|isort"
    r"|git (status|diff|log|show|branch|remote)"
    r"|cat |head |tail |ls |find |grep |echo )"
)


def _is_safe_bash(command: str) -> bool:
    return bool(_BASH_ALLOWLIST_RE.match(command.strip()))


# ---------------------------------------------------------------------------
# Tool executor
# ---------------------------------------------------------------------------

class ToolExecutor:
    def __init__(self, repo_path: Path, timeout: int = 60):
        self.repo_path = repo_path
        self.timeout = timeout

    def execute(self, tool_name: str, tool_input: dict[str, Any]) -> str:
        try:
            if tool_name == "read_file":
                return self._read_file(tool_input["path"])
            if tool_name == "write_file":
                return self._write_file(tool_input["path"], tool_input["content"])
            if tool_name == "list_directory":
                return self._list_directory(tool_input["path"])
            if tool_name == "search_files":
                return self._search_files(tool_input["pattern"], tool_input.get("glob", ""))
            if tool_name == "bash":
                return self._bash(tool_input["command"])
            if tool_name == "task_complete":
                return json.dumps({"task_complete": True, "status": tool_input["status"], "summary": tool_input["summary"]})
            return f"Unknown tool: {tool_name}"
        except Exception as exc:
            return f"Tool error ({tool_name}): {exc}"

    def _safe_path(self, relative: str) -> Path:
        resolved = (self.repo_path / relative).resolve()
        if not str(resolved).startswith(str(self.repo_path.resolve())):
            raise ValueError(f"Path traversal attempt: {relative!r}")
        return resolved

    def _read_file(self, path: str) -> str:
        full = self._safe_path(path)
        if not full.exists():
            return f"File not found: {path}"
        try:
            content = full.read_text(encoding="utf-8", errors="replace")
            if len(content) > 50_000:
                content = content[:50_000] + "\n... [truncated]"
            return content
        except OSError as exc:
            return f"Cannot read {path}: {exc}"

    def _write_file(self, path: str, content: str) -> str:
        full = self._safe_path(path)
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_text(content, encoding="utf-8")
        return f"Written {len(content)} chars to {path}"

    def _list_directory(self, path: str) -> str:
        full = self._safe_path(path)
        if not full.exists():
            return f"Directory not found: {path}"
        entries = sorted(full.iterdir(), key=lambda p: (p.is_file(), p.name))
        lines = []
        for entry in entries[:200]:
            suffix = "/" if entry.is_dir() else ""
            lines.append(f"{entry.name}{suffix}")
        return "\n".join(lines) if lines else "(empty)"

    def _search_files(self, pattern: str, glob: str) -> str:
        cmd = ["grep", "-r", "--include", glob or "*", "-n", "-m", "5", "--", pattern, "."]
        try:
            result = subprocess.run(
                cmd,
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=15,
            )
            output = (result.stdout or "").strip()
            return output[:5000] if output else "No matches found."
        except Exception as exc:
            return f"Search error: {exc}"

    def _bash(self, command: str) -> str:
        if not _is_safe_bash(command):
            return (
                f"Command not allowed: {command!r}\n"
                "Only test runners, linters, formatters, and read-only git commands are permitted."
            )
        try:
            result = subprocess.run(
                command,
                shell=True,
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=self.timeout,
            )
            out = (result.stdout or "").strip()
            err = (result.stderr or "").strip()
            combined = out
            if err:
                combined += f"\n[stderr]\n{err}"
            return combined[:5000] if combined else f"(exit code {result.returncode})"
        except subprocess.TimeoutExpired:
            return f"Command timed out after {self.timeout}s"
        except Exception as exc:
            return f"Execution error: {exc}"


# ---------------------------------------------------------------------------
# Provider adapters
# ---------------------------------------------------------------------------

class _AnthropicAdapter:
    def __init__(self, api_key: str, model: str):
        try:
            import anthropic as _anthropic
        except ImportError:
            raise RuntimeError("anthropic package not installed. Run: pip install anthropic")
        self._client = _anthropic.Anthropic(api_key=api_key)
        self.model = model

    def _convert_tools(self) -> list[dict]:
        converted = []
        for t in TOOLS:
            converted.append({
                "name": t["name"],
                "description": t["description"],
                "input_schema": t["parameters"],
            })
        return converted

    def call(self, messages: list[dict], system: str) -> tuple[str, list[dict]]:
        response = self._client.messages.create(
            model=self.model,
            max_tokens=8096,
            system=system,
            tools=self._convert_tools(),
            messages=messages,
        )
        text_parts = []
        tool_calls = []
        for block in response.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_calls.append({"id": block.id, "name": block.name, "input": block.input})
        return "\n".join(text_parts), tool_calls

    def tool_result_message(self, tool_call_id: str, tool_name: str, result: str) -> dict:
        return {
            "role": "user",
            "content": [{"type": "tool_result", "tool_use_id": tool_call_id, "content": result}],
        }

    def assistant_message(self, text: str, tool_calls: list[dict]) -> dict:
        content: list[dict] = []
        if text:
            content.append({"type": "text", "text": text})
        for tc in tool_calls:
            content.append({"type": "tool_use", "id": tc["id"], "name": tc["name"], "input": tc["input"]})
        return {"role": "assistant", "content": content}


class _OpenAIAdapter:
    def __init__(self, api_key: str, model: str):
        try:
            from openai import OpenAI
        except ImportError:
            raise RuntimeError("openai package not installed. Run: pip install openai")
        self._client = OpenAI(api_key=api_key)
        self.model = model

    def _convert_tools(self) -> list[dict]:
        return [
            {"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["parameters"]}}
            for t in TOOLS
        ]

    def call(self, messages: list[dict], system: str) -> tuple[str, list[dict]]:
        full_messages = [{"role": "system", "content": system}] + messages
        response = self._client.chat.completions.create(
            model=self.model,
            tools=self._convert_tools(),
            messages=full_messages,
        )
        msg = response.choices[0].message
        text = msg.content or ""
        tool_calls = []
        if msg.tool_calls:
            for tc in msg.tool_calls:
                tool_calls.append({
                    "id": tc.id,
                    "name": tc.function.name,
                    "input": json.loads(tc.function.arguments),
                })
        return text, tool_calls

    def tool_result_message(self, tool_call_id: str, tool_name: str, result: str) -> dict:
        return {"role": "tool", "tool_call_id": tool_call_id, "name": tool_name, "content": result}

    def assistant_message(self, text: str, tool_calls: list[dict]) -> dict:
        msg: dict[str, Any] = {"role": "assistant"}
        if text:
            msg["content"] = text
        if tool_calls:
            msg["tool_calls"] = [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {"name": tc["name"], "arguments": json.dumps(tc["input"])},
                }
                for tc in tool_calls
            ]
        return msg


class _GoogleAdapter:
    def __init__(self, api_key: str, model: str):
        try:
            import google.generativeai as genai
        except ImportError:
            raise RuntimeError("google-generativeai package not installed. Run: pip install google-generativeai")
        genai.configure(api_key=api_key)
        import google.generativeai as genai_inner
        self._genai = genai_inner
        self.model_name = model

    def _convert_tools(self):
        from google.generativeai.types import FunctionDeclaration, Tool
        declarations = []
        for t in TOOLS:
            declarations.append(FunctionDeclaration(
                name=t["name"],
                description=t["description"],
                parameters=t["parameters"],
            ))
        return [Tool(function_declarations=declarations)]

    def call(self, messages: list[dict], system: str) -> tuple[str, list[dict]]:
        model = self._genai.GenerativeModel(
            model_name=self.model_name,
            system_instruction=system,
            tools=self._convert_tools(),
        )
        history = []
        for m in messages[:-1]:
            history.append({"role": m["role"], "parts": [m.get("content", "")]})
        last = messages[-1]
        response = model.start_chat(history=history).send_message(last.get("content", ""))
        text_parts = []
        tool_calls = []
        for part in response.parts:
            if hasattr(part, "text") and part.text:
                text_parts.append(part.text)
            if hasattr(part, "function_call") and part.function_call.name:
                fc = part.function_call
                tool_calls.append({"id": fc.name, "name": fc.name, "input": dict(fc.args)})
        return "\n".join(text_parts), tool_calls

    def tool_result_message(self, tool_call_id: str, tool_name: str, result: str) -> dict:
        return {"role": "user", "content": f"[Tool result for {tool_name}]: {result}"}

    def assistant_message(self, text: str, tool_calls: list[dict]) -> dict:
        parts = []
        if text:
            parts.append(text)
        for tc in tool_calls:
            parts.append(f"[Calling tool {tc['name']} with {tc['input']}]")
        return {"role": "model", "content": "\n".join(parts)}


class _OllamaAdapter:
    def __init__(self, base_url: str, model: str):
        try:
            import httpx
            self._httpx = httpx
        except ImportError:
            raise RuntimeError("httpx package not installed. Run: pip install httpx")
        self.base_url = base_url.rstrip("/")
        self.model = model

    def _convert_tools(self) -> list[dict]:
        return [
            {"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["parameters"]}}
            for t in TOOLS
        ]

    def call(self, messages: list[dict], system: str) -> tuple[str, list[dict]]:
        full_messages = [{"role": "system", "content": system}] + messages
        payload = {
            "model": self.model,
            "messages": full_messages,
            "tools": self._convert_tools(),
            "stream": False,
        }
        response = self._httpx.post(
            f"{self.base_url}/api/chat",
            json=payload,
            timeout=120,
        )
        response.raise_for_status()
        data = response.json()
        msg = data.get("message", {})
        text = msg.get("content", "")
        tool_calls = []
        for tc in msg.get("tool_calls", []):
            fn = tc.get("function", {})
            args = fn.get("arguments", {})
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except json.JSONDecodeError:
                    args = {}
            tool_calls.append({
                "id": fn.get("name", "call"),
                "name": fn.get("name", ""),
                "input": args,
            })
        return text, tool_calls

    def tool_result_message(self, tool_call_id: str, tool_name: str, result: str) -> dict:
        return {"role": "tool", "content": result}

    def assistant_message(self, text: str, tool_calls: list[dict]) -> dict:
        msg: dict[str, Any] = {"role": "assistant"}
        if text:
            msg["content"] = text
        if tool_calls:
            msg["tool_calls"] = [
                {
                    "function": {"name": tc["name"], "arguments": json.dumps(tc["input"])}
                }
                for tc in tool_calls
            ]
        return msg


# ---------------------------------------------------------------------------
# Agent loop
# ---------------------------------------------------------------------------

class AgentLoop:
    """
    Drives the agentic tool-use loop for a single task.

    log_fn: callable(level: str, message: str) — used to stream progress
    """

    def __init__(
        self,
        provider: str,
        api_key: str,
        model: str,
        repo_path: Path,
        max_iterations: int = 30,
        bash_timeout: int = 60,
        log_fn: Callable[[str, str], None] | None = None,
        *,
        ollama_base_url: str = "http://localhost:11434",
    ):
        self.repo_path = repo_path
        self.max_iterations = max_iterations
        self.log_fn = log_fn or (lambda level, msg: print(f"[{level.upper()}] {msg}"))
        self.executor = ToolExecutor(repo_path, timeout=bash_timeout)

        provider = provider.lower()
        if provider == "anthropic":
            self.adapter = _AnthropicAdapter(api_key, model)
        elif provider == "openai":
            self.adapter = _OpenAIAdapter(api_key, model)
        elif provider == "google":
            self.adapter = _GoogleAdapter(api_key, model)
        elif provider == "ollama":
            self.adapter = _OllamaAdapter(ollama_base_url, model)
        else:
            raise ValueError(f"Unknown provider: {provider!r}")

        self.provider = provider
        self.model = model

    def run(self, task_prompt: str) -> tuple[bool, str]:
        """
        Run the agent loop.
        Returns (success: bool, summary: str).
        """
        self.log_fn("info", f"Agent loop starting — provider={self.provider} model={self.model}")
        messages: list[dict] = [{"role": "user", "content": task_prompt}]

        for iteration in range(1, self.max_iterations + 1):
            self.log_fn("info", f"Agent iteration {iteration}/{self.max_iterations}")

            try:
                text, tool_calls = self.adapter.call(messages, SYSTEM_PROMPT)
            except Exception as exc:
                self.log_fn("error", f"LLM call failed: {exc}")
                return False, str(exc)

            if text:
                self.log_fn("info", f"Model: {text[:1000]}")

            if not tool_calls:
                if text:
                    return True, text
                self.log_fn("warning", "Model returned no tool calls and no text; stopping.")
                return False, "Model produced no output."

            messages.append(self.adapter.assistant_message(text, tool_calls))

            for tc in tool_calls:
                tool_name = tc["name"]
                tool_input = tc["input"]
                self.log_fn("info", f"Tool call: {tool_name}({json.dumps(tool_input)[:300]})")

                result = self.executor.execute(tool_name, tool_input)
                self.log_fn("info", f"Tool result ({tool_name}): {result[:500]}")

                messages.append(
                    self.adapter.tool_result_message(tc["id"], tool_name, result)
                )

                if tool_name == "task_complete":
                    parsed = json.loads(result)
                    status = parsed.get("status", "done")
                    summary = parsed.get("summary", "")
                    success = status == "done"
                    level = "info" if success else "warning"
                    self.log_fn(level, f"Task complete — status={status}: {summary}")
                    return success, summary

        self.log_fn("warning", f"Agent loop reached max iterations ({self.max_iterations})")
        return False, f"Agent did not complete within {self.max_iterations} iterations."


# ---------------------------------------------------------------------------
# Factory helper used by worker
# ---------------------------------------------------------------------------

def build_agent_loop(
    project_provider: str | None,
    project_model: str | None,
    repo_path: Path,
    log_fn: Callable[[str, str], None],
    max_iterations: int = 30,
    bash_timeout: int = 60,
) -> AgentLoop:
    """
    Build an AgentLoop using per-project overrides or global env vars.
    Priority: project settings > env vars > defaults.
    """
    provider = (project_provider or os.getenv("MODEL_PROVIDER", "anthropic")).lower()

    if provider == "anthropic":
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        model = project_model or os.getenv("ANTHROPIC_MODEL", "claude-opus-4-5")
        ollama_url = ""
    elif provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY", "")
        model = project_model or os.getenv("OPENAI_MODEL", "gpt-4o")
        ollama_url = ""
    elif provider == "google":
        api_key = os.getenv("GOOGLE_API_KEY", "")
        model = project_model or os.getenv("GOOGLE_MODEL", "gemini-2.5-pro")
        ollama_url = ""
    elif provider == "ollama":
        api_key = ""
        model = project_model or os.getenv("OLLAMA_MODEL", "llama3.1")
        ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    else:
        raise ValueError(f"Unknown MODEL_PROVIDER: {provider!r}")

    return AgentLoop(
        provider=provider,
        api_key=api_key,
        model=model,
        repo_path=repo_path,
        max_iterations=max_iterations,
        bash_timeout=bash_timeout,
        log_fn=log_fn,
        ollama_base_url=ollama_url,
    )
