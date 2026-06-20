import Icon from "../../../shared/icons/Icon.jsx";

const lineStyle = (fromX, fromY, toX, toY) => {
  const dx = toX - fromX;
  const dy = toY - fromY;
  return {
    "--from-x": `${fromX}px`,
    "--from-y": `${fromY}px`,
    "--line-length": `${Math.sqrt((dx * dx) + (dy * dy))}px`,
    "--line-angle": `${Math.atan2(dy, dx) * (180 / Math.PI)}deg`
  };
};

const rootScatterPositions = [
  { x: -620, y: -270 },
  { x: 650, y: 260 },
  { x: 0, y: 0 },
  { x: -300, y: 390 },
  { x: 410, y: -385 },
  { x: -820, y: 150 },
  { x: 850, y: -155 },
  { x: -910, y: -420 },
  { x: 930, y: 440 }
];

const findTopicPath = (topics, topicId, path = []) => {
  for (const topic of topics) {
    const nextPath = [...path, topic];
    if (String(topic.id) === String(topicId)) return nextPath;
    const childPath = findTopicPath(topic.children || [], topicId, nextPath);
    if (childPath.length) return childPath;
  }
  return [];
};

const collectTopicMap = (rootTopics, activeTopicId) => {
  const activePath = findTopicPath(rootTopics, activeTopicId);
  const activeRoot = activePath[0] || null;
  const selectedTopic = activePath[activePath.length - 1] || null;

  const rootNodes = rootTopics.map((rootTopic, index) => {
    const base = rootTopics.length === 1 ? { x: 0, y: 0 } : rootScatterPositions[index % rootScatterPositions.length];
    const ring = Math.floor(index / rootScatterPositions.length);
    return {
      topic: rootTopic,
      x: base.x + (ring * 180),
      y: base.y + (ring * 130),
      isActive: activeRoot && String(activeRoot.id) === String(rootTopic.id)
    };
  });

  const descendantNodes = [];
  const links = [];

  const layoutChildren = (parentTopic, parentNode, depth = 1, branchSide = null) => {
    const children = parentTopic.children || [];

    children.forEach((child, index) => {
      const side = branchSide || (index % 2 === 0 ? 1 : -1);
      const sameSideIndex = children.slice(0, index).filter((_, childIndex) => (branchSide || (childIndex % 2 === 0 ? 1 : -1)) === side).length;
      const sameSideTotal = children.filter((_, childIndex) => (branchSide || (childIndex % 2 === 0 ? 1 : -1)) === side).length;
      const yOffset = (sameSideIndex - ((sameSideTotal - 1) / 2)) * (depth === 1 ? 170 : 130);
      const node = {
        topic: child,
        x: parentNode.x + (side * (depth === 1 ? 300 : 220)),
        y: parentNode.y + yOffset,
        depth,
        side,
        isSelected: selectedTopic && String(child.id) === String(selectedTopic.id),
        isPath: activePath.some((pathTopic) => String(pathTopic.id) === String(child.id))
      };

      descendantNodes.push(node);
      links.push({ from: parentNode, to: node });
      layoutChildren(child, node, depth + 1, side);
    });
  };

  rootNodes.forEach((rootNode) => {
    layoutChildren(rootNode.topic, rootNode);
  });

  return { rootNodes, descendantNodes, links, selectedTopic };
};

const TopicTreeGraph = ({ rootTopics, activeTopic, onMoveToTopic }) => {
  const { rootNodes, descendantNodes, links, selectedTopic } = collectTopicMap(rootTopics, activeTopic?.id);

  if (!rootTopics.length) return null;

  return (
    <div className="topic-map" aria-label="Topic synapse map">
      {links.map((link) => (
        <span className="topic-map-link" key={`${link.from.topic.id}-${link.to.topic.id}`} style={lineStyle(link.from.x, link.from.y, link.to.x, link.to.y)} aria-hidden="true" />
      ))}

      {rootNodes.map((node) => (
        <button className={`topic-map-node is-root ${node.isActive ? "is-active" : ""}`} key={node.topic.id} type="button" style={{ "--node-x": `${node.x}px`, "--node-y": `${node.y}px` }} onClick={(event) => onMoveToTopic(event, node.topic.id, { updateRoute: false })}>
          <span>{node.topic.name}</span>
        </button>
      ))}

      {descendantNodes.map((node) => (
        <button className={`topic-map-node ${node.depth > 1 ? "is-small" : ""} ${node.isPath ? "is-path" : ""} ${node.isSelected ? "is-selected" : ""}`} key={node.topic.id} type="button" style={{ "--node-x": `${node.x}px`, "--node-y": `${node.y}px` }} onClick={(event) => onMoveToTopic(event, node.topic.id, { updateRoute: false })}>
          <span>{node.topic.name}</span>
        </button>
      ))}

      {selectedTopic && !descendantNodes.length && (
        <div className="topic-map-hint">하위 토픽이 없습니다</div>
      )}
    </div>
  );
};

