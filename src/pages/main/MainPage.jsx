import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost } from "../../api/client.js";
import { endpoints } from "../../api/endpoints.js";
import { guestPreview } from "../../data/guestPreview.js";
import { mainMock } from "../../data/mainMock.js";
import { getCurrentRoute, routeTo, ROUTE_EVENTS, syncDocumentRoute } from "../../shared/router/routes.js";
import InsightsPanel from "./components/InsightsPanel.jsx";
import MainModal from "./components/MainModal.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Workspace from "./components/Workspace.jsx";
import { clusterPositions } from "./config/graphConfig.js";
import { createModalCopy } from "./config/modalConfig.js";
import { buildTopicTree, clone, flattenTopics, normalizeBrain, normalizeNodes } from "./config/mainUtils.js";

const CREATED_WORKSPACE_KEY = "ssarain-created-workspace";
const AUTH_STATE_KEY = "ssarain-authenticated";
const MIN_GRAPH_SCALE = 0.72;
const MAX_GRAPH_SCALE = 2.2;
const MAX_GRAPH_PAN_X = 620;
const MAX_GRAPH_PAN_Y = 420;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const clampGraph = (graphState) => ({
  ...graphState,
  scale: clamp(graphState.scale, MIN_GRAPH_SCALE, MAX_GRAPH_SCALE),
  x: clamp(graphState.x, -MAX_GRAPH_PAN_X, MAX_GRAPH_PAN_X),
  y: clamp(graphState.y, -MAX_GRAPH_PAN_Y, MAX_GRAPH_PAN_Y)
});

