import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost } from "../../api/client.js";
import { endpoints } from "../../api/endpoints.js";
import { guestPreview } from "../../data/guestPreview.js";
import { mainMock } from "../../data/mainMock.js";
import { getCurrentRoute, routeTo } from "../../shared/router/routes.js";
import InsightsPanel from "./components/InsightsPanel.jsx";
import MainModal from "./components/MainModal.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Workspace from "./components/Workspace.jsx";
import { clusterPositions } from "./config/graphConfig.js";
import { createModalCopy } from "./config/modalConfig.js";
import { buildTopicTree, clone, flattenTopics } from "./config/mainUtils.js";

const CREATED_WORKSPACE_KEY = "ssarain-created-workspace";
const AUTH_STATE_KEY = "ssarain-authenticated";

const getTopicIdFromRoute = (path) => {
  const match = path.match(/^\/topics\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

export default function MainPage() {
  // 화면 전체에서 쓰는 데이터입니다. WAS 호출 실패 시 mainMock을 그대로 사용합니다.
  const [pageData, setPageData] = useState(() => clone(mainMock));

  // hash route와 좌우 패널, 보기 모드, 그래프 카메라 상태를 관리합니다.
  const [route, setRoute] = useState(getCurrentRoute);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
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

  // 그래프 DOM과 드래그/클릭 보정에 필요한 임시 값을 저장합니다.
  const graphFieldRef = useRef(null);
  const panSession = useRef(null);
  const suppressNextClick = useRef(false);
  const flightTimer = useRef(null);

  // 트리 구조의 토픽을 펼쳐서 현재 선택된 Brain/Topic을 계산합니다.
  const topicsFlat = useMemo(() => flattenTopics(pageData.topics), [pageData.topics]);
  const activeBrain = pageData.brains.find((brain) => brain.id === pageData.activeBrainId) || null;
  const activeTopic = topicsFlat.find((topic) => topic.id === pageData.activeTopicId) || null;
  const isZoomed = graph.scale >= 1.28;
  const isAuthenticated = authStatus === "authenticated";

  // WAS에서 사용자 정보와 토픽 목록을 가져오고, 실패하면 mock 화면을 유지합니다.
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

    const requests = await Promise.allSettled([
      apiGet(endpoints.users.me),
      apiGet(endpoints.topics.list())
    ]);
    const [userResult, topicsResult] = requests;

    setPageData((current) => {
      const next = { ...current };

      if (userResult.status === "fulfilled" && userResult.value) {
        setAuthStatus("authenticated");
        next.user = {
          name: userResult.value.name,
          email: userResult.value.email,
          role: userResult.value.role
        };
      } else {
        sessionStorage.removeItem(AUTH_STATE_KEY);
        setAuthStatus("guest");
        return {
          ...current,
          ...guestPreview,
          user: { name: "Guest", email: "", role: "GUEST" }
        };
      }

      if (topicsResult.status === "fulfilled" && Array.isArray(topicsResult.value) && topicsResult.value.length) {
        next.topics = buildTopicTree(topicsResult.value);
      }

      return next;
    });

    setApiStatus(requests.some((result) => result.status === "fulfilled") ? "was" : "mock");
  };

  useEffect(() => {
    // 첫 진입 시 route와 body data를 동기화하고 WAS 데이터를 불러옵니다.
    routeTo(route);

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

    // 브라우저 뒤로가기/앞으로가기나 버튼 클릭으로 hash가 바뀌는 경우를 감지합니다.
    const onHashChange = () => {
      const nextRoute = getCurrentRoute();
      setRoute(nextRoute);
      document.body.dataset.route = nextRoute;
      const routedTopicId = getTopicIdFromRoute(nextRoute);
      if (routedTopicId) {
        setPageData((current) => ({ ...current, activeTopicId: routedTopicId }));
      }
    };

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

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
      const clampedScale = Math.min(2.4, Math.max(0.45, nextScale));
      const localX = (anchorX - centerX - current.x) / current.scale;
      const localY = (anchorY - centerY - current.y) / current.scale;
      return {
        scale: clampedScale,
        x: anchorX - centerX - (localX * clampedScale),
        y: anchorY - centerY - (localY * clampedScale),
        tilt: 0
      };
    });
  };

  // 토픽/노드 클릭 시 축소 후 이동하고 다시 확대하는 Prezi 느낌의 카메라 이동입니다.
  const focusGraphPoint = (x, y, scale) => {
    const clampedScale = Math.min(2.4, Math.max(0.45, scale));

    window.clearTimeout(flightTimer.current);
    setFlying(true);

    setGraph((current) => {
      const targetX = -x * clampedScale;
      const targetY = -y * clampedScale;
      const travelX = targetX - current.x;
      const tilt = Math.max(-1.8, Math.min(1.8, travelX / 420));
      return {
        scale: Math.max(0.72, Math.min(current.scale, 1) * 0.88),
        x: current.x + ((targetX - current.x) * 0.18),
        y: current.y + ((targetY - current.y) * 0.18),
        tilt
      };
    });

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setGraph({ scale: clampedScale, x: -x * clampedScale, y: -y * clampedScale, tilt: 0 });
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
        setModal(null);
        showToast(`Topic 생성 완료 · ${createdTopic.name || name}`);
        await loadMainData();
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
  const selectBrain = (event, brainId) => {
    setPageData((current) => ({ ...current, activeBrainId: brainId }));
    handleRouteClick(event, `/brains/${brainId}`);
  };

  // Topic 클릭 시 중앙 내용을 바꾸지 않고 그래프 카메라만 해당 토픽 방향으로 이동합니다.
  const moveToTopic = (event, topicId) => {
    if (suppressNextClick.current) {
      handleRouteClick(event, `/topics/${topicId}`);
      return;
    }

    if (topicId === activeTopic?.id) {
      focusGraphPoint(0, 0, 1.35);
    } else {
      const targetCluster = topicClusters.find((topic) => topic.id === topicId);
      if (targetCluster) focusGraphPoint(targetCluster.x, targetCluster.y, 1.35);
    }

    setPageData((current) => ({ ...current, activeTopicId: topicId }));
    handleRouteClick(event, `/topics/${topicId}`);
  };

  // 그래프 빈 영역을 누르면 pan 시작 정보를 저장합니다.
  const handlePointerDown = (event) => {
    if (event.button !== 0) return;
    if (view !== "synapse" || !activeTopic || modal) return;
    if (event.target instanceof Element && event.target.closest("button, a, input, textarea, select")) return;

    panSession.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: graph.x,
      originY: graph.y,
      moved: false
    };
    setPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  // 드래그 중인 거리만큼 그래프 카메라 좌표를 이동합니다.
  const handlePointerMove = (event) => {
    if (!panSession.current) return;

    const dx = event.clientX - panSession.current.startX;
    const dy = event.clientY - panSession.current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 6) panSession.current.moved = true;
    setGraph((current) => ({
      ...current,
      x: panSession.current.originX + dx,
      y: panSession.current.originY + dy
    }));
  };

  // 드래그가 끝나면 다음 click 이벤트가 잘못 실행되지 않도록 보정합니다.
  const handlePointerUp = (event) => {
    if (!panSession.current) return;

    if (panSession.current.moved) suppressNextClick.current = true;
    panSession.current = null;
    setPanning(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  // 휠 스크롤로 그래프를 확대/축소합니다.
  const handleWheel = (event) => {
    if (view !== "synapse" || !activeTopic) return;

    event.preventDefault();
    zoomGraph(graph.scale * (event.deltaY > 0 ? 0.9 : 1.1), event.clientX, event.clientY);
  };

  // CSS에서 pan/flight/zoom 상태에 맞는 애니메이션을 적용하기 위한 클래스입니다.
  const graphClassName = [
    "graph-field",
    panning ? "is-panning" : "",
    flying ? "is-flying" : "",
    isZoomed ? "is-zoomed" : ""
  ].filter(Boolean).join(" ");

  // 좌우 패널 접기/펼치기 토글입니다.
  const toggleLeft = () => setLeftCollapsed((value) => !value);
  const toggleRight = () => setRightCollapsed((value) => !value);

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
    <main className={`main-shell ${leftCollapsed ? "is-left-collapsed" : ""} ${rightCollapsed ? "is-right-collapsed" : ""}`} aria-label="Synapse main page">
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
        onToggleLeft={toggleLeft}
      />

      {/* 왼쪽 패널이 접혔을 때 다시 펼치는 외곽 버튼입니다. */}
      <button className="edge-toggle left-edge" type="button" onClick={toggleLeft} aria-label="왼쪽 메뉴 펼치기">로고</button>

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
        isAuthenticated={isAuthenticated}
        onFocusPoint={focusGraphPoint}
        onMoveToTopic={moveToTopic}
        onOpenModal={setModal}
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
