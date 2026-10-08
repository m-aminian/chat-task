const MXC = /^mxc:\/\/([^/]+)\/([A-Za-z0-9_-]+)$/;

export class InvalidMediaUrlError extends Error {
  constructor(url: string) {
    super(`Not a valid mxc:// URI: ${url.slice(0, 80)}`);
    this.name = "InvalidMediaUrlError";
  }
}

export interface ThumbnailSize {
  width: number;
  height: number;
}

export function mediaUrl(homeserver: string, mxc: string, thumbnail?: ThumbnailSize): string {
  const match = MXC.exec(mxc);
  if (!match) throw new InvalidMediaUrlError(mxc);
  const [, server, mediaId] = match;
  const path = `${encodeURIComponent(server!)}/${encodeURIComponent(mediaId!)}`;
  if (!thumbnail) return `${homeserver}/_matrix/media/v3/download/${path}`;
  const query = `width=${thumbnail.width}&height=${thumbnail.height}&method=scale`;
  return `${homeserver}/_matrix/media/v3/thumbnail/${path}?${query}`;
}
