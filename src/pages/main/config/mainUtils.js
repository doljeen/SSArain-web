import { mainMock } from "../../../data/mainMock.js";

// mock 데이터를 state에 넣기 전에 깊은 복사해서 원본이 변경되지 않게 합니다.
export const clone = (value) => JSON.parse(JSON.stringify(value));

const toBoolean = (value) => value === true || value === "true" || value === 1 || value === "1";

const markAncestorUsing = (topics) => topics.map((topic) => {
  const children = markAncestorUsing(topic.children || []);
  const hasVisibleChild = children.some((child) => child.isUsing);
  return { ...topic, children, isUsing: toBoolean(topic.isUsing) || hasVisibleChild };
});

// WAS Brain DTO(id, name, description)를 화면의 Brain 항목으로 정규화합니다.
export const normalizeBrain = (brain) => ({
  id: String(brain.id),
  name: brain.name,
  description: brain.description || "",
  joinPolicy: brain.joinPolicy || "PROTECTED",
  role: brain.role || brain.memberRole || brain.brainRole || "",
  owner: brain.adminName || "나",
  members: Array.isArray(brain.memberNames) ? brain.memberNames.length : 1,
  topicsCount: Array.isArray(brain.topics) ? brain.topics.length : 0
});

// WAS NodeInfoDto(nid, title, content)를 그래프/Post List에서 쓰는 노드 형태로 정규화합니다.
export const normalizeNodes = (nodes = []) => nodes.map((node) => ({
  id: String(node.nid),
  title: node.title,
  content: node.content,
  writer: node.writer || "",
  createdAt: node.createdAt || "",
  comments: node.commentCount ?? node.commentsCount ?? node.comments?.length ?? node.comments ?? 0,
  recommends: node.recommends ?? node.likeCount ?? 0
}));

export const normalizeComments = (comments = []) => comments.filter(Boolean).map((comment) => ({
  id: String(comment.cid),
  parentId: comment.pid == null ? null : String(comment.pid),
  writer: comment.writer || "작성자",
  content: comment.content || "",
  createdAt: comment.createdAt || ""
}));

export const normalizeNodeDetail = (node = {}) => ({
  id: String(node.nid),
  title: node.title || "",
  content: node.content || "",
  writer: node.writer || "작성자",
  createdAt: node.createdAt || "",
  comments: normalizeComments(node.comments || []),
  recommends: node.recommends ?? node.likeCount ?? 0,
  liked: toBoolean(node.liked)
});

// WAS Quiz DTO(qid, question, explanation, options)를 화면에서 채점하기 쉬운 형태로 정리합니다.
export const normalizeQuizzes = (quizzes = []) => quizzes.filter(Boolean).map((quiz, quizIndex) => {
  const quizId = quiz.qid ?? quiz.id ?? quizIndex;
  return {
    id: String(quizId),
    question: quiz.question || "",
    explanation: quiz.explanation || "",
    options: (quiz.options || []).filter(Boolean).map((option, optionIndex) => ({
      id: `${quizId}-${optionIndex}`,
      text: option.option || option.text || "",
      isCorrect: toBoolean(option.isCorrect ?? option.correct)
    }))
  };
});

// WAS U01 응답은 { user: { email, name, role }, summary } 구조이고,
// 로그인 응답은 { email, name } 구조라서 화면에서 쓰는 형태로 맞춥니다.
export const normalizeUserInfo = (userInfo = {}) => {
  const profile = userInfo.user || userInfo;
  return {
    name: profile.name || "사용자",
    email: profile.email || "",
    role: profile.role || "USER",
    summary: userInfo.summary || {
      nodeCount: 0,
      commentCount: 0,
      likeCount: 0
    }
  };
};

// WAS의 flat topic 응답(tid, pid, name)을 화면에서 쓰는 tree 구조로 바꿉니다.
export const buildTopicTree = (topics) => {
  const normalized = topics.map((topic) => ({
    id: String(topic.tid),
    btid: topic.btid == null ? null : String(topic.btid),
    pid: topic.pid == null ? null : String(topic.pid),
    name: topic.name,
    isUsing: topic.isUsing == null && topic.using == null ? topic.btid != null : toBoolean(topic.isUsing ?? topic.using),
    children: []
  }));
  const byId = new Map(normalized.map((topic) => [topic.id, topic]));
  const roots = [];

  normalized.forEach((topic) => {
    if (topic.pid != null && byId.has(topic.pid)) {
      byId.get(topic.pid).children.push(topic);
      return;
    }
    roots.push(topic);
  });

  // 루트가 없으면 첫 화면 요구사항에 맞게 빈 Topic 목록을 유지합니다.
  return roots.length ? markAncestorUsing(roots) : clone(mainMock.topics);
};

// tree 구조의 Topic을 현재 Topic 검색/클러스터 계산에 쓰기 쉬운 flat 배열로 펼칩니다.
export const flattenTopics = (topics) => topics.flatMap((topic) => [topic, ...flattenTopics(topic.children || [])]);

// 활동 타입에 따라 오른쪽 Recent Activity 아이콘을 선택합니다.
export const getActivityIcon = (type) => ({
  published: "file",
  commented: "bell",
  created: "folder"
}[type] || "file");
