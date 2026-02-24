import { NextRequest, NextResponse } from "next/server";

type RawSubTask = {
  id?: string;
  title?: string;
  description?: string;
  weight?: number;
};

function fallbackPlan(mainTask: string): RawSubTask[] {
  return [
    {
      id: "clarify",
      title: "描绘这次冒险的边界",
      description: `弄清楚「${mainTask}」需要达到什么样的完成标准，以及今天能踩到哪条分界线就算胜利。`,
      weight: 1,
    },
    {
      id: "breakdown",
      title: "拆分为 2–3 个关键路段",
      description: `把与「${mainTask}」相关的事情拆成几块：准备、执行、收尾，今天至少推进一整块。`,
      weight: 1.4,
    },
    {
      id: "first-boss",
      title: "选一个最小却关键的小怪",
      description: `在所有步骤里，挑一个「阻力最大但体量可控」的子任务，今天专心打通它。`,
      weight: 1.6,
    },
  ];
}

const SYSTEM_PROMPT = `你是一名「任务冒险规划师」。用户会给你一个主任务，你需要根据任务的具体内容进行动态规划与拆分。

规则：
1. 子任务数量由任务复杂度决定：简单任务 3 步，中等 4 步，复杂 5–6 步。不要机械地固定为 3 步。
2. 每一步都要紧扣用户的主任务内容，写出具体、可执行的标题和简短说明（例如：写论文要包含「定提纲」「查资料」「写某节」等；开发功能要包含「接口设计」「实现」「自测」等）。
3. 为每个子任务设定权重 weight（0.8–2.0），表示相对工作量或难度，越难/越重的步骤权重越高。
4. 只输出一个合法 JSON，不要包含 markdown 代码块或其它文字。格式如下：
{"subTasks":[{"id":"英文或拼音id","title":"步骤标题","description":"一句话说明","weight":1.2},...]}`;

function buildUserPrompt(mainTask: string): string {
  return `请根据下面这条主任务，结合其具体内容做动态规划与拆分（3–6 个子任务，数量随任务复杂度调整），并只返回上述格式的 JSON：

「${mainTask}」`;
}

async function callGroq(mainTask: string): Promise<RawSubTask[] | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(mainTask) },
      ],
      temperature: 0.6,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) return null;

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") return null;

  return parseAndSanitize(content, mainTask);
}

async function callOpenAI(mainTask: string): Promise<RawSubTask[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(mainTask) },
      ],
      temperature: 0.6,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) return null;

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") return null;

  return parseAndSanitize(content, mainTask);
}

function parseAndSanitize(content: string, mainTask: string): RawSubTask[] | null {
  const trimmed = content.trim().replace(/^```json\s*|\s*```$/g, "").trim();
  let parsed: { subTasks?: unknown[] };
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const candidate = Array.isArray(parsed?.subTasks) ? parsed.subTasks : [];
  if (candidate.length === 0) return null;

  const sanitized: RawSubTask[] = candidate.slice(0, 6).map((task: Record<string, unknown>, index: number) => ({
    id:
      typeof task.id === "string" && task.id.trim()
        ? task.id
        : `step-${index + 1}`,
    title:
      typeof task.title === "string" && task.title.trim()
        ? task.title
        : `子任务 ${index + 1}`,
    description:
      typeof task.description === "string" && task.description.trim()
        ? task.description
        : `完成与「${mainTask}」相关的第 ${index + 1} 步。`,
    weight:
      typeof task.weight === "number" && task.weight > 0 ? task.weight : 1,
  }));

  return sanitized;
}

export async function POST(req: NextRequest) {
  const { mainTask } = (await req.json()) ?? {};
  const trimmed = (mainTask ?? "").toString().trim();

  if (!trimmed) {
    return NextResponse.json({ subTasks: [] });
  }

  // 优先使用免费 Groq，其次 OpenAI，最后回退到本地 fallback
  let result: RawSubTask[] | null = await callGroq(trimmed);
  if (!result) result = await callOpenAI(trimmed);
  if (!result) result = fallbackPlan(trimmed);

  return NextResponse.json({ subTasks: result });
}
