const STOP_WORDS = new Set([
  "我们", "你们", "他们", "她们", "大家", "自己", "这个", "那个", "这些", "那些",
  "一个", "一种", "一些", "一样", "这样", "那样", "这里", "那里", "什么", "怎么",
  "为什么", "如何", "可以", "可能", "应该", "需要", "没有", "不是", "就是", "还是",
  "但是", "然后", "因为", "所以", "如果", "虽然", "而且", "并且", "或者", "以及",
  "以及", "对于", "关于", "通过", "进行", "已经", "现在", "今天", "老师", "同学",
  "上课", "课程", "内容", "问题", "时候", "地方", "东西", "非常", "比较", "特别",
  "其实", "当然", "其中", "同时", "之后", "之前", "最后", "首先", "其次", "另外",
  "比如", "例如", "也就是说", "我们会", "我们要", "我们看", "来看", "看到", "觉得",
  "知道", "理解", "重要", "主要", "一定", "真正", "整个", "部分", "方面", "过程",
  "关系", "情况", "方式", "结果", "产生", "形成", "具有", "存在", "成为", "作为",
  "不是", "不能", "不会", "很多", "更多", "一点", "一下", "这种", "那种", "哪些",
  "这是", "那是", "有的", "有些", "还有", "只有", "只是", "而是", "也是", "都是",
  "的话", "来讲", "来说", "而言", "来看", "起来", "出来", "过来", "下去", "上去",
  "第一", "第二", "第三", "第四", "第五", "一方面", "另一方面",
  "的是", "一次", "每一", "都会", "以为", "本身", "并不", "需要", "成为",
  "容易", "更加", "往往", "重新", "组织", "争夺", "看到", "获得", "延长", "区分",
  "一点", "一直", "一起", "观点", "角度", "这里", "那里", "只需要", "不需要",
]);

const FUNCTION_CHARS = new Set(
  "的了吗呢吧啊着过是在和与及就都而也都个这那每某各其本该为以于对从把被让给".split(""),
);

function isUsefulToken(word) {
  if (word.length < 2 || STOP_WORDS.has(word)) return false;
  if (/^\d+$/.test(word)) return false;
  if (/^[a-z]+$/.test(word) && word.length < 3) return false;
  if ([...word].every((char) => FUNCTION_CHARS.has(char))) return false;
  if (/^[一这那每某各其本该][个次种些样点下]/.test(word)) return false;
  return true;
}

const CUE_WORDS = [
  "重点", "核心", "关键", "定义", "本质", "首先", "其次", "最后", "因此", "所以",
  "总结", "注意", "例如", "比如", "意味着", "说明", "结论", "步骤", "方法", "区别",
  "原因", "目的", "作用", "影响", "问题在于", "换句话说", "也就是说",
];

const segmenter =
  typeof Intl !== "undefined" && Intl.Segmenter
    ? new Intl.Segmenter("zh-CN", { granularity: "word" })
    : null;

function tokenize(text) {
  const tokens = [];
  if (segmenter) {
    for (const part of segmenter.segment(text)) {
      if (!part.isWordLike) continue;
      const word = part.segment.trim().toLowerCase();
      if (!word) continue;
      tokens.push(word);
    }
    return tokens;
  }
  const blocks = text.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{2,}/g) || [];
  for (const block of blocks) {
    if (/^[a-zA-Z]+$/.test(block)) {
      tokens.push(block.toLowerCase());
      continue;
    }
    for (let i = 0; i < block.length - 1; i += 1) {
      tokens.push(block.slice(i, i + 2));
    }
  }
  return tokens;
}

function keywordList(text, limit = 8) {
  const counts = new Map();
  const firstSeen = new Map();
  const words = tokenize(text);
  words.forEach((word, index) => {
    if (!isUsefulToken(word)) return;
    counts.set(word, (counts.get(word) || 0) + 1);
    if (!firstSeen.has(word)) firstSeen.set(word, index);
  });

  const sorted = [...counts.entries()]
    .map(([word, count]) => ({
      word,
      count,
      score: count * (1 + Math.min(word.length, 5) * 0.22) + 1 / (1 + (firstSeen.get(word) || 0)),
    }))
    .sort((a, b) => b.score - a.score);

  const selected = [];
  for (const item of sorted) {
    if (selected.length >= limit) break;
    if (selected.some((other) => other.includes(item.word) || item.word.includes(other))) continue;
    selected.push(item.word);
  }
  return selected;
}

