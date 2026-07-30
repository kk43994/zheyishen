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

  // 包装文字本身也可能带 [] 或伪对象。一个候选解析失败后必须继续找下一个，
  // 不能让「说明[非JSON]，结果：{"ok":true}」在第一个方括号处提前退出。
  for (let start = 0; start < text.length; start += 1) {
    const opener = text[start];
    if (opener !== '{' && opener !== '[') continue;
    const stack: string[] = [opener];
    let inString = false;
    let escaped = false;
    for (let index = start + 1; index < text.length; index += 1) {
      const char = text[index]!;
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
      if (char === '{' || char === '[') {
        stack.push(char);
        continue;
      }
      if (char !== '}' && char !== ']') continue;
      const expected = char === '}' ? '{' : '[';
      if (stack[stack.length - 1] !== expected) break;
      stack.pop();
      if (stack.length > 0) continue;
      try {
        return JSON.parse(text.slice(start, index + 1));
      } catch {
        break;
      }
    }
  }
  throw new Error('ai_invalid_json');
}
