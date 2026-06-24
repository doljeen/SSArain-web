import { useEffect, useMemo, useState } from "react";
import { endpoints } from "../../../api/endpoints.js";
import Icon from "../../../shared/icons/Icon.jsx";

// MainPage의 왼쪽 고정 영역입니다.
// Brain 이동, Brain 관리 진입, Topic 트리 이동, 마이페이지/로그아웃 진입을 한곳에서 제공합니다.

// Topic 트리의 id 변화를 감지해 Brain/Topic이 바뀔 때 펼침 상태를 초기화합니다.
const collectTopicIds = (topics = []) => topics.flatMap((topic) => [
  String(topic.id),
  ...collectTopicIds(topic.children || [])
]);

// 왼쪽 패널: Brain 목록, Topic 트리, 사용자 메뉴를 담당합니다.
export default function Sidebar({
  pageData,
  activeBrain,
  activeTopic,
  apiStatus,
  canManageWorkspace,
  canManageBrain,
  isAuthenticated,
  onRoute,
  onSelectBrain,
  onMoveToTopic,
  onOpenBrainManage,
  onOpenModal,
  onResizeStart,
  onLogout
}) {
  const topicIds = useMemo(() => collectTopicIds(pageData.topics), [pageData.topics]);
  const topicIdsKey = topicIds.join("|");
  const [expandedTopicIds, setExpandedTopicIds] = useState(() => new Set());

  // Brain/Topic 목록이 바뀌면 기본은 접힌 상태로 시작합니다.
  useEffect(() => {
    setExpandedTopicIds(new Set());
  }, [topicIdsKey]);

  // 사이드바 Topic 트리는 기본 접힘 상태이며, 폴더 화살표로 하위 Topic만 펼칩니다.
  const toggleTopicExpanded = (event, topicId) => {
    event.stopPropagation();
    setExpandedTopicIds((current) => {
      const next = new Set(current);
      const key = String(topicId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // VSCode 파일 탐색기처럼 Topic 계층을 재귀 렌더링합니다.
  const renderTopicTree = (topics = [], depth = 0) => topics.map((topic) => {
    const children = topic.children || [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedTopicIds.has(String(topic.id));
    const isActive = String(topic.id) === String(pageData.activeTopicId);

    return (
      <section className="tree-group" key={topic.id} style={{ "--topic-depth": depth }}>
        <div className={`tree-node ${isActive ? "is-active" : ""}`}>
          <button
            className={`tree-toggle ${isExpanded ? "is-expanded" : ""}`}
            type="button"
            onClick={(event) => hasChildren && toggleTopicExpanded(event, topic.id)}
            aria-label={hasChildren ? `${topic.name} 하위 Topic ${isExpanded ? "접기" : "펼치기"}` : undefined}
            aria-hidden={!hasChildren}
            tabIndex={hasChildren ? 0 : -1}
          >
            {hasChildren ? "⌄" : ""}
          </button>
          <button
            className="tree-row"
            type="button"
            data-endpoint={topic.btid ? endpoints.nodes.preview(topic.btid) : endpoints.topics.children(topic.id)}
            onClick={(event) => onMoveToTopic(event, topic.id)}
          >
            <Icon name="folder" />
            <span>{topic.name}</span>
          </button>
        </div>
        {hasChildren && isExpanded && (
          <div className="tree-children">
            {renderTopicTree(children, depth + 1)}
          </div>
        )}
      </section>
    );
  });

  return (
    <aside className="sidebar" aria-label="Brain navigation">
      {/* 브랜드 영역입니다. 왼쪽 사이드바는 항상 고정해서 Brain 탐색 기준을 유지합니다. */}
      <header className="brand-bar">
        <button className="sidebar-brand" type="button" onClick={(event) => onRoute(event, "/main")} aria-label="홈으로 이동">
          <span className="brand-button"><Icon name="brain" /></span>
          <span>SSArain</span>
        </button>
      </header>

      {!isAuthenticated ? (
        <section className="guest-sidebar-panel" aria-label="게스트 탐색">
          <button className="guest-find-button" type="button" data-endpoint={endpoints.brains.list} onClick={(event) => onRoute(event, "/brains/search")}><Icon name="search" /><span>Brain 찾기</span></button>
        </section>
      ) : (
        <>
      {/* 사용자의 Brain 목록입니다. WAS 연결 여부도 작은 칩으로 보여줍니다. */}
      <section className="brain-list" aria-labelledby="brains-heading">
        <div className="section-row">
          <h2 className="section-heading" id="brains-heading">MY BRAINS</h2>
          {apiStatus === "was" && <span className="api-chip is-live">WAS</span>}
        </div>
        {pageData.brains.map((brain) => {
          const isActive = brain.id === pageData.activeBrainId;

          return (
            <div key={brain.id} className={`brain-row ${isActive ? "is-active" : ""}`}>
              <button className={`brain-button ${isActive ? "is-active" : ""}`} type="button" data-endpoint={endpoints.brains.topics(brain.id)} onClick={(event) => onSelectBrain(event, brain.id)}>
                <Icon name="brain" />
                <span>{brain.name}</span>
                {isActive && <span className="status-dot" aria-hidden="true" />}
              </button>
              {isActive && isAuthenticated && (
                <button className="brain-manage-button" type="button" data-endpoint={endpoints.brains.members(brain.id)} onClick={(event) => onOpenBrainManage(event, brain.id)}>
                  {canManageBrain(brain) ? "관리" : "정보"}
                </button>
              )}
            </div>
          );
        })}
        {/* Brain 생성/찾기 버튼입니다. 찾기는 중앙 검색 화면으로 이동합니다. */}
        <div className="brain-actions">
          <button className="create-brain" type="button" data-endpoint={endpoints.brains.create} onClick={(event) => onRoute(event, "/brains/new")}><Icon name="plus" /><span>생성</span></button>
          <button className="find-brain" type="button" data-endpoint={endpoints.brains.list} onClick={(event) => onRoute(event, "/brains/search")}><Icon name="search" /><span>찾기</span></button>
        </div>
      </section>

      {/* Topic 트리입니다. 클릭하면 선택 상태를 바꾸기보다 그래프 카메라를 이동시킵니다. */}
      <section className="topics-card" aria-labelledby="topics-heading">
        <div className="topics-header">
          <h2 className="section-heading" id="topics-heading">TOPICS</h2>
        </div>
        <div className="topic-tree">
          {renderTopicTree(pageData.topics)}
        </div>
      </section>
        </>
      )}

      {/* 하단 사용자 정보와 로그아웃 버튼입니다. 로그인 사용자의 정보만 보여줍니다. */}
      {isAuthenticated && <footer className="user-footer">
        <button className="user-profile" type="button" onClick={(event) => onRoute(event, "/mypage")}>
          <span className="user-avatar"><Icon name="user" /></span>
          <span><strong>{pageData.user.name || "사용자"}</strong><small>{pageData.user.email || ""}</small></span>
        </button>
        <div className="footer-actions">
          <button type="button" onClick={onLogout}>로그아웃</button>
        </div>
      </footer>}
      <button
        className="sidebar-resize-handle"
        type="button"
        onPointerDown={onResizeStart}
        aria-label="사이드바 너비 조절"
      />
    </aside>
  );
}
