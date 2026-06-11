const ROUTE_CHANGE_EVENT = "ssarain-route-change";

const normalizePath = (path) => {
  if (!path || path === "/") return "/main";
  return path.startsWith("/") ? path : `/${path}`;
};

// 예전 hash 주소(/#/login, /#/topics/...)로 들어오면 새 주소(/login, /topics/...)로 정리합니다.
export const migrateHashRoute = () => {
  const legacyRoute = window.location.hash.startsWith("#/")
    ? window.location.hash.slice(1)
    : "";

  if (!legacyRoute) return null;

  const cleanRoute = normalizePath(legacyRoute);
  window.history.replaceState(null, "", cleanRoute);
  syncDocumentRoute(cleanRoute);
  return cleanRoute;
};

// 브라우저 주소에서 현재 route를 읽습니다. / 경로는 메인 화면으로 취급합니다.
export const getCurrentRoute = () => {
  if (window.location.hash.startsWith("#/")) {
    return normalizePath(window.location.hash.slice(1));
  }

  const path = window.location.pathname;
  return normalizePath(path);
};

// CSS/디버깅에서 현재 route를 확인할 수 있도록 body dataset에 기록합니다.
export const syncDocumentRoute = (path = getCurrentRoute()) => {
  document.body.dataset.route = path;
};

// history API로 주소를 변경해서 /login처럼 # 없는 route를 사용합니다.
export const routeTo = (path, options = {}) => {
  const normalizedPath = normalizePath(path);
  const method = options.replace ? "replaceState" : "pushState";

  window.history[method](null, "", normalizedPath);
  syncDocumentRoute(normalizedPath);
  window.scrollTo(0, 0);
  window.dispatchEvent(new CustomEvent(ROUTE_CHANGE_EVENT, { detail: normalizedPath }));
};

export const ROUTE_EVENTS = {
  changed: ROUTE_CHANGE_EVENT
};
