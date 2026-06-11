const ROUTE_CHANGE_EVENT = "ssarain-route-change";

// 브라우저 주소에서 현재 route를 읽습니다. / 경로는 메인 화면으로 취급합니다.
export const getCurrentRoute = () => {
  const path = window.location.pathname;
  return path === "/" ? "/main" : path;
};

// CSS/디버깅에서 현재 route를 확인할 수 있도록 body dataset에 기록합니다.
export const syncDocumentRoute = (path = getCurrentRoute()) => {
  document.body.dataset.route = path;
};

// history API로 주소를 변경해서 /login처럼 # 없는 route를 사용합니다.
export const routeTo = (path, options = {}) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const method = options.replace ? "replaceState" : "pushState";

  window.history[method](null, "", normalizedPath);
  syncDocumentRoute(normalizedPath);
  window.scrollTo(0, 0);
  window.dispatchEvent(new CustomEvent(ROUTE_CHANGE_EVENT, { detail: normalizedPath }));
};

export const ROUTE_EVENTS = {
  changed: ROUTE_CHANGE_EVENT
};