const getTopicIdFromRoute = (path) => {
  const match = path.match(/^\/topics\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

const getBrainIdFromRoute = (path) => {
  const match = path.match(/^\/brains\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

const isBrainSearchRoute = (path) => path === "/brains/search";
const canUseManageMode = (role) => ["ADMIN", "MANAGER", "LEADER"].includes(String(role || "").toUpperCase());

export default function MainPage() {
  // 화면 전체에서 쓰는 데이터입니다. WAS 호출 실패 시 mainMock을 그대로 사용합니다.
  const [pageData, setPageData] = useState(() => clone(mainMock));

  // 현재 route와 좌우 패널, 보기 모드, 그래프 카메라 상태를 관리합니다.
  const [route, setRoute] = useState(getCurrentRoute);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [view, setView] = useState("synapse");
  const [graph, setGraph] = useState({ x: 0, y: 0, scale: 1, tilt: 0 });
  const [authStatus, setAuthStatus] = useState(() => sessionStorage.getItem(AUTH_STATE_KEY) === "true" ? "authenticated" : "guest");

  // 모달, 토스트, API 연결 상태, 그래프 이동 애니메이션 상태입니다.
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [apiStatus, setApiStatus] = useState("mock");
  const [flying, setFlying] = useState(false);
  const [panning, setPanning] = useState(false);
  const [manageMode, setManageMode] = useState(false);
  const [openBrainTabs, setOpenBrainTabs] = useState([]);
  const [brainSearch, setBrainSearch] = useState({
    query: "",
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

  // 트리 구조의 토픽을 펼쳐서 현재 선택된 Brain/Topic을 계산합니다.
  const topicsFlat = useMemo(() => flattenTopics(pageData.topics), [pageData.topics]);
  const activeBrain = pageData.brains.find((brain) => String(brain.id) === String(pageData.activeBrainId)) || null;
  const activeTopic = topicsFlat.find((topic) => String(topic.id) === String(pageData.activeTopicId)) || null;
  const isZoomed = graph.scale >= 1.28;
  const isAuthenticated = authStatus === "authenticated";
  const isBrainSearchView = isBrainSearchRoute(route);
  const canManageWorkspace = Boolean(isAuthenticated && activeBrain);

  const addBrainTab = (brainId) => {
    const brain = pageData.brains.find((item) => String(item.id) === String(brainId));
    if (!brain) return;

    setOpenBrainTabs((current) => {
      if (current.some((item) => String(item.id) === String(brain.id))) return current;
      return [...current, brain];
    });
  };

  // BrainTopic 상세 API에서 현재 Topic에 연결된 Node 목록을 가져옵니다.
  const fetchTopicNodes = async (brainId, topicId) => {
    if (!brainId || !topicId) return [];

    try {
      const detail = await apiGet(endpoints.brains.topicDetail(brainId, topicId));
      return normalizeNodes(detail?.nodes || []);
    } catch (error) {
      return [];
    }
  };

  // 특정 Brain의 Topic 트리와 선택 Topic의 Node를 WAS에서 다시 불러옵니다.
  const loadBrainWorkspace = async (brainId, requestedTopicId = null) => {
    if (!brainId) return;

    try {
      const detail = await apiGet(endpoints.brains.topics(brainId));
      const topics = buildTopicTree(detail?.topics || []);
      const flatTopics = flattenTopics(topics);
      const selectedTopic = flatTopics.find((topic) => String(topic.id) === String(requestedTopicId)) || flatTopics[0] || null;
      const nodes = selectedTopic ? await fetchTopicNodes(brainId, selectedTopic.id) : [];
      const normalizedBrain = normalizeBrain({ ...detail, topics: detail?.topics || [] });

      setPageData((current) => ({
        ...current,
        activeBrainId: String(normalizedBrain.id),
        activeTopicId: selectedTopic ? String(selectedTopic.id) : null,
        brains: current.brains.map((brain) => String(brain.id) === String(normalizedBrain.id) ? normalizedBrain : brain),
        topics,
        nodes
      }));
      setApiStatus("was");
    } catch (error) {
      showToast(`Brain 정보를 불러오지 못했습니다 · ${error.message}`);
    }
  };

  // WAS에서 사용자, 내 Brain, 선택 Brain의 Topic/Node 목록을 가져옵니다.
  const loadMainData = async () => {
    if (sessionStorage.getItem(AUTH_STATE_KEY) !== "true") {
      setAuthStatus("guest");
      setApiStatus("guest");
      setPageData((current) => ({
        ...current,
        ...guestPreview,
        user: { name: "Guest", email: "", role: "GUEST" }
      }));
      return;
    }

    try {
      const [userInfo, myBrains] = await Promise.all([
        apiGet(endpoints.users.me),
        apiGet(endpoints.brains.mine)
      ]);
      const brains = (myBrains?.brains || []).map(normalizeBrain);
      const routedBrainId = getBrainIdFromRoute(route);
      const selectedBrain = brains.find((brain) => String(brain.id) === String(routedBrainId)) || brains[0] || null;

      let topics = [];
      let nodes = [];
      let activeTopicId = null;
      let nextBrains = brains;

      if (selectedBrain) {
        const brainDetail = await apiGet(endpoints.brains.topics(selectedBrain.id));
        topics = buildTopicTree(brainDetail?.topics || []);
        const flatTopics = flattenTopics(topics);
        const routedTopicId = getTopicIdFromRoute(route);
        const selectedTopic = flatTopics.find((topic) => String(topic.id) === String(routedTopicId)) || flatTopics[0] || null;
        activeTopicId = selectedTopic ? String(selectedTopic.id) : null;
        nodes = selectedTopic ? await fetchTopicNodes(selectedBrain.id, selectedTopic.id) : [];

        const detailBrain = normalizeBrain({ ...brainDetail, topics: brainDetail?.topics || [] });
        nextBrains = brains.map((brain) => String(brain.id) === String(detailBrain.id) ? detailBrain : brain);
      }

      setAuthStatus("authenticated");
      setApiStatus("was");
      setPageData((current) => ({
        ...current,
        user: {
          name: userInfo.name,
          email: userInfo.email,
          role: userInfo.role
        },
        activeBrainId: selectedBrain ? String(selectedBrain.id) : null,
        activeTopicId,
        brains: nextBrains,
        topics,
        nodes
      }));
    } catch (error) {
      sessionStorage.removeItem(AUTH_STATE_KEY);
      setAuthStatus("guest");
      setApiStatus("guest");
      setPageData((current) => ({
        ...current,
        ...guestPreview,
        user: { name: "Guest", email: "", role: "GUEST" }
      }));
    }
  };

  // WAS Brain 검색 API(B05)를 호출해 중앙 검색 화면의 목록을 갱신합니다.
  const searchBrains = async (query = brainSearch.query, page = 0) => {
    setBrainSearch((current) => ({ ...current, query, isLoading: true, message: "" }));

    try {
      const result = await apiGet(endpoints.brains.search(query, page, 6));
      setBrainSearch({
        query,
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

  useEffect(() => {
    // 첫 진입 시 route와 body data를 동기화하고 WAS 데이터를 불러옵니다.
    syncDocumentRoute(route);

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
    const onRouteChange = () => {
      const nextRoute = getCurrentRoute();
      setRoute(nextRoute);
      syncDocumentRoute(nextRoute);
      const routedTopicId = getTopicIdFromRoute(nextRoute);
      if (routedTopicId) {
        setPageData((current) => ({ ...current, activeTopicId: routedTopicId }));
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

  // 관리자/반장 권한이 아니거나 Brain을 벗어나면 관리모드는 자동으로 해제합니다.
  useEffect(() => {
    if (!canManageWorkspace && manageMode) {
      setManageMode(false);
    }
  }, [canManageWorkspace, manageMode]);

  // 중앙 허브 주변에 보이는 다른 토픽 묶음의 좌표와 점 개수를 계산합니다.
  const topicClusters = useMemo(() => {
    return topicsFlat
      .filter((topic) => topic.id !== activeTopic?.id)
      .slice(0, clusterPositions.length)
      .map((topic, index) => ({
        ...topic,
        x: clusterPositions[index][0],
        y: clusterPositions[index][1],
        count: Math.max(4, Math.min(8, (topic.children?.length || 0) + 4))
      }));
  }, [topicsFlat, activeTopic?.id]);

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
        scale: Math.max(0.72, Math.min(current.scale, 1) * 0.88),
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
      event.preventDefault();
      suppressNextClick.current = false;
      return;
    }

    setRoute(path);
    routeTo(path);
  };

  // Brain 클릭 시 왼쪽 목록의 activeBrainId를 바꾸고 route를 이동합니다.
  const selectBrain = (event, brainId, options = {}) => {
    if (options.openTab !== false) {
      addBrainTab(brainId);
    }
    setPageData((current) => ({ ...current, activeBrainId: brainId }));
    handleRouteClick(event, `/brains/${brainId}`);
    loadBrainWorkspace(brainId);
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
          setPageData((currentPageData) => ({ ...currentPageData, activeBrainId: nextBrain.id }));
          routeTo(`/brains/${nextBrain.id}`);
          loadBrainWorkspace(nextBrain.id);
        } else {
          setPageData((currentPageData) => ({
            ...currentPageData,
            activeBrainId: null,
            activeTopicId: null,
            topics: [],
            nodes: []
          }));
          routeTo("/main");
        }
      }

      return nextTabs;
    });
  };

  // Topic 클릭 시 중앙 내용을 바꾸지 않고 그래프 카메라만 해당 토픽 방향으로 이동합니다.
  const moveToTopic = (event, topicId, options = {}) => {
    const shouldUpdateRoute = options.updateRoute !== false;

    if (suppressNextClick.current) {
      if (shouldUpdateRoute) handleRouteClick(event, `/topics/${topicId}`);
      return;
    }

    if (topicId === activeTopic?.id) {
      focusGraphPoint(0, 0, 1.35);
    } else {
      const targetCluster = topicClusters.find((topic) => topic.id === topicId);
      if (targetCluster) focusGraphPoint(targetCluster.x, targetCluster.y, 1.35);
    }

    setPageData((current) => ({ ...current, activeTopicId: topicId }));
    if (activeBrain) {
      fetchTopicNodes(activeBrain.id, topicId).then((nodes) => {
        setPageData((current) => String(current.activeTopicId) === String(topicId) ? { ...current, nodes } : current);
      });
    }
    if (shouldUpdateRoute) handleRouteClick(event, `/topics/${topicId}`);
  };

  // 그래프 빈 영역을 누르면 pan 시작 정보를 저장합니다.
  const handlePointerDown = (event) => {
    if (event.button !== 0) return;
    if (view !== "synapse" || !activeTopic || modal) return;
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
    if (view !== "synapse" || !activeTopic) return;

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

  // 관리모드의 Topic 추가 버튼은 우선 진입점만 열어두고, 생성 화면은 이후 구현합니다.
  const requestTopicCreateEntry = () => {
    showToast("Topic 생성 화면은 다음 단계에서 연결됩니다.");
  };

  // WAS에 Brain 가입 API가 아직 없으므로 버튼 클릭 시 현재 가능한 상태만 안내합니다.
  const requestJoinBrain = (brain) => {
    showToast(`${brain.name} 가입 API가 아직 준비되지 않았습니다.`);
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
      user: { name: "Guest", email: "", role: "GUEST" }
    }));
    routeTo("/main");
  };

  return (
    <main className={`main-shell ${rightCollapsed ? "is-right-collapsed" : ""}`} aria-label="SSArain main page">
      {/* 왼쪽 Brain/Topic 탐색 영역입니다. */}
      <Sidebar
        activeBrain={activeBrain}
        activeTopic={activeTopic}
        apiStatus={apiStatus}
        isAuthenticated={isAuthenticated}
        pageData={pageData}
        onMoveToTopic={moveToTopic}
        onOpenModal={setModal}
        onLogout={logout}
        onRoute={handleRouteClick}
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
        topicClusters={topicClusters}
        view={view}
        brainSearch={brainSearch}
        openBrainTabs={openBrainTabs}
        isAuthenticated={isAuthenticated}
        isBrainSearchView={isBrainSearchView}
        canManageWorkspace={canManageWorkspace}
        manageMode={manageMode}
        onFocusPoint={focusGraphPoint}
        onJoinBrain={requestJoinBrain}
        onMoveToTopic={moveToTopic}
        onOpenModal={setModal}
        onRequestTopicCreate={requestTopicCreateEntry}
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
    </main>
  );
}
