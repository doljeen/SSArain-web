import { endpoints } from "../../../api/endpoints.js";
import Icon from "../../../shared/icons/Icon.jsx";

// 왼쪽 패널: Brain 목록, Topic 트리, 사용자 메뉴를 담당합니다.
export default function Sidebar({
  pageData,
  activeBrain,
  activeTopic,
  apiStatus,
  isAuthenticated,
  onRoute,
  onSelectBrain,
  onMoveToTopic,
  onOpenModal,
  onLogout
}) {
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
          <span className={`api-chip ${apiStatus === "was" ? "is-live" : ""}`}>{apiStatus === "was" ? "WAS" : "MOCK"}</span>
        </div>
        {pageData.brains.map((brain) => (
          <button key={brain.id} className={`brain-button ${brain.id === pageData.activeBrainId ? "is-active" : ""}`} type="button" data-endpoint={endpoints.brains.topics(brain.id)} onClick={(event) => onSelectBrain(event, brain.id)}>
            <Icon name="brain" />
            <span>{brain.name}</span>
            {brain.id === pageData.activeBrainId && <span className="status-dot" aria-hidden="true" />}
          </button>
        ))}
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
          <button className="icon-button" type="button" aria-label="토픽 추가" data-endpoint={endpoints.topics.create(activeTopic?.id)} onClick={(event) => { onRoute(event, "/topics/new"); onOpenModal("createTopic"); }}><Icon name="plus" /></button>
        </div>
        <div className="topic-tree">
          {pageData.topics.map((topic) => (
            <section className="tree-group" key={topic.id}>
              <button className="tree-row" type="button" data-endpoint={endpoints.topics.children(topic.id)} onClick={(event) => onMoveToTopic(event, topic.id)}>
                <span className="chevron" aria-hidden="true">⌄</span>
                <Icon name="folder" />
                <span>{topic.name}</span>
              </button>
              <div className="tree-children">
                {(topic.children || []).map((child) => (
                  <button key={child.id} className={`tree-child ${child.id === pageData.activeTopicId ? "is-active" : ""}`} type="button" data-endpoint={activeBrain ? endpoints.nodes.preview(activeBrain.id, child.id) : ""} onClick={(event) => onMoveToTopic(event, child.id)}>
                    <Icon name="folder" />
                    <span>{child.name}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
        </>
      )}

      {/* 하단 사용자 정보와 로그아웃 버튼입니다. 로그인 사용자의 정보만 보여줍니다. */}
      {isAuthenticated && <footer className="user-footer">
        <button className="user-profile" type="button" onClick={(event) => onRoute(event, "/mypage")}>
          <span className="user-avatar"><Icon name="user" /></span>
          <span><strong>{pageData.user.name || "Admin User"}</strong><small>{pageData.user.email || "admin@ssarain.io"}</small></span>
        </button>
        <div className="footer-actions">
          <button type="button" onClick={onLogout}>로그아웃</button>
        </div>
      </footer>}
    </aside>
  );
}
