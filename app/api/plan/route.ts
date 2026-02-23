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

export async function POST(req: NextRequest) {
  const { mainTask } = (await req.json()) ?? {};
  const trimmed = (mainTask ?? "").toString().trim();

  if (!trimmed) {
    return NextResponse.json({ subTasks: [] });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ subTasks: fallbackPlan(trimmed) });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "你是一名温柔的冒险规划师，会把用户的一项任务拆成 3 个子任务，并根据每个子任务的难度和工作量给出权重。只用 JSON 格式回复。",
          },
          {
            role: "user",
            content: `请根据这个主任务生成 3 个子任务，并按工作量给每个子任务一个权重（建议 0.8~2 之间）：${trimmed}

请只返回 JSON，不要包含多余文字，格式如下：
{
  "subTasks": [
    { "id": "string", "title": "string", "description": "string", "weight": 1.2 },
    ...
  ]
}`,
          },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ subTasks: fallbackPlan(trimmed) });
    }

    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      return NextResponse.json({ subTasks: fallbackPlan(trimmed) });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ subTasks: fallbackPlan(trimmed) });
    }

    const candidate = Array.isArray(parsed?.subTasks) ? parsed.subTasks : [];
    if (!candidate.length) {
      return NextResponse.json({ subTasks: fallbackPlan(trimmed) });
    }

    const sanitized: RawSubTask[] = candidate.slice(0, 5).map((task, index) => ({
      id: typeof task.id === "string" && task.id.trim()
        ? task.id
        : `step-${index + 1}`,
      title:
        typeof task.title === "string" && task.title.trim()
          ? task.title
          : `子任务 ${index + 1}`,
      description:
        typeof task.description === "string" && task.description.trim()
          ? task.description
          : `完成与「${trimmed}」相关的第 ${index + 1} 步。`,
      weight:
        typeof task.weight === "number" && task.weight > 0
          ? task.weight
          : 1,
    }));

    return NextResponse.json({ subTasks: sanitized });
  } catch {
    return NextResponse.json({ subTasks: fallbackPlan(trimmed) });
  }
}

