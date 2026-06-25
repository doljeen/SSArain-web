import { useState } from "react";
import { apiGet, apiPost } from "../../api/client.js";
import { endpoints } from "../../api/endpoints.js";
import Icon from "../../shared/icons/Icon.jsx";
import { routeTo } from "../../shared/router/routes.js";

const normalizeBrainUser = (user) => ({
  // WAS의 BrainUserInfoDto는 UUID라는 대문자 JSON 키를 내려줍니다.
  id: String(user?.UUID || user?.uuid || user?.uid || user?.id || ""),
  name: user?.name || "",
  email: user?.email || ""
});

const normalizeUserSearchPage = (page = {}, requestedPage = 0) => ({
  users: (page.users || page.content || page.data || []).map(normalizeBrainUser).filter((user) => user.id),
  currentPage: Number(requestedPage || 0),
  pageSize: Number(page.pageSize || 8),
  totalElements: Number(page.totalElements || 0),
  totalPages: Number(page.totalPages || 0),
  hasNext: Boolean(page.hasNext)
});

export default function BrainCreatePage() {
  // BrainCreateDto와 화면 전용 초대 멤버 상태입니다.
  const [form, setForm] = useState({
    name: "",
    description: "",
    joinPolicy: false,
    memberKeyword: ""
  });
  const [members, setMembers] = useState([]);
  const [memberSearch, setMemberSearch] = useState({
    users: [],
    currentPage: 0,
    pageSize: 8,
    totalElements: 0,
    totalPages: 0,
    hasNext: false,
    isLoading: false,
    message: ""
  });
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [nameCheck, setNameCheck] = useState({
    checkedName: "",
    isDuplicated: false,
    message: ""
  });

  const normalizedBrainName = form.name.trim();
  const isNameChecked = Boolean(nameCheck.checkedName && nameCheck.checkedName === normalizedBrainName);
  const canCreate = Boolean(normalizedBrainName && isNameChecked && !nameCheck.isDuplicated);

  const moveTo = (path) => {
    routeTo(path);
  };

  const updateField = (event) => {
    const { name, value, checked, type } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
    if (name === "name") {
      setNameCheck({ checkedName: "", isDuplicated: false, message: "" });
    }
  };

  const checkBrainName = async () => {
    if (!normalizedBrainName) {
      setNameCheck({ checkedName: "", isDuplicated: false, message: "Brain 이름을 먼저 입력해주세요." });
      return;
    }

    setIsCheckingName(true);
    setStatus("");

    try {
      const result = await apiGet(endpoints.brains.nameCheck(normalizedBrainName));
      const isDuplicated = Boolean(result?.isDuplicated ?? result?.duplicated);
      setNameCheck({
        checkedName: normalizedBrainName,
        isDuplicated,
        message: isDuplicated ? "이미 사용 중인 Brain 이름입니다." : "사용 가능한 Brain 이름입니다."
      });
    } catch (error) {
      setNameCheck({
        checkedName: "",
        isDuplicated: false,
        message: `Brain 이름 확인 실패 · ${error.message}`
      });
    } finally {
      setIsCheckingName(false);
    }
  };

  const searchMembers = async (page = 0) => {
    const keyword = form.memberKeyword.trim();
    if (!keyword) {
      setMemberSearch((current) => ({ ...current, users: [], message: "검색어를 입력해주세요." }));
      return;
    }

    setMemberSearch((current) => ({ ...current, isLoading: true, message: "" }));

    try {
      const result = normalizeUserSearchPage(await apiGet(endpoints.users.search(keyword, page, memberSearch.pageSize)), page);
      setMemberSearch({
        ...result,
        isLoading: false,
        message: result.users.length ? "" : "검색 결과가 없습니다."
      });
    } catch (error) {
      setMemberSearch((current) => ({
        ...current,
        users: [],
        isLoading: false,
        message: `사용자 검색 실패 · ${error.message}`
      }));
    }
  };

  const removeMember = (member) => {
    setMembers((current) => current.filter((item) => String(item.id) !== String(member.id)));
  };

  const addMember = (member) => {
    setMembers((current) => (
      current.some((item) => String(item.id) === String(member.id))
        ? current
        : [...current, member]
    ));
  };

  const inviteMembers = async (brainId) => {
    const users = [...new Set(members.map((member) => member.id).filter(Boolean))];
    if (!users.length) {
      return { addedCount: 0, failedKeywords: [] };
    }

    // B02 API는 UUID 배열을 users 키로 받습니다.
    await apiPost(endpoints.brains.addUsers(brainId), { users });
    return { addedCount: users.length, failedKeywords: [] };
  };

  const submit = async (event) => {
    event.preventDefault();

    if (!normalizedBrainName) {
      setStatus("Brain 이름을 입력해주세요.");
      return;
    }

    if (!isNameChecked) {
      setStatus("Brain 이름 중복 확인을 먼저 완료해주세요.");
      return;
    }

    if (nameCheck.isDuplicated) {
      setStatus("이미 사용 중인 Brain 이름입니다. 다른 이름을 입력해주세요.");
      return;
    }

    const payload = {
      name: normalizedBrainName,
      description: form.description.trim(),
      // 체크 ON: 가입 승인 필요(PROTECTED), 체크 OFF: 누구나 가입 가능(PUBLIC)
      joinPolicy: form.joinPolicy ? "PROTECTED" : "PUBLIC"
    };

    setIsSubmitting(true);
    setStatus("");

    try {
      await apiGet(endpoints.users.me);
      const created = await apiPost(endpoints.brains.create, payload);
      const brainId = String(created?.id ?? created?.bid ?? created?.brainId ?? "");
      let inviteResult = { addedCount: 0, failedKeywords: [] };

      try {
        inviteResult = await inviteMembers(brainId);
      } catch {
        inviteResult = { addedCount: 0, failedKeywords: members.map((member) => member.email || member.name) };
      }

      if (inviteResult.failedKeywords.length) {
        setStatus(`Brain 생성 완료 · 추가 실패: ${inviteResult.failedKeywords.join(", ")}`);
        window.setTimeout(() => moveTo(brainId ? `/brains/${brainId}` : "/main"), 900);
        return;
      }

      moveTo(brainId ? `/brains/${brainId}` : "/main");
    } catch (error) {
      const message = error.message.includes("인증") || error.message.includes("쿠키")
        ? "Brain 생성은 로그인된 실제 계정으로 가능합니다. 관리자 페이지 확인용 임시 로그인은 WAS 인증 토큰이 없습니다."
        : error.message;
      setStatus(`Brain 생성 실패 · ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="brain-create-shell" aria-label="Create brain">
      {/* 메인 화면과 같은 브랜드/이동 버튼을 가진 상단 영역입니다. */}
      <header className="brain-create-topbar">
        <button className="brain-create-brand" type="button" onClick={() => moveTo("/main")} aria-label="메인으로 이동">
          <span className="brand-button"><Icon name="brain" /></span>
          <span>SSArain</span>
        </button>
        <div className="brain-create-actions">
          <button type="button" onClick={() => moveTo("/main")}>접기</button>
          <button type="button" onClick={() => moveTo("/mypage")}>마이페이지</button>
        </div>
      </header>

      <section className="brain-create-content">
        <form className="brain-create-form" onSubmit={submit}>
          <div className="brain-create-heading">
            <p className="panel-kicker">CREATE BRAIN</p>
            <h1>Brain 생성</h1>
          </div>

          <div className="brain-name-row">
            <label>
              <span>Brain 이름</span>
              <input name="name" type="text" value={form.name} onChange={updateField} placeholder="Brain 이름" maxLength={50} required />
            </label>
            <button type="button" onClick={checkBrainName} disabled={isCheckingName || !normalizedBrainName}>
              {isCheckingName ? "확인 중" : "중복 확인"}
            </button>
          </div>
          {nameCheck.message && (
            <p className={`brain-name-helper ${isNameChecked && !nameCheck.isDuplicated ? "is-success" : "is-error"}`} role="status">
              {nameCheck.message}
            </p>
          )}

          <label>
            <span>Brain 소개 문구</span>
            <textarea name="description" value={form.description} onChange={updateField} placeholder="Brain 소개 문구" maxLength={200} />
          </label>

          <div className="member-search-row">
            <label>
              <span>초대할 멤버 검색</span>
              <input
                name="memberKeyword"
                type="search"
                value={form.memberKeyword}
                onChange={(event) => {
                  updateField(event);
                  setMemberSearch((current) => ({ ...current, message: "", users: [] }));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    searchMembers(0);
                  }
                }}
                placeholder="이름 또는 이메일"
              />
            </label>
            <button type="button" onClick={() => searchMembers(0)} disabled={memberSearch.isLoading}>
              {memberSearch.isLoading ? "검색 중" : "검색"}
            </button>
          </div>

          <div className="member-search-results" aria-live="polite">
            <div className="member-search-results-head">
              <strong>검색 결과</strong>
              {memberSearch.totalElements > 0 && <span>{memberSearch.totalElements}명</span>}
            </div>
            {memberSearch.users.length ? (
              <ul>
                {memberSearch.users.map((user) => {
                  const isSelected = members.some((member) => String(member.id) === String(user.id));
                  return (
                    <li key={user.id}>
                      <span className="member-result-avatar">{(user.name || "U").slice(0, 1)}</span>
                      <span>
                        <strong>{user.name || "이름 없음"}</strong>
                        <small>{user.email}</small>
                      </span>
                      <button type="button" onClick={() => addMember(user)} disabled={isSelected}>
                        {isSelected ? "추가됨" : "추가"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p>{memberSearch.message || "이름 또는 이메일로 사용자를 검색해주세요."}</p>
            )}
            {memberSearch.totalPages > 1 && (
              <div className="member-search-pagination">
                <button type="button" disabled={memberSearch.isLoading || memberSearch.currentPage <= 0} onClick={() => searchMembers(memberSearch.currentPage - 1)}>이전</button>
                <span>{memberSearch.currentPage + 1} / {memberSearch.totalPages}</span>
                <button type="button" disabled={memberSearch.isLoading || !memberSearch.hasNext} onClick={() => searchMembers(memberSearch.currentPage + 1)}>다음</button>
              </div>
            )}
          </div>

          <div className="selected-members">
            <strong>현재 추가된 인원</strong>
            {members.length ? (
              <ul>
                {members.map((member) => (
                  <li key={member.id}>
                    <span>{member.name || member.email}</span>
                    <button type="button" onClick={() => removeMember(member)} aria-label={`${member.name || member.email} 제거`}>×</button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>아직 추가된 인원이 없습니다.</p>
            )}
          </div>

          <label className="join-policy-toggle">
            <input name="joinPolicy" type="checkbox" checked={form.joinPolicy} onChange={updateField} />
            <span>가입 승인 필요</span>
          </label>

          <button className="brain-create-submit" type="submit" disabled={isSubmitting || !canCreate}>
            {isSubmitting ? "생성 중" : "생성"}
          </button>
        </form>

        {status && <p className="brain-create-status" role="status">{status}</p>}
      </section>
    </main>
  );
}