// 중앙 작업 영역: 상단 경로/보기 전환과 Synapse 그래프 또는 Post List를 렌더링합니다.
export default function Workspace({
  activeBrain,
  activeTopic,
  graph,
  graphClassName,
  graphFieldRef,
  pageData,
  brainSearch,
  openBrainTabs,
  view,
  isAuthenticated,
  isBrainSearchView,
  canManageWorkspace,
  manageMode,
  onRoute,
  onSearchBrains,
  onJoinBrain,
  onSelectBrain,
  onCloseBrainTab,
  onMoveToTopic,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onWheel,
  onFocusPoint,
  onSetGraph,
  onSetView,
  onZoom,
  onOpenModal,
  onOpenTopicPanel,
  isRightPanelOpen,
  onToggleManageMode,
  onToggleRight
}) {
  const hasActiveTopic = Boolean(activeTopic);
  const visibleRootTopics = pageData.topics || [];

  const submitBrainSearch = (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onSearchBrains(String(formData.get("brainKeyword") || "").trim(), 0);
  };
  const hasBrainTabs = isAuthenticated && openBrainTabs.length > 0;

  return (
    <section className={`workspace ${hasBrainTabs ? "has-brain-tabs" : ""}`} aria-label="SSArain workspace">
      {hasBrainTabs && (
        <nav className="brain-tab-strip" aria-label="열린 Brain 탭">
          <div className="brain-tabs" role="tablist">
            {openBrainTabs.map((brain) => (
              <button
                key={brain.id}
                className={`brain-tab ${String(brain.id) === String(pageData.activeBrainId) ? "is-active" : ""}`}
                type="button"
                role="tab"
                aria-selected={String(brain.id) === String(pageData.activeBrainId)}
                onClick={(event) => onSelectBrain(event, brain.id)}
              >
                <span>{brain.name}</span>
                <span className="brain-tab-close" role="button" tabIndex={-1} onClick={(event) => onCloseBrainTab(event, brain.id)} aria-label={`${brain.name} 탭 닫기`}>×</span>
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* 현재 Brain/Topic 경로와 보기 전환, 마이페이지/알림 버튼입니다. */}
      <header className="workspace-header">
        <nav className="breadcrumb" aria-label="현재 위치">
          {activeBrain && <button type="button" onClick={(event) => onRoute(event, `/brains/${activeBrain.id}`)}>{activeBrain.name}</button>}
          {activeBrain && activeTopic && <span aria-hidden="true">›</span>}
          {activeTopic && <button className="crumb-chip" type="button" onClick={(event) => onRoute(event, `/topics/${activeTopic.id}`)}>{activeTopic.name}</button>}
        </nav>
        <div className="header-actions">
          {canManageWorkspace && (
            <button className={`header-button manage-mode-button ${manageMode ? "is-active" : ""}`} type="button" onClick={onToggleManageMode} aria-pressed={manageMode}>
              <Icon name="settings" />
              <span>관리모드</span>
            </button>
          )}
          <div className="view-tabs" role="tablist" aria-label="보기 전환">
            <button className={`view-tab ${view === "synapse" ? "is-active" : ""}`} type="button" role="tab" aria-selected={view === "synapse"} onClick={(event) => { onRoute(event, activeTopic ? `/topics/${activeTopic.id}/synapse` : "/main/synapse"); onSetView("synapse"); }}><Icon name="synapse" /><span>Synapse View</span></button>
            <button className={`view-tab ${view === "posts" ? "is-active" : ""}`} type="button" role="tab" aria-selected={view === "posts"} onClick={(event) => { onRoute(event, activeTopic ? `/topics/${activeTopic.id}/posts` : "/main/posts"); onSetView("posts"); }}><Icon name="list" /><span>Post List</span></button>
          </div>
          <button className="header-button" type="button" onClick={(event) => onRoute(event, isAuthenticated ? "/mypage" : "/login")}>{isAuthenticated ? "마이페이지" : "로그인"}</button>
          <button className={`header-button notice-trigger ${isRightPanelOpen ? "is-open" : ""}`} type="button" onClick={(event) => { onRoute(event, "/notifications"); onToggleRight(); }} aria-pressed={isRightPanelOpen}><Icon name="bell" /><span>알림창</span></button>
        </div>
      </header>

      {isBrainSearchView ? (
        <section className="brain-search-view" aria-labelledby="brain-search-heading">
          <form className="brain-search-form" onSubmit={submitBrainSearch}>
            <label htmlFor="brain-search-input" className="sr-only">Brain 명 검색</label>
            <input id="brain-search-input" name="brainKeyword" type="search" defaultValue={brainSearch.query} placeholder="Brain 명 검색" />
            <button type="submit" disabled={brainSearch.isLoading}>{brainSearch.isLoading ? "검색 중" : "검색"}</button>
          </form>

          <div className="brain-search-summary">
            <div>
              <p className="panel-kicker">FIND BRAIN</p>
              <h1 id="brain-search-heading">Brain 찾기</h1>
            </div>
            <span>{brainSearch.totalElements}개 결과</span>
          </div>

          {brainSearch.message ? (
            <p className="brain-search-message" role="status">{brainSearch.message}</p>
          ) : (
            <div className="brain-result-grid">
              {brainSearch.results.map((brain) => (
                <article className="brain-result-card" key={brain.id}>
                  <div className="brain-result-top">
                    <strong>{brain.name}</strong>
                    <span>{brain.adminName || "관리자 미지정"}</span>
                  </div>
                  <p>{brain.description || "등록된 소개 문구가 없습니다."}</p>
                  <div className="brain-result-bottom">
                    <small>가입 인원 {brain.memberNames?.length || 0}명</small>
                    <button type="button" onClick={() => onJoinBrain(brain)}>가입</button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!brainSearch.message && !brainSearch.results.length && !brainSearch.isLoading && (
            <p className="brain-search-empty">검색 결과가 없습니다.</p>
          )}

          <div className="brain-pagination" aria-label="Brain 검색 페이지네이션">
            <button type="button" disabled={brainSearch.isLoading || brainSearch.currentPage <= 0} onClick={() => onSearchBrains(brainSearch.query, brainSearch.currentPage - 1)}>이전</button>
            <span>{brainSearch.totalPages ? `${brainSearch.currentPage + 1} / ${brainSearch.totalPages}` : "0 / 0"}</span>
            <button type="button" disabled={brainSearch.isLoading || !brainSearch.hasNext} onClick={() => onSearchBrains(brainSearch.query, brainSearch.currentPage + 1)}>다음</button>
          </div>
        </section>
      ) : (
        // 그래프 패널입니다. Pointer/Wheel 이벤트는 MainPage에서 받아 카메라 상태를 바꿉니다.
        <div ref={graphFieldRef} className={graphClassName} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
          {view === "synapse" && hasActiveTopic ? (
          <>
            {/* CSS 변수로 pan/zoom/tilt 값을 내려서 Prezi식 이동을 표현합니다. */}
            <div className="graph-viewport" style={{ "--pan-x": `${graph.x}px`, "--pan-y": `${graph.y}px`, "--zoom": graph.scale, "--tilt": `${graph.tilt || 0}deg` }}>
              <TopicTreeGraph rootTopics={visibleRootTopics} activeTopic={activeTopic} onMoveToTopic={onMoveToTopic} />
            </div>
            {/* 그래프 확대/축소와 위치 초기화 컨트롤입니다. */}
            <div className="zoom-controls" aria-label="그래프 확대 축소">
              <button type="button" onClick={() => onZoom(graph.scale / 1.15, window.innerWidth / 2, window.innerHeight / 2)} aria-label="축소">-</button>
              <button type="button" onClick={() => onSetGraph({ x: 0, y: 0, scale: 1, tilt: 0 })} aria-label="위치 초기화">{Math.round(graph.scale * 100)}%</button>
              <button type="button" onClick={() => onZoom(graph.scale * 1.15, window.innerWidth / 2, window.innerHeight / 2)} aria-label="확대">+</button>
            </div>
          </>
          ) : view === "posts" && hasActiveTopic ? (
          // Post List 보기에서는 현재 Topic의 문서 목록 형태로 노드를 보여줍니다.
          <div className="post-list">
            {pageData.nodes.slice(0, 8).map((node) => (
              <button className="post-row" type="button" key={node.id} onClick={() => onFocusPoint(0, 0, 1.35)}>
                <span className="post-icon"><Icon name="file" /></span>
                <span><strong>{node.title}</strong><small>{activeTopic.name} · 댓글 {node.comments}개</small></span>
              </button>
            ))}
          </div>
          ) : null}
          {manageMode && canManageWorkspace && (
            <div className="manage-action-dock" aria-label="Topic management actions">
              <button className="manage-action-button" type="button" onClick={() => onOpenTopicPanel("manage")}>
                <span>토픽 관리</span>
              </button>
              <button className="manage-action-button danger" type="button" onClick={() => onOpenTopicPanel("delete")}>
                <span>토픽 삭제</span>
              </button>
            </div>
          )}
        </div>
      )}
      {/* 도움말 모달을 여는 플로팅 버튼입니다. */}
      <button className="help-button" type="button" onClick={(event) => { onRoute(event, "/help"); onOpenModal("help"); }} aria-label="도움말">?</button>
    </section>
  );
}
