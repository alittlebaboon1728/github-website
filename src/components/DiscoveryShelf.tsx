import { ArrowRight } from "lucide-react";
import TrialCarousel from "./TrialCarousel";
import useTrialCatalog from "../useTrialCatalog";

export default function DiscoveryShelf() {
  const { catalog } = useTrialCatalog();
  return (
    <section className="discovery-trials" aria-label="精选与专题">
      <div className="discovery-trials-heading">
        <h2>本期试用</h2>
        <a href="#/stories">
          全部项目试用
          <ArrowRight size={15} />
        </a>
      </div>
      <TrialCarousel trials={catalog?.trials} />
    </section>
  );
}
