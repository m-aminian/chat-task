import { userColor } from "../utils/color";
import { initials } from "../utils/text";

interface Props {
  id: string;
  name: string;
  size?: number;
}

export function Avatar({ id, name, size = 32 }: Props) {
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.4, background: userColor(id) }}
    >
      {initials(name)}
    </span>
  );
}
