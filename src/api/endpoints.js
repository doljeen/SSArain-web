// WAS API 기본 주소입니다.
// 개발 서버에서는 Vite proxy가 /api 요청을 실제 WAS로 넘기고,
// 필요하면 index.html에서 window.__API_BASE_URL__로 다른 서버 주소를 덮어쓸 수 있습니다.
export const API_BASE_URL = window.__API_BASE_URL__ || "/api/v1";

// query string이 필요한 엔드포인트를 만들 때 사용합니다.
const query = (params) => new URLSearchParams(params).toString();

// 화면에서 사용하는 WAS 엔드포인트를 기능별로 모아둔 객체입니다.
export const endpoints = {
  // 로그인, 회원가입, 이메일 인증 관련 엔드포인트입니다.
  auth: {
    login: "/auth/login",
    signup: "/auth/signup",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    emailRequest: "/auth/email/request",
    emailVerify: "/auth/email/verify"
  },
  // 사용자 정보 조회와 이름 중복 확인 엔드포인트입니다.
  users: {
    me: "/user",
    nameCheck: "/user/name-check"
  },
  // Brain 관련 엔드포인트입니다. 일부는 이후 페이지 구현을 위해 미리 정리해둔 상태입니다.
  brains: {
    mine: "/brains/me",
    list: "/brains",
    search: (name = "", page = 0, size = 9) => `/brains?${query({ name, page, size })}`,
    nameCheck: (name) => `/brains/check-name?${query({ name })}`,
    create: "/brains",
    update: (brainId) => `/brains/${brainId}`,
    join: (brainId) => `/brains/${brainId}/join`,
    addUsers: (brainId) => `/brains/${brainId}/users`,
    removeUsers: (brainId) => `/brains/${brainId}/users`,
    availableUsers: (brainId, keyword = "", page = 0, size = 9) => `/brains/${brainId}/available-users?${query({ keyword, page, size })}`,
    joinRequests: (brainId, page = 0, size = 9) => `/brains/${brainId}/join-requests?${query({ page, size })}`,
    manageJoin: (brainId) => `/brains/${brainId}/join-manage`,
    members: (brainId, page = 0, size = 9) => `/brains/${brainId}/users?${query({ page, size })}`,
    registerTopics: (brainId) => `/brains/${brainId}/topics`,
    topics: (brainId) => `/brains/${brainId}/topics`,
    topicDetail: (brainId, topicId) => `/brains/${brainId}/topics/${topicId}`
  },
  // Topic 트리 조회/상세/생성/수정/삭제 엔드포인트입니다.
  topics: {
    list: (brainId) => `/topics${brainId ? `?${query({ brain: brainId })}` : ""}`,
    children: (topicId, brainId) => `/topics/${topicId}/child${brainId ? `?${query({ brain: brainId })}` : ""}`,
    detail: (topicId) => `/topics/${topicId}`,
    create: (parentTopicId) => parentTopicId == null ? "/topics" : `/topics/${parentTopicId}`,
    update: (topicId) => `/topics/${topicId}`,
    remove: (topicId) => `/topics/${topicId}`
  },
  // Node 미리보기/상세/생성/수정/삭제 엔드포인트입니다.
  nodes: {
    preview: (brainTopicId) => `/neurons/preview/${brainTopicId}`,
    detail: (nodeId) => `/neurons/${nodeId}`,
    create: "/neurons",
    update: (nodeId) => `/neurons/${nodeId}`,
    remove: (nodeId) => `/neurons/${nodeId}`
  },
  // 댓글 관련 엔드포인트입니다.
  comments: {
    create: "/comments",
    update: (commentId) => `/comments/${commentId}`,
    remove: (commentId) => `/comments/${commentId}`
  },
  // 퀴즈 관련 엔드포인트입니다.
  quizzes: {
    list: (brainTopicId) => `/quizzes?${query({ btid: brainTopicId })}`,
    create: (brainTopicId) => `/quizzes?${query({ btid: brainTopicId })}`
  },
  // 알림 API는 WAS에 연결되면 list 경로를 채울 예정입니다.
  notifications: {
    list: null
  }
};

// API 명세서 코드와 HTTP method를 보관합니다. 디버깅/문서화용 메타데이터입니다.
export const endpointMeta = {
  auth: {
    login: { code: "A01", method: "POST" },
    signup: { code: "A02", method: "POST" },
    refresh: { code: "A03", method: "GET" },
    logout: { code: "A04", method: "POST" },
    emailRequest: { code: "A05", method: "POST" },
    emailVerify: { code: "A06", method: "POST" }
  },
  brains: {
    mine: { code: "B04", method: "GET" },
    list: { code: "B05", method: "GET" },
    create: { code: "B06", method: "POST" },
    nameCheck: { code: "B13", method: "GET" },
    join: { code: "B01", method: "POST" },
    addUsers: { code: "B02", method: "POST" },
    removeUsers: { code: "B03", method: "DELETE" },
    availableUsers: { code: "B12", method: "GET" },
    joinRequests: { code: "B14", method: "GET" },
    manageJoin: { code: "B15", method: "POST" },
    registerTopics: { code: "B09", method: "POST" },
    topics: { code: "B10", method: "GET" },
    topicDetail: { code: "B16", method: "GET" },
    members: { code: "B17", method: "GET" }
  },
  topics: {
    list: { code: "T01", method: "GET" },
    children: { code: "T02", method: "GET" },
    detail: { code: "T03", method: "GET" },
    create: { code: "T04", method: "POST" },
    update: { code: "T05", method: "PATCH" },
    remove: { code: "T06", method: "DELETE" }
  },
  nodes: {
    preview: { code: "N01", method: "GET" },
    detail: { code: "N02", method: "GET" },
    create: { code: "N03", method: "POST" },
    update: { code: "N04", method: "PATCH" },
    remove: { code: "N05", method: "DELETE" }
  },
  comments: {
    create: { code: "C01", method: "POST" },
    update: { code: "C02", method: "PATCH" },
    remove: { code: "C03", method: "DELETE" }
  },
  quizzes: {
    list: { code: "Q01", method: "GET" },
    create: { code: "Q02", method: "POST" }
  },
  users: {
    me: { code: "U01", method: "GET" },
    nameCheck: { code: "U03", method: "POST" }
  },
  notifications: {
    list: { code: "NO01", method: null }
  }
};
