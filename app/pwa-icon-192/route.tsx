import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#0b5f41",
          color: "#ffffff",
          display: "flex",
          fontSize: 52,
          fontWeight: 800,
          height: "100%",
          justifyContent: "center",
          letterSpacing: "-0.06em",
          width: "100%",
        }}
      >
        J360
      </div>
    ),
    {
      width: 192,
      height: 192,
    },
  );
}
