import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPlatformLlmReady,
  looksLikeLocalOpenCompatibleEndpoint,
  resolveHomeworkAi,
} from "../../src/lib/homework-ai-config.js";

const ENV_KEYS = [
  "AI_PRACTICE_API_KEY",
  "AI_HOMEWORK_API_KEY",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "OLLAMA_BASE_URL",
  "AI_PRACTICE_BASE_URL",
  "AI_HOMEWORK_BASE_URL",
  "OPENAI_BASE_URL",
  "DEEPSEEK_API_URL",
  "AI_PRACTICE_MODEL",
  "AI_HOMEWORK_MODEL",
  "OLLAMA_MODEL",
  "OPENAI_MODEL",
  "DEEPSEEK_MODEL",
  "AI_PRACTICE_LOCAL_NO_AUTH",
  "AI_HOMEWORK_LOCAL_NO_AUTH",
  "OLLAMA_NO_API_KEY",
];

function withEnv(patch: Record<string, string | undefined>, fn: () => void) {
  const saved = new Map<string, string | undefined>();
  for (const k of ENV_KEYS) saved.set(k, process.env[k]);
  for (const k of ENV_KEYS) {
    if (k in patch) {
      const v = patch[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    } else {
      delete process.env[k];
    }
  }
  try {
    fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe("UC-07 大模型接入配置", () => {
  it("UNIT-21-01：含 11434 端口的地址判定为本地端点", () => {
    assert.equal(looksLikeLocalOpenCompatibleEndpoint("http://127.0.0.1:11434/v1"), true);
  });

  it("UNIT-21-02：localhost 与 127.0.0.1 判定为本地端点", () => {
    assert.equal(looksLikeLocalOpenCompatibleEndpoint("http://localhost:8000"), true);
    assert.equal(looksLikeLocalOpenCompatibleEndpoint("http://127.0.0.1:8000"), true);
  });

  it("UNIT-21-03：云端地址判定为远程端点", () => {
    assert.equal(looksLikeLocalOpenCompatibleEndpoint("https://api.deepseek.com"), false);
  });

  it("UNIT-21-04：无法解析但含 localhost 的字符串按本地处理", () => {
    assert.equal(looksLikeLocalOpenCompatibleEndpoint("http://localhost:not-a-port"), true);
  });

  it("UNIT-21-05：isPlatformLlmReady 仅在密钥或免鉴权时就绪", () => {
    assert.equal(
      isPlatformLlmReady({ apiKey: "sk-1", omitBearerAuth: false, baseUrl: "x", model: "m", hint: "h" }),
      true,
    );
    assert.equal(
      isPlatformLlmReady({ apiKey: "  ", omitBearerAuth: true, baseUrl: "x", model: "m", hint: "h" }),
      true,
    );
    assert.equal(
      isPlatformLlmReady({ apiKey: undefined, omitBearerAuth: false, baseUrl: "x", model: "m", hint: "h" }),
      false,
    );
  });

  it("UNIT-21-06：无任何配置时指向本机 Ollama 且免鉴权", () => {
    withEnv({}, () => {
      const r = resolveHomeworkAi();
      assert.equal(r.apiKey, undefined);
      assert.equal(r.omitBearerAuth, true);
      assert.equal(r.baseUrl, "http://127.0.0.1:11434/v1");
      assert.equal(r.model, "llama3.2");
    });
  });

  it("UNIT-21-07：配置 DeepSeek 密钥时走云端", () => {
    withEnv({ DEEPSEEK_API_KEY: "sk-test" }, () => {
      const r = resolveHomeworkAi();
      assert.equal(r.apiKey, "sk-test");
      assert.equal(r.omitBearerAuth, false);
      assert.equal(r.baseUrl, "https://api.deepseek.com");
      assert.equal(r.model, "deepseek-chat");
      assert.equal(r.hint, "DEEPSEEK_API_KEY");
    });
  });

  it("UNIT-21-08：本地免鉴权开关强制省略 Bearer", () => {
    withEnv({ AI_HOMEWORK_LOCAL_NO_AUTH: "1" }, () => {
      const r = resolveHomeworkAi();
      assert.equal(r.apiKey, undefined);
      assert.equal(r.omitBearerAuth, true);
      assert.ok(r.hint.includes("本地推理"));
    });
  });

  it("UNIT-21-09：显式 baseUrl 去除尾部斜杠", () => {
    withEnv({ AI_HOMEWORK_BASE_URL: "http://ollama.example/v1/", OLLAMA_MODEL: "qwen2.5" }, () => {
      const r = resolveHomeworkAi();
      assert.equal(r.baseUrl, "http://ollama.example/v1");
      assert.equal(r.model, "qwen2.5");
    });
  });
});
