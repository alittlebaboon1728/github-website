import { ArrowUpRight, Check, Info } from "lucide-react";
import { getEditorialReview } from "../editorialReviews";
import { dateLabel } from "../observatoryApi";
export default function EditorialReview({ fullName }: { fullName: string }) {
  const review = getEditorialReview(fullName);
  return (
    <section className="editorial-review" aria-label="本站编辑评价">
      <div className="review-heading">
        <h3>本站编辑评价</h3>
        <span>{review ? "依据文档整理" : "尚未评价"}</span>
      </div>
      {!review ? (
        <p className="review-unavailable">
          这个项目还没有完整的编辑评价。可先阅读作者介绍与
          README，再核对适用条件。
        </p>
      ) : (
        <>
          <p className="review-verdict">{review.verdict}</p>
          <p>
            <strong>适合谁</strong>
            {review.audience}
          </p>
          <p>
            <strong>解决的问题</strong>
            {review.problem}
          </p>
          <div className="review-columns">
            <div>
              <h4>
                <Check size={16} />
                值得用的地方
              </h4>
              <ul>
                {review.likes.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>
                <Info size={16} />
                使用前要知道
              </h4>
              <ul>
                {review.limitations.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </div>
          </div>
          <p>
            <strong>不适合</strong>
            {review.unsuitable}
          </p>
          <a
            className="text-action"
            href={review.start.url}
            target="_blank"
            rel="noreferrer"
          >
            {review.start.label}
            <ArrowUpRight size={14} />
          </a>
          <div className="review-provenance">
            <p>
              评价日期：{dateLabel(review.date)} · {review.version}
            </p>
            <p>{review.method}</p>
            <p>
              依据：
              {review.sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {source.label}
                  <ArrowUpRight size={12} />
                </a>
              ))}
            </p>
          </div>
        </>
      )}
    </section>
  );
}
