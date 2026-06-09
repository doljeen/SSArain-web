// WAS 연결 전이나 API 요청 실패 시 메인 화면의 기본 상태입니다.
// 첫 화면은 사용자가 Brain/Topic을 만들거나 찾기 전까지 비어 있어야 하므로 목록 데이터를 넣지 않습니다.
export const mainMock = {
  // 오른쪽/왼쪽 하단에 표시되는 현재 사용자 기본값입니다.
  user: {
    name: "서진",
    role: "Product Owner"
  },
  // 기본값은 아무 Brain/Topic도 선택되지 않은 상태로 둡니다.
  activeBrainId: null,
  activeTopicId: null,
  brains: [],
  topics: [],
  nodes: [],
  notifications: [],
  activities: []
};
