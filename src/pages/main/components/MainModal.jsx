// 공통 모달입니다. copy 객체에 따라 Brain 생성, Topic 생성, My Page, Help 내용을 바꿉니다.
export default function MainModal({ copy, onClose, onConfirm }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="닫기">×</button>
        <h2 id="modal-title">{copy.title}</h2>
        <p>{copy.description}</p>
        {/* modalConfig에서 내려온 fields를 입력 필드로 렌더링합니다. */}
        <div className="modal-fields">
          {copy.fields.map((field) => <label key={field}><span>{field}</span><input type="text" defaultValue="" /></label>)}
        </div>
        {/* 취소는 닫기만 하고, 확인은 MainPage의 confirmModal 로직을 실행합니다. */}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>취소</button>
          <button type="button" className="primary-button" data-endpoint={copy.endpoint} onClick={onConfirm}>{copy.primary}</button>
        </div>
      </section>
    </div>
  );
}
