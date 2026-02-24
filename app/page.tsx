"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type SubTask = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  weight: number;
};

type Adventure = {
  id: string;
  title: string;
  dateKey: string;
  subTasks: SubTask[];
  createdAt: string;
  updatedAt: string;
  taskBrief?: string;
  expectedResult?: string;
  ddl?: string;
  background?: string;
  currentProgress?: string;
  timeBudget?: string;
  preference?: string;
};

type AdventureState = {
  currentId: string | null;
  adventures: Adventure[];
};

const STORAGE_KEY = "task-adventure-state";

const getTodayKey = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const createAdventureId = () =>
  `adv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// 地图节点位置（最多 6 个），用于动态 3–6 步冒险路线 - 全景布局
const MAP_NODE_POSITIONS = [
  { x: 50, y: 220 },   // 起点
  { x: 100, y: 180 },
  { x: 160, y: 150 },
  { x: 230, y: 130 },
  { x: 300, y: 110 },
  { x: 350, y: 60 },   // 终点
];

// 相邻节点之间的路径（共 5 段），每段对应前一个节点完成时高亮 - 蜿蜒上山路线
const MAP_PATH_SEGMENTS = [
  "M 50 220 Q 75 200 100 180",
  "M 100 180 Q 130 165 160 150",
  "M 160 150 Q 195 140 230 130",
  "M 230 130 Q 265 120 300 110",
  "M 300 110 Q 325 85 350 60",
];

const defaultSubTasks: SubTask[] = [
  {
    id: "scout",
    title: "侦察地形",
    description: "弄清今天的地图和障碍物。",
    completed: false,
    weight: 1,
  },
  {
    id: "prepare",
    title: "整理补给",
    description: "准备好工具、资料和心情。",
    completed: false,
    weight: 1,
  },
  {
    id: "first-boss",
    title: "击败第一只小怪",
    description: "从最小、最容易上手的一步开始。",
    completed: false,
    weight: 1,
  },
];

const DEEPSEEK_API_KEY = process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY || "";
const DEEPSEEK_API_URL = "https://api.siliconflow.cn/v1/chat/completions";

// 检测API是否配置
const isApiConfigured = DEEPSEEK_API_KEY.length > 0;

export default function Home() {
  const [adventures, setAdventures] = useState<Adventure[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isReplanning, setIsReplanning] = useState(false);
  
  // 各个输入框的状态
  const [taskBrief, setTaskBrief] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [ddl, setDdl] = useState("");
  const [background, setBackground] = useState("");
  const [currentProgress, setCurrentProgress] = useState("");
  const [timeBudget, setTimeBudget] = useState("");
  const [preference, setPreference] = useState("");
  
  // 地图上当前选中的任务（用于预览，不标记完成）
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as any;

      if (parsed && Array.isArray(parsed.adventures)) {
        const restoredAdventures: Adventure[] = parsed.adventures.map(
          (adv: any) => ({
            id: adv.id ?? createAdventureId(),
            title: adv.title ?? "",
            dateKey: adv.dateKey ?? getTodayKey(),
            subTasks: (adv.subTasks ?? []).map((task: any) => ({
              ...task,
              weight:
                typeof task.weight === "number" && task.weight > 0
                  ? task.weight
                  : 1,
            })),
            createdAt: adv.createdAt ?? new Date().toISOString(),
            updatedAt: adv.updatedAt ?? new Date().toISOString(),
            taskBrief: adv.taskBrief ?? "",
            expectedResult: adv.expectedResult ?? "",
            ddl: adv.ddl ?? "",
            background: adv.background ?? "",
            currentProgress: adv.currentProgress ?? "",
            timeBudget: adv.timeBudget ?? "",
            preference: adv.preference ?? "",
          }),
        );
        setAdventures(restoredAdventures);
        setCurrentId(
          parsed.currentId && restoredAdventures.some((a) => a.id === parsed.currentId)
            ? parsed.currentId
            : restoredAdventures[0]?.id ?? null,
        );
        return;
      }

      // 兼容旧版本：只有 mainTask/subTasks 的单日存档
      const legacyMain = typeof parsed?.mainTask === "string" ? parsed.mainTask : "";
      const legacySubTasks = Array.isArray(parsed?.subTasks)
        ? parsed.subTasks
        : [];
      const restoredSubTasks = legacySubTasks.map((task: any) => ({
        ...task,
        weight:
          typeof task.weight === "number" && task.weight > 0 ? task.weight : 1,
      }));
      if (legacyMain || restoredSubTasks.length) {
        const id = createAdventureId();
        const nowIso = new Date().toISOString();
        const adv: Adventure = {
          id,
          title: legacyMain,
          dateKey: getTodayKey(),
          subTasks: restoredSubTasks,
          createdAt: nowIso,
          updatedAt: nowIso,
          taskBrief: "",
          expectedResult: "",
          ddl: "",
          background: "",
          currentProgress: "",
          timeBudget: "",
          preference: "",
        };
        setAdventures([adv]);
        setCurrentId(id);
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  // 当 currentAdventure 变化时，更新各个输入框的值
  const currentAdventure = useMemo(
    () => adventures.find((a) => a.id === currentId) ?? null,
    [adventures, currentId],
  );

  // 用ref追踪当前adventure id，避免循环更新
  const currentAdventureIdRef = useRef<string | null>(null);

  useEffect(() => {
    // 只有当切换到不同的adventure时才同步表单状态
    if (currentAdventure && currentAdventure.id !== currentAdventureIdRef.current) {
      currentAdventureIdRef.current = currentAdventure.id;
      setTaskBrief(currentAdventure.taskBrief || "");
      setExpectedResult(currentAdventure.expectedResult || "");
      setDdl(currentAdventure.ddl || "");
      setBackground(currentAdventure.background || "");
      setCurrentProgress(currentAdventure.currentProgress || "");
      setTimeBudget(currentAdventure.timeBudget || "");
      setPreference(currentAdventure.preference || "");
    }
  }, [currentAdventure]);

  // 保存状态到 localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // 只在有当前adventure时保存
    if (!currentId || !currentAdventure) return;
    
    // 直接保存到localStorage，不修改adventures数组避免循环
    const state: AdventureState = {
      currentId,
      adventures,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [adventures, currentId, currentAdventure]);

  const mainTask = currentAdventure?.title ?? "";
  const subTasks = currentAdventure?.subTasks ?? [];

  const completionRate = useMemo(() => {
    if (!subTasks.length) return 0;
    const totalWeight = subTasks.reduce(
      (sum, task) => sum + (task.weight > 0 ? task.weight : 1),
      0,
    );
    if (!totalWeight) return 0;
    const completedWeight = subTasks.reduce(
      (sum, task) =>
        sum + (task.completed ? (task.weight > 0 ? task.weight : 1) : 0),
      0,
    );
    return Math.round((completedWeight / totalWeight) * 100);
  }, [subTasks]);

  const handleStartAdventure = async () => {
    if (!taskBrief.trim()) return;

    // 检查API是否配置
    if (!isApiConfigured) {
      alert("请先配置 AI API Key！\n\n方法：\n1. 访问 https://cloud.siliconflow.cn 注册\n2. 获取API密钥\n3. 在项目根目录创建 .env.local 文件\n4. 添加：NEXT_PUBLIC_DEEPSEEK_API_KEY=你的密钥\n5. 重启开发服务器");
      return;
    }

    // 构建完整的任务描述
    const fullTask = `【任务简述】${taskBrief}
