/**
 * 解析模型返回的第一个完整 JSON 值。
 *
 * 部分兼容 OpenAI 的模型即使启用了 json_object，仍可能在合法对象后
 * 追加一句解释或第二个对象。严格 JSON.parse 会把整次游戏请求误判失败；
 * 这里仍要求第一个值本身是合法 JSON，只忽略它前后的非 JSON 包装。
 */
export function parseFirstAIJson(content: string): unknown {
  const text = content.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(text);
  } catch {
    // 继续寻找第一个平衡闭合的对象或数组。
  }

  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (start < 0) {
      if (char !== '{' && char !== '[') continue;
      start = index;
      depth = 1;
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') depth -= 1;
    if (depth === 0) return JSON.parse(text.slice(start, index + 1));
  }
  throw new Error('ai_invalid_json');
}
