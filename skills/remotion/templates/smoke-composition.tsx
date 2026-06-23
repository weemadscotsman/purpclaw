// Remotion smoke composition — known-good starter.
// Use this to replace the blank `return null;` that `create-video --blank` scaffolds.
// Renders a 2-second 1280x720 gradient + fade-in title + slide-up subtitle.
// Verifiable: alpha=255 at frame 30+, ffprobe shows h264 1280x720 30fps ~2.05s.

import { useCurrentFrame, useVideoConfig, interpolate, Easing, AbsoluteFill } from "remotion";

export const MyComposition = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Title fades in across first 2 seconds
  const titleOpacity = interpolate(frame, [0, 2 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  // Subtitle slides up + fades in starting at 1s
  const subtitleY = interpolate(frame, [1 * fps, 3 * fps], [40, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.out(Easing.exp),
  });
  const subtitleOpacity = interpolate(frame, [1 * fps, 3 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Background hue rotates through the full duration
  const hue = interpolate(frame, [0, durationInFrames], [220, 320], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, hsl(${hue}, 70%, 18%) 0%, hsl(${(hue + 40) % 360}, 80%, 8%) 100%)`,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          padding: 60,
        }}
      >
        <div
          style={{
            opacity: titleOpacity,
            color: "white",
            fontSize: 96,
            fontWeight: 800,
            letterSpacing: -2,
            textAlign: "center",
            lineHeight: 1.1,
            textShadow: "0 4px 24px rgba(0,0,0,0.4)",
          }}
        >
          Your title here
        </div>
        <div
          style={{
            opacity: subtitleOpacity,
            transform: `translateY(${subtitleY}px)`,
            color: "rgba(255,255,255,0.85)",
            fontSize: 32,
            marginTop: 24,
            textAlign: "center",
            fontWeight: 500,
          }}
        >
          Your subtitle here
        </div>
        <div
          style={{
            opacity: subtitleOpacity * 0.7,
            color: "rgba(255,255,255,0.6)",
            fontSize: 18,
            marginTop: 48,
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            letterSpacing: 2,
          }}
        >
          FRAME {String(frame).padStart(3, "0")} / {durationInFrames}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
