import React from "react";
import { AbsoluteFill } from "remotion";
import { Video } from "@remotion/media";
import { z } from "zod";
import { resolveSrc } from "./lib/video-metadata";

export const splitVerticalSchema = z.object({
  topVideoSrc: z.string(),
  bottomVideoSrc: z.string(),
});

export type SplitVerticalProps = z.infer<typeof splitVerticalSchema>;

// Each half is exactly 50% of the 1920px height (960px). `overflow: hidden`
// clips whatever the video crops away.
const halfStyle: React.CSSProperties = {
  height: "50%",
  width: "100%",
  overflow: "hidden",
};

const videoStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
};

export const SplitVertical: React.FC<SplitVerticalProps> = ({
  topVideoSrc,
  bottomVideoSrc,
}) => {
  // `objectFit="cover"` fills each half and crops the overflow from the center,
  // so a horizontal clip keeps its middle and loses only its left/right edges.
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <div style={halfStyle}>
        <Video src={resolveSrc(topVideoSrc)} objectFit="cover" style={videoStyle} />
      </div>
      <div style={halfStyle}>
        <Video
          src={resolveSrc(bottomVideoSrc)}
          objectFit="cover"
          style={videoStyle}
        />
      </div>
    </AbsoluteFill>
  );
};
