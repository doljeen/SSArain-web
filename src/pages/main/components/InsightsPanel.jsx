import { endpoints } from "../../../api/endpoints.js";
import Icon from "../../../shared/icons/Icon.jsx";
import { getActivityIcon } from "../config/mainUtils.js";

// 오른쪽 패널: 현재 Brain 정보, 알림 카드, 최근 활동 목록을 담당합니다.
export default function InsightsPanel({ activeBrain, pageData, onRoute, onToggleRight }) {
  return (
    <aside className="insights-panel" aria-label="Workspace insights">
      {/* 패널 제목과 접기 버튼입니다. */}
      <div className="insights-heading-row">
        <h2 className="section-heading">WORKSPACE INSIGHTS</h2>
        <button className="collapse-button inline" type="button" onClick={onToggleRight}>접기</button>
      </div>
      {activeBrain && (
        <button className="current-brain" type="button" onClick={(event) => onRoute(event, `/brains/${activeBrain.id}`)}>
          <Icon name="brain" className="brain-large" />
          <span><small>CURRENT BRAIN</small><strong>{activeBrain.name}</strong></span>
        </button>
      )}
      {/* 알림창: 댓글 알림을 카드 형태로 보여주고 관련 node route로 이동합니다. */}
      <section className="notification-section" aria-labelledby="notice-heading">
        <div className="activity-head"><h3 id="notice-heading">알림창</h3><button type="button" onClick={(event) => onRoute(event, "/notifications")}>View All</button></div>
        <div className="notice-list">
          {pageData.notifications.map((notice) => (
            <button className="notice-card" type="button" key={notice.id} data-endpoint={endpoints.nodes.detail(notice.nodeId)} onClick={(event) => onRoute(event, `/nodes/${notice.nodeId}`)}>
              <strong>{notice.brain} ({notice.topic})</strong>
              <span>{notice.node}에 {notice.author}님이<br />댓글을 작성하였습니다.</span>
            </button>
          ))}
        </div>
      </section>
      {/* Recent Activity: 최근 작업 이력을 시간순 목록으로 보여줍니다. */}
      <section className="activity-section" aria-labelledby="activity-heading">
        <div className="activity-head"><h3 id="activity-heading">Recent Activity</h3><button type="button" onClick={(event) => onRoute(event, "/activity")}>View All</button></div>
        <div className="activity-list">
          {pageData.activities.map((activity) => (
            <button className="activity-item" type="button" key={activity.id} onClick={(event) => onRoute(event, activity.route)}>
              <span className={`activity-icon ${activity.type}`}><Icon name={getActivityIcon(activity.type)} /></span>
              <span className="activity-copy"><strong>{activity.user}</strong> {activity.text}<small><Icon name="clock" className="tiny-icon" />{activity.time}</small></span>
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}
