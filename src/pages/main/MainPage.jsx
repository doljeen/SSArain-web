import { useEffect, useMemo, useRef, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, isAuthError } from "../../api/client.js";
import { endpoints } from "../../api/endpoints.js";
import { guestPreview } from "../../data/guestPreview.js";
import { getCurrentRoute, routeTo, ROUTE_EVENTS, syncDocumentRoute } from "../../shared/router/routes.js";
import BrainManagerPanel from "./components/BrainManagerPanel.jsx";
import InsightsPanel from "./components/InsightsPanel.jsx";
import MainModal from "./components/MainModal.jsx";
import Sidebar from "./components/Sidebar.jsx";
import TopicManagerPanel from "./components/TopicManagerPanel.jsx";
import Workspace from "./components/Workspace.jsx";
import { createModalCopy } from "./config/modalConfig.js";
import { buildTopicTree, clone, flattenTopics, normalizeBrain, normalizeComments, normalizeNodeDetail, normalizeNodes, normalizeQuizzes, normalizeUserInfo } from "./config/mainUtils.js";
import { collectTopicLayoutPoints } from "./config/topicLayout.js";

// SSArain의 메인 페이지 컨트롤러입니다.
// 왼쪽 Sidebar, 중앙 Workspace, 오른쪽 InsightsPanel에 필요한 상태와 API 호출을 이 파일에서 조율합니다.

// 브라우저 저장소에 남겨둘 UI/세션 상태 key입니다.
const CREATED_WORKSPACE_KEY = "ssarain-created-workspace";
const AUTH_STATE_KEY = "ssarain-authenticated";
const QUIZ_GENERATION_COUNTS_KEY = "ssarain-quiz-generation-counts";
const SIDEBAR_WIDTH_KEY = "ssarain-sidebar-width";
const QUIZ_GENERATION_LIMIT = 2;
const MIN_SIDEBAR_WIDTH = 292;
const MAX_SIDEBAR_WIDTH = 520;
const MIN_GRAPH_SCALE = 0.12;
const MAX_GRAPH_SCALE = 2.2;
const MAX_GRAPH_PAN_X = 3200;
const MAX_GRAPH_PAN_Y = 2200;
const NODE_CONTENT_BYTE_LIMIT = 20000;
const BRAIN_TOPIC_TREE_DEPTH = 5;
const textEncoder = new TextEncoder();

// Brain 관리 모달의 초기 상태입니다. Brain 정보, 멤버, 초대 가능 사용자, 가입 요청을 한꺼번에 관리합니다.
const emptyBrainManager = {
  isOpen: false,
  isLoading: false,
  isSaving: false,
  isLeaving: false,
  mode: "manage",
  brain: null,
  form: { name: "", description: "", joinPolicy: "PROTECTED" },
  members: [],
  availableUsers: [],
  joinRequests: [],
  searchKeyword: "",
  message: ""
};

// 화면 전체에서 공유하는 기본 데이터입니다. WAS 응답 전에는 빈 상태로 렌더링합니다.
const emptyPageData = {
  user: { name: "", email: "", role: "" },
  activeBrainId: null,
  activeTopicId: null,
  previewBrain: null,
  brains: [],
  topics: [],
  nodes: [],
  topicNodesById: {},
  quizStatusByTopicId: {},
  notifications: [],
  activities: []
};

// 그래프 pan/zoom 값이 화면 밖으로 너무 튀지 않도록 제한합니다.
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const clampGraph = (graphState) => ({
  ...graphState,
  scale: clamp(graphState.scale, MIN_GRAPH_SCALE, MAX_GRAPH_SCALE),
  x: clamp(
    graphState.x,
    -(MAX_GRAPH_PAN_X + (Math.max(0, clamp(graphState.scale, MIN_GRAPH_SCALE, MAX_GRAPH_SCALE) - 1) * 2400)),
    MAX_GRAPH_PAN_X + (Math.max(0, clamp(graphState.scale, MIN_GRAPH_SCALE, MAX_GRAPH_SCALE) - 1) * 2400)
  ),
  y: clamp(
    graphState.y,
    -(MAX_GRAPH_PAN_Y + (Math.max(0, clamp(graphState.scale, MIN_GRAPH_SCALE, MAX_GRAPH_SCALE) - 1) * 1700)),
    MAX_GRAPH_PAN_Y + (Math.max(0, clamp(graphState.scale, MIN_GRAPH_SCALE, MAX_GRAPH_SCALE) - 1) * 1700)
  )
});