【期望结果】${expectedResult}
【DDL】${ddl}
【背景/场景】${background}
【当前进度】${currentProgress}
【时间预算】${timeBudget}
【特别偏好】${preference}`;

    // 构建拆解原则 - 核心：零阻力任务分解
    const breakDownPrinciples = `【核心原则：零阻力任务分解】
1. 每个步骤必须"马上就能做"，不需要额外准备或思考
2. 单个步骤预计耗时：5-20分钟（而不是15-30分钟）
3. 第一个任务必须是"1分钟就能开始"的超级简单任务
4. 避免任何需要"查资料"、"找素材"、"做准备"的前置任务
5. 任务顺序：从最简单、最熟悉的开始，逐步增加难度
6. 子任务数量：根据任务复杂度，在3-15个之间动态调整
7. 每个任务要有明确的开头动词，告诉用户"做什么"而不是"完成什么"
8. 权重策略：
   - 权重1（简单）：5分钟内可完成，不需要专注思考
   - 权重2（中等）：5-15分钟可完成，需要轻度思考
   - 权重3（稍难）：15-30分钟可完成，需要持续专注

【关键洞察】
- 用户拖延往往是因为"第一步太难"
- 所以第一个任务必须简单到"不可能失败"
- 不要让用户"写报告"，而是让用户"打开文档，先写标题"
- 不要让用户"做PPT"，而是让用户"新建PPT，选一个喜欢的模板"`;

    // 如果当前没有冒险卷轴，为今天新建一卷
    let adventureId = currentId;
    if (!currentAdventure) {
      const nowIso = new Date().toISOString();
      const id = createAdventureId();
      const newAdventure: Adventure = {
        id,
        title: taskBrief,
        dateKey: getTodayKey(),
        subTasks: [],
        createdAt: nowIso,
        updatedAt: nowIso,
        taskBrief,
        expectedResult,
        ddl,
        background,
        currentProgress,
        timeBudget,
        preference,
      };
      adventureId = id;
      setAdventures((prev) => [...prev, newAdventure]);
      setCurrentId(id);
    } else if (!currentAdventure.taskBrief?.trim()) {
      // 有卷轴但任务简述为空时，同步填入本次主任务
      setAdventures((prev) =>
        prev.map((adv) =>
          adv.id === currentAdventure.id
            ? { 
                ...adv, 
                title: taskBrief, 
                taskBrief,
                expectedResult,
                ddl,
                background,
                currentProgress,
                timeBudget,
                preference,
                updatedAt: new Date().toISOString() 
              }
            : adv,
        ),
      );
      adventureId = currentAdventure.id;
    }

    setIsPlanning(true);

    try {
      // 构建 DEEPSEEK API 请求
      const systemPrompt = `你是一个专业的任务拆解助手，擅长将复杂任务分解成"零阻力"的微小步骤。

请严格按照以下原则将用户的任务拆解成具体的子任务：

${breakDownPrinciples}

