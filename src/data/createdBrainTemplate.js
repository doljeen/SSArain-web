// Brain 생성 후 메인 화면에서 노드가 보이도록 채워 넣는 초기 화면 데이터입니다.
// WAS에서 Brain/Topic/Node 목록 API가 완성되면 이 임시 템플릿 대신 실제 응답을 사용하면 됩니다.
export const createBrainWorkspace = ({ id, name, description, joinPolicy, members = [] }) => ({
  activeBrainId: id,
  activeTopicId: "topic-database",
  brains: [
    {
      id,
      name,
      description,
      joinPolicy,
      owner: "나",
      members: members.length + 1,
      topicsCount: 4
    }
  ],
  topics: [
    {
      id: "topic-architecture",
      name: "Architecture",
      children: [
        { id: "topic-microservices", name: "Microservices" },
        { id: "topic-monorepo", name: "Monorepo" }
      ]
    },
    {
      id: "topic-frontend",
      name: "Frontend Guild",
      children: [
        { id: "topic-react", name: "React Patterns" },
        { id: "topic-state", name: "State Management" }
      ]
    },
    {
      id: "topic-backend",
      name: "Backend Guild",
      children: [
        { id: "topic-database", name: "Database Design" },
        { id: "topic-cache", name: "Caching Strategy" }
      ]
    },
    {
      id: "topic-devops",
      name: "DevOps & Infra",
      children: [
        { id: "topic-cicd", name: "CI/CD Pipelines" }
      ]
    }
  ],
  nodes: [
    { id: "node-1", title: "정규화 기준", comments: 6 },
    { id: "node-2", title: "트랜잭션 격리", comments: 2 },
    { id: "node-3", title: "인덱스 설계", comments: 9 },
    { id: "node-4", title: "읽기 모델", comments: 1 },
    { id: "node-5", title: "샤딩", comments: 5 },
    { id: "node-6", title: "마이그레이션", comments: 4 },
    { id: "node-7", title: "백업 정책", comments: 7 },
    { id: "node-8", title: "쿼리 최적화", comments: 3 },
    { id: "node-9", title: "스키마 리뷰", comments: 8 },
    { id: "node-10", title: "CDC", comments: 1 },
    { id: "node-11", title: "관계 모델", comments: 2 },
    { id: "node-12", title: "NoSQL 비교", comments: 5 },
    { id: "node-13", title: "ERD 작성", comments: 4 },
    { id: "node-14", title: "운영 체크", comments: 6 }
  ],
  notifications: [],
  activities: []
});
