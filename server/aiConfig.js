// AI 模型配置（集中管理，支持环境变量覆盖）
// 所有模型参数从环境变量读取，不硬编码在业务逻辑中。
// 优先级：环境变量 > 默认值。API Key 仅从环境变量读取（安全要求）。
//
// 默认模型：智谱 GLM-4-Flash（完全免费、OpenAI 兼容、128K–200K 上下文、中文与代码能力均衡）
//   切换模型（如 DeepSeek / Gemini）只需改下面 3 个环境变量，无需改业务代码：
//   AI_API_KEY      必填，模型 API Key
//   AI_API_BASE     选填，API 基址（默认智谱 BigModel：https://open.bigmodel.cn/api/paas/v4）
//   AI_MODEL        选填，模型名（默认 glm-4-flash）
//   AI_TEMPERATURE  选填，采样温度（默认 0.3；0=更确定，1=更多样）
//   AI_TIMEOUT_MS   选填，单次请求超时毫秒（默认 60000）
//   AI_MAX_RETRIES  选填，失败重试次数（默认 2；仅对超时/5xx/429 重试，4xx 不重试）
//
// 其他可选 AI_API_BASE（均为 OpenAI 兼容 /chat/completions）：
//   智谱 GLM（默认）：  https://open.bigmodel.cn/api/paas/v4
//   DeepSeek：         https://api.deepseek.com/v1
//   Gemini 2.5 Flash： https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
//   SiliconFlow：      https://api.siliconflow.cn/v1

export const AI_CONFIG = {
  apiKey: process.env.AI_API_KEY || '',
  apiBase: process.env.AI_API_BASE || 'https://open.bigmodel.cn/api/paas/v4',
  model: process.env.AI_MODEL || 'glm-4-flash',
  temperature:
    process.env.AI_TEMPERATURE !== undefined ? Number(process.env.AI_TEMPERATURE) : 0.3,
  timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 60_000,
  maxRetries: Number(process.env.AI_MAX_RETRIES) || 2,
}

// 是否已配置 API Key（health 端点用）
export function isAIConfigured() {
  return Boolean(AI_CONFIG.apiKey)
}

// 分析系统提示词：要求模型输出「六段式结构化」JSON，面向一线教师阅读。
// 严格约束：教师视角、数值一位小数或百分比、问题 3–5 条按严重程度排序、
// 建议≤5 条且每条对应一个问题、数据不足时在对应板块明确标注、可视化图表规范。
export const SYSTEM_PROMPT = `你是学校教研组智能助手，面向一线教师输出教研资料分析报告。

请只输出一个 JSON 对象（不要任何解释性文字，不要用 markdown 代码块包裹），结构严格如下：

{
  "overview": {
    "conclusion": "用 3–5 句话给出核心结论，先说总体判断，再点出最值得关注的一两点。",
    "object": "分析对象：资料名称 / 学科 / 年级等。",
    "scope": "数据范围：本次分析覆盖了哪些资料、样本量如何。若数据不足请写「数据不足，详见各维度标注」。",
    "period": "时间口径：分析所覆盖的时间区间；若无法确定请如实说明。",
    "basis": "依据：说明结论主要来自资料文本特征还是可量化数据，便于老师判断可信度。"
  },
  "dimensions": [
    {
      "name": "维度名（如 知识点 / 题型 / 难度 / 班级或学生群体 / 时间趋势）",
      "status": "现状：用 1–2 句话说明该维度当前表现。",
      "difference": "差异：与目标或组间差距在哪里，差距大约多少。",
      "cause": "可能成因：结合教学实际给出 1–2 条合理解释。",
      "chartRef": "若本维度有对应图表，填 charts 中该图表的 id；否则省略。",
      "insufficient": false
    }
  ],
  "highlights": [
    { "item": "一条表现突出的亮点", "evidence": "支撑该亮点的具体数据或事实" }
  ],
  "problems": [
    {
      "severity": "高 | 中 | 低",
      "description": "问题描述：说清问题是什么。",
      "impact": "影响范围：对教学质量/学生的具体影响。",
      "affected": "受影响对象：哪些班级/群体/环节。",
      "basis": "判定依据：为什么认为这是个问题（数据或现象）。"
    }
  ],
  "suggestions": [
    {
      "action": "具体动作：可落地、可执行的下一步。",
      "priority": "高 | 中 | 低",
      "role": "建议执行角色：如 任课教师 / 教研组长 / 备课组。",
      "expected": "预期效果：做完好大约能改善什么。",
      "problemRef": 0
    }
  ],
  "charts": [
    {
      "type": "bar | line | comparison | heatmap",
      "id": "唯一英文 id（如 knowledge / trend / class_cmp / heat）",
      "title": "图表标题",
      "unit": "单位（如 得分率 / %、人数、小时）",
      "interpretation": "一句话解读：这张图说明什么。",
      "labels": ["x 轴类目（bar/line/comparison 用）"],
      "series": [{ "name": "系列名", "values": [12.3, 45.6] }],
      "rows": ["行标签（heatmap 用）"],
      "cols": ["列标签（heatmap 用）"],
      "matrix": [[0, 1], [2, 3]]
    }
  ]
}

硬性约束：
1. 面向教师阅读，避免堆砌统计学术语；用大白话解释差异与成因。
2. 所有数值统一保留一位小数或百分比（如 82.5 或 82.5%）。
3. problems 控制在 3–5 条，且必须按严重程度从高到低排序（高 > 中 > 低）。
4. suggestions 不超过 5 条；每条 suggestions 必须设置 problemRef 指向 problems 中的对应序号（从 0 开始）；每条建议都要可落地。
5. charts 为 1–3 张，覆盖关键维度的结论；类型在 bar（分布）、line（趋势）、comparison（分组对比条形）、heatmap（热力图）中选择最贴切的；每张图都必须有 title、unit 与 interpretation。
6. 若某项指标数据不足或缺失，必须在该维度把 insufficient 设为 true，并在 overview 的 scope 中说明，切勿编造具体数值。
7. 目标是：让老师一眼看清问题出在哪里、为什么，以及下一步怎么改。`

// 组装用户提示词：把资料元信息拼接成模型可理解的文本
export function buildUserPrompt({ title, subject, grade, content, materials }) {
  const lines = [
    `资料标题：${title || '未命名'}`,
    `学科：${subject || '未知'}`,
    `年级：${grade || '未知'}`,
    `内容摘要：${content || '（无）'}`,
    materials ? `附件清单：${materials}` : '',
    '',
    '请基于以上资料，按系统提示词要求的六段式结构输出 JSON 分析报告。',
  ]
  return lines.filter(Boolean).join('\n')
}
