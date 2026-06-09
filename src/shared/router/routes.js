// 현재 hash route를 읽습니다. hash가 없으면 메인 화면을 기본값으로 사용합니다.
export const getCurrentRoute = () => window.location.hash.replace("#", "") || "/main";

// hash route를 변경하고, CSS/디버깅에서 쓸 수 있도록 body dataset에도 기록합니다.
export const routeTo = (path) => {
  window.location.hash = path;
  document.body.dataset.route = path;
  window.scrollTo(0, 0);
};
