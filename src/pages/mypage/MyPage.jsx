import { useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost, isAuthError } from "../../api/client.js";
import { endpoints } from "../../api/endpoints.js";
import { normalizeUserInfo } from "../main/config/mainUtils.js";
import Icon from "../../shared/icons/Icon.jsx";
import { routeTo } from "../../shared/router/routes.js";

const AUTH_STATE_KEY = "ssarain-authenticated";
const ACTIVITY_PAGE_SIZE = 10;

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

const initialActivityData = activitySections.reduce((acc, section) => ({
  ...acc,
  [section.id]: {
    count: 0,
    items: [],
    hasLoaded: false,
    currentPage: 0,
    totalPages: 0,
    hasNext: false
  }
}), {});

const roleLabel = (role) => ({
  ADMIN: "관리자",
  MANAGER: "반장",
  LEADER: "반장",
  USER: "일반학생"
}[role] || "일반학생");

const formatActivityDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};

const getActivityTotal = (page) => Number(page?.totalElements ?? page?.activities?.length ?? 0);
const getActivityPageMeta = (page, requestedPage = 0) => {
  const count = getActivityTotal(page);
  const pageSize = Number(page?.pageSize || ACTIVITY_PAGE_SIZE);
  return {
    count,
    currentPage: Number(page?.currentPage ?? requestedPage),
    totalPages: Number(page?.totalPages ?? (count > 0 ? Math.ceil(count / pageSize) : 0)),
    hasNext: Boolean(page?.hasNext)
  };
};

const getBrainId = (brain) => String(brain?.id ?? brain?.bid ?? brain?.brainId ?? "");

const getNeuronRoute = (activity, joinedBrainIds = new Set()) => {
  const brainId = activity?.bid == null ? "" : String(activity.bid);
  const isJoinedBrain = brainId && joinedBrainIds.has(brainId);
  const previewSegment = brainId && !isJoinedBrain ? "/preview" : "";

  if (activity?.bid && activity?.tid && activity?.nid) return `/brains/${activity.bid}${previewSegment}/topics/${activity.tid}/nodes/${activity.nid}`;
  if (activity?.bid && activity?.tid) return `/brains/${activity.bid}${previewSegment}/topics/${activity.tid}/posts`;
  if (activity?.nid) return `/nodes/${activity.nid}`;
  if (activity?.tid) return `/topics/${activity.tid}/posts`;
  return "/main";
};

const normalizeNeuronActivities = (page, emptyLabel, metaPrefix = "작성일", joinedBrainIds = new Set(), requestedPage = 0) => ({
  ...getActivityPageMeta(page, requestedPage),
  hasLoaded: true,
  items: (page?.activities || []).map((activity, index) => {
    const dateText = formatActivityDate(activity.createdAt);
    return {
      id: `neuron-${activity.nid ?? index}`,
      title: activity.title || emptyLabel,
      meta: dateText ? `${metaPrefix} ${dateText}` : `${metaPrefix} 정보 없음`,
      route: getNeuronRoute(activity, joinedBrainIds)
    };
  })
});

