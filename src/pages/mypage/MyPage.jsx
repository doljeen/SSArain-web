import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../api/client.js";
import { endpoints } from "../../api/endpoints.js";
import { normalizeUserInfo } from "../main/config/mainUtils.js";
import Icon from "../../shared/icons/Icon.jsx";
import { routeTo } from "../../shared/router/routes.js";

const AUTH_STATE_KEY = "ssarain-authenticated";

const activitySections = [
  {
    id: "nodes",
    title: "내가 작성한 뉴런",
    count: 0,
    icon: "file",
    items: []
  },
  {
    id: "comments",
    title: "내가 작성한 댓글",
    count: 0,
    icon: "bell",
    items: []
  },
  {
    id: "thumbs",
    title: "추천한 뉴런",
    count: 0,
    icon: "plus",
    items: []
  }
];

const roleLabel = (role) => ({
  ADMIN: "관리자",
  MANAGER: "반장",
  LEADER: "반장",
  USER: "일반학생"
}[role] || "일반학생");

export default function MyPage() {
  // WAS /user 응답으로 채워지는 사용자 프로필 정보입니다.
  const [user, setUser] = useState(null);

  // 비밀번호 변경 폼 상태입니다. 현재 WAS 변경 API가 없어 화면 검증까지만 처리합니다.
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    nextPassword: "",
    nextPasswordConfirm: ""
  });
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeActivity, setActiveActivity] = useState("nodes");

  const moveTo = (path) => {
    routeTo(path);
  };

  const userSummary = user?.summary || {};
  const resolvedActivitySections = activitySections.map((section) => ({
    ...section,
    count: {
      nodes: userSummary.nodeCount,
      comments: userSummary.commentCount,
      thumbs: userSummary.likeCount
    }[section.id] ?? section.count
  }));
  const selectedActivity = resolvedActivitySections.find((section) => section.id === activeActivity) || resolvedActivitySections[0];
  const displayName = user?.name || "프로필 불러오는 중";
  const displayEmail = user?.email || "계정 정보를 확인하고 있습니다.";
  const displayRole = user ? roleLabel(user.role) : "확인 중";

  // WAS 로그아웃 후 인증 상태를 지우고 게스트 메인으로 이동합니다.
  const logout = async () => {
    setIsLoading(true);
    setStatus("");

    try {
      await apiPost(endpoints.auth.logout, {});
    } catch (error) {
      // 토큰이 이미 만료되었거나 쿠키가 없어도 프론트 인증 상태는 정리합니다.
    } finally {
      sessionStorage.removeItem(AUTH_STATE_KEY);
      setIsLoading(false);
      routeTo("/main");
    }
  };

  // 마이페이지 진입 시 로그인된 사용자의 정보를 조회합니다.
  useEffect(() => {
    const loadUser = async () => {
      setIsLoading(true);
      setStatus("");

      try {
        const userInfo = await apiGet(endpoints.users.me);
        if (userInfo) {
          sessionStorage.setItem(AUTH_STATE_KEY, "true");
          setUser(normalizeUserInfo(userInfo));
        }
      } catch (error) {
        sessionStorage.removeItem(AUTH_STATE_KEY);
        routeTo("/login");
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  // 비밀번호 입력값을 관리합니다.
  const updatePasswordField = (event) => {
    const { name, value } = event.target;
    setPasswordForm((current) => ({ ...current, [name]: value }));
  };

  // 비밀번호 변경 API가 추가되기 전까지는 유효성 검증과 안내 메시지만 처리합니다.
  const submitPasswordChange = (event) => {
    event.preventDefault();

    if (!passwordForm.currentPassword || !passwordForm.nextPassword || !passwordForm.nextPasswordConfirm) {
      setStatus("비밀번호 변경 항목을 모두 입력해주세요.");
      return;
    }

    if (passwordForm.nextPassword !== passwordForm.nextPasswordConfirm) {
      setStatus("변경할 비밀번호가 서로 일치하지 않습니다.");
      return;
    }

    setStatus("비밀번호 변경 API가 WAS에 추가되면 이 버튼에 연결됩니다.");
  };

  return (
    <main className="mypage-shell" aria-label="My page">
      {/* 메인 화면과 같은 브랜드 톤을 유지하는 상단 바입니다. */}
      <header className="mypage-topbar">
        <button className="mypage-brand" type="button" onClick={() => moveTo("/main")} aria-label="메인으로 이동">
          <span className="brand-button"><Icon name="brain" /></span>
          <span>SSArain</span>
        </button>
        <nav className="mypage-nav" aria-label="마이페이지 이동">
          <button type="button" onClick={() => moveTo("/main")}>메인</button>
          <button className="is-active" type="button">마이페이지</button>
          <button type="button" onClick={logout}>로그아웃</button>
        </nav>
      </header>

      <section className="mypage-content">
        {/* 사용자 프로필 카드입니다. 사진 대신 일반 user 아이콘을 사용합니다. */}
        <article className="profile-card" aria-labelledby="profile-heading">
          <div className="profile-accent" aria-hidden="true" />
          <div className="profile-avatar" aria-hidden="true">
            <Icon name="user" className="profile-avatar-icon" />
          </div>
          <div className="profile-copy">
            <p className="profile-kicker">MY PAGE</p>
            <h1 id="profile-heading">{displayName}</h1>
            <p className="profile-email">{displayEmail}</p>
            <div className="profile-meta">
              <span>{displayRole}</span>
              <span>{isLoading ? "불러오는 중" : "프로필 정보"}</span>
            </div>
          </div>
        </article>

        <section className="mypage-grid">
          {/* WAS /user 통계로 개수를 보여주고, 상세 목록은 목록 API가 생기면 연결합니다. */}
          <section className="activity-panel" aria-labelledby="activity-heading">
            <div className="activity-panel-head">
              <div>
                <p className="panel-kicker">MY ACTIVITY</p>
                <h2 id="activity-heading">내 활동</h2>
              </div>
              <div className="activity-tabs" role="tablist" aria-label="내 활동 분류">
                {resolvedActivitySections.map((section) => (
                  <button
                    key={section.id}
                    className={section.id === activeActivity ? "is-active" : ""}
                    type="button"
                    role="tab"
                    aria-selected={section.id === activeActivity}
                    onClick={() => setActiveActivity(section.id)}
                  >
                    {section.title}
                  </button>
                ))}
              </div>
            </div>

            <div className="activity-summary-row">
              {resolvedActivitySections.map((section) => (
                <button key={section.id} className={`activity-summary-card ${section.id === activeActivity ? "is-active" : ""}`} type="button" onClick={() => setActiveActivity(section.id)}>
                  <span><Icon name={section.icon} /></span>
                  <strong>{section.count}</strong>
                  <small>{section.title}</small>
                </button>
              ))}
            </div>

            <div className="mypage-activity-list">
              {selectedActivity.items.length > 0 ? selectedActivity.items.map((item) => (
                <button key={item.id} className="mypage-activity-item" type="button" onClick={() => moveTo(item.route)}>
                  <span className="mypage-activity-icon"><Icon name={selectedActivity.icon} /></span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.meta}</small>
                  </span>
                </button>
              )) : (
                <div className="mypage-activity-empty">
                  <Icon name={selectedActivity.icon} />
                  <strong>{selectedActivity.title} {selectedActivity.count}개</strong>
                  <span>상세 목록 API가 추가되면 이 영역에 실제 목록을 연결합니다.</span>
                </div>
              )}
            </div>
          </section>

          {/* 비밀번호 변경 기능이 들어갈 위치입니다. 현재는 WAS 엔드포인트 대기 상태입니다. */}
          <form className="password-panel" onSubmit={submitPasswordChange} aria-labelledby="password-heading">
            <div>
              <p className="panel-kicker">SECURITY</p>
              <h2 id="password-heading">비밀번호 변경</h2>
            </div>
            <label>
              <span>현재 비밀번호</span>
              <input name="currentPassword" type="password" value={passwordForm.currentPassword} onChange={updatePasswordField} placeholder="현재 비밀번호" />
            </label>
            <label>
              <span>변경할 비밀번호</span>
              <input name="nextPassword" type="password" value={passwordForm.nextPassword} onChange={updatePasswordField} placeholder="새 비밀번호" />
            </label>
            <label>
              <span>변경할 비밀번호 확인</span>
              <input name="nextPasswordConfirm" type="password" value={passwordForm.nextPasswordConfirm} onChange={updatePasswordField} placeholder="새 비밀번호 확인" />
            </label>
            <button className="password-submit" type="submit">비밀번호 변경</button>
          </form>

          {/* 계정 권한만 간단히 보여주는 요약 패널입니다. */}
          <aside className="mypage-side-panel" aria-label="계정 요약">
            <p className="panel-kicker">ACCOUNT</p>
            <h2>계정 요약</h2>
            <dl>
              <div>
                <dt>권한</dt>
                <dd>{displayRole}</dd>
              </div>
            </dl>
          </aside>
        </section>

        {status && <p className="mypage-status" role="status">{status}</p>}
      </section>
    </main>
  );
}
