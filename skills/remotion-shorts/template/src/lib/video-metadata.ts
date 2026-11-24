import { ALL_FORMATS, Input, UrlSource } from "mediabunny";
import { staticFile } from "remotion";

/**
 * Resolve a video source so callers can pass either a remote URL or just the
 * name of a file dropped into `public/`. Anything that already looks like a URL
 * is returned untouched; everything else is treated as a public/ asset.
 */
export const resolveSrc = (src: string): string => {
  if (/^(https?:|data:|blob:)/.test(src)) {
    return src;
  }
  return staticFile(src);
};

const makeInput = (src: string) =>
  new Input({
    formats: ALL_FORMATS,
    source: new UrlSource(src, {
      getRetryDelay: () => null,
    }),
  });

/** Duration of a video in seconds. Works with remote URLs and staticFile() paths. */
export const getVideoDuration = async (src: string): Promise<number> => {
  return makeInput(src).computeDuration();
};
