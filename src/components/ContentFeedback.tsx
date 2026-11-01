import { Loader2, RefreshCw } from "lucide-react";
import type { ApiError } from "../api";
import { dateLabel } from "../observatoryApi";
export default function ContentFeedback({
  loading,
  error,
  retry,
  empty,
}: {
  loading: boolean;
  error: ApiError | null;
  retry: () => void;
  empty?: string;
}) {
  if (loading)
    return (
      <p className="content-feedback" role="status">
        <Loader2 className="spin" size={16} />
        正在读取内容…
      </p>
    );
  if (error)
    return (
      <div className="content-feedback content-failure" role="alert">
        <div>
          <p>{error.message}</p>
          {error.resetAt && (
            <small>预计 {dateLabel(error.resetAt, true)} 后可重试。</small>
          )}
        </div>
        <button className="text-action" onClick={retry}>
          <RefreshCw size={14} />
          重试
        </button>
      </div>
    );
  return empty ? <p className="content-feedback">{empty}</p> : null;
}
