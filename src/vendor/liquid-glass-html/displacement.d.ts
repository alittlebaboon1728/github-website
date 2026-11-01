export type ViewportClamp = {
  left: number;
  top: number;
  viewportLeft: number;
  viewportTop: number;
  viewportWidth: number;
  viewportHeight: number;
};
export function buildDisplacementMap(
  width: number,
  height: number,
  radius: number,
  strength: number,
  distortion: number,
  clamp: ViewportClamp | null,
): { url: string; scale: number };
