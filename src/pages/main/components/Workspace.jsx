import { endpoints } from "../../../api/endpoints.js";
import Icon from "../../../shared/icons/Icon.jsx";
import { graphNodes } from "../config/graphConfig.js";

// 중앙 작업 영역: 상단 경로/보기 전환과 Synapse 그래프 또는 Post List를 렌더링합니다.
export default function Workspace({
  activeBrain,
  activeTopic,
  graph,
  graphClassName,
  graphFieldRef,
  pageData,
  topicClusters,
  view,
  onRoute,
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
  isRightPanelOpen,
  onToggleRight
}) {
  const hasActiveTopic = Boolean(activeTopic);

  return (
    <section className="workspace" aria-label="Synapse workspace">
      {/* 현재 Brain/Topic 경로와 보기 전환, 마이페이지/알림 버튼입니다. */}
      <header className="workspace-header">
        <nav className="breadcrumb" aria-label="현재 위치">
          {activeBrain && <button type="button" onClick={(event) => onRoute(event, `/brains/${activeBrain.id}`)}>{activeBrain.name}</button>}
          {activeBrain && activeTopic && <span aria-hidden="true">›</span>}
          {activeTopic && <button className="crumb-chip" type="button" onClick={(event) => onRoute(event, `/topics/${activeTopic.id}`)}>{activeTopic.name}</button>}
        </nav>
        <div className="header-actions">
          <div className="view-tabs" role="tablist" aria-label="보기 전환">
            <button className={`view-tab ${view === "synapse" ? "is-active" : ""}`} type="button" role="tab" aria-selected={view === "synapse"} onClick={(event) => { onRoute(event, activeTopic ? `/topics/${activeTopic.id}/synapse` : "/main/synapse"); onSetView("synapse"); }}><Icon name="synapse" /><span>Synapse View</span></button>
            <button className={`view-tab ${view === "posts" ? "is-active" : ""}`} type="button" role="tab" aria-selected={view === "posts"} onClick={(event) => { onRoute(event, activeTopic ? `/topics/${activeTopic.id}/posts` : "/main/posts"); onSetView("posts"); }}><Icon name="list" /><span>Post List</span></button>
          </div>
          <button className="header-button" type="button" onClick={(event) => onRoute(event, "/mypage")}>마이페이지</button>
          <button className={`header-button notice-trigger ${isRightPanelOpen ? "is-open" : ""}`} type="button" onClick={(event) => { onRoute(event, "/notifications"); onToggleRight(); }} aria-pressed={isRightPanelOpen}><Icon name="bell" /><span>알림창</span></button>
        </div>
      </header>

      {/* 그래프 패널입니다. Pointer/Wheel 이벤트는 MainPage에서 받아 카메라 상태를 바꿉니다. */}
      <div ref={graphFieldRef} className={graphClassName} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
        {view === "synapse" && hasActiveTopic ? (
          <>
            {/* CSS 변수로 pan/zoom/tilt 값을 내려서 Prezi식 이동을 표현합니다. */}
            <div className="graph-viewport" style={{ "--pan-x": `${graph.x}px`, "--pan-y": `${graph.y}px`, "--zoom": graph.scale, "--tilt": `${graph.tilt || 0}deg` }}>
              {/* 현재 Topic 주변에 배치되는 다른 Topic 클러스터들입니다. */}
              {topicClusters.map((topic) => (
                <button key={topic.id} className="graph-node topic-hub" type="button" data-endpoint={endpoints.topics.detail(topic.id)} style={{ "--cluster-x": `${topic.x}px`, "--cluster-y": `${topic.y}px` }} onClick={(event) => onMoveToTopic(event, topic.id)} aria-label={`${topic.name} 토픽으로 이동`}>
                  <span className="topic-orbit" aria-hidden="true">
                    {Array.from({ length: topic.count }).map((_, index) => {
                      const angle = (360 / topic.count) * index;
                      return <i key={angle} style={{ "--dot-angle": `${angle}deg`, "--dot-back": `${-angle}deg` }} />;
                    })}
                  </span>
                  <strong>{topic.name}</strong>
                </button>
              ))}
              {/* 중앙 허브는 현재 보고 있는 Topic을 나타냅니다. */}
              <button className="graph-node hub" type="button" data-endpoint={endpoints.topics.detail(activeTopic.id)} onClick={(event) => onMoveToTopic(event, activeTopic.id)}>
                <span dangerouslySetInnerHTML={{ __html: activeTopic.name.replace(" ", "<br>") }} />
              </button>
              {/* 문서 노드와 중앙 허브를 잇는 선을 좌표 기반으로 그립니다. */}
              {graphNodes.map(([x, y], index) => {
                const node = pageData.nodes[index % pageData.nodes.length];
                if (!node) return null;
                const angle = Math.atan2(y, x) * (180 / Math.PI);
                const length = Math.sqrt((x * x) + (y * y));
                return (
                  <span key={`${node.id}-${index}`}>
                    <span className="node-link" style={{ "--angle": `${angle}deg`, "--link-length": `${length}px` }} aria-hidden="true" />
                    <button className="graph-node doc-node" type="button" data-endpoint={endpoints.nodes.detail(node.id)} style={{ "--node-x": `${x}px`, "--node-y": `${y}px` }} onClick={(event) => { onFocusPoint(x, y, 1.65); onRoute(event, `/nodes/${node.id}`); }} aria-label={`${node.title} 노드로 이동`} title={node.title}>
                      <Icon name="file" />
                      <span className="node-caption"><strong>{node.title}</strong><small>댓글 {node.comments}개</small></span>
                    </button>
                  </span>
                );
              })}
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
              <button className="post-row" type="button" key={node.id} onClick={(event) => onRoute(event, `/nodes/${node.id}`)}>
                <span className="post-icon"><Icon name="file" /></span>
                <span><strong>{node.title}</strong><small>{activeTopic.name} · 댓글 {node.comments}개</small></span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {/* 도움말 모달을 여는 플로팅 버튼입니다. */}
      <button className="help-button" type="button" onClick={(event) => { onRoute(event, "/help"); onOpenModal("help"); }} aria-label="도움말">?</button>
    </section>
  );
}
