import { icons } from "./icons.js";

// 문자열 SVG 아이콘을 React에서 재사용하기 위한 공통 컴포넌트입니다.
export default function Icon({ name, className = "icon" }) {
  // SVG 루트에 className을 주입해서 크기/색상을 CSS로 제어합니다.
  const markup = icons[name]?.replace("<svg", `<svg class="${className}"`);

  // 잘못된 icon name이 들어오면 화면을 깨뜨리지 않고 아무것도 렌더링하지 않습니다.
  if (!markup) return null;

  return <span className="icon-wrap" dangerouslySetInnerHTML={{ __html: markup }} />;
}
