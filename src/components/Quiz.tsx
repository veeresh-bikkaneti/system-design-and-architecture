import { useState } from 'react';
import { QUIZ_PASS_THRESHOLD, useProgressStore } from '../store/progress';

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface QuizProps {
  lessonSlug: string;
  questions: QuizQuestion[];
}

export function Quiz({ lessonSlug, questions }: QuizProps) {
  const recordQuizResult = useProgressStore((state) => state.recordQuizResult);
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const allAnswered = questions.every((_, i) => selected[i] !== undefined);

  const correctCount = questions.reduce(
    (count, q, i) => (selected[i] === q.correctIndex ? count + 1 : count),
    0,
  );
  const total = questions.length;
  const passed = total > 0 && correctCount / total >= QUIZ_PASS_THRESHOLD;

  function handleSelect(questionIndex: number, optionIndex: number) {
    if (submitted) return;
    setSelected((prev) => ({ ...prev, [questionIndex]: optionIndex }));
  }

  function handleSubmit() {
    setSubmitted(true);
    recordQuizResult(lessonSlug, correctCount, total);
  }

  function handleRetry() {
    setSelected({});
    setSubmitted(false);
  }

  return (
    <div className="not-prose my-8 rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/50">
      <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
        Check your understanding
      </h3>

      <div className="space-y-6">
        {questions.map((q, qIndex) => {
          const selectedOption = selected[qIndex];
          return (
            <fieldset key={qIndex}>
              <legend className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                {qIndex + 1}. {q.question}
              </legend>
              <div className="space-y-1.5" role="radiogroup">
                {q.options.map((option, oIndex) => {
                  const isSelected = selectedOption === oIndex;
                  const isCorrectOption = oIndex === q.correctIndex;

                  let optionClasses =
                    'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors';

                  if (submitted) {
                    if (isSelected && isCorrectOption) {
                      optionClasses +=
                        ' border-green-400 bg-green-50 text-green-900 dark:border-green-700 dark:bg-green-950/40 dark:text-green-200';
                    } else if (isSelected && !isCorrectOption) {
                      optionClasses +=
                        ' border-red-400 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200';
                    } else if (isCorrectOption) {
                      optionClasses +=
                        ' border-green-300 border-dashed bg-transparent text-green-700 dark:border-green-800 dark:text-green-400';
                    } else {
                      optionClasses +=
                        ' border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400';
                    }
                  } else {
                    optionClasses += isSelected
                      ? ' border-violet-400 bg-violet-50 text-violet-900 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-100'
                      : ' border-slate-200 text-slate-700 hover:border-violet-300 hover:bg-violet-50/50 dark:border-slate-800 dark:text-slate-300 dark:hover:border-violet-800 dark:hover:bg-violet-950/30';
                  }

                  return (
                    <label key={oIndex} className={optionClasses}>
                      <input
                        type="radio"
                        name={`${lessonSlug}-q${qIndex}`}
                        checked={isSelected}
                        disabled={submitted}
                        onChange={() => handleSelect(qIndex, oIndex)}
                        className="shrink-0 accent-violet-600"
                      />
                      <span>{option}</span>
                      {submitted && isSelected && isCorrectOption && (
                        <span aria-hidden="true">✓</span>
                      )}
                      {submitted && isSelected && !isCorrectOption && (
                        <span aria-hidden="true">✗</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        {!submitted ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!allAnswered}
            className="inline-flex items-center rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
          >
            Check answers
          </button>
        ) : (
          <>
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
              You scored {correctCount} / {total}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                passed
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                  : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
              }`}
            >
              {passed ? 'Passed' : 'Not yet'}
            </span>
            <button
              type="button"
              onClick={handleRetry}
              className="ml-auto inline-flex items-center rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