const normalizeCommentActivities = (page, joinedBrainIds = new Set(), requestedPage = 0) => ({
  ...getActivityPageMeta(page, requestedPage),
  hasLoaded: true,
  items: (page?.activities || []).map((activity, index) => {
    const dateText = formatActivityDate(activity.createdAt);
    return {
      id: `comment-${activity.cid ?? index}`,
      title: activity.content || "내용 없는 댓글",
      meta: dateText ? `댓글 작성일 ${dateText}` : "작성일 정보 없음",
      route: getNeuronRoute(activity, joinedBrainIds)
    };
  })
});

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
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);
  const [activeActivity, setActiveActivity] = useState("nodes");
  const [activityData, setActivityData] = useState(initialActivityData);
  const [activityStatus, setActivityStatus] = useState("");
  const [isActivityLoading, setIsActivityLoading] = useState(false);
  const [joinedBrainIds, setJoinedBrainIds] = useState(() => new Set());

  const moveTo = (path) => {
    routeTo(path);
  };

  const userSummary = user?.summary || {};
  const resolvedActivitySections = activitySections.map((section) => ({
    ...section,
    count: activityData[section.id]?.hasLoaded ? activityData[section.id].count : ({
      nodes: userSummary.nodeCount,
      comments: userSummary.commentCount,
      thumbs: userSummary.likeCount
    }[section.id] ?? section.count),
    items: activityData[section.id]?.items || []
  }));
  const selectedActivity = resolvedActivitySections.find((section) => section.id === activeActivity) || resolvedActivitySections[0];
  const displayName = user?.name || "프로필 불러오는 중";
  const displayEmail = user?.email || "계정 정보를 확인하고 있습니다.";
  const displayRole = user ? roleLabel(user.role) : "확인 중";

  const fetchActivitySection = async (sectionId, page = 0, brainIds = joinedBrainIds) => {
    if (!sectionId) return null;

    const endpointBySection = {
      nodes: endpoints.users.activities.neurons,
      comments: endpoints.users.activities.comments,
      thumbs: endpoints.users.activities.likedNeurons
    };
    const endpoint = endpointBySection[sectionId];
    if (!endpoint) return null;

    const result = await apiGet(endpoint(page, ACTIVITY_PAGE_SIZE));
    if (sectionId === "comments") return normalizeCommentActivities(result, brainIds, page);
    if (sectionId === "thumbs") return normalizeNeuronActivities(result, "제목 없는 Neuron", "추천한 Neuron", brainIds, page);
    return normalizeNeuronActivities(result, "제목 없는 Neuron", "작성일", brainIds, page);
  };

  const loadActivityPage = async (sectionId, page = 0) => {
    setIsActivityLoading(true);
    setActivityStatus("");

    try {
      const nextSection = await fetchActivitySection(sectionId, page);
      if (!nextSection) return;
      setActivityData((current) => ({
        ...current,
        [sectionId]: nextSection
      }));
    } catch (error) {
      setActivityStatus(`활동 목록을 불러오지 못했습니다 · ${error.message}`);
    } finally {
      setIsActivityLoading(false);
    }
  };

  const selectActivityTab = (sectionId) => {
    setActiveActivity(sectionId);
    if (!activityData[sectionId]?.hasLoaded) {
      loadActivityPage(sectionId, 0);
    }
  };

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
    const loadActivities = async (brainIds = new Set()) => {
      setIsActivityLoading(true);
      setActivityStatus("");

      const [neuronsResult, commentsResult, likedResult] = await Promise.allSettled([
        fetchActivitySection("nodes", 0, brainIds),
        fetchActivitySection("comments", 0, brainIds),
        fetchActivitySection("thumbs", 0, brainIds)
      ]);

      setActivityData({
        nodes: neuronsResult.status === "fulfilled"
          ? neuronsResult.value
          : { ...initialActivityData.nodes, hasLoaded: true },
        comments: commentsResult.status === "fulfilled"
          ? commentsResult.value
          : { ...initialActivityData.comments, hasLoaded: true },
        thumbs: likedResult.status === "fulfilled"
          ? likedResult.value
          : { ...initialActivityData.thumbs, hasLoaded: true }
      });

      const failed = [neuronsResult, commentsResult, likedResult].filter((result) => result.status === "rejected");
      if (failed.length > 0) {
        setActivityStatus("일부 활동 목록을 불러오지 못했습니다.");
      }
      setIsActivityLoading(false);
    };

    const loadUser = async () => {
      setIsLoading(true);
      setStatus("");

      try {
        const [userInfo, myBrains] = await Promise.all([
          apiGet(endpoints.users.me),
          apiGet(endpoints.brains.mine).catch(() => ({ brains: [] }))
        ]);
        if (userInfo) {
          sessionStorage.setItem(AUTH_STATE_KEY, "true");
          setUser(normalizeUserInfo(userInfo));
        }
        const nextJoinedBrainIds = new Set((myBrains?.brains || []).map(getBrainId).filter(Boolean));
        setJoinedBrainIds(nextJoinedBrainIds);
        loadActivities(nextJoinedBrainIds);
      } catch (error) {
        if (isAuthError(error)) {
          sessionStorage.removeItem(AUTH_STATE_KEY);
          routeTo("/login");
          return;
        }
        setStatus(`사용자 정보를 불러오지 못했습니다 · ${error.message}`);
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

  // WAS U02 비밀번호 변경 API에 현재 비밀번호와 새 비밀번호를 전달합니다.
  const submitPasswordChange = async (event) => {
    event.preventDefault();
    if (isPasswordSubmitting) return;

    if (!passwordForm.currentPassword || !passwordForm.nextPassword || !passwordForm.nextPasswordConfirm) {
      setStatus("비밀번호 변경 항목을 모두 입력해주세요.");
      return;
    }

    if (passwordForm.nextPassword !== passwordForm.nextPasswordConfirm) {
      setStatus("변경할 비밀번호가 서로 일치하지 않습니다.");
      return;
    }

    setIsPasswordSubmitting(true);
    setStatus("");

    try {
      await apiPatch(endpoints.users.password, {
        oldPassword: passwordForm.currentPassword,
        newPassword: passwordForm.nextPassword
      });
      setPasswordForm({ currentPassword: "", nextPassword: "", nextPasswordConfirm: "" });
      setStatus("비밀번호가 변경되었습니다.");
    } catch (error) {
      setStatus(`비밀번호 변경 실패 · ${error.message}`);
    } finally {
      setIsPasswordSubmitting(false);
    }
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
          {/* WAS 활동 API로 작성/댓글/추천 목록을 보여주는 영역입니다. */}
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
                    onClick={() => selectActivityTab(section.id)}
                  >
                    {section.title}
                  </button>
                ))}
              </div>
            </div>

            <div className="activity-summary-row">
              {resolvedActivitySections.map((section) => (
                <button key={section.id} className={`activity-summary-card ${section.id === activeActivity ? "is-active" : ""}`} type="button" onClick={() => selectActivityTab(section.id)}>
                  <span><Icon name={section.icon} /></span>
                  <strong>{section.count}</strong>
                  <small>{section.title}</small>
                </button>
              ))}
            </div>

            <div className="mypage-activity-list">
              {isActivityLoading ? (
                <div className="mypage-activity-empty">
                  <Icon name={selectedActivity.icon} />
                  <strong>활동을 불러오는 중입니다.</strong>
                  <span>잠시만 기다려주세요.</span>
                </div>
              ) : selectedActivity.items.length > 0 ? selectedActivity.items.map((item) => (
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
                  <span>{activityStatus || "아직 표시할 활동이 없습니다."}</span>
                </div>
              )}
            </div>
            {selectedActivity.count > ACTIVITY_PAGE_SIZE && (
              <div className="mypage-pagination" aria-label={`${selectedActivity.title} 페이지 이동`}>
                <button
                  type="button"
                  disabled={isActivityLoading || (activityData[activeActivity]?.currentPage || 0) <= 0}
                  onClick={() => loadActivityPage(activeActivity, Math.max(0, (activityData[activeActivity]?.currentPage || 0) - 1))}
                >
                  이전
                </button>
                <span>
                  {(activityData[activeActivity]?.currentPage || 0) + 1}
                  {" / "}
                  {Math.max(1, activityData[activeActivity]?.totalPages || 1)}
                </span>
                <button
                  type="button"
                  disabled={isActivityLoading || !activityData[activeActivity]?.hasNext}
                  onClick={() => loadActivityPage(activeActivity, (activityData[activeActivity]?.currentPage || 0) + 1)}
                >
                  다음
                </button>
              </div>
            )}
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
            <button className="password-submit" type="submit" disabled={isPasswordSubmitting}>
              {isPasswordSubmitting ? "변경 중" : "비밀번호 변경"}
            </button>
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