// 현재 URL에서 Brain/Topic/Neuron id와 view 모드를 읽어 화면 상태로 복원합니다.
const getTopicIdFromRoute = (path) => {
  const match = path.match(/^\/brains\/[^/]+(?:\/preview)?\/topics\/([^/]+)/) || path.match(/^\/topics\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

const getNodeIdFromRoute = (path) => {
  const match = path.match(/^\/brains\/[^/]+(?:\/preview)?\/topics\/[^/]+\/nodes\/([^/]+)/) || path.match(/^\/nodes\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

const getBrainIdFromRoute = (path) => {
  const match = path.match(/^\/brains\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

const isBrainSearchRoute = (path) => path === "/brains/search";
const isBrainPreviewRoute = (path) => /^\/brains\/[^/]+\/preview(?:\/|$)/.test(path);
const getViewFromRoute = (path) => path.includes("/quiz") ? "quiz" : path.includes("/posts") || path.includes("/nodes/") ? "posts" : "synapse";
const buildTopicRoute = (brainId, topicId, routeView = "synapse", options = {}) => (
  brainId && topicId ? `/brains/${brainId}${options.preview ? "/preview" : ""}/topics/${topicId}/${routeView}` : `/topics/${topicId}/${routeView}`
);
const buildNodeRoute = (brainId, topicId, nodeId, options = {}) => (
  brainId && topicId ? `/brains/${brainId}${options.preview ? "/preview" : ""}/topics/${topicId}/nodes/${nodeId}` : `/nodes/${nodeId}`
);
// Brain 권한은 USER/MANAGER/ADMIN 값을 화면 라벨과 기능 권한으로 변환합니다.
const normalizeRoleValue = (role) => String(role || "").trim().toUpperCase();
const ROLE_LABELS = { USER: "일반학생", MANAGER: "매니저", ADMIN: "관리자" };
const MANAGE_ROLE_NAMES = ["ADMIN", "MANAGER"];
const ADMIN_ROLE_NAMES = ["ADMIN"];
const canUseManageMode = (role) => MANAGE_ROLE_NAMES.includes(normalizeRoleValue(role));
const canAdministerRole = (role) => ADMIN_ROLE_NAMES.includes(normalizeRoleValue(role));

// Neuron 본문은 WAS 제한에 맞춰 byte 단위로 길이를 계산합니다.
const getByteLength = (value) => textEncoder.encode(value || "").length;

const truncateToByteLimit = (value, limit) => {
  let currentBytes = 0;
  let result = "";

  for (const character of value || "") {
    const characterBytes = getByteLength(character);
    if (currentBytes + characterBytes > limit) break;
    currentBytes += characterBytes;
    result += character;
  }

  return result;
};

const normalizeErrorMessage = (message) => {
  const text = String(message || "");
  if (text.includes("413") || text.includes("Request Entity Too Large")) {
    return `내용은 ${NODE_CONTENT_BYTE_LIMIT.toLocaleString()}Byte 이하로 작성해주세요.`;
  }
  if (text.includes("<html") || text.includes("<!doctype")) {
    return "요청 처리 중 오류가 발생했습니다.";
  }
  return text;
};
// Brain 정보 갱신 시 서버 응답에 role이 빠져도 기존 관리 권한을 잃지 않게 보존합니다.
const pickPreservedBrainRole = (...roles) => {
  const normalizedRoles = roles.map(normalizeRoleValue).filter(Boolean);
  return normalizedRoles.find(canUseManageMode) || normalizedRoles[0] || "";
};
const mergeBrainPreservingRole = (brain, incoming) => {
  const role = pickPreservedBrainRole(brain?.brainRole, brain?.role, incoming?.brainRole, incoming?.role);
  return { ...brain, ...incoming, role, brainRole: role };
};
const isTopicUsing = (value) => value === true || value === "true" || value === 1 || value === "1";
// WAS 멤버 DTO의 role 필드명이 상황마다 달라질 수 있어 가능한 후보를 모두 읽습니다.
const pickBrainUserRole = (source = {}) => {
  const role =
    source.brainRole ??
    source.role ??
    source.memberRole ??
    source.roleInBrain ??
    source.brainMemberRole ??
    source.authority;

  if (role && typeof role === "object") {
    return role.name ?? role.role ?? role.value ?? role.code ?? "";
  }

  return role;
};

const normalizeBrainUser = (user = {}, fallbackRole = "") => {
  const role = normalizeRoleValue(pickBrainUserRole(user) || fallbackRole || "USER");

  return {
    id: String(user.UUID || user.uuid || user.uid || user.id || user.userId || user.memberId || ""),
    name: user.name || user.nickname || user.userName || "사용자",
    email: user.email || user.userEmail || "",
    role,
    brainRole: role
  };
};

const pickUserListFromPage = (page = {}) => page.users || page.content || page.members || page.data || [];

// B17 멤버 목록 응답을 화면 멤버 카드에서 쓰는 구조로 정리합니다.
// B17에 추가된 brainRole을 최우선으로 사용해야, B19 권한 변경 후 관리창을 다시 열어도 변경된 권한이 유지됩니다.
const normalizeBrainMemberPage = (page = {}, roleFallbackUsers = []) => {
  const users = pickUserListFromPage(page);
  const roleById = new Map(roleFallbackUsers.map((user) => [String(user.id), user.brainRole || user.role]).filter(([id, role]) => id && role));
  const roleByEmail = new Map(roleFallbackUsers.map((user) => [
    String(user.email || "").trim().toLowerCase(),
    user.brainRole || user.role
  ]).filter(([email, role]) => email && role));

  return (Array.isArray(users) ? users : []).map((user) => {
    const id = String(user.UUID || user.uuid || user.uid || user.id || user.userId || user.memberId || "");
    const email = String(user.email || user.userEmail || "").trim().toLowerCase();
    const role = normalizeRoleValue(user.brainRole || roleById.get(id) || roleByEmail.get(email) || pickBrainUserRole(user) || "USER");
    return {
      id,
      name: user.name || user.nickname || user.userName || "사용자",
      email: user.email || user.userEmail || "",
      role,
      brainRole: role
    };
  }).filter((user) => user.id);
};

// B12/B14처럼 Brain 권한이 없는 사용자 목록은 기본 USER 권한으로 화면에 맞춥니다.
const normalizeBrainUserPage = (page = {}, roleFallbackUsers = []) => {
  const users = pickUserListFromPage(page);
  const roleById = new Map(roleFallbackUsers.map((user) => [String(user.id), user.brainRole || user.role]).filter(([id, role]) => id && role));
  const roleByEmail = new Map(roleFallbackUsers.map((user) => [
    String(user.email || "").trim().toLowerCase(),
    user.brainRole || user.role
  ]).filter(([email, role]) => email && role));

  return (Array.isArray(users) ? users : []).map((user) => {
    const id = String(user.UUID || user.uuid || user.uid || user.id || user.userId || user.memberId || "");
    const email = String(user.email || user.userEmail || "").trim().toLowerCase();
    return normalizeBrainUser(user, roleById.get(id) || roleByEmail.get(email));
  }).filter((user) => user.id);
};
const updateBrainUserRole = (users, userId, role) => users.map((user) => (
  String(user.id) === String(userId)
    ? { ...user, role, brainRole: role }
    : user
));
const formatBrainRole = (role) => ROLE_LABELS[normalizeRoleValue(role)] || role || "일반학생";
// Topic 트리의 표시/숨김, btid 갱신, 자식 추가를 불변 업데이트로 처리하는 헬퍼들입니다.
const mapTopicTree = (topics, mapper) => topics.map((topic) => {
  const nextTopic = mapper(topic);
  return { ...nextTopic, children: mapTopicTree(nextTopic.children || [], mapper) };
});

const setTopicUseState = (topics, topicId, isUsing) => topics.map((topic) => ({
  ...topic,
  isUsing: String(topic.id) === String(topicId) ? isUsing : isTopicUsing(topic.isUsing),
  children: setTopicUseState(topic.children || [], topicId, isUsing)
}));

const setTopicSubtreeUseState = (topics, topicId, isUsing) => topics.map((topic) => {
  if (String(topic.id) === String(topicId)) {
    return mapTopicTree([topic], (item) => ({ ...item, isUsing }))[0];
  }

  return {
    ...topic,
    isUsing: isTopicUsing(topic.isUsing),
    children: setTopicSubtreeUseState(topic.children || [], topicId, isUsing)
  };
});

const findTopicPathIds = (topics, topicId, path = []) => {
  for (const topic of topics) {
    const nextPath = [...path, String(topic.id)];
    if (String(topic.id) === String(topicId)) return nextPath;
    const childPath = findTopicPathIds(topic.children || [], topicId, nextPath);
    if (childPath.length) return childPath;
  }
  return [];
};

const setTopicUseWithAncestors = (topics, topicId, isUsing) => {
  if (!isUsing) return setTopicSubtreeUseState(topics, topicId, false);

  const visiblePath = new Set(findTopicPathIds(topics, topicId));
  return topics.map((topic) => ({
    ...topic,
    isUsing: visiblePath.has(String(topic.id)) || isTopicUsing(topic.isUsing),
    children: setTopicUseWithAncestors(topic.children || [], topicId, true)
  }));
};

const addChildTopic = (topics, parentId, childTopic) => topics.map((topic) => (
  String(topic.id) === String(parentId)
    ? { ...topic, children: [...(topic.children || []), childTopic] }
    : { ...topic, children: addChildTopic(topic.children || [], parentId, childTopic) }
));

const addTopicToTree = (topics, parentId, childTopic) => (
  parentId == null ? [...topics, childTopic] : addChildTopic(topics, parentId, childTopic)
);

const topicUseMap = (topics, map = new Map()) => {
  topics.forEach((topic) => {
    map.set(String(topic.id), isTopicUsing(topic.isUsing));
    topicUseMap(topic.children || [], map);
  });
  return map;
};

const applyTopicUseMap = (topics, useMap) => topics.map((topic) => ({
  ...topic,
  isUsing: useMap.has(String(topic.id)) ? useMap.get(String(topic.id)) : isTopicUsing(topic.isUsing),
  children: applyTopicUseMap(topic.children || [], useMap)
}));

const buildApiTopicTree = (topics = []) => Array.isArray(topics) && topics.length ? buildTopicTree(topics) : [];

const markAncestorUsing = (topics) => topics.map((topic) => {
  const children = markAncestorUsing(topic.children || []);
  const hasVisibleChild = children.some((child) => child.isUsing);
  return { ...topic, children, isUsing: isTopicUsing(topic.isUsing) || hasVisibleChild };
});

const visibleTopicTree = (topics) => topics.reduce((visible, topic) => {
  const children = visibleTopicTree(topic.children || []);
  const isUsing = isTopicUsing(topic.isUsing);
  if (isUsing || children.length) visible.push({ ...topic, isUsing: isUsing || children.length > 0, children });
  return visible;
}, []);

const updateTopicBtid = (topics, topicId, btid) => topics.map((topic) => (
  String(topic.id) === String(topicId)
    ? { ...topic, btid: btid == null ? null : String(btid) }
    : { ...topic, children: updateTopicBtid(topic.children || [], topicId, btid) }
));

// T07 검색 결과는 경로 배열로 내려오므로, 검색 결과용 트리와 매칭 id 목록을 재구성합니다.
const topicRawId = (topic) => topic?.tid ?? topic?.id;

const buildTopicSearchTree = (paths = [], catalog = []) => {
  const byId = new Map();

  paths.forEach((path) => {
    if (!Array.isArray(path)) return;
    path.forEach((topic) => {
      const id = topicRawId(topic);
      if (id == null || byId.has(String(id))) return;
      byId.set(String(id), topic);
    });
  });

  const tree = buildApiTopicTree([...byId.values()]);
  return markAncestorUsing(applyTopicUseMap(tree, topicUseMap(catalog)));
};

const getTopicSearchMatchIds = (paths = []) => paths
  .map((path) => Array.isArray(path) ? path[path.length - 1] : null)
  .map(topicRawId)
  .filter((id) => id != null)
  .map(String);

const getTopicSearchExpandedIds = (paths = []) => {
  const ids = new Set();
  paths.forEach((path) => {
    if (!Array.isArray(path)) return;
    path.slice(0, -1).forEach((topic) => {
      const id = topicRawId(topic);
      if (id != null) ids.add(String(id));
    });
  });
  return [...ids];
};

export default function MainPage() {
  // ===== 공통 화면 상태 =====
  // 화면 전체에서 쓰는 데이터입니다. WAS 응답 전에는 mock 대신 빈 상태를 보여줍니다.
  const [pageData, setPageData] = useState(() => clone(emptyPageData));

  // 현재 route와 좌우 패널, 보기 모드, 그래프 카메라 상태를 관리합니다.
  const [route, setRoute] = useState(getCurrentRoute);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const savedWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return Number.isFinite(savedWidth) ? clamp(savedWidth, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH) : MIN_SIDEBAR_WIDTH;
  });
  const [view, setView] = useState("synapse");
  const [graph, setGraph] = useState({ x: 0, y: 0, scale: MIN_GRAPH_SCALE, tilt: 0 });
  const [authStatus, setAuthStatus] = useState(() => sessionStorage.getItem(AUTH_STATE_KEY) === "true" ? "authenticated" : "guest");

  // 모달, 토스트, API 연결 상태, 그래프 이동 애니메이션 상태입니다.
  const [modal, setModal] = useState(null);
  const [nodeDraft, setNodeDraft] = useState({ isOpen: false, title: "", content: "", status: "", isSubmitting: false });
  const [nodeDetail, setNodeDetail] = useState({ isOpen: false, isLoading: false, data: null, status: "", liked: false });
  const [commentDraft, setCommentDraft] = useState({ content: "", status: "", isSubmitting: false, parentId: null, editingId: null });
  const [quizState, setQuizState] = useState({ isLoading: false, isGenerating: false, status: "", quizzes: [], answers: {}, submitted: false });
  const [quizGenerationCounts, setQuizGenerationCounts] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(QUIZ_GENERATION_COUNTS_KEY) || "{}");
    } catch {
      return {};
    }
  });
  const [toast, setToast] = useState("");
  const [apiStatus, setApiStatus] = useState("loading");
  const [flying, setFlying] = useState(false);
  const [panning, setPanning] = useState(false);
  const [manageMode, setManageMode] = useState(false);

  // ===== Topic 관리/검색 상태 =====
  const [topicPanelMode, setTopicPanelMode] = useState(null);
  const [isTopicCatalogLoading, setIsTopicCatalogLoading] = useState(false);
  const [topicCatalog, setTopicCatalog] = useState([]);
  const [topicSearch, setTopicSearch] = useState({
    query: "",
    isSearching: false,
    isLoading: false,
    topics: [],
    matchedTopicIds: [],
    expandedTopicIds: [],
    message: ""
  });
  const [openBrainTabs, setOpenBrainTabs] = useState([]);

  // ===== Brain 관리/검색 상태 =====
  const [brainManager, setBrainManager] = useState(emptyBrainManager);
  const [brainSearch, setBrainSearch] = useState({
    query: "",
    includeJoined: false,
    results: [],
    currentPage: 0,
    totalPages: 0,
    totalElements: 0,
    hasNext: false,
    isLoading: false,
    message: ""
  });

  // 그래프 DOM과 드래그/클릭 보정에 필요한 임시 값을 저장합니다.
  const graphFieldRef = useRef(null);
  const panSession = useRef(null);
  const suppressNextClick = useRef(false);
  const flightTimer = useRef(null);
  const sidebarResizeSession = useRef(null);
  const topicCatalogByBrain = useRef({});
  const commonTopicCatalog = useRef([]);
  const brainTabState = useRef({});
  const workspaceLoadSeq = useRef(0);
  const shouldFitGraphAfterLoad = useRef(false);

  // ===== 현재 선택된 Brain/Topic과 권한 계산 =====
  // 트리 구조의 토픽을 펼쳐서 현재 선택된 Brain/Topic을 계산합니다.
  const topicsFlat = useMemo(() => flattenTopics(pageData.topics), [pageData.topics]);
  const nodeContentByteCount = useMemo(() => getByteLength(nodeDraft.content), [nodeDraft.content]);
  const activeBrain = pageData.brains.find((brain) => String(brain.id) === String(pageData.activeBrainId))
    || (String(pageData.previewBrain?.id) === String(pageData.activeBrainId) ? pageData.previewBrain : null);
  const activeTopic = topicsFlat.find((topic) => String(topic.id) === String(pageData.activeTopicId)) || null;
  const isZoomed = graph.scale >= 1.28;
  const isAuthenticated = authStatus === "authenticated";
  const isBrainSearchView = isBrainSearchRoute(route);
  const isBrainPreview = Boolean(activeBrain?.isPreview || isBrainPreviewRoute(route));
  const activeBrainRole = normalizeRoleValue(activeBrain?.brainRole || activeBrain?.role);
  const canManageBrain = (brain) => Boolean(
    isAuthenticated
    && brain
    && !brain.isPreview
    && canUseManageMode(brain.brainRole || brain.role)
  );
  const canManageWorkspace = Boolean(
    isAuthenticated
    && activeBrain
    && !isBrainPreview
    && canUseManageMode(activeBrainRole)
  );
  const canAdministerWorkspace = Boolean(
    isAuthenticated
    && activeBrain
    && !isBrainPreview
    && canAdministerRole(activeBrainRole)
  );
  const isCurrentUserWriter = (writer) => {
    const targetWriter = String(writer || "").trim();
    const currentUserName = String(pageData.user?.name || "").trim();
    return Boolean(targetWriter && currentUserName && targetWriter === currentUserName);
  };
  const canDeleteNode = (node) => Boolean(node && (canAdministerWorkspace || isCurrentUserWriter(node.writer)));

  // ===== Topic Catalog와 Brain 탭 캐시 =====
  // Brain을 이동할 때 매번 전체 데이터를 기다리지 않도록 마지막 상태를 탭별로 기억합니다.
  const rememberTopicCatalog = (brainId, catalog) => {
    if (!brainId) return;
    topicCatalogByBrain.current[String(brainId)] = catalog;
  };

  const loadTopicBranchFromT02 = async (topic, brainId) => {
    const childTopics = await apiGet(endpoints.topics.children(topic.id, brainId));
    const children = await Promise.all(
      buildApiTopicTree(childTopics || []).map((child) => loadTopicBranchFromT02(child, brainId))
    );
    return { ...topic, children };
  };

  const loadTopicCatalogFromTopicApi = async (brainId) => {
    const rootTopics = buildApiTopicTree(await apiGet(endpoints.topics.list(brainId)) || []);
    const rootBranches = await Promise.all(rootTopics.map((topic) => loadTopicBranchFromT02(topic, brainId)));
    return markAncestorUsing(rootBranches);
  };

  const restoreBrainTopicCatalog = (brainId, topics, options = {}) => {
    const cachedCatalog = topicCatalogByBrain.current[String(brainId)];
    if (cachedCatalog && options.preferCached !== false) return markAncestorUsing(applyTopicUseMap(topics, topicUseMap(cachedCatalog)));
    if (!cachedCatalog) return markAncestorUsing(topics);
    return markAncestorUsing(applyTopicUseMap(topics, topicUseMap(cachedCatalog)));
  };

  const addBrainTab = (brainId) => {
    const brain = pageData.brains.find((item) => String(item.id) === String(brainId));
    if (!brain) return;

    setOpenBrainTabs((current) => {
      if (current.some((item) => String(item.id) === String(brain.id))) return current;
      return [...current, brain];
    });
  };

  const buildBrainStateRoute = (brainId, cachedState = null) => {
    const cachedTopicId = cachedState?.activeTopicId;
    const cachedView = cachedState?.view || "synapse";
    if (!cachedTopicId) return `/brains/${brainId}`;
    const routeView = cachedView === "posts" ? "posts" : cachedView === "quiz" ? "quiz" : "synapse";
    return buildTopicRoute(brainId, cachedTopicId, routeView);
  };

  const rememberActiveBrainState = () => {
    if (!pageData.activeBrainId || authStatus !== "authenticated") return;
    if (String(pageData.previewBrain?.id) === String(pageData.activeBrainId)) return;
    const brainId = String(pageData.activeBrainId);
    const previousState = brainTabState.current[brainId] || {};
    const rememberedTopics = pageData.topics?.length ? pageData.topics : previousState.topics || [];
    const rememberedCatalog = topicCatalog?.length ? topicCatalog : previousState.topicCatalog || [];

    brainTabState.current[brainId] = {
      activeTopicId: pageData.activeTopicId,
      view,
      graph,
      topics: clone(rememberedTopics),
      nodes: clone(pageData.nodes),
      topicNodesById: clone(pageData.topicNodesById || {}),
      quizStatusByTopicId: clone(pageData.quizStatusByTopicId || {}),
      topicCatalog: clone(rememberedCatalog)
    };
  };

  const applyCachedBrainState = (brainId, cachedState) => {
    if (!cachedState) return false;

    setPageData((current) => ({
      ...current,
      activeBrainId: String(brainId),
      activeTopicId: cachedState.activeTopicId || null,
      previewBrain: null,
      topics: clone(cachedState.topics || []),
      nodes: clone(cachedState.nodes || []),
      topicNodesById: clone(cachedState.topicNodesById || {}),
      quizStatusByTopicId: clone(cachedState.quizStatusByTopicId || {})
    }));
    setTopicCatalog(clone(cachedState.topicCatalog || []));
    setGraph(clampGraph(cachedState.graph || { x: 0, y: 0, scale: MIN_GRAPH_SCALE, tilt: 0 }));
    setView(cachedState.view || "synapse");
    return true;
  };

  // 공통 Topic Catalog에서 현재 Brain에 표시할 Topic만 걸러 Workspace 트리로 만듭니다.
  const syncVisibleTopics = (catalog, preferredTopicId = null) => {
    const visibleTopics = visibleTopicTree(catalog);
    const visibleFlat = flattenTopics(visibleTopics);
    const visibleTopicIds = new Set(visibleFlat.map((topic) => String(topic.id)));

    setPageData((current) => {
      const nextActiveTopicId = preferredTopicId && visibleTopicIds.has(String(preferredTopicId))
        ? String(preferredTopicId)
        : visibleTopicIds.has(String(current.activeTopicId))
        ? current.activeTopicId
        : (visibleFlat[0] ? String(visibleFlat[0].id) : null);
      const nextTopicNodesById = Object.fromEntries(
        Object.entries(current.topicNodesById || {}).filter(([topicId]) => visibleTopicIds.has(String(topicId)))
      );
      const nextQuizStatusByTopicId = Object.fromEntries(
        Object.entries(current.quizStatusByTopicId || {}).filter(([topicId]) => visibleTopicIds.has(String(topicId)))
      );

      return {
        ...current,
        topics: visibleTopics,
        activeTopicId: nextActiveTopicId,
        nodes: nextActiveTopicId ? nextTopicNodesById[String(nextActiveTopicId)] || [] : [],
        topicNodesById: nextTopicNodesById,
        quizStatusByTopicId: nextQuizStatusByTopicId
      };
    });
  };

  // 관리모드 Topic 패널에서 쓰는 공통 Topic Catalog를 가져옵니다.
  const loadTopicCatalog = async () => {
    if (!activeBrain) return topicCatalog;

    setIsTopicCatalogLoading(true);
    try {
      const catalog = restoreBrainTopicCatalog(activeBrain.id, await loadTopicCatalogFromTopicApi(activeBrain.id), { preferCached: false });
      setTopicCatalog(catalog);
      commonTopicCatalog.current = catalog;
      rememberTopicCatalog(activeBrain.id, catalog);
      syncVisibleTopics(catalog);
      return catalog;
    } catch (error) {
      const fallback = topicCatalog.length ? topicCatalog : pageData.topics;
      setTopicCatalog(fallback);
      showToast(`공통 Topic 목록을 불러오지 못했습니다 · ${error.message}`);
      return fallback;
    } finally {
      setIsTopicCatalogLoading(false);
    }
  };

  // BrainTopic에 연결된 Node 목록을 가져옵니다. 상세 정보는 카드 클릭 시 별도로 불러옵니다.
  const fetchTopicNodes = async (brainId, topic) => {
    if (!brainId || !topic?.btid) return [];

    try {
      const result = await apiGet(endpoints.nodes.preview(topic.btid));
      return normalizeNodes(result?.neuronPreviewList || []);
    } catch (error) {
      return [];
    }
  };

  // Synapse 화면에서는 모든 Topic 주변에 Neuron 미리보기를 작게 배치합니다.
  const fetchTopicNodePreviews = async (brainId, topic) => {
    if (!brainId || !topic?.btid) return [];

    try {
      const result = await apiGet(endpoints.nodes.preview(topic.btid));
      return normalizeNodes(result?.neuronPreviewList || []);
    } catch (error) {
      return [];
    }
  };

  const fetchVisibleTopicNodePreviews = async (brainId, topics = []) => {
    const flatTopics = flattenTopics(topics).filter((topic) => topic?.btid);
    const entries = await Promise.all(flatTopics.map(async (topic) => [
      String(topic.id),
      await fetchTopicNodePreviews(brainId, topic)
    ]));
    return Object.fromEntries(entries);
  };

  // Brain 화면을 먼저 띄운 뒤, Neuron 미리보기만 백그라운드로 채웁니다.
  // 퀴즈 목록은 서버 부하를 줄이기 위해 "퀴즈를 확인해보세요" 진입 시점에만 조회합니다.
  const hydrateVisibleTopicExtras = (brainId, visibleTopics = [], requestId = workspaceLoadSeq.current) => {
    window.setTimeout(async () => {
      try {
        const nextTopicNodesById = await fetchVisibleTopicNodePreviews(brainId, visibleTopics);
        if (requestId !== workspaceLoadSeq.current) return;
        setPageData((current) => {
          if (String(current.activeBrainId) !== String(brainId)) return current;
          return {
            ...current,
            topicNodesById: {
              ...(current.topicNodesById || {}),
              ...nextTopicNodesById
            },
            nodes: current.activeTopicId && nextTopicNodesById[String(current.activeTopicId)]
              ? nextTopicNodesById[String(current.activeTopicId)]
              : current.nodes
          };
        });
      } catch (error) {
        // 부가 데이터이므로 화면 진입을 막지 않습니다.
      }
    }, 0);
  };

  // 현재 BrainTopic에 저장된 퀴즈를 WAS에서 조회합니다.
  const loadTopicQuizzes = async (topic = activeTopic) => {
    const targetTopic = topic?.btid ? topic : await resolveActiveTopicForNeuron();

    if (!targetTopic?.btid) {
      setQuizState({ isLoading: false, isGenerating: false, status: "Brain에 표시된 Topic에서만 퀴즈를 확인할 수 있습니다.", quizzes: [], answers: {}, submitted: false });
      return;
    }

    setQuizState((current) => ({ ...current, isLoading: true, status: "", answers: {}, submitted: false }));

    try {
      const result = await apiGet(endpoints.quizzes.list(targetTopic.btid));
      const quizzes = normalizeQuizzes(result?.quizzes || []);
      setPageData((current) => ({
        ...current,
        quizStatusByTopicId: {
          ...(current.quizStatusByTopicId || {}),
          [String(targetTopic.id)]: { hasQuiz: quizzes.length > 0, quizCount: quizzes.length }
        }
      }));
      setQuizState({ isLoading: false, isGenerating: false, status: "", quizzes, answers: {}, submitted: false });
    } catch (error) {
      setQuizState({ isLoading: false, isGenerating: false, status: `퀴즈를 불러오지 못했습니다 · ${error.message}`, quizzes: [], answers: {}, submitted: false });
    }
  };

  // 관리모드에서 WAS의 Gemini 연동 API를 호출해 Topic 기반 퀴즈를 생성합니다.
  const generateTopicQuizzes = async () => {
    const targetTopic = activeTopic?.btid ? activeTopic : await resolveActiveTopicForNeuron();

    if (!targetTopic?.btid) {
      setQuizState((current) => ({ ...current, status: "Brain에 표시된 Topic에서만 퀴즈를 생성할 수 있습니다." }));
      return;
    }

    const generationKey = String(targetTopic.btid);
    const currentCount = Number(quizGenerationCounts[generationKey] || 0);

    if (currentCount >= QUIZ_GENERATION_LIMIT) {
      const message = "이 Topic은 퀴즈를 최대 2번 생성했습니다.";
      setQuizState((current) => ({ ...current, status: message }));
      showToast(message);
      return;
    }

    setQuizState((current) => ({
      ...current,
      isGenerating: true,
      status: "퀴즈를 생성하는 중입니다."
    }));

    try {
      const result = await apiPost(endpoints.quizzes.create(targetTopic.btid), {});
      const quizzes = normalizeQuizzes(result?.quizzes || []);
      setPageData((current) => ({
        ...current,
        quizStatusByTopicId: {
          ...(current.quizStatusByTopicId || {}),
          [String(targetTopic.id)]: { hasQuiz: quizzes.length > 0, quizCount: quizzes.length }
        }
      }));
      setQuizState({
        isLoading: false,
        isGenerating: false,
        status: "퀴즈가 생성되었습니다.",
        quizzes,
        answers: {},
        submitted: false
      });
      const nextCount = currentCount + 1;
      const nextCounts = { ...quizGenerationCounts, [generationKey]: nextCount };
      setQuizGenerationCounts(nextCounts);
      localStorage.setItem(QUIZ_GENERATION_COUNTS_KEY, JSON.stringify(nextCounts));
      showToast("퀴즈가 생성되었습니다.");
    } catch (error) {
      setQuizState((current) => ({ ...current, isGenerating: false, status: `퀴즈 생성 실패 · ${error.message}` }));
    }
  };

  const selectQuizOption = (quizId, optionIndex) => {
    setQuizState((current) => {
      if (current.submitted) return current;
      return {
        ...current,
        status: "",
        answers: { ...current.answers, [String(quizId)]: optionIndex }
      };
    });
  };

  const submitQuizAnswers = () => {
    setQuizState((current) => {
      if (!current.quizzes.length) return current;
      const answeredCount = current.quizzes.filter((quiz) => current.answers[String(quiz.id)] != null).length;
      if (answeredCount < current.quizzes.length) {
        return { ...current, status: `아직 ${current.quizzes.length - answeredCount}문제가 남아있습니다.` };
      }
      return { ...current, status: "", submitted: true };
    });
  };

  const resetQuizAnswers = () => {
    setQuizState((current) => ({ ...current, status: "", answers: {}, submitted: false }));
  };

  const openQuizView = (event) => {
    if (!activeTopic) return;

    if (!isAuthenticated) {
      event?.preventDefault?.();
      showToast("로그인해야 이용할 수 있습니다.");
      return;
    }

    setNodeDetail({ isOpen: false, isLoading: false, data: null, status: "", liked: false });
    setView("quiz");
    handleRouteClick(event, buildTopicRoute(activeBrain?.id, activeTopic.id, "quiz", { preview: isBrainPreview }));
  };

  const loadNodeDetail = async (nodeId) => {
    if (!nodeId) return;

    setNodeDetail((current) => ({
      ...current,
      isOpen: true,
      isLoading: true,
      status: "",
      data: current.data?.id === String(nodeId) ? current.data : null
    }));
    setView("posts");

    try {
      const detail = await apiGet(endpoints.nodes.detail(nodeId));
      const normalizedDetail = normalizeNodeDetail(detail);
      setNodeDetail({ isOpen: true, isLoading: false, data: normalizedDetail, status: "", liked: normalizedDetail.liked });
      setPageData((current) => ({
        ...current,
        nodes: current.nodes.map((node) => (
          String(node.id) === String(nodeId)
            ? { ...node, comments: normalizedDetail.comments.length }
            : node
        )),
        topicNodesById: Object.fromEntries(
          Object.entries(current.topicNodesById || {}).map(([topicId, nodes]) => [
            topicId,
            nodes.map((node) => (
              String(node.id) === String(nodeId)
                ? { ...node, comments: normalizedDetail.comments.length }
                : node
            ))
          ])
        )
      }));
      setCommentDraft({ content: "", status: "", isSubmitting: false, parentId: null, editingId: null });
    } catch (error) {
      setNodeDetail((current) => ({
        ...current,
        isOpen: true,
        isLoading: false,
        status: `Neuron 상세 정보를 불러오지 못했습니다 · ${error.message}`
      }));
    }
  };

  // 특정 Brain의 Topic 트리와 선택 Topic의 Node를 WAS에서 다시 불러옵니다.
  const loadBrainWorkspace = async (brainId, requestedTopicId = null, options = {}) => {
    if (!brainId) return;
    const requestId = ++workspaceLoadSeq.current;

    try {
      const detail = await apiGet(endpoints.brains.topics(brainId, { depth: BRAIN_TOPIC_TREE_DEPTH }));
      if (requestId !== workspaceLoadSeq.current) return;

      const topics = restoreBrainTopicCatalog(brainId, buildTopicTree(detail?.topics || []));
      const visibleTopics = visibleTopicTree(topics);
      const flatTopics = flattenTopics(visibleTopics);
      const cachedState = brainTabState.current[String(brainId)];
      const hasRequestedTopic = requestedTopicId != null && requestedTopicId !== "";
      const preferredTopicId = hasRequestedTopic
        ? requestedTopicId
        : (options.useCachedTopic ? cachedState?.activeTopicId || null : null);
      const selectedTopic = preferredTopicId
        ? flatTopics.find((topic) => String(topic.id) === String(preferredTopicId)) || null
        : null;
      const nextView = selectedTopic ? options.view || cachedState?.view || view : "synapse";
      const topicNodesById = clone(cachedState?.topicNodesById || {});
      const quizStatusByTopicId = clone(cachedState?.quizStatusByTopicId || {});

      const nodes = nextView === "posts" && selectedTopic
        ? await fetchTopicNodes(brainId, selectedTopic)
        : (selectedTopic ? topicNodesById[String(selectedTopic.id)] || [] : []);
      if (requestId !== workspaceLoadSeq.current) return;

      if (selectedTopic && nextView === "posts") topicNodesById[String(selectedTopic.id)] = nodes;
      const previewSource = options.previewBrain || {};
      const normalizedBrain = normalizeBrain({
        ...previewSource,
        id: brainId,
        ...detail,
        topics: detail?.topics || [],
        isPreview: Boolean(options.preview)
      });
      if (requestId !== workspaceLoadSeq.current) return;

      setPageData((current) => ({
        ...current,
        activeBrainId: String(normalizedBrain.id),
        activeTopicId: selectedTopic ? String(selectedTopic.id) : null,
        previewBrain: options.preview ? normalizedBrain : null,
        brains: options.preview
          ? current.brains
          : current.brains.map((brain) => (
            String(brain.id) === String(normalizedBrain.id)
              ? mergeBrainPreservingRole(brain, normalizedBrain)
              : brain
          )),
        topics: visibleTopics,
        nodes,
        topicNodesById,
        quizStatusByTopicId
      }));
      setView(nextView);
      setApiStatus("was");
      setTopicCatalog(topics);
      rememberTopicCatalog(brainId, topics);
      hydrateVisibleTopicExtras(brainId, visibleTopics, requestId);
    } catch (error) {
      showToast(`Brain 정보를 불러오지 못했습니다 · ${error.message}`);
    }
  };

  // WAS에서 사용자, 내 Brain, 선택 Brain의 Topic/Node 목록을 가져옵니다.
  const loadMainData = async () => {
    const requestId = ++workspaceLoadSeq.current;

    if (sessionStorage.getItem(AUTH_STATE_KEY) !== "true") {
      setAuthStatus("guest");
      setApiStatus("guest");
      setPageData((current) => ({
        ...current,
        ...guestPreview,
        previewBrain: null,
        topicNodesById: {},
        quizStatusByTopicId: {},
        user: { name: "Guest", email: "", role: "GUEST" }
      }));
      return;
    }

    try {
      const [userInfo, myBrains] = await Promise.all([
        apiGet(endpoints.users.me),
        apiGet(endpoints.brains.mine)
      ]);
      if (requestId !== workspaceLoadSeq.current) return;

      const brains = (myBrains?.brains || []).map((brain) => normalizeBrain(brain));
      const routedBrainId = getBrainIdFromRoute(route);
      const isPreviewRoute = isBrainPreviewRoute(route);
      const selectedBrain = isPreviewRoute
        ? (routedBrainId ? normalizeBrain({ id: routedBrainId, name: "Brain", isPreview: true }) : null)
        : (brains.find((brain) => String(brain.id) === String(routedBrainId)) || brains[0] || null);

      let topics = [];
      let catalogTopics = [];
      let nodes = [];
      let topicNodesById = {};
      let quizStatusByTopicId = {};
      let activeTopicId = null;
      let nextBrains = brains;
      let previewBrainDetail = null;

      if (selectedBrain) {
        const brainDetail = await apiGet(endpoints.brains.topics(selectedBrain.id, { depth: BRAIN_TOPIC_TREE_DEPTH }));
        if (requestId !== workspaceLoadSeq.current) return;

        catalogTopics = restoreBrainTopicCatalog(selectedBrain.id, buildTopicTree(brainDetail?.topics || []));
        const visibleTopics = visibleTopicTree(catalogTopics);
        const flatTopics = flattenTopics(visibleTopics);
      const routedTopicId = getTopicIdFromRoute(route);
      const routedNodeId = getNodeIdFromRoute(route);
      const selectedTopic = routedTopicId
        ? flatTopics.find((topic) => String(topic.id) === String(routedTopicId)) || null
        : null;
      activeTopicId = selectedTopic ? String(selectedTopic.id) : null;
      if (routedNodeId) loadNodeDetail(routedNodeId);
      if (requestId !== workspaceLoadSeq.current) return;

      nodes = getViewFromRoute(route) === "posts" && selectedTopic && !routedNodeId
        ? await fetchTopicNodes(selectedBrain.id, selectedTopic)
        : (selectedTopic ? topicNodesById[String(selectedTopic.id)] || [] : []);
      if (requestId !== workspaceLoadSeq.current) return;

      if (selectedTopic && getViewFromRoute(route) === "posts") topicNodesById[String(selectedTopic.id)] = nodes;
      topics = visibleTopics;

        const detailBrain = normalizeBrain({
          id: selectedBrain.id,
          ...brainDetail,
          topics: brainDetail?.topics || [],
          isPreview: isPreviewRoute
        });
        nextBrains = isPreviewRoute
          ? brains
          : brains.map((brain) => (
            String(brain.id) === String(detailBrain.id)
              ? mergeBrainPreservingRole(brain, detailBrain)
              : brain
          ));
        if (isPreviewRoute) previewBrainDetail = detailBrain;
      }

      setAuthStatus("authenticated");
      setApiStatus("was");
      setTopicCatalog(catalogTopics);
      if (selectedBrain) rememberTopicCatalog(selectedBrain.id, catalogTopics);
      const normalizedUser = normalizeUserInfo(userInfo);
      shouldFitGraphAfterLoad.current = Boolean(selectedBrain && topics.length && getViewFromRoute(route) === "synapse");
      setPageData((current) => ({
        ...current,
        user: normalizedUser,
        activeBrainId: selectedBrain ? String(selectedBrain.id) : null,
        activeTopicId,
        previewBrain: isPreviewRoute && selectedBrain ? (previewBrainDetail || selectedBrain) : null,
        brains: nextBrains,
        topics,
        nodes,
        topicNodesById,
        quizStatusByTopicId
      }));
      if (selectedBrain) hydrateVisibleTopicExtras(selectedBrain.id, topics, requestId);
    } catch (error) {
      if (isAuthError(error)) {
        sessionStorage.removeItem(AUTH_STATE_KEY);
        setAuthStatus("guest");
        setApiStatus("guest");
        setPageData((current) => ({
          ...current,
          ...guestPreview,
          previewBrain: null,
          topicNodesById: {},
          quizStatusByTopicId: {},
          user: { name: "Guest", email: "", role: "GUEST" }
        }));
        return;
      }

      setApiStatus("was-error");
      showToast(`데이터를 불러오지 못했습니다 · ${error.message}`);
    }
  };

  // WAS Brain 검색 API(B05)를 호출해 중앙 검색 화면의 목록을 갱신합니다.
  const searchBrains = async (query = brainSearch.query, page = 0, includeJoined = brainSearch.includeJoined) => {
    setBrainSearch((current) => ({ ...current, query, includeJoined, isLoading: true, message: "" }));

    try {
      const result = await apiGet(endpoints.brains.search(query, includeJoined, page, 6));
      setBrainSearch({
        query,
        includeJoined,
        results: result?.brains || [],
        currentPage: result?.currentPage || 0,
        totalPages: result?.totalPages || 0,
        totalElements: result?.totalElements || 0,
        hasNext: Boolean(result?.hasNext),
        isLoading: false,
        message: ""
      });
    } catch (error) {
      setBrainSearch((current) => ({
        ...current,
        results: [],
        isLoading: false,
        message: sessionStorage.getItem(AUTH_STATE_KEY) === "true"
          ? `Brain 검색 실패 · ${error.message}`
          : "Brain 검색은 로그인 후 이용할 수 있습니다."
      }));
    }
  };

  const previewBrainFromSearch = (event, brain) => {
    if (!brain?.id) return;
    event?.preventDefault?.();
    rememberActiveBrainState();

    const previewBrain = normalizeBrain({ ...brain, isPreview: true });
    const previewRoute = `/brains/${previewBrain.id}/preview`;
    setPageData((current) => ({
      ...current,
      activeBrainId: String(previewBrain.id),
      activeTopicId: null,
      previewBrain,
      topics: [],
      nodes: [],
      topicNodesById: {},
      quizStatusByTopicId: {}
    }));
    setView("synapse");
    setManageMode(false);
    setGraph(clampGraph({ x: 0, y: 0, scale: MIN_GRAPH_SCALE, tilt: 0 }));
    handleRouteClick(event, previewRoute);
    loadBrainWorkspace(previewBrain.id, null, { view: "synapse", preview: true, previewBrain });
  };

  // 앱 최초 진입과 브라우저 뒤로가기/앞으로가기에서 URL을 읽어 화면 상태를 복원합니다.
  useEffect(() => {
    // 첫 진입 시 route와 body data를 동기화하고 WAS 데이터를 불러옵니다.
    syncDocumentRoute(route);
    setView(getViewFromRoute(route));

    const createdWorkspace = window.sessionStorage.getItem(CREATED_WORKSPACE_KEY);
    if (createdWorkspace) {
      try {
        const parsedWorkspace = JSON.parse(createdWorkspace);
        const routedTopicId = getTopicIdFromRoute(route);
        setPageData((current) => ({
          ...current,
          ...parsedWorkspace,
          user: current.user,
          activeTopicId: routedTopicId || parsedWorkspace.activeTopicId
        }));
      } catch (error) {
        window.sessionStorage.removeItem(CREATED_WORKSPACE_KEY);
      }
    }

    loadMainData();
    if (isBrainSearchRoute(route)) {
      searchBrains("", 0);
    }

    // 브라우저 뒤로가기/앞으로가기나 버튼 클릭으로 route가 바뀌는 경우를 감지합니다.
    const onRouteChange = (event) => {
      const nextRoute = getCurrentRoute();
      setRoute(nextRoute);
      syncDocumentRoute(nextRoute);
      const nextView = getViewFromRoute(nextRoute);
      setView(nextView);
      const routedBrainId = getBrainIdFromRoute(nextRoute);
      const routedTopicId = getTopicIdFromRoute(nextRoute);
      const routedNodeId = getNodeIdFromRoute(nextRoute);
      if (routedNodeId) {
        loadNodeDetail(routedNodeId);
      } else {
        setNodeDetail((current) => current.isOpen ? { isOpen: false, isLoading: false, data: null, status: "", liked: false } : current);
      }
      if (routedBrainId && !routedTopicId && !isBrainSearchRoute(nextRoute)) {
        setPageData((current) => ({ ...current, activeTopicId: null, nodes: [] }));
      } else if (routedTopicId) {
        setPageData((current) => ({ ...current, activeTopicId: routedTopicId }));
      }
      if (routedBrainId && event?.type === "popstate" && !isBrainSearchRoute(nextRoute)) {
        loadBrainWorkspace(routedBrainId, routedTopicId, { view: nextView, preview: isBrainPreviewRoute(nextRoute) });
      }
      if (isBrainSearchRoute(nextRoute)) {
        searchBrains("", 0);
      }
    };

    window.addEventListener("popstate", onRouteChange);
    window.addEventListener(ROUTE_EVENTS.changed, onRouteChange);
    return () => {
      window.removeEventListener("popstate", onRouteChange);
      window.removeEventListener(ROUTE_EVENTS.changed, onRouteChange);
    };
  }, []);

  // route 문자열이 바뀌면 브라우저 주소창과 document 상태를 동기화합니다.
  useEffect(() => {
    if (!pageData.activeBrainId || authStatus !== "authenticated") return;
    const currentState = brainTabState.current[String(pageData.activeBrainId)] || {};
    brainTabState.current[String(pageData.activeBrainId)] = {
      ...currentState,
      activeTopicId: pageData.activeTopicId,
      view
    };
  }, [authStatus, pageData.activeBrainId, pageData.activeTopicId, view]);

  // 퀴즈 화면으로 진입하거나 Topic이 바뀌면 해당 BrainTopic의 저장된 퀴즈를 다시 조회합니다.
  useEffect(() => {
    if (view === "quiz" && activeTopic) {
      loadTopicQuizzes(activeTopic);
    }
  }, [view, activeTopic?.id, activeTopic?.btid]);

  // Topic 트리가 깊을 때 왼쪽 사이드바 폭을 사용자가 직접 조절할 수 있게 합니다.
  useEffect(() => {
    const handleSidebarResizeMove = (event) => {
      if (!sidebarResizeSession.current) return;
      const { startX, startWidth } = sidebarResizeSession.current;
      const nextWidth = clamp(startWidth + event.clientX - startX, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH);
      sidebarResizeSession.current.currentWidth = nextWidth;
      setSidebarWidth(nextWidth);
    };

    const handleSidebarResizeEnd = () => {
      if (!sidebarResizeSession.current) return;
      const nextWidth = sidebarResizeSession.current.currentWidth || sidebarWidth;
      sidebarResizeSession.current = null;
      document.body.classList.remove("is-resizing-sidebar");
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(nextWidth));
    };

    window.addEventListener("pointermove", handleSidebarResizeMove);
    window.addEventListener("pointerup", handleSidebarResizeEnd);

    return () => {
      window.removeEventListener("pointermove", handleSidebarResizeMove);
      window.removeEventListener("pointerup", handleSidebarResizeEnd);
      document.body.classList.remove("is-resizing-sidebar");
    };
  }, [sidebarWidth]);

  // 관리자/반장 권한이 아니거나 Brain을 벗어나면 관리모드는 자동으로 해제합니다.
  useEffect(() => {
    if (!canManageWorkspace && manageMode) {
      setManageMode(false);
    }
  }, [canManageWorkspace, manageMode]);

  // 실제 Topic Tree 렌더링과 같은 좌표계를 사용해 클릭/사이드바 이동 위치를 계산합니다.
  const topicLayoutPoints = useMemo(() => collectTopicLayoutPoints(pageData.topics), [pageData.topics]);

  const fitGraphToTopics = () => {
    const field = graphFieldRef.current;
    if (!field || !topicLayoutPoints.length) {
      setGraph(clampGraph({ x: 0, y: 0, scale: MIN_GRAPH_SCALE, tilt: 0 }));
      return;
    }

    const rect = field.getBoundingClientRect();
    const paddingX = 360;
    const paddingY = 260;
    const minX = Math.min(...topicLayoutPoints.map((point) => point.x)) - paddingX;
    const maxX = Math.max(...topicLayoutPoints.map((point) => point.x)) + paddingX;
    const minY = Math.min(...topicLayoutPoints.map((point) => point.y)) - paddingY;
    const maxY = Math.max(...topicLayoutPoints.map((point) => point.y)) + paddingY;
    const widthScale = rect.width / Math.max(maxX - minX, 1);
    const heightScale = rect.height / Math.max(maxY - minY, 1);
    const nextScale = clamp(Math.min(widthScale, heightScale, 1), MIN_GRAPH_SCALE, MAX_GRAPH_SCALE);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setGraph(clampGraph({
      x: -centerX * nextScale,
      y: -centerY * nextScale,
      scale: nextScale,
      tilt: 0
    }));
  };

  useEffect(() => {
    if (view !== "synapse" || !activeBrain || !topicLayoutPoints.length) return;
    if (activeTopic && !shouldFitGraphAfterLoad.current) return;
    shouldFitGraphAfterLoad.current = false;
    window.requestAnimationFrame(() => {
      fitGraphToTopics();
    });
  }, [activeBrain?.id, activeTopic?.id, topicLayoutPoints, view]);

  // 현재 Topic/User 정보에 따라 모달 문구와 연결 엔드포인트를 생성합니다.
  const modalCopy = useMemo(() => createModalCopy({
    activeTopic,
    user: pageData.user
  }), [activeTopic, pageData.user]);

  // 마우스 휠이나 +/- 버튼으로 확대/축소할 때 커서 위치를 기준으로 카메라를 이동합니다.
  const zoomGraph = (nextScale, anchorX, anchorY) => {
    const field = graphFieldRef.current;
    if (!field) return;

    const rect = field.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height * 0.54);

    setGraph((current) => {
      const clampedScale = clamp(nextScale, MIN_GRAPH_SCALE, MAX_GRAPH_SCALE);
      const localX = (anchorX - centerX - current.x) / current.scale;
      const localY = (anchorY - centerY - current.y) / current.scale;
      return clampGraph({
        scale: clampedScale,
        x: anchorX - centerX - (localX * clampedScale),
        y: anchorY - centerY - (localY * clampedScale),
        tilt: 0
      });
    });
  };

  // 토픽/노드 클릭 시 축소 후 이동하고 다시 확대하는 Prezi 느낌의 카메라 이동입니다.
  const focusGraphPoint = (x, y, scale) => {
    const clampedScale = clamp(scale, MIN_GRAPH_SCALE, MAX_GRAPH_SCALE);

    window.clearTimeout(flightTimer.current);
    setFlying(true);

    setGraph((current) => {
      const targetX = -x * clampedScale;
      const targetY = -y * clampedScale;
      const travelX = targetX - current.x;
      const tilt = Math.max(-1.8, Math.min(1.8, travelX / 420));
      return clampGraph({
        scale: Math.max(MIN_GRAPH_SCALE, Math.min(current.scale, 1) * 0.88),
        x: current.x + ((targetX - current.x) * 0.18),
        y: current.y + ((targetY - current.y) * 0.18),
        tilt
      });
    });

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setGraph(clampGraph({ scale: clampedScale, x: -x * clampedScale, y: -y * clampedScale, tilt: 0 }));
      });
    });

    flightTimer.current = window.setTimeout(() => setFlying(false), 780);
  };

  // 짧은 상태 메시지를 띄우고 일정 시간 뒤 자동으로 숨깁니다.
  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const resolveActiveTopicForNeuron = async () => {
    if (!activeTopic) {
      showToast("Topic을 먼저 선택해주세요.");
      return null;
    }

    if (activeTopic.btid) return activeTopic;

    if (!activeBrain) return activeTopic;

    try {
      const detail = await apiGet(endpoints.brains.topicDetail(activeBrain.id, activeTopic.id));
      if (!detail?.btid) return activeTopic;

      const nextBtid = String(detail.btid);
      setPageData((current) => ({
        ...current,
        topics: updateTopicBtid(current.topics, activeTopic.id, nextBtid)
      }));
      setTopicCatalog((current) => {
        const nextCatalog = updateTopicBtid(current, activeTopic.id, nextBtid);
        rememberTopicCatalog(activeBrain.id, nextCatalog);
        return nextCatalog;
      });
      return { ...activeTopic, btid: nextBtid };
    } catch (error) {
      return activeTopic;
    }
  };

  const openNodeCreateModal = async () => {
    if (isBrainPreview) {
      showToast("미리보기에서는 Neuron을 작성할 수 없습니다.");
      return;
    }

    const topicForNeuron = await resolveActiveTopicForNeuron();
    if (!topicForNeuron) return;

    if (!topicForNeuron.btid) {
      showToast("Brain에 표시된 Topic에서만 Neuron을 작성할 수 있습니다.");
      return;
    }

    setNodeDraft({ isOpen: true, title: "", content: "", status: "", isSubmitting: false, btid: topicForNeuron.btid });
  };

  const closeNodeCreateModal = () => {
    setNodeDraft({ isOpen: false, title: "", content: "", status: "", isSubmitting: false, btid: null });
  };

  const updateNodeDraft = (event) => {
    const { name, value } = event.target;

    if (name === "content") {
      setNodeDraft((current) => ({
        ...current,
        content: truncateToByteLimit(value, NODE_CONTENT_BYTE_LIMIT),
        status: ""
      }));
      return;
    }

    setNodeDraft((current) => ({ ...current, [name]: value, status: "" }));
  };

  const submitNodeDraft = async (event) => {
    event.preventDefault();

    const targetBtid = activeTopic?.btid || nodeDraft.btid;
    if (!targetBtid) {
      setNodeDraft((current) => ({ ...current, status: "Brain Topic 연결 정보가 없습니다." }));
      return;
    }

    const title = nodeDraft.title.trim();
    const content = nodeDraft.content.trim();

    if (!title || !content) {
      setNodeDraft((current) => ({ ...current, status: "제목과 내용을 모두 입력해주세요." }));
      return;
    }

    if (getByteLength(content) > NODE_CONTENT_BYTE_LIMIT) {
      setNodeDraft((current) => ({ ...current, status: `내용은 ${NODE_CONTENT_BYTE_LIMIT.toLocaleString()}Byte 이하로 작성해주세요.` }));
      return;
    }

    setNodeDraft((current) => ({ ...current, isSubmitting: true, status: "" }));

    try {
      const created = await apiPost(endpoints.nodes.create, {
        title,
        content,
        btid: Number(targetBtid)
      });
      const nextNode = normalizeNodes([created])[0];
      const targetTopic = flattenTopics(pageData.topics).find((topic) => String(topic.btid) === String(targetBtid));
      const targetTopicId = targetTopic ? String(targetTopic.id) : String(activeTopic?.id || "");
      setPageData((current) => ({
        ...current,
        nodes: [nextNode, ...current.nodes],
        topicNodesById: targetTopicId
          ? {
            ...(current.topicNodesById || {}),
            [targetTopicId]: [nextNode, ...(current.topicNodesById?.[targetTopicId] || [])]
          }
          : current.topicNodesById || {}
      }));
      setNodeDetail({ isOpen: true, isLoading: false, data: normalizeNodeDetail(created), status: "", liked: false });
      closeNodeCreateModal();
      setView("posts");
      const nextRoute = buildNodeRoute(activeBrain?.id, activeTopic?.id, created.nid || nextNode.id, { preview: isBrainPreview });
      routeTo(nextRoute);
      setRoute(nextRoute);
      showToast(`${created.title || title} Neuron 작성 완료`);
    } catch (error) {
      setNodeDraft((current) => ({ ...current, isSubmitting: false, status: `Neuron 작성 실패 · ${normalizeErrorMessage(error.message)}` }));
    }
  };

  // 모달 확인 버튼 처리입니다. 현재는 Topic 생성만 실제 WAS API에 연결되어 있습니다.
  const confirmModal = async () => {
    const copy = modalCopy[modal];

    try {
      if (modal === "createTopic") {
        const input = document.querySelector(".modal-fields input");
        const name = input?.value?.trim() || "새 Topic";
        const createdTopic = await apiPost(copy.endpoint, { name });
        if (activeBrain && createdTopic?.tid != null) {
          await apiPost(endpoints.brains.registerTopics(activeBrain.id), { topics: [createdTopic.tid] });
          await loadBrainWorkspace(activeBrain.id, String(createdTopic.tid));
        } else {
          await loadMainData();
        }
        setModal(null);
        showToast(`Topic 생성 완료 · ${createdTopic.name || name}`);
        return;
      }

      setModal(null);
      showToast(`${copy.primary} 요청 준비됨 · ${copy.endpoint}`);
    } catch (error) {
      setModal(null);
      showToast(`${copy.primary} 실패 · ${error.message}`);
    }
  };

  // 버튼 클릭으로 route를 이동합니다. 드래그 직후 발생한 클릭은 무시합니다.
  const handleRouteClick = (event, path) => {
    if (suppressNextClick.current) {
      event?.preventDefault?.();
      suppressNextClick.current = false;
      return;
    }

    event?.preventDefault?.();
    setRoute(path);
    routeTo(path);
  };

  // Brain 클릭 시 왼쪽 목록의 activeBrainId를 바꾸고 route를 이동합니다.
  const selectBrain = (event, brainId, options = {}) => {
    const targetBrainId = String(brainId);
    const cachedState = brainTabState.current[targetBrainId];
    const isCurrentBrain = String(pageData.activeBrainId) === targetBrainId;

    if (isCurrentBrain) {
      event?.preventDefault?.();
      rememberActiveBrainState();
      if (options.openTab !== false) {
        addBrainTab(brainId);
      }
      if (!pageData.topics?.length) {
        loadBrainWorkspace(brainId, pageData.activeTopicId || cachedState?.activeTopicId || null, {
          view: cachedState?.view || view || "synapse"
        });
      }
      return;
    }

    const nextRoute = buildBrainStateRoute(targetBrainId, cachedState);

    ++workspaceLoadSeq.current;
    rememberActiveBrainState();
    if (options.openTab !== false) {
      addBrainTab(brainId);
    }

    const hasUsableCachedState = Boolean(cachedState?.topics?.length);
    const hasCachedState = hasUsableCachedState && applyCachedBrainState(brainId, cachedState);

    if (!hasCachedState) {
      setPageData((current) => ({
        ...current,
        activeBrainId: String(brainId),
        activeTopicId: null,
        previewBrain: null,
        topics: [],
        nodes: [],
        topicNodesById: {},
        quizStatusByTopicId: {}
      }));
      setView("synapse");
      setGraph(clampGraph({ x: 0, y: 0, scale: MIN_GRAPH_SCALE, tilt: 0 }));
    }

    handleRouteClick(event, nextRoute);
    if (!hasCachedState || options.refresh === true) {
      loadBrainWorkspace(brainId, cachedState?.activeTopicId || null, { view: cachedState?.view || "synapse" });
    }
  };

  // Chrome 탭처럼 열린 Brain 탭을 닫습니다. 현재 탭을 닫으면 옆 탭으로 이동하고, 없으면 빈 메인으로 돌아갑니다.
  const closeBrainTab = (event, brainId) => {
    event.stopPropagation();

    setOpenBrainTabs((current) => {
      const index = current.findIndex((brain) => String(brain.id) === String(brainId));
      const nextTabs = current.filter((brain) => String(brain.id) !== String(brainId));

      if (String(pageData.activeBrainId) === String(brainId)) {
        const nextBrain = nextTabs[index] || nextTabs[index - 1] || null;

        if (nextBrain) {
          ++workspaceLoadSeq.current;
          const cachedState = brainTabState.current[String(nextBrain.id)];
          const hasCachedState = applyCachedBrainState(nextBrain.id, cachedState);
          const nextRoute = buildBrainStateRoute(nextBrain.id, cachedState);
          setRoute(nextRoute);
          routeTo(nextRoute);
          if (!hasCachedState) {
            loadBrainWorkspace(nextBrain.id, cachedState?.activeTopicId || null, { view: cachedState?.view || "synapse" });
          }
        } else {
          ++workspaceLoadSeq.current;
          setPageData((currentPageData) => ({
            ...currentPageData,
            activeBrainId: null,
            activeTopicId: null,
            topics: [],
            nodes: [],
            topicNodesById: {},
            quizStatusByTopicId: {}
          }));
          setView("synapse");
          routeTo("/main");
        }
      }

      return nextTabs;
    });
  };

  // Topic 클릭 시 실제 화면에 그려진 Topic Tree 좌표로 그래프 카메라를 이동합니다.
  const moveToTopic = (event, topicId, options = {}) => {
    const shouldUpdateRoute = options.updateRoute !== false;
    const shouldOpenPosts = options.openPosts === true;

    if (suppressNextClick.current) {
      suppressNextClick.current = false;
    }

    const selectedTopic = topicsFlat.find((topic) => String(topic.id) === String(topicId)) || null;

    if (!shouldOpenPosts && activeTopic && String(activeTopic.id) === String(topicId)) {
      const nextRoute = activeBrain?.id ? `/brains/${activeBrain.id}${isBrainPreview ? "/preview" : ""}` : "/main/synapse";
      setView("synapse");
      setNodeDetail({ isOpen: false, isLoading: false, data: null, status: "", liked: false });
      setPageData((current) => ({
        ...current,
        activeTopicId: null,
        nodes: []
      }));
      if (shouldUpdateRoute) handleRouteClick(event, nextRoute);
      return;
    }

    if (shouldOpenPosts) {
      setNodeDetail({ isOpen: false, isLoading: false, data: null, status: "", liked: false });
      setView("posts");
      setPageData((current) => ({
        ...current,
        activeTopicId: String(topicId),
        nodes: current.topicNodesById?.[String(topicId)] || []
      }));
      if (shouldUpdateRoute) handleRouteClick(event, buildTopicRoute(activeBrain?.id, topicId, "posts", { preview: isBrainPreview }));
      if (activeBrain) {
        fetchTopicNodes(activeBrain.id, selectedTopic).then((nodes) => {
          setPageData((current) => String(current.activeTopicId) === String(topicId) ? {
            ...current,
            nodes,
            topicNodesById: { ...(current.topicNodesById || {}), [String(topicId)]: nodes }
          } : {
            ...current,
            topicNodesById: { ...(current.topicNodesById || {}), [String(topicId)]: nodes }
          });
        });
      }
      return;
    }

    const targetPoint = topicLayoutPoints.find((point) => String(point.topic.id) === String(topicId));
    if (targetPoint) focusGraphPoint(targetPoint.x, targetPoint.y, 0.67);

    setView("synapse");
    setNodeDetail({ isOpen: false, isLoading: false, data: null, status: "", liked: false });
    setPageData((current) => ({
      ...current,
      activeTopicId: topicId,
      nodes: current.topicNodesById?.[String(topicId)] || []
    }));
    if (activeBrain && selectedTopic?.btid && !pageData.topicNodesById?.[String(topicId)]) {
      fetchTopicNodePreviews(activeBrain.id, selectedTopic).then((nodes) => {
        setPageData((current) => ({
          ...current,
          nodes: String(current.activeTopicId) === String(topicId) ? nodes : current.nodes,
          topicNodesById: { ...(current.topicNodesById || {}), [String(topicId)]: nodes }
        }));
      });
    }
    if (shouldUpdateRoute) handleRouteClick(event, buildTopicRoute(activeBrain?.id, topicId, "synapse", { preview: isBrainPreview }));
  };

  const openNodeDetail = (event, nodeId, topicId = activeTopic?.id) => {
    if (topicId) {
      setPageData((current) => ({ ...current, activeTopicId: String(topicId) }));
    }
    handleRouteClick(event, buildNodeRoute(activeBrain?.id, topicId, nodeId, { preview: isBrainPreview }));
    loadNodeDetail(nodeId);
  };

  const closeNodeDetail = (event) => {
    const nextRoute = activeTopic ? buildTopicRoute(activeBrain?.id, activeTopic.id, "posts", { preview: isBrainPreview }) : "/main/posts";
    setNodeDetail({ isOpen: false, isLoading: false, data: null, status: "", liked: false });
    setCommentDraft({ content: "", status: "", isSubmitting: false, parentId: null, editingId: null });
    setView("posts");
    handleRouteClick(event, nextRoute);
  };

  const deleteNode = async () => {
    const nodeId = nodeDetail.data?.id;
    if (!nodeId) return;
    if (!canDeleteNode(nodeDetail.data)) {
      showToast("Neuron 삭제는 관리자, 매니저 또는 작성자만 가능합니다.");
      return;
    }

    const shouldDelete = window.confirm("이 Neuron을 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.");
    if (!shouldDelete) return;

    try {
      await apiDelete(endpoints.nodes.remove(nodeId));
      const nextRoute = activeTopic ? buildTopicRoute(activeBrain?.id, activeTopic.id, "posts", { preview: isBrainPreview }) : "/main/posts";
      setPageData((current) => ({
        ...current,
        nodes: current.nodes.filter((node) => String(node.id) !== String(nodeId)),
        topicNodesById: Object.fromEntries(
          Object.entries(current.topicNodesById || {}).map(([topicId, nodes]) => [
            topicId,
            nodes.filter((node) => String(node.id) !== String(nodeId))
          ])
        )
      }));
      setNodeDetail({ isOpen: false, isLoading: false, data: null, status: "", liked: false });
      setCommentDraft({ content: "", status: "", isSubmitting: false, parentId: null, editingId: null });
      setView("posts");
      setRoute(nextRoute);
      routeTo(nextRoute);
      showToast("Neuron 삭제 완료");
    } catch (error) {
      showToast(`Neuron 삭제 실패 · ${error.message}`);
    }
  };

  const toggleNodeRecommend = async () => {
    if (isBrainPreview) {
      showToast("미리보기에서는 추천할 수 없습니다.");
      return;
    }

    const nodeId = nodeDetail.data?.id;
    if (!nodeId) return;

    try {
      const result = await apiPost(endpoints.nodes.like(nodeId), {});
      const nextLikeCount = result?.likeCount ?? nodeDetail.data.recommends ?? 0;
      const nextLiked = result?.liked ?? !nodeDetail.liked;

      setNodeDetail((current) => {
        if (!current.data || String(current.data.id) !== String(nodeId)) return current;
        return {
          ...current,
          liked: nextLiked,
          data: {
            ...current.data,
            recommends: nextLikeCount,
            liked: nextLiked
          }
        };
      });
      setPageData((current) => ({
        ...current,
        nodes: current.nodes.map((node) => (
          String(node.id) === String(nodeId) ? { ...node, recommends: nextLikeCount } : node
        )),
        topicNodesById: Object.fromEntries(
          Object.entries(current.topicNodesById || {}).map(([topicId, nodes]) => [
            topicId,
            nodes.map((node) => (
              String(node.id) === String(nodeId) ? { ...node, recommends: nextLikeCount } : node
            ))
          ])
        )
      }));
    } catch (error) {
      showToast(`추천 처리 실패 · ${error.message}`);
    }
  };

  const updateCommentDraft = (event) => {
    setCommentDraft((current) => ({ ...current, content: event.target.value, status: "" }));
  };

  const resetCommentDraft = () => {
    setCommentDraft({ content: "", status: "", isSubmitting: false, parentId: null, editingId: null });
  };

  const syncNodeCommentCount = (nodeId, count) => {
    setPageData((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (
        String(node.id) === String(nodeId)
          ? { ...node, comments: count }
          : node
      )),
      topicNodesById: Object.fromEntries(
        Object.entries(current.topicNodesById || {}).map(([topicId, nodes]) => [
          topicId,
          nodes.map((node) => (
            String(node.id) === String(nodeId)
              ? { ...node, comments: count }
              : node
          ))
        ])
      )
    }));
  };

  // WAS에 알림 목록 API가 아직 없어, 댓글 작성 직후 현재 화면의 알림/활동만 즉시 갱신합니다.
  const pushLocalCommentActivity = (nodeId, comment, content, isReply = false) => {
    const now = new Date().toISOString();
    const nodeTitle = nodeDetail.data?.title || "Neuron";
    const author = comment?.writer || pageData.user.name || "작성자";
    const topicName = activeTopic?.name || "Topic";
    const brainName = activeBrain?.name || "Brain";
    const activityId = comment?.id || `${nodeId}-${Date.now()}`;

    setPageData((current) => ({
      ...current,
      notifications: [
        {
          id: `notice-comment-${activityId}`,
          brain: brainName,
          topic: topicName,
          nodeId,
          node: nodeTitle,
          author,
          type: "comment",
          createdAt: comment?.createdAt || now,
          route: buildNodeRoute(activeBrain?.id, activeTopic?.id, nodeId, { preview: isBrainPreview })
        },
        ...(current.notifications || [])
      ].slice(0, 6),
      activities: [
        {
          id: `activity-comment-${activityId}`,
          type: "commented",
          user: author,
          text: `${nodeTitle}에 ${isReply ? "답글" : "댓글"}을 작성했습니다.`,
          time: "방금 전",
          route: buildNodeRoute(activeBrain?.id, activeTopic?.id, nodeId, { preview: isBrainPreview }),
          preview: content
        },
        ...(current.activities || [])
      ].slice(0, 8)
    }));
  };

  const removeCommentWithReplies = (comments, commentId) => {
    const deletedIds = new Set([String(commentId)]);
    let changed = true;

    while (changed) {
      changed = false;
      comments.forEach((comment) => {
        if (comment.parentId && deletedIds.has(String(comment.parentId)) && !deletedIds.has(String(comment.id))) {
          deletedIds.add(String(comment.id));
          changed = true;
        }
      });
    }

    return comments.filter((comment) => !deletedIds.has(String(comment.id)));
  };

  const submitComment = async (event) => {
    event.preventDefault();
    if (!isAuthenticated) {
      setCommentDraft((current) => ({ ...current, status: "로그인 후 댓글을 작성할 수 있습니다." }));
      return;
    }

    const content = commentDraft.content.trim();
    const nodeId = nodeDetail.data?.id;

    if (!nodeId) return;
    if (!content) {
      setCommentDraft((current) => ({ ...current, status: "댓글 내용을 입력해주세요." }));
      return;
    }

    setCommentDraft((current) => ({ ...current, isSubmitting: true, status: "" }));

    try {
      if (commentDraft.editingId) {
        const updatedComment = await apiPatch(endpoints.comments.update(commentDraft.editingId), { content });
        const [nextComment] = normalizeComments([updatedComment]);
        const nextComments = nodeDetail.data.comments.map((comment) => (
          String(comment.id) === String(commentDraft.editingId)
            ? { ...comment, ...nextComment, id: comment.id, parentId: comment.parentId, content: nextComment?.content || content }
            : comment
        ));

        setNodeDetail((current) => ({
          ...current,
          data: current.data ? { ...current.data, comments: nextComments } : current.data
        }));
        resetCommentDraft();
        showToast("댓글 수정 완료");
        return;
      }

      const createdComment = await apiPost(endpoints.comments.create, {
        nid: Number(nodeId),
        pid: commentDraft.parentId ? Number(commentDraft.parentId) : null,
        content
      });
      const [nextComment] = normalizeComments([createdComment]);
      const nextComments = [...nodeDetail.data.comments, nextComment];

      setNodeDetail((current) => ({
        ...current,
        data: current.data
          ? { ...current.data, comments: nextComments }
          : current.data
      }));
      syncNodeCommentCount(nodeId, nextComments.length);
      pushLocalCommentActivity(nodeId, nextComment, content, Boolean(commentDraft.parentId));
      resetCommentDraft();
      showToast(commentDraft.parentId ? "답글 작성 완료" : "댓글 작성 완료");
    } catch (error) {
      setCommentDraft((current) => ({
        ...current,
        isSubmitting: false,
        status: `${current.editingId ? "댓글 수정" : "댓글 작성"} 실패 · ${error.message}`
      }));
    }
  };

  const startCommentReply = (comment) => {
    if (!isAuthenticated) {
      setCommentDraft((current) => ({ ...current, status: "로그인 후 답글을 작성할 수 있습니다." }));
      return;
    }

    setCommentDraft({ content: "", status: "", isSubmitting: false, parentId: String(comment.id), editingId: null });
  };

  const startCommentEdit = (comment) => {
    if (!isAuthenticated) {
      setCommentDraft((current) => ({ ...current, status: "로그인 후 댓글을 수정할 수 있습니다." }));
      return;
    }

    setCommentDraft({ content: comment.content || "", status: "", isSubmitting: false, parentId: null, editingId: String(comment.id) });
  };

  const deleteComment = async (comment) => {
    if (!isAuthenticated) {
      setCommentDraft((current) => ({ ...current, status: "로그인 후 댓글을 삭제할 수 있습니다." }));
      return;
    }

    if (!nodeDetail.data) return;
    const shouldDelete = window.confirm("댓글을 삭제하시겠습니까?");
    if (!shouldDelete) return;

    try {
      await apiDelete(endpoints.comments.remove(comment.id));
      const nextComments = removeCommentWithReplies(nodeDetail.data.comments, comment.id);
      setNodeDetail((current) => ({
        ...current,
        data: current.data ? { ...current.data, comments: nextComments } : current.data
      }));
      syncNodeCommentCount(nodeDetail.data.id, nextComments.length);
      if (String(commentDraft.editingId) === String(comment.id) || String(commentDraft.parentId) === String(comment.id)) {
        resetCommentDraft();
      }
      showToast("댓글 삭제 완료");
    } catch (error) {
      setCommentDraft((current) => ({ ...current, status: `댓글 삭제 실패 · ${error.message}` }));
    }
  };

  // 그래프 빈 영역을 누르면 pan 시작 정보를 저장합니다.
  const handlePointerDown = (event) => {
    if (event.button !== 0) return;
    if (view !== "synapse" || !activeBrain || modal) return;
    if (event.target instanceof Element && event.target.closest("button, a, input, textarea, select")) return;

    panSession.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: graph.x,
      originY: graph.y,
      moved: false
    };
    setPanning(true);
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // route 변경이나 브라우저 제스처 중 capture가 실패해도 그래프 화면은 유지합니다.
    }
  };

  // 드래그 중인 거리만큼 그래프 카메라 좌표를 이동합니다.
  const handlePointerMove = (event) => {
    const session = panSession.current;
    if (!session) return;

    event.preventDefault();
    const dx = event.clientX - session.startX;
    const dy = event.clientY - session.startY;
    if (Math.abs(dx) + Math.abs(dy) > 6) session.moved = true;
    setGraph((current) => clampGraph({
      ...current,
      x: session.originX + dx,
      y: session.originY + dy
    }));
  };

  // 드래그가 끝나면 다음 click 이벤트가 잘못 실행되지 않도록 보정합니다.
  const handlePointerUp = (event) => {
    if (!panSession.current) return;

    if (panSession.current.moved) suppressNextClick.current = true;
    panSession.current = null;
    setPanning(false);
    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch (error) {
      // 이미 capture가 해제된 경우 무시합니다.
    }
  };

  // 휠 스크롤로 그래프를 확대/축소합니다.
  const handleWheel = (event) => {
    if (view !== "synapse" || !activeBrain) return;

    event.preventDefault();
    event.stopPropagation();
    zoomGraph(graph.scale * (event.deltaY > 0 ? 0.9 : 1.1), event.clientX, event.clientY);
  };

  // CSS에서 pan/flight/zoom 상태에 맞는 애니메이션을 적용하기 위한 클래스입니다.
  const graphClassName = [
    "graph-field",
    panning ? "is-panning" : "",
    flying ? "is-flying" : "",
    isZoomed ? "is-zoomed" : ""
  ].filter(Boolean).join(" ");

  // 오른쪽 패널 접기/펼치기 토글입니다.
  const toggleRight = () => setRightCollapsed((value) => !value);

  // 관리모드에서 공통 Topic 트리를 열어 Brain별 표시 상태를 관리합니다.
  // Topic 관리 버튼을 누르면 공통 Topic Catalog를 확보한 뒤 관리 모달을 엽니다.
  const openTopicPanel = () => {
    setTopicSearch({
      query: "",
      isSearching: false,
      isLoading: false,
      topics: [],
      matchedTopicIds: [],
      expandedTopicIds: [],
      message: ""
    });
    setTopicPanelMode("manage");
    loadTopicCatalog();
  };

  const clearTopicSearch = () => {
    setTopicSearch({
      query: "",
      isSearching: false,
      isLoading: false,
      topics: [],
      matchedTopicIds: [],
      expandedTopicIds: [],
      message: ""
    });
  };

  // T07 Topic 검색 API: 검색된 Topic과 부모/조상 Topic 경로를 받아 트리로 보여줍니다.
  const searchTopicsFromPanel = async (keyword) => {
    const queryText = String(keyword || "").trim();
    if (!queryText) {
      clearTopicSearch();
      return;
    }

    if (!activeBrain?.id) {
      setTopicSearch((current) => ({
        ...current,
        query: queryText,
        isSearching: true,
        isLoading: false,
        topics: [],
        matchedTopicIds: [],
        expandedTopicIds: [],
        message: "Brain을 먼저 선택해주세요."
      }));
      return;
    }

    setTopicSearch((current) => ({
      ...current,
      query: queryText,
      isSearching: true,
      isLoading: true,
      message: ""
    }));

    try {
      const result = await apiGet(endpoints.topics.searchParents(queryText, activeBrain.id));
      const paths = Array.isArray(result?.topics) ? result.topics : [];
      const searchTree = buildTopicSearchTree(paths, topicCatalog);
      const searchBranches = await Promise.all(
        searchTree.map((topic) => loadTopicBranchFromT02(topic, activeBrain.id))
      );
      const hydratedSearchTree = markAncestorUsing(applyTopicUseMap(searchBranches, topicUseMap(topicCatalog)));
      const matchedTopicIds = getTopicSearchMatchIds(paths);
      const expandedTopicIds = getTopicSearchExpandedIds(paths);
      setTopicSearch({
        query: queryText,
        isSearching: true,
        isLoading: false,
        topics: hydratedSearchTree,
        matchedTopicIds,
        expandedTopicIds,
        message: paths.length ? `${matchedTopicIds.length}개 검색 결과` : "검색 결과가 없습니다."
      });
    } catch (error) {
      setTopicSearch({
        query: queryText,
        isSearching: true,
        isLoading: false,
        topics: [],
        matchedTopicIds: [],
        expandedTopicIds: [],
        message: `토픽 검색 실패 · ${error.message}`
      });
    }
  };

  // T04 Topic 생성 API: 선택한 부모 Topic 아래에 새 Topic을 만들고 Catalog/화면 트리를 갱신합니다.
  const createTopicFromPanel = async (parentTopicId, name) => {
    try {
      const createdTopic = await apiPost(endpoints.topics.create(parentTopicId), { name });
      const nextTopic = {
        id: String(createdTopic.tid),
        btid: null,
        pid: createdTopic.pid == null && parentTopicId == null ? null : createdTopic.pid == null ? String(parentTopicId) : String(createdTopic.pid),
        name: createdTopic.name || name,
        isUsing: true,
        children: []
      };

      if (activeBrain && createdTopic?.tid != null) {
        try {
          await apiPost(endpoints.brains.registerTopics(activeBrain.id), { topics: [createdTopic.tid] });
        } catch (error) {
          showToast(`Topic은 생성됐지만 Brain 등록은 실패했습니다 · ${error.message}`);
        }
      }

      setTopicCatalog((current) => {
        const nextCatalog = markAncestorUsing(addTopicToTree(current, parentTopicId, nextTopic));
        commonTopicCatalog.current = markAncestorUsing(addTopicToTree(commonTopicCatalog.current, parentTopicId, { ...nextTopic, isUsing: false }));
        rememberTopicCatalog(activeBrain?.id, nextCatalog);
        syncVisibleTopics(nextCatalog);
        return nextCatalog;
      });
      clearTopicSearch();
      showToast(`${nextTopic.name} Topic 생성 완료`);
    } catch (error) {
      const message = error.status === 409 || error.code === "T002"
        ? "같은 부모 아래에 이미 같은 이름의 토픽이 있습니다."
        : error.message;
      showToast(`Topic 생성 실패 · ${message}`);
      throw new Error(message);
    }
  };

  // B09/B10 기반 Topic 표시 토글입니다. 자식 숨김/부모 표시 규칙도 여기서 맞춥니다.
  const toggleTopicUse = async (topic) => {
    if (!activeBrain?.id) return;

    const nextState = !isTopicUsing(topic.isUsing);
    const topicPathIds = nextState ? findTopicPathIds(topicCatalog, topic.id) : [String(topic.id)];

    try {
      if (nextState) {
        await apiPost(endpoints.brains.registerTopics(activeBrain.id), { topics: topicPathIds.map(Number) });
      } else {
        try {
          await apiDelete(endpoints.brains.removeTopics(activeBrain.id), { unsafe: false, topics: topicPathIds.map(Number) });
        } catch (error) {
          const hasNeuron = error.status === 409 || error.code === "B012";
          if (!hasNeuron) throw error;

          const confirmed = window.confirm("뉴런이 있는 Topic을 숨기면 해당 뉴런이 삭제됩니다. 그래도 숨기시겠습니까?");
          if (!confirmed) return;

          await apiDelete(endpoints.brains.removeTopics(activeBrain.id), { unsafe: true, topics: topicPathIds.map(Number) });
        }
      }
    } catch (error) {
      showToast(`${nextState ? "Topic 표시" : "Topic 숨김"} 실패 · ${error.message}`);
      return;
    }

    setTopicCatalog((current) => {
      const nextCatalog = markAncestorUsing(setTopicUseWithAncestors(current, topic.id, nextState));
      rememberTopicCatalog(activeBrain?.id, nextCatalog);
      syncVisibleTopics(nextCatalog, nextState ? topic.id : null);
      return nextCatalog;
    });
    setTopicSearch((current) => current.isSearching
      ? {
          ...current,
          topics: markAncestorUsing(setTopicUseWithAncestors(current.topics, topic.id, nextState))
        }
      : current);

    showToast(nextState ? `${topic.name} Topic 표시` : `${topic.name} Topic 숨김`);
  };

  // Brain 관리 모달 데이터 로드: Brain 정보, 현재 멤버, 초대 가능 사용자, 가입 요청을 병렬 조회합니다.
  const loadBrainManagerData = async (brainId, keyword = "", mode = brainManager.mode || "manage") => {
    setBrainManager((current) => ({ ...current, isLoading: true, message: "" }));
    const isManagePanel = mode === "manage";

    const [infoResult, membersResult, availableResult, requestsResult] = await Promise.allSettled([
      apiGet(endpoints.brains.info(brainId)),
      apiGet(endpoints.brains.members(brainId, 0, 50)),
      isManagePanel ? apiGet(endpoints.brains.availableUsers(brainId, keyword, 0, 20)) : Promise.resolve(null),
      isManagePanel ? apiGet(endpoints.brains.joinRequests(brainId, 0, 50)) : Promise.resolve(null)
    ]);

    const failed = [infoResult, membersResult, availableResult, requestsResult]
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason?.message)
      .filter(Boolean);
    const brainInfo = infoResult.status === "fulfilled" ? normalizeBrain(infoResult.value) : null;
    const currentUserRoleFallback = {
      id: "",
      email: pageData.user?.email || "",
      role: activeBrain?.brainRole || activeBrain?.role || brainManager.brain?.brainRole || brainManager.brain?.role
    };

    setBrainManager((current) => ({
      ...current,
      isLoading: false,
      mode,
      brain: brainInfo ? { ...current.brain, ...brainInfo } : current.brain,
      form: brainInfo ? {
        name: brainInfo.name || "",
        description: brainInfo.description || "",
        joinPolicy: brainInfo.joinPolicy || "PROTECTED"
      } : current.form,
      members: membersResult.status === "fulfilled"
        ? normalizeBrainMemberPage(membersResult.value, [...current.members, currentUserRoleFallback])
        : current.members,
      availableUsers: isManagePanel && availableResult.status === "fulfilled" ? normalizeBrainUserPage(availableResult.value) : current.availableUsers,
      joinRequests: isManagePanel && requestsResult.status === "fulfilled" ? normalizeBrainUserPage(requestsResult.value) : current.joinRequests,
      message: failed.length ? `일부 정보를 불러오지 못했습니다 · ${failed[0]}` : ""
    }));
  };

  // B19 권한 변경 API: 관리자만 멤버를 일반학생/매니저/관리자로 바꿀 수 있습니다.
  const changeBrainMemberRole = async (member, role) => {
    if (!brainManager.brain) return;
    const nextRole = normalizeRoleValue(role);

    try {
      await apiPatch(endpoints.brains.changeUserRole(brainManager.brain.id, member.id), {
        role: nextRole
      });

      setBrainManager((current) => ({
        ...current,
        members: updateBrainUserRole(current.members, member.id, nextRole),
        message: `${member.name} 권한이 변경되었습니다.`
      }));
      showToast(`${member.name} 권한 변경 완료`);
      await loadBrainManagerData(brainManager.brain.id, brainManager.searchKeyword);
      await loadMainData();
    } catch (error) {
      setBrainManager((current) => ({
        ...current,
        message: `권한 변경 실패 · ${error.message}`
      }));
    }
  };

  const openBrainManager = async (event, brainId) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const brain = pageData.brains.find((item) => String(item.id) === String(brainId)) || activeBrain;
    if (!brain) return;
    const mode = canUseManageMode(brain.brainRole || brain.role) ? "manage" : "info";

    setBrainManager({
      ...emptyBrainManager,
      isOpen: true,
      isLoading: true,
      mode,
      brain,
      form: {
        name: brain.name || "",
        description: brain.description || "",
        joinPolicy: brain.joinPolicy || "PROTECTED"
      }
    });

    await loadBrainManagerData(brain.id, "", mode);
  };

  const closeBrainManager = () => setBrainManager(emptyBrainManager);

  const updateBrainManagerForm = (event) => {
    const { name, value, checked, type } = event.target;

    if (name === "joinPolicy") {
      setBrainManager((current) => ({
        ...current,
        form: { ...current.form, joinPolicy: checked ? "PROTECTED" : "PUBLIC" },
        message: ""
      }));
      return;
    }

    if (name === "searchKeyword") {
      setBrainManager((current) => ({ ...current, searchKeyword: value, message: "" }));
      return;
    }

    setBrainManager((current) => ({
      ...current,
      form: { ...current.form, [name]: type === "checkbox" ? checked : value },
      message: ""
    }));
  };

  // B07 Brain 정보 수정 API: 이름, 소개 문구, 가입 정책을 저장합니다.
  const saveBrainInfo = async () => {
    if (!brainManager.brain) return;

    const nextName = brainManager.form.name.trim();
    const nextDescription = brainManager.form.description.trim();
    const nextJoinPolicy = brainManager.form.joinPolicy;
    const currentName = (brainManager.brain.name || "").trim();
    const currentDescription = (brainManager.brain.description || "").trim();
    const currentJoinPolicy = brainManager.brain.joinPolicy || "PROTECTED";

    if (!nextName) {
      setBrainManager((current) => ({ ...current, message: "Brain 이름을 입력해주세요." }));
      return;
    }

    const payload = {};
    if (nextName !== currentName) payload.name = nextName;
    if (nextDescription !== currentDescription) payload.description = nextDescription;
    if (nextJoinPolicy !== currentJoinPolicy) payload.joinPolicy = nextJoinPolicy;

    if (!Object.keys(payload).length) {
      setBrainManager((current) => ({ ...current, message: "변경된 Brain 정보가 없습니다." }));
      return;
    }

    try {
      setBrainManager((current) => ({ ...current, isSaving: true, message: "" }));
      const updatedBrain = normalizeBrain(await apiPatch(endpoints.brains.update(brainManager.brain.id), payload));

      setPageData((current) => ({
        ...current,
        brains: current.brains.map((brain) => (
          String(brain.id) === String(updatedBrain.id)
            ? mergeBrainPreservingRole(brain, updatedBrain)
            : brain
        ))
      }));
      setOpenBrainTabs((current) => current.map((tab) => (
        String(tab.id) === String(updatedBrain.id)
          ? mergeBrainPreservingRole(tab, updatedBrain)
          : tab
      )));

      setBrainManager((current) => ({
        ...current,
        isSaving: false,
        brain: { ...current.brain, ...updatedBrain },
        form: {
          name: updatedBrain.name || "",
          description: updatedBrain.description || "",
          joinPolicy: updatedBrain.joinPolicy || "PROTECTED"
        },
        message: "Brain 정보가 수정되었습니다."
      }));
      showToast("Brain 정보 수정 완료");
    } catch (error) {
      setBrainManager((current) => ({
        ...current,
        isSaving: false,
        message: `Brain 정보 수정 실패 · ${error.message}`
      }));
    }
  };

  const searchAvailableUsers = async (event) => {
    event.preventDefault();
    if (!brainManager.brain) return;
    await loadBrainManagerData(brainManager.brain.id, brainManager.searchKeyword);
  };

  // B02 초대 API: 검색된 사용자를 현재 Brain 멤버로 추가합니다.
  const inviteBrainUser = async (user) => {
    if (!brainManager.brain) return;

    try {
      await apiPost(endpoints.brains.addUsers(brainManager.brain.id), { users: [user.id] });
      showToast(`${user.name} 멤버 추가 완료`);
      await loadBrainManagerData(brainManager.brain.id, brainManager.searchKeyword);
    } catch (error) {
      setBrainManager((current) => ({ ...current, message: `멤버 추가 실패 · ${error.message}` }));
    }
  };

  // B03 멤버 삭제 API: 관리자 내보내기/권한 없음 같은 예외 메시지는 여기서 사용자에게 보여줍니다.
  const removeBrainMember = async (member) => {
    if (!brainManager.brain) return;
    if (normalizeRoleValue(member.brainRole || member.role) === "ADMIN") {
      const message = "관리자는 내보낼 수 없습니다.";
      setBrainManager((current) => ({ ...current, message }));
      showToast(message);
      return;
    }

    try {
      await apiDelete(endpoints.brains.removeUsers(brainManager.brain.id), { users: [member.id] });
      showToast(`${member.name} 멤버 삭제 완료`);
      await loadBrainManagerData(brainManager.brain.id, brainManager.searchKeyword);
    } catch (error) {
      setBrainManager((current) => ({ ...current, message: `멤버 삭제 실패 · ${error.message}` }));
    }
  };

  // B15 가입 요청 승인/거부 API입니다.
  const manageJoinRequest = async (request, isAccept) => {
    if (!brainManager.brain) return;

    try {
      await apiPost(endpoints.brains.manageJoin(brainManager.brain.id), {
        isAccept,
        user: request.id
      });
      showToast(`${request.name} 가입 요청 ${isAccept ? "수락" : "거부"} 완료`);
      await loadBrainManagerData(brainManager.brain.id, brainManager.searchKeyword);
    } catch (error) {
      setBrainManager((current) => ({ ...current, message: `가입 요청 처리 실패 · ${error.message}` }));
    }
  };

  // B08 Brain 삭제 API입니다. 삭제 후에는 열린 탭과 현재 화면 상태를 정리합니다.
  const deleteBrain = async () => {
    if (!brainManager.brain) return;

    const brainId = String(brainManager.brain.id);
    const brainName = brainManager.brain.name || "Brain";
    const wasActiveBrain = String(pageData.activeBrainId) === brainId;
    const confirmed = window.confirm(`${brainName} Brain을 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.`);
    if (!confirmed) return;

    try {
      setBrainManager((current) => ({ ...current, isDeleting: true, message: "" }));
      await apiDelete(endpoints.brains.remove(brainId));

      delete brainTabState.current[brainId];
      setOpenBrainTabs((current) => current.filter((brain) => String(brain.id) !== brainId));
      setPageData((current) => ({
        ...current,
        activeBrainId: wasActiveBrain ? null : current.activeBrainId,
        activeTopicId: wasActiveBrain ? null : current.activeTopicId,
        brains: current.brains.filter((brain) => String(brain.id) !== brainId),
        topics: wasActiveBrain ? [] : current.topics,
        nodes: wasActiveBrain ? [] : current.nodes,
        topicNodesById: wasActiveBrain ? {} : current.topicNodesById,
        quizStatusByTopicId: wasActiveBrain ? {} : current.quizStatusByTopicId
      }));
      setTopicCatalog((current) => (wasActiveBrain ? [] : current));
      setBrainManager(emptyBrainManager);
      setView("synapse");
      setRoute("/main");
      routeTo("/main");
      showToast(`${brainName} Brain 삭제 완료`);
    } catch (error) {
      setBrainManager((current) => ({
        ...current,
        isDeleting: false,
        message: `Brain 삭제 실패 · ${error.message}`
      }));
    }
  };

  // B20 Brain 나가기 API입니다. 탈퇴 후 내 Brain 목록과 열린 탭에서 제거합니다.
  const leaveBrain = async () => {
    if (!brainManager.brain) return;

    const brainId = String(brainManager.brain.id);
    const brainName = brainManager.brain.name || "Brain";
    const wasActiveBrain = String(pageData.activeBrainId) === brainId;
    const confirmed = window.confirm(`${brainName} Brain에서 나가시겠습니까?`);
    if (!confirmed) return;

    try {
      setBrainManager((current) => ({ ...current, isLeaving: true, message: "" }));
      await apiDelete(endpoints.brains.leave(brainId));

      delete brainTabState.current[brainId];
      setOpenBrainTabs((current) => current.filter((brain) => String(brain.id) !== brainId));
      setPageData((current) => ({
        ...current,
        activeBrainId: wasActiveBrain ? null : current.activeBrainId,
        activeTopicId: wasActiveBrain ? null : current.activeTopicId,
        brains: current.brains.filter((brain) => String(brain.id) !== brainId),
        topics: wasActiveBrain ? [] : current.topics,
        nodes: wasActiveBrain ? [] : current.nodes,
        topicNodesById: wasActiveBrain ? {} : current.topicNodesById,
        quizStatusByTopicId: wasActiveBrain ? {} : current.quizStatusByTopicId
      }));
      setTopicCatalog((current) => (wasActiveBrain ? [] : current));
      setBrainManager(emptyBrainManager);
      setView("synapse");
      setRoute("/main");
      routeTo("/main");
      showToast(`${brainName} Brain에서 나갔습니다.`);
    } catch (error) {
      setBrainManager((current) => ({
        ...current,
        isLeaving: false,
        message: `Brain 탈퇴 실패 · ${error.message}`
      }));
    }
  };

  // Brain 검색 화면에서 가입 버튼을 누르면 PUBLIC은 즉시 가입, PROTECTED는 가입 대기 상태가 됩니다.
  const requestJoinBrain = async (brain) => {
    if (!isAuthenticated) {
      showToast("로그인해야 Brain에 가입할 수 있습니다.");
      return;
    }

    try {
      await apiPost(endpoints.brains.join(brain.id), {});
      const myBrains = await apiGet(endpoints.brains.mine);
      const joinedBrain = (myBrains?.brains || []).some((joined) => String(joined.id ?? joined.bid ?? joined.brainId) === String(brain.id));
      setBrainSearch((current) => ({
        ...current,
        results: current.results.map((item) => (
          String(item.id ?? item.bid ?? item.brainId) === String(brain.id)
            ? { ...item, joinStatus: joinedBrain ? "ACTIVE" : "PENDING" }
            : item
        ))
      }));
      showToast(joinedBrain ? `${brain.name} 가입이 완료되었습니다.` : `${brain.name} 가입 요청을 보냈습니다.`);
      await loadMainData();
    } catch (error) {
      showToast(`가입 요청 실패 · ${error.message}`);
    }
  };

  // 왼쪽 Sidebar 폭 조절 시작 지점입니다. 실제 드래그 처리는 전역 pointermove effect에서 합니다.
  const startSidebarResize = (event) => {
    event.preventDefault();
    sidebarResizeSession.current = {
      startX: event.clientX,
      startWidth: sidebarWidth
    };
    document.body.classList.add("is-resizing-sidebar");
  };

  // WAS 로그아웃 후 게스트 메인 화면으로 전환합니다.
  const logout = async () => {
    try {
      await apiPost(endpoints.auth.logout, {});
    } catch (error) {
      // 쿠키가 이미 만료된 경우에도 화면 상태는 게스트로 전환합니다.
    }

    sessionStorage.removeItem(AUTH_STATE_KEY);
    setAuthStatus("guest");
    setApiStatus("guest");
    setPageData((current) => ({
      ...current,
      ...guestPreview,
      previewBrain: null,
      user: { name: "Guest", email: "", role: "GUEST" }
    }));
    routeTo("/main");
  };

  // 실제 화면 조립: Sidebar / Workspace / InsightsPanel / 각종 모달을 연결합니다.
  return (
    <main className={`main-shell ${rightCollapsed ? "is-right-collapsed" : ""}`} style={{ "--sidebar-width": `${sidebarWidth}px` }} aria-label="SSArain main page">
      {/* 왼쪽 Brain/Topic 탐색 영역입니다. */}
      <Sidebar
        activeBrain={activeBrain}
        activeTopic={activeTopic}
        apiStatus={apiStatus}
        canManageBrain={canManageBrain}
        canManageWorkspace={canManageWorkspace}
        isAuthenticated={isAuthenticated}
        pageData={pageData}
        onMoveToTopic={moveToTopic}
        onOpenBrainManage={openBrainManager}
        onOpenModal={setModal}
        onLogout={logout}
        onRoute={handleRouteClick}
        onResizeStart={startSidebarResize}
        onSelectBrain={selectBrain}
      />

      {/* 중앙 Synapse 그래프와 Post List 전환 영역입니다. */}
      <Workspace
        activeBrain={activeBrain}
        activeTopic={activeTopic}
        graph={graph}
        graphClassName={graphClassName}
        graphFieldRef={graphFieldRef}
        pageData={pageData}
        view={view}
        brainSearch={brainSearch}
        openBrainTabs={openBrainTabs}
        isAuthenticated={isAuthenticated}
        isBrainSearchView={isBrainSearchView}
        isBrainPreview={isBrainPreview}
        canCreateNeuron={!isBrainPreview}
        canManageWorkspace={canManageWorkspace}
        manageMode={manageMode}
        onFocusPoint={focusGraphPoint}
        onJoinBrain={requestJoinBrain}
        onPreviewBrain={previewBrainFromSearch}
        onMoveToTopic={moveToTopic}
        onOpenNodeDetail={openNodeDetail}
        onOpenNodeModal={openNodeCreateModal}
        onOpenModal={setModal}
        onOpenTopicPanel={openTopicPanel}
        onSearchBrains={searchBrains}
        onSelectBrain={selectBrain}
        onCloseBrainTab={closeBrainTab}
        onToggleManageMode={() => setManageMode((value) => !value)}
        isRightPanelOpen={!rightCollapsed}
        onToggleRight={toggleRight}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onRoute={handleRouteClick}
        onSetGraph={setGraph}
        onSetView={setView}
        onFitGraph={fitGraphToTopics}
        nodeDetail={nodeDetail}
        quizState={quizState}
        quizGenerationCount={Number(quizGenerationCounts[String(activeTopic?.btid)] || 0)}
        quizGenerationLimit={QUIZ_GENERATION_LIMIT}
        commentDraft={commentDraft}
        canWriteComment={isAuthenticated}
        canDeleteNode={canDeleteNode(nodeDetail.data)}
        onCloseNodeDetail={closeNodeDetail}
        onToggleNodeRecommend={toggleNodeRecommend}
        onDeleteNode={deleteNode}
        onOpenQuiz={openQuizView}
        onGenerateQuiz={generateTopicQuizzes}
        onSelectQuizOption={selectQuizOption}
        onSubmitQuiz={submitQuizAnswers}
        onResetQuiz={resetQuizAnswers}
        onUpdateCommentDraft={updateCommentDraft}
        onSubmitComment={submitComment}
        onStartCommentReply={startCommentReply}
        onStartCommentEdit={startCommentEdit}
        onCancelCommentDraft={resetCommentDraft}
        onDeleteComment={deleteComment}
        onWheel={handleWheel}
        onZoom={zoomGraph}
      />

      {/* 오른쪽 알림/활동 패널입니다. */}
      <InsightsPanel
        activeBrain={activeBrain}
        isAuthenticated={isAuthenticated}
        pageData={pageData}
        onRoute={handleRouteClick}
        onToggleRight={toggleRight}
      />

      {/* 전역 피드백 UI입니다. 알림창은 헤더 버튼에서 열고 닫습니다. */}
      {toast && <div className="toast" role="status">{toast}</div>}
      {modal && <MainModal copy={modalCopy[modal]} onClose={() => setModal(null)} onConfirm={confirmModal} />}
      {nodeDraft.isOpen && (
        <div className="node-modal-backdrop" role="presentation" onClick={closeNodeCreateModal}>
          <section className="node-create-modal" role="dialog" aria-modal="true" aria-labelledby="node-create-title" onClick={(event) => event.stopPropagation()}>
            <div className="node-create-head">
              <div>
                <p className="panel-kicker">CREATE NODE</p>
                <h2 id="node-create-title">{activeTopic?.name} Neuron 작성</h2>
              </div>
              <button type="button" onClick={closeNodeCreateModal} aria-label="닫기">×</button>
            </div>

            <form className="node-create-form" onSubmit={submitNodeDraft}>
              <label>
                <span>제목</span>
                <input name="title" type="text" value={nodeDraft.title} onChange={updateNodeDraft} placeholder="Neuron 제목" maxLength={100} required />
              </label>
              <label>
                <span>내용</span>
                <textarea
                  name="content"
                  value={nodeDraft.content}
                  onChange={updateNodeDraft}
                  placeholder="정리할 내용을 작성해주세요."
                  rows={9}
                  aria-describedby="node-content-byte-count"
                  required
                />
                <span
                  id="node-content-byte-count"
                  className={`node-byte-counter ${nodeContentByteCount >= NODE_CONTENT_BYTE_LIMIT ? "is-limit" : ""}`}
                >
                  {nodeContentByteCount.toLocaleString()}/{NODE_CONTENT_BYTE_LIMIT.toLocaleString()}Byte
                </span>
              </label>
              <div className="node-create-actions">
                <button type="button" onClick={closeNodeCreateModal}>취소</button>
                <button type="submit" disabled={nodeDraft.isSubmitting}>{nodeDraft.isSubmitting ? "작성 중" : "뉴런 추가"}</button>
              </div>
              {nodeDraft.status && <p className="node-create-status" role="status">{nodeDraft.status}</p>}
            </form>
          </section>
        </div>
      )}
      {topicPanelMode && (
        <TopicManagerPanel
          topics={topicCatalog}
          isLoading={isTopicCatalogLoading}
          search={topicSearch}
          onClose={() => {
            setTopicPanelMode(null);
            clearTopicSearch();
          }}
          onCreateTopic={createTopicFromPanel}
          onToggleTopicUse={toggleTopicUse}
          onSearchTopics={searchTopicsFromPanel}
          onClearSearch={clearTopicSearch}
        />
      )}
      {brainManager.isOpen && (
        <BrainManagerPanel
          manager={brainManager}
          onClose={closeBrainManager}
          onChangeForm={updateBrainManagerForm}
          onSaveBrain={saveBrainInfo}
          onSearchAvailableUsers={searchAvailableUsers}
          onInviteUser={inviteBrainUser}
          onRemoveMember={removeBrainMember}
          onManageJoinRequest={manageJoinRequest}
          onChangeMemberRole={changeBrainMemberRole}
          onDeleteBrain={deleteBrain}
          onLeaveBrain={leaveBrain}
          canAdministerWorkspace={canAdministerWorkspace}
        />
      )}
    </main>
  );
}
