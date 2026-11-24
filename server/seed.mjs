import crypto from "node:crypto";
import { hashPassword } from "./auth.mjs";
import { buildTeacherProfileLocal } from "./analyzer.mjs";

function daysAgo(days, hour = 14, minute = 10) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function makeNote(summary, keyPoints, keywords, questions, updatedAt) {
  return {
    summary,
    keyPoints,
    keywords,
    questions,
    updatedAt,
    source: "demo",
  };
}

function segmentList(items) {
  return items.map(([text, at]) => ({
    id: crypto.randomUUID(),
    text,
    at,
  }));
}

/**
 * A deliberately small, readable demo account. It is only seeded when the
 * demo user does not exist, so deleting sample courses will not recreate them.
 */
export async function seedDemo(store) {
  if (store.db.users.some((user) => user.username === "demo")) return;

  const password = hashPassword("demo1234");
  const user = {
    id: crypto.randomUUID(),
    username: "demo",
    displayName: "林知夏",
    passwordHash: password.hash,
    salt: password.salt,
    createdAt: daysAgo(34, 9, 0),
    isDemo: true,
    settings: {
      llm: {
        provider: "deepseek",
        baseUrl: "",
        model: "",
        apiKeyEnc: "",
        apiKeyLast4: "",
      },
    },
  };

  const madeAt = new Date().toISOString();

  const courses = [
    {
      id: crypto.randomUUID(),
      userId: user.id,
      name: "认知心理学",
      teacher: "周未",
      color: "#027789",
      createdAt: daysAgo(34, 9, 30),
      updatedAt: daysAgo(1, 16, 20),
    },
    {
      id: crypto.randomUUID(),
      userId: user.id,
      name: "传播学概论",
      teacher: "陈砚",
      color: "#D97757",
      createdAt: daysAgo(28, 10, 0),
      updatedAt: daysAgo(3, 15, 40),
    },
    {
      id: crypto.randomUUID(),
      userId: user.id,
      name: "城市社会学",
      teacher: "许川",
      color: "#2D6CDF",
      createdAt: daysAgo(22, 14, 0),
      updatedAt: daysAgo(7, 17, 10),
    },
    {
      id: crypto.randomUUID(),
      userId: user.id,
      name: "产品设计方法",
      teacher: "唐棠",
      color: "#7A5AF8",
      createdAt: daysAgo(19, 11, 0),
      updatedAt: daysAgo(12, 16, 30),
    },
  ];

  const [psychology, communication, city, design] = courses;

  const lectures = [
    {
      id: crypto.randomUUID(),
      userId: user.id,
      courseId: psychology.id,
      title: "记忆的重构：我们为何记不住细节",
      status: "completed",
      startedAt: daysAgo(1, 14, 0),
      endedAt: daysAgo(1, 14, 52),
      durationSec: 3120,
      createdAt: daysAgo(1, 13, 56),
      segments: segmentList([
        [
          "今天我们来讨论记忆的重构。很多同学会以为记忆像录像机，把发生过的事情原样保存下来，但心理学的研究发现，记忆其实更像是一个不断被重建的过程。",
          78,
        ],
        [
          "巴特利特在一九三二年做过一个很经典的实验，他让被试阅读一个陌生的民间故事，然后在不同时间复述。结果大家会不自觉地删掉自己不熟悉的部分，用自己的文化经验补上合理的情节。",
          246,
        ],
        [
          "所以回忆并不是提取一个固定文件，而是每次都在当前的情境、动机和知识背景下重新拼装。",
          421,
        ],
        [
          "这里有两个关键词：图式，以及重构。图式是我们理解世界时使用的一套心理框架，它帮助我们快速加工信息，但也会带来系统性偏差。",
          638,
        ],
        [
          "比如目击者证词。两个人看到同一场车祸，一个人被问车速有多快，另一个人被问车撞得有多猛，后者的速度估计往往更高。提问方式改变了记忆的重构。",
          912,
        ],
        [
          "这对学习有一个很直接的启发：与其反复阅读，不如进行提取练习。合上书，用自己的话复述，再对照原文修正，这样形成的记忆更牢固。",
          1460,
        ],
        [
          "下一节课我们会讲遗忘曲线，以及间隔重复为什么有效。大家可以先想一想，自己最近一次记错事情，是因为遗漏，还是因为补上了不存在的信息。",
          1822,
        ],
      ]),
      note: makeNote(
        "记忆不是对过去事件的忠实回放，而是一个会受图式、情境和提问方式影响的重构过程；学习时应优先使用提取练习，而不是反复阅读。",
        [
          "记忆更像不断被重建的过程，而不是原样保存的录像。",
          "巴特利特的故事复述实验说明，人们会用已有文化经验补全不熟悉的信息。",
          "图式帮助快速加工信息，同时也会造成系统性的记忆偏差。",
          "目击者证词中的提问措辞会改变速度估计，说明记忆可被事后暗示重塑。",
          "提取练习比反复阅读更能形成牢固记忆，下一节将讨论遗忘曲线与间隔重复。",
        ],
        ["记忆重构", "图式", "巴特利特实验", "目击者证词", "提取练习", "间隔重复"],
        [
          "图式带来的偏差可以怎样被减少？",
          "为什么提取练习比反复阅读更有效？",
          "目击者证词在司法实践中应该如何被审慎使用？",
        ],
        daysAgo(1, 14, 52),
      ),
      chat: [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "老师说的“图式”到底是什么意思？能结合例子讲一下吗？",
          createdAt: daysAgo(1, 14, 23),
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "在这个课堂语境里，图式可以理解成我们理解世界时使用的一套心理框架。它像一张提前准备好的解释模板，帮助我们快速处理新信息。\n\n老师举的目击者证词例子很典型：两个人看到同一场车祸，但被问到“车开得多快”和“车撞得多猛”时，后者的速度估计更高。这里，提问中的“撞”激活了更剧烈的图式，于是记忆在重构时被带偏了。\n\n所以图式的好处是加工快，代价是可能把“符合框架”的细节自动补进去，哪怕它并没有真的发生。",
          createdAt: daysAgo(1, 14, 23),
          source: "demo",
        },
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "那复习的时候具体怎么做提取练习？",
          createdAt: daysAgo(1, 14, 41),
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "可以按老师提到的闭环来做：\n\n1. 合上书，用一张白纸写下你能回忆出的概念、实验和它们之间的关系。\n2. 对照课堂笔记或原文，用另一种颜色补上遗漏和错误。\n3. 隔一天再回忆一次，只重点重做上次卡住的部分。\n\n关键不是“再读一遍”，而是先产生一次完整的提取，再获得反馈。这样你才能发现自己究竟是没记住，还是记成了另一个版本。",
          createdAt: daysAgo(1, 14, 41),
          source: "demo",
        },
      ],
    },
    {
      id: crypto.randomUUID(),
      userId: user.id,
      courseId: communication.id,
      title: "算法如何重塑我们的注意力",
      status: "completed",
      startedAt: daysAgo(3, 14, 0),
      endedAt: daysAgo(3, 14, 48),
      durationSec: 2912,
      createdAt: daysAgo(3, 13, 58),
      segments: segmentList([
        [
          "我们常说媒介即讯息，这句话放到算法时代依然有效。平台不只是把内容送到你面前，它还在决定什么样的内容更容易被看见。",
          64,
        ],
        [
          "传统大众媒体的商业模式是二次售卖，把受众的注意力卖给广告商。平台继承了这一点，但它拥有更精细的测量和反馈回路。",
          212,
        ],
        [
          "每一次停留、点赞、划走，都会成为下一次推荐的材料。注意力不再只是一个心理状态，它被拆成了可以计算的行为指标。",
          405,
        ],
        [
          "这带来一个悖论：用户以为自己在自由选择，但选项本身已经被个性化排序。我们需要区分“选择的自由”和“被设计的选择集”。",
          768,
        ],
        [
          "算法并不需要理解内容的意义，它只需要预测哪种内容能延长停留。所以情绪强烈、立场鲜明的内容往往更容易获得传播优势。",
          1024,
        ],
        [
          "下课前留一个问题：如果平台把用户的长期福祉纳入目标函数，推荐系统会发生什么变化？",
          1580,
        ],
      ]),
      note: makeNote(
        "平台通过精细的行为反馈回路决定内容可见性，注意力被量化为可计算指标；个性化排序在提供便利的同时，也重新设计了用户的选择集。",
        [
          "算法时代的“媒介即讯息”：平台不仅分发内容，也决定什么内容更容易被看见。",
          "平台继承大众媒体的注意力售卖模式，但拥有更精细的实时测量与反馈回路。",
          "停留、点赞、划走等行为被转化为训练推荐系统的材料。",
          "要区分“选择的自由”与“被设计的选择集”，个性化排序本身就在塑造偏好。",
          "算法优化停留时长，可能放大情绪强烈、立场鲜明的内容，而非最有价值的内容。",
        ],
        ["算法推荐", "注意力经济", "媒介即讯息", "选择集", "反馈回路", "平台"],
        [
          "“被设计的选择集”与信息茧房是什么关系？",
          "如果平台以长期福祉为目标，推荐指标应该如何改变？",
          "算法不需要理解内容意义，这会带来哪些伦理风险？",
        ],
        daysAgo(3, 14, 48),
      ),
      chat: [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "老师说的“二次售卖”和平台模式有什么区别？",
          createdAt: daysAgo(3, 14, 18),
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "老师的意思是，平台继承了大众媒体“把受众注意力卖给广告商”的底层逻辑，但把测量和分发做得更细。\n\n传统媒体的二次售卖更像按版面、时段做粗略打包；平台则能记录每一次停留和互动，并用这些反馈实时调整下一次推荐。也就是说，平台不只是卖注意力，还在参与生产注意力。",
          createdAt: daysAgo(3, 14, 18),
          source: "demo",
        },
      ],
    },
    {
      id: crypto.randomUUID(),
      userId: user.id,
      courseId: city.id,
      title: "街道、公共空间与陌生人社会",
      status: "completed",
      startedAt: daysAgo(7, 15, 0),
      endedAt: daysAgo(7, 15, 39),
      durationSec: 2385,
      createdAt: daysAgo(7, 14, 58),
      segments: segmentList([
        [
          "城市生活的一个重要特征，是我们每天都要和大量陌生人共处。街道就是这种陌生人社会最日常的舞台。",
          58,
        ],
        [
          "雅各布斯在《美国大城市的死与生》里提出，街道的安全并不主要来自警察，而是来自沿街店铺、行人以及持续的目光，这是一种非正式的公共监督。",
          236,
        ],
        [
          "所以公共空间不是剩下的空地，而是由使用方式、边界和日常互动共同生产出来的。",
          488,
        ],
        [
          "当街道被过度功能化，比如全部变成封闭小区和车行道，陌生人之间可停留、可观察的接触面就会减少。",
          712,
        ],
      ]),
      note: makeNote(
        "街道是城市陌生人社会的重要舞台，公共空间由日常使用共同生产；沿街店铺与持续的人流构成非正式监督，过度功能化则会削弱公共生活。",
        [
          "城市生活要求人们持续与陌生人共处，街道是最日常的公共舞台。",
          "雅各布斯认为街道安全来自沿街店铺、行人和持续目光形成的非正式监督。",
          "公共空间不是剩余空地，而是由使用方式、边界与日常互动共同生产。",
          "封闭小区和纯车行化会减少陌生人之间可停留、可观察的接触面。",
        ],
        ["陌生人社会", "街道", "公共空间", "雅各布斯", "非正式监督"],
        ["非正式监督在现代封闭社区中还成立吗？", "公共空间的设计如何影响陌生人之间的信任？"],
        daysAgo(7, 15, 39),
      ),
      chat: [],
    },
    {
      id: crypto.randomUUID(),
      userId: user.id,
      courseId: design.id,
      title: "设计调研：从观察到洞察",
      status: "completed",
      startedAt: daysAgo(12, 14, 0),
      endedAt: daysAgo(12, 14, 44),
      durationSec: 2648,
      createdAt: daysAgo(12, 13, 57),
      segments: segmentList([
        [
          "调研不是收集尽可能多的信息，而是带着一个可被推翻的假设去观察。没有问题的访谈，最后只会得到一堆无法行动的引语。",
          62,
        ],
        [
          "观察和访谈要分开记录：前者记录发生了什么，后者记录对方如何解释。把事实和解释混在一起，是新手最常犯的错误。",
          304,
        ],
        [
          "从观察到洞察，中间要经过模式识别。至少看到三次相似的行为，才值得把它称为一个模式。",
          560,
        ],
        [
          "好的洞察通常包含张力：用户想要 A，但现实约束让他只能做 B。设计的价值就藏在 A 和 B 之间。",
          844,
        ],
      ]),
      note: makeNote(
        "设计调研应从可被推翻的假设出发，分开记录可观察事实与用户解释，通过重复模式提炼洞察；真正有价值的洞察往往来自用户愿望与现实约束之间的张力。",
        [
          "调研不是信息收集，而是带着可被推翻的假设去观察。",
          "观察记录事实，访谈记录解释，两者混在一起会污染判断。",
          "至少出现三次的相似行为才值得被称为模式。",
          "好的洞察包含张力：用户想要什么，现实又允许他做什么。",
        ],
        ["设计调研", "假设", "观察", "访谈", "模式识别", "洞察"],
        ["如何判断一个模式是否值得转化为设计机会？", "访谈中怎样避免把用户的解释当成事实？"],
        daysAgo(12, 16, 30),
      ),
      chat: [],
    },
  ];

  for (const course of courses) {
    const courseLectures = lectures.filter((lecture) => lecture.courseId === course.id);
    course.teacherProfile = buildTeacherProfileLocal(course, courseLectures);
    course.teacherProfileUpdatedAt = course.teacherProfile.updatedAt;
  }

  await store.update((db) => {
    db.users.push(user);
    db.courses.push(...courses);
    db.lectures.push(...lectures);
    db.meta = { ...(db.meta || {}), seededAt: madeAt };
  });

  console.log("[seed] 已创建演示账号 demo / demo1234");
}
