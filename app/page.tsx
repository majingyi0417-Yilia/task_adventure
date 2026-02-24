"use client";

import { useEffect, useMemo, useState } from "react";

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

// 地图节点位置（最多 6 个），用于动态 3–6 步冒险路线
const MAP_NODE_POSITIONS = [
  { x: 70, y: 210 },
  { x: 130, y: 175 },
  { x: 190, y: 140 },
  { x: 250, y: 115 },
  { x: 310, y: 100 },
  { x: 340, y: 170 },
];

// 相邻节点之间的路径（共 5 段），每段对应前一个节点完成时高亮
const MAP_PATH_SEGMENTS = [
  "M 70 210 Q 100 188 130 175",
  "M 130 175 Q 160 156 190 140",
  "M 190 140 Q 220 126 250 115",
  "M 250 115 Q 280 106 310 100",
  "M 310 100 Q 326 138 340 170",
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
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

export default function Home() {
  const [adventures, setAdventures] = useState<Adventure[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  
  // 各个输入框的状态
  const [taskBrief, setTaskBrief] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [ddl, setDdl] = useState("");
  const [background, setBackground] = useState("");
  const [currentProgress, setCurrentProgress] = useState("");
  const [timeBudget, setTimeBudget] = useState("");
  const [preference, setPreference] = useState("");

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

  useEffect(() => {
    if (currentAdventure) {
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
    
    // 更新当前 adventure 的数据
    if (currentAdventure) {
      setAdventures(prev =>
        prev.map(adv =>
          adv.id === currentAdventure.id
            ? {
                ...adv,
                taskBrief,
                expectedResult,
                ddl,
                background,
                currentProgress,
                timeBudget,
                preference,
                updatedAt: new Date().toISOString(),
              }
            : adv
        )
      );
    }
    
    const state: AdventureState = {
      currentId,
      adventures,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [taskBrief, expectedResult, ddl, background, currentProgress, timeBudget, preference, adventures, currentId, currentAdventure]);

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

    // 构建完整的任务描述
    const fullTask = `【任务简述】${taskBrief}
【期望结果】${expectedResult}
【DDL】${ddl}
【背景/场景】${background}
【当前进度】${currentProgress}
【时间预算】${timeBudget}
【特别偏好】${preference}`;

    // 构建拆解原则
    const breakDownPrinciples = `【拆解原则】
1. 每个步骤都应该简单易行，可以在15-30分钟内完成
2. 从最简单的步骤开始，帮助用户快速建立成就感
3. 避免复杂的、需要长时间专注的任务
4. 根据任务复杂度自然确定步骤数量（通常3-8个）
5. 考虑用户的【时间预算】和【特别偏好】
6. 每个步骤都要具体、可操作、容易上手
7. 为每个步骤分配合理的权重（1-3），简单的步骤权重为1，中等为2，稍难为3`;

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
      const systemPrompt = `你是一个专业的任务拆解助手。请严格按照以下原则将用户的任务拆解成3-8个具体的子任务：

${breakDownPrinciples}

请以JSON格式返回子任务数组，每个子任务包含以下字段：
- id: 唯一标识符（如step-1）
- title: 简洁的标题（不超过15字）
- description: 具体可操作的描述（详细说明怎么做）
- weight: 权重（1-3，简单=1，中等=2，稍难=3）

任务描述：
${fullTask}

请直接返回JSON数组，不要有其他解释。`;

      const response = await fetch(DEEPSEEK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: "deepseek-chat",
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
    } catch {
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
    <div className="min-h-screen bg-[#f5ead7] bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.05)_1px,transparent_0)] bg-[length:18px_18px] text-stone-900">
      <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
        <header className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-50/80 px-3 py-1 text-xs font-medium text-amber-900 shadow-sm ring-1 ring-amber-200/70 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            任务冒险伴侣 · 在温暖的篝火旁展开一日冒险
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-stone-950 sm:text-4xl">
            今天，我们要开启什么伟大的冒险？
          </h1>
          <p className="max-w-2xl text-sm text-stone-600 sm:text-base">
            把今天的主任务当成一段被写进卷轴的故事。AI 吟游诗人会为你拆解章节，标出关键节点，一起慢慢推进到属于你的结局。
          </p>

          {adventures.length > 0 && (
            <div className="mt-3 space-y-2 rounded-2xl bg-[#f3e2c6]/80 p-3 ring-1 ring-amber-300/70">
              <div className="flex items-center justify-between text-[11px] font-medium text-amber-900/80">
                <span>多日冒险档案 · 卷轴一览</span>
                <button
                  type="button"
                  className="rounded-full border border-amber-300/80 bg-amber-100/70 px-2 py-0.5 text-[10px] font-semibold text-amber-900 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition"
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
                  新的一天，新卷轴
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
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
                      adv.taskBrief?.trim() || adv.title.trim() || "未命名的冒险卷轴";
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
                        className={`flex min-w-[150px] flex-none flex-col justify-between rounded-xl border px-3 py-2 text-left text-[11px] shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(146,88,36,0.45)] ${
                          isActive
                            ? "border-amber-500 bg-[#fef3c7]"
                            : "border-amber-200/80 bg-[#f8e7c7]/90"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-amber-900 line-clamp-1">
                            {shortTitle}
                          </span>
                          <span className="rounded bg-amber-100/80 px-1 py-0.5 text-[10px] text-amber-900">
                            {rate}%
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-amber-900/80">
                          <span>{dateLabel}</span>
                          <span>
                            {adv.subTasks.filter((t) => t.completed).length}/
                            {adv.subTasks.length || 0} 节点
                          </span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </header>

        <section className="rounded-2xl bg-[#f3e2c6]/90 p-4 shadow-[0_18px_40px_rgba(146,88,36,0.22)] ring-1 ring-amber-300/70 backdrop-blur-sm sm:p-6">
          <div className="space-y-4">
            <div className="mb-4">
              <span className="mb-1 block text-xs font-semibold tracking-[0.16em] text-amber-900/80">
                启程：定义你的伟大冒险
              </span>
              <p className="text-sm text-amber-900/80">
                请按照以下格式详细描述你的任务，这将帮助 AI 更好地为你规划冒险路线。
              </p>
            </div>
            
            {/* 任务输入表单 */}
            <div className="space-y-3" onKeyDown={handleKeyDown}>
              {/* 任务简述 */}
              <div className="flex items-start gap-2">
                <span className="flex-shrink-0 whitespace-nowrap text-sm font-medium text-amber-900 min-w-[80px]">
                  【任务简述】
                </span>
                <input
                  value={taskBrief}
                  onChange={(e) => setTaskBrief(e.target.value)}
                  placeholder="例如：写完毕业论文第一章初稿；实现新功能原型等"
                  className="flex-1 rounded-xl border border-amber-200/80 bg-[#f8ecda] px-3.5 py-2.5 text-sm text-stone-900 shadow-inner shadow-amber-100/80 outline-none ring-2 ring-transparent transition focus:bg-[#fdf4e1] focus:ring-amber-400/80 placeholder:italic placeholder:text-gray-400"
                />
              </div>
              
              {/* 期望结果 */}
              <div className="flex items-start gap-2">
                <span className="flex-shrink-0 whitespace-nowrap text-sm font-medium text-amber-900 min-w-[80px]">
                  【期望结果】
                </span>
                <input
                  value={expectedResult}
                  onChange={(e) => setExpectedResult(e.target.value)}
                  placeholder="例如：今晚前完成一份可以发给导师/同事看的版本"
                  className="flex-1 rounded-xl border border-amber-200/80 bg-[#f8ecda] px-3.5 py-2.5 text-sm text-stone-900 shadow-inner shadow-amber-100/80 outline-none ring-2 ring-transparent transition focus:bg-[#fdf4e1] focus:ring-amber-400/80 placeholder:italic placeholder:text-gray-400"
                />
              </div>
              
              {/* DDL */}
              <div className="flex items-start gap-2">
                <span className="flex-shrink-0 whitespace-nowrap text-sm font-medium text-amber-900 min-w-[80px]">
                  【DDL】
                </span>
                <input
                  value={ddl}
                  onChange={(e) => setDdl(e.target.value)}
                  placeholder="例如：2025-03-01 23:00"
                  className="flex-1 rounded-xl border border-amber-200/80 bg-[#f8ecda] px-3.5 py-2.5 text-sm text-stone-900 shadow-inner shadow-amber-100/80 outline-none ring-2 ring-transparent transition focus:bg-[#fdf4e1] focus:ring-amber-400/80 placeholder:italic placeholder:text-gray-400"
                />
              </div>
              
              {/* 背景/场景 */}
              <div className="flex items-start gap-2">
                <span className="flex-shrink-0 whitespace-nowrap text-sm font-medium text-amber-900 min-w-[80px]">
                  【背景/场景】
                </span>
                <input
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  placeholder="例如：学术写作 / 编程 / 学习 / 工作 / 生活"
                  className="flex-1 rounded-xl border border-amber-200/80 bg-[#f8ecda] px-3.5 py-2.5 text-sm text-stone-900 shadow-inner shadow-amber-100/80 outline-none ring-2 ring-transparent transition focus:bg-[#fdf4e1] focus:ring-amber-400/80 placeholder:italic placeholder:text-gray-400"
                />
              </div>
              
              {/* 当前进度 */}
              <div className="flex items-start gap-2">
                <span className="flex-shrink-0 whitespace-nowrap text-sm font-medium text-amber-900 min-w-[80px]">
                  【当前进度】
                </span>
                <input
                  value={currentProgress}
                  onChange={(e) => setCurrentProgress(e.target.value)}
                  placeholder="例如：未开始 / 已有资料 / 进行到第几步"
                  className="flex-1 rounded-xl border border-amber-200/80 bg-[#f8ecda] px-3.5 py-2.5 text-sm text-stone-900 shadow-inner shadow-amber-100/80 outline-none ring-2 ring-transparent transition focus:bg-[#fdf4e1] focus:ring-amber-400/80 placeholder:italic placeholder:text-gray-400"
                />
              </div>
              
              {/* 时间预算 */}
              <div className="flex items-start gap-2">
                <span className="flex-shrink-0 whitespace-nowrap text-sm font-medium text-amber-900 min-w-[80px]">
                  【时间预算】
                </span>
                <input
                  value={timeBudget}
                  onChange={(e) => setTimeBudget(e.target.value)}
                  placeholder="例如：今天大约可投入 X 小时"
                  className="flex-1 rounded-xl border border-amber-200/80 bg-[#f8ecda] px-3.5 py-2.5 text-sm text-stone-900 shadow-inner shadow-amber-100/80 outline-none ring-2 ring-transparent transition focus:bg-[#fdf4e1] focus:ring-amber-400/80 placeholder:italic placeholder:text-gray-400"
                />
              </div>
              
              {/* 特别偏好 */}
              <div className="flex items-start gap-2">
                <span className="flex-shrink-0 whitespace-nowrap text-sm font-medium text-amber-900 min-w-[80px]">
                  【特别偏好】
                </span>
                <input
                  value={preference}
                  onChange={(e) => setPreference(e.target.value)}
                  placeholder="例如：先易后难 / 先清障碍 / 希望节奏轻一点等"
                  className="flex-1 rounded-xl border border-amber-200/80 bg-[#f8ecda] px-3.5 py-2.5 text-sm text-stone-900 shadow-inner shadow-amber-100/80 outline-none ring-2 ring-transparent transition focus:bg-[#fdf4e1] focus:ring-amber-400/80 placeholder:italic placeholder:text-gray-400"
                />
              </div>
            </div>
            
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-1 text-[11px] font-medium text-amber-800/80">
                <span className="rounded border border-amber-300/80 bg-amber-100/60 px-1.5 py-0.5 text-[10px] shadow-sm">
                  Ctrl + Enter
                </span>
                <span>快速启程</span>
              </div>
              
              <button
                type="button"
                onClick={handleStartAdventure}
                disabled={isPlanning || !taskBrief.trim()}
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-4 py-2.5 text-sm font-semibold text-amber-950 shadow-[0_14px_40px_rgba(180,83,9,0.55)] transition-transform hover:-translate-y-0.5 hover:shadow-[0_20px_55px_rgba(180,83,9,0.75)] active:translate-y-[1px] active:shadow-[0_10px_28px_rgba(180,83,9,0.65)] disabled:cursor-wait disabled:opacity-80"
              >
                {isPlanning ? "吟游诗人构思中..." : "集结队伍，出发！"}
              </button>
            </div>
          </div>
        </section>

        <section className="flex-1 rounded-3xl bg-[#f3e2c6]/95 p-4 shadow-[0_22px_60px_rgba(120,72,32,0.55)] ring-1 ring-amber-500/40 backdrop-blur-sm sm:p-6 lg:p-8">
          {!currentAdventure || !currentAdventure.taskBrief?.trim() ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-center text-stone-600">
              <div className="flex items-center gap-2 rounded-full bg-[#f7e7c8] px-3 py-1 text-xs font-medium text-amber-900/80 ring-1 ring-dashed ring-amber-400/70 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]" />
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
                  <div className="text-xs font-semibold tracking-[0.16em] text-amber-900/70">
                    今日主线 · MAIN STORY
                  </div>
                  <div className="mt-1 text-lg font-semibold text-stone-950 sm:text-xl">
                    {taskBrief}
                  </div>
                </div>
                {subTasks.length > 0 && (
                  <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-100/90 via-amber-50/90 to-emerald-50/90 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-300/70 shadow-md shadow-amber-200/70 sm:text-sm">
                    <div className="relative h-8 w-8">
                      <div className="absolute inset-0 rounded-full bg-amber-200/70 shadow-[0_0_15px_rgba(252,211,77,0.85)]" />
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
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-amber-950">
                        {completionRate}%
                      </span>
                    </div>
                    <div className="leading-tight">
                      <div className="font-semibold">
                        冒险里程碑 · {completionRate}%
                      </div>
                      <div className="text-[11px] text-amber-900/80">
                        每完成一个子任务，卷轴上的路径都会亮起一小段金光。
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 任务详情展示 */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {expectedResult && (
                  <div className="rounded-xl bg-amber-50/80 p-3 ring-1 ring-amber-200/70">
                    <div className="text-xs font-medium text-amber-900/80">期望结果</div>
                    <div className="mt-1 text-sm text-stone-800">{expectedResult}</div>
                  </div>
                )}
                {ddl && (
                  <div className="rounded-xl bg-amber-50/80 p-3 ring-1 ring-amber-200/70">
                    <div className="text-xs font-medium text-amber-900/80">DDL</div>
                    <div className="mt-1 text-sm text-stone-800">{ddl}</div>
                  </div>
                )}
                {background && (
                  <div className="rounded-xl bg-amber-50/80 p-3 ring-1 ring-amber-200/70">
                    <div className="text-xs font-medium text-amber-900/80">背景/场景</div>
                    <div className="mt-1 text-sm text-stone-800">{background}</div>
                  </div>
                )}
                {currentProgress && (
                  <div className="rounded-xl bg-amber-50/80 p-3 ring-1 ring-amber-200/70">
                    <div className="text-xs font-medium text-amber-900/80">当前进度</div>
                    <div className="mt-1 text-sm text-stone-800">{currentProgress}</div>
                  </div>
                )}
                {timeBudget && (
                  <div className="rounded-xl bg-amber-50/80 p-3 ring-1 ring-amber-200/70">
                    <div className="text-xs font-medium text-amber-900/80">时间预算</div>
                    <div className="mt-1 text-sm text-stone-800">{timeBudget}</div>
                  </div>
                )}
                {preference && (
                  <div className="rounded-xl bg-amber-50/80 p-3 ring-1 ring-amber-200/70">
                    <div className="text-xs font-medium text-amber-900/80">特别偏好</div>
                    <div className="mt-1 text-sm text-stone-800">{preference}</div>
                  </div>
                )}
              </div>

              <div className="relative mt-2 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <div className="relative h-72 overflow-hidden rounded-3xl bg-gradient-to-br from-[#f8e7c7] via-[#f2ddbc] to-[#e9cfab] p-4 ring-1 ring-amber-600/40 shadow-inner shadow-amber-900/20 sm:h-80">
                  <div className="pointer-events-none absolute inset-3 rounded-[1.75rem] border border-dashed border-amber-700/50" />
                  <svg
                    viewBox="0 0 400 260"
                    className="absolute inset-4 h-[calc(100%-32px)] w-[calc(100%-32px)] text-amber-900/80"
                  >
                    <defs>
                      <linearGradient
                        id="scrollEdge"
                        x1="0%"
                        y1="0%"
                        x2="0%"
                        y2="100%"
                      >
                        <stop offset="0%" stopColor="#fef3c7" />
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
                          onClick={() => handleToggleSubTask(task.id)}
                        >
                          <g transform={`translate(${pos.x}, ${pos.y})`}>
                            {isFirst && (
                              <>
                                <circle
                                  r="18"
                                  fill={task.completed ? "#bbf7d0" : "#fef3c7"}
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

                  <div className="pointer-events-none absolute inset-x-6 bottom-3 flex items-center justify-between text-[10px] font-medium text-amber-900/70">
                    <span>营地 · 故事的起点</span>
                    <span>迷雾森林</span>
                    <span>宝箱 · 今日终点</span>
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl bg-[#f6e7cf]/90 p-4 ring-1 ring-amber-400/70 shadow-md shadow-amber-900/25 sm:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
                      冒险步骤总览
                    </h2>
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
                        className="text-xs font-medium text-amber-800 underline-offset-2 hover:underline"
                      >
                        重置本卷轴子任务
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 sm:text-[13px]">
                    每完成一个子任务，左侧卷轴上的对应路段会亮起金色光芒，并伴随轻微的点亮动画。你可以像推图一样一步一步前进。
                  </p>
                  <div className="space-y-2">
                    {subTasks.map((task, index) => (
                      <label
                        key={task.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-xs shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-[#fff7e6] hover:shadow-[0_8px_24px_rgba(146,88,36,0.45)] ${
                          task.completed
                            ? "border-emerald-300 bg-emerald-50/90 shadow-[0_0_0_1px_rgba(16,185,129,0.45)] animate-[card-glow_480ms_ease-out]"
                            : "border-amber-200/80 bg-[#fdf3dd]/70"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={() => handleToggleSubTask(task.id)}
                          className={`mt-0.5 h-4 w-4 rounded border-amber-400 text-emerald-600 accent-emerald-600 shadow-[0_0_0_1px_rgba(180,83,9,0.5)] ${
                            task.completed
                              ? "animate-[task-bounce_260ms_cubic-bezier(.34,1.56,.64,1)]"
                              : ""
                          }`}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full bg-amber-100 text-[10px] font-semibold text-amber-900/90">
                              步骤 {index + 1}
                            </span>
                            <span
                              className={`text-[13px] font-semibold ${
                                task.completed
                                  ? "text-emerald-800"
                                  : "text-stone-950"
                              }`}
                            >
                              {task.title}
                            </span>
                            <span className="inline-flex h-5 items-center justify-center rounded-full bg-gradient-to-r from-amber-400/30 to-emerald-400/30 px-1.5 text-[10px] font-bold text-amber-900">
                              ️⚖️权重 {task.weight}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-stone-600">
                            {task.description}
                          </p>
                        </div>
                      </label>
                    ))}
                    {subTasks.length === 0 && (
                      <p className="text-xs text-stone-500">
                        还没有子任务。点击上方「集结队伍，出发！」，AI 会为你在卷轴上生成三个起步的小章节。
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <footer className="mt-2 flex flex-wrap items-center justify-between gap-3 text-[11px] text-stone-500">
          <span>
            小提示：如果今天没全部完成也没关系，卷轴会静静躺在浏览器里，明天篝火再燃起时我们继续。
          </span>
          <span>Made with React · Tailwind CSS · localStorage · DeepSeek AI</span>
        </footer>
      </main>
    </div>
  );
}