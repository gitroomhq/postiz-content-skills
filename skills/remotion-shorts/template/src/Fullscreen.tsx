import React from "react";
import { AbsoluteFill } from "remotion";
import { Video } from "@remotion/media";
import { z } from "zod";
import { resolveSrc } from "./lib/video-metadata";

export const fullscreenSchema = z.object({
  videoSrc: z.string(),
});

export type FullscreenProps = z.infer<typeof fullscreenSchema>;

export const Fullscreen: React.FC<FullscreenProps> = ({ videoSrc }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Video
        src={resolveSrc(videoSrc)}
        // `objectFit` is a prop on @remotion/media's <Video> (not a CSS style).
        // "cover" fills the frame and crops the overflow from the center, so a
        // horizontal clip loses its left/right edges, not its middle.
        objectFit="cover"
        style={{ width: "100%", height: "100%" }}
      />
    </AbsoluteFill>
  );
};
