import { endpoints } from "../../../api/endpoints.js";

// MainModal에 표시할 제목/설명/입력 필드/확인 버튼 endpoint를 만듭니다.
// activeTopic과 user 값은 현재 화면 상태에 따라 동적으로 바뀝니다.
export const createModalCopy = ({ activeTopic, user }) => ({
  // Brain 생성 모달입니다. 현재 화면에서는 전용 생성 페이지로 이동해서 처리합니다.
  createBrain: {
    title: "Create Brain",
    description: "Brain 생성 페이지에서 WAS Brain 생성 API로 처리합니다.",
    primary: "Brain 생성",
    endpoint: endpoints.brains.create,
    fields: ["Brain 이름", "첫 Topic 이름"]
  },
  // Brain 검색 모달입니다. WAS Brain 검색 API에 연결됩니다.
  findBrain: {
    title: "Find Brain",
    description: "검색어와 일치하는 Brain을 조회합니다.",
    primary: "검색",
    endpoint: endpoints.brains.list,
    fields: ["검색어"]
  },
  // Topic 생성 모달입니다. 현재 선택 Topic의 하위 Topic 생성 endpoint에 연결됩니다.
  createTopic: {
    title: "Create Topic",
    description: activeTopic ? `${activeTopic.name} 하위에 새 Topic을 생성합니다.` : "새 Topic을 생성합니다.",
    primary: "Topic 생성",
    endpoint: endpoints.topics.create(activeTopic?.id),
    fields: ["Topic 이름"]
  },
  // 마이페이지 모달입니다. WAS /user 응답으로 받은 사용자 정보를 보여줍니다.
  mypage: {
    title: "My Page",
    description: "WAS /api/v1/user 응답 기준으로 표시합니다.",
    primary: "프로필 보기",
    endpoint: endpoints.users.me,
    fields: [
      `이름: ${user.name || "Admin User"}`,
      `이메일: ${user.email || "admin@synapse.io"}`,
      `권한: ${user.role || "USER"}`
    ]
  },
  // 그래프 사용 도움말 모달입니다.
  help: {
    title: "Help",
    description: "Synapse View에서는 중앙 Topic과 연결된 Node를 탐색합니다.",
    primary: "확인",
    endpoint: "/help",
    fields: ["Node 클릭: 상세 이동", "Post List: 문서 목록 보기"]
  }
});
