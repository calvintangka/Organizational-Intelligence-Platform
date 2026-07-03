interface StepNavigationProps {
  steps: string[];
  currentStep: number;
  onStepChange: (stepIndex: number) => void;
}

export function StepNavigation({ steps, currentStep, onStepChange }: StepNavigationProps) {
  return (
    <nav aria-label="Demo steps" className="grid gap-2 md:grid-cols-5 xl:grid-cols-10">
      {steps.map((step, index) => {
        const isActive = index === currentStep;

        return (
          <button
            key={step}
            type="button"
            onClick={() => onStepChange(index)}
            className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${
              isActive
                ? "border-memory bg-blue-50 text-memory shadow-sm ring-2 ring-blue-100"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <span
              className={`mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                isActive ? "bg-memory text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              {index + 1}
            </span>
            <span className="font-semibold">{step}</span>
          </button>
        );
      })}
    </nav>
  );
}
