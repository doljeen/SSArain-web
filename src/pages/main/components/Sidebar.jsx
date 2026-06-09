import { endpoints } from "../../../api/endpoints.js";
import Icon from "../../../shared/icons/Icon.jsx";

// 왼쪽 패널: Brain 목록, Topic 트리, 사용자 메뉴를 담당합니다.
export default function Sidebar({
  pageData,
  activeBrain,
  activeTopic,
  apiStatus,
  onRoute,
  onSelectBrain,
  onMoveToTopic,
  onToggleLeft,
  onOpenModal
}) {
  return (
    <aside className="sidebar" aria-label="Brain navigation">
      {/* 브랜드 영역과 왼쪽 패널 접기 버튼입니다. */}
      <header className="brand-bar">
        <button className="brand-button" type="button" onClick={(event) => onRoute(event, "/main")} aria-label="홈으로 이동"><Icon name="brain" /></button>
        <button className="brand-name" type="button" onClick={(event) => onRoute(event, "/main")}>Synapse</button>
        <button className="collapse-button" type="button" onClick={onToggleLeft} aria-label="왼쪽 메뉴 접기">접기</button>
      </header>

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
        {/* Brain 생성/찾기 버튼은 현재 모달과 route 이동을 같이 처리합니다. */}
        <div className="brain-actions">
          <button className="create-brain" type="button" data-endpoint={endpoints.brains.create} onClick={(event) => onRoute(event, "/brains/new")}><Icon name="plus" /><span>생성</span></button>
          <button className="find-brain" type="button" data-endpoint={endpoints.brains.list} onClick={(event) => { onRoute(event, "/brains/search"); onOpenModal("findBrain"); }}><Icon name="search" /><span>찾기</span></button>
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

      {/* 하단 사용자 정보와 로그인/회원가입/설정 이동 버튼입니다. */}
      <footer className="user-footer">
        <button className="user-profile" type="button" onClick={(event) => onRoute(event, "/mypage")}>
          <span className="user-avatar"><Icon name="user" /></span>
          <span><strong>{pageData.user.name || "Admin User"}</strong><small>{pageData.user.email || "admin@synapse.io"}</small></span>
        </button>
        <div className="footer-actions">
          <button type="button" onClick={(event) => onRoute(event, "/login")}>로그인</button>
          <button type="button" onClick={(event) => onRoute(event, "/signup")}>가입</button>
          <button className="settings-button" type="button" onClick={(event) => onRoute(event, "/settings")} aria-label="설정으로 이동"><Icon name="settings" /></button>
        </div>
      </footer>
    </aside>
  );
}
