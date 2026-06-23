// Brain 관리 패널입니다. Brain 정보 확인, 멤버 초대/삭제, 가입 요청 처리를 한 화면에서 다룹니다.
export default function BrainManagerPanel({
  manager,
  onClose,
  onChangeForm,
  onSaveBrain,
  onSearchAvailableUsers,
  onInviteUser,
  onRemoveMember,
  onManageJoinRequest,
  onChangeMemberRole,
  onDeleteBrain,
  canAdministerWorkspace
}) {
  const form = manager.form;
  const isProtected = form.joinPolicy === "PROTECTED";
  const roleLabels = { USER: "일반학생", MANAGER: "반장", ADMIN: "관리자" };
  const getRoleValue = (role) => String(role || "USER").toUpperCase();
  const getRoleLabel = (role) => roleLabels[getRoleValue(role)] || "일반학생";

  return (
    <div className="brain-manager-backdrop" role="presentation" onClick={onClose}>
      <section className="brain-manager-panel" role="dialog" aria-modal="true" aria-labelledby="brain-manager-title" onClick={(event) => event.stopPropagation()}>
        <header className="brain-manager-head">
          <div>
            <p className="panel-kicker">BRAIN MANAGEMENT</p>
            <h2 id="brain-manager-title">{manager.brain?.name || "Brain"} 관리</h2>
            <span>멤버, 초대, 가입 요청을 관리합니다.</span>
          </div>
          <button className="panel-close-button" type="button" onClick={onClose} aria-label="닫기">×</button>
        </header>

        {manager.message && <p className="brain-manager-message" role="status">{manager.message}</p>}

        <div className="brain-manager-scroll">
          <section className="brain-manager-section">
            <div className="brain-manager-section-head">
              <div>
                <p className="panel-kicker">BRAIN INFO</p>
                <h3>Brain 정보</h3>
              </div>
              <button className="primary-button" type="button" onClick={onSaveBrain} disabled={manager.isSaving}>
                {manager.isSaving ? "저장 중" : "정보 수정"}
              </button>
            </div>
            <div className="brain-manager-form">
              <label>
                <span>Brain 이름</span>
                <input name="name" type="text" value={form.name} onChange={onChangeForm} maxLength={50} />
              </label>
              <label>
                <span>Brain 소개 문구</span>
                <textarea name="description" value={form.description} onChange={onChangeForm} maxLength={200} rows={3} />
              </label>
              <label className="policy-toggle">
                <input name="joinPolicy" type="checkbox" checked={isProtected} onChange={onChangeForm} />
                <span>
                  <strong>가입 승인 필요</strong>
                  <small>{isProtected ? "PROTECTED · 승인 후 입장" : "PUBLIC · 누구나 입장"}</small>
                </span>
              </label>
            </div>
          </section>

          <section className="brain-manager-section">
            <div className="brain-manager-section-head">
              <div>
                <p className="panel-kicker">MEMBERS</p>
                <h3>멤버 초대 및 삭제</h3>
              </div>
              <form className="member-search-form" onSubmit={onSearchAvailableUsers}>
                <input name="searchKeyword" type="search" value={manager.searchKeyword} onChange={onChangeForm} placeholder="이름 또는 이메일 검색" />
                <button type="submit">검색</button>
              </form>
            </div>

            <div className="brain-manager-grid">
              <div className="member-column">
                <h4>현재 멤버</h4>
                <div className="member-list">
                  {manager.members.length ? manager.members.map((member) => (
                    <article className="member-item" key={member.id}>
                      <span className="member-avatar">{(member.name || "U").slice(0, 1)}</span>
                      <span><strong>{member.name}</strong><small>{member.email}</small></span>
                      <div className="member-actions">
                        <span className={`member-role-badge is-${getRoleValue(member.brainRole || member.role).toLowerCase()}`}>
                          {getRoleLabel(member.brainRole || member.role)}
                        </span>
                        {canAdministerWorkspace && (
                          <select
                            className="member-role-select"
                            value={getRoleValue(member.brainRole || member.role)}
                            onChange={(event) => onChangeMemberRole(member, event.target.value)}
                            aria-label={`${member.name} 권한 변경`}
                          >
                            <option value="USER">일반학생</option>
                            <option value="MANAGER">반장</option>
                            <option value="ADMIN">관리자</option>
                          </select>
                        )}
                        <button type="button" onClick={() => onRemoveMember(member)}>삭제</button>
                      </div>
                    </article>
                  )) : <p className="brain-manager-empty">멤버를 불러오지 못했거나 아직 없습니다.</p>}
                </div>
              </div>

              <div className="member-column">
                <h4>초대 가능 사용자</h4>
                <div className="member-list">
                  {manager.availableUsers.length ? manager.availableUsers.map((user) => (
                    <article className="member-item" key={user.id}>
                      <span className="member-avatar">{(user.name || "U").slice(0, 1)}</span>
                      <span><strong>{user.name}</strong><small>{user.email}</small></span>
                      <button type="button" onClick={() => onInviteUser(user)}>추가</button>
                    </article>
                  )) : <p className="brain-manager-empty">검색 결과가 없습니다.</p>}
                </div>
              </div>
            </div>
          </section>

          <section className="brain-manager-section">
            <div className="brain-manager-section-head">
              <div>
                <p className="panel-kicker">JOIN REQUESTS</p>
                <h3>가입 승인</h3>
              </div>
              <span className="request-count">{manager.joinRequests.length}명 대기</span>
            </div>
            <div className="request-list">
              {manager.joinRequests.length ? manager.joinRequests.map((request) => (
                <article className="request-item" key={request.id}>
                  <span className="member-avatar">{(request.name || "U").slice(0, 1)}</span>
                  <span><strong>{request.name}</strong><small>{request.email}</small></span>
                  <div className="request-actions">
                    <button type="button" onClick={() => onManageJoinRequest(request, true)}>수락</button>
                    <button type="button" className="is-danger" onClick={() => onManageJoinRequest(request, false)}>거부</button>
                  </div>
                </article>
              )) : <p className="brain-manager-empty">대기 중인 가입 요청이 없습니다.</p>}
            </div>
          </section>

          {canAdministerWorkspace && (
            <section className="brain-manager-section brain-danger-section">
              <div>
                <p className="panel-kicker">DANGER ZONE</p>
                <h3>Brain 삭제</h3>
                <span>Brain과 연결된 멤버, Topic 정보를 삭제합니다.</span>
              </div>
              <button
                className="danger-button"
                type="button"
                onClick={onDeleteBrain}
                disabled={manager.isDeleting}
              >
                {manager.isDeleting ? "삭제 중" : "Brain 삭제"}
              </button>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
