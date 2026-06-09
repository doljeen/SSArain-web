import { mainMock } from "../../../data/mainMock.js";

// mock 데이터를 state에 넣기 전에 깊은 복사해서 원본이 변경되지 않게 합니다.
export const clone = (value) => JSON.parse(JSON.stringify(value));

// WAS의 flat topic 응답(tid, pid, name)을 화면에서 쓰는 tree 구조로 바꿉니다.
export const buildTopicTree = (topics) => {
  const normalized = topics.map((topic) => ({
    id: topic.tid,
    pid: topic.pid,
    name: topic.name,
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
  return roots.length ? roots : clone(mainMock.topics);
};

// tree 구조의 Topic을 현재 Topic 검색/클러스터 계산에 쓰기 쉬운 flat 배열로 펼칩니다.
export const flattenTopics = (topics) => topics.flatMap((topic) => [topic, ...(topic.children || [])]);

// 활동 타입에 따라 오른쪽 Recent Activity 아이콘을 선택합니다.
export const getActivityIcon = (type) => ({
  published: "file",
  commented: "bell",
  created: "folder"
}[type] || "file");