function cleanText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function splitSentences(text) {
  const clean = cleanText(text);
  if (!clean) return [];
  const rough = clean
    .split(/(?<=[。！？!?；;])|\n+/)
    .flatMap((part) => {
      const value = part.trim();
      if (value.length <= 110) return [value];
      return value
        .split(/(?<=[，,、：:])/)
        .reduce((acc, clause) => {
          const last = acc[acc.length - 1] || "";
          if (last.length < 55) acc[acc.length - 1] = last + clause;
          else acc.push(clause);
          return acc;
        }, [""])
        .map((item) => item.trim())
        .filter(Boolean);
    })
    .map((item) => item.replace(/^[，,、；;：:\s]+/, "").trim())
    .filter((item) => item.length >= 4);
  return rough;
}

function sentenceScore(sentence) {
  let score = Math.min(sentence.length, 80) / 35;
  for (const cue of CUE_WORDS) {
    if (sentence.includes(cue)) score += 1.05;
  }
  if (/[0-9]/.test(sentence)) score += 0.25;
  if (/[？?]/.test(sentence)) score += 0.2;
  if (/^(今天|这节课|本次课|这一节|我们(今天)?来|我们先来|下面我们)/.test(sentence)) {
    score -= 0.9;
  }
  return score;
}

function trimTo(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function uniquePush(list, value) {
  const normalized = value.trim();
  if (!normalized) return;
  if (list.some((item) => item === normalized)) return;
  list.push(normalized);
}

function findQuestionSentences(sentences) {
  return sentences
    .filter((sentence) => {
      const clean = sentence.trim();
      if (/[？?]$/.test(clean)) return true;
      return /^(为什么|如何|什么是|是否|能不能|有没有|请问)/.test(clean) && clean.length <= 70;
    })
    .map((sentence) => trimTo(sentence.replace(/^[，,、\s]+/, ""), 54))
    .slice(-3);
}

export function buildLocalSection(text, keywords) {
  const sentences = splitSentences(text);
  if (!sentences.length) return null;

  const scored = sentences.map((sentence, index) => ({
    sentence,
    index,
    score: sentenceScore(sentence),
  }));
  const chosen = [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .sort((a, b) => a.index - b.index);
  const summary = trimTo(chosen.map((item) => item.sentence).join(""), 320);

  const points = [];
  for (const item of [...scored].sort((a, b) => b.score - a.score)) {
    const point = trimTo(item.sentence.replace(/[，,、\s]+$/, ""), 56);
    if (!point || points.includes(point)) continue;
    points.push(point);
    if (points.length >= 4) break;
  }

  const topic = keywords.filter(Boolean).slice(0, 2).join(" · ");
  return {
    title: topic || trimTo(sentences[0], 14) || "本段内容",
    summary,
    points,
  };
}

export function analyzeLocal(text, { newText = "" } = {}) {
  const clean = cleanText(text);
  const sentences = splitSentences(clean);

  if (!sentences.length) {
    return {
      summary: "正在等待课堂内容，开始说话后这里会自动生成纪要。",
      keyPoints: [],
      keywords: [],
      questions: ["这堂课的核心问题是什么？", "老师强调了哪些关键概念？"],
      updatedAt: new Date().toISOString(),
      source: "local",
    };
  }

  const keywords = keywordList(clean, 7);
  const scored = sentences.map((sentence, index) => ({
    sentence,
    index,
    score: sentenceScore(sentence) + Math.min(index, 8) * 0.025,
  }));

  const contentSentences = scored.filter(
    (item) =>
      !/^(今天|这节课|本次课|这一节|我们(今天)?来|我们先来|下面我们)/.test(item.sentence),
  );
  const pointSource = contentSentences.length >= 2 ? contentSentences : scored;
  const keyPointCandidates = [...pointSource]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .sort((a, b) => a.index - b.index);

  const keyPoints = [];
  for (const candidate of keyPointCandidates) {
    const point = trimTo(candidate.sentence.replace(/[，,、\s]+$/, ""), 92);
    if (keyPoints.some((item) => item === point)) continue;
    uniquePush(keyPoints, point);
    if (keyPoints.length >= 5) break;
  }

  // Prefer a connected 2–3 sentence gist over a single sentence. The previous
  // one-line summary was too terse to be useful when reviewing a lecture.
  const gistSentences = [...pointSource]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence);
  const gist = gistSentences.join("");
  const topicPrefix =
    keywords.length >= 2
      ? `本节围绕「${keywords.slice(0, 3).join("」「")}」展开。`
      : "";
  const summary = trimTo(`${topicPrefix}${gist}`, 320);

  const questions = [];
  for (const question of findQuestionSentences(sentences)) uniquePush(questions, question);
  if (keywords[0]) {
    uniquePush(questions, `如何用自己的话解释「${keywords[0]}」？`);
  }
  if (keywords[0] && keywords[1]) {
    uniquePush(questions, `「${keywords[0]}」和「${keywords[1]}」之间有什么联系？`);
  }
  if (keywords[2]) {
    uniquePush(questions, `「${keywords[2]}」在实际场景中如何应用？`);
  }
  const fallbackQuestions = [
    "目前为止，这堂课最值得记住的结论是什么？",
    "老师刚才提到的内容之间有什么因果关系？",
    "这些概念可以怎样应用到一个具体例子里？",
  ];
  for (const question of fallbackQuestions) {
    if (questions.length >= 3) break;
    uniquePush(questions, question);
  }

  return {
    summary,
    keyPoints,
    keywords,
    questions: questions.slice(0, 4),
    section: buildLocalSection(String(newText || "").trim() || clean, keywords),
    updatedAt: new Date().toISOString(),
    source: "local",
  };
}

function queryTerms(question) {
  return [...new Set(tokenize(question).filter((word) => word.length >= 2 && !STOP_WORDS.has(word)))];
}

function countMatches(text, expression) {
  return (text.match(expression) || []).length;
}

function profileConfidence(lectureCount, chars) {
  if (lectureCount >= 3 && chars >= 6000) return "high";
  if (chars >= 1200) return "medium";
  return "low";
}

/**
 * A transparent, extractive fallback used when no LLM is configured. It only
 * describes observable speech habits and never rates the teacher.
 */
export function buildTeacherProfileLocal(course, lectures) {
  const usable = (lectures || []).filter((lecture) =>
    (lecture.segments || []).some((segment) => segment.text?.trim()),
  );
  const texts = usable.map((lecture) => ({
    title: lecture.title,
    text: (lecture.segments || []).map((segment) => segment.text).join(""),
    durationSec: lecture.durationSec || 0,
  }));
  const text = texts.map((item) => item.text).join("\n");
  const chars = text.length;
  const measuredSeconds = texts.reduce((sum, item) => sum + item.durationSec, 0);
  const durationSeconds = measuredSeconds || Math.round((chars / 220) * 60);
  const minutes = Math.max(1, durationSeconds / 60);
  const charsPerMinute = Math.round(chars / minutes);
  const paceReliable = measuredSeconds > 0 && chars >= 800 && charsPerMinute >= 60;
  const sentences = splitSentences(text);

  const structureCues = countMatches(
    text,
    /首先|其次|再次|最后|第一|第二|第三|接下来|一方面|另一方面|总结|回到/g,
  );
  const exampleCues = countMatches(text, /比如|例如|举个例子|比如说|以.*为例|案例|设想/g);
  const interactionCues = countMatches(text, /大家|你们|我们来看|想一想|思考一下|回答|提问/g);
  const emphasisCues = countMatches(text, /重点|关键|注意|核心|记住|再强调|换句话说|也就是说/g);
  const theoryCues = countMatches(text, /定义|概念|理论|本质|假设|模型|机制|框架/g);
  const narrativeCues = countMatches(text, /当时|后来|有一次|故事|情境|场景|实验/g);
  const questionCues = countMatches(text, /[？?]|为什么|如何/g);

  const tags = [];
  if (structureCues >= 3 || structureCues >= usable.length * 1.5) uniquePush(tags, "结构清晰");
  if (exampleCues >= 2) uniquePush(tags, "案例驱动");
  if (interactionCues >= 3) uniquePush(tags, "互动启发");
  if (theoryCues >= 3) uniquePush(tags, "概念密度高");
  if (emphasisCues >= 2) uniquePush(tags, "重点反复强调");
  if (narrativeCues >= 2) uniquePush(tags, "叙事型讲解");
  if (paceReliable && charsPerMinute >= 240) uniquePush(tags, "节奏紧凑");
  else if (paceReliable && charsPerMinute <= 155) uniquePush(tags, "节奏舒缓");
  for (const fallback of ["讲解连贯", "概念导向", "适合边听边记"]) {
    if (tags.length >= 3) break;
    uniquePush(tags, fallback);
  }

  const structureSummary =
    structureCues >= 3
      ? `常通过「先抛问题或定义 → 例子展开 → 结论回收」推进，课堂里有约 ${structureCues} 处显式结构提示。`
      : "以连续讲授为主，段落转折不一定有显式提示，笔记里最好自己补出小标题。";
  const paceSummary = paceReliable
    ? `平均每分钟约 ${charsPerMinute} 字，${
        charsPerMinute >= 240
          ? "节奏偏紧凑，留给自己抄写的时间不多。"
          : charsPerMinute <= 155
            ? "节奏相对舒缓，适合边听边补全笔记。"
            : "节奏适中，能跟上讲解并同步记录关键词。"
      }`
    : "当前文字样本较短，暂不根据字数与时长推断语速；积累更多课堂后画像会更准确。";
  const exampleSummary =
    exampleCues >= 2
      ? `出现约 ${exampleCues} 处举例或案例，常把抽象概念落到具体情境里。`
      : "举例相对克制，更多依靠概念推演，建议自己补一个熟悉场景。";
  const interactionSummary =
    interactionCues >= 3 || questionCues >= 3
      ? `出现约 ${interactionCues} 处面向听众的提示或追问，课堂有一定互动感。`
      : "以单向讲授为主，问题多由老师自问自答，适合先记下自己的答案再对照。";
  const emphasisSummary =
    emphasisCues >= 2
      ? `出现约 ${emphasisCues} 次「重点 / 关键 / 注意」等提示，重点通常会被明确标记。`
      : "重点更多藏在结论句和反复出现的关键词里，需要自己提炼。";

  const dimensionList = [
    { key: "structure", label: "讲解结构", summary: structureSummary },
    { key: "pace", label: "节奏密度", summary: paceSummary },
    { key: "examples", label: "举例方式", summary: exampleSummary },
    { key: "interaction", label: "互动风格", summary: interactionSummary },
    { key: "emphasis", label: "重点呈现", summary: emphasisSummary },
  ];

  const mainTrait = tags.slice(0, 3).join("、");
  const pacePhrase = paceReliable
    ? `平均语速约 ${charsPerMinute} 字/分钟。`
    : "当前文字样本较短，暂不推断语速。";
  const summary = trimTo(
    `${course.teacher}老师的课堂呈现出${mainTrait}的特点。基于 ${usable.length} 堂课、约 ${chars} 字的转写，${pacePhrase}这份画像只描述可观察的讲课方式，不对老师本人作评价。`,
    280,
  );

  const strengths = [];
  if (structureCues >= 3) uniquePush(strengths, "讲解有明确主线，概念、案例与结论之间的连接容易被复述。");
  if (exampleCues >= 2) uniquePush(strengths, "善用案例把抽象概念拉回具体情境，便于理解。");
  if (theoryCues >= 3) uniquePush(strengths, "概念与理论信息密度高，适合建立完整的知识框架。");
  if (emphasisCues >= 2) uniquePush(strengths, "会明确提示重点与转折，听课时容易抓住关键句。");
  if (interactionCues >= 3) uniquePush(strengths, "常抛出问题引导思考，适合把被动听讲变成主动回答。");
  for (const fallback of [
    "课堂信息组织连贯，适合用结构化笔记同步记录。",
    "老师会留下可继续追问的概念与案例。",
  ]) {
    if (strengths.length >= 3) break;
    uniquePush(strengths, fallback);
  }

  const attentionPoints = [];
  if (paceReliable && charsPerMinute >= 230) {
    uniquePush(attentionPoints, "信息密度偏高，不要为了抄完整句子而错过下一段。");
  }
  if (exampleCues < 2) uniquePush(attentionPoints, "举例较少，建议把每个核心概念映射到一个熟悉场景。");
  if (structureCues < 3) uniquePush(attentionPoints, "段落转折较隐含，建议用问题或时间段主动给笔记分段。");
  if (emphasisCues < 2) uniquePush(attentionPoints, "重点不一定被反复强调，需要用关键词和结论句自行提炼。");
  for (const fallback of [
    "不要只保存录音，当天用几分钟把结构复述一遍。",
    "遇到没听懂的概念，先记下问题，课后用随堂问答或回听解决。",
  ]) {
    if (attentionPoints.length >= 3) break;
    uniquePush(attentionPoints, fallback);
  }

  const before = [
    "用 3–5 分钟浏览本节课的核心概念，带着一个具体问题进课堂。",
  ];
  if (theoryCues >= 3) uniquePush(before, "先看一眼定义和关键词，降低首次听到理论时的理解负担。");
  uniquePush(before, "把「概念—例子—结论」三栏笔记的框架先画好，减少课堂中切换工具的时间。");

  const during = [
    "优先记录逻辑连接词和结论，不必逐字抄写老师原话。",
    "听到「比如、因此、关键是」时做标记，它们通常是理解或复习的锚点。",
  ];
  if (interactionCues >= 3) uniquePush(during, "老师抛出问题时，先写下自己的答案，再听老师的回应。");
  if (paceReliable && charsPerMinute >= 230) {
    uniquePush(during, "节奏较快时使用缩写和关键词，课后 24 小时内再补全。");
  }

  const after = [
    "24 小时内用一张白纸复述本课结构，再对照转写补上遗漏。",
    "挑一个课堂案例，用自己的话换成另一个场景重讲一遍。",
    "把纪要里的「值得追问」挑一个问题，回到随堂问答继续追问。",
  ];

  const evidence = [];
  for (const item of texts.slice(0, 3)) {
    const localSentences = splitSentences(item.text);
    const quote =
      localSentences.find((sentence) =>
        /比如|例如|重点|关键|首先|其次|最后|换句话说|总结/.test(sentence),
      ) || localSentences[0];
    if (quote) uniquePush(evidence, `《${item.title}》：「${trimTo(quote, 82)}」`);
    if (evidence.length >= 3) break;
  }

  return {
    teacher: course.teacher,
    summary,
    tags: tags.slice(0, 5),
    dimensions: dimensionList,
    strengths: strengths.slice(0, 4),
    attentionPoints: attentionPoints.slice(0, 4),
    noteStrategy: "推荐三栏笔记：左栏写概念与关键词，中栏写老师的例子或原话，右栏留给自己的疑问和下一步行动。",
    advice: { before, during, after },
    evidence,
    source: "local",
    confidence: profileConfidence(usable.length, chars),
    lectureCount: usable.length,
    segmentCount: usable.reduce(
      (sum, lecture) => sum + (lecture.segments?.length || 0),
      0,
    ),
    transcriptChars: chars,
    durationSeconds,
    updatedAt: new Date().toISOString(),
  };
}

export function answerLocally(question, text, note) {
  const clean = cleanText(text);
  const sentences = splitSentences(clean);
  const normalizedQuestion = String(question || "").trim();
  const wantsSummary = /(刚才|刚刚|总结|重点|讲了什么|说了什么|回顾)/.test(normalizedQuestion);

  if (!sentences.length) {
    return "课堂还没有转写内容。开始录音并说话后，我就能结合课堂内容回答你的问题。";
  }

  if (wantsSummary) {
    const points = Array.isArray(note?.keyPoints) ? note.keyPoints.slice(-3) : [];
    const latest = sentences.slice(-2).join("");
    return [
      "根据目前的课堂转写，重点是：",
      ...(points.length ? points.map((point) => `· ${point}`) : [`· ${trimTo(latest, 100)}`]),
      "",
      "这是本地转写摘要；在「设置」里接入自己的大模型 API 后，可以进行更完整的归纳和推理。",
    ].join("\n");
  }

  const terms = queryTerms(normalizedQuestion);
  const ranked = sentences
    .map((sentence, index) => {
      let score = 0;
      for (const term of terms) {
        if (sentence.includes(term)) score += 2.4;
      }
      for (const keyword of note?.keywords || []) {
        if (terms.includes(keyword) && sentence.includes(keyword)) score += 1.2;
      }
      if (/[。！？!?]/.test(sentence)) score += 0.1;
      return { sentence, index, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .sort((a, b) => a.index - b.index);

  if (!ranked.length) {
    const fallback = sentences.slice(-2).join("");
    return [
      "课堂转写里暂时没有直接提到这一点。",
      fallback ? `刚才讲到的内容是：「${trimTo(fallback, 140)}」` : "",
      "",
      "你可以换一个更贴近课堂内容的关键词再问，或者在「设置」中接入自己的大模型 API，获得基于课堂上下文的推理式回答。",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "我在课堂转写里找到了这些相关表述：",
    "",
    ...ranked.map(({ sentence }) => `· ${trimTo(sentence, 150)}`),
    "",
    "以上是本地转写检索结果；接入自己的大模型 API 后，我会进一步解释概念之间的关系。",
  ].join("\n");
}
