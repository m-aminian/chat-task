import { useEffect, useState } from "react";
import type { ImageInfo } from "../matrix/events";
import { mediaUrl } from "../matrix/media";
import { loadMedia, rememberSize, resolveMedia } from "../media/mediaCache";
import { useSetting } from "../settings/settings";
import { formatBytes } from "../utils/format";
import { useSession } from "./session-context";

const MAX_WIDTH = 360;
const MAX_HEIGHT = 320;
const FALLBACK_RATIO = { w: 4, h: 3 } as const;

interface Props {
  body: string;
  url: string;
  info: ImageInfo;
}

export function ImageBody({ body, url, info }: Props) {
  const { session } = useSession();
  const showImages = useSetting("showImages");
  const [revealed, setRevealed] = useState(false);
  const media = resolveMedia(url);
  const [src, setSrc] = useState(media.src);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (src) return;
    let active = true;
    loadMedia(session, url)
      .then((entry) => {
        if (active) setSrc(entry.src);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [session, url, src]);

  const w = info.w ?? natural?.w ?? media.width ?? FALLBACK_RATIO.w;
  const h = info.h ?? natural?.h ?? media.height ?? FALLBACK_RATIO.h;
  const width = Math.round(Math.min(MAX_WIDTH, (MAX_HEIGHT * w) / h));

  if (!showImages && !revealed) {
    return (
      <button type="button" className="image-hidden" onClick={() => setRevealed(true)}>
        Show image: {body} {info.size ? `(${formatBytes(info.size)})` : ""}
      </button>
    );
  }

  return (
    <a
      className="image"
      href={mediaUrl(session.homeserver, url)}
      target="_blank"
      rel="noreferrer"
      style={{ width, aspectRatio: `${w} / ${h}` }}
    >
      <img
        src={src}
        alt={body}
        loading="lazy"
        decoding="async"
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          if (!naturalWidth || !naturalHeight) return;
          rememberSize(url, naturalWidth, naturalHeight);
          if (info.w === undefined || info.h === undefined) setNatural({ w: naturalWidth, h: naturalHeight });
        }}
      />
    </a>
  );
}
