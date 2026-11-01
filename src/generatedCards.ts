export type GeneratedCard = {
  fullName: string;
  title: string;
  category: string;
  summary: string;
  audience: string;
  evidence: string;
  features: { title: string; text: string; quote: string }[];
  start: string;
  limitation: string;
  visual: {
    layout: "flow" | "hub" | "layers";
    palette: "forest" | "clay" | "violet" | "blue";
    caption: string;
    nodes: { label: string; detail: string; icon: string }[];
  };
  model: string;
  generatedAt: string;
  sourceUrl: string;
  sourceKind: "readme" | "description";
  sourceWarning: string | null;
};
