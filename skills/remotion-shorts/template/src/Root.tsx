import "./index.css";
import { CalculateMetadataFunction, Composition } from "remotion";
import { Fullscreen, fullscreenSchema, FullscreenProps } from "./Fullscreen";
import {
  SplitVertical,
  splitVerticalSchema,
  SplitVerticalProps,
} from "./SplitVertical";
import { getVideoDuration, resolveSrc } from "./lib/video-metadata";

// YouTube Shorts canvas.
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

// Reliable sample clips so the templates preview out of the box.
const SAMPLE_A = "https://remotion.media/video.mp4";
const SAMPLE_B =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

// Duration follows the single video.
const calcFullscreen: CalculateMetadataFunction<FullscreenProps> = async ({
  props,
}) => {
  const seconds = await getVideoDuration(resolveSrc(props.videoSrc));
  return {
    durationInFrames: Math.ceil(seconds * FPS),
  };
};

// Duration follows the longer of the two videos.
const calcSplitVertical: CalculateMetadataFunction<
  SplitVerticalProps
> = async ({ props }) => {
  const [top, bottom] = await Promise.all([
    getVideoDuration(resolveSrc(props.topVideoSrc)),
    getVideoDuration(resolveSrc(props.bottomVideoSrc)),
  ]);
  return {
    durationInFrames: Math.ceil(Math.max(top, bottom) * FPS),
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Fullscreen"
        component={Fullscreen}
        schema={fullscreenSchema}
        durationInFrames={FPS * 10}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ videoSrc: SAMPLE_A }}
        calculateMetadata={calcFullscreen}
      />
      <Composition
        id="SplitVertical"
        component={SplitVertical}
        schema={splitVerticalSchema}
        durationInFrames={FPS * 10}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ topVideoSrc: SAMPLE_A, bottomVideoSrc: SAMPLE_B }}
        calculateMetadata={calcSplitVertical}
      />
    </>
  );
};