请以JSON格式返回子任务数组，每个子任务包含以下字段：
- id: 唯一标识符（如step-1）
- title: 简洁的行动导向标题（不超过20字，必须以动词开头）
- description: 详细的任务描述，必须包含以下格式：
  1. 首先用【当前任务 (#序号) : 标题】格式开头
  2. 换行后用🛠️行动指南开头，列出具体的操作步骤（使用 bullet point 格式，每条以 - 开头）
  3. 换行后用✅完成条件开头，列出判断任务完成的具体标准
- weight: 权重（1=简单/5分钟内，2=中等/5-15分钟，3=稍难/15-30分钟）

【重要】请根据任务复杂度动态调整子任务数量：
- 简单任务（如回复邮件、整理文件）：3-5个子任务
- 中等任务（如写报告、做方案）：5-10个子任务
- 复杂任务（如写论文、开发功能）：10-15个子任务

【输出格式示例】：
{
  "subTasks": [
    {
      "id": "step-1",
      "title": "打开PPT文件",
      "description": "【当前任务 (#1) : 打开PPT文件】\\n\\n🛠️行动指南 :\\n- 双击桌面上的PPT图标启动程序\\n- 点击"打开其他文档"找到你的PPT文件\\n- 选中文件后点击"打开"按钮\\n\\n✅完成条件 :\\n- PPT程序已启动\\n- 目标文件已打开并显示在屏幕上",
      "weight": 1
    }
  ]
}

任务描述：
${fullTask}

请直接返回JSON对象，不要有其他解释。`;

      const response = await fetch(DEEPSEEK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: "Qwen/Qwen2-7B-Instruct",
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: "请帮我拆解这个任务"
            }
          ],
          temperature: 0.7,
          max_tokens: 1500
        }),
      });

      console.log("API Response status:", response.status);
      console.log("API Key configured:", !!DEEPSEEK_API_KEY);
      console.log("API Key (first 10 chars):", DEEPSEEK_API_KEY.substring(0, 10));
      console.log("API URL:", DEEPSEEK_API_URL);
      console.log("Model:", "Qwen/Qwen2-7B-Instruct");
      
      if (response.ok) {
        const data = await response.json();
        const aiResponse = data.choices?.[0]?.message?.content;
        
        // 尝试解析AI返回的JSON
        try {
          let parsedTasks = [];
          
          // 尝试从AI响应中提取JSON
          const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            parsedTasks = JSON.parse(jsonMatch[0]);
          } else {
            // 如果不是纯JSON，尝试直接解析
            parsedTasks = JSON.parse(aiResponse);
          }
          
          if (Array.isArray(parsedTasks) && parsedTasks.length > 0 && adventureId) {
            const normalized: SubTask[] = parsedTasks.map(
              (task: any, index: number) => ({
                id: task.id ?? `step-${index + 1}`,
                title: task.title ?? `子任务 ${index + 1}`,
                description:
                  task.description ??
                  `完成与「${taskBrief}」相关的第 ${index + 1} 步。`,
                completed: false,
                weight:
                  typeof task.weight === "number" && task.weight >= 1 && task.weight <= 3
                    ? task.weight
                    : task.weight === "简单" ? 1 : task.weight === "中等" ? 2 : task.weight === "困难" ? 3 : 1,
              }),
            );
            setAdventures((prev) =>
              prev.map((adv) =>
                adv.id === adventureId
                  ? {
                      ...adv,
                      title: taskBrief,
                      taskBrief,
                      expectedResult,
                      ddl,
                      background,
                      currentProgress,
                      timeBudget,
                      preference,
                      subTasks: normalized,
                      updatedAt: new Date().toISOString(),
                    }
                  : adv,
              ),
            );
            return;
          }
        } catch (parseError) {
          console.error("Failed to parse AI response:", parseError);
          // 如果解析失败，使用默认子任务
        }
      }

      // 失败时使用默认子任务
      if (adventureId) {
        setAdventures((prev) =>
          prev.map((adv) =>
            adv.id === adventureId && adv.subTasks.length === 0
              ? {
                  ...adv,
                  subTasks: defaultSubTasks,
                  updatedAt: new Date().toISOString(),
                }
              : adv,
          ),
        );
      }
    } catch (error) {
      console.error("API Error:", error);
      if (adventureId) {
        setAdventures((prev) =>
          prev.map((adv) =>
            adv.id === adventureId && adv.subTasks.length === 0
              ? {
                  ...adv,
                  subTasks: defaultSubTasks,
                  updatedAt: new Date().toISOString(),
                }
              : adv,
          ),
        );
      }
    } finally {
      setIsPlanning(false);
    }
  };

  // 重新分解任务 - 使用AI重新优化子任务
  const handleReplanAdventure = async () => {
    if (!currentAdventure || !currentAdventure.taskBrief?.trim()) return;
    if (isReplanning || isPlanning) return;

    // 检查API是否配置
    if (!isApiConfigured) {
      alert("请先配置 DeepSeek API Key！\n\n方法：\n1. 访问 https://platform.deepseek.com 获取API Key\n2. 在项目根目录创建 .env.local 文件\n3. 添加内容：NEXT_PUBLIC_DEEPSEEK_API_KEY=你的API密钥\n4. 重启开发服务器");
      return;
    }

    setIsReplanning(true);

    try {
      // 构建完整的任务描述
      const fullTask = `【任务简述】${currentAdventure.taskBrief}
【期望结果】${currentAdventure.expectedResult}
【DDL】${currentAdventure.ddl}
【背景/场景】${currentAdventure.background}
【当前进度】${currentAdventure.currentProgress}
【时间预算】${currentAdventure.timeBudget}
【特别偏好】${currentAdventure.preference}`;

      // 零阻力任务分解原则
      const breakDownPrinciples = `【核心原则：零阻力任务分解】
1. 每个步骤必须"马上就能做"，不需要额外准备或思考
2. 单个步骤预计耗时：5-20分钟（而不是15-30分钟）
3. 第一个任务必须是"1分钟就能开始"的超级简单任务
4. 避免任何需要"查资料"、"找素材"、"做准备"的前置任务
5. 任务顺序：从最简单、最熟悉的开始，逐步增加难度
6. 子任务数量：根据任务复杂度，在3-15个之间动态调整
7. 每个任务要有明确的开头动词，告诉用户"做什么"而不是"完成什么"
8. 权重策略：
   - 权重1（简单）：5分钟内可完成，不需要专注思考
   - 权重2（中等）：5-15分钟可完成，需要轻度思考
   - 权重3（稍难）：15-30分钟可完成，需要持续专注

【关键洞察】
- 用户拖延往往是因为"第一步太难"
- 所以第一个任务必须简单到"不可能失败"
- 不要让用户"写报告"，而是让用户"打开文档，先写标题"
- 不要让用户"做PPT"，而是让用户"新建PPT，选一个喜欢的模板"`;

      const systemPrompt = `你是一个专业的任务拆解助手，擅长将复杂任务分解成"零阻力"的微小步骤。

请严格按照以下原则将用户的任务拆解成具体的子任务：

${breakDownPrinciples}

请以JSON格式返回子任务数组，每个子任务包含以下字段：
- id: 唯一标识符（如step-1）
- title: 简洁的行动导向标题（不超过20字，必须以动词开头）
- description: 详细的任务描述，必须包含以下格式：
  1. 首先用【当前任务 (#序号) : 标题】格式开头
  2. 换行后用🛠️行动指南开头，列出具体的操作步骤（使用 bullet point 格式，每条以 - 开头）
  3. 换行后用✅完成条件开头，列出判断任务完成的具体标准
- weight: 权重（1=简单/5分钟内，2=中等/5-15分钟，3=稍难/15-30分钟）

【重要】请根据任务复杂度动态调整子任务数量：
- 简单任务（如回复邮件、整理文件）：3-5个子任务
- 中等任务（如写报告、做方案）：5-10个子任务
- 复杂任务（如写论文、开发功能）：10-15个子任务

【输出格式示例】：
{
  "subTasks": [
    {
      "id": "step-1",
      "title": "打开PPT文件",
      "description": "【当前任务 (#1) : 打开PPT文件】\\n\\n🛠️行动指南 :\\n- 双击桌面上的PPT图标启动程序\\n- 点击"打开其他文档"找到你的PPT文件\\n- 选中文件后点击"打开"按钮\\n\\n✅完成条件 :\\n- PPT程序已启动\\n- 目标文件已打开并显示在屏幕上",
      "weight": 1
    }
  ]
}

任务描述：
${fullTask}

请直接返回JSON对象，不要有其他解释。`;

      const response = await fetch(DEEPSEEK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: "Qwen/Qwen2-7B-Instruct",
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: "请重新帮我拆解这个任务，让每个子任务都能马上执行，没有任何阻力。"
            }
          ],
          temperature: 0.7,
          max_tokens: 2000
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const aiResponse = data.choices?.[0]?.message?.content;
        
        try {
          let parsedTasks = [];
          const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            parsedTasks = JSON.parse(jsonMatch[0]);
          } else {
            parsedTasks = JSON.parse(aiResponse);
          }
          
          if (Array.isArray(parsedTasks) && parsedTasks.length > 0) {
            const normalized: SubTask[] = parsedTasks.map(
              (task: any, index: number) => ({
                id: task.id ?? `step-${index + 1}`,
                title: task.title ?? `子任务 ${index + 1}`,
                description:
                  task.description ??
                  `完成与「${currentAdventure.taskBrief}」相关的第 ${index + 1} 步。`,
                completed: false,
                weight:
                  typeof task.weight === "number" && task.weight >= 1 && task.weight <= 3
                    ? task.weight
                    : 1,
              }),
            );
            setAdventures((prev) =>
              prev.map((adv) =>
                adv.id === currentAdventure.id
                  ? {
                      ...adv,
                      subTasks: normalized,
                      updatedAt: new Date().toISOString(),
                    }
                  : adv,
              ),
            );
            return;
          }
        } catch (parseError) {
          console.error("Failed to parse AI response:", parseError);
        }
      }
    } catch (error) {
      console.error("Replan failed:", error);
    } finally {
      setIsReplanning(false);
    }
  };

  const handleToggleSubTask = (id: string) => {
    if (!currentAdventure) return;
    setAdventures((prev) =>
      prev.map((adv) =>
        adv.id === currentAdventure.id
          ? {
              ...adv,
              subTasks: adv.subTasks.map((task) =>
                task.id === id
                  ? { ...task, completed: !task.completed }
                  : task,
              ),
              updatedAt: new Date().toISOString(),
            }
          : adv,
      ),
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleStartAdventure();
    }
  };

  return (
    <div className="min-h-screen bg-[#e8f5f0] bg-[radial-gradient(circle_at_1px_1px,rgba(20,184,166,0.08)_1px,transparent_0)] bg-[length:20px_20px] text-stone-900">
      <main className="mx-auto flex min-h-screen max-w-7xl flex-row gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* 左侧主内容区域 */}
        <div className="flex-1 flex flex-col gap-6 min-w-0">
          <header className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-teal-50/80 px-3 py-1 text-xs font-medium text-teal-900 shadow-sm ring-1 ring-teal-200/70 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
              任务冒险伴侣 · 在温暖的篝火旁展开一日冒险
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-stone-950 sm:text-4xl">
              今天，我们要开启什么伟大的冒险？
            </h1>
            <p className="max-w-2xl text-sm text-stone-600 sm:text-base">
              把今天的主任务当成一段被写进卷轴的故事。AI 吟游诗人会为你拆解章节，标出关键节点，一起慢慢推进到属于你的结局。
            </p>

          {/* API配置状态提示 */}
          {isApiConfigured ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 text-[10px] text-emerald-700">
              ✓ AI服务已配置
            </div>
          ) : (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              <div className="font-semibold">⚠️ AI服务未配置</div>
              <div className="mt-1">
                请配置 AI API Key 以启用任务分解功能：
              </div>
              <div className="mt-2 font-mono bg-red-100 p-2 rounded text-[10px]">
                1. 访问 <strong>https://cloud.siliconflow.cn</strong> 注册<br/>
                2. 在左侧"API密钥"复制你的密钥<br/>
                3. 在项目根目录创建 <strong>.env.local</strong> 文件<br/>
                4. 添加：<br/>
                &nbsp;&nbsp;NEXT_PUBLIC_DEEPSEEK_API_KEY=你的密钥<br/>
                5. 重启开发服务器
              </div>
            </div>
          )}
        </header>

        <section className="rounded-xl bg-[#e6f5f0]/80 p-2 shadow-md ring-1 ring-teal-300/50">
          <div className="space-y-1.5">
            <div className="mb-1">
              <span className="text-[10px] font-medium text-teal-900/70">
                新建任务
              </span>
            </div>
            
            {/* 任务输入表单 - 小卡片布局 */}
            <div className="space-y-1" onKeyDown={handleKeyDown}>
              {/* 任务简述 */}
              <input
                value={taskBrief}
                onChange={(e) => setTaskBrief(e.target.value)}
                placeholder="写下今天的任务..."
                className="w-full rounded-lg border border-teal-200/60 bg-[#ecfdf5] px-2 py-1 text-xs text-stone-900 outline-none ring-1 ring-transparent transition focus:ring-teal-400/50 placeholder:text-gray-400"
              />
              
              {/* 期望结果 */}
              <input
                value={expectedResult}
                onChange={(e) => setExpectedResult(e.target.value)}
                placeholder="期望结果（选填）"
                className="w-full rounded-lg border border-teal-200/60 bg-[#ecfdf5] px-2 py-1 text-xs text-stone-900 outline-none ring-1 ring-transparent transition focus:ring-teal-400/50 placeholder:text-gray-400"
              />
              
              {/* DDL、场景、时间并排 */}
              <div className="flex gap-1">
                <input
                  value={ddl}
                  onChange={(e) => setDdl(e.target.value)}
                  placeholder="DDL"
                  className="flex-1 rounded-lg border border-teal-200/60 bg-[#ecfdf5] px-2 py-1 text-[10px] text-stone-900 outline-none ring-1 ring-transparent transition focus:ring-teal-400/50 placeholder:text-gray-400"
                />
                <input
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  placeholder="场景"
                  className="flex-1 rounded-lg border border-teal-200/60 bg-[#ecfdf5] px-2 py-1 text-[10px] text-stone-900 outline-none ring-1 ring-transparent transition focus:ring-teal-400/50 placeholder:text-gray-400"
                />
                <input
                  value={timeBudget}
                  onChange={(e) => setTimeBudget(e.target.value)}
                  placeholder="时间"
                  className="flex-1 rounded-lg border border-teal-200/60 bg-[#ecfdf5] px-2 py-1 text-[10px] text-stone-900 outline-none ring-1 ring-transparent transition focus:ring-teal-400/50 placeholder:text-gray-400"
                />
              </div>
            </div>
            
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-[9px] text-teal-800/60">Ctrl+Enter 快速提交</span>
              
              <button
                type="button"
                onClick={handleStartAdventure}
                disabled={isPlanning || !taskBrief.trim()}
                className="rounded-lg bg-gradient-to-r from-teal-400 to-teal-500 px-2 py-1 text-[10px] font-medium text-teal-900 shadow-sm transition hover:from-teal-500 hover:to-teal-600 disabled:opacity-50"
              >
                {isPlanning ? "构思中..." : "出发"}
              </button>
            </div>
          </div>
        </section>

        <section className="flex-1 rounded-3xl bg-[#e6f5f0]/95 p-4 shadow-[0_22px_60px_rgba(120,72,32,0.55)] ring-1 ring-teal-500/40 backdrop-blur-sm sm:p-6 lg:p-8">
          {!currentAdventure || !currentAdventure.taskBrief?.trim() ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-center text-stone-600">
              <div className="flex items-center gap-2 rounded-full bg-[#f0fdfa] px-3 py-1 text-xs font-medium text-teal-900/80 ring-1 ring-dashed ring-teal-400/70 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]" />
                在上方填写任务信息，然后点击「集结队伍，出发！」
              </div>
              <p className="max-w-md text-sm">
                我们会在下方摊开一张古老卷轴，由 AI 冒险顾问帮你拆解章节，把今天的任务变成可以一一通关的路标。
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold tracking-[0.16em] text-teal-900/70">
                    今日主线 · MAIN STORY
                  </div>
                  <div className="mt-1 text-lg font-semibold text-stone-950 sm:text-xl">
                    {taskBrief}
                  </div>
                </div>
                {subTasks.length > 0 && (
                  <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-teal-100/90 via-teal-50/90 to-emerald-50/90 px-3 py-2 text-xs text-teal-900 ring-1 ring-teal-300/70 shadow-md shadow-teal-200/70 sm:text-sm">
                    <div className="relative h-8 w-8">
                      <div className="absolute inset-0 rounded-full bg-teal-200/70 shadow-[0_0_15px_rgba(252,211,77,0.85)]" />
                      <svg
                        viewBox="0 0 36 36"
                        className="-rotate-90 overflow-visible"
                      >
                        <defs>
                          <linearGradient
                            id="progressGradient"
                            x1="0%"
                            y1="0%"
                            x2="100%"
                            y2="0%"
                          >
                            <stop offset="0%" stopColor="#facc15" />
                            <stop offset="100%" stopColor="#16a34a" />
                          </linearGradient>
                        </defs>
                        <path
                          d="M18 2a16 16 0 1 1 0 32A16 16 0 0 1 18 2"
                          fill="none"
                          stroke="#fed7aa"
                          strokeWidth={3}
                          strokeLinecap="round"
                        />
                        <path
                          d="M18 2a16 16 0 1 1 0 32A16 16 0 0 1 18 2"
                          fill="none"
                          stroke="url(#progressGradient)"
                          strokeWidth={3.5}
                          strokeLinecap="round"
                          strokeDasharray="100"
                          strokeDashoffset={100 - completionRate}
                          className="transition-[stroke-dashoffset] duration-500 ease-out drop-shadow-[0_0_10px_rgba(250,204,21,0.9)]"
                        />
                      </svg>
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-teal-950">
                        {completionRate}%
                      </span>
                    </div>
                    <div className="leading-tight">
                      <div className="font-semibold">
                        冒险里程碑 · {completionRate}%
                      </div>
                      <div className="text-[11px] text-teal-900/80">
                        每完成一个子任务，卷轴上的路径都会亮起一小段金光。
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 任务详情展示 - 紧凑小卡片，一行显示 */}
              <div className="flex flex-wrap gap-1">
                {expectedResult && (
                  <div className="rounded-lg bg-teal-50/60 px-2 py-1 whitespace-nowrap">
                    <span className="text-[9px] font-medium text-teal-900/70">期望:</span>
                    <span className="ml-1 text-[10px] text-stone-700">{expectedResult}</span>
                  </div>
                )}
                {ddl && (
                  <div className="rounded-lg bg-teal-50/60 px-2 py-1 whitespace-nowrap">
                    <span className="text-[9px] font-medium text-teal-900/70">截止:</span>
                    <span className="ml-1 text-[10px] text-stone-700">{ddl}</span>
                  </div>
                )}
                {background && (
                  <div className="rounded-lg bg-teal-50/60 px-2 py-1 whitespace-nowrap">
                    <span className="text-[9px] font-medium text-teal-900/70">场景:</span>
                    <span className="ml-1 text-[10px] text-stone-700">{background}</span>
                  </div>
                )}
                {currentProgress && (
                  <div className="rounded-lg bg-teal-50/60 px-2 py-1 whitespace-nowrap">
                    <span className="text-[9px] font-medium text-teal-900/70">进度:</span>
                    <span className="ml-1 text-[10px] text-stone-700">{currentProgress}</span>
                  </div>
                )}
                {timeBudget && (
                  <div className="rounded-lg bg-teal-50/60 px-2 py-1 whitespace-nowrap">
                    <span className="text-[9px] font-medium text-teal-900/70">时间:</span>
                    <span className="ml-1 text-[10px] text-stone-700">{timeBudget}</span>
                  </div>
                )}
                {preference && (
                  <div className="rounded-lg bg-teal-50/60 px-2 py-1 whitespace-nowrap">
                    <span className="text-[9px] font-medium text-teal-900/70">偏好:</span>
                    <span className="ml-1 text-[10px] text-stone-700">{preference}</span>
                  </div>
                )}
              </div>

              <div className="relative mt-2 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <div className="relative h-72 overflow-hidden rounded-2xl bg-gradient-to-br from-[#f8e7c7] via-[#f2ddbc] to-[#e9cfab] p-3 ring-1 ring-teal-600/40 shadow-inner shadow-teal-900/20 sm:h-80 lg:h-96">
                  <div className="pointer-events-none absolute inset-3 rounded-[1.75rem] border border-dashed border-teal-700/50" />
                  <svg
                    viewBox="0 0 400 260"
                    className="absolute inset-4 h-[calc(100%-32px)] w-[calc(100%-32px)] text-teal-900/80"
                  >
                    <defs>
                      <linearGradient
                        id="scrollEdge"
                        x1="0%"
                        y1="0%"
                        x2="0%"
                        y2="100%"
                      >
                        <stop offset="0%" stopColor="#d1fae5" />
                        <stop offset="100%" stopColor="#fed7aa" />
                      </linearGradient>
                    </defs>
                    <rect
                      x="22"
                      y="18"
                      width="356"
                      height="224"
                      rx="28"
                      fill="url(#scrollEdge)"
                      stroke="#b45309"
                      strokeWidth="2.5"
                    />
                    <path
                      d="M40 40 q10 10 0 20 t0 20 q10 10 0 20"
                      fill="none"
                      stroke="#b45309"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                    <path
                      d="M360 40 q-10 10 0 20 t0 20 q-10 10 0 20"
                      fill="none"
                      stroke="#b45309"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />

                    {MAP_PATH_SEGMENTS.slice(0, Math.max(0, subTasks.length - 1)).map((d, segIndex) => (
                      <g key={segIndex}>
                        <path
                          d={d}
                          fill="none"
                          stroke="#7c2d12"
                          strokeWidth="4"
                          strokeLinecap="round"
                        />
                        {subTasks[segIndex]?.completed && (
                          <path
                            d={d}
                            fill="none"
                            stroke="#fbbf24"
                            strokeWidth="6"
                            strokeLinecap="round"
                            className="drop-shadow-[0_0_12px_rgba(251,191,36,0.9)]"
                          />
                        )}
                      </g>
                    ))}

                    {subTasks.slice(0, 6).map((task, index) => {
                      const pos = MAP_NODE_POSITIONS[index] ?? MAP_NODE_POSITIONS[MAP_NODE_POSITIONS.length - 1];
                      const isFirst = index === 0;
                      const isLast = index === subTasks.length - 1;
                      return (
                        <g
                          key={task.id}
                          className="cursor-pointer transition-transform hover:-translate-y-0.5"
                          onClick={() => setSelectedTaskId(task.id)}
                        >
                          <g transform={`translate(${pos.x}, ${pos.y})`}>
                            {isFirst && (
                              <>
                                <circle
                                  r="18"
                                  fill={task.completed ? "#bbf7d0" : "#d1fae5"}
                                  stroke={task.completed ? "#15803d" : "#b45309"}
                                  strokeWidth="2.5"
                                />
                                <path
                                  d="M-10 6 L-10 -4 L0 -10 L10 -4 L10 6 Z"
                                  fill={task.completed ? "#16a34a" : "#b45309"}
                                />
                                <rect
                                  x="-6"
                                  y="5"
                                  width="12"
                                  height="6"
                                  rx="1"
                                  fill={task.completed ? "#166534" : "#92400e"}
                                />
                              </>
                            )}
                            {!isFirst && !isLast && (
                              <>
                                <circle
                                  r="18"
                                  fill={task.completed ? "#bbf7d0" : "#e0f2fe"}
                                  stroke={task.completed ? "#15803d" : "#0369a1"}
                                  strokeWidth="2.5"
                                />
                                <rect
                                  x="-9"
                                  y="0"
                                  width="18"
                                  height="10"
                                  rx="2"
                                  fill={task.completed ? "#15803d" : "#14532d"}
                                />
                                <polygon
                                  points="-10,0 0,-12 10,0"
                                  fill={task.completed ? "#22c55e" : "#1d4ed8"}
                                />
                              </>
                            )}
                            {isLast && !isFirst && (
                              <>
                                <rect
                                  x="-13"
                                  y="0"
                                  width="26"
                                  height="14"
                                  rx="3"
                                  fill={task.completed ? "#facc15" : "#b45309"}
                                />
                                <rect
                                  x="-11"
                                  y="-4"
                                  width="22"
                                  height="4"
                                  rx="1"
                                  fill={task.completed ? "#fde68a" : "#f97316"}
                                />
                                <polygon
                                  points="0,-4 0,-20 9,-14"
                                  fill={task.completed ? "#22c55e" : "#e11d48"}
                                />
                              </>
                            )}
                            {isLast && isFirst && (
                              <>
                                <rect
                                  x="-13"
                                  y="0"
                                  width="26"
                                  height="14"
                                  rx="3"
                                  fill={task.completed ? "#facc15" : "#b45309"}
                                />
                                <rect
                                  x="-11"
                                  y="-4"
                                  width="22"
                                  height="4"
                                  rx="1"
                                  fill={task.completed ? "#fde68a" : "#f97316"}
                                />
                                <polygon
                                  points="0,-4 0,-20 9,-14"
                                  fill={task.completed ? "#22c55e" : "#e11d48"}
                                />
                              </>
                            )}
                          </g>
                        </g>
                      );
                    })}
                  </svg>

                  <div className="pointer-events-none absolute inset-x-6 bottom-3 flex items-center justify-between text-[10px] font-medium text-teal-900/70">
                    <span>营地 · 故事的起点</span>
                    <span>迷雾森林</span>
                    <span>宝箱 · 今日终点</span>
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl bg-[#f1fdf9]/90 p-4 ring-1 ring-teal-400/70 shadow-md shadow-teal-900/25 sm:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
                      冒险步骤总览
                    </h2>
                    <div className="flex items-center gap-2">
                      {currentAdventure && currentAdventure.subTasks.length > 0 && (
                        <button
                          type="button"
                          onClick={handleReplanAdventure}
                          disabled={isReplanning || isPlanning}
                          className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-teal-400 to-orange-400 px-2.5 py-1.5 text-xs font-semibold text-teal-950 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-wait disabled:opacity-70"
                        >
                          {isReplanning ? (
                            <>
                              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              AI重构中...
                            </>
                          ) : (
                            <>
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              AI重新分解
                            </>
                          )}
                        </button>
                      )}
                      {currentAdventure && (
                        <button
                          type="button"
                          onClick={() => {
                            setAdventures((prev) =>
                              prev.map((adv) =>
                                adv.id === currentAdventure.id
                                  ? {
                                      ...adv,
                                      subTasks: defaultSubTasks,
                                      updatedAt: new Date().toISOString(),
                                    }
                                  : adv,
                              ),
                            );
                          }}
                          className="text-xs font-medium text-teal-800 underline-offset-2 hover:underline"
                        >
                          重置
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 sm:text-[13px]">
                    每完成一个子任务，左侧卷轴上的对应路段会亮起金色光芒，并伴随轻微的点亮动画。你可以像推图一样一步一步前进。
                  </p>
                  
                  {/* 已完成的任务列表 */}
                  {subTasks.filter(t => t.completed).length > 0 && (
                    <div className="mb-3">
                      <details className="group">
                        <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-emerald-600 hover:text-emerald-700">
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100">
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                          </span>
                          已完成 {subTasks.filter(t => t.completed).length} 个任务
                          <svg className="h-3 w-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                          </svg>
                        </summary>
                        <div className="mt-2 space-y-2 pl-6">
                          {subTasks.filter(t => t.completed).map((task, idx) => (
                            <div key={task.id} className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-2 py-1.5 text-xs">
                              <span className="mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100">
                                <svg className="h-2.5 w-2.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                </svg>
                              </span>
                              <span className="text-emerald-800 line-through">{task.title}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  )}
                  
                  {/* 当前任务 - 优先显示选中的任务，否则显示第一个未完成的任务 */}
                  {(() => {
                    // 优先显示地图上选中的任务
                    const selectedTask = selectedTaskId ? subTasks.find(t => t.id === selectedTaskId) : null;
                    const currentTask = selectedTask || subTasks.find(t => !t.completed);
                    const currentIndex = selectedTask ? subTasks.findIndex(t => t.id === selectedTaskId) : subTasks.findIndex(t => !t.completed);
                    const isPreviewing = !!selectedTask;
                    const remainingCount = selectedTask 
                      ? subTasks.findIndex(t => t.id === selectedTaskId) 
                      : subTasks.filter(t => !t.completed).length - 1;
                    
                    if (!currentTask) {
                      return subTasks.length > 0 ? (
                        <div className="rounded-xl border border-emerald-300 bg-emerald-50/90 p-4 text-center">
                          <div className="text-2xl">🎉</div>
                          <p className="mt-1 font-semibold text-emerald-800">所有任务已完成！</p>
                          <p className="text-xs text-emerald-600">太棒了，你完成了今天的全部挑战！</p>
                        </div>
                      ) : null;
                    }
                    
                    return (
                      <div className="space-y-2">
                        {/* 当前任务高亮显示 */}
                        <div className={`rounded-xl border-2 ${isPreviewing ? 'border-blue-400 bg-gradient-to-br from-blue-50 to-indigo-50' : 'border-teal-400 bg-gradient-to-br from-teal-50 to-orange-50'} p-4 shadow-lg`}>
                          {/* 提示：预览中或当前任务 */}
                          {isPreviewing && (
                            <div className="mb-2 flex items-center justify-between">
                              <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-blue-400 text-[11px] font-bold text-white">
                                预览
                              </span>
                              <button 
                                onClick={() => setSelectedTaskId(null)}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                关闭预览
                              </button>
                            </div>
                          )}
                          {!isPreviewing && (
                            <div className="mb-2 flex items-center gap-2">
                              <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-teal-400 text-[11px] font-bold text-teal-900 animate-pulse">
                                当前
                              </span>
                              <span className="text-[15px] font-bold text-stone-900">
                                {currentTask.title}
                              </span>
                            </div>
                          )}
                          {isPreviewing && (
                            <div className="mb-2 flex items-center gap-2">
                              <span className="text-[15px] font-bold text-stone-900">
                                {currentTask.title}
                              </span>
                            </div>
                          )}
                          <div className="prose prose-sm max-w-none text-[13px] text-stone-700">
                            {/* 解析任务描述，支持换行格式 */}
                            {currentTask.description.split('\n').map((line, i) => {
                              const trimmed = line.trim();
                              if (trimmed.startsWith('🛠️') || trimmed.startsWith('✅') || trimmed.startsWith('📋')) {
                                return <p key={i} className="mt-2 font-semibold text-stone-800">{trimmed}</p>;
                              }
                              if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
                                return <p key={i} className="ml-3 text-stone-600">{trimmed}</p>;
                              }
                              return <p key={i} className="text-stone-600">{trimmed}</p>;
                            })}
                          </div>
                          {/* 只有在非预览模式下才显示标记完成按钮 */}
                          {!isPreviewing && (
                            <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-teal-400 px-4 py-2 font-semibold text-teal-900 transition hover:bg-teal-500">
                              <input
                                type="checkbox"
                                checked={currentTask.completed}
                                onChange={() => handleToggleSubTask(currentTask.id)}
                                className="h-5 w-5 rounded border-teal-500 text-emerald-600 accent-emerald-600"
                              />
                              标记完成
                            </label>
                          )}
                          {/* 预览模式下的提示 */}
                          {isPreviewing && (
                            <div className="mt-3 rounded-lg bg-blue-100 px-4 py-2 text-center text-xs text-blue-700">
                              点击地图上的其他节点可查看不同任务
                            </div>
                          )}
                        </div>
                        
                        {/* 剩余任务数量提示 */}
                        {!isPreviewing && remainingCount > 0 && (
                          <p className="text-center text-xs text-stone-500">
                            📍 还有 {remainingCount} 个任务等待解锁
                          </p>
                        )}
                      </div>
                    );
                  })()}
                  
                  {subTasks.length === 0 && (
                    <p className="text-xs text-stone-500">
                      还没有子任务。点击上方「集结队伍，出发！」，AI 会为你在卷轴上生成三个起步的小章节。
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
        </div>

        {/* 右侧边栏 - 历史冒险卷轴 */}
        <div className="w-56 flex-shrink-0 hidden lg:block">
          {adventures.length > 0 && (
            <div className="sticky top-6 space-y-3 rounded-2xl bg-[#e6f5f0]/80 p-3 ring-1 ring-teal-300/70">
              <div className="flex items-center justify-between text-[11px] font-medium text-teal-900/80">
                <span>📜 冒险卷轴</span>
                <button
                  type="button"
                  className="rounded-full border border-teal-300/80 bg-teal-100/70 px-2 py-0.5 text-[10px] font-semibold text-teal-900 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition"
                  onClick={() => {
                    const nowIso = new Date().toISOString();
                    const id = createAdventureId();
                    const todayKey = getTodayKey();
                    const newAdventure: Adventure = {
                      id,
                      title: "",
                      dateKey: todayKey,
                      subTasks: [],
                      createdAt: nowIso,
                      updatedAt: nowIso,
                      taskBrief: "",
                      expectedResult: "",
                      ddl: "",
                      background: "",
                      currentProgress: "",
                      timeBudget: "",
                      preference: "",
                    };
                    setAdventures((prev) => [...prev, newAdventure]);
                    setCurrentId(id);
                  }}
                >
                  + 新冒险
                </button>
              </div>
              <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-12rem)]">
                {adventures
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(b.createdAt).getTime() -
                      new Date(a.createdAt).getTime(),
                  )
                  .map((adv) => {
                    const isActive = adv.id === currentId;
                    const shortTitle =
                      adv.taskBrief?.trim() || adv.title.trim() || "未命名";
                    const dateLabel = adv.dateKey;
                    const totalWeight = adv.subTasks.reduce(
                      (sum, t) => sum + (t.weight > 0 ? t.weight : 1),
                      0,
                    );
                    const completedWeight = adv.subTasks.reduce(
                      (sum, t) =>
                        sum +
                        (t.completed ? (t.weight > 0 ? t.weight : 1) : 0),
                      0,
                    );
                    const rate =
                      totalWeight === 0
                        ? 0
                        : Math.round((completedWeight / totalWeight) * 100);

                    return (
                      <button
                        key={adv.id}
                        type="button"
                        onClick={() => setCurrentId(adv.id)}
                        className={`w-full flex flex-col justify-between rounded-xl border px-3 py-2 text-left text-[11px] shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(146,88,36,0.45)] ${
                          isActive
                            ? "border-teal-500 bg-[#d1fae5]"
                            : "border-teal-200/80 bg-[#f8e7c7]/90"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-teal-900 line-clamp-1 flex-1">
                            {shortTitle}
                          </span>
                          <span className="rounded bg-teal-100/80 px-1 py-0.5 text-[10px] text-teal-900">
                            {rate}%
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-teal-900/80">
                          <span>{dateLabel}</span>
                          <span>
                            {adv.subTasks.filter((t) => t.completed).length}/
                            {adv.subTasks.length || 0}
                          </span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}