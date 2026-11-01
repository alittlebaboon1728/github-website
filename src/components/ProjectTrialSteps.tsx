export default function ProjectTrialSteps({
  steps,
}: {
  steps: { title: string; action: string; result?: string }[];
}) {
  return (
    <ol
      className={`reader-steps${steps.length > 3 ? " reader-steps--many" : ""}`}
    >
      {steps.map(({ title, action, result }, index) => (
        <li key={index}>
          <span>{index + 1}</span>
          <div>
            <h3>{title}</h3>
            <p>{action}</p>
            {result && <p className="reader-step-result">结果：{result}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
